/**
 * המנהל מנהל ספקים, מחירונים ויחידות מידה.
 *
 * מחיר ספק הוא הדבר היחיד שקובע כמה עולה הזמנה, והוא יכול להיות מוגדר
 * ליחידת המידה הראשית («ארגז») או ליחידה בודדת («בקבוק»). כל טעות בהמרה
 * ביניהם מכפילה או מחלקת את סכום ההזמנה פי גודל האריזה.
 */
import { describe, expect, it } from "vitest";
import {
  buildItemSupplierIndex,
  effectiveMainUnitPrice,
  itemMatchesSupplierFilter,
  supplierPriceListTotal,
  supplierPriceUnitLabel,
  supplierPricesFor,
  supplierSaveError,
  type SupplierItemPriceIndex,
} from "@/api/suppliers";
import {
  inventoryItemMatchesQuery,
  inventoryLineTotal,
  normalizeInventoryBarcode,
  orderBatchTotal,
  resolveItemUnitPrice,
} from "@/api/inventory";
import {
  inventoryUnitIsBase,
  inventoryUnitOptions,
  inventoryUnitSaveError,
} from "@/api/inventoryUnits";
import { makeInventoryItem, makeOrder, makeSupplier } from "../helpers/factories";
import type { InventoryUnit } from "@/types/database";

const SUP_A = "sup-drinks";
const SUP_B = "sup-food";

/** ספק א׳ מתמחר ארגז, ספק ב׳ מתמחר בקבוק בודד. */
const priceIndex: SupplierItemPriceIndex = new Map([
  [
    SUP_A,
    new Map([
      ["item-beer", { main: 120 }],
      ["item-bread", { main: 8 }],
    ]),
  ],
  [SUP_B, new Map([["item-beer", { piece: 5.5 }]])],
]);

describe("שליפת מחירון של ספק", () => {
  it("מחירון הספק נשלף לפי המזהה שלו", () => {
    expect(supplierPricesFor(priceIndex, SUP_A)?.get("item-beer")).toEqual({ main: 120 });
  });

  it("ספק בלי מחירון מחזיר null", () => {
    expect(supplierPricesFor(priceIndex, "sup-new")).toBeNull();
  });

  it("בלי ספק נבחר או לפני שהמחירונים נטענו — null", () => {
    expect(supplierPricesFor(priceIndex, null)).toBeNull();
    expect(supplierPricesFor(priceIndex, undefined)).toBeNull();
    expect(supplierPricesFor(undefined, SUP_A)).toBeNull();
  });
});

describe("מחיר ליחידה ראשית מול מחיר לבודד", () => {
  it("מחיר לארגז משמש ישירות", () => {
    expect(effectiveMainUnitPrice({ main: 120 }, 24)).toBe(120);
  });

  it("מחיר לבקבוק מוכפל בגודל האריזה", () => {
    expect(effectiveMainUnitPrice({ piece: 5.5 }, 24)).toBe(132);
  });

  it("כששני המחירים קיימים — הראשי גובר", () => {
    expect(effectiveMainUnitPrice({ main: 100, piece: 5.5 }, 24)).toBe(100);
  });

  it("מחיר לבודד בלי גודל אריזה לא ניתן להמרה — לא מנחשים", () => {
    expect(effectiveMainUnitPrice({ piece: 5.5 }, null)).toBe(0);
    expect(effectiveMainUnitPrice({ piece: 5.5 }, 0)).toBe(0);
    expect(effectiveMainUnitPrice({ piece: 5.5 }, undefined)).toBe(0);
  });

  it("מחיר אפס או שלילי נחשב «לא הוגדר»", () => {
    expect(effectiveMainUnitPrice({ main: 0 }, 24)).toBe(0);
    expect(effectiveMainUnitPrice({ main: -10 }, 24)).toBe(0);
    expect(effectiveMainUnitPrice({ piece: -1 }, 24)).toBe(0);
  });

  it("מוצר בלי מחירון בכלל", () => {
    expect(effectiveMainUnitPrice(undefined, 24)).toBe(0);
    expect(effectiveMainUnitPrice({}, 24)).toBe(0);
  });

  it("ההמרה מבודד מעוגלת לאגורות", () => {
    expect(effectiveMainUnitPrice({ piece: 0.333 }, 7)).toBe(2.33);
    expect(effectiveMainUnitPrice({ piece: 2.5 }, 6)).toBe(15);
    expect(effectiveMainUnitPrice({ piece: 1.111 }, 9)).toBe(10);
  });

  it("התוצאה תמיד בעלת שתי ספרות אחרי הנקודה לכל היותר", () => {
    for (const piece of [0.333, 1.005, 7.777, 0.01]) {
      for (const pack of [3, 6, 7, 24]) {
        const price = effectiveMainUnitPrice({ piece }, pack);
        expect(Math.round(price * 100) / 100).toBe(price);
      }
    }
  });

  it("סכום המחירון לתצוגה מחבר את שני המחירים", () => {
    expect(supplierPriceListTotal({ main: 120, piece: 5.5 })).toBe(125.5);
    expect(supplierPriceListTotal({ main: 120 })).toBe(120);
    expect(supplierPriceListTotal({ piece: 5.5 })).toBe(5.5);
    expect(supplierPriceListTotal({})).toBe(0);
  });

  it("תווית יחידת המחיר בעברית", () => {
    expect(supplierPriceUnitLabel("main", "ארגז")).toBe("ארגז");
    expect(supplierPriceUnitLabel("piece", "ארגז")).toBe("יחידה");
    expect(supplierPriceUnitLabel("main", null)).toBe("יחידה");
    expect(supplierPriceUnitLabel("main", "  ")).toBe("יחידה");
  });
});

