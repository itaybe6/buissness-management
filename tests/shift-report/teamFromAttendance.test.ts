import { describe, expect, it } from "vitest";
import { buildTeamMembersFromShift, getAttendanceHoursForShiftReport } from "@/lib/shiftReportTips";
import { EMP, TEMPLATE, templates } from "../shift-bonuses/fixtures";
import type { Attendance } from "@/types/database";

describe("buildTeamMembersFromShift overnight", () => {
  it("includes employee who clocked out after midnight within night shift window", () => {
    const reportDate = "2026-07-11";
    const punch: Attendance = {
      id: "att-1",
      business_id: "biz-1",
      employee_id: EMP.alice,
      clock_in: "2026-07-11T23:15:00",
      clock_out: "2026-07-12T01:30:00",
      clock_in_lat: null,
      clock_in_lng: null,
      within_radius: true,
      created_at: "2026-07-11T23:15:00",
    };

    const team = buildTeamMembersFromShift({
      reportDate,
      shiftTemplateId: TEMPLATE.night,
      assignments: [],
      attendance: [punch],
      templates,
    });

    expect(team).toHaveLength(1);
    expect(team[0].employee_id).toBe(EMP.alice);
    expect(team[0].attendance_hours).toBeGreaterThan(0);
  });

  it("counts only hours inside the shift window, not full punch duration across days", () => {
    const reportDate = "2026-07-11";
    const punch: Attendance = {
      id: "att-2",
      business_id: "biz-1",
      employee_id: EMP.bob,
      clock_in: "2026-07-11T23:00:00",
      clock_out: "2026-07-12T01:00:00",
      clock_in_lat: null,
      clock_in_lng: null,
      within_radius: true,
      created_at: "2026-07-11T23:00:00",
    };

    const hrs = getAttendanceHoursForShiftReport({
      attendance: [punch],
      employeeId: EMP.bob,
      reportDate,
      shiftTemplateId: TEMPLATE.night,
      templates,
    });

    expect(hrs).toBe(2);
  });

  it("uses actual punch duration, not full shift template length", () => {
    const reportDate = "2026-07-11";
    const punch: Attendance = {
      id: "att-3",
      business_id: "biz-1",
      employee_id: EMP.carol,
      clock_in: "2026-07-11T11:01:00",
      clock_out: "2026-07-11T18:44:00",
      clock_in_lat: null,
      clock_in_lng: null,
      within_radius: true,
      created_at: "2026-07-11T11:01:00",
    };

    const hrs = getAttendanceHoursForShiftReport({
      attendance: [punch],
      employeeId: EMP.carol,
      reportDate,
      shiftTemplateId: TEMPLATE.morning,
      templates,
    });

    expect(hrs).toBeCloseTo(4.98, 1);
    expect(hrs).not.toBe(8);
  });
});

describe("buildTeamMembersFromShift daily", () => {
  it("includes only employees with completed punches on the calendar day", () => {
    const reportDate = "2026-07-11";
    const worked: Attendance = {
      id: "att-worked",
      business_id: "biz-1",
      employee_id: EMP.alice,
      clock_in: "2026-07-11T10:00:00",
      clock_out: "2026-07-11T18:00:00",
      clock_in_lat: null,
      clock_in_lng: null,
      within_radius: true,
      created_at: "2026-07-11T10:00:00",
    };
    const openPunch: Attendance = {
      id: "att-open",
      business_id: "biz-1",
      employee_id: EMP.bob,
      clock_in: "2026-07-11T09:00:00",
      clock_out: null,
      clock_in_lat: null,
      clock_in_lng: null,
      within_radius: true,
      created_at: "2026-07-11T09:00:00",
    };

    const team = buildTeamMembersFromShift({
      reportDate,
      shiftTemplateId: "",
      assignments: [],
      attendance: [worked, openPunch],
      templates: [],
    });

    expect(team).toHaveLength(1);
    expect(team[0].employee_id).toBe(EMP.alice);
    expect(team[0].attendance_hours).toBe(8);
  });

  it("clips hours to the calendar day, not the full multi-day punch", () => {
    const reportDate = "2026-07-11";
    const punch: Attendance = {
      id: "att-long",
      business_id: "biz-1",
      employee_id: EMP.carol,
      clock_in: "2026-07-10T08:00:00",
      clock_out: "2026-07-12T08:00:00",
      clock_in_lat: null,
      clock_in_lng: null,
      within_radius: true,
      created_at: "2026-07-10T08:00:00",
    };

    const hrs = getAttendanceHoursForShiftReport({
      attendance: [punch],
      employeeId: EMP.carol,
      reportDate,
      shiftTemplateId: "",
      templates: [],
    });

    expect(hrs).toBe(24);
    expect(hrs).not.toBe(48);
  });
});
