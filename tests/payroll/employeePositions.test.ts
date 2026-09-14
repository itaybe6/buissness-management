/**
 * ריבוי תפקידים לעובד (employee_positions).
 *
 * עובד יכול להיות גם מלצר (טיפים) וגם אחראי משמרת (שעתי). בכניסה למשמרת הוא
 * בוחר תפקיד, וההחתמה/הטיפ/הבונוס נרשמים עם `position_id`. בשכר כל תפקיד הוא
 * שורה נפרדת עם מודל השכר שלו; התאמות חודשיות ותקלות נופלות רק על שורה אחת.
 * רשומות ישנות בלי position_id מתפזרות לפי מודל השכר ואז לתפקיד הראשי.
 */
import { describe, expect, it } from "vitest";
import {
  accessRoleForPositions,
  attendancePosition,
  bonusPosition,
  findDuplicatePositionDraft,
  hasTipsPosition,
  isLegacyPositionId,
  legacyPositionFromProfile,
  newPositionDraft,
  positionLabel,
  positionsForEmployee,
  resolvePosition,
  sortPositions,
  tipPosition,
} from "@/lib/employeePositions";
import { buildPayrollPositionRows } from "@/lib/payrollPositions";
import { buildEmployeeShiftRowsByPosition } from "@/lib/payrollShiftRows";
import {
  buildBonusParticipantsFromTeamPositions,
  computeBonusPayouts,
} from "@/lib/shiftReportBonuses";
import { buildShiftPayRows } from "@/lib/shiftReportPay";
import {
  buildTeamMembersFromShift,
  dominantPositionId,
  distributeTips,
} from "@/lib/shiftReportTips";
import {
  DEPT,
  USER,
  hourlyPosition,
  makeAttendance,
  makeProfile,
  makeShiftBonus,
  makeTip,
  shiftTemplates,
  tipsEmployee,
  tipsPosition,
} from "../helpers/factories";

const E = USER.employee;
const DATE = "2026-07-08";

/** מלצר על טיפים (מינ׳ 35) + אחראי משמרת שעתי 45 ₪ עם 1% קופה. */
function waiterAndShiftManager() {
  const waiter = tipsPosition(E, 35, { id: "pos-waiter", role: "employee", department_id: DEPT.service });
  const sm = hourlyPosition(E, 45, {
    id: "pos-sm",
    role: "shift_manager",
    department_id: null,
    bonus_pct: 1,
  });
  return { waiter, sm, positions: [waiter, sm] };
}

describe("סדר תפקידים והרשאת גישה", () => {
  it("התפקיד הראשי הוא בעל ההרשאה הגבוהה, ורמת הגישה נגזרת ממנו", () => {
    const { waiter, sm, positions } = waiterAndShiftManager();
    expect(sortPositions([waiter, sm])[0].id).toBe(sm.id);
    expect(accessRoleForPositions(positions)).toBe("shift_manager");
    expect(accessRoleForPositions([waiter])).toBe("employee");
    expect(accessRoleForPositions([])).toBe("employee");
  });

  it("hasTipsPosition — מזהה אם יש לעובד לפחות תפקיד טיפים אחד", () => {
    const { waiter, sm } = waiterAndShiftManager();
    expect(hasTipsPosition([sm])).toBe(false);
    expect(hasTipsPosition([sm, waiter])).toBe(true);
  });

  it("positionLabel — עובד רגיל לפי מחלקה, שאר התפקידים לפי שם התפקיד", () => {
    const deptName = (id: string) => (id === DEPT.service ? "מלצרות" : null);
    expect(positionLabel({ role: "employee", department_id: DEPT.service }, deptName)).toBe("מלצרות");
    expect(positionLabel({ role: "employee", department_id: null }, deptName)).toBe("עובד");
    expect(positionLabel({ role: "shift_manager", department_id: null }, deptName)).toBe("אחראי משמרת");
    expect(positionLabel({ role: "shift_manager", department_id: DEPT.service }, deptName)).toBe("אחראי משמרת · מלצרות");
  });
});

