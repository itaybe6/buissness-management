/**
 * המנהל מנהל מחסנים — «מלאי העסק», מחסן בר, מקרר וכו׳.
 *
 * לכל מוצר יש כמות נפרדת בכל מחסן. שתי נקודות כשל: בחירת מחסן ברירת המחדל
 * (שאם נכשלת — קבלת סחורה ובלאי נופלים), והעברת מלאי בין מחסנים (שאם שגויה —
 * יחידות נעלמות או נולדות יש מאין).
 */
import { describe, expect, it } from "vitest";
import { defaultWarehouse, warehouseById } from "@/api/warehouses";
import { itemWarehouseQty, formatQtyWithPieces } from "@/api/inventory";
import {
  TRANSFER_NO_QTY_ERROR,
  TRANSFER_SAME_WAREHOUSE_ERROR,
  planStockTransfer,
  totalStockAcrossWarehouses,
} from "@/lib/warehouseStock";
import { nextWarehouseQty } from "@/lib/inventoryReceive";
import { DEFAULT_WAREHOUSE_NAME } from "@/lib/constants";
import { WAREHOUSE, makeItemWithQty, makeWarehouse, makeWarehouseStock } from "../helpers/factories";

const FRIDGE = "wh-fridge";

describe("שם ברירת המחדל של המחסן הראשון", () => {
  it("עסק חדש נפתח עם «מלאי העסק»", () => {
    expect(DEFAULT_WAREHOUSE_NAME).toBe("מלאי העסק");
  });
});

describe("איזה מחסן נבחר כברירת מחדל לקבלת סחורה", () => {
  it("המחסן שסומן כראשי", () => {
    const list = [
      makeWarehouse({ id: WAREHOUSE.bar, name: "בר", is_default: false, sort_order: 0 }),
      makeWarehouse({ id: WAREHOUSE.main, name: DEFAULT_WAREHOUSE_NAME, is_default: true, sort_order: 5 }),
    ];
    expect(defaultWarehouse(list)?.id).toBe(WAREHOUSE.main);
  });

  it("המנהל הסיר את סימון «ראשי» — נבחר הראשון לפי סדר התצוגה", () => {
    const list = [
      makeWarehouse({ id: WAREHOUSE.bar, name: "בר", is_default: false }),
      makeWarehouse({ id: FRIDGE, name: "מקרר", is_default: false }),
    ];
    expect(defaultWarehouse(list)?.id).toBe(WAREHOUSE.bar);
  });

  it("המנהל מחק את כל המחסנים — אין ברירת מחדל, והמסך יציג שגיאה מפורשת", () => {
    expect(defaultWarehouse([])).toBeNull();
    expect(defaultWarehouse(undefined)).toBeNull();
  });

  it("שני מחסנים מסומנים כראשיים — נבחר הראשון בלי לזרוק", () => {
    const list = [
      makeWarehouse({ id: WAREHOUSE.bar, is_default: true }),
      makeWarehouse({ id: WAREHOUSE.main, is_default: true }),
    ];
    expect(defaultWarehouse(list)?.id).toBe(WAREHOUSE.bar);
  });

  it("מחסן שנמחק לא נמצא לפי מזהה", () => {
    const list = [makeWarehouse({ id: WAREHOUSE.main })];
    expect(warehouseById(list, WAREHOUSE.main)?.id).toBe(WAREHOUSE.main);
    expect(warehouseById(list, FRIDGE)).toBeNull();
  });
});

describe("כמות המוצר בכל מחסן בנפרד", () => {
  const item = makeItemWithQty({
    unit: "ארגז",
    units_per_package: 6,
    warehouse_stocks: [
      makeWarehouseStock({ warehouse_id: WAREHOUSE.main, warehouse_name: DEFAULT_WAREHOUSE_NAME, quantity: 12 }),
      makeWarehouseStock({ warehouse_id: WAREHOUSE.bar, warehouse_name: "בר", quantity: 3.5 }),
      makeWarehouseStock({ warehouse_id: FRIDGE, warehouse_name: "מקרר", quantity: 0 }),
    ],
    current_qty: 15.5,
  });

  it("כל מחסן מחזיר את הכמות שלו", () => {
    expect(itemWarehouseQty(item, WAREHOUSE.main)).toBe(12);
    expect(itemWarehouseQty(item, WAREHOUSE.bar)).toBe(3.5);
    expect(itemWarehouseQty(item, FRIDGE)).toBe(0);
  });

  it("מחסן שהמוצר לא מוחזק בו מחזיר אפס ולא undefined", () => {
    expect(itemWarehouseQty(item, "wh-never-used")).toBe(0);
  });

  it("סך הכול בכל המחסנים תואם לכמות שמוצגת במסך", () => {
    expect(totalStockAcrossWarehouses(item.warehouse_stocks)).toBe(15.5);
    expect(totalStockAcrossWarehouses(item.warehouse_stocks)).toBe(item.current_qty);
  });

  it("מוצר בלי ספירות בכלל מסתכם באפס", () => {
    expect(totalStockAcrossWarehouses([])).toBe(0);
  });

  it("ערכים לא מספריים לא הופכים את הסכום ל-NaN", () => {
    const dirty = [{ quantity: 5 }, { quantity: Number.NaN }, { quantity: 3 }];
    expect(totalStockAcrossWarehouses(dirty)).toBe(8);
  });

  it("כמות במחסן מוצגת נכון גם כשהיא שברירית", () => {
    expect(formatQtyWithPieces(3.5, "ארגז", 6)).toBe("3 ארגז + 3 יחידות");
  });
});

