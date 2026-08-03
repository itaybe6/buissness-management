import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { INVENTORY_UNITS } from "@/api/inventory";
import type { InventoryUnit, InventoryUnitKind } from "@/types/database";

export const UNIT_KINDS: {
  value: InventoryUnitKind;
  label: string;
  hint: string;
  icon: string;
}[] = [
  {
    value: "single",
    label: "פריט בודד",
    hint: "נספר אחד-אחד — יחידה, בקבוק, שקית",
    icon: "inventory_2",
  },
  {
    value: "package",
    label: "מארז",
    hint: "מכיל כמה פריטים בודדים — ארגז, מארז, שישייה",
    icon: "widgets",
  },
  {
    value: "measure",
    label: "מידה",
    hint: "נמדד בכמות רציפה — ק״ג, ליטר",
    icon: "scale",
  },
];

const KIND_LABELS: Record<InventoryUnitKind, string> = {
  single: "פריט בודד",
  package: "מארז",
  measure: "מידה",
};

export function inventoryUnitKindLabel(kind: InventoryUnitKind): string {
  return KIND_LABELS[kind];
}

/** Strip punctuation so ק״ג / ק"ג / קג all compare equal. */
function normalizeUnitName(name: string): string {
  return name.toLowerCase().replace(/["'״׳\s.\-]/g, "");
}

const MEASURE_NAMES = new Set(
  [
    "קג", "קילו", "קילוגרם", "קילוגרמים",
    "גרם", "גר", "גרמים",
    "ליטר", "ליטרים", "ל",
    "מל", "מיליליטר", "סמק", "קוב",
    "טון", "מטר", "מטרים",
  ].map(normalizeUnitName),
);

const PACKAGE_NAMES = new Set(
  [
    "ארגז", "ארגזים", "מארז", "מארזים",
    "שישייה", "שישיה", "קרטון", "קרטונים",
    "מגש", "מגשים", "תבנית", "תבניות",
    "משטח", "תריסר", "חבילה", "חבילות",
  ].map(normalizeUnitName),
);

/** Best guess for units that predate the `kind` column or aren't in the catalog. */
export function guessInventoryUnitKind(name: string | null | undefined): InventoryUnitKind {
  const normalized = normalizeUnitName(name?.trim() ?? "");
  if (!normalized) return "single";
  if (MEASURE_NAMES.has(normalized)) return "measure";
  if (PACKAGE_NAMES.has(normalized)) return "package";
  return "single";
}

function defaultUnits(businessId: string): InventoryUnit[] {
  return INVENTORY_UNITS.map((u, i) => ({
    id: `default-${i}`,
    business_id: businessId,
    name: u.value,
    sort_order: i,
    is_base: u.value === "יחידות",
    kind: u.kind as InventoryUnitKind,
    active: true,
    created_at: new Date(0).toISOString(),
  }));
}

/** Rows written before the `kind` column existed still report their old shape. */
function withKind(row: InventoryUnit): InventoryUnit {
  if (row.kind) return row;
  return { ...row, kind: row.is_base ? "single" : guessInventoryUnitKind(row.name) };
}

export function inventoryUnitSaveError(e: unknown): string {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e !== null && "message" in e
        ? String((e as { message: unknown }).message)
        : "";
  if (/inventory_units/i.test(msg) && /duplicate|unique|23505/i.test(msg)) {
    return "יחידת מידה בשם הזה כבר קיימת בעסק";
  }
  if (/kind/i.test(msg) && /inventory_units/i.test(msg)) {
    return "עמודת «סוג יחידה» חסרה. הריצו את המיגרציה inventory_unit_kind ב-Supabase.";
  }
  if (/inventory_units/i.test(msg)) {
    return "טבלת «יחידות מידה» חסרה. הריצו את המיגרציה inventory_units ב-Supabase.";
  }
  return msg || "שגיאה בשמירה";
}

export function useInventoryUnits(businessId: string | null) {
  return useQuery({
    queryKey: ["inventoryUnits", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<InventoryUnit[]> => {
      const { data, error } = await supabase
        .from("inventory_units")
        .select("*")
        .eq("business_id", businessId!)
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) {
        if (/inventory_units/i.test(error.message) && /does not exist|42P01/i.test(error.message)) {
          return defaultUnits(businessId!);
        }
        throw error;
      }
      return ((data ?? []) as InventoryUnit[]).map(withKind);
    },
  });
}

export function useCreateInventoryUnit(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { business_id: string; name: string; kind: InventoryUnitKind }) => {
      const name = input.name.trim();
      if (!name) throw new Error("נא להזין שם יחידת מידה");

      const { data: existing, error: sortError } = await supabase
        .from("inventory_units")
        .select("sort_order")
        .eq("business_id", input.business_id)
        .order("sort_order", { ascending: false })
        .limit(1);
      if (sortError) throw sortError;

      const nextSort = ((existing?.[0]?.sort_order as number | undefined) ?? 0) + 1;

      const { data, error } = await supabase
        .from("inventory_units")
        .insert({
          business_id: input.business_id,
          name,
          sort_order: nextSort,
          kind: input.kind,
          is_base: false,
        })
        .select()
        .single();
      if (error) throw error;
      return withKind(data as InventoryUnit);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventoryUnits", businessId] }),
  });
}

/** Ensure the current value appears even if it is legacy / inactive. */
export function inventoryUnitOptions(units: InventoryUnit[] | undefined, currentValue?: string | null): InventoryUnit[] {
  const list = units?.length ? [...units] : defaultUnits("");

  const trimmed = currentValue?.trim();
  if (trimmed && !list.some((u) => u.name === trimmed)) {
    list.push({
      id: `legacy-${trimmed}`,
      business_id: "",
      name: trimmed,
      sort_order: 9999,
      is_base: trimmed === "יחידות",
      kind: guessInventoryUnitKind(trimmed),
      active: true,
      created_at: new Date(0).toISOString(),
    });
  }

  return list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "he"));
}

/** How the given unit behaves — from the business catalog, falling back to a name guess. */
export function inventoryUnitKind(
  name: string | null | undefined,
  units?: InventoryUnit[],
): InventoryUnitKind {
  const trimmed = name?.trim();
  if (!trimmed) return "single";
  const fromDb = units?.find((u) => u.name === trimmed);
  if (fromDb) return fromDb.kind ?? (fromDb.is_base ? "single" : guessInventoryUnitKind(trimmed));
  return guessInventoryUnitKind(trimmed);
}

/** Continuous measures are never broken into countable pieces. */
export function unitAllowsPackaging(name: string | null | undefined, units?: InventoryUnit[]): boolean {
  return inventoryUnitKind(name, units) !== "measure";
}

/** A package unit is expected to have a pack size; a single item is not. */
export function unitExpectsPackaging(name: string | null | undefined, units?: InventoryUnit[]): boolean {
  return inventoryUnitKind(name, units) === "package";
}

/** Only measures accept fractional quantities (2.5 ק״ג); countable units do not. */
export function unitAllowsFractions(name: string | null | undefined, units?: InventoryUnit[]): boolean {
  return inventoryUnitKind(name, units) === "measure";
}

/** Units that can sit inside a package — i.e. everything countable. */
export function pieceUnitOptions(units: InventoryUnit[] | undefined, currentValue?: string | null): InventoryUnit[] {
  const all = inventoryUnitOptions(units, currentValue);
  const trimmed = currentValue?.trim();
  return all.filter((u) => u.kind === "single" || u.name === trimmed);
}
