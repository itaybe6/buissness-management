/**
 * בדיקות עומס — שעון נוכחות של עסק גדול.
 *
 * מסך הנוכחות טוען חודש שלם של החתמות (כ-9,000 שורות ל-300 עובדים), מקבץ
 * לפי עובד ומחלקה, ומסנן לפי המשמרת של היום. כל זה קורה בדפדפן, ולכן
 * נבדק כאן גם הזמן וגם שהתוצאה נשארת נכונה בהיקף הזה.
 */
import { describe, expect, it } from "vitest";
import {
  filterAttendanceForTodayShift,
  filterAttendanceNearReportDate,
  filterEmployeeAttendanceGroups,
  getAttendanceHoursInShiftWindow,
  groupAttendanceByDepartment,
  groupAttendanceByEmployee,
  shiftWindowForDate,
} from "@/lib/attendanceFeed";
import { buildTeamMembersFromShift, distributeTips } from "@/lib/shiftReportTips";
import { assertScalesLinearly, assertWithinBudget, measureBest } from "../helpers/perf";
import {
  DEPT,
  TPL,
  makeAssignment,
  makeAttendance,
  makeOpenAttendance,
  shiftTemplates,
} from "../helpers/factories";
import type { Attendance, ShiftAssignment } from "@/types/database";

const EMPLOYEE_COUNT = 300;
const DAYS = 31;
const TODAY = "2026-07-08";
const evening = shiftTemplates.find((t) => t.id === TPL.evening)!;
const DEPARTMENTS = [
  { id: DEPT.bar, name: "בר", color: "#7c3aed", sort_order: 0 },
  { id: DEPT.kitchen, name: "מטבח", color: "#16a34a", sort_order: 1 },
  { id: DEPT.service, name: "שירות", color: "#2563eb", sort_order: 2 },
];

function buildMonth(employeeCount: number): Attendance[] {
  const rows: Attendance[] = [];
  for (let i = 0; i < employeeCount; i++) {
    const id = `emp-${i}`;
    for (let d = 1; d <= DAYS; d++) {
      if ((i + d) % 3 === 0) continue; // לא כל עובד עובד כל יום
      const date = `2026-07-${String(d).padStart(2, "0")}`;
      const morning = (i + d) % 2 === 0;
      rows.push(makeAttendance({ employeeId: id, date, from: morning ? 8 : 18, to: morning ? 16 : 23 }));
    }
  }
  return rows;
}

const month = buildMonth(EMPLOYEE_COUNT);

const employeeInfo = new Map(
  Array.from({ length: EMPLOYEE_COUNT }, (_, i) => [
    `emp-${i}`,
    {
      departmentId: i % 10 === 0 ? null : DEPARTMENTS[i % DEPARTMENTS.length].id,
      role: i % 25 === 0 ? "shift_manager" : "employee",
    },
  ]),
);

describe("היקף נתוני הנוכחות", () => {
  it("החודש מכיל אלפי החתמות", () => {
    expect(month.length).toBeGreaterThan(6000);
  });
});

describe("קיבוץ נוכחות לתצוגה בהיקף מלא", () => {
  it("מקבץ את כל החודש לכרטיס אחד לעובד", () => {
    const { result: groups, ms } = measureBest(() => groupAttendanceByEmployee(month));
    assertWithinBudget("קיבוץ 9,000 החתמות ל-300 עובדים", ms, 2000);

    expect(groups).toHaveLength(EMPLOYEE_COUNT);
    const totalSessions = groups.reduce((s, g) => s + g.sessions.length, 0);
    expect(totalSessions).toBe(month.length);
  });

  it("כל הסשנים בתוך כרטיס ממוינים כרונולוגית", () => {
    const groups = groupAttendanceByEmployee(month);
    for (const g of groups) {
      for (let i = 1; i < g.sessions.length; i++) {
        expect(new Date(g.sessions[i - 1].clockIn).getTime()).toBeLessThanOrEqual(
          new Date(g.sessions[i].clockIn).getTime(),
        );
      }
    }
  });

  it("עובדים במשמרת פתוחה עולים לראש הרשימה", () => {
    const withOpen = [...month, makeOpenAttendance("emp-299", TODAY, 18), makeOpenAttendance("emp-5", TODAY, 19)];
    const groups = groupAttendanceByEmployee(withOpen);
    expect(groups[0].onShift).toBe(true);
    expect(groups[1].onShift).toBe(true);
    expect(groups[2].onShift).toBe(false);
    expect(filterEmployeeAttendanceGroups(groups, "on_shift")).toHaveLength(2);
  });

  it("קיבוץ למחלקות שומר על כל העובדים בלי לאבד אף אחד", () => {
    const groups = groupAttendanceByEmployee(month);
    const { result: sections, ms } = measureBest(() =>
      groupAttendanceByDepartment(groups, DEPARTMENTS, employeeInfo),
    );
    assertWithinBudget("קיבוץ 300 עובדים ל-3 מחלקות", ms, 1000);

    const total = sections.reduce((s, sec) => s + sec.groups.length, 0);
    expect(total).toBe(EMPLOYEE_COUNT);
    expect(sections.some((s) => s.key === "role:shift_manager")).toBe(true);
    expect(sections.some((s) => s.key === "none")).toBe(true);
  });

  it("הזמן גדל ליניארית עם מספר ההחתמות", () => {
    const small = buildMonth(75);
    const large = buildMonth(300);
    const smallMs = measureBest(() => groupAttendanceByEmployee(small)).ms;
    const largeMs = measureBest(() => groupAttendanceByEmployee(large)).ms;
    assertScalesLinearly({ label: "קיבוץ נוכחות", smallMs, largeMs, ratio: 4, maxGrowthFactor: 20 });
  });
});

