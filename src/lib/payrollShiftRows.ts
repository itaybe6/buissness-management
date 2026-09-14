import {
  attendancePosition,
  bonusPosition,
  groupByPosition,
  positionLabel,
  sortPositions,
  tipPosition,
} from "@/lib/employeePositions";
import type { Attendance, EmployeePosition, ShiftBonus, ShiftTemplate, Tip } from "@/types/database";

/** One normalized shift row, regardless of wage model. */
export interface ShiftRow {
  id: string;
  date: Date;
  title: string;
  timeLabel: string | null;
  hours: number;
  hourly: number;
  earned: number;
  isTips: boolean;
  tipAmount?: number;
  topup?: number;
  belowMin?: boolean;
  bonusAmount?: number;
  /** Position the shift was worked in — set when the employee holds several. */
  positionId?: string;
  positionLabel?: string;
}

export interface ShiftRowTotals {
  hours: number;
  earned: number;
  tips: number;
  topup: number;
  bonus: number;
  count: number;
  avg: number;
}

export const HE_DAYS_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
export const HE_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

/** Current month as YYYY-MM in local time — toISOString would roll back a month at 00:00–03:00. */
function localMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthNow() {
  return localMonthKey(new Date());
}

export function shiftMonth(m: string, delta: number) {
  const d = new Date(m + "-01T12:00:00");
  d.setMonth(d.getMonth() + delta);
  return localMonthKey(d);
}

