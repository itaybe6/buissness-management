/**
 * המנהל מנהל את הצוות — הוספת עובד, תפקיד, מחלקה ותנאי שכר.
 *
 * כרטיס העובד הוא נקודת המוצא של כמעט כל דבר אחר במערכת: התפקיד קובע מה
 * הוא רואה, המחלקה קובעת אילו משימות מגיעות אליו, וסוג השכר קובע איך
 * מחושב התלוש. הבדיקות מוודאות שהקטלוג שלם ושכל שינוי מגיע ליעדו.
 */
import { describe, expect, it } from "vitest";
import {
  BONUS_ELIGIBLE_ROLES,
  DEFAULT_HOURLY_RATE,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  USER_MANAGE_ROLES,
  WAGE_TYPE_LABELS,
  getHomePath,
  visibleNavItems,
} from "@/lib/constants";
import { ALL_FEATURE_KEYS } from "@/lib/features";
import { buildTodayTasks, templateVisibleForDailyChecklist } from "@/lib/todayTasks";
import { computeEmployeePayroll } from "@/lib/payrollCompute";
import { aggregateDailyLaborCosts } from "@/lib/payrollDailyCost";
import { buildBonusParticipantsFromTeam } from "@/lib/shiftReportBonuses";
import {
  BUSINESS_ID,
  DEPT,
  USER,
  hourlyEmployee,
  makeAttendance,
  makeProfile,
  makeProfileForRole,
  makeTaskTemplate,
  shiftTemplates,
} from "../helpers/factories";
import type { FeatureKey, UserRole } from "@/types/database";

const ALL_ROLES: UserRole[] = [
  "super_admin",
  "manager",
  "shift_manager",
  "office_manager",
  "employee",
  "maintenance",
  "event_manager",
];
const ALL_ON = (k: FeatureKey) => ALL_FEATURE_KEYS.includes(k);

