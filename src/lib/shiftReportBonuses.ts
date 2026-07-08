import type { Attendance, ShiftAssignment, ShiftTemplate } from "@/types/database";

function startTimeMinutes(time: string): number {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function clockMinutesFromISO(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

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

  const punches = attendance.filter(
    (a) =>
      a.employee_id === employeeId &&
      a.clock_in?.slice(0, 10) === reportDate &&
      a.clock_in &&
      a.clock_out,
  );
  if (punches.length === 0) return false;

  const template = templates.find((t) => t.id === shiftTemplateId);
  if (!template) return true;

  const shiftStart = startTimeMinutes(template.start_time);
  let shiftEnd = startTimeMinutes(template.end_time);
  if (shiftEnd <= shiftStart) shiftEnd += 24 * 60;

  return punches.some((a) => {
    const inMin = clockMinutesFromISO(a.clock_in!);
    let outMin = clockMinutesFromISO(a.clock_out!);
    if (outMin <= inMin) outMin += 24 * 60;
    return inMin < shiftEnd && outMin > shiftStart;
  });
}

/** Bonus pool = total_sales × bonus_pct / 100, split equally among selected employees. */
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
