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
