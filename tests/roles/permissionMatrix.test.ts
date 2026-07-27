/**
 * מטריצת ההרשאות המלאה — כל התפקידים במקום אחד.
 *
 * זו הבדיקה שנועדה להיכשל כשמישהו מוסיף תפקיד לפריט תפריט בטעות.
 * היא נועלת את הרשימה המדויקת לכל תפקיד, ולא רק "מכילה את X".
 */
import { describe, expect, it } from "vitest";
import { getHomePath, visibleNavItems } from "@/lib/constants";
import { ALL_FEATURE_KEYS } from "@/lib/features";
import type { FeatureKey, UserRole } from "@/types/database";

/** כמו ב-auth: סופר אדמין מקבל הכול, שאר התפקידים לפי business_features. */
function hasFeatureFor(role: UserRole, enabled: FeatureKey[] = ALL_FEATURE_KEYS) {
  const set = new Set(enabled);
  return (key: FeatureKey) => role === "super_admin" || set.has(key);
}

function keysFor(role: UserRole, enabled?: FeatureKey[]): string[] {
  return visibleNavItems(role, hasFeatureFor(role, enabled)).map((i) => i.key);
}

/** התפריט המלא לכל תפקיד כשכל המודולים דלוקים — בסדר שבו הוא מוצג בתפריט. */
const EXPECTED: Record<UserRole, string[]> = {
  super_admin: ["platform", "businesses", "platform-users"],
  manager: [
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
  ],
  shift_manager: [
    "dashboard",
    "shifts",
    "shift-reports",
    "my-shifts",
    "tasks",
    "faults",
    "events",
    "inventory",
    "agreements",
  ],
  office_manager: [
    "dashboard",
    "my-shifts",
    "tasks",
    "events",
    "inventory",
    "suppliers",
    "users",
    "payroll",
    "agreements",
  ],
  employee: ["dashboard", "shifts", "my-shifts", "events", "inventory", "agreements"],
  maintenance: ["faults", "my-shifts"],
  event_manager: ["events"],
};

const ALL_ROLES = Object.keys(EXPECTED) as UserRole[];

describe("מטריצת התפריט המלאה", () => {
  it.each(ALL_ROLES)("תפריט מדויק לתפקיד %s", (role) => {
    expect(keysFor(role)).toEqual(EXPECTED[role]);
  });

  it("אין מפתח שמופיע פעמיים אצל אותו תפקיד", () => {
    for (const role of ALL_ROLES) {
      const keys = keysFor(role);
      expect(new Set(keys).size, role).toBe(keys.length);
    }
  });

  it("לכל תפקיד יש לפחות מסך אחד להיכנס אליו", () => {
    for (const role of ALL_ROLES) expect(keysFor(role).length, role).toBeGreaterThan(0);
  });
});

describe("מסכים רגישים — מי באמת ניגש", () => {
  const sensitive: [string, UserRole[]][] = [
    ["payroll", ["manager", "office_manager"]],
    ["users", ["manager", "office_manager"]],
    ["settings", ["manager"]],
    ["attendance", ["manager"]],
    ["shift-reports", ["manager", "shift_manager"]],
    ["suppliers", ["manager", "office_manager"]],
    ["platform", ["super_admin"]],
    ["businesses", ["super_admin"]],
    ["platform-users", ["super_admin"]],
  ];

  it.each(sensitive)("%s פתוח בדיוק לתפקידים המורשים", (key, allowed) => {
    const actual = ALL_ROLES.filter((role) => keysFor(role).includes(key));
    expect(actual.sort()).toEqual([...allowed].sort());
  });
});

describe("מסך הבית של כל תפקיד", () => {
  it.each<[UserRole, string]>([
    ["super_admin", "/platform"],
    ["manager", "/dashboard"],
    ["shift_manager", "/dashboard"],
    ["office_manager", "/dashboard"],
    ["employee", "/dashboard"],
    ["maintenance", "/faults"],
    ["event_manager", "/events"],
  ])("%s נוחת על %s", (role, path) => {
    expect(getHomePath(role)).toBe(path);
  });

  it("מסך הבית של כל תפקיד קיים בתפריט שלו (חוץ מסופר אדמין שנוחת על /platform)", () => {
    for (const role of ALL_ROLES) {
      const home = getHomePath(role).replace("/", "");
      expect(keysFor(role), role).toContain(home);
    }
  });
});

describe("כיבוי מודולים משפיע על כל התפקידים באותה מידה", () => {
  it("כשכל המודולים כבויים, אף תפקיד בעסק לא רואה מסך מותנה-מודול", () => {
    const featureGated = ["agreements", "payroll", "shifts", "shift-reports", "attendance", "tasks", "inventory", "suppliers", "faults", "events"];
    for (const role of ALL_ROLES) {
      if (role === "super_admin") continue;
      const keys = keysFor(role, []);
      for (const gated of featureGated) expect(keys, `${role}/${gated}`).not.toContain(gated);
    }
  });

  it("סופר אדמין לא מושפע מכיבוי מודולים של עסק מסוים", () => {
    expect(keysFor("super_admin", [])).toEqual(EXPECTED.super_admin);
  });

  it("מנהל אינו עוקף את המודולים — כיבוי שעון הנוכחות מסיר לו את המסך", () => {
    expect(keysFor("manager", ALL_FEATURE_KEYS.filter((k) => k !== "attendance"))).not.toContain("attendance");
  });

  it("מנהלת אירועים עם מודול אירועים כבוי נשארת בלי תפריט בכלל", () => {
    expect(keysFor("event_manager", [])).toEqual([]);
  });
});