describe("סינון לפי משמרת היום בהיקף מלא", () => {
  const assignments: ShiftAssignment[] = Array.from({ length: EMPLOYEE_COUNT }, (_, i) =>
    makeAssignment({ employee_id: `emp-${i}`, shift_date: TODAY, shift_template_id: TPL.evening }),
  );

  it("משאיר רק את מי שהחתים בתוך משמרת הערב", () => {
    const { result: filtered, ms } = measureBest(() =>
      filterAttendanceForTodayShift({
        records: month,
        today: TODAY,
        assignments,
        templates: shiftTemplates,
        shiftsEnabled: true,
      }),
    );
    assertWithinBudget("סינון משמרת היום מתוך חודש שלם", ms, 2000);

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(month.length);
    for (const r of filtered) {
      expect(r.clock_in!.slice(0, 10)).toBe(TODAY);
      expect(new Date(r.clock_in!).getHours()).toBe(18);
    }
  });

  it("סינון סביב תאריך הדוח מצמצם את החודש לשלושה ימים", () => {
    const { result: near, ms } = measureBest(() => filterAttendanceNearReportDate(month, TODAY));
    assertWithinBudget("סינון סביב תאריך הדוח", ms, 2000);

    expect(near.length).toBeGreaterThan(0);
    for (const r of near) {
      const day = r.clock_in!.slice(0, 10);
      expect(day >= "2026-07-07" && day <= "2026-07-09").toBe(true);
    }
  });
});

describe("בניית צוות משמרת גדולה ודוח טיפים", () => {
  /** משמרת ערב עמוסה — 60 עובדים באותה משמרת. */
  const bigShiftIds = Array.from({ length: 60 }, (_, i) => `emp-${i * 5}`);
  const bigShiftAttendance = bigShiftIds.map((id) =>
    makeAttendance({ employeeId: id, date: TODAY, from: 18, to: 23 }),
  );
  const bigShiftAssignments = bigShiftIds.map((id) =>
    makeAssignment({ employee_id: id, shift_date: TODAY, shift_template_id: TPL.evening }),
  );

  it("בונה את כל הצוות עם השעות הנכונות", () => {
    const { result: team, ms } = measureBest(() =>
      buildTeamMembersFromShift({
        reportDate: TODAY,
        shiftTemplateId: TPL.evening,
        assignments: bigShiftAssignments,
        attendance: [...month, ...bigShiftAttendance],
        templates: shiftTemplates,
      }),
    );
    // נמדד ~340ms: לכל חבר צוות הפונקציה סורקת מחדש את כל מערך הנוכחות של
    // החודש. זה הזמן הכבד ביותר במסך דוח המשמרת — התקציב תופס הרעה של פי ~9.
    assertWithinBudget("בניית צוות של 60 עובדים מתוך חודש שלם", ms, 3000);

    expect(team.length).toBeGreaterThanOrEqual(60);
    for (const member of team) {
      expect(member.hours).toBeGreaterThan(0);
      expect(member.attendance_hours).toBe(member.hours);
    }
  });

  it("חלוקת קופת טיפים גדולה בין כל הצוות מסתכמת לקופה המקורית", () => {
    const team = buildTeamMembersFromShift({
      reportDate: TODAY,
      shiftTemplateId: TPL.evening,
      assignments: bigShiftAssignments,
      attendance: bigShiftAttendance,
      templates: shiftTemplates,
    });
    const pool = 18_000;
    const { result: tips, ms } = measureBest(() => distributeTips(pool, team));
    assertWithinBudget("חלוקת טיפים ל-60 משתתפים", ms, 500);

    expect(tips).toHaveLength(team.length);
    const distributed = tips.reduce((s, t) => s + t.amount, 0);
    // עיגול לאגורות לכל משתתף — סטייה של עד אגורה למשתתף
    expect(Math.abs(distributed - pool)).toBeLessThan(team.length * 0.01 + 0.01);
  });

  it("שעות בתוך חלון המשמרת מחושבות לכל חבר צוות", () => {
    const window = shiftWindowForDate(TODAY, evening);
    const { ms } = measureBest(() =>
      bigShiftIds.map((id) => getAttendanceHoursInShiftWindow(bigShiftAttendance, id, window)),
    );
    assertWithinBudget("חישוב שעות ל-60 עובדים", ms, 1000);

    expect(getAttendanceHoursInShiftWindow(bigShiftAttendance, bigShiftIds[0], window)).toBe(5);
  });
});
