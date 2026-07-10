import { describe, expect, it } from "vitest";
import { computeTipsHourly, distributeTips } from "@/lib/shiftReportTips";
import { EMP, participant } from "./fixtures";

describe("computeTipsHourly", () => {
  it("divides the whole pool by the total hours of all participants", () => {
    // 900 ₪ over 3 + 3 + 3 = 9 hours → 100 ₪/hour
    const parts = [participant(EMP.alice, 3), participant(EMP.bob, 3), participant(EMP.carol, 3)];
    expect(computeTipsHourly(900, parts)).toBe(100);
  });

  it("returns 0 when nobody logged hours (no division by zero)", () => {
    expect(computeTipsHourly(500, [participant(EMP.alice, 0), participant(EMP.bob, 0)])).toBe(0);
  });

  it("returns 0 for an empty participant list", () => {
    expect(computeTipsHourly(500, [])).toBe(0);
  });

  it("returns 0 when there are no tips to split", () => {
    expect(computeTipsHourly(0, [participant(EMP.alice, 5)])).toBe(0);
  });

  it("coerces numeric-like string inputs", () => {
    expect(computeTipsHourly("600" as unknown as number, [participant(EMP.alice, 6)])).toBe(100);
  });
});

describe("distributeTips — split by hours worked", () => {
  it("splits equally when everyone worked the same hours", () => {
    const parts = [participant(EMP.alice, 4), participant(EMP.bob, 4)];
    const rows = distributeTips(800, parts);
    expect(rows).toEqual([
      { employee_id: EMP.alice, hours: 4, amount: 400, hourly_from_tips: 100 },
      { employee_id: EMP.bob, hours: 4, amount: 400, hourly_from_tips: 100 },
    ]);
  });

  it("splits proportionally to hours — more hours, bigger share", () => {
    // 1000 ₪ over 6 + 2 + 2 = 10 hours → 100 ₪/hour
    const rows = distributeTips(1000, [
      participant(EMP.alice, 6),
      participant(EMP.bob, 2),
      participant(EMP.carol, 2),
    ]);
    expect(rows.map((r) => r.amount)).toEqual([600, 200, 200]);
    // everyone shares the same per-hour rate
    expect(rows.every((r) => r.hourly_from_tips === 100)).toBe(true);
  });

  it("rounds each share to agorot (2 decimals)", () => {
    // 1000 ₪ over 3 hours total → 333.333.. ₪/hour
    const rows = distributeTips(1000, [participant(EMP.alice, 2), participant(EMP.bob, 1)]);
    expect(rows[0].amount).toBe(666.67); // 2h × 333.33..
    expect(rows[1].amount).toBe(333.33); // 1h × 333.33..
    expect(rows[0].hourly_from_tips).toBe(333.33);
  });

  it("drops participants with zero hours (they earn nothing)", () => {
    const rows = distributeTips(600, [participant(EMP.alice, 6), participant(EMP.bob, 0)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].employee_id).toBe(EMP.alice);
    expect(rows[0].amount).toBe(600);
  });

  it("drops participants without an employee id", () => {
    const rows = distributeTips(600, [participant("", 3), participant(EMP.bob, 3)]);
    expect(rows.map((r) => r.employee_id)).toEqual([EMP.bob]);
    // the empty participant's hours still counted toward the divisor (6h → 100/h)
    expect(rows[0].amount).toBe(300);
  });

  it("returns no rows when there are no hours to split against", () => {
    expect(distributeTips(500, [participant(EMP.alice, 0)])).toEqual([]);
  });

  it("gives the whole pool to a single participant", () => {
    expect(distributeTips(742.5, [participant(EMP.alice, 5)])).toEqual([
      { employee_id: EMP.alice, hours: 5, amount: 742.5, hourly_from_tips: 148.5 },
    ]);
  });

  it("conserves the pool when it divides evenly", () => {
    const rows = distributeTips(1200, [
      participant(EMP.alice, 5),
      participant(EMP.bob, 4),
      participant(EMP.carol, 3),
    ]);
    const sum = rows.reduce((s, r) => s + r.amount, 0);
    expect(sum).toBe(1200);
  });

  it("keeps rounding drift within a few agorot of the pool", () => {
    // 1000 over 7 hours does not divide evenly; distributed sum should be very close.
    const rows = distributeTips(1000, [
      participant(EMP.alice, 3),
      participant(EMP.bob, 2),
      participant(EMP.carol, 2),
    ]);
    const sum = rows.reduce((s, r) => s + r.amount, 0);
    expect(Math.abs(sum - 1000)).toBeLessThanOrEqual(0.03);
  });
});
