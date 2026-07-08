import { describe, expect, it } from "vitest";
import { filterBonusParticipantsToWorkedShift } from "@/lib/shiftReportBonuses";
import {
  EMP,
  REPORT_DATE,
  TEMPLATE,
  assignment,
  eveningRosterWorked,
  punch,
  templates,
} from "./fixtures";

describe("filterBonusParticipantsToWorkedShift", () => {
  const { assignments, attendance } = eveningRosterWorked();

  it("returns empty array when shift template is null", () => {
    expect(
      filterBonusParticipantsToWorkedShift([EMP.alice, EMP.bob], {
        reportDate: REPORT_DATE,
        shiftTemplateId: null,
        assignments,
        attendance,
        templates,
      }),
    ).toEqual([]);
  });

  it("returns empty array when report date is missing", () => {
    expect(
      filterBonusParticipantsToWorkedShift([EMP.alice], {
        reportDate: "",
        shiftTemplateId: TEMPLATE.evening,
        assignments,
        attendance,
        templates,
      }),
    ).toEqual([]);
  });

  it("keeps only participants who worked the reported shift", () => {
    const requested = [EMP.alice, EMP.bob, EMP.carol, EMP.frank];
    expect(
      filterBonusParticipantsToWorkedShift(requested, {
        reportDate: REPORT_DATE,
        shiftTemplateId: TEMPLATE.evening,
        assignments,
        attendance,
        templates,
      }),
    ).toEqual([EMP.alice, EMP.bob, EMP.carol]);
  });

  it("drops a manager-selected employee who was not assigned to the shift", () => {
    expect(
      filterBonusParticipantsToWorkedShift([EMP.frank], {
        reportDate: REPORT_DATE,
        shiftTemplateId: TEMPLATE.evening,
        assignments,
        attendance: [punch(EMP.frank, 18, 0, 22, 0)],
        templates,
      }),
    ).toEqual([]);
  });

  it("drops a manager-selected employee assigned but without valid attendance", () => {
    expect(
      filterBonusParticipantsToWorkedShift([EMP.dave], {
        reportDate: REPORT_DATE,
        shiftTemplateId: TEMPLATE.evening,
        assignments: [assignment(EMP.dave, TEMPLATE.evening)],
        attendance: [],
        templates,
      }),
    ).toEqual([]);
  });

  it("drops employee assigned to evening but with morning-only attendance", () => {
    expect(
      filterBonusParticipantsToWorkedShift([EMP.eve], {
        reportDate: REPORT_DATE,
        shiftTemplateId: TEMPLATE.evening,
        assignments: [assignment(EMP.eve, TEMPLATE.evening)],
        attendance: [punch(EMP.eve, 7, 30, 15, 0)],
        templates,
      }),
    ).toEqual([]);
  });

  it("preserves the order of the requested participant list", () => {
    const requested = [EMP.eve, EMP.alice, EMP.bob];
    expect(
      filterBonusParticipantsToWorkedShift(requested, {
        reportDate: REPORT_DATE,
        shiftTemplateId: TEMPLATE.evening,
        assignments,
        attendance,
        templates,
      }),
    ).toEqual([EMP.eve, EMP.alice, EMP.bob]);
  });

  it("returns empty when request list is empty", () => {
    expect(
      filterBonusParticipantsToWorkedShift([], {
        reportDate: REPORT_DATE,
        shiftTemplateId: TEMPLATE.evening,
        assignments,
        attendance,
        templates,
      }),
    ).toEqual([]);
  });
});
