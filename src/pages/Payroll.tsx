import { useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Card, Icon, Input, PageLoader, ErrorState } from "@/components/ui";
import { CountUp, InkStage, RollingNumber } from "@/components/bits";
import { useSalaryIssueBadgeCount } from "@/hooks/useSalaryIssueBadgeCount";
import { useAuth } from "@/lib/auth";
import { canAccessPayroll, WAGE_TYPE_LABELS } from "@/lib/constants";
import { useBusinessId, formatCurrency, initialsOf, colorFor } from "@/lib/db";
import { useProfiles } from "@/api/users";
import { useDepartments } from "@/api/departments";
import { useEmployeePositions } from "@/api/employeePositions";
import { useAttendanceMonth } from "@/api/attendance";
import { useTips, useShiftBonuses, useApprovedFaultPays, usePayrollMonthAdjustments, payrollAdjustmentForEmployee } from "@/api/payroll";
import { positionsForEmployee } from "@/lib/employeePositions";
import { buildPayrollPositionRows, type PayrollPositionRow } from "@/lib/payrollPositions";
import { sumFaultPayAmount } from "@/lib/faultPayrollRows";
import { exportPayrollExcel, type PayrollExportRow } from "@/lib/payrollExport";
import {
  PayrollAdjustmentsDialog,
  formatAdjustment,
  type PayrollAdjustmentValues,
} from "@/components/payroll/PayrollAdjustments";

function monthNow() {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}

function toExportRows(rows: PayrollPositionRow[]): PayrollExportRow[] {
  return rows.map((r) => ({
    name: r.name,
    positionLabel: r.positionLabel,
    wageType: r.wageType,
    wageTypeLabel: WAGE_TYPE_LABELS[r.wageType],
    hours: r.hours,
    shifts: r.shifts,
    rate: r.rate,
    baseOrTips: r.wageType === "tips" ? r.tips : r.base,
    topup: r.topup,
    bonus: r.bonus,
    monthlyBonus: r.monthlyBonus,
    advance: r.advance,
    differences: r.differences,
    grossPay: r.grossPay,
    total: r.total,
    pensionActive: r.pensionActive,
  }));
}

