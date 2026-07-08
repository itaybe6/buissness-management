import { describe, expect, it } from "vitest";
import { computeEmployeePayroll } from "@/lib/payrollCompute";
import { tip } from "./fixtures";

/**
 * A tips employee is guaranteed their hourly minimum for every shift. When the
 * tips for a shift fall short of hours × rate, the employer adds a top-up
 * (השלמה) so the employee never earns below minimum wage.
 */
describe("computeEmployeePayroll — tips employee, minimum-wage top-up", () => {
  it("no top-up when tips clear the hourly minimum", () => {
    // 5h, earned 500 (100/h) vs rate 30 → tips win, nothing to add
    const row = computeEmployeePayroll({
      wageType: "tips",
      rate: 30,
      tips: [tip(5, 500, 100)],
      bonusSum: 0,
      attendanceHours: 0,
    });
    expect(row.tips).toBe(500);
    expect(row.topup).toBe(0);
    expect(row.total).toBe(500);
  });

  it("tops up to the hourly minimum when tips fall short", () => {
    // 5h, earned only 300 (60/h) vs rate 100 → floor is 5×100 = 500
    const row = computeEmployeePayroll({
      wageType: "tips",
      rate: 100,
      tips: [tip(5, 300, 60)],
      bonusSum: 0,
      attendanceHours: 0,
    });
    expect(row.tips).toBe(300);
    expect(row.topup).toBe(200); // 500 − 300
    expect(row.total).toBe(500); // exactly hours × rate
  });

  it("no top-up when tips land exactly on the minimum", () => {
    const row = computeEmployeePayroll({
      wageType: "tips",
      rate: 60,
      tips: [tip(5, 300, 60)],
      bonusSum: 0,
      attendanceHours: 0,
    });
    expect(row.topup).toBe(0);
    expect(row.total).toBe(300);
  });

  it("no floor when the employee has no hourly rate set", () => {
    const row = computeEmployeePayroll({
      wageType: "tips",
      rate: 0,
      tips: [tip(5, 250, 50)],
      bonusSum: 0,
      attendanceHours: 0,
    });
    expect(row.topup).toBe(0);
    expect(row.total).toBe(250);
  });

  it("floors each shift independently — a good shift does not cover a bad one", () => {
    // Shift A: 5h, earned 400 (80/h) — above the 40/h minimum, no top-up.
    // Shift B: 5h, earned 100 (20/h) — below minimum, needs 5×40 − 100 = 100.
    // Monthly tips (500) already exceed the monthly minimum (10h × 40 = 400),
    // so a naive monthly calculation would give ZERO top-up. Per-shift flooring
    // still owes 100 for shift B.
    const row = computeEmployeePayroll({
      wageType: "tips",
      rate: 40,
      tips: [tip(5, 400, 80), tip(5, 100, 20)],
      bonusSum: 0,
      attendanceHours: 0,
    });
    expect(row.tips).toBe(500);
    expect(row.topup).toBe(100);
    expect(row.total).toBe(600); // 400 (shift A) + 200 (floored shift B)
    expect(row.total).toBeGreaterThan(row.tips); // proves the per-shift top-up
  });

  it("keeps the top-up when a strong shift and a weak shift roughly cancel out", () => {
    // Two weak shifts each need topping up; both count.
    const row = computeEmployeePayroll({
      wageType: "tips",
      rate: 50,
      tips: [tip(4, 120, 30), tip(6, 180, 30)], // 30/h both, well under 50/h
      bonusSum: 0,
      attendanceHours: 0,
    });
    // guaranteed = 4×50 + 6×50 = 500 ; tips = 300 ; top-up = 200
    expect(row.topup).toBe(200);
    expect(row.total).toBe(500);
  });

  it("adds the kupah bonus on top of the guaranteed (topped-up) wage", () => {
    const row = computeEmployeePayroll({
      wageType: "tips",
      rate: 100,
      tips: [tip(5, 300, 60)],
      bonusSum: 250,
      attendanceHours: 0,
    });
    expect(row.topup).toBe(200);
    expect(row.bonus).toBe(250);
    expect(row.total).toBe(750); // 500 guaranteed + 250 bonus
  });

  it("reports hours as the sum of tip-shift hours, not attendance", () => {
    const row = computeEmployeePayroll({
      wageType: "tips",
      rate: 40,
      tips: [tip(5, 400, 80), tip(3, 240, 80)],
      bonusSum: 0,
      attendanceHours: 999, // must be ignored for tips employees
    });
    expect(row.hours).toBe(8);
  });

  it("pays nothing for a tips employee with no recorded shifts", () => {
    const row = computeEmployeePayroll({
      wageType: "tips",
      rate: 50,
      tips: [],
      bonusSum: 0,
      attendanceHours: 0,
    });
    expect(row.total).toBe(0);
    expect(row.topup).toBe(0);
  });
});
