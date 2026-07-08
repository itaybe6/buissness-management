import type { ShiftReportParticipant } from "@/types/database";
import type { PayrollAttendance, PayrollTip } from "@/lib/payrollCompute";

export const REPORT_DATE = "2026-07-08";
export const BUSINESS_ID = "biz-1";

export const EMP = {
  alice: "emp-alice",
  bob: "emp-bob",
  carol: "emp-carol",
  dave: "emp-dave",
  eve: "emp-eve",
} as const;

/** A tip-report participant with the hours used for the split. */
export function participant(employeeId: string, hours: number): ShiftReportParticipant {
  return { employee_id: employeeId, hours, attendance_hours: hours };
}

/** A single tip row as stored in the `tips` table / fed into payroll. */
export function tip(hours: number, amount: number, hourlyFromTips: number): PayrollTip {
  return { hours, amount, hourly_from_tips: hourlyFromTips };
}

/**
 * Build the tip row an employee receives from a shift, given the shared per-hour
 * tip rate — mirrors how `distributeTips` fills the `tips` table (amount and
 * hourly rounded to agorot).
 */
export function tipFromShift(hours: number, tipsHourly: number): PayrollTip {
  return {
    hours,
    amount: Math.round(tipsHourly * hours * 100) / 100,
    hourly_from_tips: Math.round(tipsHourly * 100) / 100,
  };
}

let attSeq = 0;

/** Attendance punch on REPORT_DATE from startHour to endHour (local time, decimals allowed). */
export function punch(
  employeeId: string,
  startHour: number,
  endHour: number,
  date = REPORT_DATE,
): PayrollAttendance {
  const toISO = (h: number) => {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date}T${pad(hh)}:${pad(mm)}:00`;
  };
  attSeq += 1;
  return { employee_id: employeeId, clock_in: toISO(startHour), clock_out: toISO(endHour) };
}

/** An open punch (clocked in, never clocked out) — should not count toward hours. */
export function openPunch(employeeId: string, startHour: number, date = REPORT_DATE): PayrollAttendance {
  const pad = (n: number) => String(n).padStart(2, "0");
  return { employee_id: employeeId, clock_in: `${date}T${pad(startHour)}:00:00`, clock_out: null };
}
