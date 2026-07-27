import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Warehouse } from "@/types/database";

export function useWarehouses(businessId: string | null) {
  return useQuery({
    queryKey: ["warehouses", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<Warehouse[]> => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("business_id", businessId)
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Warehouse[];
    },
  });
}

export function useCreateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      name: string;
      sort_order?: number;
      is_default?: boolean;
    }) => {
      const { error } = await supabase.from("warehouses").insert(input);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["warehouses", v.business_id] }),
  });
}

export function useUpdateWarehouse(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Warehouse> & { id: string }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("warehouses").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warehouses", businessId] }),
  });
}

export function useDeleteWarehouse(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("warehouses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory", businessId] });
    },
  });
}

export function defaultWarehouse(warehouses: Warehouse[] | undefined): Warehouse | null {
  if (!warehouses?.length) return null;
  return warehouses.find((w) => w.is_default) ?? warehouses[0] ?? null;
}

export function warehouseById(
  warehouses: Warehouse[] | undefined,
  warehouseId: string | null | undefined,
): Warehouse | null {
  if (!warehouseId || !warehouses?.length) return null;
  return warehouses.find((w) => w.id === warehouseId) ?? null;
}
