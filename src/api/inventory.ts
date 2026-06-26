import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { InventoryItem, InventoryOrder, OrderStatus } from "@/types/database";

export interface ItemWithQty extends InventoryItem {
  current_qty: number;
}

export function useInventory(businessId: string | null) {
  return useQuery({
    queryKey: ["inventory", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<ItemWithQty[]> => {
      const [{ data: items, error }, { data: counts }] = await Promise.all([
        supabase.from("inventory_items").select("*").eq("business_id", businessId).eq("active", true).order("name"),
        supabase.from("inventory_counts").select("item_id, quantity, counted_at").eq("business_id", businessId).order("counted_at", { ascending: false }),
      ]);
      if (error) throw error;
      const latest = new Map<string, number>();
      (counts ?? []).forEach((c) => {
        if (!latest.has(c.item_id)) latest.set(c.item_id, Number(c.quantity));
      });
      return (items ?? []).map((it) => ({ ...(it as InventoryItem), current_qty: latest.get(it.id) ?? 0 }));
    },
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { business_id: string; name: string; unit?: string; min_quantity?: number }) => {
      const { error } = await supabase.from("inventory_items").insert(input);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["inventory", v.business_id] }),
  });
}

export function useUpdateItem(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<InventoryItem> & { id: string }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("inventory_items").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory", businessId] }),
  });
}

export function useSetCount(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { business_id: string; item_id: string; employee_id: string | null; quantity: number }) => {
      const { error } = await supabase.from("inventory_counts").insert(input);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory", businessId] }),
  });
}

export function useOrders(businessId: string | null) {
  return useQuery({
    queryKey: ["inventory_orders", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<InventoryOrder[]> => {
      const { data, error } = await supabase
        .from("inventory_orders")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InventoryOrder[];
    },
  });
}

export function useCreateOrder(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { business_id: string; item_id: string; quantity: number; ordered_by?: string | null }) => {
      const { error } = await supabase.from("inventory_orders").insert(input);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory_orders", businessId] }),
  });
}

export function useUpdateOrder(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: OrderStatus }) => {
      const { error } = await supabase.from("inventory_orders").update({ status: input.status }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory_orders", businessId] }),
  });
}
