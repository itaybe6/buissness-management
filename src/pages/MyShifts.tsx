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
import { PositionTabs } from "@/components/payroll/PositionTabs";
import { useAuth } from "@/lib/auth";
import { WAGE_TYPE_LABELS } from "@/lib/constants";
import { useBusinessId } from "@/lib/db";
import { positionsForEmployee } from "@/lib/employeePositions";
import { useEmployeeAttendanceMonth } from "@/api/attendance";
import { useDepartments } from "@/api/departments";
import { useEmployeePositions } from "@/api/employeePositions";
import { useEmployeeTips, useEmployeeBonuses, useEmployeeFaultPays } from "@/api/payroll";
import { useShiftTemplates } from "@/api/shifts";
import { buildEmployeeShiftRowsByPosition, monthNow, sumShiftRowTotals } from "@/lib/payrollShiftRows";
import { buildFaultPayRows } from "@/lib/faultPayrollRows";

export function MyShifts() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const [month, setMonth] = useState(monthNow());
  const [selectedRow, setSelectedRow] = useState<ShiftRow | null>(null);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const stepper = useMonthStepper(month, setMonth);

  const { data: allPositions } = useEmployeePositions(businessId);
  const { data: departments } = useDepartments(businessId);
  const deptName = useMemo(
    () => (id: string) => (departments ?? []).find((d) => d.id === id)?.name ?? null,
    [departments],
  );
  const positions = useMemo(
    () => (profile ? positionsForEmployee(profile, allPositions) : []),
    [profile, allPositions],
  );
  const activePositionId = positions.some((p) => p.id === selectedPositionId) ? selectedPositionId : null;
  const activePositions = activePositionId ? positions.filter((p) => p.id === activePositionId) : positions;
  const single = activePositions.length === 1 ? activePositions[0] : null;

  // One position: its own wage model. Several: a mixed view where every row
  // keeps its own model and the summary shows the blended hourly average.
  const wageType = single?.wage_type ?? profile?.wage_type ?? "hourly";
  const isTips = single ? single.wage_type === "tips" : positions.some((p) => p.wage_type === "tips");
  const rate = single ? Number(single.hourly_rate ?? 0) : 0;
  const bonusPct = single ? Number(single.bonus_pct ?? 0) : 0;
  const wageLabel = single ? WAGE_TYPE_LABELS[wageType] : "לפי תפקיד";

  const attendanceQ = useEmployeeAttendanceMonth(businessId, profile?.id, month);
  const tipsQ = useEmployeeTips(businessId, profile?.id, month);
  const bonusesQ = useEmployeeBonuses(businessId, profile?.id, month);
  const faultPaysQ = useEmployeeFaultPays(businessId, profile?.id, month);
  const { data: templates } = useShiftTemplates(businessId);

  const isLoading = attendanceQ.isLoading || tipsQ.isLoading || bonusesQ.isLoading || faultPaysQ.isLoading;
  const isError = attendanceQ.isError || tipsQ.isError || bonusesQ.isError || faultPaysQ.isError;
  const refetch = () => {
    attendanceQ.refetch();
    tipsQ.refetch();
    bonusesQ.refetch();
    faultPaysQ.refetch();
  };

  // Fault work belongs to the employee, not a position — show it on "all" / the primary position.
  const showFaultRows = !activePositionId || activePositionId === positions[0]?.id;

  const rows = useMemo(() => {
    const shiftRows = buildEmployeeShiftRowsByPosition({
      positions,
      onlyPositionId: activePositionId,
      attendance: attendanceQ.data ?? [],
      tips: tipsQ.data ?? [],
      bonuses: bonusesQ.data ?? [],
      templates: templates ?? [],
      deptName,
    });
    const faultRows = showFaultRows ? buildFaultPayRows(faultPaysQ.data ?? []) : [];
    return [...shiftRows, ...faultRows].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [positions, activePositionId, attendanceQ.data, tipsQ.data, bonusesQ.data, faultPaysQ.data, templates, deptName, showFaultRows]);

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
          <PositionTabs
            positions={positions}
            value={activePositionId}
            onChange={setSelectedPositionId}
            deptName={deptName}
            className="mb-3"
          />
          <ShiftBreakdownSummary
            isTips={isTips || !single}
            wageLabel={wageLabel}
            bonusPct={bonusPct}
            totals={totals}
            rate={rate}
            stepper={stepper}
          />
          <ShiftBreakdownList rows={rows} isTips={isTips} onRowClick={setSelectedRow} />
          <ShiftDetailModal
            row={selectedRow}
            onClose={() => setSelectedRow(null)}
            isTips={selectedRow?.isTips ?? isTips}
            rate={selectedRow?.hourly ?? rate}
          />
        </>
      )}
    </div>
  );
}
