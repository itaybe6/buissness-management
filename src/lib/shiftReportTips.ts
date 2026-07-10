import type { Attendance, ShiftAssignment, ShiftReportParticipant, ShiftTemplate } from "@/types/database";

function startTimeMinutes(time: string): number {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

/** Duration of a shift template in hours (handles overnight shifts). */
export function templateDurationHours(startTime: string, endTime: string): number {
  const start = startTimeMinutes(startTime);
  let end = startTimeMinutes(endTime);
  if (end <= start) end += 24 * 60;
  return Math.round(((end - start) / 60) * 100) / 100;
}

function attendanceHoursOnDate(attendance: Attendance[], employeeId: string, dateISO: string): number {
  return attendance
    .filter(
      (a) =>
        a.employee_id === employeeId &&
        a.clock_in?.slice(0, 10) === dateISO &&
        a.clock_in &&
        a.clock_out,
    )
    .reduce((sum, a) => {
      const hrs = (new Date(a.clock_out!).getTime() - new Date(a.clock_in!).getTime()) / 3.6e6;
      return sum + hrs;
    }, 0);
}

export function getAttendanceHoursOnDate(attendance: Attendance[], employeeId: string, dateISO: string): number {
  return Math.round(attendanceHoursOnDate(attendance, employeeId, dateISO) * 100) / 100;
}

/**
 * Build tip participants from shift assignments for a given date/template.
 * Only includes employees whose wage_type is "tips".
 */
export function buildTipParticipantsFromShift(input: {
  reportDate: string;
  shiftTemplateId: string;
  assignments: ShiftAssignment[];
  tipEmployeeIds: Set<string>;
  attendance: Attendance[];
  templates: ShiftTemplate[];
}): ShiftReportParticipant[] {
  const { reportDate, shiftTemplateId, assignments, tipEmployeeIds, attendance, templates } = input;
  if (!reportDate) return [];

  const template = shiftTemplateId ? templates.find((t) => t.id === shiftTemplateId) : null;
  const defaultHours = template ? templateDurationHours(template.start_time, template.end_time) : 0;

  const seen = new Set<string>();
  const result: ShiftReportParticipant[] = [];

  for (const a of assignments) {
    if (a.shift_date !== reportDate) continue;
    if (shiftTemplateId && a.shift_template_id !== shiftTemplateId) continue;
    if (!tipEmployeeIds.has(a.employee_id)) continue;
    if (seen.has(a.employee_id)) continue;
    seen.add(a.employee_id);

    const attHrs = getAttendanceHoursOnDate(attendance, a.employee_id, reportDate);
    const hours = attHrs > 0 ? attHrs : defaultHours;
    result.push({ employee_id: a.employee_id, hours, attendance_hours: attHrs });
  }

  return result;
}

/**
 * Hourly tip rate for a shift: the whole tip pool divided by the total hours of
 * all tip participants. Every participant is paid this same per-hour rate, so
 * the pool is split proportionally to how many hours each person worked.
 * Returns 0 when nobody logged hours (avoids division by zero).
 */
export function computeTipsHourly(totalTips: number, participants: ShiftReportParticipant[]): number {
  const total = Number(totalTips) || 0;
  const totalHours = participants.reduce((s, p) => s + (Number(p.hours) || 0), 0);
  if (totalHours <= 0) return 0;
  return total / totalHours;
}

/** A single participant's share of a tip pool, as persisted into the `tips` table. */
export interface DistributedTip {
  employee_id: string;
  hours: number;
  /** Participant's share of the pool = round(tipsHourly × hours), 2 decimals. */
  amount: number;
  /** The shared per-hour tip rate, rounded to 2 decimals. */
  hourly_from_tips: number;
}

/**
 * Split a shift's total tips across its participants by hours worked.
 * Participants without an employee id or with zero hours are dropped (they get
 * no tips). Amounts are rounded to agorot (2 decimals), matching what is stored.
 */
export function distributeTips(
  totalTips: number,
  participants: ShiftReportParticipant[],
): DistributedTip[] {
  const tipsHourly = computeTipsHourly(totalTips, participants);
  const roundedHourly = Math.round(tipsHourly * 100) / 100;
  return participants
    .filter((p) => p.employee_id && (Number(p.hours) || 0) > 0)
    .map((p) => {
      const hours = Number(p.hours) || 0;
      return {
        employee_id: p.employee_id,
        hours,
        amount: Math.round(tipsHourly * hours * 100) / 100,
        hourly_from_tips: roundedHourly,
      };
    });
}
