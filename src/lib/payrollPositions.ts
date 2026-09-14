import {
  attendancePosition,
  bonusPosition,
  groupByPosition,
  positionLabel,
  sortPositions,
  tipPosition,
} from "@/lib/employeePositions";
import {
  computeEmployeePayroll,
  sumAttendanceHours,
  withPayrollAdjustments,
  type PayrollAdjustmentsInput,
  type PayrollRow,
} from "@/lib/payrollCompute";
import type { Attendance, EmployeePosition, ShiftBonus, Tip } from "@/types/database";

/** One payroll line: a single employee in a single position for the month. */
export interface PayrollPositionRow extends PayrollRow {
  /** `${employeeId}:${positionId}` — unique per line. */
  id: string;
  employeeId: string;
  positionId: string;
  position: EmployeePosition;
  positionLabel: string;
  name: string | null;
  pensionActive: boolean;
  /** Completed punches (hourly) or tip rows (tips) attributed to this position. */
  shifts: number;
  /**
   * The line that carries the employee-level items — monthly adjustments and
   * approved fault work — so they are never double counted across positions.
   */
  isPrimaryRow: boolean;
  /** How many payroll lines this employee has in the month (for row spanning / grouping). */
  positionCount: number;
}

export interface BuildPayrollPositionRowsInput {
  employee: { id: string; full_name: string | null; pension_active?: boolean | null };
  /** The employee's positions (real rows or the legacy fallback). */
  positions: EmployeePosition[];
  /** Month attendance — any employee; filtered here. */
  attendance: Pick<Attendance, "employee_id" | "clock_in" | "clock_out" | "position_id">[];
  tips: Pick<Tip, "employee_id" | "hours" | "amount" | "hourly_from_tips" | "position_id">[];
  bonuses: Pick<ShiftBonus, "employee_id" | "amount" | "position_id">[];
  faultPaySum?: number;
  adjustments?: PayrollAdjustmentsInput;
  deptName?: (id: string) => string | null | undefined;
}

/**
 * Split one employee's month into a line per position actually worked.
 *
 * Attendance, tips and kupah bonuses are each attributed to the position they
 * were recorded under (legacy rows fall back by wage model, then primary).
 * Every active position is computed on its own wage model — a waiter/shift
 * manager gets a tips line and an hourly line. Positions with nothing recorded
 * are skipped, except that an employee with no activity at all still gets one
 * (empty) line for their primary position so they appear in the sheet.
 */
export function buildPayrollPositionRows(input: BuildPayrollPositionRowsInput): PayrollPositionRow[] {
  const { employee, deptName } = input;
  const positions = sortPositions(input.positions);
  if (positions.length === 0) return [];

  const myAttendance = input.attendance.filter((a) => a.employee_id === employee.id && a.clock_in && a.clock_out);
  const myTips = input.tips.filter((t) => t.employee_id === employee.id);
  const myBonuses = input.bonuses.filter((b) => b.employee_id === employee.id);

  const attendanceByPos = groupByPosition(myAttendance, positions, attendancePosition);
  const tipsByPos = groupByPosition(myTips, positions, tipPosition);
  const bonusesByPos = groupByPosition(myBonuses, positions, bonusPosition);

  const activeIds = new Set<string>([...attendanceByPos.keys(), ...tipsByPos.keys(), ...bonusesByPos.keys()]);
  const active = positions.filter((p) => activeIds.has(p.id));
  const shown = active.length > 0 ? active : [positions[0]];
  const primaryRowId = shown[0].id;

  return shown.map((pos) => {
    const isPrimaryRow = pos.id === primaryRowId;
    const posAttendance = attendanceByPos.get(pos.id) ?? [];
    const posTips = tipsByPos.get(pos.id) ?? [];
    const posBonuses = bonusesByPos.get(pos.id) ?? [];
    const bonusSum = posBonuses.reduce((s, b) => s + (Number(b.amount) || 0), 0);

    const pay = withPayrollAdjustments(
      computeEmployeePayroll({
        wageType: pos.wage_type,
        rate: Number(pos.hourly_rate) || 0,
        tips: posTips,
        bonusSum,
        attendanceHours: sumAttendanceHours(posAttendance, employee.id),
        faultPaySum: isPrimaryRow ? input.faultPaySum ?? 0 : 0,
      }),
      isPrimaryRow ? input.adjustments : undefined,
    );

    const shifts = pos.wage_type === "tips" ? posTips.length : posAttendance.length;

    return {
      ...pay,
      id: `${employee.id}:${pos.id}`,
      employeeId: employee.id,
      positionId: pos.id,
      position: pos,
      positionLabel: positionLabel(pos, deptName),
      name: employee.full_name,
      pensionActive: employee.pension_active ?? false,
      shifts,
      isPrimaryRow,
      positionCount: shown.length,
    };
  });
}
