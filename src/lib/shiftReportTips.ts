import type { Attendance, ShiftAssignment, ShiftReportParticipant, ShiftTemplate } from "@/types/database";
import {
  filterAttendanceNearReportDate,
  getAttendanceHoursInShiftWindow,
  punchOverlapsAbsoluteWindow,
  shiftWindowForDate,
} from "@/lib/attendanceFeed";

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

function employeePunches(
  attendance: Attendance[],
  employeeId: string,
  reportDate: string,
): Attendance[] {
  return filterAttendanceNearReportDate(attendance, reportDate).filter(
    (a) => a.employee_id === employeeId && a.clock_in && a.clock_out,
  );
}

/** Punches that started on the report calendar day (evening shifts may end after midnight). */
function punchesStartingOnReportDate(punches: Attendance[], reportDate: string): Attendance[] {
  return punches.filter((a) => a.clock_in!.slice(0, 10) === reportDate);
}

/**
 * Real hours from clock-in/out — clipped to the shift window when a template is selected,
 * otherwise the sum of completed punches on the report calendar day.
 */
export function getAttendanceHoursForShiftReport(input: {
  attendance: Attendance[];
  employeeId: string;
  reportDate: string;
  shiftTemplateId: string;
  templates: ShiftTemplate[];
}): number {
  const { attendance, employeeId, reportDate, shiftTemplateId, templates } = input;
  const template = shiftTemplateId ? templates.find((t) => t.id === shiftTemplateId) ?? null : null;
  const punches = employeePunches(attendance, employeeId, reportDate);

  if (punches.length === 0) return 0;

  if (template) {
    const window = shiftWindowForDate(reportDate, template);
    const overlap = getAttendanceHoursInShiftWindow(punches, employeeId, window);
    const rawInWindow = punches
      .filter((a) => punchOverlapsAbsoluteWindow(a.clock_in!, a.clock_out, window))
      .reduce((sum, a) => {
        const dur = (new Date(a.clock_out!).getTime() - new Date(a.clock_in!).getTime()) / 3.6e6;
        return sum + Math.max(0, dur);
      }, 0);
    return Math.round(Math.min(overlap, rawInWindow) * 100) / 100;
  }

  const dayPunches = punchesStartingOnReportDate(punches, reportDate);
  const hrs = dayPunches.reduce((sum, a) => {
    const dur = (new Date(a.clock_out!).getTime() - new Date(a.clock_in!).getTime()) / 3.6e6;
    return sum + Math.max(0, dur);
  }, 0);
  return Math.round(hrs * 100) / 100;
}

