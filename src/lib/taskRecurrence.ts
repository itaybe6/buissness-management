import { HE_DAYS } from "@/lib/db";

/** recurrence_weekday = -1 → משימה קבועה בכל יום בשבוע */
export const RECURRENCE_EVERY_DAY = -1;

export function matchesRecurrenceWeekday(recurrence: number | null, weekday: number): boolean {
  if (recurrence == null) return false;
  if (recurrence === RECURRENCE_EVERY_DAY) return true;
  return recurrence === weekday;
}

export function formatRecurrenceWeekday(recurrence: number | null): string {
  if (recurrence == null) return "לא קבועה";
  if (recurrence === RECURRENCE_EVERY_DAY) return "כל יום";
  if (recurrence >= 0 && recurrence <= 6) return `כל ${HE_DAYS[recurrence]}`;
  return "לא קבועה";
}

export function recurrenceSelectValue(recurrence: number | null): string {
  if (recurrence == null) return "none";
  return String(recurrence);
}
