/**
 * המנהל מדווח בלאי — מוצר שנשבר, פג תוקף או נזרק.
 *
 * לדיווח יש שני מצבים: «דווח בלבד» (רק תיעוד) ו«הופחת מהמלאי» (משנה כמות).
 * הבדיקות מוודאות שההפחתה מדויקת, שהיא לא מורידה מלאי מתחת לאפס, ושהרשימה
 * שהמנהל רואה מקובצת נכון לימים.
 */
import { describe, expect, it } from "vitest";
import {
  WASTE_LOW_STOCK_FALLBACK,
  formatWasteQty,
  groupWasteByDay,
  wasteDayKey,
  wasteDayLabel,
  wasteStockStatus,
} from "@/lib/wasteReport";
import { nextWarehouseQty } from "@/lib/inventoryReceive";
import { isTrackedLowStock } from "@/api/inventory";
import { makeItemWithQty, makeWaste } from "../helpers/factories";

const TODAY = "2026-07-08";

describe("סטטוס המלאי שמוצג ליד כל מוצר", () => {
  it("כמות אפס — «אזל מהמלאי»", () => {
    expect(wasteStockStatus({ current_qty: 0, min_quantity: 5 })).toBe("empty");
    expect(wasteStockStatus({ current_qty: 0, min_quantity: 0 })).toBe("empty");
  });

  it("כמות מתחת או שווה למינימום — «מלאי נמוך»", () => {
    expect(wasteStockStatus({ current_qty: 3, min_quantity: 5 })).toBe("low");
    expect(wasteStockStatus({ current_qty: 5, min_quantity: 5 })).toBe("low");
  });

  it("כמות מעל המינימום — «במלאי»", () => {
    expect(wasteStockStatus({ current_qty: 6, min_quantity: 5 })).toBe("ok");
  });

  it("מוצר בלי מינימום מוגדר משתמש בסף ברירת מחדל", () => {
    expect(WASTE_LOW_STOCK_FALLBACK).toBe(3);
    expect(wasteStockStatus({ current_qty: 3, min_quantity: 0 })).toBe("low");
    expect(wasteStockStatus({ current_qty: 4, min_quantity: 0 })).toBe("ok");
  });

  it("שונה מהתראת החוסר בקטלוג — שם מוצר בלי מינימום לא מתריע בכלל", () => {
    const item = makeItemWithQty({ current_qty: 3, min_quantity: 0 });
    expect(isTrackedLowStock(item)).toBe(false);
    expect(wasteStockStatus(item)).toBe("low");
  });

  it("כמות שברירית מתחת לסף עדיין נמוכה", () => {
    expect(wasteStockStatus({ current_qty: 0.5, min_quantity: 0 })).toBe("low");
  });
});

describe("הפחתת בלאי מהמלאי", () => {
  it("«הופחת מהמלאי» מוריד את הכמות", () => {
    expect(nextWarehouseQty(20, -3)).toBe(17);
  });

  it("הפחתה של כל המלאי מגיעה בדיוק לאפס", () => {
    expect(nextWarehouseQty(3, -3)).toBe(0);
  });

  it("דיווח בלאי גדול מהמלאי הקיים נחסם — המלאי לא הופך שלילי", () => {
    expect(() => nextWarehouseQty(2, -5)).toThrow();
  });

  it("«דווח בלבד» לא נוגע במלאי", () => {
    const reported = makeWaste({ deducted: false, quantity: 4 });
    expect(reported.deducted).toBe(false);
    expect(nextWarehouseQty(20, 0)).toBe(20);
  });

  it("שני דיווחים באותו יום מצטברים", () => {
    let stock = 20;
    stock = nextWarehouseQty(stock, -3);
    stock = nextWarehouseQty(stock, -2);
    expect(stock).toBe(15);
  });
});

