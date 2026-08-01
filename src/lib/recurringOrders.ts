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
export function recurringTemplateCart(
  templateLines: RecurringTemplateLine[],
  itemById: Map<string, ItemWithQty>,
  suppliers: SupplierBasics[],
  priceIndex: SupplierItemPriceIndex | undefined,
): RecurringTemplateCart {
  const lines: Record<string, RecurringCartLine> = {};
  let skipped = 0;

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
