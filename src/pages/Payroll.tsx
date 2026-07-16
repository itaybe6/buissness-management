import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, Icon, Input, PageHeader, PageLoader, ErrorState } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { WAGE_TYPE_LABELS } from "@/lib/constants";
import { useBusinessId, formatCurrency, initialsOf, colorFor } from "@/lib/db";
import { useProfiles } from "@/api/users";
import { useAttendanceMonth } from "@/api/attendance";
import { useTips, useShiftBonuses } from "@/api/payroll";
import { computeEmployeePayroll, sumAttendanceHours } from "@/lib/payrollCompute";
import { countEmployeeShifts, exportPayrollExcel, type PayrollExportRow } from "@/lib/payrollExport";
import type { WageType } from "@/types/database";

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

function toExportRows(
  rows: {
    name: string | null;
    wageType: WageType;
    hours: number;
    shifts: number;
    rate: number;
    base: number;
    tips: number;
    topup: number;
    bonus: number;
    total: number;
    pensionActive: boolean;
  }[],
): PayrollExportRow[] {
  return rows.map((r) => ({
    name: r.name,
    wageType: r.wageType,
    wageTypeLabel: WAGE_TYPE_LABELS[r.wageType],
    hours: r.hours,
    shifts: r.shifts,
    rate: r.rate,
    baseOrTips: r.wageType === "tips" ? r.tips : r.base,
    topup: r.topup,
    bonus: r.bonus,
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
  const { data: users, isLoading, isError, refetch } = useProfiles(businessId);
  const { data: attendance } = useAttendanceMonth(businessId, month);
  const { data: tips } = useTips(businessId, month);
  const { data: bonuses } = useShiftBonuses(businessId, month);

  const isPayrollManager = profile && ["manager", "office_manager"].includes(profile.role);

  const rows = useMemo(() => {
    const employees = (users ?? []).filter((u) => isPayrollManager || u.id === profile?.id);
    return employees.map((u) => {
      const rate = Number(u.hourly_rate ?? 0);
      const wageType = u.wage_type ?? "hourly";
      const myTips = (tips ?? []).filter((t) => t.employee_id === u.id);
      const myBonuses = (bonuses ?? []).filter((b) => b.employee_id === u.id);
      const bonusSum = myBonuses.reduce((s, b) => s + Number(b.amount), 0);

      // עובד טיפים: השכר מקופת הטיפים עם רצפת מינימום לכל משמרת בנפרד.
      // עובד שעתי: שעות נוכחות × תעריף, ללא טיפים.
      const pay = computeEmployeePayroll({
        wageType,
        rate,
        tips: myTips,
        bonusSum,
        attendanceHours: sumAttendanceHours(attendance ?? [], u.id),
      });
      const shifts = countEmployeeShifts(wageType, u.id, attendance ?? [], myTips);
      return {
        id: u.id,
        name: u.full_name,
        pensionActive: u.pension_active ?? false,
        shifts,
        ...pay,
      };
    });
  }, [users, attendance, tips, bonuses, isPayrollManager, profile?.id]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.name ?? "").toLowerCase().includes(q));
  }, [rows, search]);

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const totals = filteredRows.reduce(
    (acc, r) => ({
      hours: acc.hours + r.hours,
      base: acc.base + (r.wageType === "hourly" ? r.base : 0),
      tips: acc.tips + r.tips,
      topup: acc.topup + r.topup,
      bonus: acc.bonus + r.bonus,
      total: acc.total + r.total,
    }),
    { hours: 0, base: 0, tips: 0, topup: 0, bonus: 0, total: 0 },
  );

  return (
    <div className="w-full animate-fadeUp">
      <PageHeader
        actions={
          <div className="flex w-full flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
            <div className="relative min-w-0 flex-1 md:max-w-[380px]">
              <Icon name="search" size={19} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3" />
              <Input
                className="pr-10"
                placeholder="חיפוש עובד..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="חיפוש עובד"
              />
            </div>
            <div className="hidden items-center gap-2.5 md:flex">
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="!w-[150px]" />
              {isPayrollManager && (
                <Button
                  variant="secondary"
                  icon="download"
                  onClick={() => exportPayrollExcel(toExportRows(filteredRows), month)}
                >
                  ייצוא אקסל
                </Button>
              )}
            </div>
          </div>
        }
      />

      {/* ── Mobile — app-style payroll ── */}
      <div className="payroll-mobile md:hidden">
        <section className="payroll-hero">
          <div className="payroll-hero-top">
            <div className="payroll-month-nav">
              <button
                type="button"
                className="payroll-month-btn"
                aria-label="חודש קודם"
                onClick={() => setMonth(shiftMonth(month, -1))}
              >
                <Icon name="chevron_right" size={20} />
              </button>
              <span className="payroll-month-label">{monthLabel(month)}</span>
              <button
                type="button"
                className="payroll-month-btn"
                aria-label="חודש הבא"
                onClick={() => setMonth(shiftMonth(month, 1))}
              >
                <Icon name="chevron_left" size={20} />
              </button>
            </div>
            {isPayrollManager && (
              <button
                type="button"
                className="payroll-tip-btn btn-press"
                onClick={() => exportPayrollExcel(toExportRows(filteredRows), month)}
              >
                <Icon name="download" size={17} />
                אקסל
              </button>
            )}
          </div>
          <span className="payroll-hero-label">סה״כ לתשלום</span>
          <div className="payroll-hero-total">{formatCurrency(totals.total)}</div>
          <div className="payroll-hero-chips">
            <span className="payroll-hero-chip">
              <Icon name="schedule" size={15} />
              {Math.round(totals.hours).toLocaleString("he-IL")} שעות
            </span>
            <span className="payroll-hero-chip">
              <Icon name="group" size={15} />
              {filteredRows.length} עובדים
            </span>
          </div>
        </section>

        <div className="payroll-stats">
          {[
            { label: "שכר שעתי", value: totals.base, icon: "payments", tone: "neutral" },
            { label: "טיפים", value: totals.tips, icon: "savings", tone: "accent" },
            { label: "השלמות למינימום", value: totals.topup, icon: "add_card", tone: "warning" },
            { label: "תוספת מאחוז קופה", value: totals.bonus, icon: "percent", tone: "accent" },
          ].map((s, i) => (
            <div
              key={s.label}
              className="payroll-stat"
              data-tone={s.tone}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="payroll-stat-icon"><Icon name={s.icon} size={17} /></span>
              <div className="payroll-stat-value">{formatCurrency(s.value)}</div>
              <div className="payroll-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

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
                onClick={() => navigate(`/payroll/${r.id}?month=${month}`)}
              >
                <span className="user-cell-avatar person-chip" style={{ background: colorFor(r.id) }}>
                  {initialsOf(r.name)}
                </span>
                <span className="user-cell-info">
                  <span className="user-cell-name">{r.name}</span>
                  <span className="user-cell-sub">
                    <span className="user-cell-role">{WAGE_TYPE_LABELS[r.wageType]}</span>
                    <span className="user-cell-dept"> · {r.hours.toFixed(1)} שע׳</span>
                    {r.bonus > 0 && <span className="pay-cell-flag">% קופה</span>}
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

      {/* ── Desktop — stat tiles ── */}
      <div className="mb-5 hidden grid-cols-2 gap-4 md:grid lg:grid-cols-6">
        {[
          { label: "סה״כ שעות", value: Math.round(totals.hours).toLocaleString("he-IL"), icon: "schedule", color: "var(--info)", tint: "var(--info-bg)" },
          { label: "שכר שעתי", value: formatCurrency(totals.base), icon: "payments", color: "var(--text)", tint: "var(--surface-2)" },
          { label: "טיפים", value: formatCurrency(totals.tips), icon: "savings", color: "var(--accent-2)", tint: "var(--accent-tint)" },
          { label: "השלמות למינימום", value: formatCurrency(totals.topup), icon: "add_card", color: "var(--warning)", tint: "var(--warning-bg)" },
          { label: "תוספת מאחוז קופה", value: formatCurrency(totals.bonus), icon: "percent", color: "var(--accent)", tint: "var(--accent-tint)" },
          { label: "סה״כ לתשלום", value: formatCurrency(totals.total), icon: "account_balance_wallet", color: "var(--success)", tint: "var(--success-bg)" },
        ].map((k, i) => (
          <div
            key={k.label}
            className="stat-tile dash-rise"
            style={{ "--tile-color": k.color, "--tile-tint": k.tint, "--rise-delay": `${i * 45}ms` } as React.CSSProperties}
          >
            <span className="stat-tile-icon"><Icon name={k.icon} size={21} /></span>
            <div className="stat-tile-value">{k.value}</div>
            <div className="stat-tile-label">{k.label}</div>
          </div>
        ))}
      </div>

      <Card className="hidden overflow-hidden !p-0 shadow-card md:block">
        <div className="overflow-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[1.7fr_0.8fr_0.7fr_0.8fr_1fr_0.9fr_0.9fr_1fr] gap-2 border-b border-border bg-surface-2 px-5 py-3 text-[11.5px] font-bold uppercase tracking-wide text-text-3">
              <span>עובד</span><span>סוג</span><span>שעות</span><span>תעריף</span><span>בסיס / טיפים</span><span>השלמה</span><span>תוספת קופה</span><span>סה״כ</span>
            </div>
            {filteredRows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate(`/payroll/${r.id}?month=${month}`)}
                className="data-row data-row--clickable grid w-full grid-cols-[1.7fr_0.8fr_0.7fr_0.8fr_1fr_0.9fr_0.9fr_1fr] items-center gap-2 border-b border-border-2 px-5 py-3 text-[13.5px] text-right"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="person-chip h-8 w-8 rounded-[9px] text-[12px]" style={{ background: colorFor(r.id) }}>{initialsOf(r.name)}</span>
                  <span className="truncate font-bold">{r.name}</span>
                </span>
                <span><Badge tone={r.wageType === "tips" ? "violet" : "neutral"}>{WAGE_TYPE_LABELS[r.wageType]}</Badge></span>
                <span className="tabular-nums">{r.hours.toFixed(1)}</span>
                <span className="tabular-nums">{r.rate ? formatCurrency(r.rate) : "—"}</span>
                <span className={`tabular-nums ${r.wageType === "tips" ? "font-bold text-accent-2" : ""}`}>{formatCurrency(r.wageType === "tips" ? r.tips : r.base)}</span>
                <span className="tabular-nums text-text-2">{r.topup > 0 ? formatCurrency(r.topup) : "—"}</span>
                <span className={`tabular-nums ${r.bonus > 0 ? "font-bold text-accent" : "text-text-2"}`}>{r.bonus > 0 ? formatCurrency(r.bonus) : "—"}</span>
                <span className="font-extrabold tabular-nums">{formatCurrency(r.total)}</span>
              </button>
            ))}
            {filteredRows.length === 0 && (
              <div className="px-5 py-10 text-center text-text-2">
                {search.trim() ? "לא נמצאו עובדים." : "אין נתונים לחודש זה."}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
