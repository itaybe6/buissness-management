import type {
  EventRequest,
  EventRequestKind,
  EventRequestStatus,
  EventStaffingLine,
  EventSupplyLine,
} from "@/types/database";

/* ------------------------------------------------------------------ *
 * Kind / status metadata
 * ------------------------------------------------------------------ */

export const EVENT_REQUEST_KIND_META: Record<
  EventRequestKind,
  { label: string; short: string; icon: string; verb: string; hint: string }
> = {
  staffing: {
    label: "שיבוץ עובדים",
    short: "שיבוץ",
    icon: "groups",
    verb: "בקשת שיבוץ",
    hint: "כמה עובדים צריך מכל מחלקה, ולאיזו משמרת",
  },
  supplies: {
    label: "רשימת מצרכים",
    short: "מצרכים",
    icon: "shopping_basket",
    verb: "רשימת מצרכים",
    hint: "בחרו מהקטלוג או הוסיפו פריט חופשי",
  },
};

/** The lifecycle, in order — drives the status stepper. */
export const EVENT_REQUEST_STATUS_FLOW: EventRequestStatus[] = ["open", "in_treatment", "closed"];

export const EVENT_REQUEST_STATUS_META: Record<
  EventRequestStatus,
  { label: string; short: string; icon: string; tone: "warning" | "info" | "success"; step: number }
> = {
  open: { label: "ממתין", short: "ממתינות", icon: "schedule", tone: "warning", step: 0 },
  in_treatment: { label: "בטיפול", short: "בטיפול", icon: "autorenew", tone: "info", step: 1 },
  closed: { label: "טופל", short: "טופלו", icon: "check_circle", tone: "success", step: 2 },
};

/** Next status a handler moves the request to, or null when closed. */
export function nextEventRequestStatus(status: EventRequestStatus): EventRequestStatus | null {
  const i = EVENT_REQUEST_STATUS_FLOW.indexOf(status);
  return i >= 0 && i < EVENT_REQUEST_STATUS_FLOW.length - 1 ? EVENT_REQUEST_STATUS_FLOW[i + 1] : null;
}

/* ------------------------------------------------------------------ *
 * Lines
 * ------------------------------------------------------------------ */

export function staffingLines(r: EventRequest): EventStaffingLine[] {
  return r.kind === "staffing" ? (r.lines as EventStaffingLine[]) : [];
}

export function supplyLines(r: EventRequest): EventSupplyLine[] {
  return r.kind === "supplies" ? (r.lines as EventSupplyLine[]) : [];
}

/** Total headcount / total pieces requested — the number shown on the card. */
export function requestTotal(r: EventRequest): number {
  return r.kind === "staffing"
    ? staffingLines(r).reduce((s, l) => s + l.count, 0)
    : supplyLines(r).reduce((s, l) => s + l.quantity, 0);
}

/**
 * How far along the manager is: staffing = slots filled / slots requested,
 * supplies = items ticked / items requested.
 */
export function requestProgress(r: EventRequest): { done: number; total: number } {
  if (r.kind === "staffing") {
    const lines = staffingLines(r);
    return {
      done: lines.reduce((s, l) => s + Math.min(l.count, l.assigned?.length ?? 0), 0),
      total: lines.reduce((s, l) => s + l.count, 0),
    };
  }
  const lines = supplyLines(r);
  return { done: lines.filter((l) => l.done).length, total: lines.length };
}

/** Everyone the manager placed on a staffing request, in slot order. */
export function assignedEmployeeIds(r: EventRequest): string[] {
  return staffingLines(r).flatMap((l) => l.assigned ?? []);
}

/**
 * Status that follows from the lines themselves: nothing done → keep the
 * current status (open / in_treatment as the manager set it), partly done →
 * in_treatment, everything done → closed.
 */
export function statusFromLines(r: EventRequest, lines: EventRequest["lines"]): EventRequestStatus {
  const { done, total } = requestProgress({ ...r, lines } as EventRequest);
  if (total > 0 && done >= total) return "closed";
  if (done > 0) return "in_treatment";
  return r.status === "closed" ? "open" : r.status;
}

/** "2 × בר · 1 × מלצרות" / "3 × וודקה · 2 × לימונים". */
export function summarizeRequestLines(r: EventRequest, max = 3): string {
  const parts =
    r.kind === "staffing"
      ? staffingLines(r).map((l) => `${l.count} × ${l.label}`)
      : supplyLines(r).map((l) => `${formatQty(l.quantity)} × ${l.name}`);
  if (parts.length <= max) return parts.join(" · ");
  return `${parts.slice(0, max).join(" · ")} · ועוד ${parts.length - max}`;
}

export function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString("he-IL", { maximumFractionDigits: 2 });
}

/** Short, chat-style timestamp for request cards. */
export function formatRequestWhen(iso: string): string {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  if (min < 1) return "עכשיו";
  if (min < 60) return `לפני ${min} דק׳`;
  const hours = Math.round(min / 60);
  if (hours < 24) return hours === 1 ? "לפני שעה" : `לפני ${hours} שעות`;
  const days = Math.round(hours / 24);
  if (days === 1) return "אתמול";
  if (days < 7) return `לפני ${days} ימים`;
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

/* ------------------------------------------------------------------ *
 * "Seen" tracking for the manager badge (localStorage, per user+business)
 * ------------------------------------------------------------------ */

const STORAGE_PREFIX = "event_requests_seen";
export const EVENT_REQUESTS_SEEN_EVENT = "event-requests-seen";

function storageKey(userId: string, businessId: string) {
  return `${STORAGE_PREFIX}:${userId}:${businessId}`;
}

export function getEventRequestsSeenAt(userId: string, businessId: string): string | null {
  try {
    return localStorage.getItem(storageKey(userId, businessId));
  } catch {
    return null;
  }
}

export function markEventRequestsSeen(userId: string, businessId: string, at = new Date().toISOString()) {
  try {
    localStorage.setItem(storageKey(userId, businessId), at);
    window.dispatchEvent(new CustomEvent(EVENT_REQUESTS_SEEN_EVENT, { detail: { userId, businessId, at } }));
  } catch {
    // ignore quota / private mode
  }
}

/** Open requests created since the manager last opened the inbox. */
export function countUnseenEventRequests(requests: EventRequest[], seenAt: string | null): number {
  const open = requests.filter((r) => r.status === "open");
  if (!seenAt) return open.length;
  return open.filter((r) => r.created_at > seenAt).length;
}

/** Rows (requests or tasks) created since the manager last opened the inbox. */
export function countUnseenSince<T extends { created_at: string }>(rows: T[], seenAt: string | null): number {
  if (!seenAt) return rows.length;
  return rows.filter((r) => r.created_at > seenAt).length;
}
