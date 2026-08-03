import { addDays, toISODate, todayISO } from "@/lib/db";
import { hasPieceBreakdown, mainUnitToPieces, pieceUnitLabel } from "@/api/inventory";
import type { ItemWithQty } from "@/api/inventory";
import type { InventoryWaste } from "@/types/database";

/**
 * Presentation rules for the waste (בלאי) report.
 *
 * Waste is reported in the main unit but people think in pieces, and the list
 * is read as a timeline ("today / yesterday / Thursday"). Both conversions are
 * pure, so they live here and are covered by tests.
 */

export type WasteStockStatus = "empty" | "low" | "ok";

/** Default "low stock" threshold when the item has no min_quantity configured. */
export const WASTE_LOW_STOCK_FALLBACK = 3;

export function wasteStockStatus(item: Pick<ItemWithQty, "current_qty" | "min_quantity">): WasteStockStatus {
  if (item.current_qty === 0) return "empty";
  const threshold = item.min_quantity > 0 ? item.min_quantity : WASTE_LOW_STOCK_FALLBACK;
  if (item.current_qty <= threshold) return "low";
  return "ok";
}

/** Local calendar day a waste record belongs to. */
export function wasteDayKey(iso: string): string {
  return toISODate(new Date(iso));
}

/** Hebrew heading for a day group — "היום" / "אתמול" / "יום חמישי · 3/7". */
export function wasteDayLabel(day: string, today = todayISO()): string {
  if (day === today) return "היום";
  if (day === addDays(today, -1)) return "אתמול";
  const d = new Date(`${day}T00:00:00`);
  const sameYear = d.getFullYear() === new Date(`${today}T00:00:00`).getFullYear();
  const weekday = d.toLocaleDateString("he-IL", { weekday: "long" });
  const date = d.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "numeric",
    ...(sameYear ? {} : { year: "numeric" as const }),
  });
  return `${weekday} · ${date}`;
}

export interface WasteDayGroup {
  day: string;
  label: string;
  items: InventoryWaste[];
}

/**
 * Group consecutive records into day sections.
 * The input is expected newest-first (as the query returns it); grouping only
 * merges *adjacent* records so the original order is never reshuffled.
 */
export function groupWasteByDay(list: InventoryWaste[], today = todayISO()): WasteDayGroup[] {
  const groups: WasteDayGroup[] = [];
  for (const w of list) {
    const day = wasteDayKey(w.created_at);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(w);
    else groups.push({ day, label: wasteDayLabel(day, today), items: [w] });
  }
  return groups;
}

/** "−2 ארגז (48 בקבוק)" — always negative, with the piece count when it helps. */
export function formatWasteQty(
  record: Pick<InventoryWaste, "quantity">,
  item?: Pick<ItemWithQty, "unit" | "units_per_package" | "piece_unit">,
): string {
  const unit = item?.unit ? ` ${item.unit}` : "";
  const base = `−${record.quantity}${unit}`;
  if (item && hasPieceBreakdown(item.units_per_package)) {
    const pieces = mainUnitToPieces(Number(record.quantity), item.units_per_package!);
    return `${base} (${pieces} ${pieceUnitLabel(item.piece_unit)})`;
  }
  return base;
}
