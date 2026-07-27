/**
 * ממשק מנהלת המשרד — מסך השכר החודשי.
 *
 * החישוב הבסיסי (שעות × תעריף, טיפים והשלמה) מכוסה ב-tests/payroll.
 * כאן נבדקת השכבה שמנהלת המשרד אחראית עליה: בונוס חודשי, מפרעה והפרשים,
 * ספירת משמרות לייצוא, ועלות המעסיק המצטברת שהיא מדווחת עליה.
 */
import { describe, expect, it } from "vitest";
import { computeEmployeePayroll, withPayrollAdjustments } from "@/lib/payrollCompute";
import { payrollAdjustmentForEmployee } from "@/api/payroll";
import { countEmployeeShifts } from "@/lib/payrollExport";
import {
  aggregateByMonth,
  aggregateByWeek,
  aggregateDailyLaborCosts,
  employerCostFromRow,
  fillMonthDays,
  fillWeekDays,
  formatWeekRange,
  monthKeyFromDate,
  sumLaborCosts,
  weekStartISO,
} from "@/lib/payrollDailyCost";
import { sumFaultPayAmount } from "@/lib/faultPayrollRows";
import {
  TPL,
  USER,
  hourlyEmployee,
  makeAttendance,
  makeFault,
  makePayrollAdjustment,
  makeShiftBonus,
  makeTip,
  shiftTemplates,
  tipsEmployee,
} from "../helpers/factories";

/** שכר בסיס לדוגמה: 40 שעות × 50 ₪ = 2,000 ₪. */
function baseRow(over: Partial<Parameters<typeof computeEmployeePayroll>[0]> = {}) {
  return computeEmployeePayroll({
    wageType: "hourly",
    rate: 50,
    tips: [],
    bonusSum: 0,
    attendanceHours: 40,
    ...over,
  });
}

describe("התאמות חודשיות של מנהלת המשרד", () => {
  it("בלי התאמות — הנטו שווה לברוטו", () => {
    const row = withPayrollAdjustments(baseRow());
    expect(row.grossPay).toBe(2000);
    expect(row.total).toBe(2000);
    expect(row).toMatchObject({ monthlyBonus: 0, advance: 0, differences: 0 });
  });

  it("בונוס חודשי מתווסף לנטו", () => {
    expect(withPayrollAdjustments(baseRow(), { monthlyBonus: 500 }).total).toBe(2500);
  });

  it("מפרעה יורדת מהנטו", () => {
    expect(withPayrollAdjustments(baseRow(), { advance: 800 }).total).toBe(1200);
  });

  it("הפרשים חיוביים מוסיפים ושליליים מנכים", () => {
    expect(withPayrollAdjustments(baseRow(), { differences: 250 }).total).toBe(2250);
    expect(withPayrollAdjustments(baseRow(), { differences: -250 }).total).toBe(1750);
  });

  it("שלוש ההתאמות יחד מחושבות נכון", () => {
    const row = withPayrollAdjustments(baseRow(), { monthlyBonus: 500, advance: 800, differences: -100 });
    expect(row.total).toBe(1600);
    expect(row.grossPay).toBe(2000); // הברוטו לא משתנה
  });

  it("מפרעה שלילית מנוטרלת לאפס — היא לעולם לא מגדילה שכר", () => {
    expect(withPayrollAdjustments(baseRow(), { advance: -500 }).advance).toBe(0);
    expect(withPayrollAdjustments(baseRow(), { advance: -500 }).total).toBe(2000);
  });

  it("ערכים לא מספריים מטופלים כאפס ולא כ-NaN", () => {
    const row = withPayrollAdjustments(baseRow(), {
      monthlyBonus: Number("abc"),
      advance: undefined,
      differences: Number.NaN,
    });
    expect(row.total).toBe(2000);
    expect(Number.isNaN(row.total)).toBe(false);
  });

  it("מפרעה גדולה מהשכר יוצרת נטו שלילי — לא נחתך בשקט", () => {
    expect(withPayrollAdjustments(baseRow(), { advance: 3000 }).total).toBe(-1000);
  });

  it("התאמות נשמרות גם לעובד טיפים", () => {
    const tipsRow = computeEmployeePayroll({
      wageType: "tips",
      rate: 40,
      tips: [{ hours: 8, amount: 480, hourly_from_tips: 60 }],
      bonusSum: 0,
      attendanceHours: 0,
    });
    const row = withPayrollAdjustments(tipsRow, { monthlyBonus: 200 });
    expect(row.grossPay).toBe(480);
    expect(row.total).toBe(680);
  });
});

