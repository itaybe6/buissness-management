import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { INVENTORY_UNITS } from "@/api/inventory";
import type { InventoryUnit } from "@/types/database";

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
          return INVENTORY_UNITS.map((u, i) => ({
            id: `default-${i}`,
            business_id: businessId!,
            name: u.value,
            sort_order: i,
            is_base: u.value === "יחידות",
            active: true,
            created_at: new Date(0).toISOString(),
          }));
        }
        throw error;
      }
      return (data ?? []) as InventoryUnit[];
    },
  });
}

export function useCreateInventoryUnit(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { business_id: string; name: string }) => {
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
          is_base: false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as InventoryUnit;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventoryUnits", businessId] }),
  });
}

/** Ensure the current value appears even if it is legacy / inactive. */
export function inventoryUnitOptions(units: InventoryUnit[] | undefined, currentValue?: string | null): InventoryUnit[] {
  const list = units?.length
    ? [...units]
    : INVENTORY_UNITS.map((u, i) => ({
        id: `default-${i}`,
        business_id: "",
        name: u.value,
        sort_order: i,
        is_base: u.value === "יחידות",
        active: true,
        created_at: new Date(0).toISOString(),
      }));

  const trimmed = currentValue?.trim();
  if (trimmed && !list.some((u) => u.name === trimmed)) {
    list.push({
      id: `legacy-${trimmed}`,
      business_id: "",
      name: trimmed,
      sort_order: 9999,
      is_base: trimmed === "יחידות",
      active: true,
      created_at: new Date(0).toISOString(),
    });
  }

  return list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "he"));
}

export function inventoryUnitIsBase(name: string | null | undefined, units?: InventoryUnit[]): boolean {
  const trimmed = name?.trim();
  if (!trimmed) return true;
  const fromDb = units?.find((u) => u.name === trimmed);
  if (fromDb) return fromDb.is_base;
  return trimmed === "יחידות";
}
