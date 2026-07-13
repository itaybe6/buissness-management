import * as XLSX from "xlsx";
import type { WageType } from "@/types/database";
import type { PayrollAttendance } from "@/lib/payrollCompute";

export interface PayrollExportRow {
  name: string | null;
  hours: number;
  shifts: number;
  rate: number;
  total: number;
  pensionActive: boolean;
}

/** Count worked shifts: tips rows for tips employees, attendance punches for hourly. */
export function countEmployeeShifts(
  wageType: WageType,
  employeeId: string,
  attendance: PayrollAttendance[],
  tips: { employee_id: string }[],
): number {
  if (wageType === "tips") {
    return tips.filter((t) => t.employee_id === employeeId).length;
  }
  return attendance.filter((a) => a.employee_id === employeeId && a.clock_in && a.clock_out).length;
}

export function exportPayrollExcel(rows: PayrollExportRow[], month: string) {
  const sheetRows = rows.map((r) => ({
    שם: r.name ?? "",
    "כמות שעות": Math.round(r.hours * 10) / 10,
    "כמות משמרות": r.shifts,
    "שכר שעתי": r.rate,
    "שכר סופי": Math.round(r.total * 100) / 100,
    פנסיה: r.pensionActive ? "פעילה" : "לא פעילה",
  }));

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "משכורות");
  XLSX.writeFile(wb, `משכורות-${month}.xlsx`);
}
