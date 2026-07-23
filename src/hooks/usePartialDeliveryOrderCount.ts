import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrders, batchHasActivePartialDelivery } from "@/api/inventory";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import {
  PARTIAL_ORDER_ACK_EVENT,
  acknowledgePartialOrderBatch,
  countUnacknowledgedPartialDeliveryBatches,
  getPartialOrderAcks,
  isPartialDeliveryBatchUnacknowledged,
  type PartialOrderAckMap,
} from "@/lib/partialOrderNotifications";
import type { InventoryOrder } from "@/types/database";

export type PartialBatchUiState = "none" | "needs_attention" | "handled";

export function usePartialDeliveryOrderCount() {
  const { profile } = useAuth();
  const businessId = useBusinessId();
  const userId = profile?.id;
  const isOfficeManager = profile?.role === "office_manager";

  const { data: orders } = useOrders(businessId, isOfficeManager);

  const [acks, setAcks] = useState<PartialOrderAckMap>(() =>
    userId && businessId ? getPartialOrderAcks(userId, businessId) : {},
  );

  useEffect(() => {
    if (!userId || !businessId) return;
    setAcks(getPartialOrderAcks(userId, businessId));
  }, [userId, businessId]);

  useEffect(() => {
    if (!userId || !businessId) return;

    function onAck(event: Event) {
      const detail = (
        event as CustomEvent<{ userId: string; businessId: string; batchKey: string; at: string }>
      ).detail;
      if (detail?.userId === userId && detail.businessId === businessId) {
        setAcks(getPartialOrderAcks(userId, businessId));
      }
    }

    window.addEventListener(PARTIAL_ORDER_ACK_EVENT, onAck);
    return () => window.removeEventListener(PARTIAL_ORDER_ACK_EVENT, onAck);
  }, [userId, businessId]);

  const count = useMemo(() => {
    if (!isOfficeManager || !orders) return 0;
    return countUnacknowledgedPartialDeliveryBatches(orders, acks);
  }, [isOfficeManager, orders, acks]);

  const isBatchUnacknowledged = useCallback(
    (batchKey: string, lines: InventoryOrder[]) => {
      if (!isOfficeManager) return false;
      return isPartialDeliveryBatchUnacknowledged(batchKey, lines, acks);
    },
    [isOfficeManager, acks],
  );

  const getPartialBatchUiState = useCallback(
    (batchKey: string, lines: InventoryOrder[]): PartialBatchUiState => {
      if (!batchHasActivePartialDelivery(lines)) return "none";
      if (!isOfficeManager) return "needs_attention";
      if (isPartialDeliveryBatchUnacknowledged(batchKey, lines, acks)) return "needs_attention";
      return "handled";
    },
    [isOfficeManager, acks],
  );

  const acknowledgeBatch = useCallback(
    (batchKey: string) => {
      if (!userId || !businessId) return;
      acknowledgePartialOrderBatch(userId, businessId, batchKey);
      setAcks(getPartialOrderAcks(userId, businessId));
    },
    [userId, businessId],
  );

  return { count, isOfficeManager, isBatchUnacknowledged, getPartialBatchUiState, acknowledgeBatch };
}
