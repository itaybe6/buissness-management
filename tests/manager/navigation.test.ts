/**
 * ממשק המנהל — התפקיד הרחב ביותר בעסק.
 *
 * המנהל רואה כמעט הכול, ולכן הבדיקות כאן שומרות על שני גבולות: שהוא כן
 * מקבל את כל מסכי העסק (כדי שפיצ׳ר חדש לא ייעלם ממנו בטעות), ושהוא עדיין
 * לא חוצה אל מסכי הפלטפורמה של הסופר אדמין ולא עוקף את המודולים שנקנו.
 */
import { describe, expect, it } from "vitest";
import {
  DOCUMENTS_EDIT_ROLES,
  DOCUMENTS_OVERVIEW_ROLES,
  EVENT_MANAGE_ROLES,
  FAULTS_PAGE_ROLES,
  INVENTORY_PRICE_ROLES,
  MANAGER_ROLES,
  OFFICE_RECEIPTS_ROLES,
  SCHEDULER_ROLES,
  TASK_CREATE_ROLES,
  USER_MANAGE_ROLES,
  canForceEmployeeClockOut,
  canSeeInventoryPrices,
  getHomePath,
  groupNavItems,
  visibleNavItems,
} from "@/lib/constants";
import { ALL_FEATURE_KEYS, featureStateForPlan } from "@/lib/features";
import type { FeatureKey } from "@/types/database";

function featuresOn(...keys: FeatureKey[]) {
  const set = new Set(keys);
  return (key: FeatureKey) => set.has(key);
}
const ALL_ON = featuresOn(...ALL_FEATURE_KEYS);

const managerKeys = (hasFeature = ALL_ON) => visibleNavItems("manager", hasFeature).map((i) => i.key);

describe("תפריט המנהל", () => {
  it("רואה את כל מסכי העסק כשכל המודולים דלוקים", () => {
    expect(managerKeys().sort()).toEqual(
      [
        "dashboard",
        "shifts",
        "shift-reports",
        "attendance",
        "my-shifts",
        "tasks",
        "faults",
        "events",
        "inventory",
        "suppliers",
        "users",
        "payroll",
        "agreements",
        "settings",
      ].sort(),
    );
  });

  it("הוא היחיד שרואה שעון נוכחות של כל העסק והגדרות עסק", () => {
    expect(managerKeys()).toContain("attendance");
    expect(managerKeys()).toContain("settings");
  });

  it("נוחת על הדשבורד הניהולי", () => {
    expect(getHomePath("manager")).toBe("/dashboard");
    expect(visibleNavItems("manager", ALL_ON).find((i) => i.key === "dashboard")?.label).toBe("דשבורד");
  });

  it("לא נכנס למסכי הפלטפורמה של הסופר אדמין", () => {
    for (const key of ["platform", "businesses", "platform-users"]) {
      expect(managerKeys()).not.toContain(key);
    }
  });

  it("התפריט שלו מחולק למקטעים ולא שטוח כמו של העובד", () => {
    const groups = groupNavItems(visibleNavItems("manager", ALL_ON));
    expect(groups.length).toBeGreaterThan(1);
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });
});

describe("המנהל לא עוקף את המודולים שהעסק קנה", () => {
  it("כיבוי שעון נוכחות מסיר לו את המסך", () => {
    expect(managerKeys(featuresOn(...ALL_FEATURE_KEYS.filter((k) => k !== "attendance")))).not.toContain("attendance");
  });

  it("כיבוי סחורות מסיר גם מלאי וגם ספקים", () => {
    const keys = managerKeys(featuresOn(...ALL_FEATURE_KEYS.filter((k) => k !== "inventory")));
    expect(keys).not.toContain("inventory");
    expect(keys).not.toContain("suppliers");
  });

  it("כשהכול כבוי נשארים רק המסכים שאינם מותנים במודול", () => {
    expect(managerKeys(() => false).sort()).toEqual(["dashboard", "my-shifts", "settings", "users"].sort());
  });

  it("בתוכנית «בסיס» המנהל מקבל נוכחות, סידור ומשימות בלבד מבין המודולים", () => {
    const starter = featureStateForPlan("starter");
    const keys = managerKeys((k) => starter[k]);
    expect(keys).toContain("shifts");
    expect(keys).toContain("attendance");
    expect(keys).toContain("tasks");
    expect(keys).not.toContain("payroll");
    expect(keys).not.toContain("inventory");
  });

  it("בתוכנית «צמיחה» נוספים שכר, מסמכים, סחורות ותקלות", () => {
    const growth = featureStateForPlan("growth");
    const keys = managerKeys((k) => growth[k]);
    for (const key of ["payroll", "agreements", "inventory", "suppliers", "faults", "shift-reports"]) {
      expect(keys, key).toContain(key);
    }
    expect(keys).not.toContain("events"); // רק בתוכנית «מלא»
  });
});

describe("הרשאות הפעולה של המנהל", () => {
  it("רואה מחירי ספקים", () => {
    expect(INVENTORY_PRICE_ROLES).toContain("manager");
    expect(canSeeInventoryPrices("manager")).toBe(true);
  });

  it("מוציא עובד ממשמרת ומתקן לו שעות", () => {
    expect(canForceEmployeeClockOut("manager")).toBe(true);
    expect(MANAGER_ROLES).toContain("manager");
  });

  it("בונה סידור עבודה", () => {
    expect(SCHEDULER_ROLES).toContain("manager");
  });

  it("הוא היחיד שיוצר תבניות משימה קבועות", () => {
    expect(TASK_CREATE_ROLES).toEqual(["manager"]);
  });

  it("מנהל משתמשים, חשבוניות משרד ואירועים", () => {
    expect(USER_MANAGE_ROLES).toContain("manager");
    expect(OFFICE_RECEIPTS_ROLES).toContain("manager");
    expect(EVENT_MANAGE_ROLES).toContain("manager");
  });

  it("גם עורך תבניות מסמכים וגם רואה את סקירת החתימות", () => {
    expect(DOCUMENTS_EDIT_ROLES).toContain("manager");
    expect(DOCUMENTS_OVERVIEW_ROLES).toContain("manager");
  });

  it("נכנס למודול התקלות", () => {
    expect(FAULTS_PAGE_ROLES).toContain("manager");
  });
});

describe("מה המנהל מקבל שאחראי המשמרת לא", () => {
  const shiftManagerKeys = visibleNavItems("shift_manager", ALL_ON).map((i) => i.key);

  it("שכר, משתמשים, ספקים, שעון נוכחות והגדרות — רק למנהל", () => {
    for (const key of ["payroll", "users", "suppliers", "attendance", "settings"]) {
      expect(managerKeys(), key).toContain(key);
      expect(shiftManagerKeys, key).not.toContain(key);
    }
  });

  it("אחראי משמרת כן מקבל סידור, דוח משמרת, משימות ותקלות", () => {
    for (const key of ["shifts", "shift-reports", "tasks", "faults"]) {
      expect(shiftManagerKeys, key).toContain(key);
    }
  });

  it("שניהם נחשבים «מנהלים» לצורך הוצאה ממשמרת ובניית סידור", () => {
    expect(canForceEmployeeClockOut("shift_manager")).toBe(true);
    expect(SCHEDULER_ROLES).toContain("shift_manager");
  });

  it("אבל אחראי משמרת לא רואה מחירי ספקים", () => {
    expect(canSeeInventoryPrices("shift_manager")).toBe(false);
  });
});
