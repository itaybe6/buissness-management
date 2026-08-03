import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { InventoryOrder, Supplier, SupplierItem, SupplierPriceUnit } from "@/types/database";

function throwDbError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export function supplierSaveError(e: unknown): string {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e !== null && "message" in e
        ? String((e as { message: unknown }).message)
        : "";
  if (msg.includes("suppliers") || msg.includes("supplier_id")) {
    return "טבלת «ספקים» חסרה במסד הנתונים. ב-Supabase: SQL Editor → הריצו את supabase/patches/046_suppliers.sql";
  }
  if (/does not exist|42P01|Could not find the table/i.test(msg) && /suppliers/i.test(msg)) {
    return "טבלת «ספקים» חסרה. הריצו ב-Supabase SQL Editor: supabase/patches/046_suppliers.sql";
  }
  if (msg.includes("supplier_items")) {
    return "טבלת «מוצרים לספק» חסרה. הריצו ב-Supabase SQL Editor: supabase/patches/048_supplier_items.sql";
  }
  if (msg.includes("delivery_days") || msg.includes("delivery_day")) {
    return "עמודת «ימי אספקה» חסרה בטבלת הספקים. הריצו את המיגרציה supplier_delivery_days ב-Supabase.";
  }
  return msg || "שגיאה בשמירה";
}

export interface SupplierWithStats extends Supplier {
  open_order_lines: number;
  receipt_count: number;
  product_count: number;
}

export interface SupplierItemRow extends SupplierItem {
  item_name: string;
  item_unit: string | null;
  item_units_per_package: number | null;
  item_image_url: string | null;
}

/** מחירים לפי יחידה — main = יחידת מידה ראשית, piece = יחידה בודדת */
export interface SupplierItemPrices {
  main?: number;
  piece?: number;
}

export type SupplierItemPriceIndex = Map<string, Map<string, SupplierItemPrices>>;

/** item_id → set of supplier_ids that carry this product in their price list */
export type ItemSupplierIndex = Map<string, Set<string>>;

export function buildItemSupplierIndex(priceIndex: SupplierItemPriceIndex): ItemSupplierIndex {
  const index: ItemSupplierIndex = new Map();
  for (const [supplierId, items] of priceIndex) {
    for (const itemId of items.keys()) {
      let linked = index.get(itemId);
      if (!linked) {
        linked = new Set();
        index.set(itemId, linked);
      }
      linked.add(supplierId);
    }
  }
  return index;
}

export function itemMatchesSupplierFilter(
  itemId: string,
  supplierFilter: string | null,
  itemSupplierIndex: ItemSupplierIndex,
): boolean {
  if (!supplierFilter) return true;
  if (supplierFilter === "__none__") return !itemSupplierIndex.has(itemId);
  return itemSupplierIndex.get(itemId)?.has(supplierFilter) ?? false;
}

