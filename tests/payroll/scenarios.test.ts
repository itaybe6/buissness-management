import { describe, expect, it } from "vitest";
import { distributeTips } from "@/lib/shiftReportTips";
import { computeEmployeePayroll, type PayrollTip } from "@/lib/payrollCompute";
import { EMP, participant } from "./fixtures";

/** Turn one shift's distributed tips into the per-employee PayrollTip rows. */
function tipsByEmployee(
  totalTips: number,
  parts: { id: string; hours: number }[],
): Map<string, PayrollTip[]> {
  const rows = distributeTips(
    totalTips,
    parts.map((p) => participant(p.id, p.hours)),
  );
  const map = new Map<string, PayrollTip[]>();
  for (const r of rows) {
    const list = map.get(r.employee_id) ?? [];
    list.push({ hours: r.hours, amount: r.amount, hourly_from_tips: r.hourly_from_tips });
    map.set(r.employee_id, list);
  }
  return map;
}

describe("scenario: one shift, tips split by hours then paid out", () => {
  it("distributes a rich pool so nobody needs a top-up", () => {
    // 1200 ₪ over Alice 6h, Bob 4h, Carol 2h = 12h → 100 ₪/h. Rate 40 < 100.
    const byEmp = tipsByEmployee(1200, [
      { id: EMP.alice, hours: 6 },
      { id: EMP.bob, hours: 4 },
      { id: EMP.carol, hours: 2 },
    ]);

    const rate = 40;
    const alice = computeEmployeePayroll({ wageType: "tips", rate, tips: byEmp.get(EMP.alice)!, bonusSum: 0, attendanceHours: 0 });
    const bob = computeEmployeePayroll({ wageType: "tips", rate, tips: byEmp.get(EMP.bob)!, bonusSum: 0, attendanceHours: 0 });
    const carol = computeEmployeePayroll({ wageType: "tips", rate, tips: byEmp.get(EMP.carol)!, bonusSum: 0, attendanceHours: 0 });

    expect([alice.tips, bob.tips, carol.tips]).toEqual([600, 400, 200]);
    expect([alice.topup, bob.topup, carol.topup]).toEqual([0, 0, 0]);
    // the whole pool is paid out and nothing more
    expect(alice.total + bob.total + carol.total).toBe(1200);
  });

  it("tops up only the employees the thin pool left under minimum", () => {
    // A slow night: only 300 ₪ over 12h → 25 ₪/h, but rate is 50 ₪/h.
    const byEmp = tipsByEmployee(300, [
      { id: EMP.alice, hours: 6 },
      { id: EMP.bob, hours: 4 },
      { id: EMP.carol, hours: 2 },
    ]);

    const rate = 50;
    const alice = computeEmployeePayroll({ wageType: "tips", rate, tips: byEmp.get(EMP.alice)!, bonusSum: 0, attendanceHours: 0 });
    const bob = computeEmployeePayroll({ wageType: "tips", rate, tips: byEmp.get(EMP.bob)!, bonusSum: 0, attendanceHours: 0 });
    const carol = computeEmployeePayroll({ wageType: "tips", rate, tips: byEmp.get(EMP.carol)!, bonusSum: 0, attendanceHours: 0 });

    // everyone is floored at hours × 50
    expect(alice.total).toBe(300); // 6h × 50
    expect(bob.total).toBe(200); // 4h × 50
    expect(carol.total).toBe(100); // 2h × 50
    // each top-up covers the gap up to the floor
    expect(alice.topup).toBe(150); // 300 − 150 tips
    expect(bob.topup).toBe(100);
    expect(carol.topup).toBe(50);
    // total top-up pool the employer must add
    expect(alice.topup + bob.topup + carol.topup).toBe(300);
  });
});

describe("scenario: mixed roster in one shift", () => {
  it("pays hourly staff their fixed wage and tips staff from the pool", () => {
    // Tips pool 800 over the two tipped waiters (Alice 5h, Bob 3h = 8h → 100/h).
    const byEmp = tipsByEmployee(800, [
      { id: EMP.alice, hours: 5 },
      { id: EMP.bob, hours: 3 },
    ]);

    // Alice & Bob are tips employees (rate 40 floor); Dave is an hourly cook.
    const alice = computeEmployeePayroll({ wageType: "tips", rate: 40, tips: byEmp.get(EMP.alice)!, bonusSum: 0, attendanceHours: 0 });
    const bob = computeEmployeePayroll({ wageType: "tips", rate: 40, tips: byEmp.get(EMP.bob)!, bonusSum: 0, attendanceHours: 0 });
    const dave = computeEmployeePayroll({ wageType: "hourly", rate: 55, tips: [], bonusSum: 0, attendanceHours: 8 });

    expect(alice.total).toBe(500); // 5h × 100 from tips
    expect(bob.total).toBe(300); // 3h × 100 from tips
    expect(dave.tips).toBe(0);
    expect(dave.total).toBe(440); // 8h × 55, no tips
  });

  it("layers kupah bonuses on top of both wage types", () => {
    const byEmp = tipsByEmployee(800, [
      { id: EMP.alice, hours: 5 },
      { id: EMP.bob, hours: 3 },
    ]);

    const alice = computeEmployeePayroll({ wageType: "tips", rate: 40, tips: byEmp.get(EMP.alice)!, bonusSum: 120, attendanceHours: 0 });
    const dave = computeEmployeePayroll({ wageType: "hourly", rate: 55, tips: [], bonusSum: 120, attendanceHours: 8 });

    expect(alice.total).toBe(620); // 500 tips + 120 bonus
    expect(dave.total).toBe(560); // 440 wage + 120 bonus
  });
});

describe("scenario: a tips employee across a whole month", () => {
  it("mixes strong and weak shifts, flooring only the weak ones", () => {
    const rate = 45;
    // Four shifts across the month for one waiter.
    const shifts: PayrollTip[] = [
      { hours: 6, amount: 720, hourly_from_tips: 120 }, // strong (120/h)
      { hours: 5, amount: 150, hourly_from_tips: 30 }, // weak (30/h) → floor 225
      { hours: 4, amount: 400, hourly_from_tips: 100 }, // strong
      { hours: 5, amount: 100, hourly_from_tips: 20 }, // weak → floor 225
    ];
    const row = computeEmployeePayroll({ wageType: "tips", rate, tips: shifts, bonusSum: 0, attendanceHours: 0 });

    const tipSum = 720 + 150 + 400 + 100; // 1370
    // guaranteed = 720 + 225 + 400 + 225 = 1570
    expect(row.tips).toBe(tipSum);
    expect(row.hours).toBe(20);
    expect(row.topup).toBe(1570 - tipSum); // 200
    expect(row.total).toBe(1570);
  });
});
