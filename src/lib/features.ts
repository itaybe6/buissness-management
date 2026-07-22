import type { BusinessPlan, FeatureKey } from "@/types/database";

/**
 * Single source of truth for the module catalog the super admin sells.
 *
 * Three layers, from coarse to fine:
 *   1. PLANS    — packages the super admin assigns to a business.
 *   2. DOMAINS  — the four areas a module can belong to (used for grouping in the UI).
 *   3. MODULES  — the individual feature keys stored in business_features.
 *
 * Modules are not independent: some read another module's data. Those links are
 * declared in `requires` (hard — enforced here and by a DB trigger) and
 * `recommends` (soft — surfaced as a hint, never forced).
 */

export type FeatureDomainId = "core" | "workforce" | "operations" | "growth";

export interface FeatureDomain {
  id: FeatureDomainId;
  label: string;
  /** One-line pitch shown under the domain tab. */
  tagline: string;
  icon: string;
}

export const FEATURE_DOMAINS: FeatureDomain[] = [
  { id: "core", label: "ליבה", tagline: "הבסיס שכל עסק צריך — נוכחות ומשמרות", icon: "hub" },
  { id: "workforce", label: "כוח אדם", tagline: "שכר, מסמכים והתחשבנות מול העובדים", icon: "diversity_3" },
  { id: "operations", label: "תפעול", tagline: "מלאי, משימות ותקלות בשטח", icon: "conveyor_belt" },
  { id: "growth", label: "צמיחה", tagline: "מודולים מתקדמים לעסקים גדולים", icon: "trending_up" },
];

export interface FeatureModule {
  key: FeatureKey;
  label: string;
  icon: string;
  desc: string;
  domain: FeatureDomainId;
  /** Modules that must be on for this one to work. Enforced both ways. */
  requires: FeatureKey[];
  /** Modules that make this one materially better, but aren't mandatory. */
  recommends: FeatureKey[];
  /** Shown in the super-admin UI to explain the dependency in plain Hebrew. */
  dependencyNote?: string;
}

export const FEATURE_MODULES: FeatureModule[] = [
  {
    key: "attendance",
    label: "שעון נוכחות",
    icon: "schedule",
    desc: "החתמת כניסה ויציאה מבוססת מיקום, עם רדיוס גיאוגרפי לכל עסק",
    domain: "core",
    requires: [],
    recommends: [],
  },
  {
    key: "shifts",
    label: "סידור עבודה",
    icon: "calendar_month",
    desc: "הגשת אילוצים שבועיים ובניית סידור לכל מחלקה",
    domain: "core",
    requires: [],
    recommends: [],
  },
  {
    key: "tasks",
    label: "משימות",
    icon: "checklist",
    desc: "משימות חד-פעמיות ומשימות קבועות לפי מחלקה",
    domain: "core",
    requires: [],
    recommends: [],
  },
  {
    key: "payroll",
    label: "חישוב שכר וטיפים",
    icon: "payments",
    desc: "שכר שעתי, טיפים והתאמות חודשיות — מחושב אוטומטית",
    domain: "workforce",
    requires: ["attendance"],
    recommends: ["shift_reports"],
    dependencyNote: "שעות העבודה מגיעות מהחתמות שעון הנוכחות, ולכן שעון נוכחות חייב להיות פעיל.",
  },
  {
    key: "agreements",
    label: "הסכמים וטופס 101",
    icon: "draw",
    desc: "העלאת הסכמים לחתימה דיגיטלית ומעקב אחר חתימות עובדים",
    domain: "workforce",
    requires: [],
    recommends: [],
  },
  {
    key: "shift_reports",
    label: "דוח סגירת משמרת",
    icon: "receipt_long",
    desc: "סגירת קופה, חשבוניות, בונוסים וחלוקת טיפים בסוף משמרת",
    domain: "workforce",
    requires: [],
    recommends: ["shifts", "payroll"],
    dependencyNote: "הטיפים והבונוסים מהדוח מזינים את חישוב השכר.",
  },
  {
    key: "inventory",
    label: "סחורות וניהול מלאי",
    icon: "inventory_2",
    desc: "ספירת מלאי, ניהול ספקים והזמנת סחורה לפי צורך",
    domain: "operations",
    requires: [],
    recommends: [],
  },
  {
    key: "waste",
    label: "בלאי",
    icon: "delete_sweep",
    desc: "דיווח בלאי מוצרים והפחתה אוטומטית מהמלאי",
    domain: "operations",
    requires: ["inventory"],
    recommends: [],
    dependencyNote: "בלאי מפחית כמויות ישירות מהמלאי, ולכן מודול הסחורות חייב להיות פעיל.",
  },
  {
    key: "faults",
    label: "דיווח תקלות",
    icon: "build",
    desc: "פתיחת תקלה עם צילום, שיוך לאיש אחזקה ומעקב סטטוס",
    domain: "operations",
    requires: [],
    recommends: [],
  },
  {
    key: "events",
    label: "אירועים",
    icon: "celebration",
    desc: "ניהול אירועים פרטיים, הזמנות קבוצתיות ומדיה מהאירוע",
    domain: "growth",
    requires: [],
    recommends: [],
  },
];

export const MODULE_BY_KEY = new Map(FEATURE_MODULES.map((m) => [m.key, m]));

export const ALL_FEATURE_KEYS: FeatureKey[] = FEATURE_MODULES.map((m) => m.key);

