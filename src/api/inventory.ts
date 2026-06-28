import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compressImage } from "@/lib/compressImage";
import { supabase } from "@/lib/supabase";
import type { InventoryAction, InventoryItem, InventoryLog, InventoryOrder, OrderStatus } from "@/types/database";

export interface ItemWithQty extends InventoryItem {
  current_qty: number;
}

/** An audit-log row enriched with the acting employee's name for display. */
export interface ItemLog extends InventoryLog {
  employee_name: string | null;
}

/**
 * Write an entry to the inventory audit log. Intentionally non-fatal: a logging
 * failure (e.g. the inventory_logs table/patch not applied yet) must never break
 * the underlying inventory action, so errors are swallowed with a console warning.
 */
export async function logInventory(input: {
  business_id: string;
  item_id: string;
  employee_id: string | null;
  action: InventoryAction;
  previous_qty?: number | null;
  new_qty?: number | null;
  note?: string | null;
}) {
  try {
    const { error } = await supabase.from("inventory_logs").insert({
      business_id: input.business_id,
      item_id: input.item_id,
      employee_id: input.employee_id ?? null,
      action: input.action,
      previous_qty: input.previous_qty ?? null,
      new_qty: input.new_qty ?? null,
      note: input.note ?? null,
    });
    if (error) throw error;
  } catch (e) {
    console.warn("inventory_logs insert failed (run patch 018?):", e);
  }
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
      min_quantity?: number;
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
      await logInventory({
        business_id: input.business_id,
        item_id: data.id,
        employee_id: employee_id ?? null,
        action: "created",
        new_qty: quantity != null && quantity >= 0 ? quantity : null,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory", businessId] }),
  });
}

export function useUpdateItem(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      business_id: string;
      employee_id?: string | null;
      changes: Partial<InventoryItem>;
      /** Human-readable summary of what changed, stored on the audit log. */
      note?: string | null;
    }) => {
      const { error } = await supabase.from("inventory_items").update(input.changes).eq("id", input.id);
      if (error) throw error;
      await logInventory({
        business_id: input.business_id,
        item_id: input.id,
        employee_id: input.employee_id ?? null,
        action: "edited",
        note: input.note ?? null,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory", businessId] }),
  });
}

export function useSetCount(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      item_id: string;
      employee_id: string | null;
      quantity: number;
      /** Stock level before this update — recorded on the audit log. */
      previous_qty?: number;
    }) => {
      const { previous_qty, ...countInput } = input;
      const { error } = await supabase.from("inventory_counts").insert(countInput);
      if (error) throw error;
      await logInventory({
        business_id: input.business_id,
        item_id: input.item_id,
        employee_id: input.employee_id,
        action: "count",
        previous_qty: previous_qty ?? null,
        new_qty: input.quantity,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory_logs"] });
    },
  });
}

/** History of all logged actions for a single inventory item, newest first. */
export function useItemLogs(businessId: string | null, itemId: string | null) {
  return useQuery({
    queryKey: ["inventory_logs", itemId],
    enabled: !!businessId && !!itemId,
    queryFn: async (): Promise<ItemLog[]> => {
      const { data, error } = await supabase
        .from("inventory_logs")
        .select("*")
        .eq("business_id", businessId)
        .eq("item_id", itemId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const logs = (data ?? []) as InventoryLog[];

      const ids = [...new Set(logs.map((l) => l.employee_id).filter((id): id is string => !!id))];
      const names = new Map<string, string | null>();
      if (ids.length) {
        const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        (people ?? []).forEach((p) => names.set(p.id, p.full_name));
      }
      return logs.map((log) => ({ ...log, employee_name: log.employee_id ? names.get(log.employee_id) ?? null : null }));
    },
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
      await logInventory({
        business_id: input.business_id,
        item_id: input.item_id,
        employee_id: input.ordered_by ?? null,
        action: "order",
        new_qty: input.quantity,
      });
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
