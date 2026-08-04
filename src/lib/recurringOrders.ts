import type { RecurringOrderWithItems } from "@/api/recurringOrders";
import type { ItemWithQty } from "@/api/inventory";
import type { SupplierItemPriceIndex } from "@/api/suppliers";
import { decomposeQty, type QtyDraft } from "@/components/inventory/orderDraft";
import { defaultSupplierChoice, itemSupplierChoices, type SupplierBasics } from "@/lib/orderSuppliers";

/** A template line as it is stored — enough to rebuild a cart line from it. */
export interface RecurringTemplateLine {
  item_id: string;
  supplier_id: string | null;
  quantity: number;
}

export type RecurringCartLine = QtyDraft & { supplier_id: string };

export interface RecurringTemplateCart {
  lines: Record<string, RecurringCartLine>;
  /** Products dropped from the catalog, or left without a supplier that prices them. */
  skipped: number;
}

/**
 * Rebuild an order cart from a saved template. A template can outlive the
 * catalog it was built from: products get deleted and suppliers stop carrying
 * them, so every line is re-checked and the supplier saved with it is only a
 * preference — the cheapest supplier that still lists the product wins.
 */
export interface RecurringTemplateCartOptions {
  /** When set, only lines that resolve to this supplier are loaded. */
  supplierId?: string | null;
}

export function recurringOrdersForSupplier(
  templates: RecurringOrderWithItems[],
  supplierId: string | null | undefined,
): RecurringOrderWithItems[] {
  if (!supplierId) return templates;
  return templates.filter((template) => template.items.some((line) => line.supplier_id === supplierId));
}

export function recurringOrderStartPath(templateId: string, supplierId?: string | null): string {
  const params = new URLSearchParams({ recurring: templateId });
  if (supplierId) params.set("supplier", supplierId);
  return `/inventory/order?${params.toString()}`;
}

export type RecurringOrdersFrom = "inventory" | "suppliers" | "supplier";

export function recurringOrdersPagePath(options?: {
  supplierId?: string | null;
  from?: RecurringOrdersFrom;
}): string {
  const params = new URLSearchParams();
  if (options?.supplierId) params.set("supplier", options.supplierId);
  if (options?.from) params.set("from", options.from);
  const query = params.toString();
  return query ? `/inventory/recurring-orders?${query}` : "/inventory/recurring-orders";
}

export interface RecurringLineView {
  item_id: string;
  item_name: string;
  image_url: string | null;
  quantity: number;
  qty_label: string;
  supplier_id: string | null;
  supplier_name: string;
  missing: boolean;
}

export interface RecurringSupplierGroup {
  supplier_id: string | null;
  supplier_name: string;
  lines: RecurringLineView[];
}

/** Group a template's lines by supplier for display on the recurring-orders page. */
export function recurringTemplateSupplierGroups(
  template: RecurringOrderWithItems,
  itemById: Map<string, ItemWithQty>,
  supplierById: Map<string, { name: string }>,
  formatQty: (item: ItemWithQty, qty: number) => string,
): RecurringSupplierGroup[] {
  const groups = new Map<string, RecurringSupplierGroup>();

  for (const line of template.items) {
    const item = itemById.get(line.item_id);
    const supplierId = line.supplier_id;
    const supplierName = supplierId
      ? (supplierById.get(supplierId)?.name ?? "ספק לא ידוע")
      : "ללא ספק";
    const key = supplierId ?? "__none__";
    let group = groups.get(key);
    if (!group) {
      group = { supplier_id: supplierId, supplier_name: supplierName, lines: [] };
      groups.set(key, group);
    }
    group.lines.push({
      item_id: line.item_id,
      item_name: item?.name ?? "מוצר שנמחק",
      image_url: item?.image_url ?? null,
      quantity: Number(line.quantity),
      qty_label: item ? formatQty(item, Number(line.quantity)) : String(line.quantity),
      supplier_id: supplierId,
      supplier_name: supplierName,
      missing: !item,
    });
  }

  return [...groups.values()].sort((a, b) => a.supplier_name.localeCompare(b.supplier_name, "he"));
}

export function recurringOrderSupplierCount(template: RecurringOrderWithItems): number {
  return new Set(template.items.map((line) => line.supplier_id ?? "__none__")).size;
}

export function recurringTemplateCart(
  templateLines: RecurringTemplateLine[],
  itemById: Map<string, ItemWithQty>,
  suppliers: SupplierBasics[],
  priceIndex: SupplierItemPriceIndex | undefined,
  options?: RecurringTemplateCartOptions,
): RecurringTemplateCart {
  const lines: Record<string, RecurringCartLine> = {};
  let skipped = 0;
  const onlySupplierId = options?.supplierId ?? null;

  for (const line of templateLines) {
    const item = itemById.get(line.item_id);
    if (!item) {
      skipped += 1;
      continue;
    }
    const supplierId = defaultSupplierChoice(
      itemSupplierChoices(item, suppliers, priceIndex),
      line.supplier_id,
    );
    if (!supplierId) {
      skipped += 1;
      continue;
    }
    if (onlySupplierId && supplierId !== onlySupplierId) {
      skipped += 1;
      continue;
    }
    lines[line.item_id] = { supplier_id: supplierId, ...decomposeQty(item, Number(line.quantity)) };
  }

  return { lines, skipped };
}

/** "נטענו 4 מוצרים מ«הזמנת בר שבועית»" — what the composer reports after loading. */
export function recurringTemplateNotice(name: string, added: number, skipped: number): string {
  if (added === 0) return `אף מוצר מ"${name}" לא זמין להזמנה כרגע`;
  const base = `נטענו ${added} מוצרים מ"${name}"`;
  return skipped > 0 ? `${base} · ${skipped} מוצרים דולגו (אין ספק עם מחיר)` : base;
}
