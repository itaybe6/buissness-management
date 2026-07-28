/**
 * מה שהמנהל עושה → מה שקורה לעובד: הגדרות השכר בפרופיל.
 *
 * ארבעה שדות שהמנהל/מנהלת המשרד קובעים בכרטיס העובד משנים לגמרי כמה כסף
 * הוא מקבל: סוג השכר, התעריף, אחוז הקופה, והאם הוא פעיל. כאן נבדק המסלול
 * מהשדה בפרופיל ועד השורה בתלוש.
 */
import { describe, expect, it } from "vitest";
import { computeEmployeePayroll, withPayrollAdjustments } from "@/lib/payrollCompute";
import { aggregateDailyLaborCosts, sumLaborCosts } from "@/lib/payrollDailyCost";
import { buildEmployeeShiftRows, sumShiftRowTotals } from "@/lib/payrollShiftRows";
import { countEmployeeShifts } from "@/lib/payrollExport";
import {
  buildBonusParticipantsFromTeam,
  computeBonusPayouts,
  computeEmployeeBonusAmount,
} from "@/lib/shiftReportBonuses";
import { BONUS_ELIGIBLE_ROLES, DEFAULT_HOURLY_RATE, WAGE_TYPE_LABELS } from "@/lib/constants";
import {
  TPL,
  USER,
  hourlyEmployee,
  makeAttendance,
  makeShiftBonus,
  makeTip,
  shiftTemplates,
  tipsEmployee,
} from "../helpers/factories";

/** אותה משמרת בדיוק, פעם כשעתי ופעם כטיפים. */
const HOURS = 8;
const TIP_POOL_SHARE = 240; // מה שהעובד קיבל מהקופה באותה משמרת

describe("המנהל בוחר סוג שכר — שעתי מול טיפים", () => {
  it("שעתי: שעות × תעריף, בלי קשר לטיפים", () => {
    const row = computeEmployeePayroll({
      wageType: "hourly",
      rate: 50,
      tips: [],
      bonusSum: 0,
      attendanceHours: HOURS,
    });
    expect(row.base).toBe(400);
    expect(row.tips).toBe(0);
    expect(row.topup).toBe(0);
    expect(row.total).toBe(400);
  });

  it("טיפים: מקבל מהקופה, עם רצפה בגובה התעריף שלו", () => {
    const row = computeEmployeePayroll({
      wageType: "tips",
      rate: 50,
      tips: [{ hours: HOURS, amount: TIP_POOL_SHARE, hourly_from_tips: 30 }],
      bonusSum: 0,
      attendanceHours: 0,
    });
    expect(row.tips).toBe(240);
    expect(row.topup).toBe(160); // 8×50 − 240
    expect(row.total).toBe(400);
  });

  it("מעבר משעתי לטיפים משנה את מקור השעות — נוכחות מול שורות טיפים", () => {
    const attendanceHours = 40;
    const asHourly = computeEmployeePayroll({
      wageType: "hourly",
      rate: 50,
      tips: [],
      bonusSum: 0,
      attendanceHours,
    });
    const asTips = computeEmployeePayroll({
      wageType: "tips",
      rate: 50,
      tips: [{ hours: 8, amount: 500, hourly_from_tips: 62.5 }],
      bonusSum: 0,
      attendanceHours,
    });
    expect(asHourly.hours).toBe(40);
    expect(asTips.hours).toBe(8); // שעות הנוכחות לא נספרות לעובד טיפים
  });

  it("שתי התוויות קיימות בעברית", () => {
    expect(WAGE_TYPE_LABELS).toEqual({ hourly: "שעתי", tips: "טיפים" });
  });
});