describe("קטלוג התפקידים", () => {
  it("לכל תפקיד יש תווית ותיאור בעברית", () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_LABELS[role], role).toBeTruthy();
      expect(ROLE_DESCRIPTIONS[role], role).toBeTruthy();
    }
  });

  it("התוויות ייחודיות — שני תפקידים לא נקראים אותו דבר", () => {
    const labels = ALL_ROLES.map((r) => ROLE_LABELS[r]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("לכל תפקיד יש מסך בית שקיים בתפריט שלו", () => {
    for (const role of ALL_ROLES) {
      const home = getHomePath(role).replace("/", "");
      expect(visibleNavItems(role, ALL_ON).map((i) => i.key), role).toContain(home);
    }
  });

  it("רק מנהל ומנהלת משרד מוסיפים ועורכים משתמשים", () => {
    expect(USER_MANAGE_ROLES).toEqual(["manager", "office_manager"]);
    for (const role of ["shift_manager", "employee", "maintenance", "event_manager"] as const) {
      expect(USER_MANAGE_ROLES).not.toContain(role);
    }
  });
});

describe("שינוי תפקיד משנה מיד את מה שהעובד רואה", () => {
  it("עובד → אחראי משמרת מוסיף מסכים", () => {
    const before = visibleNavItems("employee", ALL_ON).map((i) => i.key);
    const after = visibleNavItems("shift_manager", ALL_ON).map((i) => i.key);
    expect(after.length).toBeGreaterThan(before.length);
    expect(after).toContain("shift-reports");
  });

  it("עובד → איש אחזקה מוריד כמעט הכול", () => {
    expect(visibleNavItems("maintenance", ALL_ON).map((i) => i.key)).toEqual(["faults", "my-shifts"]);
  });

  it("שינוי תפקיד משנה גם את מסך הנחיתה", () => {
    expect(getHomePath("employee")).not.toBe(getHomePath("maintenance"));
  });

  it("פרופיל לכל תפקיד נבנה עם השיוך הנכון לעסק", () => {
    for (const role of ALL_ROLES) {
      const profile = makeProfileForRole(role);
      expect(profile.role).toBe(role);
      if (role === "super_admin") expect(profile.business_id).toBeNull();
      else expect(profile.business_id).toBe(BUSINESS_ID);
    }
  });
});

describe("שיוך העובד למחלקה", () => {
  const TODAY = "2026-07-08";
  const WEDNESDAY = 3;
  const barTemplate = makeTaskTemplate({ id: "tpl-bar", title: "סגירת בר", department_id: DEPT.bar });
  const kitchenTemplate = makeTaskTemplate({ id: "tpl-kitchen", title: "ניקוי מטבח", department_id: DEPT.kitchen });
  const globalTemplate = makeTaskTemplate({ id: "tpl-all", title: "נעילה", department_id: null });
  const templates = [barTemplate, kitchenTemplate, globalTemplate];

  const checklistFor = (deptId: string | null, role: UserRole = "employee") =>
    buildTodayTasks(BUSINESS_ID, [], templates, USER.employee, deptId, TODAY, WEDNESDAY, role).map((t) => t.title);

  it("עובד בר רואה את משימות הבר ואת הכלליות", () => {
    expect(checklistFor(DEPT.bar).sort()).toEqual(["נעילה", "סגירת בר"].sort());
  });

  it("העברה למטבח מחליפה את הרשימה", () => {
    expect(checklistFor(DEPT.kitchen).sort()).toEqual(["ניקוי מטבח", "נעילה"].sort());
  });

  it("הסרת המחלקה משאירה רק את הכלליות", () => {
    expect(checklistFor(null)).toEqual(["נעילה"]);
  });

  it("מנהל בלי מחלקה רואה את כל התבניות", () => {
    expect(checklistFor(null, "manager").sort()).toEqual(["ניקוי מטבח", "נעילה", "סגירת בר"].sort());
  });

  it("איש אחזקה בלי מחלקה לא מקבל תבניות מחלקתיות", () => {
    expect(templateVisibleForDailyChecklist(barTemplate, null, "maintenance")).toBe(false);
  });

  it("מחלקה שנמחקה מתנהגת כמו «בלי מחלקה»", () => {
    expect(checklistFor("dept-deleted")).toEqual(["נעילה"]);
  });
});

describe("תנאי השכר בכרטיס העובד", () => {
  it("שתי אפשרויות שכר, שתיהן עם תווית", () => {
    expect(WAGE_TYPE_LABELS).toEqual({ hourly: "שעתי", tips: "טיפים" });
  });

  it("עובד חדש נפתח בשכר המינימום השעתי", () => {
    expect(DEFAULT_HOURLY_RATE).toBe(35.4);
    expect(makeProfile().hourly_rate).toBe(DEFAULT_HOURLY_RATE);
    expect(makeProfile().wage_type).toBe("hourly");
  });

  it("שינוי סוג השכר משנה את מקור השעות בתלוש", () => {
    const asHourly = computeEmployeePayroll({
      wageType: "hourly",
      rate: 50,
      tips: [],
      bonusSum: 0,
      attendanceHours: 40,
    });
    const asTips = computeEmployeePayroll({
      wageType: "tips",
      rate: 50,
      tips: [{ hours: 30, amount: 2000, hourly_from_tips: 66.67 }],
      bonusSum: 0,
      attendanceHours: 40,
    });
    expect(asHourly.hours).toBe(40);
    expect(asTips.hours).toBe(30);
  });

  it("פנסיה פעילה היא שדה נפרד שלא משפיע על החישוב", () => {
    expect(makeProfile({ pension_active: true }).pension_active).toBe(true);
    const row = computeEmployeePayroll({
      wageType: "hourly",
      rate: 50,
      tips: [],
      bonusSum: 0,
      attendanceHours: 10,
    });
    expect(row.total).toBe(500);
  });

  it("תאריך לידה הוא שדה אופציונלי", () => {
    expect(makeProfile().birth_date).toBeNull();
    expect(makeProfile({ birth_date: "1998-04-12" }).birth_date).toBe("1998-04-12");
  });
});

describe("אחוז קופה — מי זכאי", () => {
  it("רק מנהל ואחראי משמרת", () => {
    expect(BONUS_ELIGIBLE_ROLES).toEqual(["manager", "shift_manager"]);
  });

  it("עובד עם אחוז שהוגדר בטעות עדיין נכנס לחישוב — הסינון הוא בבחירת המשתתפים", () => {
    const participants = buildBonusParticipantsFromTeam(
      [USER.employee],
      [{ id: USER.employee, bonus_pct: 1 }],
    );
    expect(participants).toEqual([{ employee_id: USER.employee, bonus_pct: 1 }]);
  });

  it("אחוז אפס או ריק לא מזכה", () => {
    expect(
      buildBonusParticipantsFromTeam(
        [USER.employee, USER.employee2],
        [
          { id: USER.employee, bonus_pct: 0 },
          { id: USER.employee2, bonus_pct: null },
        ],
      ),
    ).toEqual([]);
  });

  it("עובד שלא נמצא ברשימת הפרופילים לא מזכה", () => {
    expect(buildBonusParticipantsFromTeam([USER.employee3], [])).toEqual([]);
  });

  it("ברירת המחדל לעובד חדש היא בלי אחוז קופה", () => {
    expect(makeProfile().bonus_pct).toBe(0);
  });
});

describe("השבתת עובד", () => {
  const attendance = [makeAttendance({ employeeId: USER.employee, date: "2026-07-08", from: 8, to: 16 })];

  it("עובד פעיל נספר בעלות המעסיק", () => {
    const days = aggregateDailyLaborCosts({
      profiles: [hourlyEmployee(USER.employee, 50)],
      attendance,
      tips: [],
      bonuses: [],
      templates: shiftTemplates,
    });
    expect(days).toHaveLength(1);
  });

  it("עובד מושבת יורד מהדוח", () => {
    const days = aggregateDailyLaborCosts({
      profiles: [hourlyEmployee(USER.employee, 50, { active: false })],
      attendance,
      tips: [],
      bonuses: [],
      templates: shiftTemplates,
    });
    expect(days).toEqual([]);
  });

  it("גם סופר אדמין לא נספר בעלות של עסק", () => {
    const days = aggregateDailyLaborCosts({
      profiles: [hourlyEmployee(USER.superAdmin, 50, { role: "super_admin" })],
      attendance: [makeAttendance({ employeeId: USER.superAdmin, date: "2026-07-08", from: 8, to: 16 })],
      tips: [],
      bonuses: [],
      templates: shiftTemplates,
    });
    expect(days).toEqual([]);
  });

  it("ההשבתה לא מוחקת נתוני עבר — השעות עדיין קיימות", () => {
    expect(attendance[0].clock_out).toBeTruthy();
  });
});
