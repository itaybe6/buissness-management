import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { InventoryCategory } from "@/types/database";

export function useInventoryCategories(businessId: string | null) {
  return useQuery({
    queryKey: ["inventoryCategories", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<InventoryCategory[]> => {
      const { data, error } = await supabase
        .from("inventory_categories")
        .select("*")
        .eq("business_id", businessId)
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as InventoryCategory[];
    },
  });
}

export function useCreateInventoryCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      name: string;
      color?: string;
      sort_order?: number;
    }) => {
      const { error } = await supabase.from("inventory_categories").insert(input);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["inventoryCategories", v.business_id] }),
  });
}

export function useUpdateInventoryCategory(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<InventoryCategory> & { id: string }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("inventory_categories").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventoryCategories", businessId] }),
  });
}

export function useDeleteInventoryCategory(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventoryCategories", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory", businessId] });
    },
  });
}

const CATEGORY_COLORS = ["#4b93f7", "#a05de0", "#d1912c", "#12a5b4", "#e2445c", "#1fb974", "#3fb8ef", "#7480ea", "#8b939e"];

export function nextInventoryCategoryColor(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

export function inventoryCategoryById(
  categories: InventoryCategory[] | undefined,
  categoryId: string | null | undefined,
): InventoryCategory | null {
  if (!categoryId || !categories?.length) return null;
  return categories.find((c) => c.id === categoryId) ?? null;
}

export function inventoryCategoryName(
  categories: InventoryCategory[] | undefined,
  categoryId: string | null | undefined,
): string | null {
  return inventoryCategoryById(categories, categoryId)?.name ?? null;
}