describe("מחיר המוצר לפי הספק שנבחר בהזמנה", () => {
  const beer = makeInventoryItem({ id: "item-beer", name: "בירה", unit: "ארגז", units_per_package: 24 });

  it("ספק א׳ (מתמחר ארגז) — 120 ₪ לארגז", () => {
    expect(resolveItemUnitPrice(beer, "item-beer", supplierPricesFor(priceIndex, SUP_A))).toBe(120);
  });

  it("ספק ב׳ (מתמחר בקבוק) — 5.5 × 24 = 132 ₪ לארגז", () => {
    expect(resolveItemUnitPrice(beer, "item-beer", supplierPricesFor(priceIndex, SUP_B))).toBe(132);
  });

  it("החלפת ספק משנה את סכום ההזמנה", () => {
    const lines = [{ ...makeOrder({ item_id: "item-beer", quantity: 3, status: "ordered" }), item: beer }];
    expect(orderBatchTotal(lines, supplierPricesFor(priceIndex, SUP_A)!)).toBe(360);
    expect(orderBatchTotal(lines, supplierPricesFor(priceIndex, SUP_B)!)).toBe(396);
  });

  it("מוצר שלא במחירון הספק לא מתומחר — הסכום לא מנופח", () => {
    expect(resolveItemUnitPrice(beer, "item-wine", supplierPricesFor(priceIndex, SUP_A))).toBe(0);
    const lines = [{ ...makeOrder({ item_id: "item-wine", quantity: 3, status: "ordered" }), item: beer }];
    expect(orderBatchTotal(lines, supplierPricesFor(priceIndex, SUP_A)!)).toBe(0);
  });

  it("שורת הזמנה מסתכמת בכמות × מחיר, מעוגל לאגורות", () => {
    expect(inventoryLineTotal(beer, 3, 120)).toBe(360);
    expect(inventoryLineTotal(beer, 2.5, 7.333)).toBe(18.33);
  });

  it("אצווה מעורבת מכמה מוצרים מסתכמת נכון", () => {
    const bread = makeInventoryItem({ id: "item-bread", name: "לחם", unit: "יחידות", units_per_package: null });
    const lines = [
      { ...makeOrder({ item_id: "item-beer", quantity: 2, status: "ordered" }), item: beer },
      { ...makeOrder({ item_id: "item-bread", quantity: 10, status: "ordered" }), item: bread },
    ];
    expect(orderBatchTotal(lines, supplierPricesFor(priceIndex, SUP_A)!)).toBe(320); // 2×120 + 10×8
  });
});