describe("המנהל מעביר מלאי בין מחסנים", () => {
  const transfer = (over: Partial<Parameters<typeof planStockTransfer>[0]> = {}) =>
    planStockTransfer({
      fromWarehouseId: WAREHOUSE.main,
      toWarehouseId: WAREHOUSE.bar,
      requestedQty: 5,
      fromQty: 12,
      toQty: 3,
      ...over,
    });

  it("העברה תקינה מזיזה בדיוק את הכמות", () => {
    const plan = transfer();
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.amount).toBe(5);
    expect(plan.nextFromQty).toBe(7);
    expect(plan.nextToQty).toBe(8);
  });

  it("סך המלאי נשמר — לא נוצרות ולא נעלמות יחידות", () => {
    const plan = transfer();
    if (!plan.ok) throw new Error("expected ok");
    expect(plan.nextFromQty + plan.nextToQty).toBe(12 + 3);
  });

  it("בקשה גדולה מהמלאי במקור מוגבלת למה שיש", () => {
    const plan = transfer({ requestedQty: 100, fromQty: 7 });
    if (!plan.ok) throw new Error("expected ok");
    expect(plan.amount).toBe(7);
    expect(plan.nextFromQty).toBe(0);
    expect(plan.nextToQty).toBe(10);
  });

  it("העברת כל המלאי מרוקנת את מחסן המקור בדיוק לאפס", () => {
    const plan = transfer({ requestedQty: 12, fromQty: 12, toQty: 0 });
    if (!plan.ok) throw new Error("expected ok");
    expect(plan.nextFromQty).toBe(0);
    expect(plan.nextToQty).toBe(12);
  });

  it("אותו מחסן במקור וביעד נחסם", () => {
    expect(transfer({ toWarehouseId: WAREHOUSE.main })).toEqual({
      ok: false,
      error: TRANSFER_SAME_WAREHOUSE_ERROR,
    });
  });

  it("מחסן שלא נבחר נחסם", () => {
    expect(transfer({ fromWarehouseId: "" }).ok).toBe(false);
    expect(transfer({ toWarehouseId: null }).ok).toBe(false);
    expect(transfer({ fromWarehouseId: undefined }).ok).toBe(false);
  });

  it("מחסן מקור ריק נחסם עם הודעה מתאימה", () => {
    expect(transfer({ fromQty: 0 })).toEqual({ ok: false, error: TRANSFER_NO_QTY_ERROR });
  });

  it("כמות אפס או שלילית נחסמת", () => {
    expect(transfer({ requestedQty: 0 }).ok).toBe(false);
    expect(transfer({ requestedQty: -5 }).ok).toBe(false);
  });

  it("קלט לא מספרי לא מייצר NaN במלאי", () => {
    expect(transfer({ requestedQty: Number.NaN }).ok).toBe(false);
    const plan = transfer({ toQty: Number.NaN, requestedQty: 4 });
    if (!plan.ok) throw new Error("expected ok");
    expect(plan.nextToQty).toBe(4);
  });

  it("כמויות שבריריות לא צוברות סחף אחרי כמה העברות", () => {
    let from = 10;
    let to = 0;
    for (let i = 0; i < 10; i++) {
      const plan = planStockTransfer({
        fromWarehouseId: WAREHOUSE.main,
        toWarehouseId: WAREHOUSE.bar,
        requestedQty: 0.1,
        fromQty: from,
        toQty: to,
      });
      if (!plan.ok) throw new Error("expected ok");
      from = plan.nextFromQty;
      to = plan.nextToQty;
    }
    expect(from).toBe(9);
    expect(to).toBe(1);
    expect(from + to).toBe(10);
  });

  it("העברה הלוך-חזור מחזירה למצב המקורי", () => {
    const out = planStockTransfer({
      fromWarehouseId: WAREHOUSE.main,
      toWarehouseId: WAREHOUSE.bar,
      requestedQty: 4.25,
      fromQty: 10,
      toQty: 2,
    });
    if (!out.ok) throw new Error("expected ok");

    const back = planStockTransfer({
      fromWarehouseId: WAREHOUSE.bar,
      toWarehouseId: WAREHOUSE.main,
      requestedQty: 4.25,
      fromQty: out.nextToQty,
      toQty: out.nextFromQty,
    });
    if (!back.ok) throw new Error("expected ok");

    expect(back.nextToQty).toBe(10);
    expect(back.nextFromQty).toBe(2);
  });
});

describe("המלאי במחסן לעולם לא יורד מתחת לאפס", () => {
  it("הפחתה מעבר לקיים נחסמת", () => {
    expect(() => nextWarehouseQty(2, -5)).toThrow();
  });

  it("הפחתה עד אפס בדיוק מותרת", () => {
    expect(nextWarehouseQty(5, -5)).toBe(0);
  });

  it("קבלת סחורה למחסן ריק עובדת", () => {
    expect(nextWarehouseQty(0, 24)).toBe(24);
  });
});
