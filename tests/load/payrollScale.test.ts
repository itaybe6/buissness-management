/**
 * בדיקות עומס — שכר של עסק גדול.
 *
 * התרחיש: 300 עובדים, חודש מלא, כ-6,000 החתמות שעון, 4,000 שורות טיפים
 * ו-1,200 תוספות קופה. הבדיקות מוודאות שהמספרים נכונים בהיקף הזה ושהחישוב
 * לא מתפוצץ בזמן — כי מסך השכר מחשב הכול בדפדפן של מנהלת המשרד.
 */
import { describe, expect, it } from "vitest";
import { computeEmployeePayroll, sumAttendanceHours, withPayrollAdjustments } from "@/lib/payrollCompute";
import { aggregateDailyLaborCosts, sumLaborCosts } from "@/lib/payrollDailyCost";
import { buildEmployeeShiftRows, sumShiftRowTotals } from "@/lib/payrollShiftRows";
import { countEmployeeShifts } from "@/lib/payrollExport";
import { assertScalesLinearly, assertWithinBudget, measureBest } from "../helpers/perf";
import { TPL, hourlyEmployee, makeAttendance, makeShiftBonus, makeTip, shiftTemplates, tipsEmployee } from "../helpers/factories";
import type { Attendance, Profile, ShiftBonus, Tip } from "@/types/database";

const EMPLOYEE_COUNT = 300;
const DAYS_IN_MONTH = 31;
/** כמה משמרות בחודש לעובד ממוצע. */
const SHIFTS_PER_EMPLOYEE = 20;

interface Dataset {
  profiles: Profile[];
  attendance: Attendance[];
  tips: Tip[];
  bonuses: ShiftBonus[];
}

/**
 * בונה עסק סינתטי: מחצית מהעובדים שעתיים ומחצית טיפים, כל אחד עם
 * `shiftsPerEmployee` משמרות פרוסות על החודש.
 */
function buildBusiness(employeeCount: number, shiftsPerEmployee = SHIFTS_PER_EMPLOYEE): Dataset {
  const profiles: Profile[] = [];
  const attendance: Attendance[] = [];
  const tips: Tip[] = [];
  const bonuses: ShiftBonus[] = [];

  for (let i = 0; i < employeeCount; i++) {
    const id = `emp-${i}`;
    const isTips = i % 2 === 1;
    profiles.push(isTips ? tipsEmployee(id, 35.4) : hourlyEmployee(id, 40 + (i % 20)));

    for (let s = 0; s < shiftsPerEmployee; s++) {
      const day = ((i + s * 3) % DAYS_IN_MONTH) + 1;
      const date = `2026-07-${String(day).padStart(2, "0")}`;

      attendance.push(makeAttendance({ employeeId: id, date, from: 8 + (s % 3) * 4, to: 8 + (s % 3) * 4 + 8 }));

      if (isTips) {
        // כל משמרת שלישית נופלת מתחת למינימום ודורשת השלמה
        const hourlyFromTips = s % 3 === 0 ? 20 : 60;
        tips.push(
          makeTip({
            employee_id: id,
            shift_date: date,
            shift_template_id: TPL.evening,
            hours: 8,
            amount: hourlyFromTips * 8,
            hourly_from_tips: hourlyFromTips,
          }),
        );
      }

      if (s % 5 === 0) {
        bonuses.push(
          makeShiftBonus({ employee_id: id, shift_date: date, shift_template_id: TPL.evening, amount: 50 }),
        );
      }
    }
  }

  return { profiles, attendance, tips, bonuses };
}

const data = buildBusiness(EMPLOYEE_COUNT);

