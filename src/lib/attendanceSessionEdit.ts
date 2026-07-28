/**
 * Time math for the manager's attendance-session editor (ForceClockOutModal).
 *
 * A manager can force an employee out of a shift or correct their punched
 * hours. Whatever this file returns lands in `attendance.clock_in/clock_out`,
 * which is exactly what payroll multiplies by the hourly rate — so the rounding
 * and the overnight roll-over here are pay-affecting, not cosmetic.
 */

/** "2026-07-08T18:07:00" → "18:07" (local). Empty string when unparsable. */
export function toTimeInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Combine a date base with HH:mm.
 * When `rollIfBefore` is given and the result lands at or before it, the time is
 * pushed to the next calendar day — that is how a 22:00→02:00 night shift stays
 * a 4-hour shift instead of becoming negative.
 */
export function combineDateAndTime(
  baseIso: string,
  hhmm: string,
  rollIfBefore?: Date | null,
): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const base = new Date(baseIso);
  if (Number.isNaN(base.getTime())) return null;
  const next = new Date(base);
  next.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (rollIfBefore && next.getTime() <= rollIfBefore.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

/** Elapsed hours, never negative. */
export function hoursBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 3.6e6);
}

/** Hours as shown in the editor's "total hours" box (2 decimals, empty at zero). */
export function formatSessionHours(hours: number): string {
  return hours > 0 ? (Math.round(hours * 100) / 100).toString() : "";
}

/** Typing a total-hours value moves the end time; returns the new "HH:MM". */
export function endTimeFromHours(start: Date, hours: number): string | null {
  if (!Number.isFinite(hours) || hours < 0) return null;
  const end = new Date(start.getTime() + hours * 3.6e6);
  return `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
}

export type SessionEditResult =
  | { ok: true; clock_in: string; clock_out: string | null; hours: number }
  | { ok: false; error: string };

/**
 * Validate a manager's edit before it is written to the attendance row.
 *
 * `mode`:
 *  - "edit_open"  — correcting the start time of a shift still in progress (no clock_out yet)
 *  - "edit_closed"— correcting both ends of a finished shift
 *  - "clock_out"  — forcing the employee out now, or at an edited end time
 */
export function validateSessionEdit(input: {
  clockIn: string;
  workStart: string;
  workEnd: string;
  mode: "edit_open" | "edit_closed" | "clock_out";
  /** Used as the end time when forcing a clock-out without editing the end. */
  now?: Date;
  /** True when the manager opened the end-time field on an in-progress shift. */
  editingEnd?: boolean;
}): SessionEditResult {
  const startDate = combineDateAndTime(input.clockIn, input.workStart);
  if (!startDate) return { ok: false, error: "יש למלא שעת כניסה תקינה." };

  if (input.mode === "edit_open") {
    return { ok: true, clock_in: startDate.toISOString(), clock_out: null, hours: 0 };
  }

  const useNow = input.mode === "clock_out" && !input.editingEnd;
  const endDate = useNow
    ? input.now ?? new Date()
    : combineDateAndTime(input.clockIn, input.workEnd, startDate);

  if (!endDate) {
    return {
      ok: false,
      error: input.mode === "clock_out" ? "יש למלא שעת כניסה ויציאה תקינות." : "יש למלא שעת יציאה תקינה.",
    };
  }
  if (endDate.getTime() <= startDate.getTime()) {
    return { ok: false, error: "שעת היציאה חייבת להיות אחרי שעת הכניסה." };
  }

  return {
    ok: true,
    clock_in: startDate.toISOString(),
    clock_out: endDate.toISOString(),
    hours: Math.round(hoursBetween(startDate, endDate) * 100) / 100,
  };
}
