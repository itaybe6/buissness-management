/**
 * מה שהמנהל עושה → מה שקורה לעובד: דוח סגירת המשמרת.
 *
 * זה המסלול שבו כסף אמיתי נוצר. אחראי המשמרת מזין קופה וטיפים, המערכת בונה
 * את הצוות מההחתמות, מחלקת את הקופה לפי שעות, ושומרת שורות טיפים ובונוס
 * שנכנסות לתלוש. הבדיקות כאן עוקבות אחרי כל השרשרת מקצה לקצה.
 */
import { describe, expect, it } from "vitest";
import {
  buildTeamMembersFromShift,
  buildTipParticipantsFromShift,
  computeTipsHourly,
  distributeTips,
  getAttendanceHoursForShiftReport,
  getAttendanceTimeRangeForShiftReport,
  hoursBetweenTimes,
  normalizeTimeInputValue,
  templateDurationHours,
} from "@/lib/shiftReportTips";
import { buildShiftPayRows } from "@/lib/shiftReportPay";
import {
  buildBonusCandidatesFromShift,
  filterBonusParticipantsToWorkedShift,
} from "@/lib/shiftReportBonuses";
import { computeEmployeePayroll } from "@/lib/payrollCompute";
import {
  TPL,
  USER,
  hourlyEmployee,
  makeAssignment,
  makeAttendance,
  makeOpenAttendance,
  shiftTemplates,
  tipsEmployee,
} from "../helpers/factories";
import type { Profile } from "@/types/database";

const REPORT_DATE = "2026-07-08";

/** צוות ערב: שני מלצרים (טיפים) ובר-מן שעתי. */
const waiterA = tipsEmployee(USER.employee, 40, { full_name: "דנה" });
const waiterB = tipsEmployee(USER.employee2, 40, { full_name: "יוסי" });
const barman = hourlyEmployee(USER.employee3, 55, { full_name: "רון" });
const shiftLead = hourlyEmployee(USER.shiftManager, 60, { full_name: "מאיה", role: "shift_manager", bonus_pct: 1 });

const profileById = new Map<string, Profile>([
  [waiterA.id, waiterA],
  [waiterB.id, waiterB],
  [barman.id, barman],
  [shiftLead.id, shiftLead],
]);
const userName = (id: string) => profileById.get(id)?.full_name ?? id;

const assignments = [waiterA, waiterB, barman, shiftLead].map((p) =>
  makeAssignment({ employee_id: p.id, shift_date: REPORT_DATE, shift_template_id: TPL.evening }),
);

/** דנה 5 שעות, יוסי 3 שעות, רון 5 שעות, מאיה 5 שעות. */
const attendance = [
  makeAttendance({ employeeId: waiterA.id, date: REPORT_DATE, from: 18, to: 23 }),
  makeAttendance({ employeeId: waiterB.id, date: REPORT_DATE, from: 20, to: 23 }),
  makeAttendance({ employeeId: barman.id, date: REPORT_DATE, from: 18, to: 23 }),
  makeAttendance({ employeeId: shiftLead.id, date: REPORT_DATE, from: 18, to: 23 }),
];

const shiftInput = {
  reportDate: REPORT_DATE,
  shiftTemplateId: TPL.evening,
  assignments,
  attendance,
  templates: shiftTemplates,
};

