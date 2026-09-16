/** Local calendar helpers for menu sales — Israel week starts on Sunday. */

const WEEKDAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"] as const;
const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

export function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
}

/** Sunday of the week that contains `iso`. */
export function weekStartSunday(iso: string): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() - d.getDay());
  return toIsoDate(d);
}

export function weekDays(sundayIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(sundayIso, i));
}

export function monthStart(iso: string): string {
  const d = parseIsoDate(iso);
  d.setDate(1);
  return toIsoDate(d);
}

export function monthEnd(iso: string): string {
  const d = parseIsoDate(iso);
  d.setMonth(d.getMonth() + 1, 0);
  return toIsoDate(d);
}

export function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function weekdayShort(iso: string): string {
  return WEEKDAY_SHORT[parseIsoDate(iso).getDay()];
}

export function formatDayNum(iso: string): string {
  return String(parseIsoDate(iso).getDate());
}

export function formatMonthLabel(iso: string): string {
  const d = parseIsoDate(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatWeekRange(sundayIso: string): string {
  const start = parseIsoDate(sundayIso);
  const end = parseIsoDate(addDays(sundayIso, 6));
  const a = start.getDate();
  const b = end.getDate();
  if (start.getMonth() === end.getMonth()) {
    return `${a}–${b} ב${MONTHS[start.getMonth()]}`;
  }
  return `${a} ב${MONTHS[start.getMonth()]} – ${b} ב${MONTHS[end.getMonth()]}`;
}

export function formatLongDay(iso: string): string {
  const d = parseIsoDate(iso);
  return `יום ${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()} ב${MONTHS[d.getMonth()]}`;
}

export function saleKey(dishId: string, date: string): string {
  return `${dishId}|${date}`;
}

export interface SalesIndex {
  qty(dishId: string, date: string): number;
  sum(dishId: string, dates: string[]): number;
  dayTotal(date: string): number;
}

export function indexSales(rows: { dish_id: string; sold_on: string; quantity: number }[]): SalesIndex {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.quantity > 0) map.set(saleKey(r.dish_id, r.sold_on), r.quantity);
  }
  return {
    qty(dishId, date) {
      return map.get(saleKey(dishId, date)) ?? 0;
    },
    sum(dishId, dates) {
      let n = 0;
      for (const d of dates) n += map.get(saleKey(dishId, d)) ?? 0;
      return n;
    },
    dayTotal(date) {
      const suffix = `|${date}`;
      let n = 0;
      for (const [k, q] of map) if (k.endsWith(suffix)) n += q;
      return n;
    },
  };
}

/** plates × profit per plate. 0 plates → 0; unknown profit → null. */
export function platesProfit(plates: number, profitPerPlate: number | null | undefined): number | null {
  if (profitPerPlate == null || !Number.isFinite(profitPerPlate)) return plates > 0 ? null : 0;
  return Math.round(profitPerPlate * plates * 100) / 100;
}
