/**
 * ממשק מנהלת המשרד — מחסנים וקטלוג המוצרים.
 *
 * בחירת מחסן ברירת המחדל היא נקודת כשל שקטה: אם היא מחזירה null, קבלת
 * סחורה ודיווח בלאי נופלים עם "לא נמצא מחסן". לכן נבדקות כאן כל הנפילות
 * לאחור — עסק בלי מחסן מסומן, מחסן שנמחק, ורשימה שעוד לא נטענה.
 */
import { describe, expect, it } from "vitest";
import { defaultWarehouse, warehouseById } from "@/api/warehouses";
import {
  inventoryCategoryById,
  inventoryCategoryName,
  nextInventoryCategoryColor,
} from "@/api/inventoryCategories";
import { WAREHOUSE, makeInventoryCategory, makeWarehouse } from "../helpers/factories";

describe("בחירת מחסן ברירת מחדל", () => {
  it("בוחר את המחסן המסומן כברירת מחדל", () => {
    const list = [
      makeWarehouse({ id: WAREHOUSE.bar, name: "מחסן בר", is_default: false, sort_order: 0 }),
      makeWarehouse({ id: WAREHOUSE.main, name: "מחסן ראשי", is_default: true, sort_order: 1 }),
    ];
    expect(defaultWarehouse(list)?.id).toBe(WAREHOUSE.main);
  });

  it("בלי מחסן מסומן — נופל לראשון ברשימה", () => {
    const list = [
      makeWarehouse({ id: WAREHOUSE.bar, name: "מחסן בר", is_default: false }),
      makeWarehouse({ id: WAREHOUSE.main, is_default: false }),
    ];
    expect(defaultWarehouse(list)?.id).toBe(WAREHOUSE.bar);
  });

  it("עסק בלי מחסנים מחזיר null (המסך יציג שגיאה מפורשת)", () => {
    expect(defaultWarehouse([])).toBeNull();
  });

  it("רשימה שעוד לא נטענה מחזירה null ולא קורסת", () => {
    expect(defaultWarehouse(undefined)).toBeNull();
  });

  it("שני מחסני ברירת מחדל — נבחר הראשון, בלי לזרוק", () => {
    const list = [
      makeWarehouse({ id: WAREHOUSE.bar, is_default: true }),
      makeWarehouse({ id: WAREHOUSE.main, is_default: true }),
    ];
    expect(defaultWarehouse(list)?.id).toBe(WAREHOUSE.bar);
  });
});

describe("שליפת מחסן לפי מזהה", () => {
  const list = [makeWarehouse({ id: WAREHOUSE.main }), makeWarehouse({ id: WAREHOUSE.bar, name: "מחסן בר" })];

  it("מוצא מחסן קיים", () => {
    expect(warehouseById(list, WAREHOUSE.bar)?.name).toBe("מחסן בר");
  });

  it("מחסן שנמחק מחזיר null", () => {
    expect(warehouseById(list, "wh-deleted")).toBeNull();
  });

  it("מזהה ריק או רשימה שלא נטענה מחזירים null", () => {
    expect(warehouseById(list, null)).toBeNull();
    expect(warehouseById(list, undefined)).toBeNull();
    expect(warehouseById(list, "")).toBeNull();
    expect(warehouseById(undefined, WAREHOUSE.main)).toBeNull();
    expect(warehouseById([], WAREHOUSE.main)).toBeNull();
  });
});

describe("קטגוריות מוצרים", () => {
  const categories = [
    makeInventoryCategory({ id: "cat-drinks", name: "משקאות" }),
    makeInventoryCategory({ id: "cat-food", name: "מזון" }),
  ];

  it("מוצא קטגוריה לפי מזהה", () => {
    expect(inventoryCategoryById(categories, "cat-food")?.name).toBe("מזון");
    expect(inventoryCategoryName(categories, "cat-food")).toBe("מזון");
  });

  it("מוצר בלי קטגוריה מחזיר null ולא «undefined» על המסך", () => {
    expect(inventoryCategoryById(categories, null)).toBeNull();
    expect(inventoryCategoryName(categories, null)).toBeNull();
  });

  it("קטגוריה שנמחקה מחזירה null", () => {
    expect(inventoryCategoryById(categories, "cat-gone")).toBeNull();
    expect(inventoryCategoryName(categories, "cat-gone")).toBeNull();
  });

  it("רשימה שעוד לא נטענה לא מפילה את המסך", () => {
    expect(inventoryCategoryById(undefined, "cat-food")).toBeNull();
    expect(inventoryCategoryName(undefined, "cat-food")).toBeNull();
  });

  it("צבע הקטגוריה נבחר במחזוריות ולעולם לא ריק", () => {
    const first = nextInventoryCategoryColor(0);
    expect(first).toMatch(/^#[0-9a-f]{6}$/i);
    // אותו צבע חוזר אחרי סיבוב שלם, ואף אינדקס לא מחזיר undefined
    for (let i = 0; i < 50; i++) {
      expect(nextInventoryCategoryColor(i)).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(nextInventoryCategoryColor(9)).toBe(first);
  });
});