describe("המערכת בונה למנהל את צוות המשמרת מההחתמות", () => {
  it("כל מי שהחתים בתוך חלון המשמרת נכנס לצוות, עם השעות שלו", () => {
    const team = buildTeamMembersFromShift(shiftInput);
    expect(team).toHaveLength(4);
    const byId = new Map(team.map((t) => [t.employee_id, t]));
    expect(byId.get(waiterA.id)?.hours).toBe(5);
    expect(byId.get(waiterB.id)?.hours).toBe(3);
  });

  it("חלון העבודה מוצג למנהל לעריכה", () => {
    const range = getAttendanceTimeRangeForShiftReport({
      attendance,
      employeeId: waiterA.id,
      reportDate: REPORT_DATE,
      shiftTemplateId: TPL.evening,
      templates: shiftTemplates,
    });
    expect(range).toMatchObject({ work_start: "18:00", work_end: "23:00", hours: 5 });
  });

  it("עובד ששובץ אבל לא הגיע לא נכנס לצוות", () => {
    const team = buildTeamMembersFromShift({
      ...shiftInput,
      attendance: attendance.filter((a) => a.employee_id !== waiterB.id),
    });
    expect(team.map((t) => t.employee_id)).not.toContain(waiterB.id);
  });

  it("עובד שהחתים בבוקר לא נכנס לדוח של משמרת הערב", () => {
    const morningOnly = [makeAttendance({ employeeId: waiterB.id, date: REPORT_DATE, from: 8, to: 15 })];
    const team = buildTeamMembersFromShift({
      ...shiftInput,
      attendance: [...attendance.filter((a) => a.employee_id !== waiterB.id), ...morningOnly],
    });
    expect(team.map((t) => t.employee_id)).not.toContain(waiterB.id);
  });

  it("החתמה פתוחה (עדיין במשמרת) לא נספרת בשעות הדוח", () => {
    const withOpen = [...attendance, makeOpenAttendance("emp-ghost", REPORT_DATE, 19)];
    const team = buildTeamMembersFromShift({ ...shiftInput, attendance: withOpen });
    expect(team.map((t) => t.employee_id)).not.toContain("emp-ghost");
  });

  it("שעות שנספרות נחתכות לחלון המשמרת, לא למשך ההחתמה המלא", () => {
    const early = [makeAttendance({ employeeId: waiterA.id, date: REPORT_DATE, from: 15, to: 23 })];
    const hours = getAttendanceHoursForShiftReport({
      attendance: early,
      employeeId: waiterA.id,
      reportDate: REPORT_DATE,
      shiftTemplateId: TPL.evening,
      templates: shiftTemplates,
    });
    expect(hours).toBe(5); // 18:00–23:00 בלבד
  });

  it("רק עובדי טיפים נכנסים לרשימת מקבלי הקופה", () => {
    const participants = buildTipParticipantsFromShift({
      ...shiftInput,
      tipEmployeeIds: new Set([waiterA.id, waiterB.id]),
    });
    expect(participants.map((p) => p.employee_id).sort()).toEqual([waiterA.id, waiterB.id].sort());
  });
});

describe("המנהל מזין קופת טיפים — החלוקה לעובדים", () => {
  const participants = [
    { employee_id: waiterA.id, hours: 5 },
    { employee_id: waiterB.id, hours: 3 },
  ];

  it("התעריף לשעה הוא הקופה חלקי סך השעות", () => {
    expect(computeTipsHourly(800, participants)).toBe(100);
  });

  it("כל אחד מקבל לפי השעות שעבד", () => {
    const tips = distributeTips(800, participants);
    expect(tips).toEqual([
      { employee_id: waiterA.id, hours: 5, amount: 500, hourly_from_tips: 100 },
      { employee_id: waiterB.id, hours: 3, amount: 300, hourly_from_tips: 100 },
    ]);
  });

  it("כל הקופה מחולקת — לא נשאר עודף", () => {
    const tips = distributeTips(800, participants);
    expect(tips.reduce((s, t) => s + t.amount, 0)).toBe(800);
  });

  it("קופה שלא מתחלקת יפה מתחלקת לאגורות עם סטייה זניחה", () => {
    const three = [
      { employee_id: "a", hours: 5 },
      { employee_id: "b", hours: 3 },
      { employee_id: "c", hours: 2.5 },
    ];
    const tips = distributeTips(1000, three);
    const sum = tips.reduce((s, t) => s + t.amount, 0);
    expect(Math.abs(sum - 1000)).toBeLessThan(0.05);
  });

  it("בלי שעות בכלל אין חלוקה ואין חלוקה באפס", () => {
    expect(computeTipsHourly(800, [])).toBe(0);
    expect(distributeTips(800, [])).toEqual([]);
    expect(distributeTips(800, [{ employee_id: "a", hours: 0 }])).toEqual([]);
  });

  it("קופה אפס מייצרת שורות אפס — העובד עדיין יקבל השלמה למינימום", () => {
    const tips = distributeTips(0, participants);
    expect(tips.every((t) => t.amount === 0)).toBe(true);
  });
});

