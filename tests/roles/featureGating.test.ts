/**
 * מודולים ותוכניות — מה הסופר אדמין מוכר ומה נדלק בפועל בעסק.
 *
 * זו שכבת השער של כל המערכת: אם מודול נדלק בלי התלות שלו, מסכים שלמים
 * נשברים (שכר בלי שעון נוכחות = שכר אפס לכולם). הבדיקות מכסות את מפל
 * התלויות לשני הכיוונים, את שלמות הקטלוג, ואת זיהוי התוכנית.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_FEATURE_KEYS,
  FEATURE_DOMAINS,
  FEATURE_MODULES,
  MODULE_BY_KEY,
  PLANS,
  PLAN_BY_ID,
  PLAN_LABELS,
  applyFeatureToggle,
  dependentsOf,
  detectPlan,
  emptyFeatureState,
  enabledKeysOf,
  featureStateForPlan,
  featureStateFromKeys,
  missingRecommendations,
  modulesInDomain,
} from "@/lib/features";
import { ALL_FEATURES, DEFAULT_FEATURE_STATE } from "@/lib/constants";
import type { FeatureKey } from "@/types/database";

describe("שלמות קטלוג המודולים", () => {
  it("אין מפתחות כפולים", () => {
    expect(new Set(ALL_FEATURE_KEYS).size).toBe(ALL_FEATURE_KEYS.length);
  });

  it("כל תלות מצביעה על מודול קיים", () => {
    for (const m of FEATURE_MODULES) {
      for (const dep of [...m.requires, ...m.recommends]) {
        expect(ALL_FEATURE_KEYS, `${m.key} → ${dep}`).toContain(dep);
      }
    }
  });

  it("אף מודול אינו תלוי בעצמו", () => {
    for (const m of FEATURE_MODULES) {
      expect(m.requires).not.toContain(m.key);
      expect(m.recommends).not.toContain(m.key);
    }
  });

  it("אין מעגל תלויות קשיח", () => {
    const visit = (key: FeatureKey, seen: Set<FeatureKey>) => {
      if (seen.has(key)) throw new Error(`מעגל תלויות דרך ${key}`);
      seen.add(key);
      for (const dep of MODULE_BY_KEY.get(key)?.requires ?? []) visit(dep, new Set(seen));
    };
    for (const m of FEATURE_MODULES) expect(() => visit(m.key, new Set())).not.toThrow();
  });

  it("כל מודול משויך לתחום קיים, וכל תחום מכיל לפחות מודול אחד", () => {
    const domainIds = FEATURE_DOMAINS.map((d) => d.id);
    for (const m of FEATURE_MODULES) expect(domainIds).toContain(m.domain);
    for (const d of FEATURE_DOMAINS) expect(modulesInDomain(d.id).length).toBeGreaterThan(0);
  });

  it("למודול עם תלות קשיחה יש הסבר בעברית למנהל", () => {
    for (const m of FEATURE_MODULES) {
      if (m.requires.length > 0) expect(m.dependencyNote, m.key).toBeTruthy();
    }
  });

  it("הרשימה השטוחה לתאימות לאחור מכילה בדיוק את אותם מודולים", () => {
    expect(ALL_FEATURES.map((f) => f.key).sort()).toEqual([...ALL_FEATURE_KEYS].sort());
  });
});

describe("תלויות ידועות", () => {
  it("שכר דורש שעון נוכחות", () => {
    expect(MODULE_BY_KEY.get("payroll")?.requires).toEqual(["attendance"]);
  });

  it("בלאי דורש סחורות", () => {
    expect(MODULE_BY_KEY.get("waste")?.requires).toEqual(["inventory"]);
  });

  it("כיבוי שעון נוכחות שובר את השכר", () => {
    expect(dependentsOf("attendance")).toEqual(["payroll"]);
  });

  it("כיבוי סחורות שובר את הבלאי", () => {
    expect(dependentsOf("inventory")).toEqual(["waste"]);
  });

  it("מודול שאף אחד לא תלוי בו מחזיר רשימה ריקה", () => {
    expect(dependentsOf("events")).toEqual([]);
  });
});

describe("הדלקת מודול מושכת את התלויות", () => {
  it("הדלקת שכר מדליקה גם שעון נוכחות", () => {
    const result = applyFeatureToggle(emptyFeatureState(), "payroll", true);
    expect(result.state.payroll).toBe(true);
    expect(result.state.attendance).toBe(true);
    expect(result.turnedOn).toEqual(["attendance"]);
  });

  it("הדלקת בלאי מדליקה גם סחורות", () => {
    const result = applyFeatureToggle(emptyFeatureState(), "waste", true);
    expect(result.state.inventory).toBe(true);
    expect(result.turnedOn).toEqual(["inventory"]);
  });

  it("תלות שכבר דלוקה לא מדווחת כשינוי", () => {
    const state = featureStateFromKeys(["attendance"]);
    const result = applyFeatureToggle(state, "payroll", true);
    expect(result.turnedOn).toEqual([]);
  });

  it("הדלקת מודול בלי תלויות לא נוגעת בשאר", () => {
    const result = applyFeatureToggle(emptyFeatureState(), "events", true);
    expect(enabledKeysOf(result.state)).toEqual(["events"]);
    expect(result.turnedOn).toEqual([]);
    expect(result.turnedOff).toEqual([]);
  });
});

describe("כיבוי מודול מפיל את מי שתלוי בו", () => {
  it("כיבוי שעון נוכחות מכבה את השכר", () => {
    const state = featureStateForPlan("full");
    const result = applyFeatureToggle(state, "attendance", false);
    expect(result.state.payroll).toBe(false);
    expect(result.turnedOff).toEqual(["payroll"]);
  });

  it("כיבוי סחורות מכבה את הבלאי", () => {
    const result = applyFeatureToggle(featureStateForPlan("full"), "inventory", false);
    expect(result.state.waste).toBe(false);
    expect(result.turnedOff).toEqual(["waste"]);
  });

  it("כיבוי מודול שכבר כבוי לא מדווח על שינוי", () => {
    const result = applyFeatureToggle(emptyFeatureState(), "inventory", false);
    expect(result.turnedOff).toEqual([]);
  });

  it("כיבוי לא נוגע במודולים שרק «מומלצים» ולא נדרשים", () => {
    // דוח משמרת ממליץ על שכר, אבל לא דורש אותו
    const result = applyFeatureToggle(featureStateForPlan("full"), "shift_reports", false);
    expect(result.state.payroll).toBe(true);
    expect(result.turnedOff).toEqual([]);
  });

  it("הדלקה וכיבוי חוזרים למצב המקורי (למעט תלויות שנמשכו)", () => {
    const start = featureStateFromKeys(["attendance", "payroll"]);
    const off = applyFeatureToggle(start, "payroll", false);
    const back = applyFeatureToggle(off.state, "payroll", true);
    expect(enabledKeysOf(back.state).sort()).toEqual(["attendance", "payroll"]);
  });

  it("הפעולה אינה משנה את המצב המקורי (immutability)", () => {
    const state = featureStateFromKeys(["inventory", "waste"]);
    applyFeatureToggle(state, "inventory", false);
    expect(state.waste).toBe(true);
  });
});

describe("תוכניות מנוי", () => {
  it("כל תוכנית סגורה תחת התלויות שלה", () => {
    for (const plan of PLANS) {
      const included = new Set(plan.modules);
      for (const key of plan.modules) {
        for (const dep of MODULE_BY_KEY.get(key)?.requires ?? []) {
          expect(included.has(dep), `תוכנית ${plan.id}: ${key} דורש ${dep}`).toBe(true);
        }
      }
    }
  });

  it("מזהי התוכניות ייחודיים והדרגות עולות", () => {
    expect(new Set(PLANS.map((p) => p.id)).size).toBe(PLANS.length);
    const tiers = PLANS.map((p) => p.tier);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
  });

  it("תוכנית גבוהה מכילה את כל מה שבתוכנית שמתחתיה", () => {
    for (let i = 1; i < PLANS.length; i++) {
      const lower = new Set(PLANS[i - 1].modules);
      for (const key of lower) expect(PLANS[i].modules, PLANS[i].id).toContain(key);
    }
  });

  it("תוכנית «מלא» כוללת את כל המודולים בלי הגבלת מושבים", () => {
    expect(PLAN_BY_ID.get("full")?.modules.sort()).toEqual([...ALL_FEATURE_KEYS].sort());
    expect(PLAN_BY_ID.get("full")?.suggestedSeats).toBeNull();
  });

  it("לכל תוכנית יש תווית בעברית, כולל «מותאם אישית»", () => {
    for (const plan of PLANS) expect(PLAN_LABELS[plan.id]).toBeTruthy();
    expect(PLAN_LABELS.custom).toBe("מותאם אישית");
  });

  it("עסק חדש נפתח בתוכנית «צמיחה»", () => {
    expect(DEFAULT_FEATURE_STATE).toEqual(featureStateForPlan("growth"));
    expect(detectPlan(DEFAULT_FEATURE_STATE)).toBe("growth");
  });
});

describe("זיהוי התוכנית לפי המודולים הדלוקים", () => {
  it("סט מדויק מזוהה כתוכנית", () => {
    expect(detectPlan(featureStateForPlan("starter"))).toBe("starter");
    expect(detectPlan(featureStateForPlan("growth"))).toBe("growth");
    expect(detectPlan(featureStateForPlan("full"))).toBe("full");
  });

  it("מודול אחד מעבר לתוכנית הופך אותה למותאמת אישית", () => {
    const state = { ...featureStateForPlan("starter"), events: true };
    expect(detectPlan(state)).toBe("custom");
  });

  it("מודול אחד חסר הופך אותה למותאמת אישית", () => {
    const state = { ...featureStateForPlan("growth"), inventory: false };
    expect(detectPlan(state)).toBe("custom");
  });

  it("עסק בלי מודולים כלל נחשב מותאם אישית", () => {
    expect(detectPlan(emptyFeatureState())).toBe("custom");
  });
});

describe("המלצות רכות", () => {
  it("שכר בלי דוח משמרת מקבל המלצה", () => {
    const state = featureStateFromKeys(["attendance", "payroll"]);
    const recs = missingRecommendations(state);
    const payroll = recs.find((r) => r.module.key === "payroll");
    expect(payroll?.missing.map((m) => m.key)).toEqual(["shift_reports"]);
  });

  it("דוח משמרת בלי סידור ובלי שכר מקבל שתי המלצות", () => {
    const state = featureStateFromKeys(["shift_reports"]);
    const recs = missingRecommendations(state);
    expect(recs.find((r) => r.module.key === "shift_reports")?.missing.map((m) => m.key)).toEqual([
      "shifts",
      "payroll",
    ]);
  });

  it("תוכנית מלאה לא מייצרת המלצות", () => {
    expect(missingRecommendations(featureStateForPlan("full"))).toEqual([]);
  });

  it("מודול כבוי לא מייצר המלצות", () => {
    expect(missingRecommendations(emptyFeatureState())).toEqual([]);
  });
});

describe("בניית מצב מודולים", () => {
  it("מצב ריק מכיל את כל המפתחות עם false", () => {
    const state = emptyFeatureState();
    expect(Object.keys(state).sort()).toEqual([...ALL_FEATURE_KEYS].sort());
    expect(enabledKeysOf(state)).toEqual([]);
  });

  it("מצב מלא מכיל את כל המפתחות עם true", () => {
    expect(enabledKeysOf(emptyFeatureState(true)).sort()).toEqual([...ALL_FEATURE_KEYS].sort());
  });

  it("בנייה מרשימת מפתחות מדליקה רק אותם, גם עם כפילויות", () => {
    const state = featureStateFromKeys(["inventory", "inventory", "faults"]);
    expect(enabledKeysOf(state).sort()).toEqual(["faults", "inventory"]);
  });

  it("סדר המפתחות בפלט עקבי עם סדר הקטלוג", () => {
    const state = featureStateFromKeys(ALL_FEATURE_KEYS);
    expect(enabledKeysOf(state)).toEqual(ALL_FEATURE_KEYS);
  });
});
