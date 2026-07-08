import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compressImage } from "@/lib/compressImage";
import { supabase } from "@/lib/supabase";
import type { InventoryAction, InventoryItem, InventoryLog, InventoryOrder, OrderStatus } from "@/types/database";

function throwDbError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/** Human-readable save error for inventory forms (Supabase errors are plain objects, not Error). */
export function inventorySaveError(e: unknown): string {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e !== null && "message" in e
        ? String((e as { message: unknown }).message)
        : "";
  if (msg.includes("batch_id")) {
    return "עמודת «קיבוץ הזמנות» חסרה במסד הנתונים. ב-Supabase: SQL Editor → הריצו את supabase/patches/021_inventory_order_batch.sql";
  }
  if (msg.includes("supplier_delivery_day")) {
    return "עמודת «יום אספקה מהספק» חסרה במסד הנתונים. ב-Supabase: SQL Editor → הריצו את supabase/patches/020_inventory_supplier_delivery_day.sql";
  }
  if (msg.includes("min_quantity")) {
    return "עמודת «כמות מינימום» חסרה במסד הנתונים. ב-Supabase: SQL Editor → הריצו את supabase/patches/011_inventory_min_quantity.sql";
  }
  if (msg.includes("units_per_package")) {
    return "עמודת «יחידים ביחידת מידה» חסרה במסד הנתונים. ב-Supabase: SQL Editor → הריצו את supabase/patches/030_inventory_units_per_package.sql";
  }
  if (/bucket|storage/i.test(msg)) {
    return "שגיאה בהעלאת תמונה. ודאו שקיים Bucket בשם inventory ב-Storage.";
  }
  return msg || "שגיאה בשמירה";
}