export function monthLabel(m: string) {
  const d = new Date(m + "-01T12:00:00");
  return `${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function shiftFullDateLabel(d: Date) {
  return `${HE_DAYS_SHORT[d.getDay()]}, ${d.getDate()} ב${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export function fmtHours(h: number) {
  const v = Math.round(h * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function bonusKey(date: string, templateId: string | null) {
  return `${date}|${templateId ?? ""}`;
}

/** Build per-shift rows for one employee from attendance, tips, and kupah bonuses. */
export function buildEmployeeShiftRows(input: {
  isTips: boolean;
  rate: number;
  attendance: Attendance[];
  tips: Tip[];
  bonuses: ShiftBonus[];
  templates: ShiftTemplate[];
}): ShiftRow[] {
  const { isTips, rate, attendance, tips, bonuses, templates } = input;
  const tplById = new Map(templates.map((t) => [t.id, t] as [string, ShiftTemplate]));
  const bonusesByShift = new Map(bonuses.map((b) => [bonusKey(b.shift_date, b.shift_template_id), b]));
  const usedBonusKeys = new Set<string>();

  const mergeBonus = (row: ShiftRow, dateISO: string, templateId: string | null | undefined): ShiftRow => {
    const key = bonusKey(dateISO, templateId ?? null);
    const bonus = bonusesByShift.get(key);
    if (!bonus) return row;
    usedBonusKeys.add(key);
    const bonusAmount = Number(bonus.amount) || 0;
    return {
      ...row,
      earned: row.earned + bonusAmount,
      bonusAmount: (row.bonusAmount ?? 0) + bonusAmount,
    };
  };

  let baseRows: ShiftRow[];

  if (isTips) {
    baseRows = tips
      .map((t): ShiftRow => {
        const hours = Number(t.hours) || 0;
        const tipAmount = Number(t.amount) || 0;
        const fromTips = t.hourly_from_tips != null ? Number(t.hourly_from_tips) : hours ? tipAmount / hours : 0;
        const hourly = Math.max(fromTips, rate);
        const earned = hours * hourly;
        const topup = Math.max(0, earned - tipAmount);
        const tpl = t.shift_template_id ? tplById.get(t.shift_template_id) : undefined;
        return mergeBonus(
          {
            id: t.id,
            date: new Date(t.shift_date + "T00:00:00"),
            title: tpl?.name ?? "משמרת",
            timeLabel: tpl ? `${tpl.start_time?.slice(0, 5)}–${tpl.end_time?.slice(0, 5)}` : null,
            hours,
            hourly,
            earned,
            isTips: true,
            tipAmount,
            topup,
            belowMin: topup > 0.5,
          },
          t.shift_date,
          t.shift_template_id,
        );
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  } else {
    baseRows = attendance
      .filter((a) => a.clock_in && a.clock_out)
      .map((a): ShiftRow => {
        const hours = (new Date(a.clock_out!).getTime() - new Date(a.clock_in!).getTime()) / 3.6e6;
        return {
          id: a.id,
          date: new Date(a.clock_in!),
          title: "משמרת",
          timeLabel: `${hhmm(a.clock_in!)}–${hhmm(a.clock_out!)}`,
          hours,
          hourly: rate,
          earned: hours * rate,
          isTips: false,
        };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  const bonusOnlyRows: ShiftRow[] = bonuses
    .filter((b) => !usedBonusKeys.has(bonusKey(b.shift_date, b.shift_template_id)))
    .map((b): ShiftRow => {
      const tpl = b.shift_template_id ? tplById.get(b.shift_template_id) : undefined;
      const bonusAmount = Number(b.amount) || 0;
      return {
        id: `bonus-${b.id}`,
        date: new Date(b.shift_date + "T00:00:00"),
        title: tpl?.name ?? "תוספת שכר",
        timeLabel: tpl ? `${tpl.start_time?.slice(0, 5)}–${tpl.end_time?.slice(0, 5)}` : null,
        hours: 0,
        hourly: 0,
        earned: bonusAmount,
        isTips: false,
        bonusAmount,
      };
    });

  return [...baseRows, ...bonusOnlyRows].sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * Shift rows for an employee with one or more positions. Every punch / tip /
 * bonus is computed under the wage model of the position it was recorded in,
 * so a tips shift and an hourly shift of the same person sit side by side.
 * When the employee holds several positions the row title is prefixed with the
 * position ("מלצרות · משמרת"). `onlyPositionId` narrows to one position.
 */
export function buildEmployeeShiftRowsByPosition(input: {
  positions: EmployeePosition[];
  attendance: Attendance[];
  tips: Tip[];
  bonuses: ShiftBonus[];
  templates: ShiftTemplate[];
  onlyPositionId?: string | null;
  deptName?: (id: string) => string | null | undefined;
}): ShiftRow[] {
  const positions = sortPositions(input.positions);
  if (positions.length === 0) return [];
  const multi = positions.length > 1;

  const attendanceByPos = groupByPosition(input.attendance, positions, attendancePosition);
  const tipsByPos = groupByPosition(input.tips, positions, tipPosition);
  const bonusesByPos = groupByPosition(input.bonuses, positions, bonusPosition);

  const rows: ShiftRow[] = [];
  for (const pos of positions) {
    if (input.onlyPositionId && pos.id !== input.onlyPositionId) continue;
    const label = positionLabel(pos, input.deptName);
    const posRows = buildEmployeeShiftRows({
      isTips: pos.wage_type === "tips",
      rate: Number(pos.hourly_rate) || 0,
      attendance: attendanceByPos.get(pos.id) ?? [],
      tips: tipsByPos.get(pos.id) ?? [],
      bonuses: bonusesByPos.get(pos.id) ?? [],
      templates: input.templates,
    });
    for (const r of posRows) {
      rows.push({
        ...r,
        id: multi ? `${pos.id}:${r.id}` : r.id,
        title: multi ? `${label} · ${r.title}` : r.title,
        positionId: pos.id,
        positionLabel: label,
      });
    }
  }
  return rows.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function sumShiftRowTotals(rows: ShiftRow[]): ShiftRowTotals {
  const hours = rows.reduce((s, r) => s + r.hours, 0);
  const earned = rows.reduce((s, r) => s + r.earned, 0);
  const tips = rows.reduce((s, r) => s + (r.tipAmount ?? 0), 0);
  const topup = rows.reduce((s, r) => s + (r.topup ?? 0), 0);
  const bonus = rows.reduce((s, r) => s + (r.bonusAmount ?? 0), 0);
  return { hours, earned, tips, topup, bonus, count: rows.length, avg: hours > 0 ? earned / hours : 0 };
}