describe("שיוך שורת התאמה לעובד", () => {
  const rows = [
    makePayrollAdjustment({ employee_id: USER.employee, monthly_bonus: 300 }),
    makePayrollAdjustment({ employee_id: USER.employee2, advance: 150 }),
  ];

  it("מוצא את השורה של העובד הנכון", () => {
    expect(payrollAdjustmentForEmployee(rows, USER.employee2)?.advance).toBe(150);
  });

  it("עובד בלי התאמות מחזיר undefined", () => {
    expect(payrollAdjustmentForEmployee(rows, USER.employee3)).toBeUndefined();
  });

  it("רשימה שלא נטענה עדיין לא מפילה את המסך", () => {
    expect(payrollAdjustmentForEmployee(undefined, USER.employee)).toBeUndefined();
  });
});

describe("ספירת משמרות לייצוא לאקסל", () => {
  const attendance = [
    { employee_id: USER.employee, clock_in: "2026-07-08T08:00:00", clock_out: "2026-07-08T16:00:00" },
    { employee_id: USER.employee, clock_in: "2026-07-09T08:00:00", clock_out: "2026-07-09T16:00:00" },
    { employee_id: USER.employee, clock_in: "2026-07-10T08:00:00", clock_out: null },
    { employee_id: USER.employee2, clock_in: "2026-07-08T08:00:00", clock_out: "2026-07-08T16:00:00" },
  ];
  const tips = [
    { employee_id: USER.employee2 },
    { employee_id: USER.employee2 },
    { employee_id: USER.employee3 },
  ];

  it("עובד שעתי — לפי החתמות סגורות בלבד", () => {
    expect(countEmployeeShifts("hourly", USER.employee, attendance, tips)).toBe(2);
  });

  it("עובד טיפים — לפי מספר שורות הטיפים", () => {
    expect(countEmployeeShifts("tips", USER.employee2, attendance, tips)).toBe(2);
  });

  it("עובד בלי נתונים מקבל אפס", () => {
    expect(countEmployeeShifts("hourly", USER.employee3, attendance, tips)).toBe(0);
    expect(countEmployeeShifts("tips", USER.employee, attendance, tips)).toBe(0);
  });
});

describe("עלות מעסיק — פירוק שורה", () => {
  it("עובד שעתי: כל השכר הוא עלות, בניכוי הבונוס שנספר בנפרד", () => {
    const cost = employerCostFromRow({
      id: "r1",
      date: new Date("2026-07-08T08:00:00"),
      title: "משמרת",
      timeLabel: null,
      hours: 8,
      hourly: 50,
      earned: 500,
      isTips: false,
      bonusAmount: 100,
    });
    expect(cost).toEqual({ hours: 8, hourly: 400, topup: 0, bonus: 100 });
  });

  it("עובד טיפים: הקופה של הלקוחות אינה עלות — רק ההשלמה", () => {
    const cost = employerCostFromRow({
      id: "r2",
      date: new Date("2026-07-08T18:00:00"),
      title: "ערב",
      timeLabel: null,
      hours: 8,
      hourly: 40,
      earned: 320,
      isTips: true,
      tipAmount: 200,
      topup: 120,
    });
    expect(cost).toEqual({ hours: 8, hourly: 0, topup: 120, bonus: 0 });
  });
});

