import { hasPieceBreakdown, pieceUnitLabel } from "@/api/inventory";
import { effectiveMainUnitPrice, type SupplierItemPriceIndex, type SupplierItemPrices } from "@/api/suppliers";
import { HE_DAYS } from "@/lib/db";

/** Fallback when a product has no unit name at all. */
const PIECE_PRICE_LABEL = "יחידה";

/** The unit fields pricing labels are built from. */
type PricedItemUnits = {
  unit: string | null;
  units_per_package: number | null;
  piece_unit?: string | null;
};

/** Per-piece prices are often a few agorot — keep the decimals formatCurrency drops. */
export function formatPrice(n: number): string {
  return "₪" + (Math.round(n * 100) / 100).toLocaleString("he-IL", { maximumFractionDigits: 2 });
}

export function deliveryDaysLabel(days: number[] | null | undefined): string {
  if (!days?.length) return "לא הוגדר";
  const valid = [...new Set(days.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (valid.length === 0) return "לא הוגדר";
  return valid.map((d) => `יום ${HE_DAYS[d]}`).join(", ");
}

/** @deprecated use deliveryDaysLabel */
export function deliveryDayLabel(day: number | null | undefined): string {
  if (day == null || day < 0 || day > 6) return "לא הוגדר";
  return deliveryDaysLabel([day]);
}

export interface SupplierBasics {
  id: string;
  name: string;
  delivery_days: number[] | null;
}

/** One supplier the user can order a specific product from. */
export interface SupplierChoice {
  supplier_id: string;
  name: string;
  delivery_days: number[] | null;
  prices: SupplierItemPrices | null;
  /** Price per the product's main unit; 0 when this supplier has no price for it. */
  unit_price: number;
  /** The supplier carries this product in its own price list. */
  listed: boolean;
  /** Cheapest listed price. Never set when there is nothing to compare against or on a tie. */
  cheapest: boolean;
}

function compareChoices(a: SupplierChoice, b: SupplierChoice): number {
  if (a.unit_price !== b.unit_price) return a.unit_price - b.unit_price;
  return a.name.localeCompare(b.name, "he");
}

/** Supplier carries the product in its price list with a usable price. */
export function isOrderableSupplierChoice(choice: SupplierChoice): boolean {
  return choice.listed && choice.unit_price > 0;
}

/**
 * Suppliers a product can be ordered from, cheapest first. Only suppliers that
 * list the product with a valid price are returned.
 */
export function itemSupplierChoices(
  item: { id: string; units_per_package: number | null },
  suppliers: SupplierBasics[],
  priceIndex: SupplierItemPriceIndex | undefined,
): SupplierChoice[] {
  const choices: SupplierChoice[] = suppliers
    .map((s) => {
      const prices = priceIndex?.get(s.id)?.get(item.id) ?? null;
      return {
        supplier_id: s.id,
        name: s.name,
        delivery_days: s.delivery_days,
        prices,
        unit_price: prices ? effectiveMainUnitPrice(prices, item.units_per_package) : 0,
        listed: !!prices,
        cheapest: false,
      };
    })
    .filter(isOrderableSupplierChoice);

  if (choices.length > 1) {
    const min = Math.min(...choices.map((c) => c.unit_price));
    const winners = choices.filter((c) => c.unit_price === min);
    if (winners.length === 1) winners[0].cheapest = true;
  }

  return choices.sort(compareChoices);
}

/** A supplier's price quoted for one unit of measure of a product. */
export interface SupplierUnitPrice {
  /** The unit the price is quoted for, e.g. "ארגז" or "יחידה". */
  label: string;
  price: number;
  /** Calculated from the other unit of measure instead of quoted in the price list. */
  derived: boolean;
}

/**
 * The supplier's price per unit of measure — the package unit and, for products
 * sold in packages, the single piece as well.
 *
 * Both are derived from the effective per-main-unit price, which is what every
 * order total in the app is built on, so the numbers on screen always add up to
 * the total the user is asked to approve.
 */
export function supplierUnitPrices(
  item: PricedItemUnits,
  prices: SupplierItemPrices | null | undefined,
): SupplierUnitPrice[] {
  const mainPrice = effectiveMainUnitPrice(prices ?? undefined, item.units_per_package);
  if (mainPrice <= 0) return [];

  const mainLabel = item.unit?.trim() || PIECE_PRICE_LABEL;
  if (!hasPieceBreakdown(item.units_per_package)) {
    return [{ label: mainLabel, price: mainPrice, derived: false }];
  }

  const quotedPerMainUnit = (prices?.main ?? 0) > 0;
  return [
    { label: mainLabel, price: mainPrice, derived: !quotedPerMainUnit },
    {
      label: pieceUnitLabel(item.piece_unit),
      price: Math.round((mainPrice / item.units_per_package!) * 10000) / 10000,
      derived: quotedPerMainUnit,
    },
  ];
}

/** What a line total is made of, e.g. "1 ארגז × ₪100 + 2 בקבוק × ₪4.17". */
export function orderCalcLabel(
  item: PricedItemUnits,
  draft: { packs: number; pieces: number },
  prices: SupplierItemPrices | null | undefined,
): string {
  const unitPrices = supplierUnitPrices(item, prices);
  const mainLabel = item.unit?.trim() || PIECE_PRICE_LABEL;
  const pieceLabel = pieceUnitLabel(item.piece_unit);
  const parts: string[] = [];

  if (draft.packs > 0) {
    const perPack = unitPrices[0];
    parts.push(perPack ? `${draft.packs} ${mainLabel} × ${formatPrice(perPack.price)}` : `${draft.packs} ${mainLabel}`);
  }
  if (hasPieceBreakdown(item.units_per_package) && draft.pieces > 0) {
    const perPiece = unitPrices[1];
    parts.push(
      perPiece
        ? `${draft.pieces} ${pieceLabel} × ${formatPrice(perPiece.price)}`
        : `${draft.pieces} ${pieceLabel}`,
    );
  }

  return parts.join(" + ");
}

/** The supplier to preselect when the user opens a product for the first time. */
export function defaultSupplierChoice(
  choices: SupplierChoice[],
  preferredSupplierId?: string | null,
): string {
  if (preferredSupplierId && choices.some((c) => c.supplier_id === preferredSupplierId)) {
    return preferredSupplierId;
  }
  return choices[0]?.supplier_id ?? "";
}

/** A product the user put in the cart, priced by the supplier chosen for it. */
export interface DraftOrderLine {
  item_id: string;
  name: string;
  image_url: string | null;
  unit: string | null;
  units_per_package: number | null;
  piece_unit: string | null;
  supplier_id: string;
  /** Quantity in the product's main unit. */
  quantity: number;
  /** Human label, e.g. "2 ארגז + 5 בקבוק". */
  qty_label: string;
  /** How the total breaks down, e.g. "2 ארגז × ₪100 + 5 בקבוק × ₪4.17". */
  calc_label: string;
  unit_price: number;
  line_total: number;
}

export interface DraftSupplierGroup {
  supplier_id: string;
  name: string;
  delivery_days: number[] | null;
  lines: DraftOrderLine[];
  total: number;
  /** Lines this supplier has no price for — the group total is therefore partial. */
  unpriced_count: number;
}

function toAgorot(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Split the cart into one section per supplier — each becomes its own order batch. */
export function groupDraftLinesBySupplier(
  lines: DraftOrderLine[],
  suppliers: SupplierBasics[],
): DraftSupplierGroup[] {
  const meta = new Map(suppliers.map((s) => [s.id, s]));
  const groups = new Map<string, DraftSupplierGroup>();

  for (const line of lines) {
    let group = groups.get(line.supplier_id);
    if (!group) {
      group = {
        supplier_id: line.supplier_id,
        name: meta.get(line.supplier_id)?.name ?? "ספק לא ידוע",
        delivery_days: meta.get(line.supplier_id)?.delivery_days ?? null,
        lines: [],
        total: 0,
        unpriced_count: 0,
      };
      groups.set(line.supplier_id, group);
    }
    group.lines.push(line);
    group.total = toAgorot(group.total + line.line_total);
    if (line.unit_price <= 0) group.unpriced_count += 1;
  }

  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "he"));
}

export function draftLinesTotal(lines: DraftOrderLine[]): number {
  return toAgorot(lines.reduce((sum, l) => sum + l.line_total, 0));
}
