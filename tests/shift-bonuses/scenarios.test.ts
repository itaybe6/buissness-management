import { describe, expect, it } from "vitest";
import {
  buildBonusCandidatesFromShift,
  computeShiftBonusAmounts,
  filterBonusParticipantsToWorkedShift,
} from "@/lib/shiftReportBonuses";
import {
  EMP,
  REPORT_DATE,
  TEMPLATE,
  assignment,
  eveningRosterWorked,
  punch,
  templates,
} from "./fixtures";

/**
 * End-to-end business scenarios mirroring the shift-report save pipeline:
 * UI candidate list → manager selection → server-side filter → bonus rows.
 */
describe("shift bonus scenarios", () => {
  it("scenario: five evening workers split ₪500 from ₪10,000 at 5% service", () => {
    const totalSales = 10_000;
    const servicePct = 5;
    const { assignments, attendance } = eveningRosterWorked();

    const candidates = buildBonusCandidatesFromShift({
      reportDate: REPORT_DATE,
      shiftTemplateId: TEMPLATE.evening,
      assignments,
      attendance,
      templates,
    });
    expect(candidates).toHaveLength(5);

    const managerSelection = candidates;
    const validated = filterBonusParticipantsToWorkedShift(managerSelection, {
      reportDate: REPORT_DATE,
      shiftTemplateId: TEMPLATE.evening,
      assignments,
      attendance,
      templates,
    });
    expect(validated).toEqual(managerSelection);

    const { pool, perEmployee } = computeShiftBonusAmounts(totalSales, servicePct, validated);
    expect(pool).toBe(500);
    expect(perEmployee).toBe(100);
    expect(perEmployee * validated.length).toBe(500);
  });

  it("scenario: manager tries to add a non-assigned ringer — server strips them", () => {
    const { assignments, attendance } = eveningRosterWorked();
    const tamperedSelection = [EMP.alice, EMP.bob, EMP.frank];

    const validated = filterBonusParticipantsToWorkedShift(tamperedSelection, {
      reportDate: REPORT_DATE,
      shiftTemplateId: TEMPLATE.evening,
      assignments,
      attendance: [...attendance, punch(EMP.frank, 18, 0, 22, 0)],
      templates,
    });

    expect(validated).toEqual([EMP.alice, EMP.bob]);
    expect(validated).not.toContain(EMP.frank);
  });

  it("scenario: worker switched from morning to evening assignment but only punched morning", () => {
    const assignments = [
      assignment(EMP.carol, TEMPLATE.evening),
      assignment(EMP.carol, TEMPLATE.morning, REPORT_DATE),
    ];
    const attendance = [punch(EMP.carol, 8, 0, 15, 30)];

    const candidates = buildBonusCandidatesFromShift({
      reportDate: REPORT_DATE,
      shiftTemplateId: TEMPLATE.evening,
      assignments,
      attendance,
      templates,
    });

    expect(candidates).not.toContain(EMP.carol);

    const validated = filterBonusParticipantsToWorkedShift([EMP.carol], {
      reportDate: REPORT_DATE,
      shiftTemplateId: TEMPLATE.evening,
      assignments,
      attendance,
      templates,
    });
    expect(validated).toEqual([]);
  });

  it("scenario: re-saving after attendance removed drops the employee from payout", () => {
    const assignments = [
      assignment(EMP.dave, TEMPLATE.evening),
      assignment(EMP.eve, TEMPLATE.evening),
    ];

    const withAttendance = [punch(EMP.dave, 18, 0, 22, 0), punch(EMP.eve, 18, 0, 22, 0)];
    const firstSave = filterBonusParticipantsToWorkedShift([EMP.dave, EMP.eve], {
      reportDate: REPORT_DATE,
      shiftTemplateId: TEMPLATE.evening,
      assignments,
      attendance: withAttendance,
      templates,
    });
    expect(firstSave).toEqual([EMP.dave, EMP.eve]);

    const afterDaveRemovedAttendance = [punch(EMP.eve, 18, 0, 22, 0)];
    const secondSave = filterBonusParticipantsToWorkedShift([EMP.dave, EMP.eve], {
      reportDate: REPORT_DATE,
      shiftTemplateId: TEMPLATE.evening,
      assignments,
      attendance: afterDaveRemovedAttendance,
      templates,
    });
    expect(secondSave).toEqual([EMP.eve]);
  });

  it("scenario: no bonus rows when service percent is zero even with valid workers", () => {
    const { assignments, attendance } = eveningRosterWorked();
    const validated = filterBonusParticipantsToWorkedShift(
      [EMP.alice, EMP.bob, EMP.carol, EMP.dave, EMP.eve],
      {
        reportDate: REPORT_DATE,
        shiftTemplateId: TEMPLATE.evening,
        assignments,
        attendance,
        templates,
      },
    );
    const { pool, perEmployee } = computeShiftBonusAmounts(10_000, 0, validated);
    expect(pool).toBe(0);
    expect(perEmployee).toBe(0);
  });

  it("scenario: UI candidate list matches what server will accept on save", () => {
    const assignments = [
      assignment(EMP.alice, TEMPLATE.evening),
      assignment(EMP.bob, TEMPLATE.evening),
      assignment(EMP.carol, TEMPLATE.morning),
    ];
    const attendance = [
      punch(EMP.alice, 18, 0, 22, 0),
      punch(EMP.bob, 8, 0, 15, 0),
      punch(EMP.carol, 8, 0, 15, 0),
    ];

    const uiCandidates = buildBonusCandidatesFromShift({
      reportDate: REPORT_DATE,
      shiftTemplateId: TEMPLATE.evening,
      assignments,
      attendance,
      templates,
    });

    const serverAccepted = filterBonusParticipantsToWorkedShift(uiCandidates, {
      reportDate: REPORT_DATE,
      shiftTemplateId: TEMPLATE.evening,
      assignments,
      attendance,
      templates,
    });

    expect(serverAccepted).toEqual(uiCandidates);
    expect(serverAccepted).toEqual([EMP.alice]);
  });

  it("scenario: monthly employee total equals sum of per-shift bonuses", () => {
    const shiftBonuses = [
      { employee_id: EMP.alice, amount: 100, shift_date: "2026-07-01" },
      { employee_id: EMP.alice, amount: 120, shift_date: "2026-07-08" },
      { employee_id: EMP.alice, amount: 90, shift_date: "2026-07-15" },
    ];

    const monthlyTotal = shiftBonuses
      .filter((b) => b.employee_id === EMP.alice)
      .reduce((sum, b) => sum + b.amount, 0);

    expect(monthlyTotal).toBe(310);
  });

  it("scenario: changing selected count recalculates per-employee share from same pool", () => {
    const totalSales = 20_000;
    const servicePct = 2.5;
    const pool = computeShiftBonusAmounts(totalSales, servicePct, [EMP.alice]).pool;
    expect(pool).toBe(500);

    const three = computeShiftBonusAmounts(totalSales, servicePct, [EMP.alice, EMP.bob, EMP.carol]);
    const five = computeShiftBonusAmounts(totalSales, servicePct, [
      EMP.alice,
      EMP.bob,
      EMP.carol,
      EMP.dave,
      EMP.eve,
    ]);

    expect(three.pool).toBe(500);
    expect(five.pool).toBe(500);
    expect(three.perEmployee).toBe(166.67);
    expect(five.perEmployee).toBe(100);
  });
});