export interface ItemWithQty extends InventoryItem {
  current_qty: number;
  /** Sum of quantities in open orders (status ≠ received) */
  ordered_qty: number;
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
    throwDbError(error);
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

export const BASE_UNIT = "יחידות" as const;

/** Whether the item's main unit allows entering quantities as individual pieces. */
export function supportsPieceInput(unit: string | null | undefined): boolean {
  return !!unit && unit !== BASE_UNIT;
}

export function canUsePieceInput(unit: string | null | undefined, unitsPerPackage: number | null | undefined): boolean {
  return supportsPieceInput(unit) && (unitsPerPackage ?? 0) > 0;
}

/** Convert individual pieces to the item's main unit. */
export function piecesToMainUnit(pieces: number, unitsPerPackage: number): number {
  if (unitsPerPackage <= 0) return pieces;
  return Math.round((pieces / unitsPerPackage) * 10000) / 10000;
}

/** Convert main-unit quantity to individual pieces for display. */
export function mainUnitToPieces(qty: number, unitsPerPackage: number): number {
  if (unitsPerPackage <= 0) return qty;
  return Math.round(qty * unitsPerPackage * 100) / 100;
}

/** Format quantity with optional piece equivalent, e.g. "2.5 ארגז (60 יח׳)". */
export function formatQtyWithPieces(qty: number, unit: string | null, unitsPerPackage: number | null | undefined): string {
  const unitLabel = unit ? ` ${unit}` : "";
  const base = `${qty}${unitLabel}`;
  if (!canUsePieceInput(unit, unitsPerPackage)) return base;
  const pieces = mainUnitToPieces(qty, unitsPerPackage!);
  return `${base} (${pieces} יח׳)`;
}

export async function uploadItemImage(businessId: string, file: File): Promise<string> {
  const compressed = await compressImage(file);
  const path = `${businessId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("inventory").upload(path, compressed, {
    upsert: false,
    contentType: "image/jpeg",
  });
  throwDbError(error);
  const { data } = supabase.storage.from("inventory").getPublicUrl(path);
  return data.publicUrl;
}

export function useInventory(businessId: string | null) {
  return useQuery({
    queryKey: ["inventory", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<ItemWithQty[]> => {
      const [{ data: items, error }, { data: counts }, { data: orderRows }] = await Promise.all([
        supabase.from("inventory_items").select("*").eq("business_id", businessId).eq("active", true).order("name"),
        supabase.from("inventory_counts").select("item_id, quantity, counted_at").eq("business_id", businessId).order("counted_at", { ascending: false }),
        supabase.from("inventory_orders").select("item_id, quantity, status").eq("business_id", businessId),
      ]);
      throwDbError(error);
      const latest = new Map<string, number>();
      (counts ?? []).forEach((c) => {
        if (!latest.has(c.item_id)) latest.set(c.item_id, Number(c.quantity));
      });
      const pending = new Map<string, number>();
      (orderRows ?? []).forEach((o) => {
        if (o.status === "received") return;
        pending.set(o.item_id, (pending.get(o.item_id) ?? 0) + Number(o.quantity));
      });
      return (items ?? []).map((it) => ({
        ...(it as InventoryItem),
        current_qty: latest.get(it.id) ?? 0,
        ordered_qty: pending.get(it.id) ?? 0,
      }));
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
      units_per_package?: number | null;
      image_url?: string | null;
      min_quantity?: number;
      supplier_delivery_day?: number | null;
      quantity?: number;
      employee_id?: string | null;
    }) => {
      const { quantity, employee_id, ...itemInput } = input;
      const { data, error } = await supabase.from("inventory_items").insert(itemInput).select("id").single();
      throwDbError(error);
      if (!data) throw new Error("שמירת המוצר נכשלה");
      if (quantity != null && quantity >= 0) {
        const { error: countError } = await supabase.from("inventory_counts").insert({
          business_id: input.business_id,
          item_id: data.id,
          employee_id: employee_id ?? null,
          quantity,
        });
        throwDbError(countError);
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
      throwDbError(error);
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
      throwDbError(error);
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
      throwDbError(error);
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

export interface InventoryOrderWithUser extends InventoryOrder {
  ordered_by_name: string | null;
}

export function useOrders(businessId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["inventory_orders", businessId],
    enabled: !!businessId && enabled,
    queryFn: async (): Promise<InventoryOrderWithUser[]> => {
      const { data, error } = await supabase
        .from("inventory_orders")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      throwDbError(error);
      const orders = (data ?? []) as InventoryOrder[];

      const ids = [...new Set(orders.map((o) => o.ordered_by).filter((id): id is string => !!id))];
      const names = new Map<string, string | null>();
      if (ids.length) {
        const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        (people ?? []).forEach((p) => names.set(p.id, p.full_name));
      }
      return orders.map((o) => ({
        ...o,
        ordered_by_name: o.ordered_by ? names.get(o.ordered_by) ?? null : null,
      }));
    },
  });
}

export function useCreateOrdersBatch(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      ordered_by: string | null;
      lines: { item_id: string; quantity: number }[];
    }) => {
      if (!input.lines.length) throw new Error("נא לבחור לפחות מוצר אחד");
      const batch_id = crypto.randomUUID();
      const rows = input.lines.map((l) => ({
        business_id: input.business_id,
        item_id: l.item_id,
        quantity: l.quantity,
        ordered_by: input.ordered_by,
        batch_id,
        status: "requested" as const,
      }));
      const { error } = await supabase.from("inventory_orders").insert(rows);
      throwDbError(error);
      for (const l of input.lines) {
        await logInventory({
          business_id: input.business_id,
          item_id: l.item_id,
          employee_id: input.ordered_by,
          action: "order",
          new_qty: l.quantity,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_orders", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory", businessId] });
    },
  });
}

export function useUpdateOrdersBatch(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      batch_id: string;
      business_id: string;
      ordered_by: string | null;
      line_ids: string[];
      lines: { item_id: string; quantity: number }[];
    }) => {
      if (!input.lines.length) throw new Error("נא לבחור לפחות מוצר אחד עם כמות");
      const { error: delError } = await supabase.from("inventory_orders").delete().in("id", input.line_ids);
      throwDbError(delError);

      const rows = input.lines.map((l) => ({
        business_id: input.business_id,
        item_id: l.item_id,
        quantity: l.quantity,
        ordered_by: input.ordered_by,
        batch_id: input.batch_id,
        status: "requested" as const,
      }));
      const { error } = await supabase.from("inventory_orders").insert(rows);
      throwDbError(error);

      for (const l of input.lines) {
        await logInventory({
          business_id: input.business_id,
          item_id: l.item_id,
          employee_id: input.ordered_by,
          action: "order",
          new_qty: l.quantity,
          note: "עודכנה הזמנה",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_orders", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory", businessId] });
    },
  });
}

export function useDeleteOrdersBatch(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      line_ids: string[];
      employee_id: string | null;
      lines: { item_id: string; quantity: number }[];
    }) => {
      const { error } = await supabase.from("inventory_orders").delete().in("id", input.line_ids);
      throwDbError(error);
      for (const l of input.lines) {
        await logInventory({
          business_id: input.business_id,
          item_id: l.item_id,
          employee_id: input.employee_id,
          action: "order",
          new_qty: l.quantity,
          note: "הזמנה נמחקה",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_orders", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory", businessId] });
    },
  });
}

export function useCreateOrder(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { business_id: string; item_id: string; quantity: number; ordered_by?: string | null }) => {
      const { error } = await supabase.from("inventory_orders").insert(input);
      throwDbError(error);
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

export function useReceiveOrder(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      order_id: string;
      business_id: string;
      item_id: string;
      quantity: number;
      current_qty: number;
      employee_id: string | null;
    }) => {
      const { error: orderError } = await supabase
        .from("inventory_orders")
        .update({ status: "received" })
        .eq("id", input.order_id);
      throwDbError(orderError);

      const newQty = input.current_qty + input.quantity;
      const { error: countError } = await supabase.from("inventory_counts").insert({
        business_id: input.business_id,
        item_id: input.item_id,
        employee_id: input.employee_id,
        quantity: newQty,
      });
      throwDbError(countError);

      await logInventory({
        business_id: input.business_id,
        item_id: input.item_id,
        employee_id: input.employee_id,
        action: "count",
        previous_qty: input.current_qty,
        new_qty: newQty,
        note: `התקבל מהזמנה: +${input.quantity}`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_orders", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory_logs"] });
    },
  });
}

export function useUpdateOrder(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: OrderStatus }) => {
      const { error } = await supabase.from("inventory_orders").update({ status: input.status }).eq("id", input.id);
      throwDbError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory_orders", businessId] }),
  });
}
