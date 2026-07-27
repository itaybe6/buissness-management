/**
 * ממשק העובד — הגשת אילוצים לשבוע הבא.
 *
 * שני מנגנונים נבדקים כאן:
 *   1. חלון ההגשה — מתי נפתח, מתי נסגר, ומה קורה בדיוק על הגבול.
 *   2. דרישת המינימום — כמה ימים באמצע השבוע ובסופ״ש חייבים להיות מלאים.
 */
import { describe, expect, it } from "vitest";
import {
  formatShiftPrefsClose,
  formatShiftPrefsCloseRule,
  formatShiftPrefsOpen,
  formatShiftPrefsOpenRule,
  formatShiftPrefsWindowRule,
  getShiftPrefsWindowStatus,
  isShiftPrefsOpenForWeek,
  shiftPrefsCloseAt,
  shiftPrefsOpenAt,
} from "@/lib/shift-deadline";
import {
  SHIFT_PREFS_WEEKDAY_INDICES,
  SHIFT_PREFS_WEEKEND_INDICES,
  countCompleteShiftPrefsDays,
  formatShiftPrefsMinimumSummary,
  getShiftPrefsMinimumStatus,
  hasShiftPrefsMinimumRules,
  isShiftPrefsDayComplete,
} from "@/lib/shift-prefs-minimum";
import { TPL } from "../helpers/factories";

/** שבוע היעד: ראשון 12/07/2026. שבוע ההגשה שלפניו מתחיל 05/07/2026. */
const TARGET_WEEK = "2026-07-12";

const WED = 3;
const SAT = 6;
const SUN = 0;

function at(iso: string): Date {
  return new Date(iso);
}

describe("חלון ההגשה — ללא הגבלה", () => {
  it("בלי יום סגירה החלון פתוח תמיד", () => {
    expect(getShiftPrefsWindowStatus(TARGET_WEEK, null, null).state).toBe("unlimited");
    expect(isShiftPrefsOpenForWeek(TARGET_WEEK, null, null)).toBe(true);
  });

  it("יום סגירה בלי שעה נחשב ללא הגבלה (הגדרה חלקית לא נועלת עובדים)", () => {
    expect(getShiftPrefsWindowStatus(TARGET_WEEK, WED, null).state).toBe("unlimited");
  });

  it("שעה בלי יום נחשבת ללא הגבלה", () => {
    expect(getShiftPrefsWindowStatus(TARGET_WEEK, null, "20:00:00").state).toBe("unlimited");
  });
});

describe("חלון ההגשה — מועד הסגירה", () => {
  it("נסגר ביום רביעי שלפני שבוע היעד", () => {
    const closesAt = shiftPrefsCloseAt(TARGET_WEEK, WED, "20:00:00", at("2026-07-06T10:00:00"));
    expect(closesAt.getFullYear()).toBe(2026);
    expect(closesAt.getMonth()).toBe(6); // יולי
    expect(closesAt.getDate()).toBe(8); // רביעי 08/07
    expect(closesAt.getHours()).toBe(20);
    expect(closesAt.getMinutes()).toBe(0);
  });

  it("דקה לפני הסגירה עדיין פתוח", () => {
    const status = getShiftPrefsWindowStatus(TARGET_WEEK, WED, "20:00:00", null, null, at("2026-07-08T19:59:00"));
    expect(status.state).toBe("open");
  });

  it("בדיוק בשנייה של הסגירה — סגור", () => {
    const status = getShiftPrefsWindowStatus(TARGET_WEEK, WED, "20:00:00", null, null, at("2026-07-08T20:00:00"));
    expect(status.state).toBe("closed");
    expect(isShiftPrefsOpenForWeek(TARGET_WEEK, WED, "20:00:00", null, null, at("2026-07-08T20:00:00"))).toBe(false);
  });

  it("אחרי הסגירה נשאר סגור גם בתוך שבוע היעד עצמו", () => {
    const status = getShiftPrefsWindowStatus(TARGET_WEEK, WED, "20:00:00", null, null, at("2026-07-14T09:00:00"));
    expect(status.state).toBe("closed");
  });

  it("שעת סגירה עם שניות נחתכת ל-HH:MM", () => {
    const closesAt = shiftPrefsCloseAt(TARGET_WEEK, WED, "23:45:59", at("2026-07-06T10:00:00"));
    expect(closesAt.getHours()).toBe(23);
    expect(closesAt.getMinutes()).toBe(45);
    expect(closesAt.getSeconds()).toBe(0);
  });
});

