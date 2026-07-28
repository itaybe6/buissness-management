/**
 * Moving stock between the business's warehouses.
 *
 * The transfer must never invent or lose units: whatever leaves the source
 * warehouse has to land in the target one. Quantities are rounded to four
 * decimals so repeated transfers of fractional units (kg, litre) don't drift.
 */

export const TRANSFER_SAME_WAREHOUSE_ERROR = "בחרו מחסן מקור ומחסן יעד שונים";
export const TRANSFER_NO_QTY_ERROR = "אין כמות להעברה מהמחסן שנבחר";

export type StockTransferPlan =
  | { ok: false; error: string }
  | { ok: true; amount: number; nextFromQty: number; nextToQty: number };

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Plan a transfer between two warehouses.
 * The requested amount is capped at what the source actually holds, so a
 * manager typing "100" on a warehouse holding 7 moves 7 — never a negative.
 */
export function planStockTransfer(input: {
  fromWarehouseId: string | null | undefined;
  toWarehouseId: string | null | undefined;
  requestedQty: number;
  fromQty: number;
  toQty: number;
}): StockTransferPlan {
  const { fromWarehouseId, toWarehouseId, requestedQty, fromQty, toQty } = input;

  if (!fromWarehouseId || !toWarehouseId || fromWarehouseId === toWarehouseId) {
    return { ok: false, error: TRANSFER_SAME_WAREHOUSE_ERROR };
  }

  const available = Number.isFinite(fromQty) ? fromQty : 0;
  const wanted = Number.isFinite(requestedQty) ? requestedQty : 0;
  const amount = Math.min(wanted, available);

  if (amount <= 0) return { ok: false, error: TRANSFER_NO_QTY_ERROR };

  return {
    ok: true,
    amount,
    nextFromQty: round4(available - amount),
    nextToQty: round4((Number.isFinite(toQty) ? toQty : 0) + amount),
  };
}

/** Total units of one item across every warehouse. */
export function totalStockAcrossWarehouses(stocks: { quantity: number }[]): number {
  return round4(stocks.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0));
}
