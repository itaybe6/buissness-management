/** One weekday a shift actually runs. day_of_week: 0 = Sunday (א׳) … 6 = Saturday (ש׳). */
export interface ShiftDayHours {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

type HoursTemplate = {
  start_time: string;
  end_time: string;
  /** When empty or missing, the shift runs every day at start_time–end_time. */
  days?: ShiftDayHours[] | null;
};

export function hhmm(time: string | null | undefined): string {
  return (time ?? "").slice(0, 5);
}

/** Weekday index (0 = Sunday) of a yyyy-mm-dd date, in local time. */
export function dayIndexFromISO(dateISO: string): number {
  const [y, mo, d] = dateISO.split("-").map(Number);
  return new Date(y, mo - 1, d).getDay();
}

/**
 * Hours the shift runs on this weekday, or null when the shift is defined
 * per day and this day is off.
 */
export function hoursOnDay(
  template: HoursTemplate,
  dayIndex: number,
): { start: string; end: string } | null {
  const days = template.days;
  if (!days || days.length === 0) {
    return { start: hhmm(template.start_time), end: hhmm(template.end_time) };
  }
  const row = days.find((d) => d.day_of_week === dayIndex);
  if (!row) return null;
  return { start: hhmm(row.start_time), end: hhmm(row.end_time) };
}

export function formatHours(hours: { start: string; end: string } | null): string | null {
  if (!hours) return null;
  return `${hours.start}–${hours.end}`;
}

/** The shared range when every active day uses the same hours; otherwise null. */
export function uniformHoursLabel(template: HoursTemplate): string | null {
  const days = template.days;
  if (!days || days.length === 0) return formatHours(hoursOnDay(template, 0));
  const labels = days.map((d) => `${hhmm(d.start_time)}–${hhmm(d.end_time)}`);
  if (labels.length === 0) return null;
  return labels.every((label) => label === labels[0]) ? labels[0] : null;
}