describe("תאימות לאחור — עובד בלי תפקידים שמורים", () => {
  it("נופל לתפקיד סינתטי שנבנה מהפרופיל, ומזהה שהוא legacy", () => {
    const profile = tipsEmployee(E, 38, { bonus_pct: 2 });
    const positions = positionsForEmployee(profile, []);
    expect(positions).toHaveLength(1);
    const legacy = positions[0];
    expect(isLegacyPositionId(legacy.id)).toBe(true);
    expect(legacy).toMatchObject({ employee_id: E, wage_type: "tips", hourly_rate: 38, bonus_pct: 2, role: "employee" });
    expect(legacyPositionFromProfile(profile).id).toBe(legacy.id);
  });

  it("מסנן רק את התפקידים של העובד עצמו", () => {
    const { positions } = waiterAndShiftManager();
    const other = hourlyPosition(USER.employee2, 50, { id: "pos-other" });
    const mine = positionsForEmployee(makeProfile({ id: E }), [...positions, other]);
    expect(mine.map((p) => p.id).sort()).toEqual(["pos-sm", "pos-waiter"]);
  });
});

describe("resolvePosition — שיוך רשומה לתפקיד", () => {
  const { waiter, sm, positions } = waiterAndShiftManager();

  it("position_id מדויק מנצח", () => {
    expect(resolvePosition("pos-waiter", positions).id).toBe(waiter.id);
    expect(attendancePosition({ position_id: "pos-waiter" }, positions).id).toBe(waiter.id);
  });

  it("רשומה ישנה בלי position_id: החתמה → ראשי, טיפ → תפקיד טיפים, בונוס → תפקיד עם אחוז קופה", () => {
    expect(attendancePosition({ position_id: null }, positions).id).toBe(sm.id);
    expect(tipPosition({ position_id: null }, positions).id).toBe(waiter.id);
    expect(bonusPosition({ position_id: undefined }, positions).id).toBe(sm.id);
  });

  it("position_id של תפקיד שנמחק מתנהג כמו רשומה ישנה", () => {
    expect(tipPosition({ position_id: "pos-deleted" }, positions).id).toBe(waiter.id);
  });

  it("זורק כשאין תפקידים בכלל", () => {
    expect(() => resolvePosition(null, [])).toThrow();
  });
});

