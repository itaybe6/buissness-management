import { HE_DAYS } from "@/lib/db";

/** recurrence_weekday כולל -1 → משימה קבועה בכל יום בשבוע */
export const RECURRENCE_EVERY_DAY = -1;

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const HE_DAY_LETTERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"] as const;

/** מנרמל ערך מה-DB / קלט ישן (מספר בודד) למערך ימים */
export function normalizeRecurrenceWeekdays(
  recurrence: number[] | number | null | undefined,
): number[] | null {
  if (recurrence == null) return null;
  if (typeof recurrence === "number") {
    if (!Number.isFinite(recurrence)) return null;
    return [recurrence];
  }
  if (!Array.isArray(recurrence) || recurrence.length === 0) return null;
  return recurrence.filter((d) => Number.isFinite(d));
}

export function isEveryDayRecurrence(recurrence: number[] | number | null | undefined): boolean {
  const days = normalizeRecurrenceWeekdays(recurrence);
  if (!days) return false;
  if (days.includes(RECURRENCE_EVERY_DAY)) return true;
  const set = new Set(days.filter((d) => d >= 0 && d <= 6));
  return set.size === 7;
}

/** מערך מנורמל לשמירה ב-DB: כל יום → [-1], אחרת ימים ממוינים ייחודיים */
export function serializeRecurrenceWeekdays(
  days: number[] | number | null | undefined,
): number[] {
  const normalized = normalizeRecurrenceWeekdays(days) ?? [];
  const unique = [...new Set(normalized.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (unique.length === 0) return [RECURRENCE_EVERY_DAY];
  if (unique.length === 7 || normalized.includes(RECURRENCE_EVERY_DAY)) return [RECURRENCE_EVERY_DAY];
  return unique;
}

export function matchesRecurrenceWeekday(
  recurrence: number[] | number | null | undefined,
  weekday: number,
): boolean {
  const days = normalizeRecurrenceWeekdays(recurrence);
  if (!days) return false;
  if (isEveryDayRecurrence(days)) return true;
  return days.includes(weekday);
}

export function formatRecurrenceWeekday(recurrence: number[] | number | null | undefined): string {
  const days = normalizeRecurrenceWeekdays(recurrence);
  if (!days) return "לא קבועה";
  if (isEveryDayRecurrence(days)) return "כל יום";
  const sorted = [...new Set(days.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (sorted.length === 0) return "לא קבועה";
  if (sorted.length === 1) return `כל ${HE_DAYS[sorted[0]]}`;
  return sorted.map((d) => HE_DAY_LETTERS[d]).join(" · ");
}

/** אותיות קצרות לתג בכרטיס (למשל "אגה"); מעל 3 ימים — מספר */
export function formatRecurrenceDayBadge(recurrence: number[] | number | null | undefined): string {
  const days = normalizeRecurrenceWeekdays(recurrence);
  if (!days || isEveryDayRecurrence(days)) return "";
  const sorted = [...new Set(days.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  if (sorted.length >= 4) return String(sorted.length);
  return sorted.map((d) => HE_DAY_LETTERS[d].replace("׳", "")).join("");
}

export function selectedRecurrenceDays(recurrence: number[] | number | null | undefined): number[] {
  const days = normalizeRecurrenceWeekdays(recurrence);
  if (!days) return [];
  if (isEveryDayRecurrence(days)) return [...ALL_WEEKDAYS];
  return [...new Set(days.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
}

/** מחליף מצב יום בבחירה מרובה; מחזיר מערך מוכן לשמירה */
export function toggleRecurrenceDay(
  current: number[] | number | null | undefined,
  day: number,
): number[] {
  if (day < 0 || day > 6) return serializeRecurrenceWeekdays(selectedRecurrenceDays(current));

  if (isEveryDayRecurrence(current)) {
    // ביטול יום אחד מתוך "כל יום"
    return serializeRecurrenceWeekdays(ALL_WEEKDAYS.filter((d) => d !== day));
  }

  const selected = new Set(selectedRecurrenceDays(current));
  if (selected.has(day)) {
    if (selected.size <= 1) return [day]; // לפחות יום אחד
    selected.delete(day);
  } else {
    selected.add(day);
  }

  return serializeRecurrenceWeekdays([...selected]);
}

export function recurrenceSelectValue(recurrence: number[] | number | null): string {
  const days = normalizeRecurrenceWeekdays(recurrence);
  if (!days) return "none";
  if (isEveryDayRecurrence(days)) return String(RECURRENCE_EVERY_DAY);
  return days.slice().sort((a, b) => a - b).join(",");
}