describe("המנהל מתקן שעות בדוח — והשכר משתנה", () => {
  it("הקטנת השעות של עובד מגדילה את חלקם של האחרים", () => {
    const original = distributeTips(800, [
      { employee_id: waiterA.id, hours: 5 },
      { employee_id: waiterB.id, hours: 3 },
    ]);
    const corrected = distributeTips(800, [
      { employee_id: waiterA.id, hours: 5 },
      { employee_id: waiterB.id, hours: 1 },
    ]);
    expect(original.find((t) => t.employee_id === waiterA.id)!.amount).toBe(500);
    expect(corrected.find((t) => t.employee_id === waiterA.id)!.amount).toBeCloseTo(666.65, 1);
  });

  it("שורת התשלום מציגה את השעות שהמנהל קבע, לא את שעות ההחתמה", () => {
    const rows = buildShiftPayRows({
      team: [{ employee_id: waiterA.id, hours: 4, attendance_hours: 5 }],
      tipByEmployee: new Map([[waiterA.id, { amount: 400, hourly_from_tips: 100 }]]),
      profileById,
      userName,
      tipsHourly: 100,
    });
    expect(rows[0].hours).toBe(4);
    expect(rows[0].amount).toBe(400);
  });

  it("שעות מתוקנות נשמרות בפורמט תקין", () => {
    expect(normalizeTimeInputValue("18:30")).toBe("18:30");
    expect(normalizeTimeInputValue("8:5")).toBe("");
    expect(normalizeTimeInputValue("99:99")).toBe("23:59");
    expect(normalizeTimeInputValue(null)).toBe("");
  });

  it("הפרש שעות בין שתי שעות מטפל גם במעבר חצות", () => {
    expect(hoursBetweenTimes("18:00", "23:00")).toBe(5);
    expect(hoursBetweenTimes("22:00", "02:00")).toBe(4);
    expect(hoursBetweenTimes("לא", "שעה")).toBe(0);
  });

  it("אורך משמרת מהתבנית מחושב נכון גם למשמרת לילה", () => {
    expect(templateDurationHours("18:00", "23:00")).toBe(5);
    expect(templateDurationHours("22:00", "06:00")).toBe(8);
  });
});

describe("המנהל מסמן מקבלי תוספת קופה — והשרת מסנן", () => {
  it("רק מי שעבד במשמרת מוצע כמועמד", () => {
    const candidates = buildBonusCandidatesFromShift(shiftInput);
    expect(candidates.sort()).toEqual([waiterA.id, waiterB.id, barman.id, shiftLead.id].sort());
  });

  it("עובד שלא הגיע לא מוצע", () => {
    const candidates = buildBonusCandidatesFromShift({
      ...shiftInput,
      attendance: attendance.filter((a) => a.employee_id !== waiterB.id),
    });
    expect(candidates).not.toContain(waiterB.id);
  });

  it("אם המנהל בכל זאת סימן מישהו שלא עבד — הסינון מסיר אותו לפני השמירה", () => {
    const kept = filterBonusParticipantsToWorkedShift([shiftLead.id, "emp-outsider"], shiftInput);
    expect(kept).toEqual([shiftLead.id]);
  });

  it("בלי בחירת משמרת אי אפשר לשמור תוספות בכלל", () => {
    const kept = filterBonusParticipantsToWorkedShift([shiftLead.id], {
      ...shiftInput,
      shiftTemplateId: null,
    });
    expect(kept).toEqual([]);
  });
});