describe("איזה ספק מחזיק איזה מוצר", () => {
  const itemIndex = buildItemSupplierIndex(priceIndex);

  it("מוצר שמסופק ע״י שני ספקים ממופה לשניהם", () => {
    expect([...itemIndex.get("item-beer")!].sort()).toEqual([SUP_B, SUP_A].sort());
  });

  it("מוצר של ספק אחד בלבד", () => {
    expect([...itemIndex.get("item-bread")!]).toEqual([SUP_A]);
  });

  it("סינון «כל הספקים» מציג הכול", () => {
    expect(itemMatchesSupplierFilter("item-beer", null, itemIndex)).toBe(true);
    expect(itemMatchesSupplierFilter("item-unknown", null, itemIndex)).toBe(true);
  });

  it("סינון לספק מסוים מציג רק את המוצרים שלו", () => {
    expect(itemMatchesSupplierFilter("item-bread", SUP_A, itemIndex)).toBe(true);
    expect(itemMatchesSupplierFilter("item-bread", SUP_B, itemIndex)).toBe(false);
  });

  it("סינון «ללא ספק» מציג מוצרים יתומים בלבד", () => {
    expect(itemMatchesSupplierFilter("item-orphan", "__none__", itemIndex)).toBe(true);
    expect(itemMatchesSupplierFilter("item-beer", "__none__", itemIndex)).toBe(false);
  });

  it("עסק בלי מחירונים מייצר מפה ריקה", () => {
    expect(buildItemSupplierIndex(new Map()).size).toBe(0);
  });

  it("ספק עם מחירון ריק לא מוסיף שיוכים", () => {
    const withEmpty: SupplierItemPriceIndex = new Map([["sup-empty", new Map()]]);
    expect(buildItemSupplierIndex(withEmpty).size).toBe(0);
  });
});

