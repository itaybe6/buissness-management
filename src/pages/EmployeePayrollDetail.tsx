import { useMemo } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Badge, ErrorState, Icon, PageLoader } from "@/components/ui";
import {
  MonthStepper,
  ShiftBreakdownList,
  ShiftBreakdownSummary,
  useMonthStepper,
} from "@/components/payroll/ShiftBreakdownView";
import { useAuth } from "@/lib/auth";
import { WAGE_TYPE_LABELS } from "@/lib/constants";
import { useBusinessId, colorFor, formatCurrency, initialsOf } from "@/lib/db";
import { buildEmployeeShiftRows, monthNow, sumShiftRowTotals } from "@/lib/payrollShiftRows";
import { useEmployeeAttendanceMonth } from "@/api/attendance";
import { useEmployeeTips, useEmployeeBonuses } from "@/api/payroll";
import { useShiftTemplates } from "@/api/shifts";
import { useProfiles } from "@/api/users";

export function EmployeePayrollDetail() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const businessId = useBusinessId();
  const { profile } = useAuth();

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
  const { data: templates } = useShiftTemplates(businessId);

  const activeQ = isTips ? tipsQ : attendanceQ;
  const isLoading = usersLoading || activeQ.isLoading || bonusesQ.isLoading;
  const isError = usersError || activeQ.isError || bonusesQ.isError;
  const refetch = () => {
    refetchUsers();
    activeQ.refetch();
    bonusesQ.refetch();
  };

  const rows = useMemo(
    () =>
      employee
        ? buildEmployeeShiftRows({
            isTips,
            rate,
            attendance: attendanceQ.data ?? [],
            tips: tipsQ.data ?? [],
            bonuses: bonusesQ.data ?? [],
            templates: templates ?? [],
          })
        : [],
    [employee, isTips, rate, attendanceQ.data, tipsQ.data, bonusesQ.data, templates],
  );

  const totals = useMemo(() => sumShiftRowTotals(rows), [rows]);

  if (!employeeId) return <Navigate to="/payroll" replace />;
  if (!isPayrollManager && profile?.id !== employeeId) return <Navigate to="/my-shifts" replace />;

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;
  if (!employee) return <ErrorState message="העובד לא נמצא." onRetry={() => navigate("/payroll")} />;

  const wageSummary = [
    WAGE_TYPE_LABELS[wageType],
    rate > 0 ? `מינ׳ ${formatCurrency(rate)}` : null,
    bonusPct > 0 ? `${bonusPct}% קופה` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="w-full animate-fadeUp">
      <button
        type="button"
        onClick={() => navigate(`/payroll?month=${month}`)}
        className="mb-3.5 flex items-center gap-1.5 text-[13.5px] font-semibold text-text-2 hover:text-text"
      >
        <Icon name="arrow_forward" size={18} />
        חזרה לשכר
      </button>

      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="person-chip h-11 w-11 flex-none rounded-[11px] text-[14px]"
            style={{ background: colorFor(employee.id) }}
          >
            {initialsOf(employee.full_name)}
          </span>
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

      <div className="mb-4 flex flex-wrap gap-2">
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

      <ShiftBreakdownSummary
        isTips={isTips}
        wageLabel={WAGE_TYPE_LABELS[wageType]}
        bonusPct={bonusPct}
        totals={totals}
        rate={rate}
      />

      <ShiftBreakdownList rows={rows} isTips={isTips} />
    </div>
  );
}
