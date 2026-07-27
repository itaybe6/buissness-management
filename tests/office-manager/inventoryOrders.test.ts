/**
 * ממשק מנהלת המשרד — הזמנות סחורה וקבלת משלוחים.
 *
 * ההזמנה נשלחת כ«אצווה» (batch) לספק. כשהמשלוח מגיע חלקית, השורה נסגרת על
 * הכמות שהגיעה ונפתחת שורת יתרה חדשה. כאן נבדק כל מה שמושפע מזה: מה מחייבים,
 * מה נחשב אספקה חלקית פעילה, וכמה עולה האצווה בסופו של דבר.
 */
import { describe, expect, it } from "vitest";
import {
  batchHasActivePartialDelivery,
  batchPartialDeliveryEventAt,
  groupInventoryOrdersByBatch,
  inventoryLineTotal,
  inventorySaveError,
  isPartialReceivedOrderLine,
  orderBatchTotal,
  orderLineBillableQty,
  resolveItemUnitPrice,
} from "@/api/inventory";
import {
  buildItemSupplierIndex,
  effectiveMainUnitPrice,
  itemMatchesSupplierFilter,
  supplierPriceListTotal,
  supplierPriceUnitLabel,
  supplierPricesFor,
  supplierSaveError,
} from "@/api/suppliers";
import { makeOrder } from "../helpers/factories";

describe("כמה מחייבים על שורת הזמנה", () => {
  it("שורה שטרם הגיעה מחויבת לפי הכמות שהוזמנה", () => {
    expect(orderLineBillableQty(makeOrder({ quantity: 10, status: "requested" }))).toBe(10);
    expect(orderLineBillableQty(makeOrder({ quantity: 10, status: "ordered" }))).toBe(10);
  });

  it("שורה שהגיעה מחויבת לפי מה שהגיע בפועל", () => {
    expect(orderLineBillableQty(makeOrder({ quantity: 10, received_quantity: 6, status: "received" }))).toBe(6);
  });

  it("שורה שהגיעה בלי כמות מדווחת (הזמנה ישנה) מחויבת לפי ההזמנה", () => {
    expect(orderLineBillableQty(makeOrder({ quantity: 10, received_quantity: null, status: "received" }))).toBe(10);
  });

  it("אפס שהגיע נחשב אפס ולא נופל חזרה לכמות שהוזמנה", () => {
    expect(orderLineBillableQty(makeOrder({ quantity: 10, received_quantity: 0, status: "received" }))).toBe(0);
  });
});

describe("זיהוי אספקה חלקית", () => {
  it("שורה שהגיעה חלקית מזוהה ככזו", () => {
    expect(isPartialReceivedOrderLine(makeOrder({ quantity: 10, received_quantity: 6, status: "received" }))).toBe(true);
  });

  it("שורה שהגיעה במלואה אינה חלקית", () => {
    expect(isPartialReceivedOrderLine(makeOrder({ quantity: 10, received_quantity: 10, status: "received" }))).toBe(false);
  });

  it("שורה שטרם הגיעה אינה חלקית (היא פשוט פתוחה)", () => {
    expect(isPartialReceivedOrderLine(makeOrder({ quantity: 10, received_quantity: null, status: "ordered" }))).toBe(false);
  });

  it("כמות שהגיעה גדולה מההזמנה אינה חלקית", () => {
    expect(isPartialReceivedOrderLine(makeOrder({ quantity: 10, received_quantity: 12, status: "received" }))).toBe(false);
  });
});

