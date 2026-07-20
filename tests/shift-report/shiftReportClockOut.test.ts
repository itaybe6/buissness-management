import { describe, expect, it } from "vitest";
import {
  selectOpenAttendanceToClockOut,
  shouldClockOutOpenShiftsOnReportSave,
} from "@/lib/shiftReportClockOut";
import type { Attendance } from "@/types/database";

function row(partial: Partial<Attendance> & Pick<Attendance, "id" | "employee_id" | "clock_in">): Attendance {
  return {
    business_id: "b1",
    clock_out: null,
    clock_in_lat: null,
    clock_in_lng: null,
    within_radius: true,
    created_at: partial.clock_in,
    ...partial,
  };
}

describe("shouldClockOutOpenShiftsOnReportSave", () => {
  it("allows today and yesterday", () => {
    expect(shouldClockOutOpenShiftsOnReportSave("2026-07-20", "2026-07-20")).toBe(true);
    expect(shouldClockOutOpenShiftsOnReportSave("2026-07-19", "2026-07-20")).toBe(true);
  });

  it("skips older or future report dates", () => {
    expect(shouldClockOutOpenShiftsOnReportSave("2026-07-18", "2026-07-20")).toBe(false);
    expect(shouldClockOutOpenShiftsOnReportSave("2026-07-21", "2026-07-20")).toBe(false);
  });
});

describe("selectOpenAttendanceToClockOut", () => {
  it("includes open punches from report day and prior day only", () => {
    const records = [
      row({ id: "1", employee_id: "e1", clock_in: "2026-07-19T08:00:00" }),
      row({ id: "2", employee_id: "e2", clock_in: "2026-07-20T18:00:00" }),
      row({ id: "3", employee_id: "e3", clock_in: "2026-07-20T20:00:00", clock_out: "2026-07-21T01:00:00" }),
      row({ id: "4", employee_id: "e4", clock_in: "2026-07-18T08:00:00" }),
    ];
    const selected = selectOpenAttendanceToClockOut(records, "2026-07-20");
    expect(selected.map((r) => r.id)).toEqual(["1", "2"]);
  });
});
