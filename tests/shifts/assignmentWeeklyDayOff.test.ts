import { describe, expect, it } from "vitest";
import {
  MAX_ASSIGNED_DAYS_PER_WEEK,
  canAssignEmployeeOnDate,
  countAssignedDaysInWeek,
  weekStartFromDateISO,
} from "@/lib/shift-assignment-limits";

const EMP = "emp-1";
const OTHER = "emp-2";
/** Sunday of a known week */
const WK = "2026-07-12";

function a(date: string, employeeId = EMP) {
  return { employee_id: employeeId, shift_date: date };
}

describe("weekStartFromDateISO", () => {
  it("returns Sunday for mid-week dates", () => {
    expect(weekStartFromDateISO("2026-07-15")).toBe(WK); // Wednesday
    expect(weekStartFromDateISO("2026-07-18")).toBe(WK); // Saturday
    expect(weekStartFromDateISO(WK)).toBe(WK);
  });
});

describe("countAssignedDaysInWeek", () => {
  it("counts distinct calendar days only", () => {
    const assignments = [
      a("2026-07-12"),
      a("2026-07-12"), // same day, second template
      a("2026-07-13"),
      a("2026-07-14", OTHER),
    ];
    expect(countAssignedDaysInWeek(assignments, EMP, WK)).toBe(2);
  });

  it("ignores dates outside the week", () => {
    const assignments = [a("2026-07-11"), a("2026-07-12"), a("2026-07-19")];
    expect(countAssignedDaysInWeek(assignments, EMP, WK)).toBe(1);
  });
});

describe("canAssignEmployeeOnDate", () => {
  it("allows assigning when under the weekly cap", () => {
    const assignments = [
      a("2026-07-12"),
      a("2026-07-13"),
      a("2026-07-14"),
      a("2026-07-15"),
      a("2026-07-16"),
    ];
    expect(canAssignEmployeeOnDate(assignments, EMP, "2026-07-17")).toBe(true);
  });

  it("allows another shift on a day already counted toward the cap", () => {
    const assignments = [
      a("2026-07-12"),
      a("2026-07-13"),
      a("2026-07-14"),
      a("2026-07-15"),
      a("2026-07-16"),
      a("2026-07-17"),
    ];
    expect(assignments).toHaveLength(MAX_ASSIGNED_DAYS_PER_WEEK);
    expect(canAssignEmployeeOnDate(assignments, EMP, "2026-07-17")).toBe(true);
  });

  it("blocks a 7th distinct day in the same week", () => {
    const assignments = [
      a("2026-07-12"),
      a("2026-07-13"),
      a("2026-07-14"),
      a("2026-07-15"),
      a("2026-07-16"),
      a("2026-07-17"),
    ];
    expect(canAssignEmployeeOnDate(assignments, EMP, "2026-07-18")).toBe(false);
  });
});
