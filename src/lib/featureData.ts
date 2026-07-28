import type { FeatureKey } from "@/types/database";
import { MODULE_BY_KEY, applyFeatureToggle, type FeatureState } from "@/lib/features";

/**
 * What each module *owns* in the database.
 *
 * Switching a module off is destructive: the super admin is not hiding a menu
 * item, they are deleting the business's data for that module. This file is the
 * single source of truth for "what exactly gets deleted", and it feeds three
 * places that must never disagree:
 *
 *   1. the confirmation dialog (labels + live row counts before deleting),
 *   2. `public.feature_data_report()` / `public.super_admin_apply_features()`
 *      in supabase/patches/057_feature_data_purge.sql (the actual DELETEs),
 *   3. tests/super-admin/featurePurge.test.ts, which parses the SQL patch and
 *      asserts the two lists are identical.
 *
 * Ownership rule: **every table has exactly one owner.** A table that several
 * modules read (`shift_templates`, `departments`, `profiles`) is business
 * configuration, not module data — it is listed in `keeps` instead, so the
 * dialog can promise out loud that it survives.
 */

export interface FeatureTable {
  /** Table in the `public` schema. */
  table: string;
  /** Hebrew label shown in the confirmation dialog. */
  label: string;
  /**
   * Extra SQL predicate the purge applies on top of `business_id`. Mirrors the
   * patch file exactly — used by the contract test, never interpolated at
   * runtime from the client.
   */
  where?: string;
  /** Rows that disappear with the parent row rather than by their own DELETE. */
  viaCascade?: boolean;
}

export interface FeatureDataScope {
  key: FeatureKey;
  /** Deleted child-first: a row's children are always listed before it. */
  tables: FeatureTable[];
  /** Storage prefixes emptied along with the rows. */
  storage: { bucket: string; label: string }[];
  /** Business-level configuration that stays put — quoted in the dialog. */
  keeps: string[];
  /** One line, plain Hebrew: what the business loses forever. */
  loses: string;
}

/**
 * Deletion order across the whole catalog. A table must appear after every
 * table that references it, so a purge of several modules at once never trips a
 * foreign key. `orderedTables()` sorts by this list.
 */
export const PURGE_ORDER: string[] = [
  // agreements
  "agreement_signatures",
  "employee_id_cards",
  "form_101",
  "agreement_templates",
  // shifts
  "shift_preferences",
  "shift_assignments",
  // attendance
  "attendance",
  // shift reports (children of shift_reports first)
  "shift_bonuses",
  "tips",
  "shift_reports",
  // payroll
  "payroll_month_adjustments",
  "payroll_records",
  // inventory (leaves → items → catalog)
  "inventory_waste",
  "inventory_logs",
  "inventory_counts",
  "inventory_orders",
  "supplier_items",
  "inventory_item_departments",
  "inventory_items",
  "suppliers",
  "inventory_categories",
  "inventory_units",
  "warehouses",
  // faults
  "faults",
  // tasks
  "tasks",
  "task_templates",
  // events
  "event_ideas",
  "events",
];

