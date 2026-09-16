import { useCallback, useEffect, useMemo, useState } from "react";
import { useEventManagerTasks, useEventRequests } from "@/api/eventRequests";
import { useAuth } from "@/lib/auth";
import { EVENT_REQUEST_HANDLER_ROLES } from "@/lib/constants";
import { useBusinessId } from "@/lib/db";
import {
  EVENT_REQUESTS_SEEN_EVENT,
  countUnseenEventRequests,
  countUnseenSince,
  getEventRequestsSeenAt,
  markEventRequestsSeen,
} from "@/lib/eventRequests";

/**
 * Manager-side badge: event requests that are still waiting to be handled
 * (slots not yet filled, items not yet bought). "Seen" tracking is kept only
 * for the "new" markers inside the inbox.
 */
export function useEventRequestBadgeCount() {
  const { profile, hasFeature } = useAuth();
  const businessId = useBusinessId();
  const userId = profile?.id;
  const isHandler =
    !!profile?.role && EVENT_REQUEST_HANDLER_ROLES.includes(profile.role) && hasFeature("events");

  const { data: requests } = useEventRequests(isHandler ? businessId : null, { poll: true });
  const { data: tasks } = useEventManagerTasks(isHandler ? businessId : null, { poll: true });

  const [seenAt, setSeenAt] = useState<string | null>(() =>
    userId && businessId ? getEventRequestsSeenAt(userId, businessId) : null,
  );

  useEffect(() => {
    if (!userId || !businessId) return;

    function onSeen(event: Event) {
      const detail = (event as CustomEvent<{ userId: string; businessId: string; at: string }>).detail;
      if (detail?.userId === userId && detail.businessId === businessId) {
        setSeenAt(detail.at);
      }
    }

    window.addEventListener(EVENT_REQUESTS_SEEN_EVENT, onSeen);
    return () => window.removeEventListener(EVENT_REQUESTS_SEEN_EVENT, onSeen);
  }, [userId, businessId]);

  const requestCount = useMemo(
    () => (isHandler && requests ? countUnseenEventRequests(requests, seenAt) : 0),
    [isHandler, requests, seenAt],
  );
  const taskCount = useMemo(
    () => (isHandler && tasks ? countUnseenSince(tasks, seenAt) : 0),
    [isHandler, tasks, seenAt],
  );

  const openRequestCount = useMemo(
    () => (isHandler && requests ? requests.filter((r) => r.status === "open").length : 0),
    [isHandler, requests],
  );

  /** Requests still waiting for the manager to act — the badge does not clear on view. */
  const activeRequestCount = useMemo(
    () => (isHandler && requests ? requests.filter((r) => r.status !== "closed").length : 0),
    [isHandler, requests],
  );

  const markSeen = useCallback(() => {
    if (!userId || !businessId) return;
    markEventRequestsSeen(userId, businessId);
    setSeenAt(getEventRequestsSeenAt(userId, businessId));
  }, [userId, businessId]);

  return {
    /**
     * The nav badge: requests that still need the manager's hand — every
     * slot filled / every item ticked / marked handled makes one go away.
     * Opening the inbox does not clear it.
     */
    count: activeRequestCount,
    activeRequestCount,
    /** Requests created since the inbox was last opened (drives "new" markers). */
    requestCount,
    taskCount,
    /** All open requests regardless of "seen" — the dashboard chip. */
    openRequestCount,
    markSeen,
    isHandler,
  };
}
