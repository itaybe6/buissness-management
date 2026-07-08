import { describe, expect, it } from "vitest";
import { computeEmployeePayroll, sumAttendanceHours } from "@/lib/payrollCompute";
import { EMP, punch, openPunch } from "./fixtures";

describe("sumAttendanceHours", () => {
  it("sums the duration of a single punch", () => {
    expect(sumAttendanceHours([punch(EMP.alice, 8, 16)], EMP.alice)).toBe(8);
  });

  it("adds up multiple punches on the same day", () => {
    const att = [punch(EMP.alice, 8, 12), punch(EMP.alice, 13, 17)];
    expect(sumAttendanceHours(att, EMP.alice)).toBe(8);
  });

  it("counts fractional hours", () => {
    expect(sumAttendanceHours([punch(EMP.alice, 18, 22.5)], EMP.alice)).toBe(4.5);
  });

  it("ignores open punches with no clock-out", () => {
    const att = [punch(EMP.alice, 8, 12), openPunch(EMP.alice, 13)];
    expect(sumAttendanceHours(att, EMP.alice)).toBe(4);
  });

  it("only counts the requested employee's punches", () => {
    const att = [punch(EMP.alice, 8, 16), punch(EMP.bob, 8, 20)];
    expect(sumAttendanceHours(att, EMP.alice)).toBe(8);
    expect(sumAttendanceHours(att, EMP.bob)).toBe(12);
  });

  it("returns 0 when the employee has no punches", () => {
    expect(sumAttendanceHours([punch(EMP.bob, 8, 16)], EMP.alice)).toBe(0);
  });
});

describe("computeEmployeePayroll — hourly employee (fixed wage)", () => {
  it("pays worked hours × rate", () => {
    const row = computeEmployeePayroll({
      wageType: "hourly",
      rate: 50,
      tips: [],
      bonusSum: 0,
      attendanceHours: 40,
    });
    expect(row.base).toBe(2000);
    expect(row.total).toBe(2000);
  });

  it("never receives tips or a top-up", () => {
    const row = computeEmployeePayroll({
      wageType: "hourly",
      rate: 50,
      tips: [],
      bonusSum: 0,
      attendanceHours: 40,
    });
    expect(row.tips).toBe(0);
    expect(row.topup).toBe(0);
  });

  it("adds the kupah bonus on top of the base wage", () => {
    const row = computeEmployeePayroll({
      wageType: "hourly",
      rate: 50,
      tips: [],
      bonusSum: 350,
      attendanceHours: 40,
    });
    expect(row.base).toBe(2000);
    expect(row.bonus).toBe(350);
    expect(row.total).toBe(2350);
  });

  it("pays nothing for zero hours worked (bonus aside)", () => {
    const row = computeEmployeePayroll({
      wageType: "hourly",
      rate: 50,
      tips: [],
      bonusSum: 0,
      attendanceHours: 0,
    });
    expect(row.total).toBe(0);
  });

  it("handles a missing rate as zero pay", () => {
    const row = computeEmployeePayroll({
      wageType: "hourly",
      rate: 0,
      tips: [],
      bonusSum: 0,
      attendanceHours: 40,
    });
    expect(row.total).toBe(0);
  });
});
