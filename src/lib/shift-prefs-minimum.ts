import { addDays } from "@/lib/db";

/** Sunday (0) through Thursday (4) — Israeli work week. */
export const SHIFT_PREFS_WEEKDAY_INDICES = [0, 1, 2, 3, 4] as const;
/** Friday (5) and Saturday (6). */
export const SHIFT_PREFS_WEEKEND_INDICES = [5, 6] as const;

export interface ShiftPrefsMinimumRules {
  minWeekdays: number | null;
  minWeekend: number | null;
}

export function hasShiftPrefsMinimumRules(rules: ShiftPrefsMinimumRules): boolean {
  return (rules.minWeekdays ?? 0) > 0 || (rules.minWeekend ?? 0) > 0;
}

/** A day is complete when every active shift template has a preference set. */
export function isShiftPrefsDayComplete(
  weekStart: string,
  dayIndex: number,
  templateIds: string[],
  prefMap: Map<string, "available" | "cannot">,
): boolean {
  if (templateIds.length === 0) return false;
  const date = addDays(weekStart, dayIndex);
  return templateIds.every((id) => prefMap.has(`${id}_${date}`));
}

export function countCompleteShiftPrefsDays(
  weekStart: string,
  dayIndices: readonly number[],
  templateIds: string[],
  prefMap: Map<string, "available" | "cannot">,
): number {
  return dayIndices.filter((i) => isShiftPrefsDayComplete(weekStart, i, templateIds, prefMap)).length;
}

export function getShiftPrefsMinimumStatus(
  weekStart: string,
  templateIds: string[],
  prefMap: Map<string, "available" | "cannot">,
  rules: ShiftPrefsMinimumRules,
) {
  const minWeekdays = rules.minWeekdays ?? 0;
  const minWeekend = rules.minWeekend ?? 0;
  const weekdayDone = countCompleteShiftPrefsDays(
    weekStart,
    SHIFT_PREFS_WEEKDAY_INDICES,
    templateIds,
    prefMap,
  );
  const weekendDone = countCompleteShiftPrefsDays(
    weekStart,
    SHIFT_PREFS_WEEKEND_INDICES,
    templateIds,
    prefMap,
  );
  const weekdayMet = minWeekdays === 0 || weekdayDone >= minWeekdays;
  const weekendMet = minWeekend === 0 || weekendDone >= minWeekend;
  return {
    minWeekdays,
    minWeekend,
    weekdayDone,
    weekendDone,
    weekdayMet,
    weekendMet,
    met: weekdayMet && weekendMet,
  };
}

export function formatShiftPrefsMinimumSummary(rules: ShiftPrefsMinimumRules): string {
  const parts: string[] = [];
  const w = rules.minWeekdays ?? 0;
  const e = rules.minWeekend ?? 0;
  if (w > 0) parts.push(`${w} ימים באמצע שבוע`);
  if (e > 0) parts.push(`${e} ימים בסופ״ש`);
  return parts.length > 0 ? parts.join(" · ") : "ללא דרישה";
}
