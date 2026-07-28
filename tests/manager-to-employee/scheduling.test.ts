/**
 * מה שהמנהל עושה → מה שקורה לעובד: סידור העבודה.
 *
 * המנהל משבץ, מגדיר מתי מגישים אילוצים וכמה ימים חובה, ומחליט אילו משמרות
 * קיימות בכלל. כל אחת מההחלטות האלה משנה ישירות את המסך של העובד — ולפעמים
 * חוסמת אותו. חוק יום החופש השבועי הוא חוק עבודה, ולכן נבדק לעומק.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_ASSIGNED_DAYS_PER_WEEK,
  WEEKLY_DAY_OFF_ERROR,
  assignedDatesInWeek,
  canAssignEmployeeOnDate,
  countAssignedDaysInWeek,
  weekStartFromDateISO,
} from "@/lib/shift-assignment-limits";
import { getShiftPrefsWindowStatus, isShiftPrefsOpenForWeek } from "@/lib/shift-deadline";
import { getShiftPrefsMinimumStatus, hasShiftPrefsMinimumRules } from "@/lib/shift-prefs-minimum";
import { DEFAULT_SHIFT_DEFINITIONS, sortShiftTemplates } from "@/lib/shiftTemplates";
import { getHebrewDayInfo } from "@/lib/hebrewCalendar";
import { addDays } from "@/lib/db";
import { TPL, USER, makeAssignment, makeBusiness, makeShiftTemplate } from "../helpers/factories";

/** שבוע היעד: ראשון 12/07/2026 → שבת 18/07/2026. */
const WEEK = "2026-07-12";
const days = (n: number) => addDays(WEEK, n);

/** משבץ עובד ל-n ימים רצופים מתחילת השבוע. */
function assignDays(count: number, employeeId = USER.employee) {
  return Array.from({ length: count }, (_, i) =>
    makeAssignment({ employee_id: employeeId, shift_date: days(i), shift_template_id: TPL.morning }),
  );
}

describe("חוק יום החופש — המנהל לא יכול לשבץ 7 ימים", () => {
  it("התקרה היא 6 ימים בשבוע", () => {
    expect(MAX_ASSIGNED_DAYS_PER_WEEK).toBe(6);
  });

  it("שיבוץ ליום השביעי נחסם", () => {
    const existing = assignDays(6);
    expect(countAssignedDaysInWeek(existing, USER.employee, WEEK)).toBe(6);
    expect(canAssignEmployeeOnDate(existing, USER.employee, days(6))).toBe(false);
  });

  it("עד 6 ימים — מותר", () => {
    const existing = assignDays(5);
    expect(canAssignEmployeeOnDate(existing, USER.employee, days(5))).toBe(true);
  });

  it("משמרת שנייה באותו יום לא נחשבת יום נוסף", () => {
    const existing = assignDays(6);
    const secondShiftSameDay = days(3);
    expect(canAssignEmployeeOnDate(existing, USER.employee, secondShiftSameDay)).toBe(true);
  });

  it("שלוש משמרות באותו יום עדיין יום אחד", () => {
    const sameDay = [
      makeAssignment({ shift_date: days(0), shift_template_id: TPL.morning }),
      makeAssignment({ shift_date: days(0), shift_template_id: TPL.afternoon }),
      makeAssignment({ shift_date: days(0), shift_template_id: TPL.evening }),
    ];
    expect(countAssignedDaysInWeek(sameDay, USER.employee, WEEK)).toBe(1);
  });

  it("התקרה היא לכל עובד בנפרד — עובד אחר לא מושפע", () => {
    const existing = assignDays(6, USER.employee);
    expect(canAssignEmployeeOnDate(existing, USER.employee2, days(6))).toBe(true);
  });

  it("השבוע נחתך בראשון — שיבוץ בשבוע הבא פותח מכסה חדשה", () => {
    const existing = assignDays(6);
    const nextSunday = days(7);
    expect(weekStartFromDateISO(nextSunday)).toBe(nextSunday);
    expect(canAssignEmployeeOnDate(existing, USER.employee, nextSunday)).toBe(true);
  });

  it("שיבוצים משבוע קודם לא נספרים לשבוע הנוכחי", () => {
    const lastWeek = [makeAssignment({ shift_date: addDays(WEEK, -3) })];
    expect(assignedDatesInWeek(lastWeek, USER.employee, WEEK).size).toBe(0);
  });

  it("ההודעה שהמנהל רואה מסבירה שזו דרישת חוק", () => {
    expect(WEEKLY_DAY_OFF_ERROR).toContain("6 ימים");
    expect(WEEKLY_DAY_OFF_ERROR).toContain("יום חופש");
  });

  it("כל יום בשבוע מתמפה לראשון הנכון", () => {
    for (let i = 0; i < 7; i++) {
      expect(weekStartFromDateISO(days(i))).toBe(WEEK);
    }
  });
});

