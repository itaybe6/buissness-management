/**
 * ממשק איש האחזקה — התפריט המצומצם ביותר במערכת.
 *
 * לפי הגדרת התפקיד הוא רואה «תקלות בלבד» (ובנוסף מעקב שכר אישי, כי הוא
 * מקבל תשלום לפי עבודה). כל דליפה מעבר לזה חושפת לו נתוני עסק שאינם שלו.
 */
import { describe, expect, it } from "vitest";
import {
  FAULTS_PAGE_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  canForceEmployeeClockOut,
  canSeeInventoryPrices,
  getHomePath,
  groupNavItems,
  visibleNavItems,
} from "@/lib/constants";
import { ALL_FEATURE_KEYS } from "@/lib/features";
import type { FeatureKey, UserRole } from "@/types/database";

function featuresOn(...keys: FeatureKey[]) {
  const set = new Set(keys);
  return (key: FeatureKey) => set.has(key);
}
const ALL_ON = featuresOn(...ALL_FEATURE_KEYS);

const maintenanceKeys = (hasFeature = ALL_ON) => visibleNavItems("maintenance", hasFeature).map((i) => i.key);

describe("תפריט איש האחזקה", () => {
  it("רואה בדיוק שני פריטים: תקלות ומעקב שכר", () => {
    expect(maintenanceKeys()).toEqual(["faults", "my-shifts"]);
  });

  it("פריט התקלות שלו יושב במקטע הראשי (זה מסך הבית שלו)", () => {
    const faults = visibleNavItems("maintenance", ALL_ON).find((i) => i.key === "faults");
    expect(faults?.group).toBe("overview");
    expect(faults?.label).toBe("תקלות");
  });

  it("נוחת ישירות על מסך התקלות אחרי התחברות", () => {
    expect(getHomePath("maintenance")).toBe("/faults");
  });

  it("כשמודול התקלות כבוי נשאר רק מעקב השכר", () => {
    expect(maintenanceKeys(featuresOn("payroll", "inventory", "shifts", "tasks"))).toEqual(["my-shifts"]);
  });

  it("הפעלת כל שאר המודולים לא מוסיפה לו כלום", () => {
    expect(maintenanceKeys(ALL_ON)).toEqual(maintenanceKeys(featuresOn("faults")));
  });

  it.each([
    ["dashboard", "דשבורד"],
    ["shifts", "סידור עבודה"],
    ["attendance", "שעון נוכחות"],
    ["tasks", "משימות"],
    ["inventory", "סחורות"],
    ["suppliers", "ספקים"],
    ["payroll", "שכר של כל העסק"],
    ["users", "משתמשים"],
    ["agreements", "מסמכים"],
    ["events", "אירועים"],
    ["shift-reports", "דוח משמרת"],
    ["settings", "הגדרות עסק"],
  ])("לא רואה %s (%s)", (key) => {
    expect(maintenanceKeys()).not.toContain(key);
  });

  it("התפריט שלו אינו שטוח — הוא לא עובד רגיל", () => {
    const groups = groupNavItems(visibleNavItems("maintenance", ALL_ON));
    expect(groups.map((g) => g.id)).toEqual(["overview", "shifts"]);
  });
});

describe("הרשאות פעולה של איש האחזקה", () => {
  it("מורשה להיכנס למודול התקלות", () => {
    expect(FAULTS_PAGE_ROLES).toContain("maintenance");
  });

  it("לא רואה מחירי ספקים ולא מחתים יציאה לעובדים", () => {
    expect(canSeeInventoryPrices("maintenance")).toBe(false);
    expect(canForceEmployeeClockOut("maintenance")).toBe(false);
  });

  it("תיאור התפקיד במערכת תואם למה שהוא באמת רואה", () => {
    expect(ROLE_LABELS.maintenance).toBe("איש אחזקה");
    expect(ROLE_DESCRIPTIONS.maintenance).toBe("תקלות בלבד");
  });
});

describe("מודול התקלות — מי עוד ניגש אליו", () => {
  it("מנהל ואחמ״ש רואים תקלות תחת «תפעול», איש אחזקה תחת מסך הבית", () => {
    for (const role of ["manager", "shift_manager"] as const) {
      const faults = visibleNavItems(role, ALL_ON).find((i) => i.key === "faults");
      expect(faults?.group).toBe("ops");
    }
  });

  it("עובד, מנהלת משרד ומנהלת אירועים לא ניגשים לתקלות", () => {
    const blocked: UserRole[] = ["employee", "office_manager", "event_manager"];
    for (const role of blocked) {
      expect(FAULTS_PAGE_ROLES).not.toContain(role);
      expect(visibleNavItems(role, ALL_ON).map((i) => i.key)).not.toContain("faults");
    }
  });
});
