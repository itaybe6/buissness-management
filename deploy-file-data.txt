/**
 * Database rows → document data.
 *
 * Everything in here is a deliberate port of the matching helper in
 * src/api/inventory.ts and src/api/suppliers.ts, so the sheet the supplier gets
 * always shows the same quantities and totals as the screen the manager
 * ordered from. Kept apart from index.ts so it can be exercised without a
 * Supabase connection.
 */

import { formatShekel, type OrderPdfData, type OrderPdfLine } from "./render.ts";

const HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export interface OrderRow {
  id: string;
  item_id: string;
  quantity: number;
  received_quantity: number | null;
  status: "requested" | "ordered" | "received";
  batch_id: string | null;
  supplier_id: string | null;
  ordered_by: string | null;
  created_at: string;
}

export interface ItemRow {
  id: string;
  name: string;
  unit: string | null;
  units_per_package: number | null;
  piece_unit: string | null;
  barcode: string | null;
  category_id: string | null;
}

export interface SupplierRow {
  name: string;
  phone: string | null;
  tax_id: string | null;
  notes: string | null;
  delivery_days: number[] | null;
}

export interface SupplierPrices {
  main?: number;
  piece?: number;
}

export interface BuildInput {
  batchId: string;
  businessName: string;
  /** Every row of the batch, in any order. */
  lines: OrderRow[];
  items: Map<string, ItemRow>;
  /** category_id → name */
  categories: Map<string, string>;
  /** item_id → the supplier's prices for it */
  prices: Map<string, SupplierPrices>;
  supplier: SupplierRow | null;
  orderedByName: string | null;
  now: Date;
}

export function buildOrderPdfData(input: BuildInput): OrderPdfData {
  const { items, categories, prices } = input;

  const sorted = [...input.lines].sort((a, b) =>
    (items.get(a.item_id)?.name ?? "").localeCompare(items.get(b.item_id)?.name ?? "", "he"),
  );

  let sum = 0;
  let unpriced = 0;
  // Kept per unit: adding 12.5 ק״ג to 4 ארגז would be a number that means
  // nothing to whoever loads the truck.
  const byUnit = new Map<string, number>();

  const pdfLines: OrderPdfLine[] = sorted.map((row) => {
    const item = items.get(row.item_id) ?? null;
    const qty = billableQty(row);
    const pack = item?.units_per_package ?? null;
    const unitPrice = mainUnitPrice(prices.get(row.item_id), pack);
    const total = unitPrice > 0 ? Math.round(qty * unitPrice * 100) / 100 : 0;

    const unitLabel = item?.unit?.trim() || "יחידות";
    byUnit.set(unitLabel, (byUnit.get(unitLabel) ?? 0) + qty);
    if (unitPrice > 0) sum += total;
    else unpriced += 1;

    const meta = [
      item?.category_id ? categories.get(item.category_id) : null,
      packLabel(item),
      item?.barcode,
    ]
      .filter(Boolean)
      .join(" · ");

    // The pieces line only adds something once whole packages are involved —
    // "3 ארגז" is worth restating as "72 בקבוק", "5 בקבוק" is not.
    const totalPieces = pack && pack > 0 ? Math.round(qty * pack) : 0;
    const wholePacks = pack && pack > 0 ? Math.floor(totalPieces / pack) : 0;
    const ordered = Number(row.quantity);

    return {
      name: item?.name ?? "מוצר שנמחק",
      meta,
      qty: formatQty(qty, item),
      qtySub: wholePacks > 0 ? `${trimNum(totalPieces)} ${item?.piece_unit?.trim() || "יחידות"}` : "",
      price: unitPrice > 0 ? formatShekel(unitPrice) : "",
      priceUnit: unitPrice > 0 ? `ל${item?.unit?.trim() || "יחידה"}` : "",
      total,
      receivedNote:
        row.status === "received" && qty !== ordered
          ? `התקבל ${trimNum(qty)} מתוך ${trimNum(ordered)}`
          : "",
    };
  });

  const allReceived = input.lines.every((l) => l.status === "received");
  const anyReceived = input.lines.some((l) => l.status === "received");
  const createdAt = new Date(sorted[0]?.created_at ?? input.now.toISOString());
  const supplier = input.supplier;

  return {
    businessName: input.businessName,
    supplier: {
      name: supplier?.name ?? "ספק לא הוגדר",
      phone: supplier?.phone?.trim() ?? "",
      taxId: supplier?.tax_id?.trim() ?? "",
      deliveryDays: deliveryDaysLabel(supplier?.delivery_days),
      notes: supplier?.notes?.trim() ?? "",
    },
    order: {
      number: shortId(input.batchId),
      date: heDate(createdAt),
      time: heTime(createdAt),
      orderedBy: input.orderedByName?.trim() || "לא ידוע",
      statusLabel: allReceived ? "התקבל" : anyReceived ? "התקבל חלקית" : "בהזמנה",
      statusTone: allReceived ? "received" : anyReceived ? "partial" : "open",
    },
    lines: pdfLines,
    totals: {
      unitsLabel: unitsBreakdown(byUnit),
      sum: formatShekel(sum),
      unpriced,
    },
    generatedAt: `${heDate(input.now)}, ${heTime(input.now)}`,
  };
}

