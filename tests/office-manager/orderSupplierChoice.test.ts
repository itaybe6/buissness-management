/**
 * ממשק מנהלת המשרד — בחירת ספק לכל מוצר בתוך הזמנה אחת.
 *
 * בעמוד «הזמנה חדשה» כל מוצר נבחר מספק אחר, ולכן ההזמנה מתפצלת בסוף לאצווה
 * אחת לכל ספק. כאן נבדק מה המשתמש רואה כשהוא בוחר: אילו ספקים מוצעים, מי הזול
 * ביותר, ואיך מחושבים הסכומים לכל ספק ולהזמנה כולה.
 */
import { describe, expect, it } from "vitest";
import type { SupplierItemPriceIndex } from "@/api/suppliers";
import {
  defaultSupplierChoice,
  deliveryDayLabel,
  deliveryDaysLabel,
  draftLinesTotal,
  formatPrice,
  groupDraftLinesBySupplier,
  itemSupplierChoices,
  orderCalcLabel,
  supplierUnitPrices,
  type DraftOrderLine,
  type SupplierBasics,
} from "@/lib/orderSuppliers";
import { orderDeliversToday, type OrderLine } from "@/components/inventory/orderBatchUi";
import type { Supplier } from "@/types/database";

const CRATE = { id: "item-beer", units_per_package: 24 };

function suppliers(...names: [string, string, number[] | null][]): SupplierBasics[] {
  return names.map(([id, name, delivery_days]) => ({ id, name, delivery_days }));
}

function priceIndex(entries: [string, [string, { main?: number; piece?: number }][]][]): SupplierItemPriceIndex {
  return new Map(entries.map(([supplierId, items]) => [supplierId, new Map(items)]));
}

describe("אילו ספקים מוצעים למוצר", () => {
  const list = suppliers(["sup-a", "אלפא", [1]], ["sup-b", "בטא", [3]], ["sup-c", "גמא", null]);

  it("ספקים שיש להם מחירון למוצר מוצגים, מהזול ליקר — בלי ספקים בלי מחיר", () => {
    const index = priceIndex([
      ["sup-b", [["item-beer", { main: 90 }]]],
      ["sup-a", [["item-beer", { main: 120 }]]],
    ]);
    const choices = itemSupplierChoices(CRATE, list, index);
    expect(choices.map((c) => c.supplier_id)).toEqual(["sup-b", "sup-a"]);
    expect(choices[0].unit_price).toBe(90);
  });

  it("הספק הזול ביותר מסומן — וכשיש תיקו אף אחד לא מסומן", () => {
    const cheapest = itemSupplierChoices(
      CRATE,
      list,
      priceIndex([
        ["sup-a", [["item-beer", { main: 120 }]]],
        ["sup-b", [["item-beer", { main: 90 }]]],
      ]),
    );
    expect(cheapest.find((c) => c.cheapest)?.supplier_id).toBe("sup-b");

    const tie = itemSupplierChoices(
      CRATE,
      list,
      priceIndex([
        ["sup-a", [["item-beer", { main: 100 }]]],
        ["sup-b", [["item-beer", { main: 100 }]]],
      ]),
    );
    expect(tie.some((c) => c.cheapest)).toBe(false);
  });

  it("ספק בודד לא מסומן כ«הזול ביותר» — אין למה להשוות", () => {
    const choices = itemSupplierChoices(CRATE, list, priceIndex([["sup-a", [["item-beer", { main: 120 }]]]]));
    expect(choices.some((c) => c.cheapest)).toBe(false);
  });

  it("מחיר ליחידה בודדת מומר למחיר ליחידה ראשית לפי גודל האריזה", () => {
    const choices = itemSupplierChoices(CRATE, list, priceIndex([["sup-a", [["item-beer", { piece: 5 }]]]]));
    expect(choices[0].unit_price).toBe(120);
    expect(choices[0].listed).toBe(true);
  });

  it("ספק שהמוצר במחירון שלו בלי מחיר תקף לא מוצע להזמנה", () => {
    const choices = itemSupplierChoices(CRATE, list, priceIndex([["sup-a", [["item-beer", { main: 0 }]]]]));
    expect(choices).toEqual([]);
  });

  it("בלי מחירון בכלל — אין ספקים להזמנה", () => {
    const choices = itemSupplierChoices(CRATE, list, undefined);
    expect(choices).toEqual([]);
  });

  it("בלי ספקים במערכת אין מה לבחור", () => {
    expect(itemSupplierChoices(CRATE, [], priceIndex([]))).toEqual([]);
  });
});