describe("אספקה חלקית פעילה ברמת האצווה", () => {
  it("חלקית + יתרה פתוחה = התראה פעילה", () => {
    const lines = [
      makeOrder({ quantity: 10, received_quantity: 6, status: "received" }),
      makeOrder({ quantity: 4, status: "requested" }),
    ];
    expect(batchHasActivePartialDelivery(lines)).toBe(true);
  });

  it("חלקית בלי יתרה פתוחה (המנהלת סימנה «לא הגיע») כבר לא מתריעה", () => {
    const lines = [makeOrder({ quantity: 10, received_quantity: 6, status: "received" })];
    expect(batchHasActivePartialDelivery(lines)).toBe(false);
  });

  it("אצווה שהגיעה במלואה לא מתריעה", () => {
    const lines = [
      makeOrder({ quantity: 10, received_quantity: 10, status: "received" }),
      makeOrder({ quantity: 5, received_quantity: 5, status: "received" }),
    ];
    expect(batchHasActivePartialDelivery(lines)).toBe(false);
  });

  it("אצווה שכולה פתוחה לא מתריעה (עוד לא הגיע כלום)", () => {
    expect(batchHasActivePartialDelivery([makeOrder({ status: "ordered" })])).toBe(false);
  });

  it("אצווה ריקה לא מתריעה", () => {
    expect(batchHasActivePartialDelivery([])).toBe(false);
  });

  it("מועד האירוע הוא השורה החדשה ביותר באצווה", () => {
    const lines = [
      makeOrder({ created_at: "2026-07-08T10:00:00Z" }),
      makeOrder({ created_at: "2026-07-08T15:30:00Z" }),
      makeOrder({ created_at: "2026-07-08T12:00:00Z" }),
    ];
    expect(batchPartialDeliveryEventAt(lines)).toBe("2026-07-08T15:30:00Z");
  });

  it("אצווה ריקה מחזירה מחרוזת ריקה ולא קורסת", () => {
    expect(batchPartialDeliveryEventAt([])).toBe("");
  });
});

describe("קיבוץ הזמנות לאצוות", () => {
  it("שורות עם אותו batch_id מקובצות יחד", () => {
    const orders = [
      makeOrder({ id: "o1", batch_id: "batch-a" }),
      makeOrder({ id: "o2", batch_id: "batch-a" }),
      makeOrder({ id: "o3", batch_id: "batch-b" }),
    ];
    const grouped = groupInventoryOrdersByBatch(orders);
    expect(grouped.size).toBe(2);
    expect(grouped.get("batch-a")).toHaveLength(2);
  });

  it("שורה בלי אצווה (הזמנה בודדת ישנה) מקבלת אצווה משל עצמה", () => {
    const orders = [makeOrder({ id: "o1", batch_id: null }), makeOrder({ id: "o2", batch_id: null })];
    const grouped = groupInventoryOrdersByBatch(orders);
    expect(grouped.size).toBe(2);
    expect(grouped.get("o1")).toHaveLength(1);
  });

  it("רשימה ריקה מחזירה מפה ריקה", () => {
    expect(groupInventoryOrdersByBatch([]).size).toBe(0);
  });

  it("סדר השורות בתוך האצווה נשמר", () => {
    const orders = [
      makeOrder({ id: "first", batch_id: "b" }),
      makeOrder({ id: "second", batch_id: "b" }),
      makeOrder({ id: "third", batch_id: "b" }),
    ];
    expect(groupInventoryOrdersByBatch(orders).get("b")!.map((o) => o.id)).toEqual(["first", "second", "third"]);
  });
});