describe("המנהל קובע את התעריף השעתי", () => {
  it("העלאת תעריף מגדילה את השכר באופן יחסי", () => {
    const pay = (rate: number) =>
      computeEmployeePayroll({ wageType: "hourly", rate, tips: [], bonusSum: 0, attendanceHours: 40 }).total;
    expect(pay(40)).toBe(1600);
    expect(pay(50)).toBe(2000);
  });

  it("אצל עובד טיפים התעריף הוא רצפת המינימום — העלאה מגדילה את ההשלמה", () => {
    const tips = [{ hours: 8, amount: 240, hourly_from_tips: 30 }];
    const low = computeEmployeePayroll({ wageType: "tips", rate: 35, tips, bonusSum: 0, attendanceHours: 0 });
    const high = computeEmployeePayroll({ wageType: "tips", rate: 50, tips, bonusSum: 0, attendanceHours: 0 });
    expect(low.topup).toBe(40); // 8×35 − 240
    expect(high.topup).toBe(160); // 8×50 − 240
    expect(high.tips).toBe(low.tips); // הטיפים עצמם לא השתנו
  });

  it("תעריף שלא הוגדר בפרופיל = שכר אפס לעובד שעתי", () => {
    const row = computeEmployeePayroll({
      wageType: "hourly",
      rate: 0,
      tips: [],
      bonusSum: 0,
      attendanceHours: 40,
    });
    expect(row.total).toBe(0);
  });

  it("תעריף שלא הוגדר אצל עובד טיפים = בלי רצפה, מקבל רק את הקופה", () => {
    const row = computeEmployeePayroll({
      wageType: "tips",
      rate: 0,
      tips: [{ hours: 8, amount: 100, hourly_from_tips: 12.5 }],
      bonusSum: 0,
      attendanceHours: 0,
    });
    expect(row.topup).toBe(0);
    expect(row.total).toBe(100);
  });

  it("ברירת המחדל לעובד חדש היא שכר המינימום השעתי", () => {
    expect(DEFAULT_HOURLY_RATE).toBe(35.4);
  });
});

describe("המנהל קובע אחוז קופה (bonus_pct)", () => {
  it("אחוז מהמחזור מתווסף לשכר", () => {
    expect(computeEmployeeBonusAmount(20_000, 1)).toBe(200);
    expect(computeEmployeeBonusAmount(20_000, 0.5)).toBe(100);
  });

  it("בלי אחוז — אין תוספת", () => {
    expect(computeEmployeeBonusAmount(20_000, 0)).toBe(0);
  });

  it("מחזור אפס או שלילי לא מייצר תוספת", () => {
    expect(computeEmployeeBonusAmount(0, 1)).toBe(0);
    expect(computeEmployeeBonusAmount(-500, 1)).toBe(0);
  });

  it("הסכום מעוגל לאגורות", () => {
    expect(computeEmployeeBonusAmount(12_345, 0.7)).toBe(86.42);
  });

  it("רק עובדים עם אחוז מוגדר נכנסים לרשימת המקבלים", () => {
    const team = [USER.shiftManager, USER.employee, USER.employee2];
    const profiles = [
      { id: USER.shiftManager, bonus_pct: 1 },
      { id: USER.employee, bonus_pct: 0 },
      { id: USER.employee2, bonus_pct: null },
    ];
    expect(buildBonusParticipantsFromTeam(team, profiles)).toEqual([
      { employee_id: USER.shiftManager, bonus_pct: 1 },
    ]);
  });

  it("עובד שמופיע פעמיים בצוות מקבל תוספת פעם אחת", () => {
    const team = [USER.shiftManager, USER.shiftManager];
    const profiles = [{ id: USER.shiftManager, bonus_pct: 1 }];
    expect(buildBonusParticipantsFromTeam(team, profiles)).toHaveLength(1);
  });

  it("כל משתתף מקבל לפי האחוז האישי שלו מאותו מחזור", () => {
    const payouts = computeBonusPayouts(20_000, [
      { employee_id: USER.manager, bonus_pct: 2 },
      { employee_id: USER.shiftManager, bonus_pct: 1 },
      { employee_id: USER.employee, bonus_pct: 0 },
    ]);
    expect(payouts).toEqual([
      { employee_id: USER.manager, bonus_pct: 2, amount: 400 },
      { employee_id: USER.shiftManager, bonus_pct: 1, amount: 200 },
    ]);
  });

  it("התוספת נכנסת לשכר מעל הבסיס", () => {
    const row = computeEmployeePayroll({
      wageType: "hourly",
      rate: 50,
      tips: [],
      bonusSum: 200,
      attendanceHours: 40,
    });
    expect(row.base).toBe(2000);
    expect(row.bonus).toBe(200);
    expect(row.total).toBe(2200);
  });

  it("התפקידים שזכאים לאחוז קופה הם מנהל ואחראי משמרת", () => {
    expect(BONUS_ELIGIBLE_ROLES).toEqual(["manager", "shift_manager"]);
    expect(BONUS_ELIGIBLE_ROLES).not.toContain("employee");
  });
});