describe("איזה ספק נבחר כברירת מחדל", () => {
  const list = suppliers(["sup-a", "אלפא", 1], ["sup-b", "בטא", 3]);
  const index = priceIndex([
    ["sup-a", [["item-beer", { main: 120 }]]],
    ["sup-b", [["item-beer", { main: 90 }]]],
  ]);

  it("ברירת המחדל היא הספק הזול ביותר שיש לו מחיר", () => {
    expect(defaultSupplierChoice(itemSupplierChoices(CRATE, list, index))).toBe("sup-b");
  });

  it("ספק שהמשתמש הגיע ממנו (מעמוד הספק) מנצח את ברירת המחדל", () => {
    expect(defaultSupplierChoice(itemSupplierChoices(CRATE, list, index), "sup-a")).toBe("sup-a");
  });

  it("ספק מועדף שלא קיים יותר נופל חזרה לברירת המחדל", () => {
    expect(defaultSupplierChoice(itemSupplierChoices(CRATE, list, index), "sup-deleted")).toBe("sup-b");
  });

  it("בלי מחירים בכלל אין ספק ברירת מחדל, ובלי ספקים — מחרוזת ריקה", () => {
    expect(defaultSupplierChoice(itemSupplierChoices(CRATE, list, undefined))).toBe("");
    expect(defaultSupplierChoice([])).toBe("");
  });
});

describe("מחיר הספק לכל יחידת מידה", () => {
  const crate = { unit: "ארגז", units_per_package: 24, piece_unit: "בקבוק" };

  it("מחיר לארגז מוצג כמו שהוזן, ומחיר ליחידה מחושב ממנו", () => {
    const [perCrate, perPiece] = supplierUnitPrices(crate, { main: 100 });
    expect(perCrate).toEqual({ label: "ארגז", price: 100, derived: false });
    expect(perPiece).toEqual({ label: "בקבוק", price: 4.1667, derived: true });
  });

  it("כשהוזן רק מחיר ליחידה — הוא המקורי והארגז הוא המחושב", () => {
    const [perCrate, perPiece] = supplierUnitPrices(crate, { piece: 5 });
    expect(perCrate).toEqual({ label: "ארגז", price: 120, derived: true });
    expect(perPiece).toEqual({ label: "בקבוק", price: 5, derived: false });
  });

  it("מוצר שנמכר ביחידות בלבד מקבל שורת מחיר אחת", () => {
    expect(supplierUnitPrices({ unit: "יחידות", units_per_package: null }, { main: 8 })).toEqual([
      { label: "יחידות", price: 8, derived: false },
    ]);
  });

  it("מוצר במשקל (בלי גודל אריזה) לא מקבל מחיר ליחידה בודדת", () => {
    expect(supplierUnitPrices({ unit: "ק״ג", units_per_package: null }, { main: 32 })).toEqual([
      { label: "ק״ג", price: 32, derived: false },
    ]);
  });

  it("בלי מחיר אצל הספק אין מה להציג", () => {
    expect(supplierUnitPrices(crate, null)).toEqual([]);
    expect(supplierUnitPrices(crate, {})).toEqual([]);
    expect(supplierUnitPrices(crate, { main: 0 })).toEqual([]);
  });

  it("מוצר בלי יחידת מידה מוגדרת מתומחר «ליחידה»", () => {
    expect(supplierUnitPrices({ unit: null, units_per_package: null }, { main: 8 })[0].label).toBe("יחידה");
  });
});

describe("פירוק הסכום שהמשתמש רואה", () => {
  const crate = { unit: "ארגז", units_per_package: 24 };

  it("ארגזים ויחידות בודדות מוצגים כל אחד במחיר שלו", () => {
    expect(orderCalcLabel(crate, { packs: 1, pieces: 2 }, { main: 100 })).toBe(
      "1 ארגז × ₪100 + 2 יחידות × ₪4.17",
    );
  });

  it("רק ארגזים — בלי שורת יחידות מיותרת", () => {
    expect(orderCalcLabel(crate, { packs: 3, pieces: 0 }, { main: 100 })).toBe("3 ארגז × ₪100");
  });

  it("רק יחידות בודדות", () => {
    expect(orderCalcLabel(crate, { packs: 0, pieces: 5 }, { main: 100 })).toBe("5 יחידות × ₪4.17");
  });

  it("בלי מחיר מוצגת רק הכמות", () => {
    expect(orderCalcLabel(crate, { packs: 2, pieces: 3 }, null)).toBe("2 ארגז + 3 יחידות");
  });

  it("מוצר שנמכר ביחידות בלבד לא מפוצל לשני חלקים", () => {
    expect(orderCalcLabel({ unit: "יחידות", units_per_package: null }, { packs: 4, pieces: 7 }, { main: 8 })).toBe(
      "4 יחידות × ₪8",
    );
  });

  it("כמות אפס מחזירה מחרוזת ריקה", () => {
    expect(orderCalcLabel(crate, { packs: 0, pieces: 0 }, { main: 100 })).toBe("");
  });
});

