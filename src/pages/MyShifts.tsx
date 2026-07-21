import { useMemo, useState } from "react";
import { PageLoader, ErrorState } from "@/components/ui";
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
import { useBusinessId } from "@/lib/db";
import { useEmployeeAttendanceMonth } from "@/api/attendance";
import { useEmployeeTips, useEmployeeBonuses, useEmployeeFaultPays } from "@/api/payroll";
import { useShiftTemplates } from "@/api/shifts";
import { buildEmployeeShiftRows, monthNow, sumShiftRowTotals } from "@/lib/payrollShiftRows";
import { buildFaultPayRows } from "@/lib/faultPayrollRows";

export function MyShifts() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const [month, setMonth] = useState(monthNow());
  const [selectedRow, setSelectedRow] = useState<ShiftRow | null>(null);
  const stepper = useMonthStepper(month, setMonth);

  const wageType = profile?.wage_type ?? "hourly";
  const isTips = wageType === "tips";
  const rate = Number(profile?.hourly_rate ?? 0);
  const bonusPct = Number(profile?.bonus_pct ?? 0);

  const attendanceQ = useEmployeeAttendanceMonth(businessId, !isTips ? profile?.id : null, month);
  const tipsQ = useEmployeeTips(businessId, isTips ? profile?.id : null, month);
  const bonusesQ = useEmployeeBonuses(businessId, profile?.id, month);
  const faultPaysQ = useEmployeeFaultPays(businessId, profile?.id, month);
  const { data: templates } = useShiftTemplates(businessId);

  const activeQ = isTips ? tipsQ : attendanceQ;
  const isLoading = activeQ.isLoading || bonusesQ.isLoading || faultPaysQ.isLoading;
  const isError = activeQ.isError || bonusesQ.isError || faultPaysQ.isError;
  const refetch = () => {
    activeQ.refetch();
    bonusesQ.refetch();
    faultPaysQ.refetch();
  };

  const rows = useMemo(() => {
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
  }, [isTips, rate, attendanceQ.data, tipsQ.data, bonusesQ.data, faultPaysQ.data, templates]);

  const totals = useMemo(() => sumShiftRowTotals(rows), [rows]);

  return (
    <div className="w-full animate-fadeUp pb-[calc(var(--mobile-nav-h)+0.75rem)] md:pb-0">
      <header className="mb-4 hidden items-center justify-between gap-3 md:flex">
        <div className="min-w-0">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-text-3">השכר שלי</p>
          <h1 className="mt-0.5 text-[clamp(1.4rem,5vw,1.9rem)] font-extrabold leading-none tracking-tight text-text">
            מעקב שכר
          </h1>
        </div>
        <MonthStepper
          label={stepper.label}
          onPrev={stepper.onPrev}
          onNext={stepper.onNext}
          nextDisabled={stepper.atCurrentMonth}
        />
      </header>

      {isLoading ? (
        <PageLoader />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <>
          <ShiftBreakdownSummary
            isTips={isTips}
            wageLabel={WAGE_TYPE_LABELS[wageType]}
            bonusPct={bonusPct}
            totals={totals}
            rate={rate}
            stepper={stepper}
          />
          <ShiftBreakdownList rows={rows} isTips={isTips} onRowClick={setSelectedRow} />
          <ShiftDetailModal
            row={selectedRow}
            onClose={() => setSelectedRow(null)}
            isTips={isTips}
            rate={rate}
          />
        </>
      )}
    </div>
  );
}
