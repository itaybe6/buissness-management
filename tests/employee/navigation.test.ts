/**
 * ממשק העובד — מה הוא רואה בתפריט ולאן הוא נוחת אחרי התחברות.
 *
 * זו שכבת ההגנה הראשונה: אם פריט תפריט של מנהל ידלוף לעובד, הוא יראה שכר של
 * כל העסק. הבדיקות רצות מול `visibleNavItems` — אותה פונקציה ש-AppShell מריץ.
 */
import { describe, expect, it } from "vitest";
import {
  NAV_ITEMS,
  getHomePath,
  groupNavItems,
  visibleNavItems,
} from "@/lib/constants";
import { ALL_FEATURE_KEYS } from "@/lib/features";
import type { FeatureKey } from "@/types/database";

/** בודק פיצ'רים כמו ב-auth: משתמש בעסק רואה רק מה שהודלק. */
function featuresOn(...keys: FeatureKey[]) {
  const set = new Set(keys);
  return (key: FeatureKey) => set.has(key);
}

const ALL_ON = featuresOn(...ALL_FEATURE_KEYS);
const ALL_OFF = () => false;

function keysFor(role: Parameters<typeof visibleNavItems>[0], hasFeature = ALL_ON): string[] {
  return visibleNavItems(role, hasFeature).map((i) => i.key);
}

describe("תפריט העובד — פריטים מותרים", () => {
  it("רואה בית, משמרות, מעקב שכר, סחורות, מסמכים ואירועים", () => {
    const keys = keysFor("employee");
    expect(keys).toEqual(
      expect.arrayContaining(["dashboard", "shifts", "my-shifts", "inventory", "agreements", "events"]),
    );
  });

  it("פריט הבית של העובד הוא «בית» ולא «דשבורד» של המנהל", () => {
    const dashboard = visibleNavItems("employee", ALL_ON).find((i) => i.key === "dashboard");
    expect(dashboard?.label).toBe("בית");
    expect(dashboard?.icon).toBe("home");
  });

  it("נוחת על /dashboard אחרי התחברות", () => {
    expect(getHomePath("employee")).toBe("/dashboard");
  });
});

describe("תפריט העובד — פריטים חסומים", () => {
  const forbidden = [
    ["users", "ניהול משתמשים"],
    ["payroll", "שכר של כל העסק"],
    ["shift-reports", "דוח סגירת קופה"],
    ["attendance", "שעון נוכחות של כל העובדים"],
    ["tasks", "ניהול משימות"],
    ["suppliers", "ספקים"],
    ["faults", "תקלות"],
    ["settings", "הגדרות עסק"],
    ["platform", "סקירת פלטפורמה"],
    ["businesses", "עסקים"],
    ["platform-users", "משתמשי פלטפורמה"],
  ] as const;

  it.each(forbidden)("לא רואה %s (%s)", (key) => {
    expect(keysFor("employee")).not.toContain(key);
  });

  it("אין לעובד עקיפת פיצ'רים — כשהכול כבוי נשאר רק מה שלא מותנה במודול", () => {
    const keys = keysFor("employee", ALL_OFF);
    expect(keys).toEqual(["dashboard", "my-shifts"]);
  });
});

describe("תפריט העובד — כיבוי מודולים בודדים", () => {
  it("כיבוי «סידור עבודה» מעלים את המשמרות אבל משאיר מעקב שכר", () => {
    const keys = keysFor("employee", featuresOn("inventory", "agreements", "events"));
    expect(keys).not.toContain("shifts");
    expect(keys).toContain("my-shifts");
  });

  it("כיבוי «סחורות» מעלים ספירת מלאי מהעובד", () => {
    expect(keysFor("employee", featuresOn("shifts"))).not.toContain("inventory");
  });

  it("כיבוי «הסכמים» מעלים את המסמכים מהעובד", () => {
    expect(keysFor("employee", featuresOn("shifts"))).not.toContain("agreements");
  });

  it("«מעקב שכר» זמין גם בלי מודול השכר — זו התצוגה האישית של העובד", () => {
    const item = NAV_ITEMS.find((i) => i.key === "my-shifts");
    expect(item?.feature).toBeUndefined();
    expect(keysFor("employee", ALL_OFF)).toContain("my-shifts");
  });
});

describe("סידור התפריט לעובד (תצוגה שטוחה)", () => {
  it("התפריט מוצג כקבוצה אחת בלי כותרות מקטע", () => {
    const groups = groupNavItems(visibleNavItems("employee", ALL_ON), { flat: true });
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("");
  });

  it("«מסמכים» נדחף לסוף התפריט השטוח", () => {
    const groups = groupNavItems(visibleNavItems("employee", ALL_ON), { flat: true });
    const keys = groups[0].items.map((i) => i.key);
    expect(keys[keys.length - 1]).toBe("agreements");
  });

  it("תפריט ריק לא יוצר קבוצה ריקה", () => {
    expect(groupNavItems([], { flat: true })).toEqual([]);
    expect(groupNavItems([])).toEqual([]);
  });

  it("במצב לא-שטוח הפריטים מקובצים לפי מקטעים בסדר קבוע", () => {
    const groups = groupNavItems(visibleNavItems("manager", ALL_ON));
    const ids = groups.map((g) => g.id);
    expect(ids).toEqual([...ids].sort((a, b) => {
      const order = ["overview", "platform", "team", "shifts", "ops", "settings"];
      return order.indexOf(a) - order.indexOf(b);
    }));
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });
});

describe("שלמות קטלוג התפריט", () => {
  it("כל פריט מותנה-מודול מצביע על מודול שקיים בקטלוג", () => {
    const unknown = NAV_ITEMS.filter((i) => i.feature && !ALL_FEATURE_KEYS.includes(i.feature));
    expect(unknown).toEqual([]);
  });

  it("לכל פריט יש לפחות תפקיד אחד", () => {
    expect(NAV_ITEMS.filter((i) => i.roles.length === 0)).toEqual([]);
  });

  it("מפתח כפול קיים רק כשהתפקידים שונים (דשבורד/תקלות)", () => {
    const byKey = new Map<string, typeof NAV_ITEMS>();
    for (const item of NAV_ITEMS) {
      byKey.set(item.key, [...(byKey.get(item.key) ?? []), item]);
    }
    for (const [, items] of byKey) {
      if (items.length < 2) continue;
      const roles = items.flatMap((i) => i.roles);
      expect(new Set(roles).size).toBe(roles.length);
    }
  });
});