describe("buildPayrollPositionRows — שורת שכר לכל תפקיד", () => {
  const employee = { id: E, full_name: "דנה", pension_active: true };

  it("מלצר+אחראי משמרת: שתי שורות, כל אחת במודל השכר שלה", () => {
    const { positions } = waiterAndShiftManager();
    const attendance = [
      { ...makeAttendance({ employeeId: E, date: "2026-07-01", from: 18, to: 23 }), position_id: "pos-waiter" },
      { ...makeAttendance({ employeeId: E, date: "2026-07-02", from: 18, to: 23 }), position_id: "pos-waiter" },
      { ...makeAttendance({ employeeId: E, date: "2026-07-03", from: 10, to: 18 }), position_id: "pos-sm" },
    ];
    const tips = [
      makeTip({ employee_id: E, shift_date: "2026-07-01", hours: 5, amount: 300, hourly_from_tips: 60, position_id: "pos-waiter" }),
      makeTip({ employee_id: E, shift_date: "2026-07-02", hours: 5, amount: 100, hourly_from_tips: 20, position_id: "pos-waiter" }),
    ];
    const bonuses = [makeShiftBonus({ employee_id: E, amount: 120, position_id: "pos-sm" })];

    const rows = buildPayrollPositionRows({
      employee,
      positions,
      attendance,
      tips,
      bonuses,
      faultPaySum: 200,
      adjustments: { monthlyBonus: 100, advance: 50, differences: 0 },
    });

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.positionCount === 2)).toBe(true);

    // הראשי (אחראי משמרת) ראשון ונושא את הפריטים ברמת העובד
    const [smRow, waiterRow] = rows;
    expect(smRow.positionId).toBe("pos-sm");
    expect(smRow.isPrimaryRow).toBe(true);
    expect(smRow.wageType).toBe("hourly");
    expect(smRow.hours).toBe(8);
    expect(smRow.base).toBe(360); // 8 × 45
    expect(smRow.bonus).toBe(120);
    expect(smRow.faultPay).toBe(200);
    expect(smRow.monthlyBonus).toBe(100);
    expect(smRow.advance).toBe(50);
    expect(smRow.shifts).toBe(1);

    expect(waiterRow.positionId).toBe("pos-waiter");
    expect(waiterRow.isPrimaryRow).toBe(false);
    expect(waiterRow.wageType).toBe("tips");
    expect(waiterRow.tips).toBe(400);
    // משמרת 2: 5 שע׳ × 20 ₪ < מינ׳ 35 → השלמה 75
    expect(waiterRow.topup).toBe(75);
    expect(waiterRow.faultPay).toBe(0);
    expect(waiterRow.monthlyBonus).toBe(0);
    expect(waiterRow.advance).toBe(0);
    expect(waiterRow.shifts).toBe(2);
    expect(waiterRow.id).toBe(`${E}:pos-waiter`);
  });

  it("תפקיד שלא נעבד בחודש לא מקבל שורה", () => {
    const { positions } = waiterAndShiftManager();
    const rows = buildPayrollPositionRows({
      employee,
      positions,
      attendance: [{ ...makeAttendance({ employeeId: E, from: 10, to: 18 }), position_id: "pos-sm" }],
      tips: [],
      bonuses: [],
    });
    expect(rows.map((r) => r.positionId)).toEqual(["pos-sm"]);
    expect(rows[0].isPrimaryRow).toBe(true);
    expect(rows[0].positionCount).toBe(1);
  });

  it("עובד בלי פעילות מקבל שורה ריקה אחת לתפקיד הראשי כדי להופיע בגיליון", () => {
    const { positions } = waiterAndShiftManager();
    const rows = buildPayrollPositionRows({ employee, positions, attendance: [], tips: [], bonuses: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0].positionId).toBe("pos-sm");
    expect(rows[0].total).toBe(0);
  });

  it("רשומות ישנות בלי position_id מחושבות בדיוק כמו קודם (תפקיד legacy יחיד)", () => {
    const profile = tipsEmployee(E, 35);
    const positions = positionsForEmployee(profile, []);
    const rows = buildPayrollPositionRows({
      employee,
      positions,
      attendance: [makeAttendance({ employeeId: E, from: 18, to: 23 })],
      tips: [makeTip({ employee_id: E, hours: 5, amount: 100, hourly_from_tips: 20 })],
      bonuses: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].wageType).toBe("tips");
    expect(rows[0].tips).toBe(100);
    expect(rows[0].topup).toBe(75);
    expect(isLegacyPositionId(rows[0].positionId)).toBe(true);
  });

  it("מתעלם מרשומות של עובדים אחרים", () => {
    const { positions } = waiterAndShiftManager();
    const rows = buildPayrollPositionRows({
      employee,
      positions,
      attendance: [{ ...makeAttendance({ employeeId: USER.employee2, from: 10, to: 18 }), position_id: "pos-sm" }],
      tips: [makeTip({ employee_id: USER.employee2, position_id: "pos-waiter" })],
      bonuses: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(0);
  });
});

