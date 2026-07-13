import { describe, expect, it } from "vitest";
import {
  attendanceBelongsToTodayFeed,
  filterAttendanceForTodayShift,
} from "@/lib/attendanceFeed";
import type { Attendance, ShiftAssignment, ShiftTemplate } from "@/types/database";

const BUSINESS_ID = "biz-1";
const EMP = "emp-1";
const TEMPLATE_ID = "tpl-evening";
const TODAY = "2026-07-13";
const YESTERDAY = "2026-07-12";

const overnightTemplate: ShiftTemplate = {
  id: TEMPLATE_ID,
  business_id: BUSINESS_ID,
  shift_key: "evening",
  name: "ערב",
  start_time: "16:30",
  end_time: "01:15",
  color: null,
  active: true,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
};

function record(clockIn: string, clockOut: string | null): Attendance {
  return {
    id: "att-1",
    business_id: BUSINESS_ID,
    employee_id: EMP,
    clock_in: clockIn,
    clock_out: clockOut,
    clock_in_lat: null,
    clock_in_lng: null,
    within_radius: true,
    created_at: clockIn,
  };
}

function assignment(shiftDate: string): ShiftAssignment {
  return {
    id: "asgn-1",
    business_id: BUSINESS_ID,
    department_id: "dept-1",
    employee_id: EMP,
    shift_date: shiftDate,
    shift_template_id: TEMPLATE_ID,
    assigned_by: "mgr-1",
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("attendanceBelongsToTodayFeed", () => {
  it("excludes completed overnight shift that started yesterday", () => {
    const r = record(`${YESTERDAY}T16:30:00`, `${TODAY}T01:15:00`);
    expect(attendanceBelongsToTodayFeed(r, TODAY)).toBe(false);
  });

  it("includes shift that started today even if it ends after midnight", () => {
    const r = record(`${TODAY}T16:30:00`, null);
    expect(attendanceBelongsToTodayFeed(r, TODAY)).toBe(true);
  });

  it("includes completed shift that started and ended today", () => {
    const r = record(`${TODAY}T08:00:00`, `${TODAY}T16:00:00`);
    expect(attendanceBelongsToTodayFeed(r, TODAY)).toBe(true);
  });

  it("keeps open punch from yesterday visible", () => {
    const r = record(`${YESTERDAY}T16:30:00`, null);
    expect(attendanceBelongsToTodayFeed(r, TODAY)).toBe(true);
  });
});

describe("filterAttendanceForTodayShift", () => {
  const baseInput = {
    today: TODAY,
    assignments: [assignment(TODAY)],
    templates: [overnightTemplate],
    shiftsEnabled: true,
    now: new Date(`${TODAY}T19:00:00`),
  };

  it("excludes yesterday overnight shift that ended after midnight", () => {
    const records = [record(`${YESTERDAY}T16:30:00`, `${TODAY}T01:15:00`)];
    const result = filterAttendanceForTodayShift({ ...baseInput, records });
    expect(result).toHaveLength(0);
  });

  it("includes today's shift in progress", () => {
    const records = [record(`${TODAY}T16:30:00`, null)];
    const result = filterAttendanceForTodayShift({ ...baseInput, records });
    expect(result).toHaveLength(1);
  });

  it("includes today's completed shift", () => {
    const records = [record(`${TODAY}T16:30:00`, `${TODAY}T23:00:00`)];
    const result = filterAttendanceForTodayShift({ ...baseInput, records });
    expect(result).toHaveLength(1);
  });

  it("without shifts enabled, excludes yesterday completed overnight shift", () => {
    const records = [record(`${YESTERDAY}T16:30:00`, `${TODAY}T01:15:00`)];
    const result = filterAttendanceForTodayShift({
      ...baseInput,
      records,
      shiftsEnabled: false,
    });
    expect(result).toHaveLength(0);
  });
});
