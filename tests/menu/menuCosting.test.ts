/**
 * מנוע התמחור של עץ המנה — המספרים שהמנהל רואה על המסך.
 *
 * כל בדיקה כאן היא חישוב ידני שאפשר לאמת עם מחשבון:
 * מחיר ספק ← תכולה ← כמות במתכון ← פחת ← הכנות בסיס ← מע״מ ← רווח.
 * אם אחד מהם משתבש, המנהל מתמחר מנה על בסיס עלות שגויה.
 */
import { describe, expect, it } from "vitest";
import type { SupplierItemPriceIndex } from "@/api/suppliers";
import {
  collectItemIds,
  collectSubDishIds,
  costAllDishes,
  costDish,
  dishEconomics,
  economicsAtPrice,
  grossQuantity,
  itemContentPerMainUnit,
  itemNeedsConversion,
  itemUsageIndex,
  marginStatus,
  measureFromUnitName,
  menuEngineering,
  menuSaveError,
  pricePerMeasure,
  resolveItemPrice,
  roundMenuPrice,
  summarizeMenu,
  type CostingContext,
} from "@/lib/menuCosting";
import type { InventoryItem, MenuDish, MenuDishComponent, MenuItemConversion, MenuSettings } from "@/types/database";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const BIZ = "biz-1";

