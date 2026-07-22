import * as XLSX from "xlsx";
import type { WageType } from "@/types/database";
import type { PayrollAttendance } from "@/lib/payrollCompute";

export interface PayrollExportRow {
  name: string | null;
  wageType: WageType;
  wageTypeLabel: string;
  hours: number;
  shifts: number;
  rate: number;
  /** Hourly base pay, or tips amount for tips employees. */
  baseOrTips: number;
  topup: number;
  bonus: number;
  monthlyBonus: number;
  advance: number;
  differences: number;
  grossPay: number;
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
    סוג: r.wageTypeLabel,
    "כמות שעות": Math.round(r.hours * 10) / 10,
    "כמות משמרות": r.shifts,
    "שכר שעתי": r.rate,
    "בסיס / טיפים": Math.round(r.baseOrTips * 100) / 100,
    השלמה: Math.round(r.topup * 100) / 100,
    "תוספת קופה": Math.round(r.bonus * 100) / 100,
    "בונוס חודשי": Math.round(r.monthlyBonus * 100) / 100,
    מפרעה: Math.round(r.advance * 100) / 100,
    הפרשים: Math.round(r.differences * 100) / 100,
    "שכר לפני התאמות": Math.round(r.grossPay * 100) / 100,
    "שכר סופי": Math.round(r.total * 100) / 100,
    פנסיה: r.pensionActive ? "פעילה" : "לא פעילה",
  }));

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  ws["!cols"] = [
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  // First data column (שם) appears on the right in Excel.
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "משכורות");
  XLSX.writeFile(wb, `משכורות-${month}.xlsx`);
}