/** "16 ארגז · 30.9 ק״ג · 2 קרטון" — the biggest units first. */
function unitsBreakdown(byUnit: Map<string, number>): string {
  const parts = [...byUnit.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([unit, qty]) => `${trimNum(qty)} ${unit}`);
  if (parts.length <= 4) return parts.join(" · ");
  return `${parts.slice(0, 4).join(" · ")} ועוד`;
}

/** A received line is billed for what actually arrived. */
export function billableQty(row: Pick<OrderRow, "status" | "quantity" | "received_quantity">): number {
  if (row.status === "received") return Number(row.received_quantity ?? row.quantity);
  return Number(row.quantity);
}

/** Prefers the main-unit price, falling back to piece price × pack size. */
export function mainUnitPrice(entry: SupplierPrices | undefined, pack: number | null): number {
  if (!entry) return 0;
  if (entry.main != null && entry.main > 0) return entry.main;
  if (entry.piece != null && entry.piece > 0 && pack && pack > 0) {
    return Math.round(entry.piece * pack * 100) / 100;
  }
  return 0;
}

/** "7 ארגז + 2 בקבוק" when the product has a pack size, "2.5 ק״ג" when it does not. */
export function formatQty(qty: number, item: ItemRow | null): string {
  const unit = item?.unit?.trim() ?? "";
  const pack = item?.units_per_package ?? 0;
  if (!pack || pack <= 0) return unit ? `${trimNum(qty)} ${unit}` : trimNum(qty);

  const pieceUnit = item?.piece_unit?.trim() || "יחידות";
  const totalPieces = Math.round(qty * pack);
  const packages = Math.floor(totalPieces / pack);
  const pieces = totalPieces % pack;
  if (packages === 0 && pieces === 0) return unit ? `0 ${unit}` : "0";
  if (packages === 0) return `${pieces} ${pieceUnit}`;
  if (pieces === 0) return unit ? `${packages} ${unit}` : String(packages);
  return unit ? `${packages} ${unit} + ${pieces} ${pieceUnit}` : `${packages} + ${pieces} ${pieceUnit}`;
}

/** "ארגז של 24 בקבוק" — the quiet line under the product name. */
export function packLabel(item: ItemRow | null): string {
  if (!item) return "";
  const pack = item.units_per_package ?? 0;
  const unit = item.unit?.trim() || "יחידה";
  if (pack > 0) return `${unit} של ${trimNum(pack)} ${item.piece_unit?.trim() || "יחידות"}`;
  return unit;
}

export function deliveryDaysLabel(days: number[] | null | undefined): string {
  if (!days?.length) return "לא הוגדר";
  const valid = [...new Set(days.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (valid.length === 0) return "לא הוגדר";
  return valid.map((d) => `יום ${HE_DAYS[d]}`).join(", ");
}

/** Quantities are numeric(12,2): round off float drift and drop trailing zeros. */
function trimNum(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** The first block of the batch uuid — short enough to read out over the phone. */
function shortId(batchId: string): string {
  return batchId.split("-")[0].toUpperCase();
}

function heDate(d: Date): string {
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });
}

function heTime(d: Date): string {
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}