describe("עלות מעסיק — צבירה יומית", () => {
  const templates = shiftTemplates;

  it("מסכם עובד שעתי ועובד טיפים לאותו יום", () => {
    const days = aggregateDailyLaborCosts({
      profiles: [hourlyEmployee(USER.employee, 50), tipsEmployee(USER.employee2, 40)],
      attendance: [makeAttendance({ employeeId: USER.employee, date: "2026-07-08", from: 8, to: 16 })],
      tips: [
        makeTip({ employee_id: USER.employee2, shift_date: "2026-07-08", hours: 8, amount: 200, hourly_from_tips: 25 }),
      ],
      bonuses: [],
      templates,
    });
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-07-08");
    expect(days[0].hourly).toBe(400);
    expect(days[0].topup).toBe(120); // 8×40 מינוס 200 טיפים
    expect(days[0].total).toBe(520);
  });

  it("אחמ״ש לא נספר בעלות היומית (השכר שלו מנוהל בנפרד)", () => {
    const days = aggregateDailyLaborCosts({
      profiles: [hourlyEmployee(USER.shiftManager, 60, { role: "shift_manager" })],
      attendance: [makeAttendance({ employeeId: USER.shiftManager, date: "2026-07-08", from: 8, to: 16 })],
      tips: [],
      bonuses: [],
      templates,
    });
    expect(days).toEqual([]);
  });

  it("עובד לא פעיל לא נספר", () => {
    const days = aggregateDailyLaborCosts({
      profiles: [hourlyEmployee(USER.employee, 50, { active: false })],
      attendance: [makeAttendance({ employeeId: USER.employee, date: "2026-07-08", from: 8, to: 16 })],
      tips: [],
      bonuses: [],
      templates,
    });
    expect(days).toEqual([]);
  });

  it("נוכחות של עובד אחד לא נזקפת לעובד אחר", () => {
    const days = aggregateDailyLaborCosts({
      profiles: [hourlyEmployee(USER.employee, 50), hourlyEmployee(USER.employee2, 100)],
      attendance: [makeAttendance({ employeeId: USER.employee, date: "2026-07-08", from: 8, to: 16 })],
      tips: [],
      bonuses: [],
      templates,
    });
    expect(days[0].hourly).toBe(400);
  });

  it("תוספת קופה נספרת בנפרד מהשכר", () => {
    const days = aggregateDailyLaborCosts({
      profiles: [hourlyEmployee(USER.employee, 50)],
      attendance: [makeAttendance({ employeeId: USER.employee, date: "2026-07-08", from: 8, to: 16 })],
      tips: [],
      bonuses: [
        makeShiftBonus({
          employee_id: USER.employee,
          shift_date: "2026-07-08",
          shift_template_id: TPL.morning,
          amount: 150,
        }),
      ],
      templates,
    });
    expect(days[0].hourly).toBe(400);
    expect(days[0].bonus).toBe(150);
    expect(days[0].total).toBe(550);
  });

  it("הימים מוחזרים ממוינים כרונולוגית", () => {
    const days = aggregateDailyLaborCosts({
      profiles: [hourlyEmployee(USER.employee, 50)],
      attendance: [
        makeAttendance({ employeeId: USER.employee, date: "2026-07-20", from: 8, to: 12 }),
        makeAttendance({ employeeId: USER.employee, date: "2026-07-02", from: 8, to: 12 }),
        makeAttendance({ employeeId: USER.employee, date: "2026-07-11", from: 8, to: 12 }),
      ],
      tips: [],
      bonuses: [],
      templates,
    });
    expect(days.map((d) => d.date)).toEqual(["2026-07-02", "2026-07-11", "2026-07-20"]);
  });

  it("בלי עובדים או בלי נתונים — רשימה ריקה", () => {
    expect(aggregateDailyLaborCosts({ profiles: [], attendance: [], tips: [], bonuses: [], templates })).toEqual([]);
  });
});

