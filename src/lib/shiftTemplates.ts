import type { ShiftKey } from "@/types/database";

export const DEFAULT_SHIFT_DEFINITIONS: {
  key: ShiftKey;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  activeDefault: boolean;
  sortOrder: number;
}[] = [
  { key: "morning", name: "בוקר", startTime: "06:00", endTime: "14:00", color: "#eab308", activeDefault: true, sortOrder: 0 },
  { key: "afternoon", name: "צהריים", startTime: "11:00", endTime: "19:00", color: "#fdab3d", activeDefault: true, sortOrder: 1 },
  { key: "evening", name: "ערב", startTime: "16:00", endTime: "23:30", color: "#7c3aed", activeDefault: true, sortOrder: 2 },
  { key: "night", name: "לילה", startTime: "22:00", endTime: "06:00", color: "#2563eb", activeDefault: false, sortOrder: 3 },
];

const SHIFT_KEY_ORDER = DEFAULT_SHIFT_DEFINITIONS.map((d) => d.key);

function startTimeMinutes(time: string): number {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

export function sortShiftTemplates<T extends { shift_key: ShiftKey | null; sort_order: number; start_time: string }>(
  templates: T[]
): T[] {
  return [...templates].sort((a, b) => {
    const diff = startTimeMinutes(a.start_time) - startTimeMinutes(b.start_time);
    if (diff !== 0) return diff;
    const ai = a.shift_key ? SHIFT_KEY_ORDER.indexOf(a.shift_key) : 99;
    const bi = b.shift_key ? SHIFT_KEY_ORDER.indexOf(b.shift_key) : 99;
    if (ai !== bi) return ai - bi;
    return a.sort_order - b.sort_order;
  });
}

/** Map key used for the "general" (no department) bucket. */
export const GENERAL_SHIFT_SECTION_KEY = "general";

export function shiftSectionKey(departmentId: string | null | undefined): string {
  return departmentId ?? GENERAL_SHIFT_SECTION_KEY;
}

/**
 * Templates that belong to one department. `null` returns the general shifts
 * (templates with no department).
 */
export function templatesForDepartment<T extends { department_id: string | null; sort_order?: number }>(
  templates: T[],
  departmentId: string | null
): T[] {
  return templates
    .filter((t) => (t.department_id ?? null) === departmentId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/**
 * Group templates by department id. The general bucket is keyed by
 * GENERAL_SHIFT_SECTION_KEY. Keeps the input order inside each bucket.
 */
export function groupTemplatesByDepartment<T extends { department_id: string | null; sort_order?: number }>(
  templates: T[]
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const t of templates) {
    const key = shiftSectionKey(t.department_id);
    const bucket = m.get(key);
    if (bucket) bucket.push(t);
    else m.set(key, [t]);
  }
  for (const bucket of m.values()) {
    bucket.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }
  return m;
}

/**
 * Shifts an employee submits availability for: only their department's shifts.
 * An employee without a department has none until they are assigned one.
 */
export function templatesForEmployee<T extends { department_id: string | null; sort_order?: number }>(
  templates: T[],
  employeeDepartmentId: string | null | undefined
): T[] {
  if (!employeeDepartmentId) return [];
  return templatesForDepartment(templates, employeeDepartmentId);
}

/**
 * Kept so existing callers still compile. Shifts are defined per department in
 * settings, so nothing is inserted automatically.
 */
export async function ensureDefaultShiftTemplates(
  businessId: string,
  existing: { shift_key: ShiftKey | null }[]
): Promise<boolean> {
  void businessId;
  void existing;
  return false;
}
