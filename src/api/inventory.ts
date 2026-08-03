import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compressImage } from "@/lib/compressImage";
import { supabase } from "@/lib/supabase";
import { effectiveMainUnitPrice, type SupplierItemPrices } from "@/api/suppliers";
import { nextWarehouseQty, planOrderReceive, planReceiveCorrection } from "@/lib/inventoryReceive";
import type { InventoryAction, InventoryItem, InventoryLog, InventoryOrder, OrderStatus, WarehouseStock } from "@/types/database";

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
  if (msg.includes("min_quantity")) {
    return "עמודת «כמות מינימום» חסרה במסד הנתונים. ב-Supabase: SQL Editor → הריצו את supabase/patches/011_inventory_min_quantity.sql";
  }
  if (msg.includes("piece_unit")) {
    return "עמודת «שם היחיד במארז» חסרה במוצרים. ב-Supabase: SQL Editor → הריצו את supabase/migrations/20260801220000_inventory_unit_kind.sql";
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
  if (msg.includes("warehouses") || msg.includes("warehouse_id")) {
    return "טבלת «מחסנים» חסרה. ב-Supabase: SQL Editor → הריצו את supabase/patches/052_warehouses.sql";
  }
  if (msg.includes("barcode") && msg.includes("inventory_items")) {
    return "עמודת «ברקוד» חסרה במוצרים. ב-Supabase: SQL Editor → הריצו את supabase/patches/053_inventory_item_barcode.sql";
  }
  if (msg.includes("idx_inv_items_business_barcode") || (msg.includes("barcode") && msg.includes("duplicate"))) {
    return "ברקוד זה כבר משויך למוצר אחר בעסק.";
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
  /** Per-warehouse stock levels (latest count per warehouse). */
  warehouse_stocks: WarehouseStock[];
  current_qty: number;
  /** Sum of quantities in open orders (status ≠ received) */
  ordered_qty: number;
  /** Employee who recorded the latest inventory count */
  last_updated_by: string | null;
  last_updated_at: string | null;
  last_updated_by_name: string | null;
}

export function itemWarehouseQty(item: ItemWithQty, warehouseId: string): number {
  return item.warehouse_stocks.find((s) => s.warehouse_id === warehouseId)?.quantity ?? 0;
}

/** Trim barcode; empty string becomes null. */
export function normalizeInventoryBarcode(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  return trimmed || null;
}

/** Match inventory catalog search by product name or barcode. */
export function inventoryItemMatchesQuery(
  item: Pick<InventoryItem, "name" | "barcode">,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (item.name.toLowerCase().includes(q)) return true;
  if (item.barcode?.toLowerCase().includes(q)) return true;
  return false;
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
  item: { units_per_package?: number | null } | unknown,
  itemId: string,
  supplierPrices?: Map<string, SupplierItemPrices> | null,
): number {
  const sp = supplierPrices?.get(itemId);
  if (!sp) return 0;
  const pack =
    item && typeof item === "object" && item !== null && "units_per_package" in item
      ? (item as { units_per_package?: number | null }).units_per_package
      : null;
  return effectiveMainUnitPrice(sp, pack);
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
    item?: Pick<ItemWithQty, "id" | "units_per_package"> | null;
  }[],
  supplierPrices?: Map<string, SupplierItemPrices> | null,
): number {
  return lines.reduce((sum, line) => {
    const qty = orderLineBillableQty(line as InventoryOrder);
    const sp = supplierPrices?.get(line.item_id);
    const unitPrice = effectiveMainUnitPrice(sp, line.item?.units_per_package);
    return sum + inventoryLineTotal(line.item, qty, unitPrice);
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
  warehouse_id?: string | null;
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
      warehouse_id: input.warehouse_id ?? null,
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
  { value: "יחידות", label: "יחידות", kind: "single" },
  { value: "בקבוק", label: "בקבוק", kind: "single" },
  { value: "ארגז", label: "ארגז", kind: "package" },
  { value: "ק״ג", label: "ק״ג", kind: "measure" },
  { value: "ליטר", label: "ליטר", kind: "measure" },
] as const;

/** Fallback label for a single piece when the product did not name one. */
export const BASE_UNIT = "יחידות" as const;

/** The three unit fields every quantity formatter needs. */
export type ItemUnitInfo = Pick<InventoryItem, "unit" | "units_per_package" | "piece_unit">;

/** What one piece inside the package is called — e.g. "בקבוק" for a crate of bottles. */
export function pieceUnitLabel(pieceUnit: string | null | undefined): string {
  return pieceUnit?.trim() || BASE_UNIT;
}

/**
 * A product is split into two levels only when a pack size was explicitly set.
 * The unit's own name says nothing: "בקבוק" and "ק״ג" are single-level, "ארגז" of 24 is not.
 */
export function hasPieceBreakdown(unitsPerPackage: number | null | undefined): boolean {
  return (unitsPerPackage ?? 0) > 0;
}

/** Same rule, from an item. */
export function itemHasPieces(item: ItemUnitInfo): boolean {
  return hasPieceBreakdown(item.units_per_package);
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
 * With a pack size → "7 ארגז + 2 בקבוק" (never a decimal package count);
 * without one → plain "7 בקבוק" / "2.5 ק״ג".
 */
export function formatQtyWithPieces(
  qty: number,
  unit: string | null,
  unitsPerPackage: number | null | undefined,
  pieceUnit?: string | null,
): string {
  const unitLabel = unit?.trim() || "";
  if (!hasPieceBreakdown(unitsPerPackage)) {
    return unitLabel ? `${qty} ${unitLabel}` : String(qty);
  }
  const pieceLabel = pieceUnitLabel(pieceUnit);
  const { packages, pieces } = splitPackageQty(qty, unitsPerPackage!);
  if (packages === 0 && pieces === 0) {
    return unitLabel ? `0 ${unitLabel}` : "0";
  }
  if (packages === 0) return `${pieces} ${pieceLabel}`;
  if (pieces === 0) return unitLabel ? `${packages} ${unitLabel}` : String(packages);
  return unitLabel
    ? `${packages} ${unitLabel} + ${pieces} ${pieceLabel}`
    : `${packages} + ${pieces} ${pieceLabel}`;
}

/** `formatQtyWithPieces` for a whole item. */
export function formatItemQty(item: ItemUnitInfo, qty: number): string {
  return formatQtyWithPieces(qty, item.unit, item.units_per_package, item.piece_unit);
}

/** Integer piece delta between two main-unit quantities (avoids float drift). */
export function qtyChangeInPieces(
  previousQty: number,
  newQty: number,
  unitsPerPackage: number,
): number {
  return (
    Math.round(mainUnitToPieces(newQty, unitsPerPackage)) -
    Math.round(mainUnitToPieces(previousQty, unitsPerPackage))
  );
}

/**
 * Format a quantity change for logs — e.g. "+13 בקבוק" or "+1 ארגז + 3 בקבוק" (never decimals).
 */
export function formatQtyChangeWithPieces(
  previousQty: number,
  newQty: number,
  unit: string | null,
  unitsPerPackage: number | null | undefined,
  pieceUnit?: string | null,
): string {
  if (!hasPieceBreakdown(unitsPerPackage)) {
    const delta = Math.round((newQty - previousQty) * 10000) / 10000;
    if (delta === 0) return "0";
    return delta > 0 ? `+${delta}` : String(delta);
  }
  const deltaPieces = qtyChangeInPieces(previousQty, newQty, unitsPerPackage!);
  if (deltaPieces === 0) return "0";
  const pieceLabel = pieceUnitLabel(pieceUnit);
  const sign = deltaPieces > 0 ? "+" : "-";
  const abs = Math.abs(deltaPieces);
  const pkg = Math.floor(abs / unitsPerPackage!);
  const pcs = abs % unitsPerPackage!;
  const unitLabel = unit?.trim() || "";
  if (pkg === 0) return `${sign}${pcs} ${pieceLabel}`;
  if (pcs === 0) return unitLabel ? `${sign}${pkg} ${unitLabel}` : `${sign}${pkg}`;
  return unitLabel
    ? `${sign}${pkg} ${unitLabel} + ${pcs} ${pieceLabel}`
    : `${sign}${pkg} + ${pcs} ${pieceLabel}`;
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
      const [{ data: items, error }, { data: counts }, { data: orderRows }, { data: warehouses }, deptMap] =
        await Promise.all([
        supabase.from("inventory_items").select("*").eq("business_id", businessId).eq("active", true).order("name"),
        supabase
          .from("inventory_counts")
          .select("item_id, warehouse_id, quantity, counted_at, employee_id")
          .eq("business_id", businessId)
          .order("counted_at", { ascending: false }),
        supabase.from("inventory_orders").select("item_id, quantity, status").eq("business_id", businessId),
        supabase
          .from("warehouses")
          .select("id, name")
          .eq("business_id", businessId)
          .eq("active", true),
        fetchItemDepartmentMap(businessId!),
      ]);
      throwDbError(error);
      const warehouseNames = new Map<string, string>();
      (warehouses ?? []).forEach((w: { id: string; name: string }) => warehouseNames.set(w.id, w.name));

      const latestByItemWarehouse = new Map<
        string,
        Map<string, { qty: number; employee_id: string | null; counted_at: string }>
      >();
      (counts ?? []).forEach((c) => {
        if (!c.warehouse_id) return;
        let itemMap = latestByItemWarehouse.get(c.item_id);
        if (!itemMap) {
          itemMap = new Map();
          latestByItemWarehouse.set(c.item_id, itemMap);
        }
        if (!itemMap.has(c.warehouse_id)) {
          itemMap.set(c.warehouse_id, {
            qty: Number(c.quantity),
            employee_id: c.employee_id ?? null,
            counted_at: c.counted_at,
          });
        }
      });

      const latestOverall = new Map<
        string,
        { qty: number; employee_id: string | null; counted_at: string }
      >();
      latestByItemWarehouse.forEach((whMap, itemId) => {
        let totalQty = 0;
        let latestAt = "";
        let latestEmployee: string | null = null;
        whMap.forEach((v) => {
          totalQty += v.qty;
          if (!latestAt || v.counted_at > latestAt) {
            latestAt = v.counted_at;
            latestEmployee = v.employee_id;
          }
        });
        latestOverall.set(itemId, { qty: totalQty, employee_id: latestEmployee, counted_at: latestAt });
      });
      const pending = new Map<string, number>();
      (orderRows ?? []).forEach((o) => {
        if (o.status === "received") return;
        pending.set(o.item_id, (pending.get(o.item_id) ?? 0) + Number(o.quantity));
      });

      const updaterIds = [
        ...new Set([...latestOverall.values()].map((v) => v.employee_id).filter((id): id is string => !!id)),
      ];
      const updaterNames = new Map<string, string | null>();
      if (updaterIds.length) {
        const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", updaterIds);
        (people ?? []).forEach((p) => updaterNames.set(p.id, p.full_name));
      }

      return (items ?? []).map((it) => {
        const count = latestOverall.get(it.id);
        const updaterId = count?.employee_id ?? null;
        const whMap = latestByItemWarehouse.get(it.id);
        const warehouse_stocks: WarehouseStock[] = [];
        whMap?.forEach((v, warehouseId) => {
          const whEmployee = v.employee_id;
          warehouse_stocks.push({
            warehouse_id: warehouseId,
            warehouse_name: warehouseNames.get(warehouseId) ?? "מחסן",
            quantity: v.qty,
            last_updated_at: v.counted_at,
            last_updated_by: whEmployee,
            last_updated_by_name: whEmployee ? updaterNames.get(whEmployee) ?? null : null,
          });
        });
        warehouse_stocks.sort((a, b) => a.warehouse_name.localeCompare(b.warehouse_name, "he"));
        return {
          ...(it as InventoryItem),
          department_ids: deptMap.get(it.id) ?? [],
          warehouse_stocks,
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
      barcode?: string | null;
      unit?: string;
      units_per_package?: number | null;
      piece_unit?: string | null;
      image_url?: string | null;
      min_quantity?: number;
      category_id?: string | null;
      department_ids?: string[];
      quantity?: number;
      warehouse_quantities?: { warehouse_id: string; quantity: number }[];
      employee_id?: string | null;
    }): Promise<string> => {
      const { quantity, warehouse_quantities, employee_id, department_ids, ...itemInput } = input;
      const { data, error } = await supabase.from("inventory_items").insert(itemInput).select("id").single();
      throwDbError(error);
      if (!data) throw new Error("שמירת המוצר נכשלה");
      if (department_ids?.length) {
        await replaceItemDepartments(input.business_id, data.id, department_ids);
      }
      const countRows: { warehouse_id?: string; quantity: number }[] =
        warehouse_quantities?.length
          ? warehouse_quantities.filter((w) => w.quantity >= 0)
          : quantity != null && quantity >= 0
            ? [{ quantity }]
            : [];
      if (countRows.length) {
        let defaultWarehouseId: string | null = null;
        if (countRows.some((r) => !r.warehouse_id)) {
          const { data: wh } = await supabase
            .from("warehouses")
            .select("id")
            .eq("business_id", input.business_id)
            .eq("is_default", true)
            .maybeSingle();
          defaultWarehouseId = wh?.id ?? null;
          if (!defaultWarehouseId) {
            const { data: firstWh } = await supabase
              .from("warehouses")
              .select("id")
              .eq("business_id", input.business_id)
              .eq("active", true)
              .order("sort_order")
              .limit(1)
              .maybeSingle();
            defaultWarehouseId = firstWh?.id ?? null;
          }
        }
        for (const row of countRows) {
          const warehouse_id = row.warehouse_id ?? defaultWarehouseId;
          if (!warehouse_id) continue;
          const qty = row.quantity ?? quantity ?? 0;
          const { error: countError } = await supabase.from("inventory_counts").insert({
            business_id: input.business_id,
            item_id: data.id,
            warehouse_id,
            employee_id: employee_id ?? null,
            quantity: qty,
          });
          throwDbError(countError);
          await logInventory({
            business_id: input.business_id,
            item_id: data.id,
            warehouse_id,
            employee_id: employee_id ?? null,
            action: "created",
            new_qty: qty,
          });
        }
      } else {
        await logInventory({
          business_id: input.business_id,
          item_id: data.id,
          employee_id: employee_id ?? null,
          action: "created",
          new_qty: null,
        });
      }
      return data.id as string;
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
      warehouse_id: string;
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
        warehouse_id: input.warehouse_id,
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
      /** Orders always belong to a supplier — there is no supplier-less order. */
      supplier_id: string;
      lines: { item_id: string; quantity: number }[];
    }) => {
      if (!input.lines.length) throw new Error("נא לבחור לפחות מוצר אחד");
      if (!input.supplier_id) throw new Error("כל הזמנה חייבת להיות משויכת לספק");
      const batch_id = crypto.randomUUID();
      const rows = input.lines.map((l) => ({
        business_id: input.business_id,
        item_id: l.item_id,
        quantity: l.quantity,
        ordered_by: input.ordered_by,
        supplier_id: input.supplier_id,
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
      qc.invalidateQueries({ queryKey: ["supplier_orders", businessId] });
      qc.invalidateQueries({ queryKey: ["suppliers", businessId] });
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
      /** Orders always belong to a supplier — there is no supplier-less order. */
      supplier_id: string;
      line_ids: string[];
      lines: { item_id: string; quantity: number }[];
    }) => {
      if (!input.lines.length) throw new Error("נא לבחור לפחות מוצר אחד עם כמות");
      if (!input.supplier_id) throw new Error("כל הזמנה חייבת להיות משויכת לספק");
      const { error: delError } = await supabase.from("inventory_orders").delete().in("id", input.line_ids);
      throwDbError(delError);

      const rows = input.lines.map((l) => ({
        business_id: input.business_id,
        item_id: l.item_id,
        quantity: l.quantity,
        ordered_by: input.ordered_by,
        supplier_id: input.supplier_id,
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
      qc.invalidateQueries({ queryKey: ["supplier_orders", businessId] });
      qc.invalidateQueries({ queryKey: ["suppliers", businessId] });
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
      qc.invalidateQueries({ queryKey: ["supplier_orders", businessId] });
      qc.invalidateQueries({ queryKey: ["suppliers", businessId] });
    },
  });
}

export { orderReceivedRemainderQty } from "@/lib/inventoryReceive";

async function resolveDefaultWarehouseId(businessId: string): Promise<string> {
  const { data: wh } = await supabase
    .from("warehouses")
    .select("id")
    .eq("business_id", businessId)
    .eq("is_default", true)
    .maybeSingle();
  let warehouseId = wh?.id ?? null;
  if (!warehouseId) {
    const { data: firstWh } = await supabase
      .from("warehouses")
      .select("id")
      .eq("business_id", businessId)
      .eq("active", true)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    warehouseId = firstWh?.id ?? null;
  }
  if (!warehouseId) throw new Error("לא נמצא מחסן לעדכון המלאי");
  return warehouseId;
}

async function adjustWarehouseStock(input: {
  business_id: string;
  item_id: string;
  employee_id: string | null;
  delta: number;
  note: string;
  warehouse_id?: string | null;
}) {
  if (input.delta === 0) return;
  const warehouseId = input.warehouse_id ?? (await resolveDefaultWarehouseId(input.business_id));
  const { data: latestCount } = await supabase
    .from("inventory_counts")
    .select("quantity")
    .eq("business_id", input.business_id)
    .eq("item_id", input.item_id)
    .eq("warehouse_id", warehouseId)
    .order("counted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const warehouseCurrentQty = Number(latestCount?.quantity ?? 0);
  const newQty = nextWarehouseQty(warehouseCurrentQty, input.delta);
  const { error: countError } = await supabase.from("inventory_counts").insert({
    business_id: input.business_id,
    item_id: input.item_id,
    warehouse_id: warehouseId,
    employee_id: input.employee_id,
    quantity: newQty,
  });
  throwDbError(countError);
  await logInventory({
    business_id: input.business_id,
    item_id: input.item_id,
    warehouse_id: warehouseId,
    employee_id: input.employee_id,
    action: "order",
    previous_qty: warehouseCurrentQty,
    new_qty: newQty,
    note: input.note,
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
      /** @deprecated use warehouse lookup inside mutation */
      current_qty: number;
      warehouse_id?: string | null;
      employee_id: string | null;
      batch_id: string | null;
      ordered_by: string | null;
      supplier_id: string | null;
    }) => {
      const received = input.received_quantity;
      const plan = planOrderReceive({ ordered: input.ordered_quantity, received });

      if (plan.createsRemainder) {
        const { error: remainderError } = await supabase.from("inventory_orders").insert({
          business_id: input.business_id,
          item_id: input.item_id,
          quantity: plan.remainderQty,
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

      await adjustWarehouseStock({
        business_id: input.business_id,
        item_id: input.item_id,
        employee_id: input.employee_id,
        delta: plan.stockDelta,
        note: plan.note,
        warehouse_id: input.warehouse_id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_orders", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory_logs"] });
      qc.invalidateQueries({ queryKey: ["supplier_orders", businessId] });
      qc.invalidateQueries({ queryKey: ["suppliers", businessId] });
    },
  });
}

/** Correct how much was received on an already-closed order line (partial delivery). */
export function useCorrectReceivedOrder(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      order_id: string;
      business_id: string;
      item_id: string;
      ordered_quantity: number;
      previous_received: number;
      received_quantity: number;
      batch_id: string | null;
      ordered_by: string | null;
      supplier_id: string | null;
      employee_id: string | null;
      remainder_order_id: string | null;
      /** Where the correction lands; falls back to the default warehouse. */
      warehouse_id?: string | null;
    }) => {
      const received = input.received_quantity;
      const plan = planReceiveCorrection({
        ordered: input.ordered_quantity,
        previousReceived: input.previous_received,
        received,
        hasRemainderOrder: !!input.remainder_order_id,
      });
      if (plan.noop) return;

      const { error: orderError } = await supabase
        .from("inventory_orders")
        .update({ status: "received", received_quantity: received })
        .eq("id", input.order_id);
      throwDbError(orderError);

      if (plan.remainderAction === "update") {
        const { error: remainderError } = await supabase
          .from("inventory_orders")
          .update({ quantity: plan.remainderQty })
          .eq("id", input.remainder_order_id!);
        throwDbError(remainderError);
      } else if (plan.remainderAction === "create") {
        const { error: remainderError } = await supabase.from("inventory_orders").insert({
          business_id: input.business_id,
          item_id: input.item_id,
          quantity: plan.remainderQty,
          status: "requested",
          ordered_by: input.ordered_by,
          batch_id: input.batch_id,
          supplier_id: input.supplier_id,
        });
        throwDbError(remainderError);
      } else if (plan.remainderAction === "delete") {
        const { error: deleteError } = await supabase
          .from("inventory_orders")
          .delete()
          .eq("id", input.remainder_order_id!);
        throwDbError(deleteError);
      }

      await adjustWarehouseStock({
        business_id: input.business_id,
        item_id: input.item_id,
        employee_id: input.employee_id,
        delta: plan.stockDelta,
        note: plan.note,
        warehouse_id: input.warehouse_id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_orders", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory_logs"] });
      qc.invalidateQueries({ queryKey: ["supplier_orders", businessId] });
      qc.invalidateQueries({ queryKey: ["suppliers", businessId] });
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
      qc.invalidateQueries({ queryKey: ["supplier_orders", businessId] });
      qc.invalidateQueries({ queryKey: ["suppliers", businessId] });
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
