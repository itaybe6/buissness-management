/**
 * ממשק העובד — מסך «מעקב שכר» (my-shifts).
 *
 * זה המסך שבו העובד רואה כמה הרוויח בכל משמרת. הוא בנוי משלושה מקורות
 * שמתמזגים לשורה אחת: החתמות שעון (עובד שעתי), טיפים (עובד טיפים) ותוספת
 * קופה. הבדיקות מוודאות שהמיזוג, הרצפה למינימום והסכומים נכונים.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildEmployeeShiftRows,
  fmtHours,
  monthLabel,
  monthNow,
  shiftFullDateLabel,
  shiftMonth,
  sumShiftRowTotals,
} from "@/lib/payrollShiftRows";
import {
  TPL,
  USER,
  makeAttendance,
  makeOpenAttendance,
  makeShiftBonus,
  makeTip,
  shiftTemplates,
} from "../helpers/factories";

const DATE = "2026-07-08";

function rowsForTips(tips: Parameters<typeof buildEmployeeShiftRows>[0]["tips"], rate = 40, bonuses = []) {
  return buildEmployeeShiftRows({
    isTips: true,
    rate,
    attendance: [],
    tips,
    bonuses,
    templates: shiftTemplates,
  });
}

function rowsForHourly(
  attendance: Parameters<typeof buildEmployeeShiftRows>[0]["attendance"],
  rate = 40,
  bonuses: Parameters<typeof buildEmployeeShiftRows>[0]["bonuses"] = [],
) {
  return buildEmployeeShiftRows({
    isTips: false,
    rate,
    attendance,
    tips: [],
    bonuses,
    templates: shiftTemplates,
  });
}

describe("עובד שעתי — שורות המשמרות", () => {
  it("שורה אחת לכל החתמה סגורה, שעות × תעריף", () => {
    const rows = rowsForHourly([makeAttendance({ date: DATE, from: 8, to: 16 })], 40);
    expect(rows).toHaveLength(1);
    expect(rows[0].hours).toBe(8);
    expect(rows[0].hourly).toBe(40);
    expect(rows[0].earned).toBe(320);
    expect(rows[0].isTips).toBe(false);
  });

  it("החתמה פתוחה לא יוצרת שורה", () => {
    const rows = rowsForHourly([
      makeAttendance({ date: DATE, from: 8, to: 16 }),
      makeOpenAttendance(USER.employee, DATE, 18),
    ]);
    expect(rows).toHaveLength(1);
  });

  it("משמרת שחוצה חצות נספרת לפי משך אמיתי", () => {
    const rows = rowsForHourly([makeAttendance({ date: DATE, from: 22, to: 6 })], 50);
    expect(rows[0].hours).toBe(8);
    expect(rows[0].earned).toBe(400);
  });

  it("המשמרות ממוינות מהחדשה לישנה", () => {
    const rows = rowsForHourly([
      makeAttendance({ date: "2026-07-01", from: 8, to: 12 }),
      makeAttendance({ date: "2026-07-20", from: 8, to: 12 }),
      makeAttendance({ date: "2026-07-10", from: 8, to: 12 }),
    ]);
    expect(rows.map((r) => r.date.getDate())).toEqual([20, 10, 1]);
  });

  it("תעריף אפס (לא הוגדר בפרופיל) מניב שכר אפס ולא שגיאה", () => {
    const rows = rowsForHourly([makeAttendance({ date: DATE, from: 8, to: 16 })], 0);
    expect(rows[0].earned).toBe(0);
  });

  it("שעות חלקיות נשמרות במלואן בחישוב", () => {
    const rows = rowsForHourly([makeAttendance({ date: DATE, from: 8, to: 12.5 })], 40);
    expect(rows[0].hours).toBe(4.5);
    expect(rows[0].earned).toBe(180);
  });
});

describe("עובד טיפים — שורות המשמרות", () => {
  it("טיפ מעל המינימום — משתלם לפי תעריף הטיפים", () => {
    const rows = rowsForTips([makeTip({ shift_date: DATE, hours: 8, amount: 480, hourly_from_tips: 60 })], 40);
    expect(rows[0].hourly).toBe(60);
    expect(rows[0].earned).toBe(480);
    expect(rows[0].topup).toBe(0);
    expect(rows[0].belowMin).toBe(false);
  });

  it("טיפ מתחת למינימום — מרוצף לתעריף השעתי ומסומן להשלמה", () => {
    const rows = rowsForTips([makeTip({ shift_date: DATE, hours: 8, amount: 160, hourly_from_tips: 20 })], 40);
    expect(rows[0].hourly).toBe(40);
    expect(rows[0].earned).toBe(320);
    expect(rows[0].topup).toBe(160);
    expect(rows[0].belowMin).toBe(true);
  });

  it("טיפ בדיוק על המינימום לא מסומן כהשלמה", () => {
    const rows = rowsForTips([makeTip({ shift_date: DATE, hours: 8, amount: 320, hourly_from_tips: 40 })], 40);
    expect(rows[0].topup).toBe(0);
    expect(rows[0].belowMin).toBe(false);
  });

  it("פער של אגורות בודדות לא נחשב «מתחת למינימום»", () => {
    const rows = rowsForTips([makeTip({ shift_date: DATE, hours: 8, amount: 319.7, hourly_from_tips: 40 })], 40);
    expect(rows[0].belowMin).toBe(false);
  });

  it("בלי hourly_from_tips התעריף מחושב מהסכום חלקי השעות", () => {
    const rows = rowsForTips([makeTip({ shift_date: DATE, hours: 5, amount: 250, hourly_from_tips: null })], 40);
    expect(rows[0].hourly).toBe(50);
    expect(rows[0].earned).toBe(250);
  });

  it("טיפ עם אפס שעות לא מחלק באפס", () => {
    const rows = rowsForTips([makeTip({ shift_date: DATE, hours: 0, amount: 0, hourly_from_tips: null })], 40);
    expect(rows[0].hours).toBe(0);
    expect(rows[0].earned).toBe(0);
    expect(Number.isFinite(rows[0].hourly)).toBe(true);
  });

  it("שם המשמרת ושעותיה נלקחים מהתבנית", () => {
    const rows = rowsForTips([makeTip({ shift_date: DATE, shift_template_id: TPL.evening })]);
    expect(rows[0].title).toBe("ערב");
    expect(rows[0].timeLabel).toBe("18:00–23:00");
  });

  it("טיפ בלי תבנית מוצג כ«משמרת» בלי שעות", () => {
    const rows = rowsForTips([makeTip({ shift_date: DATE, shift_template_id: null })]);
    expect(rows[0].title).toBe("משמרת");
    expect(rows[0].timeLabel).toBeNull();
  });

  it("תבנית שנמחקה מהעסק לא מפילה את המסך", () => {
    const rows = rowsForTips([makeTip({ shift_date: DATE, shift_template_id: "tpl-deleted" })]);
    expect(rows[0].title).toBe("משמרת");
  });
});

describe("תוספת קופה בשורות המשמרת", () => {
  it("בונוס לאותו תאריך ותבנית מתמזג לשורת הטיפים", () => {
    const rows = rowsForTips(
      [makeTip({ shift_date: DATE, shift_template_id: TPL.evening, hours: 8, amount: 480, hourly_from_tips: 60 })],
      40,
      [makeShiftBonus({ shift_date: DATE, shift_template_id: TPL.evening, amount: 120 })] as never,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].bonusAmount).toBe(120);
    expect(rows[0].earned).toBe(600);
  });

  it("בונוס בלי משמרת תואמת מקבל שורה נפרדת", () => {
    const rows = rowsForTips(
      [makeTip({ shift_date: DATE, shift_template_id: TPL.evening })],
      40,
      [makeShiftBonus({ shift_date: "2026-07-20", shift_template_id: TPL.morning, amount: 90 })] as never,
    );
    expect(rows).toHaveLength(2);
    const bonusRow = rows.find((r) => r.id.startsWith("bonus-"))!;
    expect(bonusRow.hours).toBe(0);
    expect(bonusRow.earned).toBe(90);
    expect(bonusRow.title).toBe("בוקר");
  });

  it("בונוס לתאריך זהה אבל תבנית אחרת לא מתמזג", () => {
    const rows = rowsForTips(
      [makeTip({ shift_date: DATE, shift_template_id: TPL.evening })],
      40,
      [makeShiftBonus({ shift_date: DATE, shift_template_id: TPL.morning, amount: 50 })] as never,
    );
    expect(rows).toHaveLength(2);
  });

  it("אצל עובד שעתי הבונוס מוצג כשורה נפרדת ולא מתמזג להחתמה", () => {
    const rows = rowsForHourly(
      [makeAttendance({ date: DATE, from: 18, to: 23 })],
      40,
      [makeShiftBonus({ shift_date: DATE, shift_template_id: TPL.evening, amount: 75 })] as never,
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id.startsWith("bonus-"))?.earned).toBe(75);
  });

  it("בונוס בלי תבנית מוצג כ«תוספת שכר»", () => {
    const rows = rowsForHourly([], 40, [
      makeShiftBonus({ shift_date: DATE, shift_template_id: null, amount: 60 }),
    ] as never);
    expect(rows[0].title).toBe("תוספת שכר");
  });
});

describe("סיכומי החודש שהעובד רואה", () => {
  it("מסכם שעות, שכר, טיפים, השלמה ובונוס", () => {
    const rows = rowsForTips(
      [
        makeTip({ shift_date: "2026-07-08", hours: 8, amount: 480, hourly_from_tips: 60 }),
        makeTip({ shift_date: "2026-07-09", hours: 6, amount: 120, hourly_from_tips: 20 }),
      ],
      40,
      [makeShiftBonus({ shift_date: "2026-07-08", shift_template_id: TPL.evening, amount: 100 })] as never,
    );
    const totals = sumShiftRowTotals(rows);
    expect(totals.hours).toBe(14);
    expect(totals.tips).toBe(600);
    expect(totals.topup).toBe(120); // רק המשמרת החלשה
    expect(totals.bonus).toBe(100);
    expect(totals.earned).toBe(820); // 480+100 + 240
    expect(totals.count).toBe(2);
  });

  it("ממוצע לשעה מחושב מהשכר חלקי השעות", () => {
    const rows = rowsForHourly([makeAttendance({ date: DATE, from: 8, to: 16 })], 50);
    expect(sumShiftRowTotals(rows).avg).toBe(50);
  });

  it("בלי שעות הממוצע הוא אפס ולא NaN", () => {
    const totals = sumShiftRowTotals([]);
    expect(totals.avg).toBe(0);
    expect(totals.count).toBe(0);
  });

  it("חודש בלי משמרות מחזיר אפסים", () => {
    expect(sumShiftRowTotals([])).toEqual({
      hours: 0,
      earned: 0,
      tips: 0,
      topup: 0,
      bonus: 0,
      count: 0,
      avg: 0,
    });
  });
});

describe("ניווט בין חודשים ותצוגת תאריכים", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("קדימה ואחורה בתוך השנה", () => {
    expect(shiftMonth("2026-07", 1)).toBe("2026-08");
    expect(shiftMonth("2026-07", -1)).toBe("2026-06");
  });

  it("מעבר שנה בשני הכיוונים", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("קפיצה של 12 חודשים חוזרת לאותו חודש בשנה הבאה", () => {
    expect(shiftMonth("2026-02", 12)).toBe("2027-02");
  });

  it("החודש הנוכחי נקבע לפי השעון המקומי", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
    expect(monthNow()).toBe("2026-07");
  });

  it("ב-1 בחודש אחרי חצות עדיין מוצג החודש החדש (ולא הקודם לפי UTC)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 1, 0, 30, 0));
    expect(monthNow()).toBe("2026-08");
  });

  it("תווית החודש בעברית", () => {
    expect(monthLabel("2026-07")).toBe("יולי 2026");
    expect(monthLabel("2026-01")).toBe("ינואר 2026");
  });

  it("תווית תאריך מלאה כוללת יום בשבוע", () => {
    expect(shiftFullDateLabel(new Date(2026, 6, 8, 12))).toBe("ד׳, 8 ביולי 2026");
  });

  it("שעות מוצגות בלי אפסים מיותרים", () => {
    expect(fmtHours(8)).toBe("8");
    expect(fmtHours(8.5)).toBe("8.5");
    expect(fmtHours(8.04)).toBe("8");
    expect(fmtHours(0)).toBe("0");
  });
});