describe("המנהל קובע חלון הגשת אילוצים — והעובד חסום או פתוח", () => {
  const openWindow = makeBusiness({
    shift_prefs_open_dow: 6,
    shift_prefs_open_time: "21:00:00",
    shift_prefs_deadline_dow: 3,
    shift_prefs_deadline_time: "20:00:00",
  });

  const statusAt = (business: ReturnType<typeof makeBusiness>, iso: string) =>
    getShiftPrefsWindowStatus(
      WEEK,
      business.shift_prefs_deadline_dow,
      business.shift_prefs_deadline_time,
      business.shift_prefs_open_dow,
      business.shift_prefs_open_time,
      new Date(iso),
    );

  it("בלי הגדרה — העובד יכול להגיש תמיד", () => {
    const noRules = makeBusiness();
    expect(statusAt(noRules, "2026-07-08T10:00:00").state).toBe("unlimited");
    expect(
      isShiftPrefsOpenForWeek(WEEK, noRules.shift_prefs_deadline_dow, noRules.shift_prefs_deadline_time),
    ).toBe(true);
  });

  it("לפני הפתיחה — העובד רואה «טרם נפתח»", () => {
    expect(statusAt(openWindow, "2026-07-04T18:00:00").state).toBe("not_yet_open");
  });

  it("בתוך החלון — העובד יכול להגיש", () => {
    expect(statusAt(openWindow, "2026-07-06T12:00:00").state).toBe("open");
  });

  it("אחרי הסגירה — העובד נחסם", () => {
    expect(statusAt(openWindow, "2026-07-08T20:00:01").state).toBe("closed");
  });

  it("המנהל מזיז את מועד הסגירה — עובד שהיה חסום נפתח שוב", () => {
    const at = "2026-07-08T21:00:00";
    expect(statusAt(openWindow, at).state).toBe("closed");

    const extended = { ...openWindow, shift_prefs_deadline_dow: 4 }; // נדחה ליום חמישי
    expect(statusAt(extended, at).state).toBe("open");
  });

  it("המנהל מבטל את החלון — הכול נפתח מיד", () => {
    const cancelled = { ...openWindow, shift_prefs_deadline_dow: null, shift_prefs_deadline_time: null };
    expect(statusAt(cancelled, "2026-07-20T10:00:00").state).toBe("unlimited");
  });
});

describe("המנהל דורש מינימום ימי זמינות", () => {
  const templates = [TPL.morning, TPL.evening];

  function prefsFor(dayIndices: number[]) {
    const map = new Map<string, "available" | "cannot">();
    for (const i of dayIndices) {
      for (const id of templates) map.set(`${id}_${days(i)}`, "available");
    }
    return map;
  }

  it("בלי דרישה — כל הגשה מתקבלת", () => {
    const business = makeBusiness();
    expect(
      hasShiftPrefsMinimumRules({
        minWeekdays: business.shift_prefs_min_weekdays,
        minWeekend: business.shift_prefs_min_weekend,
      }),
    ).toBe(false);
  });

  it("דרישה של 3 ימי אמצע שבוע + 1 סופ״ש — הגשה חלקית לא עומדת בה", () => {
    const rules = { minWeekdays: 3, minWeekend: 1 };
    const partial = getShiftPrefsMinimumStatus(WEEK, templates, prefsFor([0, 1]), rules);
    expect(partial.met).toBe(false);
    expect(partial.weekdayDone).toBe(2);
    expect(partial.weekendDone).toBe(0);
  });

  it("השלמת הימים החסרים פותחת את ההגשה", () => {
    const rules = { minWeekdays: 3, minWeekend: 1 };
    const full = getShiftPrefsMinimumStatus(WEEK, templates, prefsFor([0, 1, 2, 5]), rules);
    expect(full.met).toBe(true);
  });

  it("סימון חלקי של יום (רק משמרת אחת מתוך שתיים) לא נחשב יום מלא", () => {
    const partialDay = new Map<string, "available" | "cannot">([[`${TPL.morning}_${days(0)}`, "available"]]);
    const status = getShiftPrefsMinimumStatus(WEEK, templates, partialDay, { minWeekdays: 1, minWeekend: 0 });
    expect(status.met).toBe(false);
  });

  it("המנהל מוסיף משמרת שלישית — ימים שהיו מלאים חוזרים להיות חלקיים", () => {
    const rules = { minWeekdays: 2, minWeekend: 0 };
    const prefs = prefsFor([0, 1]);
    expect(getShiftPrefsMinimumStatus(WEEK, templates, prefs, rules).met).toBe(true);

    const withThird = [...templates, TPL.afternoon];
    expect(getShiftPrefsMinimumStatus(WEEK, withThird, prefs, rules).met).toBe(false);
  });

  it("דרישה גדולה ממספר הימים הקיימים חוסמת את העובד לצמיתות", () => {
    const status = getShiftPrefsMinimumStatus(WEEK, templates, prefsFor([0, 1, 2, 3]), {
      minWeekdays: 5,
      minWeekend: 0,
    });
    expect(status.weekdayMet).toBe(false);
  });
});

