import { addDays, weekStart } from "@/lib/db";

/** Israeli labor rule: at least one day off per week → max 6 assigned calendar days. */
export const MAX_ASSIGNED_DAYS_PER_WEEK = 6;

export const WEEKLY_DAY_OFF_ERROR =
  "לא ניתן לשבץ עובד ליותר מ-6 ימים בשבוע — חובה יום חופש אחד לפחות.";

export function weekStartFromDateISO(dateISO: string): string {
  return weekStart(new Date(dateISO + "T12:00:00"));
}

/** Distinct calendar dates the employee is already assigned in the Sunday–Saturday week. */
export function assignedDatesInWeek(
  assignments: { employee_id: string; shift_date: string }[],
  employeeId: string,
  weekStartISO: string,
): Set<string> {
  const weekEnd = addDays(weekStartISO, 6);
  const dates = new Set<string>();
  for (const a of assignments) {
    if (a.employee_id !== employeeId) continue;
    if (a.shift_date < weekStartISO || a.shift_date > weekEnd) continue;
    dates.add(a.shift_date);
  }
  return dates;
}

export function countAssignedDaysInWeek(
  assignments: { employee_id: string; shift_date: string }[],
  employeeId: string,
  weekStartISO: string,
): number {
  return assignedDatesInWeek(assignments, employeeId, weekStartISO).size;
}

/**
 * True if assigning on `shiftDate` keeps the employee at ≤6 distinct days that week.
 * Multiple shifts on the same calendar day count as one day.
 */
export function canAssignEmployeeOnDate(
  assignments: { employee_id: string; shift_date: string }[],
  employeeId: string,
  shiftDate: string,
): boolean {
  const wk = weekStartFromDateISO(shiftDate);
  const dates = assignedDatesInWeek(assignments, employeeId, wk);
  if (dates.has(shiftDate)) return true;
  return dates.size < MAX_ASSIGNED_DAYS_PER_WEEK;
}
