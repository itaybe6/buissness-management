import { useAuth } from "./auth";

/**
 * Returns the business id the current user operates on.
 * Regular users: their own business. Super admin: whatever business they are
 * currently viewing (passed explicitly in those flows).
 */
export function useBusinessId(): string | null {
  const { profile } = useAuth();
  return profile?.business_id ?? null;
}

export function formatCurrency(n: number): string {
  return "₪" + Math.round(n).toLocaleString("he-IL");
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Local calendar date as ISO yyyy-mm-dd (avoids UTC shift from toISOString). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Start of the week (Sunday) for a given date, as ISO yyyy-mm-dd. */
export function weekStart(date = new Date()): string {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return toISODate(d);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export const HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function formatDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return "··";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

const PALETTE = ["#7c3aed", "#db2777", "#2563eb", "#d97706", "#16a34a", "#0891b2", "#dc2626", "#0d9488"];
export function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