describe("המנהל מגדיר אילו משמרות קיימות", () => {
  it("ארבע משמרות ברירת מחדל, לילה כבויה מלכתחילה", () => {
    expect(DEFAULT_SHIFT_DEFINITIONS.map((d) => d.key)).toEqual(["morning", "afternoon", "evening", "night"]);
    expect(DEFAULT_SHIFT_DEFINITIONS.find((d) => d.key === "night")?.activeDefault).toBe(false);
  });

  it("המשמרות מוצגות לעובד לפי שעת ההתחלה", () => {
    const shuffled = [
      makeShiftTemplate({ id: TPL.evening, start_time: "18:00", sort_order: 5, shift_key: "evening" }),
      makeShiftTemplate({ id: TPL.morning, start_time: "08:00", sort_order: 9, shift_key: "morning" }),
      makeShiftTemplate({ id: TPL.afternoon, start_time: "11:00", sort_order: 1, shift_key: "afternoon" }),
    ];
    expect(sortShiftTemplates(shuffled).map((t) => t.id)).toEqual([TPL.morning, TPL.afternoon, TPL.evening]);
  });

  it("שתי משמרות באותה שעה נחתכות לפי הסדר המובנה", () => {
    const same = [
      makeShiftTemplate({ id: "b", start_time: "08:00", shift_key: "afternoon", sort_order: 0 }),
      makeShiftTemplate({ id: "a", start_time: "08:00", shift_key: "morning", sort_order: 0 }),
    ];
    expect(sortShiftTemplates(same).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("משמרת בלי shift_key נדחפת לסוף", () => {
    const mixed = [
      makeShiftTemplate({ id: "custom", start_time: "08:00", shift_key: null, sort_order: 0 }),
      makeShiftTemplate({ id: "morning", start_time: "08:00", shift_key: "morning", sort_order: 1 }),
    ];
    expect(sortShiftTemplates(mixed).map((t) => t.id)).toEqual(["morning", "custom"]);
  });

  it("המיון אינו משנה את המערך המקורי", () => {
    const original = [
      makeShiftTemplate({ id: "b", start_time: "18:00" }),
      makeShiftTemplate({ id: "a", start_time: "08:00" }),
    ];
    sortShiftTemplates(original);
    expect(original.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("רשימה ריקה לא קורסת", () => {
    expect(sortShiftTemplates([])).toEqual([]);
  });
});

describe("לוח השנה שהמנהל והעובד רואים", () => {
  it("חג מסומן כיום מיוחד בסידור", () => {
    const pesach = getHebrewDayInfo("2026-04-02");
    expect(pesach.holiday).toBeTruthy();
    expect(pesach.isMajor).toBe(true);
  });

  it("יום רגיל מקבל תאריך עברי בלי חג", () => {
    const plain = getHebrewDayInfo("2026-07-08");
    expect(plain.holiday).toBeNull();
    expect(plain.hebrewDate).toBeTruthy();
  });

  it("כל יום בשבוע היעד מקבל תאריך עברי", () => {
    for (let i = 0; i < 7; i++) {
      expect(getHebrewDayInfo(days(i)).hebrewDate).toBeTruthy();
    }
  });
});
