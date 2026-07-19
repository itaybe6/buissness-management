import { useCallback, useEffect, useMemo, useState } from "react";
import { useFaults } from "@/api/faults";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import {
  FAULTS_SEEN_EVENT,
  countNewFaults,
  getFaultsSeenAt,
  markFaultsSeen,
} from "@/lib/faultNotifications";

export function useMaintenanceNewFaultCount() {
  const { profile } = useAuth();
  const businessId = useBusinessId();
  const userId = profile?.id;
  const isMaintenance = profile?.role === "maintenance";

  const { data: faults } = useFaults(isMaintenance ? businessId : null, { poll: true });

  const [seenAt, setSeenAt] = useState<string | null>(() =>
    userId && businessId ? getFaultsSeenAt(userId, businessId) : null
  );

  useEffect(() => {
    if (!isMaintenance || !userId || !businessId) return;
    if (getFaultsSeenAt(userId, businessId)) return;
    markFaultsSeen(userId, businessId);
    setSeenAt(new Date().toISOString());
  }, [isMaintenance, userId, businessId]);

  useEffect(() => {
    if (!userId || !businessId) return;

    function onSeen(event: Event) {
      const detail = (event as CustomEvent<{ userId: string; businessId: string; at: string }>).detail;
      if (detail?.userId === userId && detail.businessId === businessId) {
        setSeenAt(detail.at);
      }
    }

    window.addEventListener(FAULTS_SEEN_EVENT, onSeen);
    return () => window.removeEventListener(FAULTS_SEEN_EVENT, onSeen);
  }, [userId, businessId]);

  const count = useMemo(() => {
    if (!isMaintenance || !faults) return 0;
    return countNewFaults(faults, seenAt);
  }, [isMaintenance, faults, seenAt]);

  const markSeen = useCallback(() => {
    if (!userId || !businessId) return;
    markFaultsSeen(userId, businessId);
    setSeenAt(getFaultsSeenAt(userId, businessId));
  }, [userId, businessId]);

  return { count, markSeen, isMaintenance };
}
