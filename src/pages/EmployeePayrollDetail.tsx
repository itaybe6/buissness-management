import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Badge, ErrorState, Icon, PageLoader } from "@/components/ui";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  MonthStepper,
  ShiftBreakdownList,
  ShiftBreakdownSummary,
  ShiftDetailModal,
  useMonthStepper,
  type ShiftRow,
} from "@/components/payroll/ShiftBreakdownView";
import { useAuth } from "@/lib/auth";
import { WAGE_TYPE_LABELS } from "@/lib/constants";
import { useBusinessId, formatCurrency } from "@/lib/db";
import { buildEmployeeShiftRows, fmtHours, monthNow, sumShiftRowTotals } from "@/lib/payrollShiftRows";
import { useEmployeeAttendanceMonth } from "@/api/attendance";
import { useEmployeeTips, useEmployeeBonuses, useEmployeeFaultPays, usePayrollMonthAdjustments, payrollAdjustmentForEmployee } from "@/api/payroll";
import { buildFaultPayRows } from "@/lib/faultPayrollRows";
import { withPayrollAdjustments } from "@/lib/payrollCompute";
import {
  PayrollAdjustmentSummary,
  PayrollAdjustmentsDialog,
} from "@/components/payroll/PayrollAdjustments";
import { useShiftTemplates } from "@/api/shifts";
import { useProfiles } from "@/api/users";