describe("היקף הנתונים שנבדק", () => {
  it("הנתונים אכן בסדר גודל של עסק גדול", () => {
    expect(data.profiles).toHaveLength(EMPLOYEE_COUNT);
    expect(data.attendance.length).toBe(EMPLOYEE_COUNT * SHIFTS_PER_EMPLOYEE);
    expect(data.tips.length).toBe((EMPLOYEE_COUNT / 2) * SHIFTS_PER_EMPLOYEE);
    expect(data.bonuses.length).toBe(EMPLOYEE_COUNT * (SHIFTS_PER_EMPLOYEE / 5));
  });
});

describe("חישוב שכר חודשי לכל העסק", () => {
  /** מריץ את המסלול המלא של מסך השכר: לכל עובד — שעות, טיפים, בונוס והתאמות. */
  function runPayroll(input: Dataset) {
    const tipsByEmployee = new Map<string, Tip[]>();
    for (const t of input.tips) {
      const list = tipsByEmployee.get(t.employee_id) ?? [];
      list.push(t);
      tipsByEmployee.set(t.employee_id, list);
    }
    const bonusByEmployee = new Map<string, number>();
    for (const b of input.bonuses) {
      bonusByEmployee.set(b.employee_id, (bonusByEmployee.get(b.employee_id) ?? 0) + Number(b.amount));
    }

    return input.profiles.map((p) =>
      withPayrollAdjustments(
        computeEmployeePayroll({
          wageType: p.wage_type,
          rate: Number(p.hourly_rate ?? 0),
          tips: (tipsByEmployee.get(p.id) ?? []).map((t) => ({
            hours: t.hours,
            amount: t.amount,
            hourly_from_tips: t.hourly_from_tips,
          })),
          bonusSum: bonusByEmployee.get(p.id) ?? 0,
          attendanceHours: p.wage_type === "tips" ? 0 : sumAttendanceHours(input.attendance, p.id),
        }),
        { monthlyBonus: 0, advance: 0, differences: 0 },
      ),
    );
  }

  it("מחזיר שורה לכל עובד, בלי NaN ובלי שכר שלילי", () => {
    const { result: rows, ms } = measureBest(() => runPayroll(data));
    assertWithinBudget("חישוב שכר ל-300 עובדים", ms, 1500); // נמדד ~10ms

    expect(rows).toHaveLength(EMPLOYEE_COUNT);
    for (const row of rows) {
      expect(Number.isFinite(row.total)).toBe(true);
      expect(row.total).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(row.hours)).toBe(true);
    }
  });

  it("עובד שעתי מקבל בדיוק שעות × תעריף + בונוס", () => {
    const rows = runPayroll(data);
    const hourly = data.profiles.find((p) => p.wage_type === "hourly")!;
    const row = rows[data.profiles.indexOf(hourly)];
    const expectedHours = SHIFTS_PER_EMPLOYEE * 8;
    expect(row.hours).toBe(expectedHours);
    expect(row.base).toBe(expectedHours * Number(hourly.hourly_rate));
    expect(row.total).toBe(row.base + row.bonus);
  });

  it("כל עובדי הטיפים מקבלים השלמה — שליש מהמשמרות מתחת למינימום", () => {
    const rows = runPayroll(data);
    const tipsRows = rows.filter((r) => r.wageType === "tips");
    expect(tipsRows.length).toBe(EMPLOYEE_COUNT / 2);
    for (const row of tipsRows) {
      expect(row.topup).toBeGreaterThan(0);
      expect(row.total).toBeGreaterThanOrEqual(row.tips);
    }
  });

  it("סך השכר של העסק יציב בין הרצות (חישוב דטרמיניסטי)", () => {
    const first = runPayroll(data).reduce((s, r) => s + r.total, 0);
    const second = runPayroll(data).reduce((s, r) => s + r.total, 0);
    expect(second).toBe(first);
  });

  it("הזמן גדל ליניארית עם מספר העובדים ולא בריבוע", () => {
    const small = buildBusiness(75);
    const large = buildBusiness(300);
    const smallMs = measureBest(() => runPayroll(small)).ms;
    const largeMs = measureBest(() => runPayroll(large)).ms;
    assertScalesLinearly({
      label: "חישוב שכר",
      smallMs,
      largeMs,
      ratio: 4,
      maxGrowthFactor: 40, // סף רחב: מזהה קפיצה ריבועית אמיתית, לא רעש
    });
  });
});