describe("תמחור שורות ואצוות", () => {
  it("סכום שורה = כמות × מחיר ספק, מעוגל לאגורות", () => {
    expect(inventoryLineTotal(null, 3, 12.5)).toBe(37.5);
    expect(inventoryLineTotal(null, 3, 12.333)).toBe(37);
  });

  it("בלי מחיר ספק הסכום הוא אפס — לא מנחשים מחיר", () => {
    expect(inventoryLineTotal(null, 3, null)).toBe(0);
    expect(inventoryLineTotal(null, 3, 0)).toBe(0);
    expect(inventoryLineTotal(null, 3, undefined)).toBe(0);
  });

  it("מחיר שלילי מטופל כאין-מחיר", () => {
    expect(inventoryLineTotal(null, 3, -5)).toBe(0);
  });

  it("כמות לא חוקית מחזירה אפס במקום NaN", () => {
    expect(inventoryLineTotal(null, Number.NaN, 10)).toBe(0);
    expect(inventoryLineTotal(null, Infinity, 10)).toBe(0);
  });

  it("מחיר המוצר נלקח ממחירון הספק", () => {
    const prices = new Map([["item-1", { main: 18.9 }]]);
    expect(resolveItemUnitPrice(null, "item-1", prices)).toBe(18.9);
  });

  it("מחיר ליחידה בודדת מומר ליחידה ראשית לחישוב הזמנה", () => {
    const prices = new Map([["item-1", { piece: 2 }]]);
    expect(resolveItemUnitPrice({ units_per_package: 24 }, "item-1", prices)).toBe(48);
  });

  it("מוצר שאינו במחירון הספק מקבל אפס", () => {
    expect(resolveItemUnitPrice(null, "item-9", new Map([["item-1", { main: 18.9 }]]))).toBe(0);
    expect(resolveItemUnitPrice(null, "item-1", null)).toBe(0);
    expect(resolveItemUnitPrice(null, "item-1", undefined)).toBe(0);
  });

  it("סכום אצווה מחבר את כל השורות לפי הכמות המחויבת", () => {
    const prices = new Map([
      ["item-1", { main: 10 }],
      ["item-2", { main: 5 }],
    ]);
    const lines = [
      makeOrder({ item_id: "item-1", quantity: 4, status: "ordered" }),
      makeOrder({ item_id: "item-2", quantity: 10, received_quantity: 6, status: "received" }),
    ];
    expect(orderBatchTotal(lines, prices)).toBe(70); // 4×10 + 6×5
  });

  it("מוצר בלי מחיר לא מזייף סכום — הוא פשוט לא מתומחר", () => {
    const lines = [makeOrder({ item_id: "item-unknown", quantity: 4, status: "ordered" })];
    expect(orderBatchTotal(lines, new Map([["item-1", { main: 10 }]]))).toBe(0);
  });

  it("אצווה ריקה שווה אפס", () => {
    expect(orderBatchTotal([], new Map())).toBe(0);
  });

  it("מחירון ספק נשלף לפי מזהה הספק", () => {
    const index = new Map([["sup-1", new Map([["item-1", { main: 12 }]])]]);
    expect(supplierPricesFor(index, "sup-1")?.get("item-1")?.main).toBe(12);
    expect(supplierPricesFor(index, "sup-missing")).toBeNull();
    expect(supplierPricesFor(index, null)).toBeNull();
    expect(supplierPricesFor(undefined, "sup-1")).toBeNull();
  });
});

describe("מחירון ספק — יחידה ראשית מול יחידה בודדת", () => {
  it("מחיר ליחידה ראשית גובר על מחיר לבודד", () => {
    expect(effectiveMainUnitPrice({ main: 100, piece: 2 }, 24)).toBe(100);
  });

  it("בלי מחיר ליחידה ראשית — מחושב מהבודד כפול גודל האריזה", () => {
    expect(effectiveMainUnitPrice({ piece: 2.5 }, 24)).toBe(60);
  });

  it("מחיר לבודד בלי גודל אריזה לא ניתן להמרה ומחזיר אפס", () => {
    expect(effectiveMainUnitPrice({ piece: 2.5 }, null)).toBe(0);
    expect(effectiveMainUnitPrice({ piece: 2.5 }, 0)).toBe(0);
  });

  it("מחירים אפס / שליליים נחשבים כלא מוגדרים", () => {
    expect(effectiveMainUnitPrice({ main: 0, piece: 0 }, 24)).toBe(0);
    expect(effectiveMainUnitPrice({ main: -5 }, 24)).toBe(0);
  });

  it("מוצר בלי מחירון כלל מחזיר אפס", () => {
    expect(effectiveMainUnitPrice(undefined, 24)).toBe(0);
    expect(effectiveMainUnitPrice({}, 24)).toBe(0);
  });

  it("המרה מבודד מעוגלת לאגורות", () => {
    expect(effectiveMainUnitPrice({ piece: 0.333 }, 7)).toBe(2.33);
  });

  it("סכום המחירון לתצוגה מחבר את שני סוגי המחירים", () => {
    expect(supplierPriceListTotal({ main: 100, piece: 5 })).toBe(105);
    expect(supplierPriceListTotal({ main: 100 })).toBe(100);
    expect(supplierPriceListTotal({})).toBe(0);
  });

  it("תווית יחידת המחיר בעברית", () => {
    expect(supplierPriceUnitLabel("piece", "ארגז")).toBe("יחידה");
    expect(supplierPriceUnitLabel("main", "ארגז")).toBe("ארגז");
    expect(supplierPriceUnitLabel("main", null)).toBe("יחידה");
    expect(supplierPriceUnitLabel("main", "  ")).toBe("יחידה");
  });
});