describe("סיכומים שבועיים וחודשיים", () => {
  const days = [
    { date: "2026-07-05", hours: 8, hourly: 400, topup: 0, bonus: 0, total: 400 },
    { date: "2026-07-08", hours: 8, hourly: 400, topup: 50, bonus: 20, total: 470 },
    { date: "2026-07-13", hours: 4, hourly: 200, topup: 0, bonus: 0, total: 200 },
  ];

  it("סכום כולל של כל הימים", () => {
    expect(sumLaborCosts(days)).toEqual({ hours: 20, hourly: 1000, topup: 50, bonus: 20, total: 1070 });
  });

  it("סכום של רשימה ריקה הוא אפסים", () => {
    expect(sumLaborCosts([])).toEqual({ hours: 0, hourly: 0, topup: 0, bonus: 0, total: 0 });
  });

  it("תחילת השבוע היא תמיד יום ראשון", () => {
    expect(weekStartISO("2026-07-08")).toBe("2026-07-05"); // רביעי → ראשון
    expect(weekStartISO("2026-07-05")).toBe("2026-07-05"); // ראשון נשאר
    expect(weekStartISO("2026-07-11")).toBe("2026-07-05"); // שבת
    expect(weekStartISO("2026-07-12")).toBe("2026-07-12"); // ראשון הבא
  });

  it("קיבוץ שבועי מפצל לשני שבועות עם תוויות טווח", () => {
    const weeks = aggregateByWeek(days);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].total).toBe(870);
    expect(weeks[1].total).toBe(200);
    expect(weeks[0].label).toContain("–");
  });

  it("מפתח חודש נגזר מהתאריך המקומי", () => {
    expect(monthKeyFromDate(new Date(2026, 6, 8, 12))).toBe("2026-07");
    expect(monthKeyFromDate(new Date(2026, 11, 31, 23))).toBe("2026-12");
  });

  it("קיבוץ חודשי מסכם לפי מפתחות שנמסרו, כולל חודש ריק", () => {
    const byMonth = new Map([["2026-07", days]]);
    const months = aggregateByMonth(["2026-06", "2026-07"], byMonth);
    expect(months).toHaveLength(2);
    expect(months[0]).toMatchObject({ label: "יונ 26", total: 0 });
    expect(months[1]).toMatchObject({ label: "יול 26", total: 1070 });
  });

  it("מילוי ימי חודש משלים ימים חסרים באפסים", () => {
    const filled = fillMonthDays(days, "2026-07");
    expect(filled).toHaveLength(31);
    expect(filled[0]).toMatchObject({ date: "2026-07-01", total: 0 });
    expect(filled[7]).toMatchObject({ date: "2026-07-08", total: 470 });
  });

  it("מילוי חלקי עד יום מסוים (החודש הנוכחי)", () => {
    expect(fillMonthDays(days, "2026-07", 10)).toHaveLength(10);
  });

  it("פברואר מעוברת מחזירה 29 ימים", () => {
    expect(fillMonthDays([], "2028-02")).toHaveLength(29);
    expect(fillMonthDays([], "2026-02")).toHaveLength(28);
  });

  it("מילוי שבוע מחזיר 7 ימים עם תוויות בעברית", () => {
    const week = fillWeekDays(days, "2026-07-05");
    expect(week).toHaveLength(7);
    expect(week[0].label).toBe("א׳");
    expect(week[6].label).toBe("ש׳");
    expect(week[3].total).toBe(470); // רביעי
  });

  it("טווח שבוע מוצג כתאריך התחלה–סיום", () => {
    expect(formatWeekRange("2026-07-05")).toContain("–");
  });
});

describe("תשלום לאיש אחזקה בתוך השכר", () => {
  it("רק תקלות שאושרו לתשלום נספרות", () => {
    const faults = [
      makeFault({ pay_employee_id: USER.maintenance, pay_approval_status: "approved", work_price: 400 }),
      makeFault({ pay_employee_id: USER.maintenance, pay_approval_status: "pending", work_price: 900 }),
      makeFault({ pay_employee_id: USER.maintenance, pay_approval_status: null, work_price: 250 }),
    ];
    expect(sumFaultPayAmount(faults, USER.maintenance)).toBe(400);
  });

  it("תשלום נזקף רק לעובד שסומן בתקלה", () => {
    const faults = [makeFault({ pay_employee_id: USER.employee, pay_approval_status: "approved", work_price: 400 })];
    expect(sumFaultPayAmount(faults, USER.maintenance)).toBe(0);
  });

  it("תשלום התקלות מתווסף לשכר החודשי", () => {
    const row = computeEmployeePayroll({
      wageType: "hourly",
      rate: 0,
      tips: [],
      bonusSum: 0,
      attendanceHours: 0,
      faultPaySum: 750,
    });
    expect(row.faultPay).toBe(750);
    expect(row.total).toBe(750);
  });
});
