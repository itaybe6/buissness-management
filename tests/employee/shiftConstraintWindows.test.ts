/**
 * הגשת אילוצים במודל השורות.
 *
 * העובד מסמן "יכול / לא יכול" לפי טווח שעות ביום, לא לפי שורה. כך שתי שורות
 * "אירוח ערב" זהות הן בחירה אחת, והסימון חל על כל שורה עם אותו טווח.
 * כאן נבדקים מקרי הקצה: שניות מהמסד, שורות כפולות, שעות שונות לפי יום,
 * משמרת לילה, עריכת/מחיקת שורות אחרי הגשה, ודרישת המינימום.
 */
import { describe, expect, it } from "vitest";
import {
  buildEmployeePrefMap,
  buildTeamPrefMap,
  normalizeAvailability,
  rowPref,
} from "@/lib/shiftRows";
import { getShiftPrefsMinimumStatus, isShiftPrefsDayComplete } from "@/lib/shift-prefs-minimum";
import { templatesForEmployee } from "@/lib/shiftTemplates";
import { weekWindows, windowKey, windowsOnDay } from "@/lib/shiftTemplateHours";
import type { ShiftTemplate } from "@/types/database";
import { DEPT, USER, makePreference, makeShiftTemplate } from "../helpers/factories";

/** שבוע היעד: ראשון 12/07/2026 */
const WK = "2026-07-12";
const SUN = "2026-07-12";
const MON = "2026-07-13";
const FRI = "2026-07-17";
const SAT = "2026-07-18";

function row(id: string, name: string, start: string, end: string, over: Partial<ShiftTemplate> = {}) {
  return makeShiftTemplate({ id, name, start_time: start, end_time: end, department_id: DEPT.service, shift_key: null, ...over });
}

/** שורה שרצה רק בימים שצוינו, בשעות שצוינו לכל יום. */
function rowOnDays(id: string, name: string, days: Record<number, [string, string]>) {
  const entries = Object.entries(days).map(([d, [s, e]]) => ({ day_of_week: Number(d), start_time: s, end_time: e }));
  return row(id, name, entries[0].start_time, entries[0].end_time, { days: entries });
}

const host1 = row("host-1", "אירוח ערב", "19:30", "23:30");
const host2 = row("host-2", "אירוח ערב", "19:30", "23:30");
const host3 = row("host-3", "אירוח ערב", "19:30", "23:30");
const lateHost = row("late", "אירוח ערב", "20:00", "00:00");
const trainee = row("trainee", "מתלמד אירוח", "19:00", "00:00");

describe("normalizeAvailability", () => {
  it("'מעדיף' הישן נחשב 'יכול'", () => {
    expect(normalizeAvailability("prefer")).toBe("available");
  });

  it("'יכול' ו'לא יכול' נשארים כמו שהם", () => {
    expect(normalizeAvailability("available")).toBe("available");
    expect(normalizeAvailability("cannot")).toBe("cannot");
  });

  it("ערך חסר לא נחשב סימון", () => {
    expect(normalizeAvailability(undefined)).toBeNull();
    expect(normalizeAvailability(null)).toBeNull();
  });
});

describe("טווחי שעות ליום — מה העובד רואה", () => {
  it("שלוש שורות זהות = בחירה אחת", () => {
    const windows = windowsOnDay([host1, host2, host3], 0);
    expect(windows).toHaveLength(1);
    expect(windows[0].key).toBe("19:30-23:30");
  });

  it("אותו שם בשעות שונות = שתי בחירות", () => {
    expect(windowsOnDay([host1, lateHost], 0).map((w) => w.key)).toEqual(["19:30-23:30", "20:00-00:00"]);
  });

  it("הטווחים ממוינים לפי שעת התחלה", () => {
    expect(windowsOnDay([lateHost, trainee, host1], 0).map((w) => w.start)).toEqual(["19:00", "19:30", "20:00"]);
  });

  it("שם שחוזר באותו טווח לא מוכפל בכותרת", () => {
    expect(windowsOnDay([host1, host2], 0)[0].names).toEqual(["אירוח ערב"]);
  });

  it("אין שורות — אין מה להגיש", () => {
    expect(windowsOnDay([], 0)).toEqual([]);
    expect(weekWindows([])).toEqual([]);
  });

  it("שורה עם שעות שונות בשישי יוצרת טווח נפרד רק בשישי", () => {
    const r = rowOnDays("r", "אירוח", { 0: ["19:30", "23:30"], 5: ["12:00", "17:00"] });
    expect(windowsOnDay([r], 0).map((w) => w.key)).toEqual(["19:30-23:30"]);
    expect(windowsOnDay([r], 5).map((w) => w.key)).toEqual(["12:00-17:00"]);
    expect(windowsOnDay([r], 3)).toEqual([]);
    expect(weekWindows([r]).map((w) => w.key)).toEqual(["12:00-17:00", "19:30-23:30"]);
  });

  it("משמרת לילה שחוצה חצות היא טווח רגיל", () => {
    const night = row("night", "סגירה", "22:00", "02:00");
    expect(windowsOnDay([night], 6)[0].key).toBe("22:00-02:00");
  });

  it("עובד בלי מחלקה לא מקבל שורות להגשה", () => {
    expect(templatesForEmployee([host1], null)).toEqual([]);
    expect(templatesForEmployee([host1], undefined)).toEqual([]);
  });

  it("עובד רואה רק את השורות של המחלקה שלו", () => {
    const bar = row("bar", "בר", "18:00", "02:00", { department_id: DEPT.bar });
    expect(templatesForEmployee([host1, bar], DEPT.bar).map((t) => t.id)).toEqual(["bar"]);
  });
});