describe("חלון ההגשה — מועד הפתיחה", () => {
  it("פתיחה ביום ראשון (לפני יום הסגירה) — באותו שבוע הגשה", () => {
    const opensAt = shiftPrefsOpenAt(TARGET_WEEK, SUN, "21:00:00", WED, at("2026-07-01T10:00:00"));
    expect(opensAt.getDate()).toBe(5); // ראשון 05/07
    expect(opensAt.getHours()).toBe(21);
  });

  it("פתיחה בשבת (אחרי יום הסגירה) מתגלגלת לשבת שלפני שבוע ההגשה", () => {
    const opensAt = shiftPrefsOpenAt(TARGET_WEEK, SAT, "21:00:00", WED, at("2026-07-01T10:00:00"));
    expect(opensAt.getDate()).toBe(4); // שבת 04/07 — מוצ״ש שלפני
    expect(opensAt.getHours()).toBe(21);
  });

  it("לפני הפתיחה — טרם נפתח, עם שני המועדים לתצוגה", () => {
    const status = getShiftPrefsWindowStatus(TARGET_WEEK, WED, "20:00:00", SAT, "21:00:00", at("2026-07-04T18:00:00"));
    expect(status.state).toBe("not_yet_open");
    expect(status.opensAt).toBeInstanceOf(Date);
    expect(status.closesAt).toBeInstanceOf(Date);
    expect(isShiftPrefsOpenForWeek(TARGET_WEEK, WED, "20:00:00", SAT, "21:00:00", at("2026-07-04T18:00:00"))).toBe(false);
  });

  it("בדיוק ברגע הפתיחה — פתוח", () => {
    const status = getShiftPrefsWindowStatus(TARGET_WEEK, WED, "20:00:00", SAT, "21:00:00", at("2026-07-04T21:00:00"));
    expect(status.state).toBe("open");
  });

  it("סגירה גוברת על פתיחה — אחרי מועד הסגירה סגור גם אם הפתיחה מאוחרת יותר", () => {
    const status = getShiftPrefsWindowStatus(TARGET_WEEK, WED, "20:00:00", SAT, "21:00:00", at("2026-07-09T10:00:00"));
    expect(status.state).toBe("closed");
    expect(status.opensAt).toBeUndefined();
  });

  it("פתיחה בלי שעה מתנהגת כאילו אין פתיחה מוגדרת", () => {
    const status = getShiftPrefsWindowStatus(TARGET_WEEK, WED, "20:00:00", SAT, null, at("2026-07-01T10:00:00"));
    expect(status.state).toBe("open");
  });

  it("לכל יום פתיחה ששונה מיום הסגירה — החלון נפתח לפני שהוא נסגר", () => {
    const closesAt = shiftPrefsCloseAt(TARGET_WEEK, WED, "20:00:00", at("2026-07-01T10:00:00"));
    for (const openDow of [0, 1, 2, 4, 5, 6]) {
      const opensAt = shiftPrefsOpenAt(TARGET_WEEK, openDow, "21:00:00", WED, at("2026-07-01T10:00:00"));
      expect(opensAt.getTime()).toBeLessThan(closesAt.getTime());
    }
  });

  it("הגדרה הפוכה באותו יום (פתיחה 21:00, סגירה 20:00) לא נפתחת אף פעם", () => {
    const args = [TARGET_WEEK, WED, "20:00:00", WED, "21:00:00"] as const;
    expect(getShiftPrefsWindowStatus(...args, at("2026-07-08T12:00:00")).state).toBe("not_yet_open");
    expect(getShiftPrefsWindowStatus(...args, at("2026-07-08T20:30:00")).state).toBe("closed");
    expect(getShiftPrefsWindowStatus(...args, at("2026-07-08T21:30:00")).state).toBe("closed");
  });
});

describe("טקסטים שהעובד רואה", () => {
  it("מועד הסגירה מוצג עם שם היום והתאריך", () => {
    expect(formatShiftPrefsClose(TARGET_WEEK, WED, "20:00:00")).toBe("רביעי 8/7 · 20:00");
  });

  it("מועד הפתיחה בשבת מוצג עם התאריך המגולגל", () => {
    expect(formatShiftPrefsOpen(TARGET_WEEK, SAT, "21:00:00", WED)).toBe("שבת 4/7 · 21:00");
  });

  it("כללי החלון מנוסחים בעברית", () => {
    expect(formatShiftPrefsCloseRule(WED, "20:00:00")).toBe("עד רביעי בשעה 20:00");
    expect(formatShiftPrefsOpenRule(SAT, "21:00:00")).toBe("משבת בשעה 21:00");
    expect(formatShiftPrefsWindowRule(SAT, "21:00:00", WED, "20:00:00")).toBe("שבת 21:00 – רביעי 20:00");
  });
});

// ---------------------------------------------------------------------------
// דרישת המינימום
// ---------------------------------------------------------------------------

const WEEK = "2026-07-12";
const TEMPLATES = [TPL.morning, TPL.evening];

/** בונה מפת העדפות: לכל אינדקס יום ברשימה — כל התבניות מסומנות. */
function prefsForDays(dayIndices: number[], templateIds = TEMPLATES) {
  const map = new Map<string, "available" | "cannot">();
  for (const dayIndex of dayIndices) {
    const d = new Date(`${WEEK}T12:00:00`);
    d.setDate(d.getDate() + dayIndex);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (const id of templateIds) map.set(`${id}_${date}`, "available");
  }
  return map;
}

