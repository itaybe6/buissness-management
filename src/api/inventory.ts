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
  if (msg.includes("inventory_categories")) {
    return "טבלת «קטגוריות מוצרים» חסרה במסד הנתונים. ב-Supabase: SQL Editor → הריצו את supabase/patches/051_inventory_categories.sql";
  }
  if (msg.includes("category_id")) {
    return "עמודת «קטגוריה» במוצרים לא עודכנה. ב-Supabase: SQL Editor → הריצו את supabase/patches/051_inventory_categories.sql";
  }
  if (msg.includes("unit_price") && msg.includes("inventory_items")) {
    return "עמודת «מחיר ליחידה» הוסרה ממוצרי המלאי — המחירים מוגדרים לפי ספק בלבד.";
  }
  if (msg.includes("inventory_item_departments")) {
    return "טבלת «שיוך מוצרים למחלקות» חסרה. ב-Supabase: SQL Editor → הריצו את supabase/patches/041_inventory_item_departments.sql";
  }
  if (msg.includes("supplier_id") || msg.includes("suppliers")) {
    return "טבלת «ספקים» חסרה. ב-Supabase: SQL Editor → הריצו את supabase/patches/046_suppliers.sql";
  }
  if (/bucket|storage/i.test(msg)) {
    return "שגיאה בהעלאת תמונה. ודאו שקיים Bucket בשם inventory ב-Storage.";
  }
  return msg || "שגיאה בשמירה";
}

export interface ItemWithQty extends InventoryItem {
  /** Empty = visible to all departments (legacy / unset). */
  department_ids: string[];
  current_qty: number;
  /** Sum of quantities in open orders (status ≠ received) */
  ordered_qty: number;
  /** Employee who recorded the latest inventory count */
  last_updated_by: string | null;
  last_updated_at: string | null;
  last_updated_by_name: string | null;
}

export function isTrackedLowStock(item: ItemWithQty): boolean {
  return item.min_quantity > 0 && item.current_qty <= item.min_quantity;
}

/** Line total: quantity × supplier unit price (per main unit). */
export function inventoryLineTotal(
  _item: unknown,
  quantity: number,
  supplierUnitPrice?: number | null,
): number {
  const price = supplierUnitPrice != null && supplierUnitPrice > 0 ? supplierUnitPrice : 0;
  if (!Number.isFinite(quantity) || !Number.isFinite(price)) return 0;
  return Math.round(quantity * price * 100) / 100;
}

export function resolveItemUnitPrice(
  _item: unknown,
  itemId: string,
  supplierPrices?: Map<string, number> | null,
): number {
  const sp = supplierPrices?.get(itemId);
  return sp != null && sp > 0 ? sp : 0;
}

export function orderLineBillableQty(line: Pick<InventoryOrder, "quantity" | "received_quantity" | "status">): number {
  if (line.status === "received") {
    return Number(line.received_quantity ?? line.quantity);
  }
  return Number(line.quantity);
}

export function isPartialReceivedOrderLine(
  line: Pick<InventoryOrder, "status" | "quantity" | "received_quantity">,
): boolean {
  if (line.status !== "received") return false;
  const received = Number(line.received_quantity ?? line.quantity);
  return received < Number(line.quantity);
}

/** Batch has a partial receive and still has lines waiting (remainder open). */
export function batchHasActivePartialDelivery(lines: Pick<InventoryOrder, "status" | "quantity" | "received_quantity">[]): boolean {
  if (lines.length === 0) return false;
  const hasPartial = lines.some(isPartialReceivedOrderLine);
  const hasPending = lines.some((l) => l.status !== "received");
  return hasPartial && hasPending;
}

export function batchPartialDeliveryEventAt(lines: Pick<InventoryOrder, "created_at">[]): string {
  if (lines.length === 0) return "";
  return lines.reduce((max, l) => (l.created_at > max ? l.created_at : max), lines[0].created_at);
}

export function groupInventoryOrdersByBatch(orders: InventoryOrder[]): Map<string, InventoryOrder[]> {
  const map = new Map<string, InventoryOrder[]>();
  for (const o of orders) {
    const key = o.batch_id ?? o.id;
    const list = map.get(key);
    if (list) list.push(o);
    else map.set(key, [o]);
  }
  return map;
}