export function Payroll() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [month, setMonth] = useState(searchParams.get("month") ?? monthNow());
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data: users, isLoading, isError, refetch } = useProfiles(businessId);
  const { data: allPositions } = useEmployeePositions(businessId);
  const { data: departments } = useDepartments(businessId);
  const { data: attendance } = useAttendanceMonth(businessId, month);
  const { data: tips } = useTips(businessId, month);
  const { data: bonuses } = useShiftBonuses(businessId, month);
  const { data: faultPays } = useApprovedFaultPays(businessId, month);
  const { data: monthAdjustments } = usePayrollMonthAdjustments(businessId, month);

  const isPayrollManager = canAccessPayroll(profile?.role);
  const { count: salaryIssueCount } = useSalaryIssueBadgeCount();

  const deptName = useMemo(
    () => (id: string) => (departments ?? []).find((d) => d.id === id)?.name ?? null,
    [departments],
  );

  // שורה לכל (עובד, תפקיד): עובד שהוא גם אחראי משמרת (שעתי) וגם מלצר (טיפים)
  // מקבל שתי שורות — כל אחת מחושבת לפי מודל השכר של התפקיד שבו נכנס למשמרת.
  // התאמות חודשיות ותשלומי תקלות נצמדים לשורה הראשית בלבד.
  const rows = useMemo(() => {
    const employees = (users ?? []).filter((u) => isPayrollManager || u.id === profile?.id);
    return employees.flatMap((u) => {
      const adj = payrollAdjustmentForEmployee(monthAdjustments, u.id);
      return buildPayrollPositionRows({
        employee: u,
        positions: positionsForEmployee(u, allPositions),
        attendance: attendance ?? [],
        tips: tips ?? [],
        bonuses: bonuses ?? [],
        faultPaySum: sumFaultPayAmount(faultPays ?? [], u.id),
        adjustments: {
          monthlyBonus: Number(adj?.monthly_bonus ?? 0),
          advance: Number(adj?.advance ?? 0),
          differences: Number(adj?.differences ?? 0),
        },
        deptName,
      });
    });
  }, [users, allPositions, attendance, tips, bonuses, faultPays, monthAdjustments, isPayrollManager, profile?.id, deptName]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => (r.name ?? "").toLowerCase().includes(q) || r.positionLabel.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const employeeCount = useMemo(() => new Set(filteredRows.map((r) => r.employeeId)).size, [filteredRows]);

  if (profile?.role === "department_manager") return <Navigate to="/dashboard" replace />;
  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const totals = filteredRows.reduce(
    (acc, r) => ({
      hours: acc.hours + r.hours,
      base: acc.base + (r.wageType === "hourly" ? r.base : 0),
      tips: acc.tips + r.tips,
      topup: acc.topup + r.topup,
      bonus: acc.bonus + r.bonus,
      faultPay: acc.faultPay + r.faultPay,
      monthlyBonus: acc.monthlyBonus + r.monthlyBonus,
      advance: acc.advance + r.advance,
      differences: acc.differences + r.differences,
      total: acc.total + r.total,
    }),
    { hours: 0, base: 0, tips: 0, topup: 0, bonus: 0, faultPay: 0, monthlyBonus: 0, advance: 0, differences: 0, total: 0 },
  );

  // Two full literals, not an interpolated one — Tailwind only picks up
  // arbitrary values it can find verbatim in the source.
  const PAYROLL_GRID = isPayrollManager
    ? "grid grid-cols-[1.45fr_0.9fr_0.62fr_0.52fr_0.62fr_0.78fr_0.58fr_0.68fr_0.72fr_0.62fr_0.62fr_0.82fr_44px] gap-1.5"
    : "grid grid-cols-[1.45fr_0.9fr_0.62fr_0.52fr_0.62fr_0.78fr_0.58fr_0.68fr_0.72fr_0.62fr_0.62fr_0.82fr] gap-1.5";

  const editingRow = filteredRows.find((r) => r.id === editingId) ?? null;

  const adjustmentsFor = (id: string): PayrollAdjustmentValues => {
    const adj = payrollAdjustmentForEmployee(monthAdjustments, id);
    return {
      monthlyBonus: Number(adj?.monthly_bonus ?? 0),
      advance: Number(adj?.advance ?? 0),
      differences: Number(adj?.differences ?? 0),
    };
  };

  /* Where the month's money goes — positive parts only; shares of their sum. */
  const parts = [
    { key: "base", label: "שכר שעתי", value: totals.base },
    { key: "tips", label: "טיפים", value: totals.tips },
    { key: "topup", label: "השלמות", value: totals.topup },
    { key: "bonus", label: "אחוז קופה", value: totals.bonus },
    {
      key: "extra",
      label: "תוספות",
      value: totals.faultPay + totals.monthlyBonus + Math.max(0, totals.differences),
    },
  ].filter((p) => p.value > 0);
  const partsSum = parts.reduce((s, p) => s + p.value, 0);

  return (
    <div className="pyx-page">
      <InkStage className="pyx-hero">
        <div className="srx-bar">
          <h1 className="srx-page-title">שכר</h1>
          {isPayrollManager && (
            <div className="pyx-actions">
              <button type="button" className="pyx-glass-btn" onClick={() => navigate("/salary-issues")}>
                <Icon name="report_problem" size={18} />
                <span className="pyx-glass-label">בעיות שכר</span>
                {salaryIssueCount > 0 && (
                  <span className="pyx-glass-count" aria-label={`${salaryIssueCount} בעיות שכר חדשות`}>
                    {salaryIssueCount > 99 ? "99+" : salaryIssueCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="pyx-glass-btn"
                onClick={() => exportPayrollExcel(toExportRows(filteredRows), month)}
                aria-label="ייצוא אקסל"
                title="ייצוא אקסל"
              >
                <Icon name="download" size={18} />
                <span className="pyx-glass-label">אקסל</span>
              </button>
            </div>
          )}
        </div>

        <div className="srx-head">
          <div className="srx-head-copy">
            <div className="srx-month">
              <button
                type="button"
                className="srx-month-btn"
                onClick={() => setMonth(shiftMonth(month, -1))}
                aria-label="חודש קודם"
              >
                <Icon name="chevron_right" size={20} />
              </button>
              <span className="srx-month-label">
                <Icon name="calendar_month" size={16} />
                <span>{monthLabel(month)}</span>
              </span>
              <button
                type="button"
                className="srx-month-btn"
                onClick={() => setMonth(shiftMonth(month, 1))}
                aria-label="חודש הבא"
              >
                <Icon name="chevron_left" size={20} />
              </button>
            </div>
            <div className="srx-total-label">סה״כ לתשלום</div>
            <div className="srx-total">
              <RollingNumber value={totals.total} format={formatCurrency} />
            </div>
          </div>

          <div className="srx-stats">
            <div className="srx-stat" style={{ "--i": 0 } as React.CSSProperties}>
              <span className="srx-stat-icon"><Icon name="group" size={18} /></span>
              <span className="srx-stat-val">
                <CountUp key={month} to={employeeCount} />
              </span>
              <span className="srx-stat-lbl">עובדים</span>
            </div>
            <div className="srx-stat" style={{ "--i": 1 } as React.CSSProperties}>
              <span className="srx-stat-icon"><Icon name="schedule" size={18} /></span>
              <span className="srx-stat-val">
                <CountUp key={month} to={Math.round(totals.hours)} />
              </span>
              <span className="srx-stat-lbl">שעות</span>
            </div>
            <div className="srx-stat" style={{ "--i": 2 } as React.CSSProperties}>
              <span className="srx-stat-icon"><Icon name="savings" size={18} /></span>
              <span className="srx-stat-val">
                <CountUp key={month} to={totals.tips} format={formatCurrency} />
              </span>
              <span className="srx-stat-lbl">טיפים</span>
            </div>
          </div>
        </div>

        {partsSum > 0 && (
          <div className="pyx-mix">
            <div className="pyx-track" role="img" aria-label="הרכב השכר החודשי">
              {parts.map((p, i) => (
                <i
                  key={p.key}
                  data-part={i}
                  style={{ "--w": `${(p.value / partsSum) * 100}%`, "--i": i } as React.CSSProperties}
                />
              ))}
            </div>
            <div className="pyx-legend">
              {parts.map((p, i) => (
                <span key={p.key} className="pyx-legend-item" data-part={i}>
                  <b />
                  {p.label}
                  <strong>{formatCurrency(p.value)}</strong>
                </span>
              ))}
            </div>
          </div>
        )}
      </InkStage>

      <div className="srx-body">
        <div className="srx-toolbar">
          <div className="srx-toolbar-title">
            {employeeCount} עובדים
          </div>
          <div className="pyx-search">
            <Icon name="search" size={19} className="pyx-search-icon" />
            <Input
              className="pr-10"
              placeholder="חיפוש עובד..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="חיפוש עובד"
            />
          </div>
        </div>

      {/* ── Mobile — roster ── */}
      <div className="payroll-mobile md:hidden">

        {filteredRows.length === 0 ? (
          <div className="users-roster-empty">
            <Icon name="account_balance_wallet" size={30} />
            <span>{search.trim() ? "לא נמצאו עובדים" : "אין נתונים לחודש זה"}</span>
          </div>
        ) : (
          <div className="users-roster">
            {filteredRows.map((r, i) => (
              <button
                key={r.id}
                type="button"
                className="pay-cell"
                style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                onClick={() => navigate(`/payroll/${r.employeeId}?month=${month}&position=${r.positionId}`)}
              >
                <span className="user-cell-avatar person-chip" style={{ background: colorFor(r.employeeId) }}>
                  {initialsOf(r.name)}
                </span>
                <span className="user-cell-info">
                  <span className="user-cell-name">{r.name}</span>
                  <span className="user-cell-sub">
                    <span className="user-cell-role">
                      {r.positionCount > 1 ? `${r.positionLabel} · ${WAGE_TYPE_LABELS[r.wageType]}` : WAGE_TYPE_LABELS[r.wageType]}
                    </span>
                    <span className="user-cell-dept"> · {r.hours.toFixed(1)} שע׳</span>
                    {r.bonus > 0 && <span className="pay-cell-flag">% קופה</span>}
                    {(r.monthlyBonus > 0 || r.advance > 0 || r.differences !== 0) && (
                      <span className="pay-cell-flag">התאמות</span>
                    )}
                  </span>
                </span>
                <span className="pay-cell-total">
                  <span className="pay-cell-sum">{formatCurrency(r.total)}</span>
                  <span className="pay-cell-hint">לתשלום</span>
                </span>
                <Icon name="chevron_left" size={18} className="pay-cell-chevron" />
              </button>
            ))}
          </div>
        )}
      </div>

      <Card className="pyx-table hidden overflow-hidden !p-0 shadow-card md:block">
        <div className="overflow-auto">
          {/* Tightest width the 13 columns still read at — keeps the table
              inside the card on a 1366px laptop instead of scrolling. */}
          <div className="min-w-[1120px]">
            <div className={`${PAYROLL_GRID} border-b border-border bg-surface-2 px-5 py-3 text-[12px] font-bold uppercase tracking-wide text-text-3`}>
              <span>עובד</span>
              <span>תפקיד</span>
              <span>סוג</span>
              <span>שעות</span>
              <span>תעריף</span>
              <span>בסיס / טיפים</span>
              <span>השלמה</span>
              <span>תוספת קופה</span>
              <span>בונוס חודשי</span>
              <span>מפרעה</span>
              <span>הפרשים</span>
              <span>סה״כ</span>
              {isPayrollManager && <span className="sr-only">עריכה</span>}
            </div>
            {filteredRows.map((r) => {
              const adjValues = r.isPrimaryRow ? adjustmentsFor(r.employeeId) : null;
              const open = () => navigate(`/payroll/${r.employeeId}?month=${month}&position=${r.positionId}`);
              return (
              // Not a <button>: managers get an edit button inside the row, and
              // a nested <button> is invalid (and unclickable) inside one.
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={open}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open();
                  }
                }}
                className={`data-row data-row--clickable ${PAYROLL_GRID} w-full items-center border-b border-border-2 px-5 py-2.5 text-[13px] text-right`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="person-chip h-8 w-8 rounded-[9px] text-[12px]" style={{ background: colorFor(r.employeeId) }}>{initialsOf(r.name)}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{r.name}</span>
                    {r.positionCount > 1 && (
                      <span className="block text-[12px] text-text-3">{r.positionCount} תפקידים</span>
                    )}
                  </span>
                </span>
                <span className="truncate text-text-2" title={r.positionLabel}>{r.positionLabel}</span>
                <span><Badge tone="neutral">{WAGE_TYPE_LABELS[r.wageType]}</Badge></span>
                <span className="tabular-nums">{r.hours.toFixed(1)}</span>
                <span className="tabular-nums">{r.rate ? formatCurrency(r.rate) : "—"}</span>
                <span className={`tabular-nums ${r.wageType === "tips" ? "font-bold text-accent-2" : ""}`}>{formatCurrency(r.wageType === "tips" ? r.tips : r.base)}</span>
                <span className="tabular-nums text-text-2">{r.topup > 0 ? formatCurrency(r.topup) : "—"}</span>
                <span className={`tabular-nums ${r.bonus > 0 ? "font-bold text-accent" : "text-text-2"}`}>{r.bonus > 0 ? formatCurrency(r.bonus) : "—"}</span>
                {adjValues ? (
                  <>
                    <span className={`tabular-nums ${adjValues.monthlyBonus ? "font-bold" : "text-text-2"}`}>
                      {formatAdjustment("monthlyBonus", adjValues.monthlyBonus)}
                    </span>
                    <span className={`tabular-nums ${adjValues.advance ? "font-bold" : "text-text-2"}`}>
                      {formatAdjustment("advance", adjValues.advance)}
                    </span>
                    <span className={`tabular-nums ${adjValues.differences ? "font-bold" : "text-text-2"}`}>
                      {formatAdjustment("differences", adjValues.differences)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-text-3">—</span>
                    <span className="text-text-3">—</span>
                    <span className="text-text-3">—</span>
                  </>
                )}
                <span className="font-extrabold tabular-nums">{formatCurrency(r.total)}</span>
                {isPayrollManager && (
                  r.isPrimaryRow ? (
                    <button
                      type="button"
                      className="data-row-action pay-adj-edit"
                      aria-label={`עריכת התאמות שכר — ${r.name ?? ""}`}
                      title="עריכת התאמות שכר"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(r.id);
                      }}
                    >
                      <Icon name="edit" size={18} />
                    </button>
                  ) : (
                    <span aria-hidden="true" />
                  )
                )}
              </div>
            );
            })}
            {filteredRows.length === 0 && (
              <div className="px-5 py-10 text-center text-text-2">
                {search.trim() ? "לא נמצאו עובדים." : "אין נתונים לחודש זה."}
              </div>
            )}
          </div>
        </div>
      </Card>
      </div>

      {editingRow && (
        <PayrollAdjustmentsDialog
          open
          onClose={() => setEditingId(null)}
          businessId={businessId}
          employeeId={editingRow.employeeId}
          employeeName={editingRow.name}
          month={month}
          grossPay={filteredRows
            .filter((r) => r.employeeId === editingRow.employeeId)
            .reduce((s, r) => s + r.grossPay, 0)}
          values={adjustmentsFor(editingRow.employeeId)}
        />
      )}
    </div>
  );
}
