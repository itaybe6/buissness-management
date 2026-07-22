import type { WageType } from "@/types/database";

/** Attendance-like row: only clock_in/clock_out matter for hour totals. */
export interface PayrollAttendance {
  employee_id: string;
  clock_in: string | null;
  clock_out: string | null;
}

/** A tip row as it flows from the `tips` table into payroll. */
export interface PayrollTip {
  hours: number | null;
  amount: number;
  /** Per-hour tip rate for that shift (amount / hours). */
  hourly_from_tips: number | null;
}

/** One employee's computed pay for the month. */
export interface PayrollRow {
  wageType: WageType;
  rate: number;
  hours: number;
  /** Hourly: hours × rate. Tips: the sum of tips received (same as `tips`). */
  base: number;
  /** Tips received from the pool (0 for hourly employees). */
  tips: number;
  /** Employer top-up added to reach the per-shift minimum wage (השלמה). */
  topup: number;
  /** Kupah-percentage bonus total. */
  bonus: number;
  /** Approved maintenance work on faults (per-job pay). */
  faultPay: number;
  /** Pay from hours/tips/bonuses/faults before monthly manual adjustments. */
  grossPay: number;
  /** Manual cumulative monthly bonus (office). */
  monthlyBonus: number;
  /** Advance paid mid-month (deducted from net). */
  advance: number;
  /** Manual difference (+ adds, − deducts). */
  differences: number;
  /** Net total paid to the employee. */
  total: number;
}

export interface PayrollAdjustmentsInput {
  monthlyBonus?: number;
  advance?: number;
  differences?: number;
}

/** Apply office monthly fields: net = gross + monthlyBonus + differences − advance. */
export function withPayrollAdjustments(
  row: PayrollRow,
  adj?: PayrollAdjustmentsInput,
): PayrollRow {
  const monthlyBonus = Number(adj?.monthlyBonus) || 0;
  const advance = Math.max(0, Number(adj?.advance) || 0);
  const differences = Number(adj?.differences) || 0;
  const grossPay = row.grossPay;
  return {
    ...row,
    monthlyBonus,
    advance,
    differences,
    total: grossPay + monthlyBonus + differences - advance,
  };
}

function finalizePayrollRow(row: Omit<PayrollRow, "grossPay" | "monthlyBonus" | "advance" | "differences" | "total"> & { total: number }): PayrollRow {
  const grossPay = row.total;
  return {
    ...row,
    grossPay,
    monthlyBonus: 0,
    advance: 0,
    differences: 0,
    total: grossPay,
  };
}

/**
 * Sum worked hours from attendance rows for one employee. Only punches with both
 * a clock-in and clock-out count; each contributes (out − in) in hours.
 */
export function sumAttendanceHours(
  attendance: PayrollAttendance[],
  employeeId: string,
): number {
  return attendance
    .filter((a) => a.employee_id === employeeId && a.clock_in && a.clock_out)
    .reduce(
      (sum, a) =>
        sum + (new Date(a.clock_out!).getTime() - new Date(a.clock_in!).getTime()) / 3.6e6,
      0,
    );
}

/**
 * Compute one employee's monthly pay.
 *
 * Hourly employees: pay = worked hours × rate, plus any kupah bonus. No tips.
 *
 * Tips employees: pay comes from the tip pool, but every shift is floored at the
 * employee's own hourly rate. For each shift the guaranteed pay is
 * `hours × max(hourly_from_tips, rate)` — i.e. the better of "the tips earned
 * that shift" and "the hourly minimum for that shift". The employer top-up
 * (השלמה) is the gap between that guaranteed amount and the tips actually
 * received. Because the floor is applied per shift, a strong tip shift does NOT
 * subsidise a weak one — each weak shift is topped up on its own.
 */
export function computeEmployeePayroll(input: {
  wageType: WageType;
  rate: number;
  tips: PayrollTip[];
  bonusSum: number;
  attendanceHours: number;
  faultPaySum?: number;
}): PayrollRow {
  const rate = Number(input.rate) || 0;
  const bonus = Number(input.bonusSum) || 0;
  const faultPay = Number(input.faultPaySum) || 0;

  if (input.wageType === "tips") {
    const hours = input.tips.reduce((s, t) => s + (Number(t.hours) || 0), 0);
    const tipSum = input.tips.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const guaranteed = input.tips.reduce((s, t) => {
      const h = Number(t.hours) || 0;
      return s + h * Math.max(Number(t.hourly_from_tips) || 0, rate);
    }, 0);
    const topup = Math.max(0, guaranteed - tipSum);
    return finalizePayrollRow({
      wageType: "tips",
      rate,
      hours,
      base: tipSum,
      tips: tipSum,
      topup,
      bonus,
      faultPay,
      total: guaranteed + bonus + faultPay,
    });
  }

  const hours = Number(input.attendanceHours) || 0;
  const base = hours * rate;
  return finalizePayrollRow({
    wageType: "hourly",
    rate,
    hours,
    base,
    tips: 0,
    topup: 0,
    bonus,
    faultPay,
    total: base + bonus + faultPay,
  });
}
