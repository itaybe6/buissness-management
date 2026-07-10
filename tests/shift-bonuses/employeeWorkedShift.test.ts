import { describe, expect, it } from "vitest";
import { employeeWorkedShift } from "@/lib/shiftReportBonuses";
import {
  EMP,
  REPORT_DATE,
  TEMPLATE,
  assignment,
  punch,
  templates,
} from "./fixtures";

const baseInput = {
  employeeId: EMP.alice,
  reportDate: REPORT_DATE,
  shiftTemplateId: TEMPLATE.evening,
  assignments: [assignment(EMP.alice, TEMPLATE.evening)],
  attendance: [punch(EMP.alice, 18, 30, 22, 30)],
  templates,
};

describe("employeeWorkedShift", () => {
  it("returns false when report date is missing", () => {
    expect(
      employeeWorkedShift({ ...baseInput, reportDate: "" }),
    ).toBe(false);
  });

  it("returns false when shift template id is missing", () => {
    expect(
      employeeWorkedShift({ ...baseInput, shiftTemplateId: "" }),
    ).toBe(false);
  });

  it("returns false when employee is not assigned to the shift", () => {
    expect(
      employeeWorkedShift({
        ...baseInput,
        employeeId: EMP.bob,
        assignments: [assignment(EMP.alice, TEMPLATE.evening)],
      }),
    ).toBe(false);
  });

  it("returns false when assigned to a different shift on the same day", () => {
    expect(
      employeeWorkedShift({
        ...baseInput,
        employeeId: EMP.alice,
        assignments: [assignment(EMP.alice, TEMPLATE.morning)],
        shiftTemplateId: TEMPLATE.evening,
      }),
    ).toBe(false);
  });

  it("returns false when assigned to the shift on a different date", () => {
    expect(
      employeeWorkedShift({
        ...baseInput,
        employeeId: EMP.alice,
        assignments: [assignment(EMP.alice, TEMPLATE.evening, "2026-07-09")],
      }),
    ).toBe(false);
  });

  it("returns false when there is no attendance", () => {
    expect(
      employeeWorkedShift({
        ...baseInput,
        attendance: [],
      }),
    ).toBe(false);
  });

  it("returns false when attendance has no clock_out", () => {
    expect(
      employeeWorkedShift({
        ...baseInput,
        attendance: [
          {
            ...punch(EMP.alice, 18, 0, 22, 0),
            clock_out: null,
          },
        ],
      }),
    ).toBe(false);
  });

  it("returns false when attendance is on a different calendar date", () => {
    expect(
      employeeWorkedShift({
        ...baseInput,
        attendance: [punch(EMP.alice, 18, 0, 22, 0, "2026-07-09")],
      }),
    ).toBe(false);
  });

  it("returns true when evening punch overlaps the evening shift window", () => {
    expect(employeeWorkedShift(baseInput)).toBe(true);
  });

  it("returns false when employee only worked the morning shift same day", () => {
    expect(
      employeeWorkedShift({
        ...baseInput,
        employeeId: EMP.alice,
        attendance: [punch(EMP.alice, 8, 0, 15, 30)],
      }),
    ).toBe(false);
  });

  it("returns false when punch ends exactly when evening shift starts", () => {
    expect(
      employeeWorkedShift({
        ...baseInput,
        attendance: [punch(EMP.alice, 12, 0, 18, 0)],
      }),
    ).toBe(false);
  });

  it("returns true when punch starts before shift end and ends after shift start", () => {
    expect(
      employeeWorkedShift({
        ...baseInput,
        attendance: [punch(EMP.alice, 17, 30, 18, 30)],
      }),
    ).toBe(true);
  });

  it("returns true for overnight shift when punch crosses midnight inside window", () => {
    expect(
      employeeWorkedShift({
        reportDate: REPORT_DATE,
        shiftTemplateId: TEMPLATE.night,
        employeeId: EMP.bob,
        assignments: [assignment(EMP.bob, TEMPLATE.night)],
        attendance: [punch(EMP.bob, 23, 0, 1, 30)],
        templates,
      }),
    ).toBe(true);
  });

  it("returns false for overnight shift when punch is only during the afternoon", () => {
    expect(
      employeeWorkedShift({
        reportDate: REPORT_DATE,
        shiftTemplateId: TEMPLATE.night,
        employeeId: EMP.bob,
        assignments: [assignment(EMP.bob, TEMPLATE.night)],
        attendance: [punch(EMP.bob, 14, 0, 17, 0)],
        templates,
      }),
    ).toBe(false);
  });

  it("returns true when one of multiple punches overlaps the shift", () => {
    expect(
      employeeWorkedShift({
        ...baseInput,
        attendance: [
          punch(EMP.alice, 8, 0, 12, 0),
          punch(EMP.alice, 19, 0, 23, 0),
        ],
      }),
    ).toBe(true);
  });

  it("returns true when template row is missing but assignment and punch exist", () => {
    expect(
      employeeWorkedShift({
        ...baseInput,
        templates: [],
      }),
    ).toBe(true);
  });
});
