import type { Profile, ShiftReportParticipant } from "@/types/database";

export interface ShiftPayRow {
  employee_id: string;
  name: string;
  hours: number;
  work_start?: string | null;
  work_end?: string | null;
  onTips: boolean;
  /** Effective rate for the shift — for tips employees max(tip rate, their minimum). */
  hourly: number;
  /** What this shift is worth to them. */
  amount: number;
  /** Raw tip share before the minimum floor (tips employees only). */
  fromTips: number;
  /** Employer top-up when the tip rate fell below their guaranteed minimum. */
  topup: number;
  /** Hourly employee with no rate on their profile — pay can't be shown. */
  rateMissing: boolean;
}

/**
 * Build one pay row per employee who worked the shift.
 *
 * Tips employees are paid from the pool (`total_tips ÷ total tip hours × their
 * hours`), but every shift is floored at their own `hourly_rate`, so the row
 * carries the guaranteed amount and surfaces the top-up when the floor bites —
 * matching `computeEmployeePayroll` in ./payrollCompute.
 *
 * Hourly employees are simply `hours × hourly_rate`; tips are ignored for them.
 */
export function buildShiftPayRows({
  team,
  tipByEmployee,
  profileById,
  userName,
  tipsHourly,
}: {
  team: ShiftReportParticipant[];
  tipByEmployee: Map<string, { amount: number; hourly_from_tips: number }>;
  profileById: Map<string, Profile>;
  userName: (id: string) => string;
  tipsHourly: number;
}): ShiftPayRow[] {
  return team
    .filter((p) => p.employee_id)
    .map((p) => {
      const prof = profileById.get(p.employee_id);
      const tip = tipByEmployee.get(p.employee_id);
      const onTips = !!tip || (prof?.wage_type ?? "hourly") === "tips";
      const hours = Number(p.hours) || 0;
      const rate = Number(prof?.hourly_rate ?? 0);
      const base = {
        employee_id: p.employee_id,
        name: userName(p.employee_id),
        hours,
        work_start: p.work_start,
        work_end: p.work_end,
      };

      if (onTips) {
        const tipRate = tip?.hourly_from_tips ?? tipsHourly;
        const fromTips = tip?.amount ?? tipRate * hours;
        const hourly = Math.max(tipRate, rate);
        const amount = hours * hourly;
        return {
          ...base,
          onTips: true,
          hourly,
          amount,
          fromTips,
          topup: Math.max(0, amount - fromTips),
          rateMissing: false,
        };
      }

      return {
        ...base,
        onTips: false,
        hourly: rate,
        amount: hours * rate,
        fromTips: 0,
        topup: 0,
        rateMissing: rate <= 0,
      };
    });
}
