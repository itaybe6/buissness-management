import { addDays, formatDateShort, HE_DAYS } from "@/lib/db";

export type ShiftPrefsWindowState = "unlimited" | "open" | "not_yet_open" | "closed";

export interface ShiftPrefsWindowStatus {
  state: ShiftPrefsWindowState;
  opensAt?: Date;
  closesAt?: Date;
}

function windowDayDate(prevWeekStart: string, dow: number, closeDow: number, role: "open" | "close"): string {
  if (role === "close") return addDays(prevWeekStart, dow);
  if (dow > closeDow) return addDays(prevWeekStart, dow - 7);
  return addDays(prevWeekStart, dow);
}

function windowDateTime(
  targetWeekStart: string,
  dow: number,
  time: string,
  closeDow: number,
  role: "open" | "close",
  now = new Date()
): Date {
  const prevWeekStart = addDays(targetWeekStart, -7);
  const dateIso = windowDayDate(prevWeekStart, dow, closeDow, role);
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  const dt = new Date(now);
  dt.setFullYear(
    Number(dateIso.slice(0, 4)),
    Number(dateIso.slice(5, 7)) - 1,
    Number(dateIso.slice(8, 10))
  );
  dt.setHours(h, m, 0, 0);
  return dt;
}

/** When submissions close for a target week (Sunday ISO). */
export function shiftPrefsCloseAt(
  targetWeekStart: string,
  closeDow: number,
  closeTime: string,
  now = new Date()
): Date {
  return windowDateTime(targetWeekStart, closeDow, closeTime, closeDow, "close", now);
}

/** @deprecated use shiftPrefsCloseAt */
export const shiftPrefsDeadlineAt = shiftPrefsCloseAt;

/** When submissions open for a target week. Requires closeDow for Saturday-before-week logic. */
export function shiftPrefsOpenAt(
  targetWeekStart: string,
  openDow: number,
  openTime: string,
  closeDow: number,
  now = new Date()
): Date {
  return windowDateTime(targetWeekStart, openDow, openTime, closeDow, "open", now);
}

export function getShiftPrefsWindowStatus(
  targetWeekStart: string,
  closeDow: number | null | undefined,
  closeTime: string | null | undefined,
  openDow?: number | null,
  openTime?: string | null,
  now = new Date()
): ShiftPrefsWindowStatus {
  if (closeDow == null || closeTime == null) {
    return { state: "unlimited" };
  }

  const closesAt = shiftPrefsCloseAt(targetWeekStart, closeDow, closeTime, now);

  if (now >= closesAt) {
    return { state: "closed", closesAt };
  }

  if (openDow != null && openTime != null) {
    const opensAt = shiftPrefsOpenAt(targetWeekStart, openDow, openTime, closeDow, now);
    if (now < opensAt) {
      return { state: "not_yet_open", opensAt, closesAt };
    }
    return { state: "open", opensAt, closesAt };
  }

  return { state: "open", closesAt };
}

export function isShiftPrefsOpenForWeek(
  targetWeekStart: string,
  closeDow: number | null | undefined,
  closeTime: string | null | undefined,
  openDow?: number | null,
  openTime?: string | null,
  now = new Date()
): boolean {
  const status = getShiftPrefsWindowStatus(
    targetWeekStart,
    closeDow,
    closeTime,
    openDow,
    openTime,
    now
  );
  return status.state === "open" || status.state === "unlimited";
}

export function formatShiftPrefsClose(
  targetWeekStart: string,
  closeDow: number,
  closeTime: string
): string {
  const prevWeekStart = addDays(targetWeekStart, -7);
  const deadlineDate = addDays(prevWeekStart, closeDow);
  const hm = closeTime.slice(0, 5);
  return `${HE_DAYS[closeDow]} ${formatDateShort(deadlineDate)} · ${hm}`;
}

/** @deprecated use formatShiftPrefsClose */
export const formatShiftPrefsDeadline = formatShiftPrefsClose;

export function formatShiftPrefsOpen(
  targetWeekStart: string,
  openDow: number,
  openTime: string,
  closeDow: number
): string {
  const prevWeekStart = addDays(targetWeekStart, -7);
  const openDate = windowDayDate(prevWeekStart, openDow, closeDow, "open");
  const hm = openTime.slice(0, 5);
  return `${HE_DAYS[openDow]} ${formatDateShort(openDate)} · ${hm}`;
}

export function formatShiftPrefsCloseRule(closeDow: number, closeTime: string): string {
  const hm = closeTime.slice(0, 5);
  return `עד ${HE_DAYS[closeDow]} בשעה ${hm}`;
}

/** @deprecated use formatShiftPrefsCloseRule */
export const formatShiftPrefsDeadlineRule = formatShiftPrefsCloseRule;

export function formatShiftPrefsOpenRule(openDow: number, openTime: string): string {
  const hm = openTime.slice(0, 5);
  return `מ${HE_DAYS[openDow]} בשעה ${hm}`;
}

export function formatShiftPrefsWindowRule(
  openDow: number,
  openTime: string,
  closeDow: number,
  closeTime: string
): string {
  const openHm = openTime.slice(0, 5);
  const closeHm = closeTime.slice(0, 5);
  return `${HE_DAYS[openDow]} ${openHm} – ${HE_DAYS[closeDow]} ${closeHm}`;
}
