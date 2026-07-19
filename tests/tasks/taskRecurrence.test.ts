import { describe, expect, it } from "vitest";
import {
  RECURRENCE_EVERY_DAY,
  formatRecurrenceWeekday,
  matchesRecurrenceWeekday,
  serializeRecurrenceWeekdays,
  toggleRecurrenceDay,
} from "@/lib/taskRecurrence";

describe("multi-day recurrence", () => {
  it("matches any selected weekday", () => {
    expect(matchesRecurrenceWeekday([0, 2, 4], 0)).toBe(true);
    expect(matchesRecurrenceWeekday([0, 2, 4], 1)).toBe(false);
    expect(matchesRecurrenceWeekday([0, 2, 4], 2)).toBe(true);
  });

  it("treats -1 and full week as every day", () => {
    expect(matchesRecurrenceWeekday([RECURRENCE_EVERY_DAY], 3)).toBe(true);
    expect(matchesRecurrenceWeekday([0, 1, 2, 3, 4, 5, 6], 5)).toBe(true);
  });

  it("formats multiple days", () => {
    expect(formatRecurrenceWeekday([0])).toBe("כל ראשון");
    expect(formatRecurrenceWeekday([0, 2, 4])).toBe("א׳ · ג׳ · ה׳");
    expect(formatRecurrenceWeekday([RECURRENCE_EVERY_DAY])).toBe("כל יום");
  });

  it("toggles days and collapses to every-day", () => {
    expect(toggleRecurrenceDay([0], 2)).toEqual([0, 2]);
    expect(toggleRecurrenceDay([0, 2], 0)).toEqual([2]);
    expect(toggleRecurrenceDay([RECURRENCE_EVERY_DAY], 1)).toEqual([0, 2, 3, 4, 5, 6]);
    expect(serializeRecurrenceWeekdays([0, 1, 2, 3, 4, 5, 6])).toEqual([RECURRENCE_EVERY_DAY]);
  });

  it("normalizes legacy scalar values", () => {
    expect(matchesRecurrenceWeekday(2, 2)).toBe(true);
    expect(matchesRecurrenceWeekday(2, 3)).toBe(false);
    expect(formatRecurrenceWeekday(-1)).toBe("כל יום");
  });
});