describe("סינון מוצרים לפי ספק", () => {
  const priceIndex = new Map([
    ["sup-1", new Map([["item-1", { main: 10 }], ["item-2", { main: 5 }]])],
    ["sup-2", new Map([["item-2", { main: 6 }]])],
  ]);
  const itemIndex = buildItemSupplierIndex(priceIndex);

  it("כל מוצר ממופה לספקים שמחזיקים אותו", () => {
    expect([...itemIndex.get("item-1")!]).toEqual(["sup-1"]);
    expect([...itemIndex.get("item-2")!].sort()).toEqual(["sup-1", "sup-2"]);
  });

  it("בלי סינון — כל המוצרים עוברים", () => {
    expect(itemMatchesSupplierFilter("item-99", null, itemIndex)).toBe(true);
  });

  it("סינון לספק מסוים מחזיר רק את המוצרים שלו", () => {
    expect(itemMatchesSupplierFilter("item-1", "sup-1", itemIndex)).toBe(true);
    expect(itemMatchesSupplierFilter("item-1", "sup-2", itemIndex)).toBe(false);
  });

  it("סינון «ללא ספק» מחזיר רק מוצרים שלא משויכים לאף ספק", () => {
    expect(itemMatchesSupplierFilter("item-99", "__none__", itemIndex)).toBe(true);
    expect(itemMatchesSupplierFilter("item-1", "__none__", itemIndex)).toBe(false);
  });

  it("מחירון ריק מייצר מפה ריקה", () => {
    expect(buildItemSupplierIndex(new Map()).size).toBe(0);
  });
});

describe("הודעות שגיאה שמנהלת המשרד רואה", () => {
  it("עמודה חסרה במסד מתורגמת להוראה מדויקת עם שם קובץ ה-patch", () => {
    expect(inventorySaveError(new Error('column "batch_id" does not exist'))).toContain("021_inventory_order_batch.sql");
    expect(inventorySaveError(new Error('column "min_quantity" does not exist'))).toContain("011_inventory_min_quantity.sql");
    expect(inventorySaveError(new Error('relation "warehouses" does not exist'))).toContain("052_warehouses.sql");
  });

  it("שגיאת Supabase שאינה Error (אובייקט רגיל) מטופלת גם היא", () => {
    expect(inventorySaveError({ message: 'column "units_per_package" does not exist' })).toContain(
      "030_inventory_units_per_package.sql",
    );
  });

  it("שגיאת אחסון תמונות מכוונת ל-Bucket", () => {
    expect(inventorySaveError(new Error("bucket not found"))).toContain("inventory");
  });

  it("שגיאה לא מוכרת מוצגת כמו שהיא, ובלי הודעה — טקסט ברירת מחדל", () => {
    expect(inventorySaveError(new Error("permission denied"))).toBe("permission denied");
    expect(inventorySaveError(null)).toBe("שגיאה בשמירה");
    expect(inventorySaveError(undefined)).toBe("שגיאה בשמירה");
    expect(inventorySaveError("סתם מחרוזת")).toBe("שגיאה בשמירה");
  });

  it("שגיאות ספקים מכוונות ל-patch של הספקים", () => {
    expect(supplierSaveError(new Error('relation "suppliers" does not exist'))).toContain("046_suppliers.sql");
    expect(supplierSaveError(new Error('relation "supplier_items" does not exist'))).toContain("048_supplier_items.sql");
    expect(supplierSaveError(null)).toBe("שגיאה בשמירה");
  });
});