describe("דרישת מינימום ימים", () => {
  it("אין כללים כשהשדות ריקים או אפס", () => {
    expect(hasShiftPrefsMinimumRules({ minWeekdays: null, minWeekend: null })).toBe(false);
    expect(hasShiftPrefsMinimumRules({ minWeekdays: 0, minWeekend: 0 })).toBe(false);
  });

  it("מספיק כלל אחד כדי שתהיה דרישה", () => {
    expect(hasShiftPrefsMinimumRules({ minWeekdays: 2, minWeekend: null })).toBe(true);
    expect(hasShiftPrefsMinimumRules({ minWeekdays: null, minWeekend: 1 })).toBe(true);
  });

  it("יום נחשב מלא רק כשכל התבניות הפעילות סומנו", () => {
    const partial = new Map<string, "available" | "cannot">([[`${TPL.morning}_2026-07-12`, "available"]]);
    expect(isShiftPrefsDayComplete(WEEK, 0, TEMPLATES, partial)).toBe(false);
    expect(isShiftPrefsDayComplete(WEEK, 0, TEMPLATES, prefsForDays([0]))).toBe(true);
  });

  it("«לא יכול» נחשב סימון תקף — העובד ענה", () => {
    const map = new Map<string, "available" | "cannot">([
      [`${TPL.morning}_2026-07-12`, "cannot"],
      [`${TPL.evening}_2026-07-12`, "cannot"],
    ]);
    expect(isShiftPrefsDayComplete(WEEK, 0, TEMPLATES, map)).toBe(true);
  });

  it("בלי תבניות פעילות אף יום לא נחשב מלא (אין מה לסמן)", () => {
    expect(isShiftPrefsDayComplete(WEEK, 0, [], prefsForDays([0]))).toBe(false);
  });

  it("ימי אמצע שבוע הם א׳–ד׳ וסופ״ש הוא ה׳–ש׳", () => {
    expect([...SHIFT_PREFS_WEEKDAY_INDICES]).toEqual([0, 1, 2, 3]);
    expect([...SHIFT_PREFS_WEEKEND_INDICES]).toEqual([4, 5, 6]);
  });

  it("סופר רק ימים מלאים בקבוצה המבוקשת", () => {
    const map = prefsForDays([0, 1, 4]);
    expect(countCompleteShiftPrefsDays(WEEK, SHIFT_PREFS_WEEKDAY_INDICES, TEMPLATES, map)).toBe(2);
    expect(countCompleteShiftPrefsDays(WEEK, SHIFT_PREFS_WEEKEND_INDICES, TEMPLATES, map)).toBe(1);
  });

  it("דרישה מסופ״ש לא מסופקת ע״י ימי אמצע שבוע", () => {
    const status = getShiftPrefsMinimumStatus(WEEK, TEMPLATES, prefsForDays([0, 1, 2, 3]), {
      minWeekdays: 2,
      minWeekend: 1,
    });
    expect(status.weekdayMet).toBe(true);
    expect(status.weekendMet).toBe(false);
    expect(status.met).toBe(false);
  });

  it("עמידה בדיוק במינימום נחשבת עמידה", () => {
    const status = getShiftPrefsMinimumStatus(WEEK, TEMPLATES, prefsForDays([0, 1, 4]), {
      minWeekdays: 2,
      minWeekend: 1,
    });
    expect(status).toMatchObject({ weekdayDone: 2, weekendDone: 1, met: true });
  });

  it("חריגה מעל המינימום עדיין תקינה", () => {
    const status = getShiftPrefsMinimumStatus(WEEK, TEMPLATES, prefsForDays([0, 1, 2, 3, 4, 5, 6]), {
      minWeekdays: 2,
      minWeekend: 1,
    });
    expect(status).toMatchObject({ weekdayDone: 4, weekendDone: 3, met: true });
  });

  it("מינימום null מטופל כאפס — אין דרישה", () => {
    const status = getShiftPrefsMinimumStatus(WEEK, TEMPLATES, new Map(), {
      minWeekdays: null,
      minWeekend: null,
    });
    expect(status.met).toBe(true);
  });

  it("דרישה גבוהה ממספר הימים הקיימים לעולם לא מסופקת", () => {
    const status = getShiftPrefsMinimumStatus(WEEK, TEMPLATES, prefsForDays([0, 1, 2, 3]), {
      minWeekdays: 5,
      minWeekend: 0,
    });
    expect(status.weekdayMet).toBe(false);
  });

  it("סיכום הדרישה מנוסח בעברית לפי מה שהוגדר", () => {
    expect(formatShiftPrefsMinimumSummary({ minWeekdays: 2, minWeekend: 1 })).toBe("2 ימים באמצע שבוע · 1 ימים בסופ״ש");
    expect(formatShiftPrefsMinimumSummary({ minWeekdays: 2, minWeekend: 0 })).toBe("2 ימים באמצע שבוע");
    expect(formatShiftPrefsMinimumSummary({ minWeekdays: null, minWeekend: null })).toBe("ללא דרישה");
  });
});