function item(id: string, name: string, unit: string | null, extra: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id,
    business_id: BIZ,
    name,
    barcode: null,
    unit,
    units_per_package: null,
    piece_unit: null,
    content_qty: null,
    content_measure: null,
    image_url: null,
    min_quantity: 0,
    category_id: null,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

function dish(id: string, name: string, extra: Partial<MenuDish> = {}): MenuDish {
  return {
    id,
    business_id: BIZ,
    category_id: null,
    kind: "dish",
    name,
    description: null,
    image_url: null,
    selling_price: null,
    yield_qty: 1,
    yield_measure: "unit",
    target_food_cost_pct: null,
    monthly_sales: null,
    notes: null,
    sort_order: 0,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

let seq = 0;
function line(dishId: string, extra: Partial<MenuDishComponent>): MenuDishComponent {
  seq += 1;
  return {
    id: `c-${seq}`,
    business_id: BIZ,
    dish_id: dishId,
    item_id: null,
    sub_dish_id: null,
    quantity: 1,
    unit: "g",
    waste_pct: 0,
    supplier_id: null,
    notes: null,
    sort_order: seq,
    created_at: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

function conversion(itemId: string, extra: Partial<MenuItemConversion>): MenuItemConversion {
  return {
    item_id: itemId,
    business_id: BIZ,
    content_qty: null,
    content_measure: null,
    manual_unit_cost: null,
    updated_at: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

/** supplier → item → prices */
function priceIndex(rows: [supplier: string, itemId: string, main?: number, piece?: number][]): SupplierItemPriceIndex {
  const idx: SupplierItemPriceIndex = new Map();
  for (const [supplier, itemId, main, piece] of rows) {
    let items = idx.get(supplier);
    if (!items) {
      items = new Map();
      idx.set(supplier, items);
    }
    items.set(itemId, { main, piece });
  }
  return idx;
}

function context(parts: {
  items?: InventoryItem[];
  dishes?: MenuDish[];
  components?: MenuDishComponent[];
  conversions?: MenuItemConversion[];
  prices?: SupplierItemPriceIndex;
}): CostingContext {
  const componentsByDish = new Map<string, MenuDishComponent[]>();
  for (const c of parts.components ?? []) {
    const list = componentsByDish.get(c.dish_id);
    if (list) list.push(c);
    else componentsByDish.set(c.dish_id, [c]);
  }
  return {
    items: new Map((parts.items ?? []).map((i) => [i.id, i])),
    dishes: new Map((parts.dishes ?? []).map((d) => [d.id, d])),
    componentsByDish,
    conversions: new Map((parts.conversions ?? []).map((c) => [c.item_id, c])),
    priceIndex: parts.prices,
  };
}

const SETTINGS: Pick<MenuSettings, "vat_pct" | "prices_include_vat" | "costs_include_vat" | "target_food_cost_pct"> = {
  vat_pct: 18,
  prices_include_vat: true,
  costs_include_vat: false,
  target_food_cost_pct: 30,
};

/* ------------------------------------------------------------------ */
/* Unit inference                                                      */
/* ------------------------------------------------------------------ */

describe("זיהוי מידה משם היחידה", () => {
  it.each([
    ["ק״ג", 1000, "g"],
    ["קג", 1000, "g"],
    ["קילו", 1000, "g"],
    ["kg", 1000, "g"],
    ["גרם", 1, "g"],
    ["ליטר", 1000, "ml"],
    ["ל׳", 1000, "ml"],
    ["מ״ל", 1, "ml"],
    ["ml", 1, "ml"],
  ])("«%s» → %d %s", (name, qty, measure) => {
    expect(measureFromUnitName(name)).toEqual({ qty, measure });
  });

  it("יחידות ספירה (ארגז, יח׳, בקבוק) לא מזוהות כמידה", () => {
    for (const n of ["ארגז", "יח׳", "בקבוק", "שק", null, undefined, ""]) {
      expect(measureFromUnitName(n)).toBeNull();
    }
  });
});

describe("תכולת יחידת רכש", () => {
  it("מוצר שנמכר בק״ג → 1000 גרם בלי המרה", () => {
    const c = itemContentPerMainUnit(item("i", "עגבניות", "ק״ג"));
    expect(c).toEqual({ qty: 1000, measure: "g", source: "unit_name", pieces: null });
    expect(itemNeedsConversion(item("i", "עגבניות", "ק״ג"), null)).toBe(false);
  });

  it("ארגז של 24 בקבוקים בלי המרה → נספר ב-24 יחידות ודורש המרה לגרם/מ״ל", () => {
    const crate = item("i", "קולה", "ארגז", { units_per_package: 24, piece_unit: "בקבוק" });
    expect(itemContentPerMainUnit(crate)).toEqual({ qty: 24, measure: "unit", source: "count", pieces: 24 });
    expect(itemNeedsConversion(crate, null)).toBe(true);
  });

  it("המרה «בקבוק = 330 מ״ל» מוכפלת במספר הבקבוקים בארגז", () => {
    const crate = item("i", "קולה", "ארגז", { units_per_package: 24, piece_unit: "בקבוק" });
    const c = itemContentPerMainUnit(crate, conversion("i", { content_qty: 330, content_measure: "ml" }));
    expect(c).toEqual({ qty: 24 * 330, measure: "ml", source: "conversion", pieces: 24 });
  });

  it("שק שהפריט הבודד בו הוא ק״ג (שק של 25 ק״ג) מזוהה מהפריט", () => {
    const sack = item("i", "קמח", "שק", { units_per_package: 25, piece_unit: "ק״ג" });
    expect(itemContentPerMainUnit(sack)).toEqual({ qty: 25000, measure: "g", source: "unit_name", pieces: 25 });
  });

  it("המרה מנצחת את שם היחידה", () => {
    const c = itemContentPerMainUnit(item("i", "שמן", "ליטר"), conversion("i", { content_qty: 920, content_measure: "g" }));
    expect(c.measure).toBe("g");
    expect(c.qty).toBe(920);
  });

  it("תכולה שהוגדרה על המוצר עצמו (בקבוק = 750 מ״ל) מתמחרת בלי המרה נפרדת", () => {
    const bottle = item("i", "שמן זית", "בקבוק", { content_qty: 750, content_measure: "ml" });
    expect(itemContentPerMainUnit(bottle)).toEqual({ qty: 750, measure: "ml", source: "item", pieces: null });
    expect(itemNeedsConversion(bottle, null)).toBe(false);
  });

  it("תכולת המוצר מוכפלת במספר הפריטים במארז (ארגז 24 × 330 מ״ל)", () => {
    const crate = item("i", "קולה", "ארגז", { units_per_package: 24, piece_unit: "בקבוק", content_qty: 330, content_measure: "ml" });
    expect(itemContentPerMainUnit(crate).qty).toBe(24 * 330);
  });

  it("תכולת המוצר מנצחת המרה ישנה מהתפריט", () => {
    const bottle = item("i", "שמן", "בקבוק", { content_qty: 750, content_measure: "ml" });
    const c = itemContentPerMainUnit(bottle, conversion("i", { content_qty: 500, content_measure: "ml" }));
    expect(c).toMatchObject({ qty: 750, source: "item" });
  });

  it("מוצר שהוגדר כנספר (ביצה = 1 יחידה) לא דורש המרה", () => {
    const eggs = item("i", "ביצים", "תבנית", { units_per_package: 30, piece_unit: "ביצה", content_qty: 1, content_measure: "unit" });
    expect(itemContentPerMainUnit(eggs)).toEqual({ qty: 30, measure: "unit", source: "item", pieces: 30 });
    expect(itemNeedsConversion(eggs, null)).toBe(false);
  });
});

describe("מחיר לפי מידה — מה שהמנהל רואה ליד מחיר הספק", () => {
  it("₪24 לבקבוק של 750 מ״ל → ₪3.2 ל-100 מ״ל, ₪32 לליטר", () => {
    const bottle = item("i", "שמן", "בקבוק", { content_qty: 750, content_measure: "ml" });
    const line = pricePerMeasure(24, itemContentPerMainUnit(bottle));
    expect(line?.perBase).toBeCloseTo(0.032, 6);
    expect(line?.label).toBe("₪3.2 ל-100 מ״ל · ₪32 לליטר");
  });

  it("₪8 לק״ג → ₪0.8 ל-100 גרם", () => {
    const line = pricePerMeasure(8, itemContentPerMainUnit(item("i", "עגבניות", "ק״ג")));
    expect(line?.label).toBe("₪0.8 ל-100 גרם · ₪8 לק״ג");
  });

  it("תבנית 30 ביצים ב-₪36 → ₪1.2 ליחידה", () => {
    const eggs = item("i", "ביצים", "תבנית", { units_per_package: 30, piece_unit: "ביצה", content_qty: 1, content_measure: "unit" });
    expect(pricePerMeasure(36, itemContentPerMainUnit(eggs))?.label).toBe("₪1.2 ליחידה");
  });

  it("מוצר בודד שרק נספר ובלי תכולה — אין מה להציג", () => {
    expect(pricePerMeasure(10, itemContentPerMainUnit(item("i", "מגבונים", "יחידות")))).toBeNull();
    expect(pricePerMeasure(0, itemContentPerMainUnit(item("i", "שמן", "ליטר")))).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Price resolution                                                    */
/* ------------------------------------------------------------------ */

describe("בחירת מחיר למוצר", () => {
  const tomato = item("tomato", "עגבניות", "ק״ג");
  const prices = priceIndex([
    ["sup-a", "tomato", 9],
    ["sup-b", "tomato", 7.5],
    ["sup-c", "tomato", 12],
  ]);

  it("ברירת מחדל — הספק הזול ביותר", () => {
    const r = resolveItemPrice(tomato, prices, null);
    expect(r.source).toBe("supplier");
    expect(r.supplierId).toBe("sup-b");
    expect(r.pricePerMain).toBe(7.5);
    expect(r.offers.map((o) => o.supplierId)).toEqual(["sup-b", "sup-a", "sup-c"]);
  });

  it("ספק נעוץ מנצח גם כשהוא יקר יותר", () => {
    const r = resolveItemPrice(tomato, prices, "sup-c");
    expect(r.pricePerMain).toBe(12);
    expect(r.supplierId).toBe("sup-c");
    expect(r.pinnedMissing).toBe(false);
  });

  it("ספק נעוץ שלא מתמחר את המוצר → נופל לזול ומסמן אזהרה", () => {
    const r = resolveItemPrice(tomato, prices, "sup-zzz");
    expect(r.pricePerMain).toBe(7.5);
    expect(r.pinnedMissing).toBe(true);
  });

  it("מחיר לפריט בודד בלבד מוכפל למחיר ליחידת רכש", () => {
    const crate = item("cola", "קולה", "ארגז", { units_per_package: 24 });
    const r = resolveItemPrice(crate, priceIndex([["sup-a", "cola", undefined, 4]]), null);
    expect(r.pricePerMain).toBe(96);
  });

  it("בלי ספקים — מחיר ידני", () => {
    const r = resolveItemPrice(tomato, new Map(), null, conversion("tomato", { manual_unit_cost: 8 }));
    expect(r).toMatchObject({ source: "manual", pricePerMain: 8, supplierId: null });
  });

  it("בלי ספקים ובלי מחיר ידני — אין מחיר", () => {
    const r = resolveItemPrice(tomato, undefined, null, null);
    expect(r).toMatchObject({ source: "none", pricePerMain: 0 });
  });

  it("ספק עם מחיר 0 לא נספר כהצעה", () => {
    const r = resolveItemPrice(tomato, priceIndex([["sup-a", "tomato", 0]]), null);
    expect(r.source).toBe("none");
  });
});

/* ------------------------------------------------------------------ */
/* Waste                                                               */
/* ------------------------------------------------------------------ */

describe("פחת", () => {
  it("20% פחת → צריך לקנות 25% יותר (100 גרם נטו = 125 ברוטו)", () => {
    expect(grossQuantity(100, 20)).toBeCloseTo(125, 6);
  });

  it("0% פחת לא משנה", () => {
    expect(grossQuantity(100, 0)).toBe(100);
  });

  it("פחת שלילי / מעל 100 נחתך ולא מייצר אינסוף", () => {
    expect(grossQuantity(100, -5)).toBe(100);
    expect(Number.isFinite(grossQuantity(100, 150))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Recipe costing                                                      */
/* ------------------------------------------------------------------ */

describe("תמחור מנה פשוטה", () => {
  const items = [
    item("tomato", "עגבניות", "ק״ג"),
    item("oil", "שמן זית", "ליטר"),
    item("egg", "ביצים", "תבנית", { units_per_package: 30, piece_unit: "ביצה" }),
  ];
  const prices = priceIndex([
    ["sup-a", "tomato", 8], // ₪8 לק״ג → ₪0.008 לגרם
    ["sup-a", "oil", 40], // ₪40 לליטר → ₪0.04 למ״ל
    ["sup-a", "egg", 36], // ₪36 לתבנית של 30 → ₪1.2 לביצה
  ]);

  it("גרם / מ״ל / פריט — כל שורה מחושבת לפי התכולה שלה", () => {
    const salad = dish("salad", "סלט");
    const ctx = context({
      items,
      dishes: [salad],
      components: [
        line("salad", { item_id: "tomato", quantity: 250, unit: "g" }), // 250 × 0.008 = 2.00
        line("salad", { item_id: "oil", quantity: 30, unit: "ml" }), // 30 × 0.04 = 1.20
        line("salad", { item_id: "egg", quantity: 2, unit: "piece" }), // 2 × 1.2 = 2.40
      ],
      prices,
    });
    const cost = costDish("salad", ctx);
    expect(cost.complete).toBe(true);
    expect(cost.lines.map((l) => l.cost)).toEqual([2, 1.2, 2.4]);
    expect(cost.totalCost).toBeCloseTo(5.6, 4);
    expect(cost.costPerYieldUnit).toBeCloseTo(5.6, 4);
  });

  it("ק״ג וליטר במתכון מומרים לבסיס (0.25 ק״ג = 250 גרם)", () => {
    const ctx = context({
      items,
      dishes: [dish("d", "מנה")],
      components: [line("d", { item_id: "tomato", quantity: 0.25, unit: "kg" }), line("d", { item_id: "oil", quantity: 0.03, unit: "l" })],
      prices,
    });
    const cost = costDish("d", ctx);
    expect(cost.lines[0].cost).toBeCloseTo(2, 4);
    expect(cost.lines[1].cost).toBeCloseTo(1.2, 4);
  });

  it("יחידת רכש שלמה (main) עולה מחיר הספק המלא", () => {
    const ctx = context({
      items,
      dishes: [dish("d", "מנה")],
      components: [line("d", { item_id: "egg", quantity: 1, unit: "main" })],
      prices,
    });
    expect(costDish("d", ctx).totalCost).toBe(36);
  });

  it("פחת מנפח את העלות: 100 גרם עגבניות ב-20% פחת = 125 גרם = ₪1", () => {
    const ctx = context({
      items,
      dishes: [dish("d", "מנה")],
      components: [line("d", { item_id: "tomato", quantity: 100, unit: "g", waste_pct: 20 })],
      prices,
    });
    const l = costDish("d", ctx).lines[0];
    expect(l.grossQuantity).toBeCloseTo(125, 6);
    expect(l.cost).toBeCloseTo(1, 4);
  });

  it("חלק כל שורה מסך העלות מסתכם ל-1", () => {
    const ctx = context({
      items,
      dishes: [dish("d", "מנה")],
      components: [line("d", { item_id: "tomato", quantity: 250, unit: "g" }), line("d", { item_id: "oil", quantity: 30, unit: "ml" })],
      prices,
    });
    const cost = costDish("d", ctx);
    expect(cost.lines.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1, 9);
    expect(cost.lines[0].share).toBeCloseTo(2 / 3.2, 9);
  });

  it("ספק נעוץ בשורה משנה את העלות ומדווח על הספק", () => {
    const twoSuppliers = priceIndex([
      ["sup-a", "tomato", 8],
      ["sup-b", "tomato", 6],
    ]);
    const ctx = context({
      items,
      dishes: [dish("d", "מנה")],
      components: [
        line("d", { item_id: "tomato", quantity: 1000, unit: "g" }),
        line("d", { item_id: "tomato", quantity: 1000, unit: "g", supplier_id: "sup-a" }),
      ],
      prices: twoSuppliers,
    });
    const [cheapest, pinned] = costDish("d", ctx).lines;
    expect(cheapest.cost).toBe(6);
    expect(cheapest.supplierId).toBe("sup-b");
    expect(pinned.cost).toBe(8);
    expect(pinned.supplierId).toBe("sup-a");
  });

  it("מנה בלי מרכיבים עולה 0 ונחשבת שלמה", () => {
    const cost = costDish("d", context({ dishes: [dish("d", "ריקה")] }));
    expect(cost.totalCost).toBe(0);
    expect(cost.complete).toBe(true);
    expect(cost.lines).toEqual([]);
  });
});

describe("בעיות בשורות — מה חוסם ומה רק מזהיר", () => {
  it("מוצר בלי מחיר → no_price, השורה 0 והמנה לא שלמה", () => {
    const ctx = context({
      items: [item("tomato", "עגבניות", "ק״ג")],
      dishes: [dish("d", "מנה")],
      components: [line("d", { item_id: "tomato", quantity: 100, unit: "g" })],
    });
    const cost = costDish("d", ctx);
    expect(cost.lines[0].issues).toEqual(["no_price"]);
    expect(cost.lines[0].unitCost).toBeNull();
    expect(cost.complete).toBe(false);
    expect(cost.uncostedLines).toBe(1);
  });

  it("מתכון בגרם על מוצר שנספר בלבד → needs_conversion", () => {
    const crate = item("cola", "קולה", "ארגז", { units_per_package: 24, piece_unit: "בקבוק" });
    const ctx = context({
      items: [crate],
      dishes: [dish("d", "מנה")],
      components: [line("d", { item_id: "cola", quantity: 200, unit: "ml" })],
      prices: priceIndex([["sup-a", "cola", 96]]),
    });
    const cost = costDish("d", ctx);
    expect(cost.lines[0].issues).toEqual(["needs_conversion"]);
    expect(cost.complete).toBe(false);
  });

  it("אחרי הוספת המרה (בקבוק = 330 מ״ל) השורה מתומחרת: 200 מ״ל מתוך 7920 ב-₪96", () => {
    const crate = item("cola", "קולה", "ארגז", { units_per_package: 24, piece_unit: "בקבוק" });
    const ctx = context({
      items: [crate],
      dishes: [dish("d", "מנה")],
      components: [line("d", { item_id: "cola", quantity: 200, unit: "ml" })],
      conversions: [conversion("cola", { content_qty: 330, content_measure: "ml" })],
      prices: priceIndex([["sup-a", "cola", 96]]),
    });
    const cost = costDish("d", ctx);
    expect(cost.complete).toBe(true);
    expect(cost.totalCost).toBeCloseTo((96 / (24 * 330)) * 200, 3);
  });

  it("גרם מול מוצר שנמדד במ״ל → measure_mismatch", () => {
    const ctx = context({
      items: [item("oil", "שמן", "ליטר")],
      dishes: [dish("d", "מנה")],
      components: [line("d", { item_id: "oil", quantity: 50, unit: "g" })],
      prices: priceIndex([["sup-a", "oil", 40]]),
    });
    expect(costDish("d", ctx).lines[0].issues).toEqual(["measure_mismatch"]);
  });

  it("«יחידה» במתכון על מוצר שנספר — תקין (ביצה מתוך תבנית של 30)", () => {
    const ctx = context({
      items: [item("egg", "ביצים", "תבנית", { units_per_package: 30 })],
      dishes: [dish("d", "מנה")],
      components: [line("d", { item_id: "egg", quantity: 3, unit: "unit" })],
      prices: priceIndex([["sup-a", "egg", 30]]),
    });
    const cost = costDish("d", ctx);
    expect(cost.complete).toBe(true);
    expect(cost.totalCost).toBe(3);
  });

  it("מוצר שנמחק מהמלאי → missing_item", () => {
    const ctx = context({
      dishes: [dish("d", "מנה")],
      components: [line("d", { item_id: "ghost", quantity: 1, unit: "g" })],
    });
    expect(costDish("d", ctx).lines[0].issues).toEqual(["missing_item"]);
  });

  it("ספק נעוץ שלא מתמחר — אזהרה רכה, השורה עדיין מתומחרת לפי הזול", () => {
    const ctx = context({
      items: [item("tomato", "עגבניות", "ק״ג")],
      dishes: [dish("d", "מנה")],
      components: [line("d", { item_id: "tomato", quantity: 1000, unit: "g", supplier_id: "sup-gone" })],
      prices: priceIndex([["sup-a", "tomato", 8]]),
    });
    const cost = costDish("d", ctx);
    expect(cost.lines[0].issues).toEqual(["pinned_supplier_missing"]);
    expect(cost.lines[0].cost).toBe(8);
    expect(cost.complete).toBe(true);
  });
});

describe("הכנות בסיס (sub-recipes)", () => {
  const items = [item("tomato", "עגבניות", "ק״ג"), item("oil", "שמן זית", "ליטר"), item("pasta", "פסטה", "ק״ג")];
  const prices = priceIndex([
    ["sup-a", "tomato", 8],
    ["sup-a", "oil", 40],
    ["sup-a", "pasta", 12],
  ]);
  // רוטב: 2 ק״ג עגבניות (₪16) + 100 מ״ל שמן (₪4) = ₪20 לאצווה של 2000 גרם → ₪0.01 לגרם
  const sauce = dish("sauce", "רוטב עגבניות", { kind: "prep", yield_qty: 2000, yield_measure: "g" });
  const sauceLines = [line("sauce", { item_id: "tomato", quantity: 2, unit: "kg" }), line("sauce", { item_id: "oil", quantity: 100, unit: "ml" })];

  it("עלות ההכנה מחולקת בתפוקה — 150 גרם רוטב = ₪1.50", () => {
    const pasta = dish("pasta-dish", "פסטה ברוטב");
    const ctx = context({
      items,
      dishes: [sauce, pasta],
      components: [...sauceLines, line("pasta-dish", { sub_dish_id: "sauce", quantity: 150, unit: "g" }), line("pasta-dish", { item_id: "pasta", quantity: 120, unit: "g" })],
      prices,
    });
    const cost = costDish("pasta-dish", ctx);
    expect(cost.complete).toBe(true);
    expect(cost.lines[0].cost).toBeCloseTo(1.5, 4);
    expect(cost.lines[0].sub?.totalCost).toBeCloseTo(20, 4);
    expect(cost.lines[0].sub?.costPerYieldUnit).toBeCloseTo(0.01, 6);
    expect(cost.lines[1].cost).toBeCloseTo(1.44, 4);
    expect(cost.totalCost).toBeCloseTo(2.94, 4);
  });

  it("פחת על הכנה (רוטב שנשפך) מנפח גם אותו", () => {
    const ctx = context({
      items,
      dishes: [sauce, dish("d", "מנה")],
      components: [...sauceLines, line("d", { sub_dish_id: "sauce", quantity: 100, unit: "g", waste_pct: 50 })],
      prices,
    });
    expect(costDish("d", ctx).totalCost).toBeCloseTo(2, 4);
  });

  it("«אצווה שלמה» של הכנה = כל עלות האצווה", () => {
    const ctx = context({
      items,
      dishes: [sauce, dish("d", "מנה")],
      components: [...sauceLines, line("d", { sub_dish_id: "sauce", quantity: 1, unit: "main" })],
      prices,
    });
    expect(costDish("d", ctx).totalCost).toBeCloseTo(20, 4);
  });

  it("מ״ל מהכנה שתפוקתה בגרם → measure_mismatch", () => {
    const ctx = context({
      items,
      dishes: [sauce, dish("d", "מנה")],
      components: [...sauceLines, line("d", { sub_dish_id: "sauce", quantity: 100, unit: "ml" })],
      prices,
    });
    const cost = costDish("d", ctx);
    expect(cost.lines[0].issues).toEqual(["measure_mismatch"]);
    expect(cost.complete).toBe(false);
  });

  it("בעיה עמוק בעץ עולה למעלה: מוצר בלי מחיר בתוך רוטב → המנה לא שלמה", () => {
    const ctx = context({
      items,
      dishes: [sauce, dish("d", "מנה")],
      components: [...sauceLines, line("d", { sub_dish_id: "sauce", quantity: 100, unit: "g" })],
      prices: priceIndex([["sup-a", "oil", 40]]), // אין מחיר לעגבניות
    });
    const cost = costDish("d", ctx);
    expect(cost.complete).toBe(false);
    expect(cost.issues).toContain("no_price");
    expect(cost.uncostedLines).toBe(1);
  });

  it("שלוש רמות: מנה → הכנה → הכנה", () => {
    const base = dish("base", "ציר", { kind: "prep", yield_qty: 1000, yield_measure: "ml" });
    const soup = dish("soup", "בסיס מרק", { kind: "prep", yield_qty: 500, yield_measure: "ml" });
    const ctx = context({
      items,
      dishes: [base, soup, dish("d", "מרק")],
      components: [
        line("base", { item_id: "oil", quantity: 250, unit: "ml" }), // ₪10 ל-1000 מ״ל → 0.01/מ״ל
        line("soup", { sub_dish_id: "base", quantity: 500, unit: "ml" }), // ₪5 ל-500 מ״ל → 0.01/מ״ל
        line("d", { sub_dish_id: "soup", quantity: 300, unit: "ml" }), // ₪3
      ],
      prices,
    });
    const cost = costDish("d", ctx);
    expect(cost.totalCost).toBeCloseTo(3, 4);
    expect([...collectSubDishIds(cost)].sort()).toEqual(["base", "soup"]);
    expect([...collectItemIds(cost)]).toEqual(["oil"]);
  });

  it("הכנה שנמחקה → missing_sub", () => {
    const ctx = context({ dishes: [dish("d", "מנה")], components: [line("d", { sub_dish_id: "ghost", quantity: 1, unit: "g" })] });
    expect(costDish("d", ctx).lines[0].issues).toEqual(["missing_sub"]);
  });
});

describe("מעגלים בעץ", () => {
  it("A מכיל B ו-B מכיל A — לא נתקעים, מסומן cycle", () => {
    const a = dish("a", "A", { kind: "prep", yield_qty: 1000, yield_measure: "g" });
    const b = dish("b", "B", { kind: "prep", yield_qty: 1000, yield_measure: "g" });
    const ctx = context({
      dishes: [a, b],
      components: [line("a", { sub_dish_id: "b", quantity: 100, unit: "g" }), line("b", { sub_dish_id: "a", quantity: 100, unit: "g" })],
    });
    const cost = costDish("a", ctx);
    expect(cost.issues).toContain("cycle");
    expect(cost.complete).toBe(false);
    expect(Number.isFinite(cost.totalCost)).toBe(true);
  });

  it("מנה שמכילה את עצמה", () => {
    const ctx = context({
      dishes: [dish("a", "A", { kind: "prep", yield_qty: 100, yield_measure: "g" })],
      components: [line("a", { sub_dish_id: "a", quantity: 10, unit: "g" })],
    });
    expect(costDish("a", ctx).lines[0].issues).toEqual(["cycle"]);
  });
});

describe("תמחור כל התפריט בבת אחת", () => {
  it("הכנה משותפת מחושבת פעם אחת ומשמשת את כל המנות", () => {
    const sauce = dish("sauce", "רוטב", { kind: "prep", yield_qty: 1000, yield_measure: "g" });
    const ctx = context({
      items: [item("tomato", "עגבניות", "ק״ג")],
      dishes: [sauce, dish("d1", "מנה 1"), dish("d2", "מנה 2")],
      components: [
        line("sauce", { item_id: "tomato", quantity: 1, unit: "kg" }),
        line("d1", { sub_dish_id: "sauce", quantity: 100, unit: "g" }),
        line("d2", { sub_dish_id: "sauce", quantity: 200, unit: "g" }),
      ],
      prices: priceIndex([["sup-a", "tomato", 10]]),
    });
    const all = costAllDishes(ctx);
    expect(all.size).toBe(3);
    expect(all.get("sauce")?.totalCost).toBe(10);
    expect(all.get("d1")?.totalCost).toBe(1);
    expect(all.get("d2")?.totalCost).toBe(2);
    // אותו אובייקט memo — ההכנה לא חושבה פעמיים
    expect(all.get("d1")?.lines[0].sub).toBe(all.get("sauce"));

    const usage = itemUsageIndex(all, ctx.dishes);
    expect(usage.get("tomato")?.map((d) => d.id).sort()).toEqual(["d1", "d2", "sauce"]);
  });
});

/* ------------------------------------------------------------------ */
/* Economics                                                           */
/* ------------------------------------------------------------------ */

describe("כלכלת מנה — מע״מ, רווח, Food Cost", () => {
  const cost = { totalCost: 20, costPerYieldUnit: 20 };

  it("מחיר ₪59 כולל מע״מ 18% ועלות ₪20: נטו 50, רווח 30, Food Cost 40%", () => {
    const e = dishEconomics(dish("d", "מנה", { selling_price: 59 }), cost, SETTINGS);
    expect(e.sellingNet).toBeCloseTo(50, 6);
    expect(e.vatAmount).toBeCloseTo(9, 6);
    expect(e.profit).toBe(30);
    expect(e.foodCostPct).toBeCloseTo(40, 6);
    expect(e.marginPct).toBeCloseTo(60, 6);
    expect(e.markup).toBeCloseTo(2.5, 6);
    expect(e.targetPct).toBe(30);
    expect(e.deltaToTargetPct).toBeCloseTo(10, 6);
    expect(e.status).toBe("over");
  });

  it("מחיר מוצע ליעד 30%: 20 / 0.3 = 66.67 נטו → 78.67 ברוטו → ₪79 מעוגל למעלה", () => {
    const e = dishEconomics(dish("d", "מנה", { selling_price: 59 }), cost, SETTINGS);
    expect(e.targetPrice).toBeCloseTo((20 / 0.3) * 1.18, 6);
    expect(e.suggestedPrice).toBe(79);
    // במחיר המוצע אנחנו אכן ביעד
    const at = economicsAtPrice(dish("d", "מנה"), cost, SETTINGS, 79);
    expect(at.foodCostPct!).toBeLessThanOrEqual(30);
    expect(at.status).toBe("good");
  });

  it("יעד לפי מנה עוקף את יעד העסק", () => {
    const e = dishEconomics(dish("d", "מנה", { selling_price: 59, target_food_cost_pct: 45 }), cost, SETTINGS);
    expect(e.targetPct).toBe(45);
    expect(e.status).toBe("good");
  });

  it("מחירים ללא מע״מ — המחיר הוא כבר הנטו", () => {
    const e = dishEconomics(dish("d", "מנה", { selling_price: 50 }), cost, { ...SETTINGS, prices_include_vat: false });
    expect(e.sellingNet).toBe(50);
    expect(e.vatAmount).toBeCloseTo(9, 6);
    expect(e.profit).toBe(30);
    expect(e.suggestedPrice).toBe(67); // 66.67 נטו מעוגל למעלה
  });

  it("עלויות כולל מע״מ — העלות מנוקה לפני חישוב הרווח", () => {
    const e = dishEconomics(dish("d", "מנה", { selling_price: 59 }), { totalCost: 23.6, costPerYieldUnit: 23.6 }, { ...SETTINGS, costs_include_vat: true });
    expect(e.portionCostNet).toBeCloseTo(20, 6);
    expect(e.profit).toBe(30);
  });

  it("בלי מחיר מכירה — אין רווח ואין אחוזים, אבל יש מחיר מוצע", () => {
    const e = dishEconomics(dish("d", "מנה"), cost, SETTINGS);
    expect(e.sellingPrice).toBeNull();
    expect(e.profit).toBeNull();
    expect(e.foodCostPct).toBeNull();
    expect(e.suggestedPrice).toBe(79);
    expect(e.status).toBe("unknown");
  });

  it("מנה בעלות 0 — סטטוס לא ידוע ואין מחיר מוצע", () => {
    const e = dishEconomics(dish("d", "מנה", { selling_price: 30 }), { totalCost: 0, costPerYieldUnit: 0 }, SETTINGS);
    expect(e.status).toBe("unknown");
    expect(e.suggestedPrice).toBeNull();
    expect(e.markup).toBeNull();
  });

  it("מכירה בהפסד — רווח שלילי ו-Food Cost מעל 100%", () => {
    const e = dishEconomics(dish("d", "מנה", { selling_price: 11.8 }), cost, SETTINGS);
    expect(e.sellingNet).toBeCloseTo(10, 6);
    expect(e.profit).toBe(-10);
    expect(e.foodCostPct).toBeCloseTo(200, 6);
    expect(e.status).toBe("over");
  });

  it("תרומה חודשית = רווח × מכירות", () => {
    const e = dishEconomics(dish("d", "מנה", { selling_price: 59, monthly_sales: 120 }), cost, SETTINGS);
    expect(e.monthlyContribution).toBe(3600);
  });

  it("סטטוס: ביעד / עד 5 נקודות מעל / מעבר לזה", () => {
    expect(marginStatus(30, 30)).toBe("good");
    expect(marginStatus(34.9, 30)).toBe("warn");
    expect(marginStatus(35, 30)).toBe("warn");
    expect(marginStatus(35.1, 30)).toBe("over");
    expect(marginStatus(null, 30)).toBe("unknown");
  });

  it("עיגול מחיר תפריט — תמיד למעלה לשקל שלם, בלי לקפוץ על שלם מדויק", () => {
    expect(roundMenuPrice(78.01)).toBe(79);
    expect(roundMenuPrice(79)).toBe(79);
    expect(roundMenuPrice(79.0000000001)).toBe(79);
  });
});

describe("סיכום תפריט", () => {
  const cost = { totalCost: 20, costPerYieldUnit: 20 };
  const complete = { ...cost, dishId: "x", yieldQty: 1, yieldMeasure: "unit" as const, lines: [], issues: [], complete: true, uncostedLines: 0 };

  it("ממוצע פשוט מול ממוצע משוקלל במכירות", () => {
    const cheap = dishEconomics(dish("a", "A", { selling_price: 118, monthly_sales: 10 }), cost, SETTINGS); // FC 20%
    const dear = dishEconomics(dish("b", "B", { selling_price: 47.2, monthly_sales: 90 }), cost, SETTINGS); // FC 50%
    const s = summarizeMenu([
      { economics: cheap, cost: complete, sales: 10 },
      { economics: dear, cost: complete, sales: 90 },
    ]);
    expect(s.avgFoodCostPct).toBeCloseTo(35, 6);
    // (20×10 + 20×90) / (100×10 + 40×90) = 2000 / 4600
    expect(s.weightedFoodCostPct).toBeCloseTo((2000 / 4600) * 100, 6);
    expect(s.onTarget).toBe(1);
    expect(s.overTarget).toBe(1);
    expect(s.pricedCount).toBe(2);
    expect(s.totalMonthlyContribution).toBeCloseTo(80 * 10 + 20 * 90, 2);
  });

  it("מנות בלי מחיר ומנות לא שלמות נספרות בנפרד", () => {
    const unpriced = dishEconomics(dish("a", "A"), cost, SETTINGS);
    const s = summarizeMenu([{ economics: unpriced, cost: { ...complete, complete: false, uncostedLines: 1 }, sales: null }]);
    expect(s.unpriced).toBe(1);
    expect(s.incomplete).toBe(1);
    expect(s.avgFoodCostPct).toBeNull();
    expect(s.totalMonthlyContribution).toBeNull();
  });

  it("בלי נתוני מכירות — המשוקלל שווה לממוצע הפשוט", () => {
    const e = dishEconomics(dish("a", "A", { selling_price: 59 }), cost, SETTINGS);
    const s = summarizeMenu([{ economics: e, cost: complete, sales: null }]);
    expect(s.weightedFoodCostPct).toBe(s.avgFoodCostPct);
  });
});

describe("הנדסת תפריט (Kasavana–Smith)", () => {
  it("ארבע מנות → ארבעה רביעים", () => {
    const r = menuEngineering([
      { id: "star", profit: 40, sales: 100 },
      { id: "plowhorse", profit: 10, sales: 100 },
      { id: "puzzle", profit: 40, sales: 5 },
      { id: "dog", profit: 10, sales: 5 },
    ]);
    expect(r.quadrants.get("star")).toBe("star");
    expect(r.quadrants.get("plowhorse")).toBe("plowhorse");
    expect(r.quadrants.get("puzzle")).toBe("puzzle");
    expect(r.quadrants.get("dog")).toBe("dog");
    expect(r.popularityThreshold).toBeCloseTo(0.175, 9);
    // סף רווח = ממוצע משוקלל במכירות
    expect(r.marginThreshold).toBeCloseTo((40 * 100 + 10 * 100 + 40 * 5 + 10 * 5) / 210, 9);
  });

  it("מנות בלי מכירות לא משתתפות; פחות משתי מנות — אין סיווג", () => {
    expect(menuEngineering([{ id: "a", profit: 10, sales: 0 }]).quadrants.size).toBe(0);
    expect(menuEngineering([{ id: "a", profit: 10, sales: 50 }]).quadrants.size).toBe(0);
    const r = menuEngineering([
      { id: "a", profit: 10, sales: 50 },
      { id: "b", profit: 10, sales: 50 },
      { id: "c", profit: 10, sales: 0 },
    ]);
    expect(r.quadrants.has("c")).toBe(false);
    expect(r.quadrants.size).toBe(2);
  });
});

describe("הודעות שגיאה בשמירה", () => {
  it("מעגל מהטריגר במסד מתורגם לעברית", () => {
    expect(menuSaveError({ message: "MENU_CYCLE: dish x is already contained in sub-recipe y" })).toMatch(/מעגל/);
  });

  it("טבלאות חסרות → הוראה להריץ את המיגרציה", () => {
    expect(menuSaveError(new Error('relation "public.menu_dishes" does not exist'))).toMatch(/20260915100000_menu_costing/);
  });

  it("מחיקת הכנה בשימוש → הסבר", () => {
    expect(menuSaveError({ message: 'update or delete on table "menu_dishes" violates foreign key constraint "menu_dish_components_sub_dish_id_fkey"' })).toMatch(/בשימוש/);
  });

  it("שגיאה כללית מוחזרת כפי שהיא", () => {
    expect(menuSaveError(new Error("boom"))).toBe("boom");
    expect(menuSaveError(null)).toBe("שגיאה בשמירה");
  });
});
