import { describe, expect, it } from "vitest";
import { getHebrewDayInfo, getHolidayForDate } from "@/lib/hebrewCalendar";

describe("hebrewCalendar", () => {
  it("marks Pesach I daytime (Israel civil date) as a major holiday", () => {
    const info = getHebrewDayInfo("2026-04-02");
    expect(info.holiday).toBe("פסח א׳");
    expect(info.isMajor).toBe(true);
    expect(info.hebrewDate).toContain("ניסן");
  });

  it("marks Yom Kippur daytime as a major holiday", () => {
    const info = getHebrewDayInfo("2026-09-21");
    expect(info.holiday).toBe("יום כיפור");
    expect(info.isMajor).toBe(true);
  });

  it("marks Yom HaAtzmaut as a major national day", () => {
    const info = getHebrewDayInfo("2026-04-22");
    expect(info.holiday).toBe("יום העצמאות");
    expect(info.isMajor).toBe(true);
  });

  it("prefers Erev Pesach over Ta'anit Bechorot on the same day", () => {
    expect(getHolidayForDate("2026-04-01")).toBe("ערב פסח");
  });

  it("collapses Chanukah candle days to חנוכה", () => {
    expect(getHolidayForDate("2026-12-05")).toBe("חנוכה");
  });

  it("ignores fringe modern observances like Hebrew Language Day", () => {
    expect(getHolidayForDate("2026-01-08")).toBeNull();
  });

  it("returns hebrew date without a holiday on ordinary days", () => {
    const info = getHebrewDayInfo("2026-07-16");
    expect(info.holiday).toBeNull();
    expect(info.hebrewDate.length).toBeGreaterThan(2);
  });
});