export const FEATURE_DATA: Record<FeatureKey, FeatureDataScope> = {
  attendance: {
    key: "attendance",
    tables: [{ table: "attendance", label: "החתמות שעון (כניסה/יציאה)" }],
    storage: [],
    keeps: ["כתובת העסק והרדיוס הגיאוגרפי", "העובדים והמחלקות"],
    loses: "כל היסטוריית השעות של כל העובדים — הבסיס לחישוב השכר.",
  },
  shifts: {
    key: "shifts",
    tables: [
      { table: "shift_preferences", label: "אילוצי זמינות שהעובדים הגישו" },
      { table: "shift_assignments", label: "שיבוצים בסידור העבודה" },
    ],
    storage: [],
    keeps: ["תבניות המשמרות של העסק (בוקר/ערב…)", "חלון ההגשה ודרישות המינימום"],
    loses: "הסידור הקיים והעתידי, וכל האילוצים שהעובדים הגישו.",
  },
  tasks: {
    key: "tasks",
    tables: [
      { table: "tasks", label: "משימות (פתוחות, בוצעו והיסטוריה)" },
      { table: "task_templates", label: "תבניות משימות קבועות" },
    ],
    storage: [{ bucket: "tasks", label: "תמונות וסרטונים שהעובדים צירפו למשימות" }],
    keeps: ["המחלקות שהמשימות היו משויכות אליהן"],
    loses: "כל המשימות הקבועות והחד-פעמיות, כולל תיעוד הביצוע.",
  },
  payroll: {
    key: "payroll",
    tables: [
      { table: "payroll_month_adjustments", label: "התאמות חודשיות (בונוס, מפרעה, הפרשים)" },
      { table: "payroll_records", label: "סיכומי שכר חודשיים" },
    ],
    storage: [],
    keeps: ["תעריף שעה, סוג שכר ואחוז בונוס בכרטיס העובד", "החתמות שעון הנוכחות"],
    loses: "הסיכומים החודשיים והמפרעות. השעות עצמן נשארות בשעון הנוכחות.",
  },
  agreements: {
    key: "agreements",
    tables: [
      { table: "agreement_signatures", label: "חתימות עובדים על הסכמים", viaCascade: true },
      { table: "employee_id_cards", label: "צילומי תעודת זהות" },
      { table: "form_101", label: "טופסי 101 שהוגשו" },
      { table: "agreement_templates", label: "הסכמים ותבניות לחתימה" },
    ],
    storage: [{ bucket: "agreements", label: "קובצי ההסכמים, ה-PDF החתומים וצילומי הת״ז" }],
    keeps: ["כרטיסי העובדים עצמם"],
    loses: "מסמכים חתומים משפטית וטופסי 101 — לא ניתן לשחזר אותם מהמערכת.",
  },
  shift_reports: {
    key: "shift_reports",
    tables: [
      { table: "shift_bonuses", label: "בונוס אחוז קופה לעובדים", viaCascade: true },
      { table: "tips", label: "חלוקת טיפים לעובדים", viaCascade: true },
      { table: "shift_reports", label: "דוחות סגירת משמרת" },
    ],
    storage: [{ bucket: "invoices", label: "חשבוניות שהועלו בסגירת המשמרת" }],
    keeps: ["סיכומי השכר החודשיים שכבר נוצרו"],
    loses: "מכירות, טיפים ובונוסים לכל משמרת — מה שמזין את הטיפים בתלוש.",
  },
  inventory: {
    key: "inventory",
    tables: [
      { table: "inventory_logs", label: "יומן עדכוני מלאי (מי עידכן מה)" },
      { table: "inventory_counts", label: "ספירות מלאי והכמויות בכל מחסן" },
      { table: "inventory_orders", label: "הזמנות סחורה מספקים" },
      { table: "supplier_items", label: "מחירי מוצרים לפי ספק", viaCascade: true },
      { table: "inventory_item_departments", label: "שיוך מוצרים למחלקות", viaCascade: true },
      { table: "inventory_items", label: "קטלוג המוצרים" },
      { table: "suppliers", label: "ספקים ופרטי ההתקשרות" },
      { table: "inventory_categories", label: "קטגוריות מוצרים" },
      { table: "inventory_units", label: "יחידות מידה" },
      { table: "warehouses", label: "מחסנים" },
    ],
    storage: [{ bucket: "inventory", label: "תמונות המוצרים" }],
    keeps: [],
    loses: "הקטלוג כולו — מוצרים, ספקים, מחירים, מחסנים וכל ההיסטוריה.",
  },
  waste: {
    key: "waste",
    tables: [{ table: "inventory_waste", label: "דיווחי בלאי" }],
    storage: [],
    keeps: ["קטלוג המוצרים והכמויות במלאי"],
    loses: "היסטוריית הבלאי. ההפחתות שכבר בוצעו מהמלאי נשארות כפי שהן.",
  },
  faults: {
    key: "faults",
    tables: [{ table: "faults", label: "תקלות, שיוכים ותשלומים לאיש אחזקה" }],
    storage: [{ bucket: "faults", label: "תמונות התקלות" }],
    keeps: ["אישורי התשלום שכבר נכנסו לשכר"],
    loses: "כל התקלות הפתוחות והסגורות, כולל התמונות והתמחור.",
  },
  events: {
    key: "events",
    tables: [
      { table: "tasks", where: "event_id is not null", label: "משימות שהיו משויכות לאירועים" },
      { table: "event_ideas", label: "רעיונות לאירועים" },
      { table: "events", label: "אירועים והמדיה שלהם" },
    ],
    storage: [{ bucket: "events", label: "תמונות וסרטונים מהאירועים" }],
    keeps: ["המשימות הרגילות של העסק"],
    loses: "האירועים, המדיה שלהם, הרעיונות והמשימות שהיו תלויות בהם.",
  },
};

