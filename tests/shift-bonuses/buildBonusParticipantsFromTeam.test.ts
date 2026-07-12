import { describe, expect, it } from "vitest";
import { buildBonusParticipantsFromTeam } from "@/lib/shiftReportBonuses";

describe("buildBonusParticipantsFromTeam", () => {
  const profiles = [
    { id: "a", bonus_pct: 5 },
    { id: "b", bonus_pct: 0 },
    { id: "c", bonus_pct: 3 },
  ];

  it("returns only team members with bonus_pct > 0", () => {
    expect(buildBonusParticipantsFromTeam(["a", "b", "c", "missing"], profiles)).toEqual([
      { employee_id: "a", bonus_pct: 5 },
      { employee_id: "c", bonus_pct: 3 },
    ]);
  });

  it("deduplicates employee ids", () => {
    expect(buildBonusParticipantsFromTeam(["a", "a"], profiles)).toEqual([
      { employee_id: "a", bonus_pct: 5 },
    ]);
  });
});
