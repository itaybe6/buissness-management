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

  /**
   * A punch spanning several days means somebody forgot to clock out. Without a
   * shift template the report has no window to clip against, so it falls back to
   * the module-wide convention: a punch belongs to the day it *started* (same
   * rule as attendanceBelongsToTodayFeed). Selecting a template clips properly.
   */
  describe("multi-day punch (forgotten clock-out)", () => {
    const longPunch: Attendance = {
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

    const hoursFor = (reportDate: string, shiftTemplateId = "", tpls = templates) =>
      getAttendanceHoursForShiftReport({
        attendance: [longPunch],
        employeeId: EMP.carol,
        reportDate,
        shiftTemplateId,
        templates: tpls,
      });

    it("counts on the day it started, without a template", () => {
      expect(hoursFor("2026-07-10")).toBe(48);
    });

    it("does not leak onto the following days it spans", () => {
      expect(hoursFor("2026-07-11")).toBe(0);
      expect(hoursFor("2026-07-12")).toBe(0);
    });

    it("clips to the shift window once a template is selected", () => {
      // בוקר 08:00–16:00 ביום 11/07 — 8 שעות מתוך ההחתמה הארוכה
      expect(hoursFor("2026-07-11", TEMPLATE.morning)).toBe(8);
    });

    it("never reports more hours than the shift window is long", () => {
      const morning = templates.find((t) => t.id === TEMPLATE.morning)!;
      const windowHours =
        (Number(morning.end_time.slice(0, 2)) - Number(morning.start_time.slice(0, 2)));
      expect(hoursFor("2026-07-11", TEMPLATE.morning)).toBeLessThanOrEqual(windowHours);
    });
  });
});
