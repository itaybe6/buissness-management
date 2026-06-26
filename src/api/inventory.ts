import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compressImage } from "@/lib/compressImage";
import { supabase } from "@/lib/supabase";
import type { InventoryItem, InventoryOrder, OrderStatus } from "@/types/database";

export interface ItemWithQty extends InventoryItem {
  current_qty: number;
}

export const INVENTORY_UNITS = [
  { value: "יחידות", label: "יחידות" },
  { value: "ארגז", label: "ארגז" },
  { value: "ק״ג", label: "ק״ג" },
  { value: "ליטר", label: "ליטר" },
] as const;

export async function uploadItemImage(businessId: string, file: File): Promise<string> {
  const compressed = await compressImage(file);
  const path = `${businessId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("inventory").upload(path, compressed, {
    upsert: false,
    contentType: "image/jpeg",
  });
  if (error) throw error;
  const { data } = supabase.storage.from("inventory").getPublicUrl(path);
  return data.publicUrl;
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

export function useCreateItem(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      name: string;
      unit?: string;
      image_url?: string | null;
      quantity?: number;
      employee_id?: string | null;
    }) => {
      const { quantity, employee_id, ...itemInput } = input;
      const { data, error } = await supabase.from("inventory_items").insert(itemInput).select("id").single();
      if (error) throw error;
      if (quantity != null && quantity >= 0) {
        const { error: countError } = await supabase.from("inventory_counts").insert({
          business_id: input.business_id,
          item_id: data.id,
          employee_id: employee_id ?? null,
          quantity,
        });
        if (countError) throw countError;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory", businessId] }),
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
