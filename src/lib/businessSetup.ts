import {
  ALL_FEATURE_KEYS,
  MODULE_BY_KEY,
  detectPlan,
  enabledKeysOf,
  type FeatureState,
} from "@/lib/features";
import type { BusinessPlan, FeatureKey } from "@/types/database";

/**
 * Opening a new business — the rules, without the React.
 *
 * The wizard (`CreateBusinessWizard`) and the mutation (`useCreateBusiness`)
 * both call into here, so "what makes a business valid" is stated once and can
 * be tested against the real code instead of a copy of it.
 * Covered by tests/super-admin/businessCreation.test.ts.
 */

export const MIN_MANAGER_PASSWORD = 6;

export interface BusinessDetailsDraft {
  name: string;
  notes?: string;
}

export interface ModuleStepDraft {
  state: FeatureState;
  /** Raw text from the seat input — "" means unlimited. */
  seats: string;
}

export interface ManagerDraft {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
}

/** null = valid. Otherwise the Hebrew message shown under the step. */
export type ValidationError = string | null;

export function validateDetailsStep(draft: BusinessDetailsDraft): ValidationError {
  if (!draft.name.trim()) return "נא להזין שם עסק";
  if (draft.name.trim().length < 2) return "שם העסק קצר מדי";
  return null;
}

/**
 * Seats: empty = unlimited, otherwise a whole number ≥ 1. Rejected here rather
 * than at the DB, where the seat trigger would only complain on the first user.
 */
export function parseSeatCap(seats: string): { cap: number | null; error: ValidationError } {
  const raw = seats.trim();
  if (!raw) return { cap: null, error: null };
  const cap = Number(raw);
  if (!Number.isFinite(cap) || !Number.isInteger(cap) || cap < 1) {
    return { cap: null, error: "מגבלת המשתמשים חייבת להיות מספר שלם חיובי" };
  }
  return { cap, error: null };
}

export function validateModuleStep(draft: ModuleStepDraft): ValidationError {
  const on = enabledKeysOf(draft.state);
  if (on.length === 0) return "יש להפעיל לפחות מודול אחד";

  // A module whose hard requirement is off would render a broken screen — the
  // requirement list comes from the catalog so the two can never drift.
  for (const key of on) {
    const module = MODULE_BY_KEY.get(key);
    const missing = (module?.requires ?? []).find((dep) => !draft.state[dep]);
    if (missing) {
      return `${module?.label ?? key} דורש את ${MODULE_BY_KEY.get(missing)?.label ?? missing}`;
    }
  }

  return parseSeatCap(draft.seats).error;
}

export function validateManagerStep(draft: ManagerDraft): ValidationError {
  if (!draft.full_name.trim()) return "נא להזין שם מלא למנהל המערכת";
  if (!draft.email.trim()) return "נא להזין אימייל למנהל המערכת";
  if (!isEmail(draft.email)) return "כתובת האימייל אינה תקינה";
  if (!draft.password) return "נא להזין סיסמה ראשונית";
  if (draft.password.length < MIN_MANAGER_PASSWORD) {
    return `הסיסמה חייבת להכיל לפחות ${MIN_MANAGER_PASSWORD} תווים`;
  }
  return null;
}

function isEmail(value: string): boolean {
  const v = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

export interface BusinessInsertRow {
  name: string;
  plan: BusinessPlan;
  max_users: number | null;
  admin_notes: string | null;
  created_by: string | null;
}

/**
 * The exact row inserted into `businesses`. Trims what the user typed and
 * normalises empty text to null so the DB never stores "".
 */
export function businessInsertRow(input: {
  name: string;
  state: FeatureState;
  seats: string;
  notes?: string;
  createdBy?: string | null;
  /** Overrides the plan detected from the module set. */
  plan?: BusinessPlan;
}): BusinessInsertRow {
  return {
    name: input.name.trim(),
    plan: input.plan ?? detectPlan(input.state),
    max_users: parseSeatCap(input.seats).cap,
    admin_notes: input.notes?.trim() || null,
    created_by: input.createdBy ?? null,
  };
}

export interface FeatureRow {
  business_id: string;
  feature_key: FeatureKey;
  enabled: boolean;
}

/**
 * One row per module — including the disabled ones. `hasFeature` treats a
 * missing row as off, but writing all ten means a later toggle is an UPDATE and
 * the business always has an explicit answer for every module.
 */
export function featureRowsFor(businessId: string, state: FeatureState): FeatureRow[] {
  return ALL_FEATURE_KEYS.map((feature_key) => ({
    business_id: businessId,
    feature_key,
    enabled: !!state[feature_key],
  }));
}

/** The metadata the create-user edge function needs for the first manager. */
export function managerPayload(businessId: string, draft: ManagerDraft) {
  return {
    email: draft.email.trim(),
    password: draft.password,
    full_name: draft.full_name.trim(),
    phone: draft.phone?.trim() || undefined,
    role: "manager" as const,
    business_id: businessId,
  };
}

/**
 * A business that exists but has no manager can't be logged into, so this is
 * surfaced loudly rather than swallowed — with the recovery step spelled out.
 */
export function managerFailureMessage(businessName: string, reason: string): string {
  return `העסק "${businessName}" נוצר, אך יצירת מנהל המערכת נכשלה: ${reason}. אפשר להוסיף אותו מעמוד העסק.`;
}
