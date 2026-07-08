import { describe, expect, it } from "vitest";
import { computeShiftBonusAmounts } from "@/lib/shiftReportBonuses";
import { EMP } from "./fixtures";

describe("computeShiftBonusAmounts", () => {
  it("returns zero pool when sales are zero", () => {
    expect(computeShiftBonusAmounts(0, 5, [EMP.alice])).toEqual({
      pool: 0,
      perEmployee: 0,
    });
  });

  it("returns zero pool when bonus percent is zero", () => {
    expect(computeShiftBonusAmounts(10_000, 0, [EMP.alice])).toEqual({
      pool: 0,
      perEmployee: 0,
    });
  });

  it("returns zero pool when no employees are selected", () => {
    expect(computeShiftBonusAmounts(10_000, 5, [])).toEqual({
      pool: 0,
      perEmployee: 0,
    });
  });

  it("ignores empty employee ids in the count", () => {
    expect(computeShiftBonusAmounts(10_000, 5, ["", EMP.alice, ""])).toEqual({
      pool: 500,
      perEmployee: 500,
    });
  });

  it("computes pool as sales × percent / 100", () => {
    expect(computeShiftBonusAmounts(12_345, 7, [EMP.alice])).toEqual({
      pool: 864.15,
      perEmployee: 864.15,
    });
  });

  it("splits pool equally among five evening managers", () => {
    const ids = [EMP.alice, EMP.bob, EMP.carol, EMP.dave, EMP.eve];
    expect(computeShiftBonusAmounts(10_000, 5, ids)).toEqual({
      pool: 500,
      perEmployee: 100,
    });
  });

  it("rounds pool and per-employee amounts to two decimals", () => {
    const result = computeShiftBonusAmounts(10_000, 3, [EMP.alice, EMP.bob, EMP.carol]);
    expect(result.pool).toBe(300);
    expect(result.perEmployee).toBe(100);
  });

  it("handles uneven splits with rounding per employee", () => {
    // 1000 × 7% = 70 → 70 / 3 = 23.333... → 23.33
    const result = computeShiftBonusAmounts(1_000, 7, [EMP.alice, EMP.bob, EMP.carol]);
    expect(result.pool).toBe(70);
    expect(result.perEmployee).toBe(23.33);
  });

  it("treats string-like numeric inputs via Number()", () => {
    expect(computeShiftBonusAmounts("8000" as unknown as number, "2.5" as unknown as number, [EMP.alice])).toEqual({
      pool: 200,
      perEmployee: 200,
    });
  });

  it("single selected employee receives the entire pool", () => {
    expect(computeShiftBonusAmounts(50_000, 4, [EMP.frank])).toEqual({
      pool: 2000,
      perEmployee: 2000,
    });
  });
});
