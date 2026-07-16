import { HebrewCalendar, HDate, flags } from "@hebcal/core";

/** Flags that matter when building a weekly shift schedule (Israel). */
const SCHEDULE_MASK =
  flags.CHAG |
  flags.MAJOR_FAST |
  flags.CHOL_HAMOED |
  flags.EREV |
  flags.MINOR_HOLIDAY |
  flags.MODERN_HOLIDAY |
  flags.MINOR_FAST;

/** Modern Israeli observances that commonly affect staffing. */
const MODERN_KEEP = new Set([
  "Yom HaShoah",
  "Yom HaZikaron",
  "Yom HaAtzma'ut",
  "Yom Yerushalayim",
]);

const LOCALE = "he-x-NoNikud";

export type HebrewDayInfo = {
  /** Short Hebrew date, e.g. ט״ו ניסן */
  hebrewDate: string;
  /** Primary holiday / observance label for the day, if any */
  holiday: string | null;
  /** True for yom tov, major fasts, and key national days */
  isMajor: boolean;
};

function localDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

function shortHebrewDate(hd: HDate): string {
  const full = hd.renderGematriya(true);
  const parts = full.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
  return full;
}

function cleanHolidayLabel(desc: string, rendered: string): string {
  if (desc.startsWith("Chanukah")) return "חנוכה";
  // "ראש השנה 5787" → "ראש השנה"
  return rendered.replace(/\s+\d{3,4}$/, "").trim();
}

function isRelevantEvent(desc: string, eventFlags: number): boolean {
  if (eventFlags & flags.YOM_KIPPUR_KATAN) return false;
  if (eventFlags & flags.ROSH_CHODESH) return false;
  if (eventFlags & flags.SPECIAL_SHABBAT) return false;
  if (eventFlags & flags.OMER_COUNT) return false;
  if (!(eventFlags & SCHEDULE_MASK)) return false;
  if (eventFlags & flags.MODERN_HOLIDAY && !(eventFlags & flags.CHAG)) {
    return MODERN_KEEP.has(desc);
  }
  // Skip fringe minor observances that clutter scheduling.
  if (desc === "Leil Selichot" || desc === "Chag HaBanot" || desc === "Rosh Hashana LaBehemot") {
    return false;
  }
  return true;
}

function isMajorEvent(eventFlags: number, desc: string): boolean {
  if (eventFlags & (flags.CHAG | flags.MAJOR_FAST)) return true;
  if (desc === "Yom HaAtzma'ut" || desc === "Yom HaZikaron") return true;
  return false;
}

/** Higher = more useful when several observances fall on the same civil day. */
function eventPriority(eventFlags: number, desc: string): number {
  if (isMajorEvent(eventFlags, desc)) return 100;
  if (eventFlags & flags.CHOL_HAMOED) return 80;
  if (eventFlags & flags.EREV) return 70;
  if (eventFlags & flags.MODERN_HOLIDAY) return 60;
  if (eventFlags & flags.MINOR_HOLIDAY) return 50;
  if (eventFlags & flags.MINOR_FAST) return 40;
  return 0;
}

/**
 * Hebrew calendar info for a Gregorian ISO date (yyyy-mm-dd), Israel schedule.
 * Uses the local civil day (business calendar), not UTC.
 */
export function getHebrewDayInfo(isoDate: string): HebrewDayInfo {
  const date = localDate(isoDate);
  const hd = new HDate(date);
  const events = HebrewCalendar.getHolidaysOnDate(date, true) ?? [];

  let holiday: string | null = null;
  let isMajor = false;
  let bestPriority = -1;

  for (const ev of events) {
    const eventFlags = ev.getFlags();
    const desc = ev.getDesc();
    if (!isRelevantEvent(desc, eventFlags)) continue;

    const priority = eventPriority(eventFlags, desc);
    if (priority < bestPriority) continue;

    holiday = cleanHolidayLabel(desc, ev.render(LOCALE));
    isMajor = isMajorEvent(eventFlags, desc);
    bestPriority = priority;
  }

  return {
    hebrewDate: shortHebrewDate(hd),
    holiday,
    isMajor,
  };
}

/** Convenience: holiday label only. */
export function getHolidayForDate(isoDate: string): string | null {
  return getHebrewDayInfo(isoDate).holiday;
}
