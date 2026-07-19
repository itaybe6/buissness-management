import { supabase } from "@/lib/supabase";
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

/**
 * Bootstrap the built-in templates for a business that doesn't have them yet,
 * based on rows the caller already fetched (no extra read). Returns true when
 * rows were inserted. Never throws — RLS may deny the insert for employees,
 * and the page must still render with whatever templates exist.
 */
export async function ensureDefaultShiftTemplates(
  businessId: string,
  existing: { shift_key: ShiftKey | null }[]
): Promise<boolean> {
  const keys = new Set(existing.map((r) => r.shift_key).filter(Boolean));
  const missing = DEFAULT_SHIFT_DEFINITIONS.filter((d) => !keys.has(d.key));
  if (missing.length === 0) return false;

  const { error: insErr } = await supabase.from("shift_templates").insert(
    missing.map((d) => ({
      business_id: businessId,
      shift_key: d.key,
      name: d.name,
      start_time: d.startTime,
      end_time: d.endTime,
      color: d.color,
      active: d.activeDefault,
      sort_order: d.sortOrder,
    }))
  );
  if (insErr) {
    console.warn("ensureDefaultShiftTemplates: insert failed", insErr.message);
    return false;
  }
  return true;
}
