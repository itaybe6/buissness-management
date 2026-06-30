import { addDays, formatDateShort, HE_DAYS } from "@/lib/db";

/** Deadline datetime for submitting availability for a target week (Sunday ISO). */
export function shiftPrefsDeadlineAt(
  targetWeekStart: string,
  dow: number,
  time: string,
  now = new Date()
): Date {
  const prevWeekStart = addDays(targetWeekStart, -7);
  const deadlineDate = addDays(prevWeekStart, dow);
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  const dt = new Date(now);
  dt.setFullYear(
    Number(deadlineDate.slice(0, 4)),
    Number(deadlineDate.slice(5, 7)) - 1,
    Number(deadlineDate.slice(8, 10))
  );
  dt.setHours(h, m, 0, 0);
  return dt;
}

export function isShiftPrefsOpenForWeek(
  targetWeekStart: string,
  dow: number | null | undefined,
  time: string | null | undefined,
  now = new Date()
): boolean {
  if (dow == null || time == null) return true;
  return now < shiftPrefsDeadlineAt(targetWeekStart, dow, time, now);
}

export function formatShiftPrefsDeadline(
  targetWeekStart: string,
  dow: number,
  time: string
): string {
  const prevWeekStart = addDays(targetWeekStart, -7);
  const deadlineDate = addDays(prevWeekStart, dow);
  const hm = time.slice(0, 5);
  return `${HE_DAYS[dow]} ${formatDateShort(deadlineDate)} · ${hm}`;
}

export function formatShiftPrefsDeadlineRule(dow: number, time: string): string {
  const hm = time.slice(0, 5);
  return `עד ${HE_DAYS[dow]} בשעה ${hm} בשבוע הנוכחי`;
}
