import { describe, expect, it } from "vitest";
import { buildBonusCandidatesFromShift } from "@/lib/shiftReportBonuses";
import {
  EMP,
  REPORT_DATE,
  TEMPLATE,
  assignment,
  eveningRosterWorked,
  punch,
  templates,
} from "./fixtures";

describe("buildBonusCandidatesFromShift", () => {
  it("returns empty list when report date is missing", () => {
    expect(
      buildBonusCandidatesFromShift({
        reportDate: "",
        shiftTemplateId: TEMPLATE.evening,
        assignments: [],
        attendance: [],
        templates,
      }),
    ).toEqual([]);
  });

  it("returns empty list when shift template is missing", () => {
    expect(
      buildBonusCandidatesFromShift({
        reportDate: REPORT_DATE,
        shiftTemplateId: "",
        assignments: [],
        attendance: [],
        templates,
      }),
    ).toEqual([]);
  });

  it("includes only employees assigned to the requested shift who worked it", () => {
    const { assignments, attendance } = eveningRosterWorked();
    expect(
      buildBonusCandidatesFromShift({
        reportDate: REPORT_DATE,
        shiftTemplateId: TEMPLATE.evening,
        assignments,
        attendance,
        templates,
      }),
    ).toEqual([EMP.alice, EMP.bob, EMP.carol, EMP.dave, EMP.eve]);
  });

  it("excludes assigned evening workers without attendance", () => {
    const { assignments } = eveningRosterWorked();
    expect(
      buildBonusCandidatesFromShift({
        reportDate: REPORT_DATE,
        shiftTemplateId: TEMPLATE.evening,
        assignments,
        attendance: [punch(EMP.alice, 18, 0, 22, 0)],
        templates,
      }),
    ).toEqual([EMP.alice]);
  });

  it("excludes workers assigned to evening but who only punched morning hours", () => {
    expect(
      buildBonusCandidatesFromShift({
        reportDate: REPORT_DATE,
        shiftTemplateId: TEMPLATE.evening,
        assignments: [
          assignment(EMP.alice, TEMPLATE.evening),
          assignment(EMP.bob, TEMPLATE.evening),
        ],
        attendance: [
          punch(EMP.alice, 18, 0, 22, 0),
          punch(EMP.bob, 8, 0, 15, 0),
        ],
        templates,
      }),
    ).toEqual([EMP.alice]);
  });

  it("excludes workers assigned to a different shift on the same date", () => {
    expect(
      buildBonusCandidatesFromShift({
        reportDate: REPORT_DATE,
        shiftTemplateId: TEMPLATE.evening,
        assignments: [
          assignment(EMP.alice, TEMPLATE.morning),
          assignment(EMP.bob, TEMPLATE.evening),
        ],
        attendance: [
          punch(EMP.alice, 8, 0, 15, 0),
          punch(EMP.bob, 18, 0, 22, 0),
        ],
        templates,
      }),
    ).toEqual([EMP.bob]);
  });

  it("deduplicates duplicate assignments for the same employee", () => {
    expect(
      buildBonusCandidatesFromShift({
        reportDate: REPORT_DATE,
        shiftTemplateId: TEMPLATE.evening,
        assignments: [
          assignment(EMP.alice, TEMPLATE.evening),
          assignment(EMP.alice, TEMPLATE.evening),
        ],
        attendance: [punch(EMP.alice, 18, 0, 22, 0)],
        templates,
      }),
    ).toEqual([EMP.alice]);
  });

  it("ignores assignments from other dates", () => {
    expect(
      buildBonusCandidatesFromShift({
        reportDate: REPORT_DATE,
        shiftTemplateId: TEMPLATE.evening,
        assignments: [assignment(EMP.alice, TEMPLATE.evening, "2026-07-09")],
        attendance: [punch(EMP.alice, 18, 0, 22, 0)],
        templates,
      }),
    ).toEqual([]);
  });
});