export function EmployeePayrollDetail() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const [selectedRow, setSelectedRow] = useState<ShiftRow | null>(null);
  const [editingAdjustments, setEditingAdjustments] = useState(false);

  const month = searchParams.get("month") ?? monthNow();
  const setMonth = (m: string) => setSearchParams({ month: m }, { replace: true });
  const stepper = useMonthStepper(month, setMonth);

  const isPayrollManager = profile && ["manager", "office_manager"].includes(profile.role);
  const { data: users, isLoading: usersLoading, isError: usersError, refetch: refetchUsers } = useProfiles(businessId);
  const employee = (users ?? []).find((u) => u.id === employeeId);

  const wageType = employee?.wage_type ?? "hourly";
  const isTips = wageType === "tips";
  const rate = Number(employee?.hourly_rate ?? 0);
  const bonusPct = Number(employee?.bonus_pct ?? 0);

  const attendanceQ = useEmployeeAttendanceMonth(businessId, !isTips ? employeeId : null, month);
  const tipsQ = useEmployeeTips(businessId, isTips ? employeeId : null, month);
  const bonusesQ = useEmployeeBonuses(businessId, employeeId, month);
  const faultPaysQ = useEmployeeFaultPays(businessId, employeeId, month);
  const adjustmentsQ = usePayrollMonthAdjustments(businessId, month);
  const { data: templates } = useShiftTemplates(businessId);

  const monthAdj = payrollAdjustmentForEmployee(adjustmentsQ.data, employeeId ?? "");
  const adjValues = {
    monthlyBonus: Number(monthAdj?.monthly_bonus ?? 0),
    advance: Number(monthAdj?.advance ?? 0),
    differences: Number(monthAdj?.differences ?? 0),
  };
  const hasAdjustments = adjValues.monthlyBonus > 0 || adjValues.advance > 0 || adjValues.differences !== 0;

  const activeQ = isTips ? tipsQ : attendanceQ;
  const isLoading = usersLoading || activeQ.isLoading || bonusesQ.isLoading || faultPaysQ.isLoading || adjustmentsQ.isLoading;
  const isError = usersError || activeQ.isError || bonusesQ.isError || faultPaysQ.isError || adjustmentsQ.isError;
  const refetch = () => {
    refetchUsers();
    activeQ.refetch();
    bonusesQ.refetch();
    faultPaysQ.refetch();
    adjustmentsQ.refetch();
  };

  const rows = useMemo(() => {
    if (!employee) return [];
    const shiftRows = buildEmployeeShiftRows({
      isTips,
      rate,
      attendance: attendanceQ.data ?? [],
      tips: tipsQ.data ?? [],
      bonuses: bonusesQ.data ?? [],
      templates: templates ?? [],
    });
    const faultRows = buildFaultPayRows(faultPaysQ.data ?? []);
    return [...shiftRows, ...faultRows].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [employee, isTips, rate, attendanceQ.data, tipsQ.data, bonusesQ.data, faultPaysQ.data, templates]);

  const totals = useMemo(() => sumShiftRowTotals(rows), [rows]);

  const faultPayTotal = useMemo(
    () => (faultPaysQ.data ?? []).reduce((s, f) => s + (Number(f.work_price) || 0), 0),
    [faultPaysQ.data],
  );

  const netPay = useMemo(() => {
    const gross = totals.earned;
    return withPayrollAdjustments(
      {
        wageType,
        rate,
        hours: totals.hours,
        base: 0,
        tips: totals.tips,
        topup: totals.topup,
        bonus: totals.bonus,
        faultPay: faultPayTotal,
        grossPay: gross,
        monthlyBonus: 0,
        advance: 0,
        differences: 0,
        total: gross,
      },
      adjValues,
    ).total;
  }, [
    totals.earned,
    totals.hours,
    totals.tips,
    totals.topup,
    totals.bonus,
    adjValues.monthlyBonus,
    adjValues.advance,
    adjValues.differences,
    wageType,
    rate,
    faultPayTotal,
  ]);

  /** Where the money came from — drives the composition bar in the hero. */
  const segments = useMemo(() => {
    const list = isTips
      ? [
          { key: "tips", label: "טיפים", value: totals.tips },
          { key: "topup", label: "השלמה למינ׳", value: totals.topup },
          { key: "bonus", label: "תוספת קופה", value: totals.bonus },
        ]
      : [
          { key: "base", label: "שכר שעתי", value: totals.earned - totals.bonus - faultPayTotal },
          { key: "fault", label: "עבודות תחזוקה", value: faultPayTotal },
          { key: "bonus", label: "תוספת קופה", value: totals.bonus },
        ];
    return list.filter((s) => s.value > 0.5);
  }, [isTips, totals, faultPayTotal]);

  const segTotal = segments.reduce((s, x) => s + x.value, 0);

  if (!employeeId) return <Navigate to="/payroll" replace />;
  if (!isPayrollManager && profile?.id !== employeeId) return <Navigate to="/my-shifts" replace />;

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;
  if (!employee) return <ErrorState message="העובד לא נמצא." onRetry={() => navigate("/payroll")} />;

  const goBack = () => navigate(`/payroll?month=${month}`);

  const wageFacts = [
    rate > 0 ? (isTips ? `מינ׳ ${formatCurrency(rate)}/ש׳` : `${formatCurrency(rate)}/ש׳`) : null,
    bonusPct > 0 ? `${bonusPct}% מהקופה` : null,
  ].filter(Boolean) as string[];

  const wageSummary = [WAGE_TYPE_LABELS[wageType], ...wageFacts].join(" · ");
  const heroSub =
    employee.role === "maintenance" && faultPayTotal > 0
      ? "שכר לפי תקלות מאושרות"
      : wageFacts.length > 0
        ? wageFacts.join(" · ")
        : employee.role === "maintenance"
          ? "שכר לפי תקלות — לאחר אישור מנהל"
          : "לא הוגדר תעריף";
  const missingRate =
    !isTips && rate <= 0 && employee.role !== "maintenance" && !!isPayrollManager;

  return (
    <div className="epd-page page-enter">
      {/* ══ Mobile — full-bleed payslip hero ══ */}
      <section className="epd-hero md:hidden">
        <span className="epd-glow epd-glow--1" aria-hidden />
        <span className="epd-glow epd-glow--2" aria-hidden />
        <span className="epd-sheen" aria-hidden />

        <div className="epd-hero-inner">
          <div className="epd-bar">
            <button type="button" className="epd-back" onClick={goBack}>
              <Icon name="arrow_forward" size={18} />
              חזרה לשכר
            </button>
            <span className="epd-wage">
              <Icon name={isTips ? "savings" : "schedule"} size={14} />
              {WAGE_TYPE_LABELS[wageType]}
            </span>
          </div>

          <div className="epd-id">
            <span className="epd-id-avatar">
              <UserAvatar
                userId={employee.id}
                name={employee.full_name}
                avatarUrl={employee.avatar_url}
                size={46}
                rounded="circle"
              />
            </span>
            <span className="epd-id-text">
              <span className="epd-id-name">{employee.full_name}</span>
              <span className="epd-id-sub">{heroSub}</span>
            </span>
          </div>

          <div className="epd-money-head">
            <span className="epd-label">סה״כ לחודש</span>
            <div className="epd-month">
              <button type="button" className="epd-month-btn" aria-label="חודש קודם" onClick={stepper.onPrev}>
                <Icon name="chevron_right" size={19} />
              </button>
              <span className="epd-month-label">{stepper.label}</span>
              <button
                type="button"
                className="epd-month-btn"
                aria-label="חודש הבא"
                onClick={stepper.onNext}
                disabled={stepper.atCurrentMonth}
              >
                <Icon name="chevron_left" size={19} />
              </button>
            </div>
          </div>

          <div className="epd-total">{formatCurrency(netPay)}</div>

          {hasAdjustments && (
            <p className="epd-id-sub mt-1 tabular-nums">
              לפני התאמות: {formatCurrency(totals.earned)}
            </p>
          )}

          {segments.length > 1 && (
            <>
              <div className="epd-track" role="img" aria-label="הרכב השכר">
                {segments.map((s, i) => (
                  <span
                    key={s.key}
                    className="epd-track-seg"
                    data-kind={s.key}
                    style={{ width: `${(s.value / segTotal) * 100}%`, animationDelay: `${140 + i * 90}ms` }}
                  />
                ))}
              </div>
              <div className="epd-legend">
                {segments.map((s) => (
                  <span key={s.key} className="epd-legend-item">
                    <span className="epd-legend-dot" data-kind={s.key} />
                    {s.label}
                    <b>{formatCurrency(s.value)}</b>
                  </span>
                ))}
              </div>
            </>
          )}

          {missingRate && (
            <p className="epd-note">
              <Icon name="info" size={16} />
              לא הוגדר תעריף שעתי לעובד — עדכנו אותו בכרטיס העובד כדי שהשכר יחושב.
            </p>
          )}
        </div>
      </section>

      {/* ══ Desktop header ══ */}
      <header className="mb-4 hidden items-center justify-between gap-3 md:flex">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" className="icon-btn shrink-0" onClick={goBack} aria-label="חזרה לשכר">
            <Icon name="arrow_forward" size={20} />
          </button>
          <UserAvatar
            userId={employee.id}
            name={employee.full_name}
            avatarUrl={employee.avatar_url}
            size={44}
            rounded="square"
          />
          <div className="min-w-0">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-text-3">פירוט שעות ושכר</p>
            <h1 className="mt-0.5 truncate text-[clamp(1.4rem,5vw,1.9rem)] font-extrabold leading-none tracking-tight text-text">
              {employee.full_name}
            </h1>
            <p className="mt-1 text-[13px] text-text-2">{wageSummary}</p>
          </div>
        </div>
        <MonthStepper
          label={stepper.label}
          onPrev={stepper.onPrev}
          onNext={stepper.onNext}
          nextDisabled={stepper.atCurrentMonth}
        />
      </header>

      <div className="epd-body">
        {/* Mobile — stats card floating over the hero edge */}
        <div className="epd-stats md:hidden">
          <div className="epd-stat">
            <span className="epd-stat-value">{totals.count}</span>
            <span className="epd-stat-label">משמרות</span>
          </div>
          <div className="epd-stat">
            <span className="epd-stat-value">{fmtHours(totals.hours)}</span>
            <span className="epd-stat-label">שעות</span>
          </div>
          <div className="epd-stat">
            <span className="epd-stat-value">{formatCurrency(isTips ? totals.avg : rate)}</span>
            <span className="epd-stat-label">{isTips ? "ממוצע לשעה" : "תעריף לשעה"}</span>
          </div>
        </div>

        <div className="mb-4 hidden flex-wrap gap-2 md:flex">
          <Badge tone={isTips ? "violet" : "neutral"}>
            <Icon name={isTips ? "savings" : "schedule"} size={14} />
            {WAGE_TYPE_LABELS[wageType]}
          </Badge>
          {rate > 0 && (
            <Badge tone="neutral">
              <Icon name="payments" size={14} />
              {isTips ? `מינימום ${formatCurrency(rate)}/ש׳` : `${formatCurrency(rate)}/ש׳`}
            </Badge>
          )}
          {bonusPct > 0 && (
            <Badge tone="neutral">
              <Icon name="percent" size={14} />
              {bonusPct}% מהקופה
            </Badge>
          )}
        </div>

        <div className="hidden md:block">
          <ShiftBreakdownSummary
            isTips={isTips}
            wageLabel={WAGE_TYPE_LABELS[wageType]}
            bonusPct={bonusPct}
            totals={totals}
            rate={rate}
            stepper={stepper}
            showMobileHero={false}
          />
        </div>

        {(isPayrollManager || hasAdjustments) && (
          <section className="payroll-adj-panel mb-4 rounded-xl border border-border bg-surface p-4 shadow-card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[14px] font-bold text-text">התאמות חודשיות</h2>
              {isPayrollManager ? (
                <button
                  type="button"
                  className="ui-btn ui-btn--secondary inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12.5px] font-bold text-text-2"
                  onClick={() => setEditingAdjustments(true)}
                >
                  <Icon name="edit" size={16} />
                  עריכה
                </button>
              ) : (
                <span className="text-[12px] text-text-3">עריכה למנהלת משרד בלבד</span>
              )}
            </div>
            <PayrollAdjustmentSummary values={adjValues} />
            <p className="mt-3 text-[12px] text-text-2">
              סה״כ לתשלום לאחר התאמות: <strong className="tabular-nums text-text">{formatCurrency(netPay)}</strong>
            </p>
          </section>
        )}

        {isPayrollManager && (
          <PayrollAdjustmentsDialog
            open={editingAdjustments}
            onClose={() => setEditingAdjustments(false)}
            businessId={businessId}
            employeeId={employee.id}
            employeeName={employee.full_name}
            month={month}
            grossPay={totals.earned}
            values={adjValues}
          />
        )}

        {rows.length > 0 && (
          <div className="epd-section md:hidden">
            <span className="epd-section-title">פירוט משמרות</span>
            <span className="epd-section-count">{totals.count}</span>
          </div>
        )}

        <ShiftBreakdownList rows={rows} isTips={isTips} onRowClick={setSelectedRow} />
      </div>

      <ShiftDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} isTips={isTips} rate={rate} />
    </div>
  );
}
