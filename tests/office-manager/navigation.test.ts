/**
 * ממשק מנהלת המשרד — מה היא רואה ומה חסום בפניה.
 *
 * מנהלת המשרד היא התפקיד הרגיש ביותר מבחינת הרשאות: היא רואה שכר של כל
 * העסק ומחירי ספקים, אבל אינה בונה סידור עבודה ואינה נוגעת בהגדרות העסק.
 */
import { describe, expect, it } from "vitest";
import {
  DOCUMENTS_EDIT_ROLES,
  DOCUMENTS_OVERVIEW_ROLES,
  INVENTORY_PRICE_ROLES,
  MANAGER_ROLES,
  OFFICE_RECEIPTS_ROLES,
  SCHEDULER_ROLES,
  TASK_CREATE_ROLES,
  USER_MANAGE_ROLES,
  canForceEmployeeClockOut,
  canSeeInventoryPrices,
  getHomePath,
  visibleNavItems,
} from "@/lib/constants";
import { ALL_FEATURE_KEYS } from "@/lib/features";
import type { FeatureKey } from "@/types/database";

function featuresOn(...keys: FeatureKey[]) {
  const set = new Set(keys);
  return (key: FeatureKey) => set.has(key);
}
const ALL_ON = featuresOn(...ALL_FEATURE_KEYS);

const officeKeys = (hasFeature = ALL_ON) => visibleNavItems("office_manager", hasFeature).map((i) => i.key);

describe("תפריט מנהלת המשרד", () => {
  it("רואה דשבורד, משתמשים, מסמכים, שכר, משימות, סחורות, ספקים ואירועים", () => {
    expect(officeKeys()).toEqual(
      expect.arrayContaining([
        "dashboard",
        "users",
        "agreements",
        "payroll",
        "my-shifts",
        "tasks",
        "inventory",
        "suppliers",
        "events",
      ]),
    );
  });

  it("נוחתת על הדשבורד הניהולי", () => {
    expect(getHomePath("office_manager")).toBe("/dashboard");
    const dashboard = visibleNavItems("office_manager", ALL_ON).find((i) => i.key === "dashboard");
    expect(dashboard?.label).toBe("דשבורד");
  });

  it.each([
    ["shifts", "בניית סידור עבודה"],
    ["shift-reports", "דוח סגירת קופה"],
    ["attendance", "שעון הנוכחות של כל העסק"],
    ["faults", "תקלות"],
    ["settings", "הגדרות עסק"],
    ["platform", "ניהול פלטפורמה"],
  ])("לא רואה %s (%s)", (key) => {
    expect(officeKeys()).not.toContain(key);
  });

  it("כיבוי מודול השכר מעלים את מסך השכר", () => {
    expect(officeKeys(featuresOn("inventory", "tasks"))).not.toContain("payroll");
  });

  it("כיבוי מודול הסחורות מעלים גם את הספקים", () => {
    const keys = officeKeys(featuresOn("payroll", "tasks"));
    expect(keys).not.toContain("inventory");
    expect(keys).not.toContain("suppliers");
  });

  it("כשכל המודולים כבויים נשארים רק דשבורד, מעקב שכר אישי ומשתמשים", () => {
    expect(officeKeys(() => false)).toEqual(["dashboard", "my-shifts", "users"]);
  });
});

describe("הרשאות פעולה של מנהלת המשרד", () => {
  it("מנהלת משרד את מחירי הספקים רואה — עובד לא", () => {
    expect(INVENTORY_PRICE_ROLES).toContain("office_manager");
    expect(canSeeInventoryPrices("office_manager")).toBe(true);
    expect(canSeeInventoryPrices("employee")).toBe(false);
    expect(canSeeInventoryPrices("shift_manager")).toBe(false);
  });

  it("ערך לא מוכר / ריק לא מקבל גישה למחירים", () => {
    expect(canSeeInventoryPrices(null)).toBe(false);
    expect(canSeeInventoryPrices(undefined)).toBe(false);
    expect(canSeeInventoryPrices("")).toBe(false);
    expect(canSeeInventoryPrices("admin")).toBe(false);
  });

  it("יכולה לנהל משתמשים ולהעלות חשבוניות משרד", () => {
    expect(USER_MANAGE_ROLES).toContain("office_manager");
    expect(OFFICE_RECEIPTS_ROLES).toContain("office_manager");
  });

  it("רואה את סקירת מסמכי העובדים אבל לא עורכת תבניות", () => {
    expect(DOCUMENTS_OVERVIEW_ROLES).toContain("office_manager");
    expect(DOCUMENTS_EDIT_ROLES).not.toContain("office_manager");
  });

  it("אינה בונה סידור עבודה ואינה נחשבת ל«מנהל משמרת»", () => {
    expect(SCHEDULER_ROLES).not.toContain("office_manager");
    expect(MANAGER_ROLES).not.toContain("office_manager");
  });

  it("אינה יכולה להחתים יציאה כפויה לעובד", () => {
    expect(canForceEmployeeClockOut("office_manager")).toBe(false);
    expect(canForceEmployeeClockOut("manager")).toBe(true);
    expect(canForceEmployeeClockOut("shift_manager")).toBe(true);
    expect(canForceEmployeeClockOut(null)).toBe(false);
  });

  it("יצירת תבניות משימה קבועות שמורה למנהל בלבד", () => {
    expect(TASK_CREATE_ROLES).toEqual(["manager"]);
  });
});

describe("הפרדה בין תפקידים — אף אחד לא רואה את הכול", () => {
  it("רק מנהל רואה את הגדרות העסק", () => {
    for (const role of ["office_manager", "shift_manager", "employee", "maintenance", "event_manager"] as const) {
      expect(visibleNavItems(role, ALL_ON).map((i) => i.key)).not.toContain("settings");
    }
    expect(visibleNavItems("manager", ALL_ON).map((i) => i.key)).toContain("settings");
  });

  it("מסכי הפלטפורמה שמורים לסופר אדמין", () => {
    const platformKeys = ["platform", "businesses", "platform-users"];
    for (const role of ["manager", "office_manager", "shift_manager", "employee", "maintenance"] as const) {
      const keys = visibleNavItems(role, ALL_ON).map((i) => i.key);
      for (const pk of platformKeys) expect(keys).not.toContain(pk);
    }
    expect(visibleNavItems("super_admin", () => true).map((i) => i.key)).toEqual(
      expect.arrayContaining(platformKeys),
    );
  });

  it("מסך השכר פתוח רק למנהל ולמנהלת המשרד", () => {
    for (const role of ["shift_manager", "employee", "maintenance", "event_manager"] as const) {
      expect(visibleNavItems(role, ALL_ON).map((i) => i.key)).not.toContain("payroll");
    }
    expect(visibleNavItems("manager", ALL_ON).map((i) => i.key)).toContain("payroll");
    expect(visibleNavItems("office_manager", ALL_ON).map((i) => i.key)).toContain("payroll");
  });
});