describe("מפת האילוצים של העובד", () => {
  it("שניות מהמסד ובלי שניות — אותו מפתח", () => {
    const m = buildEmployeePrefMap([makePreference({ shift_date: MON, start_time: "19:30:00", end_time: "23:30:00" })]);
    expect(m.get(`${windowKey("19:30", "23:30")}_${MON}`)).toBe("available");
  });

  it("אותו טווח בימים שונים נשמר בנפרד", () => {
    const m = buildEmployeePrefMap([
      makePreference({ shift_date: SUN, start_time: "19:30", end_time: "23:30", preference: "available" }),
      makePreference({ shift_date: MON, start_time: "19:30", end_time: "23:30", preference: "cannot" }),
    ]);
    expect(m.get(`19:30-23:30_${SUN}`)).toBe("available");
    expect(m.get(`19:30-23:30_${MON}`)).toBe("cannot");
  });

  it("שורה ישנה בלי שעות (לפני העדכון) מדולגת ולא מפילה את המסך", () => {
    const legacy = { ...makePreference({ shift_date: MON }), start_time: null as unknown as string };
    expect(buildEmployeePrefMap([legacy]).size).toBe(0);
  });
});

describe("האילוץ חל על כל שורה עם אותן שעות", () => {
  const prefs = buildTeamPrefMap([
    makePreference({ employee_id: USER.employee, shift_date: MON, start_time: "19:30:00", end_time: "23:30:00", preference: "cannot" }),
    makePreference({ employee_id: USER.employee2, shift_date: MON, start_time: "20:00:00", end_time: "00:00:00", preference: "available" }),
  ]);

  it("'לא יכול' אחד מסמן את שלוש השורות הזהות", () => {
    for (const r of [host1, host2, host3]) expect(rowPref(prefs, USER.employee, r, MON)).toBe("cannot");
  });

  it("לא דולף לשורה עם שעות אחרות באותו יום", () => {
    expect(rowPref(prefs, USER.employee, lateHost, MON)).toBeUndefined();
  });

  it("לא דולף ליום אחר", () => {
    expect(rowPref(prefs, USER.employee, host1, SUN)).toBeUndefined();
  });

  it("לא דולף לעובד אחר", () => {
    expect(rowPref(prefs, USER.employee2, host1, MON)).toBeUndefined();
    expect(rowPref(prefs, USER.employee2, lateHost, MON)).toBe("available");
  });

  it("שורה שלא פעילה ביום הזה — אין אילוץ", () => {
    const sundayOnly = rowOnDays("sun", "אירוח ערב", { 0: ["19:30", "23:30"] });
    expect(rowPref(prefs, USER.employee, sundayOnly, MON)).toBeUndefined();
  });

  it("שכפול שורה אחרי ההגשה — השורה החדשה כבר מכירה את האילוץ", () => {
    const duplicated = { ...host1, id: "host-copy" };
    expect(rowPref(prefs, USER.employee, duplicated, MON)).toBe("cannot");
  });

  it("מחיקת שורה לא מוחקת את האילוץ לשורות שנשארו", () => {
    const remaining = [host2, host3];
    expect(remaining.every((r) => rowPref(prefs, USER.employee, r, MON) === "cannot")).toBe(true);
  });

  it("שינוי שעות השורה אחרי ההגשה — האילוץ הישן כבר לא חל (העובד סימן שעות אחרות)", () => {
    const moved = { ...host1, start_time: "18:00", end_time: "22:00" };
    expect(rowPref(prefs, USER.employee, moved, MON)).toBeUndefined();
  });

  it("שעות שונות לפי יום — האילוץ נבדק מול השעות של אותו יום", () => {
    const friPrefs = buildTeamPrefMap([
      makePreference({ employee_id: USER.employee, shift_date: FRI, start_time: "12:00", end_time: "17:00", preference: "available" }),
    ]);
    const r = rowOnDays("r", "אירוח", { 1: ["19:30", "23:30"], 5: ["12:00", "17:00"] });
    expect(rowPref(friPrefs, USER.employee, r, FRI)).toBe("available");
    expect(rowPref(friPrefs, USER.employee, r, MON)).toBeUndefined();
  });

  it("משמרת לילה — האילוץ שייך ליום שבו המשמרת מתחילה", () => {
    const night = row("night", "סגירה", "22:00", "02:00");
    const p = buildTeamPrefMap([
      makePreference({ employee_id: USER.employee, shift_date: SAT, start_time: "22:00", end_time: "02:00", preference: "cannot" }),
    ]);
    expect(rowPref(p, USER.employee, night, SAT)).toBe("cannot");
    expect(rowPref(p, USER.employee, night, "2026-07-19")).toBeUndefined();
  });
});

