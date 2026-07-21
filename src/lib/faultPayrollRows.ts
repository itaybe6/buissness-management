import type { Fault } from "@/types/database";
import type { ShiftRow } from "@/lib/payrollShiftRows";
import { shiftFullDateLabel } from "@/lib/payrollShiftRows";

/** Sum approved fault work payments for one employee. */
export function sumFaultPayAmount(faults: Fault[], employeeId: string): number {
  return faults
    .filter((f) => f.pay_employee_id === employeeId && f.pay_approval_status === "approved")
    .reduce((s, f) => s + (Number(f.work_price) || 0), 0);
}

/** Build shift-style rows from approved fault payments (maintenance per-job pay). */
export function buildFaultPayRows(faults: Fault[]): ShiftRow[] {
  return faults
    .filter((f) => f.pay_approval_status === "approved" && f.pay_approved_at && f.work_price != null)
    .map((f) => {
      const date = new Date(f.pay_approved_at!);
      const amount = Number(f.work_price) || 0;
      const title = f.description.length > 48 ? `${f.description.slice(0, 48)}…` : f.description;
      return {
        id: `fault-${f.id}`,
        date,
        title: `תקלה: ${title}`,
        timeLabel: null,
        hours: 0,
        hourly: 0,
        earned: amount,
        isTips: false,
        bonusAmount: 0,
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function faultPayMonthLabel(fault: Fault): string {
  if (!fault.pay_approved_at) return "";
  return shiftFullDateLabel(new Date(fault.pay_approved_at));
}
