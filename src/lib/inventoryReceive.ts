/**
 * Planning rules for receiving a supplier order line.
 *
 * Receiving is the only place in the app that both closes an order line AND
 * moves stock, and it has to stay consistent in three directions at once:
 * the closed line, the open remainder line, and the warehouse count. The pure
 * decisions live here so they can be tested without a database; the mutations
 * in `@/api/inventory` just execute the plan.
 */

export const RECEIVE_QTY_ERROR = "כמות שהגיעה חייבת להיות בין 1 לכמות שהוזמנה";
export const STOCK_BELOW_ZERO_ERROR = "לא ניתן לעדכן — המלאי ירד מתחת לאפס";

/** Received must be a real number, at least 1, and never more than ordered. */
export function isValidReceivedQty(ordered: number, received: number): boolean {
  return Number.isFinite(received) && received > 0 && received <= ordered;
}

/** What is still owed by the supplier after this receive. Never negative. */
export function orderReceivedRemainderQty(ordered: number, received: number): number {
  return Math.max(0, ordered - received);
}

export interface ReceivePlan {
  /** Units still owed by the supplier. 0 when the delivery was complete. */
  remainderQty: number;
  /** The whole ordered quantity arrived — no follow-up line is opened. */
  fullyArrived: boolean;
  /** A new "requested" line must be inserted for the remainder. */
  createsRemainder: boolean;
  /** How much to add to the warehouse count. */
  stockDelta: number;
  /** Audit-log note written next to the stock change. */
  note: string;
}

/**
 * Plan a first-time receive of an order line.
 * Throws `RECEIVE_QTY_ERROR` for a quantity outside 1..ordered — the same guard
 * the mutation applies before touching the database.
 */
export function planOrderReceive(input: { ordered: number; received: number }): ReceivePlan {
  const { ordered, received } = input;
  if (!isValidReceivedQty(ordered, received)) throw new Error(RECEIVE_QTY_ERROR);

  const remainderQty = orderReceivedRemainderQty(ordered, received);
  const fullyArrived = remainderQty === 0;

  return {
    remainderQty,
    fullyArrived,
    createsRemainder: !fullyArrived,
    stockDelta: received,
    note: fullyArrived
      ? `הגיע · נוסף למלאי +${received}`
      : `הגיע · נוסף למלאי +${received} מתוך ${ordered}`,
  };
}

/** What should happen to the follow-up ("remainder") order line. */
export type RemainderAction = "none" | "create" | "update" | "delete";

export interface ReceiveCorrectionPlan extends ReceivePlan {
  /** The corrected value equals the previous one — nothing to write. */
  noop: boolean;
  remainderAction: RemainderAction;
}

/**
 * Plan a correction of an already-received line.
 *
 * The tricky cases are the transitions:
 *  - partial → full  : the remainder line must be deleted, stock goes up.
 *  - full → partial  : a remainder line must be created, stock goes down.
 *  - partial → partial: the existing remainder line is resized.
 */
export function planReceiveCorrection(input: {
  ordered: number;
  previousReceived: number;
  received: number;
  /** Whether a remainder line already exists for this order. */
  hasRemainderOrder: boolean;
}): ReceiveCorrectionPlan {
  const { ordered, previousReceived, received, hasRemainderOrder } = input;
  if (!isValidReceivedQty(ordered, received)) throw new Error(RECEIVE_QTY_ERROR);

  const remainderQty = orderReceivedRemainderQty(ordered, received);
  const fullyArrived = remainderQty === 0;
  const noop = received === previousReceived;

  let remainderAction: RemainderAction = "none";
  if (!noop) {
    if (remainderQty > 0) remainderAction = hasRemainderOrder ? "update" : "create";
    else if (hasRemainderOrder) remainderAction = "delete";
  }

  return {
    noop,
    remainderQty,
    fullyArrived,
    createsRemainder: remainderAction === "create",
    remainderAction,
    stockDelta: noop ? 0 : received - previousReceived,
    note: fullyArrived
      ? `תיקון קבלה · ${previousReceived} → ${received} (הושלם)`
      : `תיקון קבלה · ${previousReceived} → ${received} מתוך ${ordered}`,
  };
}

/**
 * Apply a stock delta to a warehouse count.
 * Throws when the result would go negative — stock is never allowed below zero,
 * because a negative count silently corrupts every later order suggestion.
 */
export function nextWarehouseQty(currentQty: number, delta: number): number {
  const next = currentQty + delta;
  if (next < 0) throw new Error(STOCK_BELOW_ZERO_ERROR);
  return next;
}