describe("המנהל משבית עובד — מה קורה לנתונים שלו", () => {
  const attendance = [makeAttendance({ employeeId: USER.employee, date: "2026-07-08", from: 8, to: 16 })];

  it("עובד פעיל נספר בעלות המעסיק", () => {
    const days = aggregateDailyLaborCosts({
      profiles: [hourlyEmployee(USER.employee, 50, { active: true })],
      attendance,
      tips: [],
      bonuses: [],
      templates: shiftTemplates,
    });
    expect(sumLaborCosts(days).hourly).toBe(400);
  });

  it("עובד שהושבת יורד מדוח עלות המעסיק", () => {
    const days = aggregateDailyLaborCosts({
      profiles: [hourlyEmployee(USER.employee, 50, { active: false })],
      attendance,
      tips: [],
      bonuses: [],
      templates: shiftTemplates,
    });
    expect(days).toEqual([]);
  });

  it("ההחתמות ההיסטוריות שלו עדיין קיימות — לא נמחק לו שכר עבר", () => {
    const rows = buildEmployeeShiftRows({
      isTips: false,
      rate: 50,
      attendance,
      tips: [],
      bonuses: [],
      templates: shiftTemplates,
    });
    expect(sumShiftRowTotals(rows).earned).toBe(400);
  });
});

describe("מסלול מלא: המנהל מגדיר, העובד מקבל", () => {
  it("עובד טיפים עם משמרת חלשה ומשמרת חזקה — רק החלשה מושלמת", () => {
    const profile = tipsEmployee(USER.employee, 40);
    const tips = [
      makeTip({ employee_id: profile.id, shift_date: "2026-07-08", hours: 8, amount: 160, hourly_from_tips: 20 }),
      makeTip({ employee_id: profile.id, shift_date: "2026-07-09", hours: 8, amount: 640, hourly_from_tips: 80 }),
    ];

    const row = computeEmployeePayroll({
      wageType: profile.wage_type,
      rate: Number(profile.hourly_rate),
      tips: tips.map((t) => ({ hours: t.hours, amount: t.amount, hourly_from_tips: t.hourly_from_tips })),
      bonusSum: 0,
      attendanceHours: 0,
    });

    expect(row.tips).toBe(800);
    expect(row.topup).toBe(160); // רק המשמרת של 20 ₪/שעה הושלמה ל-40
    expect(row.total).toBe(960);
  });

  it("אחראי משמרת: שכר שעתי + אחוז קופה + מפרעה שהמנהלת רשמה", () => {
    const attendance = [
      makeAttendance({ employeeId: USER.shiftManager, date: "2026-07-08", from: 16, to: 23.5 }),
    ];
    const bonuses = [
      makeShiftBonus({
        employee_id: USER.shiftManager,
        shift_date: "2026-07-08",
        shift_template_id: TPL.evening,
        amount: 180,
      }),
    ];

    const rows = buildEmployeeShiftRows({
      isTips: false,
      rate: 60,
      attendance,
      tips: [],
      bonuses,
      templates: shiftTemplates,
    });
    const totals = sumShiftRowTotals(rows);
    expect(totals.hours).toBe(7.5);
    expect(totals.earned).toBe(7.5 * 60 + 180);

    const net = withPayrollAdjustments(
      computeEmployeePayroll({
        wageType: "hourly",
        rate: 60,
        tips: [],
        bonusSum: 180,
        attendanceHours: 7.5,
      }),
      { advance: 300 },
    );
    expect(net.grossPay).toBe(630);
    expect(net.total).toBe(330);
  });

  it("ספירת המשמרות בייצוא תואמת לסוג השכר שהמנהל בחר", () => {
    const attendance = [
      { employee_id: USER.employee, clock_in: "2026-07-08T08:00:00", clock_out: "2026-07-08T16:00:00" },
      { employee_id: USER.employee, clock_in: "2026-07-09T08:00:00", clock_out: "2026-07-09T16:00:00" },
    ];
    const tips = [{ employee_id: USER.employee }];
    expect(countEmployeeShifts("hourly", USER.employee, attendance, tips)).toBe(2);
    expect(countEmployeeShifts("tips", USER.employee, attendance, tips)).toBe(1);
  });
});
