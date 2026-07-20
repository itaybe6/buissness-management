import { addDays, todayISO } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { Attendance } from "@/types/database";

/** Only auto clock-out when the report is for today or yesterday (end-of-shift flow). */
export function shouldClockOutOpenShiftsOnReportSave(reportDate: string, today = todayISO()): boolean {
  const earliest = addDays(today, -1);
  return reportDate >= earliest && reportDate <= today;
}

/** Open punches to close when saving a shift report for `reportDate`. */
export function selectOpenAttendanceToClockOut(records: Attendance[], reportDate: string): Attendance[] {
  const fetchStart = `${addDays(reportDate, -1)}T00:00:00`;
  const fetchStartMs = new Date(fetchStart).getTime();
  return records.filter(
    (a) => a.clock_in && !a.clock_out && new Date(a.clock_in).getTime() >= fetchStartMs,
  );
}

/**
 * Closes all open attendance rows for the business that belong to the reported shift window.
 * Called after a shift report is saved at end of shift.
 */
export async function clockOutOpenShiftsForShiftReport(
  businessId: string,
  reportDate: string,
): Promise<number> {
  if (!shouldClockOutOpenShiftsOnReportSave(reportDate)) return 0;

  const start = `${addDays(reportDate, -1)}T00:00:00`;
  const end = `${addDays(reportDate, 2)}T00:00:00`;
  const { data, error } = await supabase
    .from("attendance")
    .select("id, clock_in, clock_out, employee_id")
    .eq("business_id", businessId)
    .is("clock_out", null)
    .not("clock_in", "is", null)
    .gte("clock_in", start)
    .lt("clock_in", end);
  if (error) throw error;

  const toClose = selectOpenAttendanceToClockOut((data ?? []) as Attendance[], reportDate);
  if (toClose.length === 0) return 0;

  const clockOut = new Date().toISOString();
  const ids = toClose.map((a) => a.id);
  const { error: updateError } = await supabase.from("attendance").update({ clock_out: clockOut }).in("id", ids);
  if (updateError) throw updateError;
  return ids.length;
}
