import { describe, expect, it } from "vitest";
import {
  GENERAL_SHIFT_SECTION_KEY,
  groupTemplatesByDepartment,
  shiftSectionKey,
  templatesForDepartment,
  templatesForEmployee,
} from "@/lib/shiftTemplates";
import { hoursOnDay, uniformHoursLabel } from "@/lib/shiftTemplateHours";
import { makeShiftTemplate } from "../helpers/factories";

const HOSTING = "dept-hosting";
const BAR = "dept-bar";

const templates = [
  makeShiftTemplate({ id: "mgr", department_id: null, shift_key: null, name: "מנהל", start_time: "21:00", end_time: "01:00" }),
  makeShiftTemplate({ id: "host-1", department_id: HOSTING, shift_key: null, name: "אירוח ערב", start_time: "19:30", end_time: "23:30" }),
  makeShiftTemplate({ id: "host-2", department_id: HOSTING, shift_key: null, name: "אירוח ערב", start_time: "20:00", end_time: "00:00" }),
  makeShiftTemplate({ id: "host-3", department_id: HOSTING, shift_key: null, name: "מתלמד אירוח", start_time: "19:00", end_time: "00:00" }),
  makeShiftTemplate({ id: "bar-1", department_id: BAR, shift_key: null, name: "בר פתיחה", start_time: "17:40", end_time: "23:30" }),
];

describe("shift templates per department", () => {
  it("returns only the department's own shifts", () => {
    expect(templatesForDepartment(templates, HOSTING).map((t) => t.id)).toEqual(["host-1", "host-2", "host-3"]);
    expect(templatesForDepartment(templates, BAR).map((t) => t.id)).toEqual(["bar-1"]);
  });

  it("null department returns the general shifts only", () => {
    expect(templatesForDepartment(templates, null).map((t) => t.id)).toEqual(["mgr"]);
  });

  it("a department with no shifts yields an empty list", () => {
    expect(templatesForDepartment(templates, "dept-kitchen")).toEqual([]);
  });

  it("groups by department with a stable general bucket key", () => {
    const grouped = groupTemplatesByDepartment(templates);
    expect([...grouped.keys()]).toEqual([GENERAL_SHIFT_SECTION_KEY, HOSTING, BAR]);
    expect(grouped.get(HOSTING)?.length).toBe(3);
    expect(grouped.get(GENERAL_SHIFT_SECTION_KEY)?.map((t) => t.id)).toEqual(["mgr"]);
    expect(shiftSectionKey(null)).toBe(GENERAL_SHIFT_SECTION_KEY);
    expect(shiftSectionKey(HOSTING)).toBe(HOSTING);
  });

  it("an employee sees their department's shifts, and none without a department", () => {
    expect(templatesForEmployee(templates, HOSTING).map((t) => t.id)).toEqual(["host-1", "host-2", "host-3"]);
    expect(templatesForEmployee(templates, null)).toEqual([]);
    expect(templatesForEmployee(templates, undefined)).toEqual([]);
  });

  it("uses per-day hours and treats a missing weekday as off", () => {
    const manager = makeShiftTemplate({
      id: "mgr-days",
      start_time: "21:00",
      end_time: "01:00",
      days: [
        { day_of_week: 0, start_time: "21:00", end_time: "01:00" },
        { day_of_week: 1, start_time: "19:30", end_time: "01:00" },
        { day_of_week: 5, start_time: "19:30", end_time: "01:00" },
      ],
    });
    expect(hoursOnDay(manager, 0)).toEqual({ start: "21:00", end: "01:00" });
    expect(hoursOnDay(manager, 1)).toEqual({ start: "19:30", end: "01:00" });
    expect(hoursOnDay(manager, 2)).toBeNull();
    expect(uniformHoursLabel(manager)).toBeNull();

    const opening = makeShiftTemplate({
      start_time: "19:30",
      end_time: "23:30",
      days: [0, 1, 2, 3, 4, 6].map((day_of_week) => ({
        day_of_week,
        start_time: "19:30",
        end_time: "23:30",
      })),
    });
    expect(uniformHoursLabel(opening)).toBe("19:30–23:30");
    expect(hoursOnDay(opening, 5)).toBeNull();
  });

  it("legacy rows without department_id are treated as general", () => {
    const legacy = [{ id: "x", department_id: undefined as unknown as null }];
    expect(templatesForDepartment(legacy, null).map((t) => t.id)).toEqual(["x"]);
  });
});
