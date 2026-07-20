import { describe, expect, it } from "vitest";
import { buildShiftPayRows } from "@/lib/shiftReportPay";
import { computeEmployeePayroll } from "@/lib/payrollCompute";
import type { Profile, ShiftReportParticipant } from "@/types/database";

function profile(over: Partial<Profile> & { id: string }): Profile {
  return {
    id: over.id,
    business_id: "biz-1",
    full_name: over.full_name ?? "עובד",
    role: "employee",
    active: true,
    hourly_rate: over.hourly_rate ?? null,
    wage_type: over.wage_type ?? "hourly",
  } as Profile;
}

const NAMES: Record<string, string> = { alice: "אליס לוי", bob: "בוב כהן", dana: "דנה מזרחי" };
const userName = (id: string) => NAMES[id] ?? "—";

function member(employee_id: string, hours: number): ShiftReportParticipant {
  return { employee_id, hours, work_start: "16:00", work_end: "23:00" };
}

describe("buildShiftPayRows", () => {
  it("pays a tips employee their share of the pool: hours × (tips ÷ total tip hours)", () => {
    // 900₪ pool over 15 tip hours = 60₪/h. Alice worked 10 of them.
    const rows = buildShiftPayRows({
      team: [member("alice", 10)],
      tipByEmployee: new Map([["alice", { amount: 600, hourly_from_tips: 60 }]]),
      profileById: new Map([["alice", profile({ id: "alice", wage_type: "tips", hourly_rate: 40 })]]),
      userName,
      tipsHourly: 60,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "אליס לוי",
      onTips: true,
      hourly: 60,
      amount: 600,
      fromTips: 600,
      topup: 0,
    });
  });

  it("pays an hourly employee hours × their profile rate, ignoring the tip pool", () => {
    const rows = buildShiftPayRows({
      team: [member("bob", 8)],
      tipByEmployee: new Map(),
      profileById: new Map([["bob", profile({ id: "bob", wage_type: "hourly", hourly_rate: 45 })]]),
      userName,
      tipsHourly: 60,
    });

    expect(rows[0]).toMatchObject({
      onTips: false,
      hourly: 45,
      amount: 360,
      fromTips: 0,
      topup: 0,
      rateMissing: false,
    });
  });

  it("floors a weak tip shift at the employee's hourly_rate and reports the top-up", () => {
    // Tip rate 30₪/h is below Dana's 50₪/h guaranteed minimum.
    const rows = buildShiftPayRows({
      team: [member("dana", 6)],
      tipByEmployee: new Map([["dana", { amount: 180, hourly_from_tips: 30 }]]),
      profileById: new Map([["dana", profile({ id: "dana", wage_type: "tips", hourly_rate: 50 })]]),
      userName,
      tipsHourly: 30,
    });

    expect(rows[0]).toMatchObject({ hourly: 50, amount: 300, fromTips: 180, topup: 120 });
  });

  it("agrees with computeEmployeePayroll for the same single shift", () => {
    const tip = { amount: 180, hours: 6, hourly_from_tips: 30 };
    const row = buildShiftPayRows({
      team: [member("dana", 6)],
      tipByEmployee: new Map([["dana", tip]]),
      profileById: new Map([["dana", profile({ id: "dana", wage_type: "tips", hourly_rate: 50 })]]),
      userName,
      tipsHourly: 30,
    })[0];

    const payroll = computeEmployeePayroll({
      wageType: "tips",
      rate: 50,
      tips: [tip],
      bonusSum: 0,
      attendanceHours: 6,
    });

    expect(row.amount).toBe(payroll.total);
    expect(row.topup).toBe(payroll.topup);
  });

  it("treats a profile with no hourly_rate as unpayable rather than showing 0₪", () => {
    const rows = buildShiftPayRows({
      team: [member("bob", 8)],
      tipByEmployee: new Map(),
      profileById: new Map([["bob", profile({ id: "bob", wage_type: "hourly", hourly_rate: null })]]),
      userName,
      tipsHourly: 60,
    });

    expect(rows[0].rateMissing).toBe(true);
    expect(rows[0].amount).toBe(0);
  });

  it("classifies by wage_type even when the employee has no tip row, and drops blank rows", () => {
    const rows = buildShiftPayRows({
      team: [member("alice", 5), member("", 3)],
      tipByEmployee: new Map(),
      profileById: new Map([["alice", profile({ id: "alice", wage_type: "tips", hourly_rate: 40 })]]),
      userName,
      tipsHourly: 60,
    });

    expect(rows).toHaveLength(1);
    // No tip row yet — falls back to the shift's pool rate, still above her floor.
    expect(rows[0]).toMatchObject({ onTips: true, hourly: 60, amount: 300, fromTips: 300 });
  });
});