describe("פיצול ההזמנה לספקים וחישוב הסכומים", () => {
  function line(over: Partial<DraftOrderLine> = {}): DraftOrderLine {
    return {
      item_id: "item-beer",
      name: "בירה",
      image_url: null,
      unit: "ארגז",
      units_per_package: 24,
      supplier_id: "sup-a",
      quantity: 2,
      qty_label: "2 ארגז",
      calc_label: "2 ארגז × ₪90",
      unit_price: 90,
      line_total: 180,
      ...over,
    };
  }

  const list = suppliers(["sup-a", "בטא", [3]], ["sup-b", "אלפא", [1]]);

  it("כל ספק מקבל קבוצה משלו עם סכום משלו", () => {
    const groups = groupDraftLinesBySupplier(
      [
        line({ item_id: "item-1", supplier_id: "sup-a", line_total: 180 }),
        line({ item_id: "item-2", supplier_id: "sup-b", line_total: 45.5 }),
        line({ item_id: "item-3", supplier_id: "sup-a", line_total: 20 }),
      ],
      list,
    );
    expect(groups).toHaveLength(2);
    // מסודר לפי שם הספק בעברית, לא לפי סדר ההוספה לעגלה
    expect(groups.map((g) => g.name)).toEqual(["אלפא", "בטא"]);
    expect(groups.find((g) => g.supplier_id === "sup-a")!.total).toBe(200);
    expect(groups.find((g) => g.supplier_id === "sup-b")!.total).toBe(45.5);
  });

  it("סדר המוצרים בתוך קבוצת ספק נשמר", () => {
    const groups = groupDraftLinesBySupplier(
      [line({ item_id: "first" }), line({ item_id: "second" }), line({ item_id: "third" })],
      list,
    );
    expect(groups[0].lines.map((l) => l.item_id)).toEqual(["first", "second", "third"]);
  });

  it("מוצרים ללא מחיר נספרים כדי להסביר שהסכום חלקי", () => {
    const groups = groupDraftLinesBySupplier(
      [line({ item_id: "item-1" }), line({ item_id: "item-2", unit_price: 0, line_total: 0 })],
      list,
    );
    expect(groups[0].unpriced_count).toBe(1);
    expect(groups[0].total).toBe(180);
  });

  it("ספק שנמחק מהמערכת עדיין מקבל קבוצה מזוהה ולא קורס", () => {
    const groups = groupDraftLinesBySupplier([line({ supplier_id: "sup-gone" })], list);
    expect(groups[0].name).toBe("ספק לא ידוע");
    expect(groups[0].delivery_days).toBeNull();
  });

  it("ימי האספקה נלקחים מהספק", () => {
    const groups = groupDraftLinesBySupplier([line({ supplier_id: "sup-b" })], list);
    expect(groups[0].delivery_days).toEqual([1]);
  });

  it("עגלה ריקה מחזירה אפס קבוצות ואפס סכום", () => {
    expect(groupDraftLinesBySupplier([], list)).toEqual([]);
    expect(draftLinesTotal([])).toBe(0);
  });

  it("הסכום הסופי מחבר את כל הספקים ומעוגל לאגורות", () => {
    const lines = [
      line({ item_id: "item-1", line_total: 0.1 }),
      line({ item_id: "item-2", supplier_id: "sup-b", line_total: 0.2 }),
    ];
    expect(draftLinesTotal(lines)).toBe(0.3);
  });
});

describe("תצוגה למשתמש", () => {
  it("מחירים שומרים אגורות במקום להתעגל לשקל", () => {
    expect(formatPrice(12.5)).toBe("₪12.5");
    expect(formatPrice(0.333)).toBe("₪0.33");
    expect(formatPrice(0)).toBe("₪0");
  });

  it("ימי אספקה מוצגים בעברית, וללא הגדרה נאמר במפורש", () => {
    expect(deliveryDaysLabel([0])).toBe("יום ראשון");
    expect(deliveryDaysLabel([0, 2, 5])).toBe("יום ראשון, יום שלישי, יום שישי");
    expect(deliveryDaysLabel([6])).toBe("יום שבת");
    expect(deliveryDaysLabel(null)).toBe("לא הוגדר");
    expect(deliveryDaysLabel([])).toBe("לא הוגדר");
    expect(deliveryDayLabel(0)).toBe("יום ראשון");
    expect(deliveryDayLabel(9)).toBe("לא הוגדר");
  });

  it("הזמנה פתוחה מסומנת כ«אמור להגיע היום» כשיום האספקה של הספק הוא היום", () => {
    const supplierList: Supplier[] = [
      { id: "sup-a", name: "אלפא", delivery_days: [5], order_days: null, active: true, business_id: "b1", phone: null, tax_id: null, notes: null, created_at: "" },
    ];
    const sunday = new Date("2026-08-02T10:00:00"); // יום ראשון
    const friday = new Date("2026-08-07T10:00:00"); // יום שישי
    const line: OrderLine = {
      id: "o1",
      item_id: "item-1",
      supplier_id: "sup-a",
      quantity: 2,
      status: "pending",
      business_id: "b1",
      batch_id: "batch-1",
      created_at: friday.toISOString(),
      ordered_by: null,
      ordered_by_name: null,
      supplier_name: "אלפא",
      received_quantity: null,
    };

    expect(orderDeliversToday([line], supplierList, friday)).toBe(true);
    expect(orderDeliversToday([line], supplierList, sunday)).toBe(false);
    expect(orderDeliversToday([{ ...line, status: "received" }], supplierList, friday)).toBe(true);
  });
});
