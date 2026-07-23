import type { InventoryOrder } from "@/types/database";
import {
  batchHasActivePartialDelivery,
  batchPartialDeliveryEventAt,
  groupInventoryOrdersByBatch,
} from "@/api/inventory";

const STORAGE_PREFIX = "office_partial_order_ack";
export const PARTIAL_ORDER_ACK_EVENT = "office-partial-order-ack";

function storageKey(userId: string, businessId: string) {
  return `${STORAGE_PREFIX}:${userId}:${businessId}`;
}

export type PartialOrderAckMap = Record<string, string>;

export function getPartialOrderAcks(userId: string, businessId: string): PartialOrderAckMap {
  try {
    const raw = localStorage.getItem(storageKey(userId, businessId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as PartialOrderAckMap;
  } catch {
    return {};
  }
}

export function acknowledgePartialOrderBatch(
  userId: string,
  businessId: string,
  batchKey: string,
  at = new Date().toISOString(),
) {
  try {
    const prev = getPartialOrderAcks(userId, businessId);
    const next = { ...prev, [batchKey]: at };
    localStorage.setItem(storageKey(userId, businessId), JSON.stringify(next));
    window.dispatchEvent(
      new CustomEvent(PARTIAL_ORDER_ACK_EVENT, { detail: { userId, businessId, batchKey, at } }),
    );
  } catch {
    // ignore quota / private mode
  }
}

export function isPartialDeliveryBatchUnacknowledged(
  batchKey: string,
  lines: Pick<InventoryOrder, "status" | "quantity" | "received_quantity" | "created_at">[],
  acks: PartialOrderAckMap,
): boolean {
  if (!batchHasActivePartialDelivery(lines)) return false;
  const eventAt = batchPartialDeliveryEventAt(lines);
  const ackAt = acks[batchKey];
  return !ackAt || eventAt > ackAt;
}

export function countUnacknowledgedPartialDeliveryBatches(
  orders: InventoryOrder[],
  acks: PartialOrderAckMap,
): number {
  const byBatch = groupInventoryOrdersByBatch(orders);
  let count = 0;
  for (const [key, lines] of byBatch) {
    if (isPartialDeliveryBatchUnacknowledged(key, lines, acks)) count++;
  }
  return count;
}
