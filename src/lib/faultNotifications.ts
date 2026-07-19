import type { Fault } from "@/types/database";

const STORAGE_PREFIX = "maintenance_faults_seen";
export const FAULTS_SEEN_EVENT = "maintenance-faults-seen";

function storageKey(userId: string, businessId: string) {
  return `${STORAGE_PREFIX}:${userId}:${businessId}`;
}

export function getFaultsSeenAt(userId: string, businessId: string): string | null {
  try {
    return localStorage.getItem(storageKey(userId, businessId));
  } catch {
    return null;
  }
}

export function markFaultsSeen(userId: string, businessId: string, at = new Date().toISOString()) {
  try {
    localStorage.setItem(storageKey(userId, businessId), at);
    window.dispatchEvent(new CustomEvent(FAULTS_SEEN_EVENT, { detail: { userId, businessId, at } }));
  } catch {
    // ignore quota / private mode
  }
}

export function countNewFaults(faults: Fault[], seenAt: string | null): number {
  if (!seenAt) return 0;
  return faults.filter((f) => f.status === "needs_handling" && f.created_at > seenAt).length;
}