describe("יום מלא ודרישת מינימום — לפי טווחים", () => {
  const rows = [host1, host2, lateHost];
  const idsFor = (dayIndex: number) => windowsOnDay(rows, dayIndex).map((w) => w.key);

  it("יום עם שתי שורות זהות מתמלא בסימון אחד לכל טווח", () => {
    const m = buildEmployeePrefMap([
      makePreference({ shift_date: SUN, start_time: "19:30", end_time: "23:30" }),
      makePreference({ shift_date: SUN, start_time: "20:00", end_time: "00:00", preference: "cannot" }),
    ]);
    expect(isShiftPrefsDayComplete(WK, 0, idsFor(0), m)).toBe(true);
  });

  it("סימון חלקי לא נחשב יום מלא", () => {
    const m = buildEmployeePrefMap([makePreference({ shift_date: SUN, start_time: "19:30", end_time: "23:30" })]);
    expect(isShiftPrefsDayComplete(WK, 0, idsFor(0), m)).toBe(false);
  });

  it("גם 'לא יכול' ממלא את היום", () => {
    const m = buildEmployeePrefMap([
      makePreference({ shift_date: SUN, start_time: "19:30", end_time: "23:30", preference: "cannot" }),
      makePreference({ shift_date: SUN, start_time: "20:00", end_time: "00:00", preference: "cannot" }),
    ]);
    expect(isShiftPrefsDayComplete(WK, 0, idsFor(0), m)).toBe(true);
  });

  it("יום בלי שורות פעילות נחשב מלא לצורך המינימום", () => {
    const weekdaysOnly = [rowOnDays("r", "אירוח", { 0: ["19:30", "23:30"], 1: ["19:30", "23:30"] })];
    const ids = (i: number) => windowsOnDay(weekdaysOnly, i).map((w) => w.key);
    const m = buildEmployeePrefMap([
      makePreference({ shift_date: SUN, start_time: "19:30", end_time: "23:30" }),
      makePreference({ shift_date: MON, start_time: "19:30", end_time: "23:30" }),
    ]);
    const status = getShiftPrefsMinimumStatus(WK, ids, m, { minWeekdays: 4, minWeekend: 3 });
    expect(status.weekdayDone).toBe(4);
    expect(status.weekendDone).toBe(3);
    expect(status.met).toBe(true);
  });

  it("חסר סופ״ש — המינימום לא מתקיים", () => {
    const m = buildEmployeePrefMap(
      [SUN, MON, "2026-07-14", "2026-07-15"].flatMap((d) => [
        makePreference({ shift_date: d, start_time: "19:30", end_time: "23:30" }),
        makePreference({ shift_date: d, start_time: "20:00", end_time: "00:00" }),
      ]),
    );
    const status = getShiftPrefsMinimumStatus(WK, idsFor, m, { minWeekdays: 3, minWeekend: 1 });
    expect(status.weekdayMet).toBe(true);
    expect(status.weekendMet).toBe(false);
    expect(status.met).toBe(false);
  });

  it("שורה כפולה שנוספה אחרי ההגשה לא פותחת מחדש יום שכבר מלא", () => {
    const m = buildEmployeePrefMap([
      makePreference({ shift_date: SUN, start_time: "19:30", end_time: "23:30" }),
      makePreference({ shift_date: SUN, start_time: "20:00", end_time: "00:00" }),
    ]);
    const withCopy = [...rows, { ...host1, id: "host-copy" }];
    const ids = windowsOnDay(withCopy, 0).map((w) => w.key);
    expect(isShiftPrefsDayComplete(WK, 0, ids, m)).toBe(true);
  });

  it("שורה חדשה בשעות חדשות כן פותחת את היום מחדש", () => {
    const m = buildEmployeePrefMap([
      makePreference({ shift_date: SUN, start_time: "19:30", end_time: "23:30" }),
      makePreference({ shift_date: SUN, start_time: "20:00", end_time: "00:00" }),
    ]);
    const ids = windowsOnDay([...rows, row("early", "פתיחה", "17:00", "21:00")], 0).map((w) => w.key);
    expect(isShiftPrefsDayComplete(WK, 0, ids, m)).toBe(false);
  });
});