describe("buildEmployeeShiftRowsByPosition — פירוט משמרות לפי תפקיד", () => {
  it("כל משמרת מסומנת בתפקיד שלה, ואפשר לסנן לתפקיד יחיד", () => {
    const { positions } = waiterAndShiftManager();
    const attendance = [
      { ...makeAttendance({ employeeId: E, date: "2026-07-01", from: 18, to: 23 }), position_id: "pos-waiter" },
      { ...makeAttendance({ employeeId: E, date: "2026-07-03", from: 10, to: 18 }), position_id: "pos-sm" },
    ];
    const tips = [
      makeTip({ employee_id: E, shift_date: "2026-07-01", hours: 5, amount: 300, hourly_from_tips: 60, position_id: "pos-waiter" }),
    ];

    const all = buildEmployeeShiftRowsByPosition({
      positions,
      attendance,
      tips,
      bonuses: [],
      templates: shiftTemplates,
    });
    expect(all).toHaveLength(2);
    expect(new Set(all.map((r) => r.positionId))).toEqual(new Set(["pos-waiter", "pos-sm"]));
    expect(all.every((r) => !!r.positionLabel)).toBe(true);

    const onlyWaiter = buildEmployeeShiftRowsByPosition({
      positions,
      attendance,
      tips,
      bonuses: [],
      templates: shiftTemplates,
      onlyPositionId: "pos-waiter",
    });
    expect(onlyWaiter).toHaveLength(1);
    expect(onlyWaiter[0].positionId).toBe("pos-waiter");
    expect(onlyWaiter[0].isTips).toBe(true);
    expect(onlyWaiter[0].tipAmount).toBe(300);
  });
});