function formatTimeMs(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Hours between two HH:mm values (handles end past midnight). */
export function hoursBetweenTimes(start: string, end: string): number {
  const [sh, sm] = start.slice(0, 5).split(":").map(Number);
  const [eh, em] = end.slice(0, 5).split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 24 * 60;
  return Math.round(((endMin - startMin) / 60) * 100) / 100;
}

export function formatWorkTimeRange(start?: string, end?: string): string {
  if (!start && !end) return "—";
  if (start && end) return `${start}–${end}`;
  return start || end || "—";
}

/** Earliest/latest clipped punch times on the report day plus total hours. */
export function getAttendanceTimeRangeForShiftReport(input: {
  attendance: Attendance[];
  employeeId: string;
  reportDate: string;
  shiftTemplateId: string;
  templates: ShiftTemplate[];
}): { work_start: string; work_end: string; hours: number } | null {
  const { attendance, employeeId, reportDate, shiftTemplateId, templates } = input;
  const template = shiftTemplateId ? templates.find((t) => t.id === shiftTemplateId) ?? null : null;
  const punches = employeePunches(attendance, employeeId, reportDate);
  if (punches.length === 0) return null;

  if (!template) {
    const dayPunches = punchesStartingOnReportDate(punches, reportDate);
    if (dayPunches.length === 0) return null;

    let earliestMs = Infinity;
    let latestMs = -Infinity;
    let totalHrs = 0;

    for (const p of dayPunches) {
      const inMs = new Date(p.clock_in!).getTime();
      const outMs = new Date(p.clock_out!).getTime();
      earliestMs = Math.min(earliestMs, inMs);
      latestMs = Math.max(latestMs, outMs);
      totalHrs += Math.max(0, (outMs - inMs) / 3.6e6);
    }

    return {
      work_start: formatTimeMs(earliestMs),
      work_end: formatTimeMs(latestMs),
      hours: Math.round(totalHrs * 100) / 100,
    };
  }

  const window = shiftWindowForDate(reportDate, template);
  let earliestMs = Infinity;
  let latestMs = -Infinity;
  let totalHrs = 0;

  for (const p of punches) {
    if (!punchOverlapsAbsoluteWindow(p.clock_in!, p.clock_out, window)) continue;
    const inMs = new Date(p.clock_in!).getTime();
    const outMs = new Date(p.clock_out!).getTime();
    const clipStart = Math.max(inMs, window.startMs);
    const clipEnd = Math.min(outMs, window.endMs);
    if (clipEnd <= clipStart) continue;
    earliestMs = Math.min(earliestMs, clipStart);
    latestMs = Math.max(latestMs, clipEnd);
    totalHrs += (clipEnd - clipStart) / 3.6e6;
  }

  if (earliestMs === Infinity) return null;

  return {
    work_start: formatTimeMs(earliestMs),
    work_end: formatTimeMs(latestMs),
    hours: Math.round(totalHrs * 100) / 100,
  };
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
  const team = buildTeamMembersFromShift({
    reportDate: input.reportDate,
    shiftTemplateId: input.shiftTemplateId,
    assignments: input.assignments,
    attendance: input.attendance,
    templates: input.templates,
  });
  return team.filter((p) => input.tipEmployeeIds.has(p.employee_id));
}

/**
 * Build the full shift roster from attendance (primary) and assignments (fallback).
 * Uses the shift's absolute time window on report_date — including overnight shifts past midnight.
 */
export function buildTeamMembersFromShift(input: {
  reportDate: string;
  shiftTemplateId: string;
  assignments: ShiftAssignment[];
  attendance: Attendance[];
  templates: ShiftTemplate[];
}): ShiftReportParticipant[] {
  const { reportDate, shiftTemplateId, assignments, attendance, templates } = input;
  if (!reportDate) return [];

  const template = shiftTemplateId ? templates.find((t) => t.id === shiftTemplateId) ?? null : null;
  const near = filterAttendanceNearReportDate(attendance, reportDate);

  const seen = new Set<string>();
  const result: ShiftReportParticipant[] = [];

  function addEmployee(employeeId: string) {
    if (!employeeId || seen.has(employeeId)) return;

    const range = getAttendanceTimeRangeForShiftReport({
      attendance,
      employeeId,
      reportDate,
      shiftTemplateId,
      templates,
    });
    const attHrs = range?.hours ?? getAttendanceHoursForShiftReport({
      attendance,
      employeeId,
      reportDate,
      shiftTemplateId,
      templates,
    });
    if (attHrs <= 0) return;

    seen.add(employeeId);
    result.push({
      employee_id: employeeId,
      hours: attHrs,
      attendance_hours: attHrs,
      work_start: range?.work_start,
      work_end: range?.work_end,
    });
  }

  for (const a of near) {
    if (!a.clock_in || !a.clock_out) continue;
    if (template) {
      const window = shiftWindowForDate(reportDate, template);
      if (!punchOverlapsAbsoluteWindow(a.clock_in, a.clock_out, window)) continue;
    } else if (a.clock_in!.slice(0, 10) !== reportDate) {
      continue;
    }
    addEmployee(a.employee_id);
  }

  for (const a of assignments) {
    if (a.shift_date !== reportDate) continue;
    if (shiftTemplateId && a.shift_template_id !== shiftTemplateId) continue;
    addEmployee(a.employee_id);
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