export function useSuppliers(businessId: string | null, options?: { activeOnly?: boolean }) {
  const activeOnly = options?.activeOnly ?? false;
  return useQuery({
    queryKey: ["suppliers", businessId, activeOnly],
    enabled: !!businessId,
    queryFn: async (): Promise<SupplierWithStats[]> => {
      let q = supabase.from("suppliers").select("*").eq("business_id", businessId!).order("name");
      if (activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      throwDbError(error);
      const suppliers = (data ?? []) as Supplier[];

      const ids = suppliers.map((s) => s.id);
      const openLines = new Map<string, number>();
      const receiptCounts = new Map<string, number>();
      const productCounts = new Map<string, number>();

      if (ids.length) {
        const { data: orderRows, error: orderStatsError } = await supabase
          .from("inventory_orders")
          .select("supplier_id, status")
          .eq("business_id", businessId!)
          .in("supplier_id", ids);
        if (!orderStatsError) {
          for (const row of orderRows ?? []) {
            const sid = row.supplier_id as string | null;
            if (!sid || row.status === "received") continue;
            openLines.set(sid, (openLines.get(sid) ?? 0) + 1);
          }
        }

        const { data: receiptRows, error: receiptStatsError } = await supabase
          .from("office_receipts")
          .select("supplier_id")
          .eq("business_id", businessId!)
          .in("supplier_id", ids);
        if (!receiptStatsError) {
          for (const row of receiptRows ?? []) {
            const sid = row.supplier_id as string | null;
            if (!sid) continue;
            receiptCounts.set(sid, (receiptCounts.get(sid) ?? 0) + 1);
          }
        }

        const { data: productRows, error: productStatsError } = await supabase
          .from("supplier_items")
          .select("supplier_id, item_id")
          .eq("business_id", businessId!)
          .in("supplier_id", ids);
        if (!productStatsError) {
          const seen = new Set<string>();
          for (const row of productRows ?? []) {
            const sid = row.supplier_id as string;
            const key = `${sid}:${row.item_id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            productCounts.set(sid, (productCounts.get(sid) ?? 0) + 1);
          }
        }
      }

      return suppliers.map((s) => ({
        ...s,
        open_order_lines: openLines.get(s.id) ?? 0,
        receipt_count: receiptCounts.get(s.id) ?? 0,
        product_count: productCounts.get(s.id) ?? 0,
      }));
    },
  });
}

export function useCreateSupplier(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      name: string;
      phone?: string | null;
      tax_id?: string | null;
      notes?: string | null;
      delivery_days?: number[] | null;
    }) => {
      const { data, error } = await supabase
        .from("suppliers")
        .insert({
          business_id: input.business_id,
          name: input.name.trim(),
          phone: input.phone?.trim() || null,
          tax_id: input.tax_id?.trim() || null,
          notes: input.notes?.trim() || null,
          delivery_days: input.delivery_days?.length ? input.delivery_days : null,
        })
        .select()
        .single();
      throwDbError(error);
      return data as Supplier;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers", businessId] }),
  });
}

export function useUpdateSupplier(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      name: string;
      phone?: string | null;
      tax_id?: string | null;
      notes?: string | null;
      delivery_days?: number[] | null;
      active?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("suppliers")
        .update({
          name: input.name.trim(),
          phone: input.phone?.trim() || null,
          tax_id: input.tax_id?.trim() || null,
          notes: input.notes?.trim() || null,
          ...(input.delivery_days !== undefined
            ? { delivery_days: input.delivery_days?.length ? input.delivery_days : null }
            : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        })
        .eq("id", input.id)
        .select()
        .single();
      throwDbError(error);
      return data as Supplier;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers", businessId] });
      qc.invalidateQueries({ queryKey: ["supplier_items", businessId] });
    },
  });
}

export function useSupplierItems(businessId: string | null, supplierId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["supplier_items", businessId, supplierId],
    enabled: !!businessId && !!supplierId && enabled,
    queryFn: async (): Promise<SupplierItemRow[]> => {
      const { data, error } = await supabase
        .from("supplier_items")
        .select("business_id, supplier_id, item_id, unit_price, price_unit, created_at, updated_at")
        .eq("business_id", businessId!)
        .eq("supplier_id", supplierId!)
        .order("created_at", { ascending: true });
      if (error) {
        if (/supplier_items/i.test(error.message)) return [];
        throwDbError(error);
      }
      const rows = (data ?? []) as SupplierItem[];
      const itemIds = [...new Set(rows.map((r) => r.item_id))];
      const names = new Map<string, { name: string; unit: string | null; units_per_package: number | null; image_url: string | null }>();
      if (itemIds.length) {
        const { data: items } = await supabase
          .from("inventory_items")
          .select("id, name, unit, units_per_package, image_url")
          .in("id", itemIds);
        (items ?? []).forEach((i) =>
          names.set(i.id, {
            name: i.name,
            unit: i.unit,
            units_per_package: i.units_per_package,
            image_url: i.image_url ?? null,
          }),
        );
      }
      return rows.map((r) => ({
        ...r,
        price_unit: (r.price_unit ?? "main") as SupplierPriceUnit,
        item_name: names.get(r.item_id)?.name ?? "פריט",
        item_unit: names.get(r.item_id)?.unit ?? null,
        item_units_per_package: names.get(r.item_id)?.units_per_package ?? null,
        item_image_url: names.get(r.item_id)?.image_url ?? null,
      }));
    },
  });
}

/** supplier_id → (item_id → prices by unit) */
export function useSupplierItemPriceIndex(businessId: string | null) {
  return useQuery({
    queryKey: ["supplier_items", businessId, "index"],
    enabled: !!businessId,
    queryFn: async (): Promise<SupplierItemPriceIndex> => {
      const { data, error } = await supabase
        .from("supplier_items")
        .select("supplier_id, item_id, unit_price, price_unit")
        .eq("business_id", businessId!);
      if (error) {
        if (/supplier_items/i.test(error.message)) return new Map();
        throwDbError(error);
      }
      const index: SupplierItemPriceIndex = new Map();
      for (const row of data ?? []) {
        const sid = row.supplier_id as string;
        const itemId = row.item_id as string;
        const unit = (row.price_unit ?? "main") as SupplierPriceUnit;
        if (!index.has(sid)) index.set(sid, new Map());
        const items = index.get(sid)!;
        const prices = items.get(itemId) ?? {};
        prices[unit] = Number(row.unit_price);
        items.set(itemId, prices);
      }
      return index;
    },
  });
}

export function supplierPricesFor(
  index: SupplierItemPriceIndex | undefined,
  supplierId: string | null | undefined,
): Map<string, SupplierItemPrices> | null {
  if (!supplierId || !index) return null;
  return index.get(supplierId) ?? null;
}

/** Effective per-main-unit price for order totals (prefers main; falls back to piece × pack size). */
export function effectiveMainUnitPrice(
  prices: SupplierItemPrices | undefined,
  unitsPerPackage: number | null | undefined,
): number {
  if (!prices) return 0;
  if (prices.main != null && prices.main > 0) return prices.main;
  const pack = unitsPerPackage ?? 0;
  if (prices.piece != null && prices.piece > 0 && pack > 0) {
    return Math.round(prices.piece * pack * 100) / 100;
  }
  return 0;
}

/** Sum all configured prices for display totals (main + piece when both exist). */
export function supplierPriceListTotal(prices: SupplierItemPrices): number {
  let sum = 0;
  if (prices.main != null && prices.main > 0) sum += prices.main;
  if (prices.piece != null && prices.piece > 0) sum += prices.piece;
  return sum;
}

export function supplierPriceUnitLabel(
  priceUnit: SupplierPriceUnit,
  itemUnit: string | null | undefined,
  pieceUnit?: string | null,
): string {
  if (priceUnit === "piece") return pieceUnit?.trim() || "יחידה";
  return itemUnit?.trim() || "יחידה";
}

/** One supplier that carries a given item, from the item's point of view. */
export interface ItemSupplierRow {
  supplier_id: string;
  unit_price: number;
  price_unit: SupplierPriceUnit;
}

/** Suppliers linked to a single inventory item (item side of supplier_items). */
export function useItemSuppliers(businessId: string | null, itemId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["item_suppliers", businessId, itemId],
    enabled: !!businessId && !!itemId && enabled,
    queryFn: async (): Promise<ItemSupplierRow[]> => {
      const { data, error } = await supabase
        .from("supplier_items")
        .select("supplier_id, unit_price, price_unit")
        .eq("business_id", businessId!)
        .eq("item_id", itemId!);
      if (error) {
        if (/supplier_items/i.test(error.message)) return [];
        throwDbError(error);
      }
      return (data ?? []).map((r) => ({
        supplier_id: r.supplier_id as string,
        unit_price: Number(r.unit_price),
        price_unit: (r.price_unit ?? "main") as SupplierPriceUnit,
      }));
    },
  });
}

/** Replace every supplier link of one item — mirror of useSaveSupplierItems, item side. */
export function useSaveItemSuppliers(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      item_id: string;
      lines: { supplier_id: string; unit_price: number; price_unit?: SupplierPriceUnit }[];
    }) => {
      const { error: delError } = await supabase
        .from("supplier_items")
        .delete()
        .eq("business_id", input.business_id)
        .eq("item_id", input.item_id);
      throwDbError(delError);

      if (!input.lines.length) return;

      const rows = input.lines.map((l) => ({
        business_id: input.business_id,
        supplier_id: l.supplier_id,
        item_id: input.item_id,
        unit_price: l.unit_price,
        price_unit: l.price_unit ?? "main",
      }));
      const { error } = await supabase.from("supplier_items").insert(rows);
      throwDbError(error);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["item_suppliers", businessId, variables.item_id] });
      qc.invalidateQueries({ queryKey: ["supplier_items", businessId] });
      qc.invalidateQueries({ queryKey: ["suppliers", businessId] });
    },
  });
}

export function useSaveSupplierItems(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      supplier_id: string;
      lines: { item_id: string; unit_price: number; price_unit?: SupplierPriceUnit }[];
    }) => {
      const { error: delError } = await supabase
        .from("supplier_items")
        .delete()
        .eq("supplier_id", input.supplier_id);
      throwDbError(delError);

      if (!input.lines.length) return;

      const rows = input.lines.map((l) => ({
        business_id: input.business_id,
        supplier_id: input.supplier_id,
        item_id: l.item_id,
        unit_price: l.unit_price,
        price_unit: l.price_unit ?? "main",
      }));
      const { error } = await supabase.from("supplier_items").insert(rows);
      throwDbError(error);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["supplier_items", businessId] });
      qc.invalidateQueries({ queryKey: ["suppliers", businessId] });
      qc.invalidateQueries({ queryKey: ["supplier_items", businessId, variables.supplier_id] });
    },
  });
}

export function useDeleteSupplier(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      throwDbError(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory_orders", businessId] });
      qc.invalidateQueries({ queryKey: ["office_receipts", businessId] });
    },
  });
}

export interface SupplierOrderBatchSummary {
  batch_key: string;
  batch_id: string | null;
  created_at: string;
  line_count: number;
  pending_count: number;
  preview_item_names: string[];
}

export function useSupplierOrderBatches(businessId: string | null, supplierId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["supplier_orders", businessId, supplierId],
    enabled: !!businessId && !!supplierId && enabled,
    queryFn: async (): Promise<SupplierOrderBatchSummary[]> => {
      const { data, error } = await supabase
        .from("inventory_orders")
        .select("id, batch_id, created_at, status, item_id")
        .eq("business_id", businessId!)
        .eq("supplier_id", supplierId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        if (/supplier_id|suppliers/i.test(error.message)) return [];
        throwDbError(error);
      }

      const rows = (data ?? []) as InventoryOrder[];
      const itemIds = [...new Set(rows.map((r) => r.item_id))];
      const itemNames = new Map<string, string>();
      if (itemIds.length) {
        const { data: items } = await supabase.from("inventory_items").select("id, name").in("id", itemIds);
        (items ?? []).forEach((i) => itemNames.set(i.id, i.name));
      }

      const map = new Map<string, SupplierOrderBatchSummary>();
      for (const row of rows) {
        const key = row.batch_id ?? row.id;
        const name = itemNames.get(row.item_id) ?? "פריט";
        if (!map.has(key)) {
          map.set(key, {
            batch_key: key,
            batch_id: row.batch_id,
            created_at: row.created_at,
            line_count: 0,
            pending_count: 0,
            preview_item_names: [],
          });
        }
        const batch = map.get(key)!;
        batch.line_count += 1;
        if (row.status !== "received") batch.pending_count += 1;
        if (batch.preview_item_names.length < 3 && !batch.preview_item_names.includes(name)) {
          batch.preview_item_names.push(name);
        }
      }
      return [...map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
  });
}

export function useSupplierReceipts(businessId: string | null, supplierId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["supplier_receipts", businessId, supplierId],
    enabled: !!businessId && !!supplierId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("office_receipts")
        .select("*")
        .eq("business_id", businessId!)
        .eq("supplier_id", supplierId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        if (/supplier_id|suppliers/i.test(error.message)) return [];
        throwDbError(error);
      }
      return data ?? [];
    },
  });
}