export function modulesInDomain(domain: FeatureDomainId): FeatureModule[] {
  return FEATURE_MODULES.filter((m) => m.domain === domain);
}

/** Modules that break if `key` is switched off. */
export function dependentsOf(key: FeatureKey): FeatureKey[] {
  return FEATURE_MODULES.filter((m) => m.requires.includes(key)).map((m) => m.key);
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export interface PlanDefinition {
  id: Exclude<BusinessPlan, "custom">;
  label: string;
  tagline: string;
  icon: string;
  /** Ordering hint for the UI — higher tier sits further right. */
  tier: number;
  modules: FeatureKey[];
  /** Suggested seat cap. null = unlimited. */
  suggestedSeats: number | null;
}

export const PLANS: PlanDefinition[] = [
  {
    id: "starter",
    label: "בסיס",
    tagline: "עסק קטן שרוצה סדר — נוכחות, סידור ומשימות",
    icon: "bolt",
    tier: 1,
    modules: ["attendance", "shifts", "tasks"],
    suggestedSeats: 15,
  },
  {
    id: "growth",
    label: "צמיחה",
    tagline: "הליבה + שכר, מסמכים ומלאי — לעסק שמתרחב",
    icon: "rocket_launch",
    tier: 2,
    modules: ["attendance", "shifts", "tasks", "payroll", "agreements", "shift_reports", "inventory", "faults"],
    suggestedSeats: 50,
  },
  {
    id: "full",
    label: "מלא",
    tagline: "כל המודולים פתוחים, ללא הגבלת משתמשים",
    icon: "workspace_premium",
    tier: 3,
    modules: [...ALL_FEATURE_KEYS],
    suggestedSeats: null,
  },
];

export const PLAN_BY_ID = new Map(PLANS.map((p) => [p.id, p]));

export const PLAN_LABELS: Record<BusinessPlan, string> = {
  starter: "בסיס",
  growth: "צמיחה",
  full: "מלא",
  custom: "מותאם אישית",
};

// ---------------------------------------------------------------------------
// Feature-state resolution
// ---------------------------------------------------------------------------

export type FeatureState = Record<FeatureKey, boolean>;

export function emptyFeatureState(value = false): FeatureState {
  return Object.fromEntries(ALL_FEATURE_KEYS.map((k) => [k, value])) as FeatureState;
}

export function featureStateFromKeys(keys: Iterable<FeatureKey>): FeatureState {
  const state = emptyFeatureState(false);
  for (const k of keys) state[k] = true;
  return state;
}

export function enabledKeysOf(state: FeatureState): FeatureKey[] {
  return ALL_FEATURE_KEYS.filter((k) => state[k]);
}

/** What a toggle would change beyond the module the user clicked. */
export interface ToggleResult {
  state: FeatureState;
  /** Modules switched on to satisfy `requires`. */
  turnedOn: FeatureKey[];
  /** Modules switched off because their requirement went away. */
  turnedOff: FeatureKey[];
}

/**
 * Toggle one module and cascade through hard dependencies:
 * turning a module on pulls in everything it requires; turning it off drops
 * everything that requires it. Mirrors the DB trigger so the UI never shows a
 * state the database would reject.
 */
export function applyFeatureToggle(state: FeatureState, key: FeatureKey, enabled: boolean): ToggleResult {
  const next = { ...state, [key]: enabled };
  const turnedOn: FeatureKey[] = [];
  const turnedOff: FeatureKey[] = [];

  if (enabled) {
    // Walk up the requires-chain.
    const queue = [key];
    while (queue.length) {
      const current = queue.shift()!;
      for (const dep of MODULE_BY_KEY.get(current)?.requires ?? []) {
        if (!next[dep]) {
          next[dep] = true;
          turnedOn.push(dep);
          queue.push(dep);
        }
      }
    }
  } else {
    // Walk down the dependents-chain.
    const queue = [key];
    while (queue.length) {
      const current = queue.shift()!;
      for (const child of dependentsOf(current)) {
        if (next[child]) {
          next[child] = false;
          turnedOff.push(child);
          queue.push(child);
        }
      }
    }
  }

  return { state: next, turnedOn, turnedOff };
}

/** Build a valid state from a plan (plan module lists are already dependency-complete). */
export function featureStateForPlan(plan: Exclude<BusinessPlan, "custom">): FeatureState {
  return featureStateFromKeys(PLAN_BY_ID.get(plan)?.modules ?? []);
}

/** Which plan does this exact module set correspond to? Falls back to 'custom'. */
export function detectPlan(state: FeatureState): BusinessPlan {
  const on = new Set(enabledKeysOf(state));
  for (const plan of PLANS) {
    if (plan.modules.length === on.size && plan.modules.every((k) => on.has(k))) return plan.id;
  }
  return "custom";
}

/** Soft advice: modules that are on but missing a `recommends` companion. */
export function missingRecommendations(state: FeatureState): { module: FeatureModule; missing: FeatureModule[] }[] {
  const out: { module: FeatureModule; missing: FeatureModule[] }[] = [];
  for (const m of FEATURE_MODULES) {
    if (!state[m.key]) continue;
    const missing = m.recommends
      .filter((k) => !state[k])
      .map((k) => MODULE_BY_KEY.get(k))
      .filter((x): x is FeatureModule => !!x);
    if (missing.length) out.push({ module: m, missing });
  }
  return out;
}