export function orderBatchTotal(
  lines: {
    item_id: string;
    quantity: number;
    received_quantity?: number | null;
    status: InventoryOrder["status"];
    item?: Pick<ItemWithQty, "id"> | null;
  }[],
  supplierPrices?: Map<string, number> | null,
): number {
  return lines.reduce((sum, line) => {
    const qty = orderLineBillableQty(line as InventoryOrder);
    const sp = supplierPrices?.get(line.item_id);
    return sum + inventoryLineTotal(line.item, qty, sp);
  }, 0);
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

/** Split a main-unit qty into whole packages + leftover pieces (no decimals). */
export function splitPackageQty(
  qty: number,
  unitsPerPackage: number,
): { packages: number; pieces: number; totalPieces: number } {
  const totalPieces = Math.round(mainUnitToPieces(qty, unitsPerPackage));
  if (unitsPerPackage <= 0) {
    return { packages: totalPieces, pieces: 0, totalPieces };
  }
  return {
    packages: Math.floor(totalPieces / unitsPerPackage),
    pieces: totalPieces % unitsPerPackage,
    totalPieces,
  };
}

/**
 * Format quantity for display.
 * Package units with units_per_package → "7 ארגז + 2 יח׳" (never a decimal package count).
 */
export function formatQtyWithPieces(
  qty: number,
  unit: string | null,
  unitsPerPackage: number | null | undefined,
): string {
  const unitLabel = unit?.trim() || "";
  if (!canUsePieceInput(unit, unitsPerPackage)) {
    return unitLabel ? `${qty} ${unitLabel}` : String(qty);
  }
  const { packages, pieces } = splitPackageQty(qty, unitsPerPackage!);
  if (packages === 0 && pieces === 0) {
    return unitLabel ? `0 ${unitLabel}` : "0";
  }
  if (packages === 0) return `${pieces} יח׳`;
  if (pieces === 0) return unitLabel ? `${packages} ${unitLabel}` : String(packages);
  return unitLabel ? `${packages} ${unitLabel} + ${pieces} יח׳` : `${packages} + ${pieces} יח׳`;
}

async function fetchItemDepartmentMap(businessId: string): Promise<Map<string, string[]>> {
  const { data, error } = await supabase
    .from("inventory_item_departments")
    .select("item_id, department_id")
    .eq("business_id", businessId);
  if (error) {
    if (error.message.includes("inventory_item_departments")) return new Map();
    throwDbError(error);
  }
  const map = new Map<string, string[]>();
  (data ?? []).forEach((row: { item_id: string; department_id: string }) => {
    const list = map.get(row.item_id) ?? [];
    list.push(row.department_id);
    map.set(row.item_id, list);
  });
  return map;
}

export async function replaceItemDepartments(
  businessId: string,
  itemId: string,
  departmentIds: string[],
): Promise<void> {
  const { error: delError } = await supabase.from("inventory_item_departments").delete().eq("item_id", itemId);
  throwDbError(delError);
  const unique = [...new Set(departmentIds.filter(Boolean))];
  if (!unique.length) return;
  const rows = unique.map((department_id) => ({
    business_id: businessId,
    item_id: itemId,
    department_id,
  }));
  const { error } = await supabase.from("inventory_item_departments").insert(rows);
  throwDbError(error);
}

export async function uploadItemImage(businessId: string, file: File): Promise<string> {
  const compressed = await compressImage(file, { maxWidth: 640, maxHeight: 640, quality: 0.82 });
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
      const [{ data: items, error }, { data: counts }, { data: orderRows }, deptMap] = await Promise.all([
        supabase.from("inventory_items").select("*").eq("business_id", businessId).eq("active", true).order("name"),
        supabase
          .from("inventory_counts")
          .select("item_id, quantity, counted_at, employee_id")
          .eq("business_id", businessId)
          .order("counted_at", { ascending: false }),
        supabase.from("inventory_orders").select("item_id, quantity, status").eq("business_id", businessId),
        fetchItemDepartmentMap(businessId!),
      ]);
      throwDbError(error);
      const latest = new Map<
        string,
        { qty: number; employee_id: string | null; counted_at: string }
      >();
      (counts ?? []).forEach((c) => {
        if (!latest.has(c.item_id)) {
          latest.set(c.item_id, {
            qty: Number(c.quantity),
            employee_id: c.employee_id ?? null,
            counted_at: c.counted_at,
          });
        }
      });
      const pending = new Map<string, number>();
      (orderRows ?? []).forEach((o) => {
        if (o.status === "received") return;
        pending.set(o.item_id, (pending.get(o.item_id) ?? 0) + Number(o.quantity));
      });

      const updaterIds = [
        ...new Set([...latest.values()].map((v) => v.employee_id).filter((id): id is string => !!id)),
      ];
      const updaterNames = new Map<string, string | null>();
      if (updaterIds.length) {
        const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", updaterIds);
        (people ?? []).forEach((p) => updaterNames.set(p.id, p.full_name));
      }

      return (items ?? []).map((it) => {
        const count = latest.get(it.id);
        const updaterId = count?.employee_id ?? null;
        return {
          ...(it as InventoryItem),
          department_ids: deptMap.get(it.id) ?? [],
          current_qty: count?.qty ?? 0,
          ordered_qty: pending.get(it.id) ?? 0,
          last_updated_by: updaterId,
          last_updated_at: count?.counted_at ?? null,
          last_updated_by_name: updaterId ? updaterNames.get(updaterId) ?? null : null,
        };
      });
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
      category_id?: string | null;
      department_ids?: string[];
      quantity?: number;
      employee_id?: string | null;
    }) => {
      const { quantity, employee_id, department_ids, ...itemInput } = input;
      const { data, error } = await supabase.from("inventory_items").insert(itemInput).select("id").single();
      throwDbError(error);
      if (!data) throw new Error("שמירת המוצר נכשלה");
      if (department_ids?.length) {
        await replaceItemDepartments(input.business_id, data.id, department_ids);
      }
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
      department_ids?: string[];
      /** Human-readable summary of what changed, stored on the audit log. */
      note?: string | null;
    }) => {
      const { department_ids, ...rest } = input;
      const { error } = await supabase.from("inventory_items").update(rest.changes).eq("id", rest.id);
      throwDbError(error);
      if (department_ids !== undefined) {
        await replaceItemDepartments(rest.business_id, rest.id, department_ids);
      }
      await logInventory({
        business_id: rest.business_id,
        item_id: rest.id,
        employee_id: rest.employee_id ?? null,
        action: "edited",
        note: rest.note ?? null,
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
  supplier_name: string | null;
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

      const supplierIds = [...new Set(orders.map((o) => o.supplier_id).filter((id): id is string => !!id))];
      const supplierNames = new Map<string, string>();
      if (supplierIds.length) {
        const { data: suppliers } = await supabase.from("suppliers").select("id, name").in("id", supplierIds);
        (suppliers ?? []).forEach((s) => supplierNames.set(s.id, s.name));
      }

      return orders.map((o) => ({
        ...o,
        ordered_by_name: o.ordered_by ? names.get(o.ordered_by) ?? null : null,
        supplier_name: o.supplier_id ? supplierNames.get(o.supplier_id) ?? null : null,
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
      supplier_id?: string | null;
      lines: { item_id: string; quantity: number }[];
    }) => {
      if (!input.lines.length) throw new Error("נא לבחור לפחות מוצר אחד");
      const batch_id = crypto.randomUUID();
      const rows = input.lines.map((l) => ({
        business_id: input.business_id,
        item_id: l.item_id,
        quantity: l.quantity,
        ordered_by: input.ordered_by,
        supplier_id: input.supplier_id ?? null,
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
      supplier_id?: string | null;
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
        supplier_id: input.supplier_id ?? null,
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
      ordered_quantity: number;
      received_quantity: number;
      current_qty: number;
      employee_id: string | null;
      batch_id: string | null;
      ordered_by: string | null;
      supplier_id: string | null;
    }) => {
      const ordered = input.ordered_quantity;
      const received = input.received_quantity;
      if (!Number.isFinite(received) || received <= 0 || received > ordered) {
        throw new Error("כמות שהגיעה חייבת להיות בין 1 לכמות שהוזמנה");
      }

      if (received < ordered) {
        const { error: remainderError } = await supabase.from("inventory_orders").insert({
          business_id: input.business_id,
          item_id: input.item_id,
          quantity: ordered - received,
          status: "requested",
          ordered_by: input.ordered_by,
          batch_id: input.batch_id,
          supplier_id: input.supplier_id,
        });
        throwDbError(remainderError);
      }

      const { error: orderError } = await supabase
        .from("inventory_orders")
        .update({ status: "received", received_quantity: received })
        .eq("id", input.order_id);
      throwDbError(orderError);

      const newQty = input.current_qty + received;
      const { error: countError } = await supabase.from("inventory_counts").insert({
        business_id: input.business_id,
        item_id: input.item_id,
        employee_id: input.employee_id,
        quantity: newQty,
      });
      throwDbError(countError);

      const note =
        received < ordered
          ? `הגיע · נוסף למלאי +${received} מתוך ${ordered}`
          : `הגיע · נוסף למלאי +${received}`;

      await logInventory({
        business_id: input.business_id,
        item_id: input.item_id,
        employee_id: input.employee_id,
        action: "order",
        previous_qty: input.current_qty,
        new_qty: newQty,
        note,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_orders", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory_logs"] });
    },
  });
}

/** Mark a pending order as not arrived — removes it from «בהזמנה» without adding stock. */
export function useMarkOrderNotArrived(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      order_id: string;
      business_id: string;
      item_id: string;
      quantity: number;
      employee_id: string | null;
    }) => {
      const { error } = await supabase.from("inventory_orders").delete().eq("id", input.order_id);
      throwDbError(error);
      await logInventory({
        business_id: input.business_id,
        item_id: input.item_id,
        employee_id: input.employee_id,
        action: "order",
        new_qty: input.quantity,
        note: `לא הגיע · הוסר מהזמנות (${input.quantity})`,
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