describe("מקצה לקצה: מהדוח של המנהל אל התלוש של העובד", () => {
  it("מלצרית עם משמרת חלשה — הדוח נותן טיפים, השכר משלים למינימום", () => {
    const team = buildTeamMembersFromShift(shiftInput);
    const tipParticipants = team.filter((t) => [waiterA.id, waiterB.id].includes(t.employee_id));

    // המנהל הזין קופה דלה: 200 ₪ על 8 שעות צוות
    const tips = distributeTips(200, tipParticipants);
    const danaTip = tips.find((t) => t.employee_id === waiterA.id)!;
    expect(danaTip.amount).toBe(125); // 5 שעות × 25 ₪

    const payroll = computeEmployeePayroll({
      wageType: "tips",
      rate: Number(waiterA.hourly_rate),
      tips: [{ hours: danaTip.hours, amount: danaTip.amount, hourly_from_tips: danaTip.hourly_from_tips }],
      bonusSum: 0,
      attendanceHours: 0,
    });

    expect(payroll.tips).toBe(125);
    expect(payroll.topup).toBe(75); // 5×40 − 125
    expect(payroll.total).toBe(200); // הרצפה של 40 ₪ לשעה
  });

  it("מלצרית עם משמרת חזקה — בלי השלמה", () => {
    const team = buildTeamMembersFromShift(shiftInput);
    const tipParticipants = team.filter((t) => [waiterA.id, waiterB.id].includes(t.employee_id));
    const tips = distributeTips(1600, tipParticipants);
    const danaTip = tips.find((t) => t.employee_id === waiterA.id)!;

    const payroll = computeEmployeePayroll({
      wageType: "tips",
      rate: Number(waiterA.hourly_rate),
      tips: [{ hours: danaTip.hours, amount: danaTip.amount, hourly_from_tips: danaTip.hourly_from_tips }],
      bonusSum: 0,
      attendanceHours: 0,
    });

    expect(payroll.topup).toBe(0);
    expect(payroll.total).toBe(1000); // 5 שעות × 200 ₪
  });

  it("בר-מן שעתי לא מקבל מהקופה — רק שעות × תעריף", () => {
    const rows = buildShiftPayRows({
      team: buildTeamMembersFromShift(shiftInput),
      tipByEmployee: new Map([
        [waiterA.id, { amount: 500, hourly_from_tips: 100 }],
        [waiterB.id, { amount: 300, hourly_from_tips: 100 }],
      ]),
      profileById,
      userName,
      tipsHourly: 100,
    });
    const ron = rows.find((r) => r.employee_id === barman.id)!;
    expect(ron.onTips).toBe(false);
    expect(ron.amount).toBe(5 * 55);
    expect(ron.fromTips).toBe(0);
  });

  it("אחראית המשמרת מקבלת שכר שעתי + אחוז קופה מהמחזור", () => {
    const totalSales = 24_000;
    const kept = filterBonusParticipantsToWorkedShift([shiftLead.id], shiftInput);
    expect(kept).toEqual([shiftLead.id]);

    const bonus = Math.round(totalSales * (Number(shiftLead.bonus_pct) / 100) * 100) / 100;
    expect(bonus).toBe(240);

    const payroll = computeEmployeePayroll({
      wageType: "hourly",
      rate: Number(shiftLead.hourly_rate),
      tips: [],
      bonusSum: bonus,
      attendanceHours: 5,
    });
    expect(payroll.base).toBe(300);
    expect(payroll.total).toBe(540);
  });

  it("סך מה שהעסק שילם על המשמרת מכסה את כל הצוות", () => {
    const team = buildTeamMembersFromShift(shiftInput);
    const tipParticipants = team.filter((t) => [waiterA.id, waiterB.id].includes(t.employee_id));
    const tips = distributeTips(800, tipParticipants);
    const tipByEmployee = new Map(tips.map((t) => [t.employee_id, { amount: t.amount, hourly_from_tips: t.hourly_from_tips }]));

    const rows = buildShiftPayRows({
      team,
      tipByEmployee,
      profileById,
      userName,
      tipsHourly: computeTipsHourly(800, tipParticipants),
    });

    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.amount > 0)).toBe(true);
    expect(rows.every((r) => !r.rateMissing)).toBe(true);
    expect(rows.every((r) => r.name && r.name !== r.employee_id)).toBe(true);
  });
});