describe("ספירת משמרות לייצוא", () => {
  it("סופרת נכון לכל עובד בהיקף מלא", () => {
    const { ms } = measureBest(() =>
      data.profiles.map((p) => countEmployeeShifts(p.wage_type, p.id, data.attendance, data.tips)),
    );
    assertWithinBudget("ספירת משמרות ל-300 עובדים", ms, 1500); // נמדד ~8ms

    const hourly = data.profiles.find((p) => p.wage_type === "hourly")!;
    expect(countEmployeeShifts("hourly", hourly.id, data.attendance, data.tips)).toBe(SHIFTS_PER_EMPLOYEE);
  });
});

describe("שורות המשמרות של עובד בודד בתוך עסק גדול", () => {
  it("בונה את כל שורות החודש ומסכם אותן", () => {
    const emp = data.profiles.find((p) => p.wage_type === "tips")!;
    const { result: rows, ms } = measureBest(() =>
      buildEmployeeShiftRows({
        isTips: true,
        rate: Number(emp.hourly_rate),
        attendance: data.attendance.filter((a) => a.employee_id === emp.id),
        tips: data.tips.filter((t) => t.employee_id === emp.id),
        bonuses: data.bonuses.filter((b) => b.employee_id === emp.id),
        templates: shiftTemplates,
      }),
    );
    assertWithinBudget("שורות משמרת לעובד בודד", ms, 500);

    expect(rows.length).toBeGreaterThanOrEqual(SHIFTS_PER_EMPLOYEE);
    const totals = sumShiftRowTotals(rows);
    expect(totals.hours).toBe(SHIFTS_PER_EMPLOYEE * 8);
    expect(totals.bonus).toBeGreaterThan(0);
  });

  it("השורות ממוינות מהחדש לישן גם עם מאות שורות", () => {
    const emp = data.profiles[0];
    const rows = buildEmployeeShiftRows({
      isTips: false,
      rate: 40,
      attendance: data.attendance.filter((a) => a.employee_id === emp.id),
      tips: [],
      bonuses: data.bonuses.filter((b) => b.employee_id === emp.id),
      templates: shiftTemplates,
    });
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].date.getTime()).toBeGreaterThanOrEqual(rows[i].date.getTime());
    }
  });
});

describe("עלות מעסיק יומית בהיקף מלא", () => {
  it("מייצר שורה לכל יום בחודש ומסכם נכון", () => {
    const { result: days, ms } = measureBest(
      () =>
        aggregateDailyLaborCosts({
          profiles: data.profiles,
          attendance: data.attendance,
          tips: data.tips,
          bonuses: data.bonuses,
          templates: shiftTemplates,
        }),
      1,
    );
    // נמדד ~256ms. הפונקציה מסננת את כל מערכי הנוכחות/טיפים/בונוסים מחדש לכל
    // עובד, כך שהעלות היא O(עובדים × שורות). בהיקף הנוכחי זה סביר, אבל התקציב
    // כאן נועד לתפוס הרעה של פי 10 לפני שהיא מגיעה לדפדפן של מנהלת המשרד.
    assertWithinBudget("צבירת עלות יומית ל-300 עובדים", ms, 3000);

    expect(days.length).toBe(DAYS_IN_MONTH);
    expect(days.map((d) => d.date)).toEqual([...days.map((d) => d.date)].sort());

    const totals = sumLaborCosts(days);
    expect(totals.total).toBeGreaterThan(0);
    expect(Number.isFinite(totals.total)).toBe(true);
    expect(totals.topup).toBeGreaterThan(0);
    expect(totals.bonus).toBeGreaterThan(0);
  });
});