describe("תצוגת הכמות שנזרקה", () => {
  it("כמות עם יחידת מידה, תמיד עם מינוס", () => {
    const item = makeItemWithQty({ unit: "ארגז", units_per_package: 24 });
    expect(formatWasteQty({ quantity: 2 }, item)).toBe("−2 ארגז (48 יח׳)");
  });

  it("יחידת בסיס לא מציגה המרה לבודדים", () => {
    const item = makeItemWithQty({ unit: "יחידות", units_per_package: null });
    expect(formatWasteQty({ quantity: 5 }, item)).toBe("−5 יחידות");
  });

  it("יחידת אריזה בלי גודל אריזה לא מציגה המרה", () => {
    const item = makeItemWithQty({ unit: "ק״ג", units_per_package: null });
    expect(formatWasteQty({ quantity: 1.5 }, item)).toBe("−1.5 ק״ג");
  });

  it("מוצר שנמחק מהקטלוג — מוצגת הכמות בלבד ובלי קריסה", () => {
    expect(formatWasteQty({ quantity: 3 }, undefined)).toBe("−3");
  });

  it("כמות שברירית מומרת נכון לבודדים", () => {
    const item = makeItemWithQty({ unit: "ארגז", units_per_package: 6 });
    expect(formatWasteQty({ quantity: 0.5 }, item)).toBe("−0.5 ארגז (3 יח׳)");
  });
});

describe("קיבוץ הדיווחים לימים", () => {
  it("יום ההיום ואתמול מקבלים תווית מילולית", () => {
    expect(wasteDayLabel(TODAY, TODAY)).toBe("היום");
    expect(wasteDayLabel("2026-07-07", TODAY)).toBe("אתמול");
  });

  it("יום קודם מקבל שם יום ותאריך", () => {
    const label = wasteDayLabel("2026-07-02", TODAY);
    expect(label).toContain("·");
    expect(label).not.toBe("היום");
    expect(label).not.toBe("אתמול");
  });

  it("מפתח היום נגזר מהשעון המקומי, לא מ-UTC", () => {
    expect(wasteDayKey("2026-07-08T23:30:00")).toBe("2026-07-08");
    expect(wasteDayKey("2026-07-08T00:10:00")).toBe("2026-07-08");
  });

  it("דיווחים מאותו יום נכנסים לקבוצה אחת", () => {
    const list = [
      makeWaste({ created_at: `${TODAY}T20:00:00` }),
      makeWaste({ created_at: `${TODAY}T14:00:00` }),
      makeWaste({ created_at: "2026-07-07T18:00:00" }),
    ];
    const groups = groupWasteByDay(list, TODAY);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ day: TODAY, label: "היום" });
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1]).toMatchObject({ day: "2026-07-07", label: "אתמול" });
  });

  it("הסדר המקורי נשמר — לא ממיינים מחדש", () => {
    const list = [
      makeWaste({ id: "w1", created_at: `${TODAY}T20:00:00` }),
      makeWaste({ id: "w2", created_at: `${TODAY}T09:00:00` }),
    ];
    expect(groupWasteByDay(list, TODAY)[0].items.map((w) => w.id)).toEqual(["w1", "w2"]);
  });

  it("רשימה ריקה מחזירה אפס קבוצות", () => {
    expect(groupWasteByDay([], TODAY)).toEqual([]);
  });

  it("כל הדיווחים מאותו יום — קבוצה אחת בלבד", () => {
    const list = Array.from({ length: 20 }, (_, i) =>
      makeWaste({ created_at: `${TODAY}T${String(i % 24).padStart(2, "0")}:00:00` }),
    );
    const groups = groupWasteByDay(list, TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(20);
  });

  it("אף דיווח לא נעלם בקיבוץ", () => {
    const list = [
      makeWaste({ created_at: `${TODAY}T20:00:00` }),
      makeWaste({ created_at: "2026-07-07T18:00:00" }),
      makeWaste({ created_at: "2026-07-02T10:00:00" }),
      makeWaste({ created_at: "2026-07-02T09:00:00" }),
    ];
    const groups = groupWasteByDay(list, TODAY);
    expect(groups.reduce((s, g) => s + g.items.length, 0)).toBe(list.length);
  });
});