describe("הודעות שגיאה בשמירת ספק", () => {
  it("טבלת ספקים חסרה — הוראה מדויקת", () => {
    expect(supplierSaveError(new Error('relation "suppliers" does not exist'))).toContain("046_suppliers.sql");
  });

  it("טבלת מחירוני ספק חסרה", () => {
    expect(supplierSaveError(new Error('relation "supplier_items" does not exist'))).toContain(
      "048_supplier_items.sql",
    );
  });

  it("שגיאה כאובייקט רגיל (לא Error) מטופלת גם היא", () => {
    expect(supplierSaveError({ message: 'column "supplier_id" does not exist' })).toContain("046_suppliers.sql");
  });

  it("שגיאה לא מוכרת מוצגת כמות שהיא, וריק → ברירת מחדל", () => {
    expect(supplierSaveError(new Error("permission denied"))).toBe("permission denied");
    expect(supplierSaveError(null)).toBe("שגיאה בשמירה");
    expect(supplierSaveError(undefined)).toBe("שגיאה בשמירה");
  });

  it("ספק פעיל ולא פעיל — שדה הסטטוס קיים ותקין", () => {
    expect(makeSupplier().active).toBe(true);
    expect(makeSupplier({ active: false }).active).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// יחידות מידה שהמנהל מגדיר
// ---------------------------------------------------------------------------

function unit(name: string, over: Partial<InventoryUnit> = {}): InventoryUnit {
  return {
    id: `unit-${name}`,
    business_id: "biz-1",
    name,
    sort_order: 0,
    is_base: false,
    active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("יחידות מידה של העסק", () => {
  const units = [
    unit("יחידות", { is_base: true, sort_order: 0 }),
    unit("ארגז", { sort_order: 1 }),
    unit("ק״ג", { sort_order: 2 }),
  ];

  it("הרשימה מוצגת לפי סדר התצוגה שהמנהל קבע", () => {
    expect(inventoryUnitOptions(units).map((u) => u.name)).toEqual(["יחידות", "ארגז", "ק״ג"]);
  });

  it("עסק בלי יחידות מוגדרות נופל לרשימת ברירת המחדל", () => {
    const fallback = inventoryUnitOptions([]);
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback.some((u) => u.name === "יחידות")).toBe(true);
  });

  it("יחידה ישנה של מוצר קיים נוספת לרשימה גם אם המנהל מחק אותה", () => {
    const options = inventoryUnitOptions(units, "חבית");
    expect(options.map((u) => u.name)).toContain("חבית");
    expect(options[options.length - 1].name).toBe("חבית"); // בסוף הרשימה
  });

  it("יחידה שכבר קיימת לא מוכפלת", () => {
    const names = inventoryUnitOptions(units, "ארגז").map((u) => u.name);
    expect(names.filter((n) => n === "ארגז")).toHaveLength(1);
  });

  it("רווחים סביב הערך הנוכחי לא מייצרים כפילות", () => {
    expect(inventoryUnitOptions(units, "  ארגז  ").filter((u) => u.name === "ארגז")).toHaveLength(1);
  });

  it("«יחידות» היא יחידת הבסיס — אין בה פירוק לבודדים", () => {
    expect(inventoryUnitIsBase("יחידות", units)).toBe(true);
    expect(inventoryUnitIsBase("ארגז", units)).toBe(false);
  });

  it("יחידה שלא מוכרת נבדקת מול שם ברירת המחדל", () => {
    expect(inventoryUnitIsBase("יחידות")).toBe(true);
    expect(inventoryUnitIsBase("חבית")).toBe(false);
  });

  it("יחידה ריקה נחשבת בסיס — מוצר בלי יחידת מידה", () => {
    expect(inventoryUnitIsBase(null, units)).toBe(true);
    expect(inventoryUnitIsBase("", units)).toBe(true);
    expect(inventoryUnitIsBase("   ", units)).toBe(true);
  });

  it("המנהל יכול לסמן יחידה אחרת כבסיס", () => {
    const custom = [unit("מנה", { is_base: true })];
    expect(inventoryUnitIsBase("מנה", custom)).toBe(true);
  });

  it("שם יחידה כפול מוחזר כהודעה ברורה", () => {
    expect(inventoryUnitSaveError(new Error("duplicate key value violates unique constraint inventory_units_name"))).toBe(
      "יחידת מידה בשם הזה כבר קיימת בעסק",
    );
  });

  it("טבלת יחידות חסרה מכוונת למיגרציה", () => {
    expect(inventoryUnitSaveError(new Error('relation "inventory_units" does not exist'))).toContain("inventory_units");
  });

  it("שגיאה ריקה מקבלת טקסט ברירת מחדל", () => {
    expect(inventoryUnitSaveError(null)).toBe("שגיאה בשמירה");
  });
});

// ---------------------------------------------------------------------------
// ברקוד וחיפוש בקטלוג
// ---------------------------------------------------------------------------

describe("ברקוד מוצר", () => {
  it("רווחים נחתכים", () => {
    expect(normalizeInventoryBarcode("  7290001234567  ")).toBe("7290001234567");
  });

  it("שדה ריק נשמר כ-null ולא כמחרוזת ריקה", () => {
    expect(normalizeInventoryBarcode("")).toBeNull();
    expect(normalizeInventoryBarcode("   ")).toBeNull();
    expect(normalizeInventoryBarcode(null)).toBeNull();
    expect(normalizeInventoryBarcode(undefined)).toBeNull();
  });
});

describe("חיפוש מוצר בקטלוג", () => {
  const beer = makeInventoryItem({ name: "בירה גולדסטאר", barcode: "7290001234567" });
  const bread = makeInventoryItem({ name: "לחם אחיד", barcode: null });

  it("חיפוש לפי חלק מהשם", () => {
    expect(inventoryItemMatchesQuery(beer, "גולד")).toBe(true);
    expect(inventoryItemMatchesQuery(beer, "בירה")).toBe(true);
  });

  it("חיפוש לפי ברקוד מלא או חלקי", () => {
    expect(inventoryItemMatchesQuery(beer, "7290001234567")).toBe(true);
    expect(inventoryItemMatchesQuery(beer, "12345")).toBe(true);
  });

  it("מוצר בלי ברקוד לא נופל בחיפוש ברקוד", () => {
    expect(inventoryItemMatchesQuery(bread, "7290")).toBe(false);
  });

  it("חיפוש ריק מחזיר את כל הקטלוג", () => {
    expect(inventoryItemMatchesQuery(beer, "")).toBe(true);
    expect(inventoryItemMatchesQuery(beer, "   ")).toBe(true);
  });

  it("החיפוש אינו רגיש לרישיות ולרווחים מסביב", () => {
    const cola = makeInventoryItem({ name: "Coca Cola", barcode: "ABC123" });
    expect(inventoryItemMatchesQuery(cola, "coca")).toBe(true);
    expect(inventoryItemMatchesQuery(cola, "  COLA  ")).toBe(true);
    expect(inventoryItemMatchesQuery(cola, "abc")).toBe(true);
  });

  it("חיפוש שלא מתאים לכלום מחזיר false", () => {
    expect(inventoryItemMatchesQuery(beer, "וודקה")).toBe(false);
  });
});
