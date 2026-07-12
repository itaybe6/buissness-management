import type { Attendance, Profile, ShiftBonus, ShiftTemplate, Tip } from "@/types/database";
import { buildEmployeeShiftRows, type ShiftRow } from "@/lib/payrollShiftRows";

/** Employer-facing labor cost for one calendar day (excludes customer-paid tips). */
export interface DayLaborCost {
  date: string;
  hours: number;
  hourly: number;
  topup: number;
  bonus: number;
  total: number;
}

export interface LaborCostSlice {
  label: string;
  hourly: number;
  topup: number;
  bonus: number;
  total: number;
  highlight?: boolean;
}

function localDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rowDateISO(row: ShiftRow): string {
  return localDateISO(row.date);
}

/** Split one shift row into employer cost buckets. Tips pool is excluded; only top-up + salary + bonus. */
export function employerCostFromRow(row: ShiftRow): Pick<DayLaborCost, "hours" | "hourly" | "topup" | "bonus"> {
  const bonus = row.bonusAmount ?? 0;
  const hours = row.hours;
  if (row.isTips) {
    return { hours, hourly: 0, topup: row.topup ?? 0, bonus };
  }
  return { hours, hourly: row.earned - bonus, topup: 0, bonus };
}

function addToDay(map: Map<string, DayLaborCost>, date: string, part: Pick<DayLaborCost, "hours" | "hourly" | "topup" | "bonus">) {
  const prev = map.get(date) ?? { date, hours: 0, hourly: 0, topup: 0, bonus: 0, total: 0 };
  prev.hours += part.hours;
  prev.hourly += part.hourly;
  prev.topup += part.topup;
  prev.bonus += part.bonus;
  prev.total = prev.hourly + prev.topup + prev.bonus;
  map.set(date, prev);
}

/** Aggregate employer labor costs per calendar day for active payroll employees. */
export function aggregateDailyLaborCosts(input: {
  profiles: Profile[];
  attendance: Attendance[];
  tips: Tip[];
  bonuses: ShiftBonus[];
  templates: ShiftTemplate[];
}): DayLaborCost[] {
  const { profiles, attendance, tips, bonuses, templates } = input;
  const byDate = new Map<string, DayLaborCost>();

  const employees = profiles.filter(
    (p) => p.active && p.role !== "super_admin" && p.role !== "shift_manager",
  );

  for (const emp of employees) {
    const rate = Number(emp.hourly_rate ?? 0);
    const isTips = (emp.wage_type ?? "hourly") === "tips";
    const rows = buildEmployeeShiftRows({
      isTips,
      rate,
      attendance: attendance.filter((a) => a.employee_id === emp.id),
      tips: tips.filter((t) => t.employee_id === emp.id),
      bonuses: bonuses.filter((b) => b.employee_id === emp.id),
      templates,
    });

    for (const row of rows) {
      addToDay(byDate, rowDateISO(row), employerCostFromRow(row));
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function sumLaborCosts(days: DayLaborCost[]): Omit<DayLaborCost, "date"> {
  return days.reduce(
    (acc, d) => ({
      hours: acc.hours + d.hours,
      hourly: acc.hourly + d.hourly,
      topup: acc.topup + d.topup,
      bonus: acc.bonus + d.bonus,
      total: acc.total + d.total,
    }),
    { hours: 0, hourly: 0, topup: 0, bonus: 0, total: 0 },
  );
}

/** Sunday-start week key (Israel). */
export function weekStartISO(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - d.getDay());
  return localDateISO(sunday);
}

export function aggregateByWeek(days: DayLaborCost[]): LaborCostSlice[] {
  const map = new Map<string, LaborCostSlice>();
  for (const d of days) {
    const key = weekStartISO(d.date);
    const prev = map.get(key) ?? { label: "", hourly: 0, topup: 0, bonus: 0, total: 0 };
    prev.hourly += d.hourly;
    prev.topup += d.topup;
    prev.bonus += d.bonus;
    prev.total += d.total;
    map.set(key, prev);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, slice]) => {
      const start = new Date(key + "T12:00:00");
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const fmt = (dt: Date) =>
        dt.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
      return { ...slice, label: `${fmt(start)}–${fmt(end)}` };
    });
}

const HE_MONTHS_SHORT = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];

export function monthKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function aggregateByMonth(monthKeys: string[], daysByMonth: Map<string, DayLaborCost[]>): LaborCostSlice[] {
  return monthKeys.map((mk) => {
    const days = daysByMonth.get(mk) ?? [];
    const sum = sumLaborCosts(days);
    const [, mo] = mk.split("-").map(Number);
    const y = mk.slice(0, 4);
    return {
      label: `${HE_MONTHS_SHORT[mo - 1]} ${y.slice(2)}`,
      ...sum,
    };
  });
}

/** Fill missing days in a month with zero rows (for chart continuity). */
export function fillMonthDays(days: DayLaborCost[], monthISO: string, upToDay?: number): DayLaborCost[] {
  const [y, mo] = monthISO.split("-").map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const limit = upToDay ?? daysInMonth;
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: DayLaborCost[] = [];
  for (let day = 1; day <= limit; day++) {
    const date = `${monthISO}-${String(day).padStart(2, "0")}`;
    out.push(byDate.get(date) ?? { date, hours: 0, hourly: 0, topup: 0, bonus: 0, total: 0 });
  }
  return out;
}
