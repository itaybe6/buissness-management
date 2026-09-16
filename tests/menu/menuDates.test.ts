import { describe, expect, it } from "vitest";
import {
  addDays,
  datesInRange,
  indexSales,
  monthEnd,
  monthStart,
  platesProfit,
  weekDays,
  weekStartSunday,
} from "@/lib/menuDates";

describe("שבוע ישראלי מתחיל ביום ראשון", () => {
  it("יום רביעי נופל לשבוע שמתחיל באותו ראשון", () => {
    expect(weekStartSunday("2026-09-16")).toBe("2026-09-13");
  });

  it("ראשון נשאר ראשון", () => {
    expect(weekStartSunday("2026-09-13")).toBe("2026-09-13");
  });

  it("שבעה ימים רצופים", () => {
    expect(weekDays("2026-09-13")).toEqual([
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
    ]);
  });
});

describe("חודש וטווח", () => {
  it("תחילת וסוף ספטמבר", () => {
    expect(monthStart("2026-09-16")).toBe("2026-09-01");
    expect(monthEnd("2026-09-16")).toBe("2026-09-30");
  });

  it("פברואר בשנה לא מעוברת", () => {
    expect(monthEnd("2026-02-10")).toBe("2026-02-28");
  });

  it("datesInRange כולל את הקצוות", () => {
    expect(datesInRange("2026-09-13", "2026-09-15")).toEqual(["2026-09-13", "2026-09-14", "2026-09-15"]);
  });

  it("addDays חוצה חודש", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  });
});

describe("סיכום מכירות ורווח", () => {
  const idx = indexSales([
    { dish_id: "pizza", sold_on: "2026-09-14", quantity: 10 },
    { dish_id: "pizza", sold_on: "2026-09-16", quantity: 4 },
    { dish_id: "burger", sold_on: "2026-09-16", quantity: 7 },
  ]);

  it("סוכם מנה על פני ימים", () => {
    expect(idx.qty("pizza", "2026-09-14")).toBe(10);
    expect(idx.sum("pizza", ["2026-09-14", "2026-09-15", "2026-09-16"])).toBe(14);
    expect(idx.dayTotal("2026-09-16")).toBe(11);
  });

  it("רווח = מנות × רווח לצלחת", () => {
    expect(platesProfit(14, 12.5)).toBe(175);
    expect(platesProfit(0, 12.5)).toBe(0);
    expect(platesProfit(3, null)).toBeNull();
  });
});
