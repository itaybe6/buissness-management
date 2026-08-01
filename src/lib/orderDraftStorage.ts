/**
 * The order composer keeps its cart in memory, so leaving the page mid-order —
 * or closing the app entirely — used to throw the work away. The cart is
 * mirrored to localStorage per user + business and offered back on return.
 */

const STORAGE_PREFIX = "office_order_draft";
/** A cart older than this is stale enough that restoring it would confuse more than help. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface OrderDraftLine {
  item_id: string;
  supplier_id: string;
  packs: number;
  pieces: number;
}

export interface OrderDraft {
  saved_at: string;
  lines: OrderDraftLine[];
}

function storageKey(userId: string, businessId: string) {
  return `${STORAGE_PREFIX}:${userId}:${businessId}`;
}

function isLine(value: unknown): value is OrderDraftLine {
  const line = value as Partial<OrderDraftLine> | null;
  return (
    !!line &&
    typeof line.item_id === "string" &&
    typeof line.supplier_id === "string" &&
    typeof line.packs === "number" &&
    typeof line.pieces === "number"
  );
}

export function loadOrderDraft(userId: string, businessId: string): OrderDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(userId, businessId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OrderDraft> | null;
    const lines = (parsed?.lines ?? []).filter(isLine);
    const savedAt = typeof parsed?.saved_at === "string" ? parsed.saved_at : null;
    if (!lines.length || !savedAt) return null;
    if (Date.now() - new Date(savedAt).getTime() > MAX_AGE_MS) {
      clearOrderDraft(userId, businessId);
      return null;
    }
    return { saved_at: savedAt, lines };
  } catch {
    return null;
  }
}

export function saveOrderDraft(userId: string, businessId: string, lines: OrderDraftLine[]) {
  try {
    if (!lines.length) {
      clearOrderDraft(userId, businessId);
      return;
    }
    const draft: OrderDraft = { saved_at: new Date().toISOString(), lines };
    localStorage.setItem(storageKey(userId, businessId), JSON.stringify(draft));
  } catch {
    // ignore quota / private mode
  }
}

export function clearOrderDraft(userId: string, businessId: string) {
  try {
    localStorage.removeItem(storageKey(userId, businessId));
  } catch {
    // ignore quota / private mode
  }
}

/** "לפני 5 דקות" / "אתמול" — enough context to trust a restored cart. */
export function draftSavedAgoLabel(savedAt: string): string {
  const diffMs = Date.now() - new Date(savedAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "";
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "עכשיו";
  if (minutes < 60) return `לפני ${minutes} דק׳`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.round(hours / 24);
  return days === 1 ? "אתמול" : `לפני ${days} ימים`;
}