describe("דוח משמרת — התפקיד נגזר מההחתמה", () => {
  it("dominantPositionId — התפקיד עם הכי הרבה שעות באותו יום", () => {
    const punches = [
      { ...makeAttendance({ employeeId: E, date: DATE, from: 10, to: 12 }), position_id: "pos-sm" },
      { ...makeAttendance({ employeeId: E, date: DATE, from: 17, to: 23 }), position_id: "pos-waiter" },
    ];
    expect(dominantPositionId(punches)).toBe("pos-waiter");
    expect(dominantPositionId([makeAttendance({ employeeId: E, date: DATE })])).toBeNull();
    expect(dominantPositionId([])).toBeNull();
  });

  it("buildTeamMembersFromShift מצרף position_id לכל חבר צוות שהחתים עם תפקיד", () => {
    const attendance = [
      { ...makeAttendance({ employeeId: E, date: DATE, from: 18, to: 23 }), position_id: "pos-waiter" },
      makeAttendance({ employeeId: USER.employee2, date: DATE, from: 18, to: 23 }),
    ];
    const team = buildTeamMembersFromShift({
      reportDate: DATE,
      shiftTemplateId: "",
      assignments: [],
      attendance,
      templates: [],
    });
    const mine = team.find((p) => p.employee_id === E);
    const other = team.find((p) => p.employee_id === USER.employee2);
    expect(mine?.position_id).toBe("pos-waiter");
    expect(other?.position_id ?? null).toBeNull();
  });

  it("distributeTips מעביר את position_id לשורות הטיפים", () => {
    const rows = distributeTips(600, [
      { employee_id: E, hours: 5, position_id: "pos-waiter" },
      { employee_id: USER.employee2, hours: 5 },
    ]);
    expect(rows.find((r) => r.employee_id === E)?.position_id).toBe("pos-waiter");
    expect(rows.find((r) => r.employee_id === USER.employee2)).not.toHaveProperty("position_id");
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(600);
  });

  it("buildShiftPayRows — מלצר/אחראי משמרת שנכנס כאחראי מקבל שעתי 45 ולא טיפים", () => {
    const { positions } = waiterAndShiftManager();
    const profile = tipsEmployee(E, 35, { full_name: "דנה" });
    const rows = buildShiftPayRows({
      team: [{ employee_id: E, hours: 8, position_id: "pos-sm" }],
      tipByEmployee: new Map(),
      profileById: new Map([[E, profile]]),
      userName: () => "דנה",
      tipsHourly: 60,
      positionsByEmployee: () => positions,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ onTips: false, hours: 8, hourly: 45, amount: 360 });
  });

  it("buildShiftPayRows — אותו עובד שנכנס כמלצר מחושב על טיפים", () => {
    const { positions } = waiterAndShiftManager();
    const profile = makeProfile({ id: E, wage_type: "hourly", hourly_rate: 45 });
    const rows = buildShiftPayRows({
      team: [{ employee_id: E, hours: 5, position_id: "pos-waiter" }],
      tipByEmployee: new Map(),
      profileById: new Map([[E, profile]]),
      userName: () => "דנה",
      tipsHourly: 60,
      positionsByEmployee: () => positions,
    });
    expect(rows[0].onTips).toBe(true);
    // שכר שעתי מטיפים 60 > רצפת התפקיד 35 → 60 ₪/שע׳ בלי השלמה
    expect(rows[0].hourly).toBe(60);
    expect(rows[0].amount).toBe(300);
    expect(rows[0].topup).toBe(0);
  });

  it("buildShiftPayRows — כניסה כמלצר עם טיפים נמוכים מקבלת השלמה לרצפת התפקיד (35), לא של הפרופיל", () => {
    const { positions } = waiterAndShiftManager();
    const profile = makeProfile({ id: E, wage_type: "hourly", hourly_rate: 45 });
    const rows = buildShiftPayRows({
      team: [{ employee_id: E, hours: 5, position_id: "pos-waiter" }],
      tipByEmployee: new Map(),
      profileById: new Map([[E, profile]]),
      userName: () => "דנה",
      tipsHourly: 20,
      positionsByEmployee: () => positions,
    });
    expect(rows[0]).toMatchObject({ onTips: true, hourly: 35, amount: 175, fromTips: 100, topup: 75 });
  });

  it("בונוס קופה לפי התפקיד שנכנסו בו — כניסה כמלצר לא מזכה באחוז של אחראי המשמרת", () => {
    const { positions } = waiterAndShiftManager();
    const byEmployee = (id: string) => (id === E ? positions : []);

    const asWaiter = buildBonusParticipantsFromTeamPositions([{ employee_id: E, position_id: "pos-waiter" }], byEmployee);
    expect(asWaiter).toEqual([]);

    const asSm = buildBonusParticipantsFromTeamPositions([{ employee_id: E, position_id: "pos-sm" }], byEmployee);
    expect(asSm).toEqual([{ employee_id: E, bonus_pct: 1, position_id: "pos-sm" }]);

    // רשומה ישנה בלי תפקיד → נופלת לתפקיד שנושא אחוז
    const legacy = buildBonusParticipantsFromTeamPositions([{ employee_id: E }], byEmployee);
    expect(legacy).toEqual([{ employee_id: E, bonus_pct: 1, position_id: "pos-sm" }]);

    // אותו עובד פעמיים ברשימה → פעם אחת
    const dup = buildBonusParticipantsFromTeamPositions(
      [{ employee_id: E, position_id: "pos-sm" }, { employee_id: E, position_id: "pos-sm" }],
      byEmployee,
    );
    expect(dup).toHaveLength(1);
  });

  it("תפקיד legacy לא נשמר כ-position_id בבונוס", () => {
    const legacyPositions = positionsForEmployee(makeProfile({ id: E, bonus_pct: 2 }), []);
    const rows = buildBonusParticipantsFromTeamPositions([{ employee_id: E }], () => legacyPositions);
    expect(rows).toEqual([{ employee_id: E, bonus_pct: 2 }]);
  });

  it("computeBonusPayouts מעביר position_id לשורת התשלום", () => {
    const rows = computeBonusPayouts(10000, [
      { employee_id: E, bonus_pct: 1, position_id: "pos-sm" },
      { employee_id: USER.employee2, bonus_pct: 0.5 },
    ]);
    expect(rows[0]).toMatchObject({ employee_id: E, amount: 100, position_id: "pos-sm" });
    expect(rows[1]).not.toHaveProperty("position_id");
  });
});

describe("טפסי משתמש — טיוטות תפקידים", () => {
  it("מזהה כפילות של אותו תפקיד+מחלקה", () => {
    const a = newPositionDraft({ role: "employee", department_id: DEPT.bar });
    const b = newPositionDraft({ role: "employee", department_id: DEPT.bar });
    const c = newPositionDraft({ role: "employee", department_id: DEPT.kitchen });
    expect(findDuplicatePositionDraft([a, c])).toBeNull();
    expect(findDuplicatePositionDraft([a, b])).not.toBeNull();
  });
});