export const FEATURE_DATA_KEYS = Object.keys(FEATURE_DATA) as FeatureKey[];

/** Tables no module owns: shared business configuration a purge never touches. */
export const PROTECTED_TABLES: string[] = [
  "businesses",
  "business_features",
  "profiles",
  "departments",
  "shift_templates",
];

/** Sort tables into a foreign-key-safe deletion order. Unknown tables go last. */
export function orderedTables(tables: FeatureTable[]): FeatureTable[] {
  const rank = (t: string) => {
    const i = PURGE_ORDER.indexOf(t);
    return i === -1 ? PURGE_ORDER.length : i;
  };
  return [...tables].sort((a, b) => rank(a.table) - rank(b.table));
}

export interface PurgePlan {
  /** Modules being switched off, in the order they should be reported. */
  keys: FeatureKey[];
  /** Every table that will be emptied, deduped and ordered child-first. */
  tables: FeatureTable[];
  /** Storage prefixes that go with them. */
  storage: { bucket: string; label: string }[];
  /** True when nothing is actually being switched off. */
  empty: boolean;
}

/**
 * What a set of switch-offs destroys.
 *
 * Dedupe is by `table + where`: `events` and `tasks` both delete from `tasks`,
 * but the events row set is a strict subset — when both modules go off in the
 * same click, the unscoped delete wins and the scoped one is dropped.
 */
export function purgePlanFor(keys: Iterable<FeatureKey>): PurgePlan {
  const list = [...new Set(keys)].filter((k) => FEATURE_DATA[k]);
  const unscoped = new Set<string>();
  for (const key of list) {
    for (const t of FEATURE_DATA[key].tables) if (!t.where) unscoped.add(t.table);
  }

  const byId = new Map<string, FeatureTable>();
  for (const key of list) {
    for (const t of FEATURE_DATA[key].tables) {
      if (t.where && unscoped.has(t.table)) continue;
      byId.set(`${t.table}|${t.where ?? ""}`, t);
    }
  }

  const buckets = new Map<string, { bucket: string; label: string }>();
  for (const key of list) {
    for (const s of FEATURE_DATA[key].storage) buckets.set(s.bucket, s);
  }

  return {
    keys: list,
    tables: orderedTables([...byId.values()]),
    storage: [...buckets.values()],
    empty: list.length === 0,
  };
}

/**
 * Turn one switch-off into the full list of modules that go down with it, so
 * the dialog can warn about the cascade *before* anything is deleted (turning
 * off "סחורות" also turns off "בלאי", and that deletes waste reports too).
 */
export function switchOffCascade(state: FeatureState, key: FeatureKey): FeatureKey[] {
  const { turnedOff } = applyFeatureToggle(state, key, false);
  return state[key] ? [key, ...turnedOff] : turnedOff;
}

/** Row counts keyed by feature → table → rows, as returned by the report RPC. */
export type FeatureDataReport = Partial<Record<FeatureKey, Record<string, number>>>;

/** Total rows a plan will delete, given a report. Unreported tables count as 0. */
export function totalRows(plan: PurgePlan, report: FeatureDataReport | undefined): number {
  if (!report) return 0;
  const counted = new Set<string>();
  let sum = 0;
  for (const key of plan.keys) {
    for (const [table, rows] of Object.entries(report[key] ?? {})) {
      if (counted.has(table)) continue;
      counted.add(table);
      sum += rows;
    }
  }
  return sum;
}

/** Per-table rows for one module, in deletion order, with counts merged in. */
export function tableRowsFor(
  key: FeatureKey,
  report: FeatureDataReport | undefined,
): { table: FeatureTable; rows: number | null }[] {
  const scope = FEATURE_DATA[key];
  if (!scope) return [];
  const counts = report?.[key];
  return orderedTables(scope.tables).map((table) => ({
    table,
    rows: counts ? (counts[table.table] ?? 0) : null,
  }));
}

/** The Hebrew label of a module, for dialog copy. */
export function moduleLabel(key: FeatureKey): string {
  return MODULE_BY_KEY.get(key)?.label ?? key;
}
