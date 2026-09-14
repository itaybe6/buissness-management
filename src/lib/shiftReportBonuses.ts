import type { Attendance, EmployeePosition, ShiftAssignment, ShiftTemplate } from "@/types/database";
import { filterAttendanceNearReportDate, punchOverlapsShiftOnDate } from "@/lib/attendanceFeed";
import { isLegacyPositionId, resolvePosition } from "@/lib/employeePositions";

/** Whether an employee's clock-in/out overlaps the shift template window on report_date. */
export function employeeWorkedShift(input: {
  employeeId: string;
  reportDate: string;
  shiftTemplateId: string;
  assignments: ShiftAssignment[];
  attendance: Attendance[];
  templates: ShiftTemplate[];
}): boolean {
  const { employeeId, reportDate, shiftTemplateId, assignments, attendance, templates } = input;
  if (!reportDate || !shiftTemplateId) return false;

  const assigned = assignments.some(
    (a) =>
      a.employee_id === employeeId &&
      a.shift_date === reportDate &&
      a.shift_template_id === shiftTemplateId,
  );
  if (!assigned) return false;

  const punches = filterAttendanceNearReportDate(attendance, reportDate).filter(
    (a) => a.employee_id === employeeId && a.clock_in && a.clock_out,
  );
  if (punches.length === 0) return false;

  const template = templates.find((t) => t.id === shiftTemplateId);
  if (!template) return true;

  return punches.some((a) =>
    punchOverlapsShiftOnDate(a.clock_in!, a.clock_out, reportDate, template),
  );
}

/** Bonus amount for one employee = total_sales × their bonus_pct / 100. */
export function computeEmployeeBonusAmount(totalSales: number, bonusPct: number): number {
  const sales = Number(totalSales) || 0;
  const pct = Number(bonusPct) || 0;
  if (sales <= 0 || pct <= 0) return 0;
  return Math.round(sales * (pct / 100) * 100) / 100;
}

export interface BonusPayoutRow {
  employee_id: string;
  bonus_pct: number;
  amount: number;
  /** Position whose bonus_pct applied (persisted to shift_bonuses.position_id). */
  position_id?: string | null;
}

/** Per-employee bonus rows from the report's participant list. */
export function computeBonusPayouts(
  totalSales: number,
  participants: { employee_id: string; bonus_pct?: number; position_id?: string | null }[],
): BonusPayoutRow[] {
  return participants
    .filter((p) => p.employee_id && (Number(p.bonus_pct) || 0) > 0)
    .map((p) => {
      const bonus_pct = Number(p.bonus_pct) || 0;
      return {
        employee_id: p.employee_id,
        bonus_pct,
        amount: computeEmployeeBonusAmount(totalSales, bonus_pct),
        ...(p.position_id ? { position_id: p.position_id } : {}),
      };
    });
}

/**
 * Bonus participants from the roster, by position: each team member's bonus
 * percentage comes from the position they clocked in as. A shift manager who
 * entered as a waiter (a position with no kupah %) gets no bonus that shift.
 * Legacy rows without a position fall back to the position that carries a %.
 */
export function buildBonusParticipantsFromTeamPositions(
  team: { employee_id: string; position_id?: string | null }[],
  positionsByEmployee: (employeeId: string) => EmployeePosition[],
): { employee_id: string; bonus_pct: number; position_id?: string | null }[] {
  const seen = new Set<string>();
  const result: { employee_id: string; bonus_pct: number; position_id?: string | null }[] = [];

  for (const member of team) {
    const employeeId = member.employee_id;
    if (!employeeId || seen.has(employeeId)) continue;
    seen.add(employeeId);
    const positions = positionsByEmployee(employeeId);
    if (positions.length === 0) continue;
    const position = resolvePosition(member.position_id, positions, { preferBonus: true });
    const bonus_pct = Number(position.bonus_pct) || 0;
    if (bonus_pct <= 0) continue;
    result.push({
      employee_id: employeeId,
      bonus_pct,
      ...(isLegacyPositionId(position.id) ? {} : { position_id: position.id }),
    });
  }

  return result;
}

/** Employees on the shift roster who have a profile bonus_pct > 0. */
export function buildBonusParticipantsFromTeam(
  teamMemberIds: string[],
  profiles: { id: string; bonus_pct?: number | null }[],
): { employee_id: string; bonus_pct: number }[] {
  const pctById = new Map(profiles.map((p) => [p.id, Number(p.bonus_pct) || 0]));
  const seen = new Set<string>();
  const result: { employee_id: string; bonus_pct: number }[] = [];

  for (const employeeId of teamMemberIds) {
    if (!employeeId || seen.has(employeeId)) continue;
    seen.add(employeeId);
    const bonus_pct = pctById.get(employeeId) ?? 0;
    if (bonus_pct <= 0) continue;
    result.push({ employee_id: employeeId, bonus_pct });
  }

  return result;
}

/** @deprecated equal-split pool — kept for legacy tests */
export function computeShiftBonusAmounts(
  totalSales: number,
  bonusPct: number,
  employeeIds: string[],
): { pool: number; perEmployee: number } {
  const sales = Number(totalSales) || 0;
  const pct = Number(bonusPct) || 0;
  const count = employeeIds.filter(Boolean).length;
  if (sales <= 0 || pct <= 0 || count === 0) {
    return { pool: 0, perEmployee: 0 };
  }
  const pool = Math.round(sales * (pct / 100) * 100) / 100;
  const perEmployee = Math.round((pool / count) * 100) / 100;
  return { pool, perEmployee };
}

/**
 * Employees eligible for kupah bonus: assigned to this shift AND clocked in/out
 * overlapping the shift window on the report date.
 */
export function buildBonusCandidatesFromShift(input: {
  reportDate: string;
  shiftTemplateId: string;
  assignments: ShiftAssignment[];
  attendance: Attendance[];
  templates: ShiftTemplate[];
}): string[] {
  const { reportDate, shiftTemplateId, assignments, attendance, templates } = input;
  if (!reportDate || !shiftTemplateId) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const a of assignments) {
    if (a.shift_date !== reportDate) continue;
    if (a.shift_template_id !== shiftTemplateId) continue;
    if (seen.has(a.employee_id)) continue;

    if (
      !employeeWorkedShift({
        employeeId: a.employee_id,
        reportDate,
        shiftTemplateId,
        assignments,
        attendance,
        templates,
      })
    ) {
      continue;
    }

    seen.add(a.employee_id);
    result.push(a.employee_id);
  }

  return result;
}

/** Keep only bonus participants who actually worked the reported shift. */
export function filterBonusParticipantsToWorkedShift(
  participantIds: string[],
  input: {
    reportDate: string;
    shiftTemplateId: string | null;
    assignments: ShiftAssignment[];
    attendance: Attendance[];
    templates: ShiftTemplate[];
  },
): string[] {
  const { reportDate, shiftTemplateId, assignments, attendance, templates } = input;
  if (!reportDate || !shiftTemplateId) return [];

  return participantIds.filter((employeeId) =>
    employeeWorkedShift({
      employeeId,
      reportDate,
      shiftTemplateId,
      assignments,
      attendance,
      templates,
    }),
  );
}
