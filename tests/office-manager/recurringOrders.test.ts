/**
 * ממשק מנהלת המשרד — הזמנות קבועות וטיוטת הזמנה שנשמרת.
 *
 * שני דברים שנועדו לחסוך זמן בעמוד «הזמנה חדשה»: הזמנה קבועה שמתחילה את
 * ההזמנה ממוצרים שכבר הוגדרו פעם אחת, וטיוטה שנשמרת אוטומטית כדי שיציאה
 * מהעמוד באמצע ההזמנה לא תמחק את הבחירה.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupplierItemPriceIndex } from "@/api/suppliers";
import type { SupplierBasics } from "@/lib/orderSuppliers";
import { recurringTemplateCart, recurringTemplateNotice, recurringTemplateSupplierGroups } from "@/lib/recurringOrders";
import {
  clearOrderDraft,
  draftSavedAgoLabel,
  loadOrderDraft,
  saveOrderDraft,
} from "@/lib/orderDraftStorage";
import { installFakeBrowser, type FakeBrowserEnv } from "../helpers/browserEnv";
import { makeItemWithQty } from "../helpers/factories";

const BEER = makeItemWithQty({ id: "item-beer", name: "בירה", unit: "ארגז", units_per_package: 24 });
const MILK = makeItemWithQty({ id: "item-milk", name: "חלב", unit: "ליטר", units_per_package: null });

const SUPPLIERS: SupplierBasics[] = [
  { id: "sup-a", name: "אלפא", delivery_days: [1] },
  { id: "sup-b", name: "בטא", delivery_days: [3] },
];

const CATALOG = new Map([BEER, MILK].map((i) => [i.id, i]));

function priceIndex(
  entries: [string, [string, { main?: number; piece?: number }][]][],
): SupplierItemPriceIndex {
  return new Map(entries.map(([supplierId, items]) => [supplierId, new Map(items)]));
}

const PRICES = priceIndex([
  ["sup-a", [["item-beer", { main: 120 }], ["item-milk", { main: 6 }]]],
  ["sup-b", [["item-beer", { main: 90 }]]],
]);

describe("התחלת הזמנה מהזמנה קבועה", () => {
  it("כל מוצר בתבנית חוזר לעגלה עם הכמות והספק שנשמרו", () => {
    const { lines, skipped } = recurringTemplateCart(
      [
        { item_id: "item-beer", supplier_id: "sup-a", quantity: 2 },
        { item_id: "item-milk", supplier_id: "sup-a", quantity: 5 },
      ],
      CATALOG,
      SUPPLIERS,
      PRICES,
    );

    expect(skipped).toBe(0);
    expect(lines["item-beer"]).toEqual({ supplier_id: "sup-a", packs: 2, pieces: 0 });
    expect(lines["item-milk"]).toEqual({ supplier_id: "sup-a", packs: 5, pieces: 0 });
  });

  it("כמות שכוללת יחידות בודדות מתפרקת חזרה לארגזים ויחידות", () => {
    const { lines } = recurringTemplateCart(
      [{ item_id: "item-beer", supplier_id: "sup-b", quantity: 2.5 }],
      CATALOG,
      SUPPLIERS,
      PRICES,
    );
    expect(lines["item-beer"]).toEqual({ supplier_id: "sup-b", packs: 2, pieces: 12 });
  });

  it("ספק שכבר לא מוכר את המוצר מוחלף בספק הזול ביותר שכן מוכר אותו", () => {
    const { lines, skipped } = recurringTemplateCart(
      [{ item_id: "item-milk", supplier_id: "sup-b", quantity: 3 }],
      CATALOG,
      SUPPLIERS,
      PRICES,
    );
    expect(skipped).toBe(0);
    expect(lines["item-milk"].supplier_id).toBe("sup-a");
  });

  it("מוצר שנמחק מהקטלוג או שאין לו ספק עם מחיר נספר כמדולג", () => {
    const { lines, skipped } = recurringTemplateCart(
      [
        { item_id: "item-gone", supplier_id: "sup-a", quantity: 1 },
        { item_id: "item-milk", supplier_id: null, quantity: 1 },
        { item_id: "item-beer", supplier_id: null, quantity: 1 },
      ],
      CATALOG,
      SUPPLIERS,
      priceIndex([["sup-a", [["item-milk", { main: 6 }]]]]),
    );

    expect(skipped).toBe(2);
    expect(Object.keys(lines)).toEqual(["item-milk"]);
  });

  it("ההודעה למשתמש מפרטת כמה מוצרים נטענו וכמה דולגו", () => {
    expect(recurringTemplateNotice("הזמנת בר", 4, 0)).toBe('נטענו 4 מוצרים מ"הזמנת בר"');
    expect(recurringTemplateNotice("הזמנת בר", 4, 2)).toContain("2 מוצרים דולגו");
    expect(recurringTemplateNotice("הזמנת בר", 0, 3)).toBe('אף מוצר מ"הזמנת בר" לא זמין להזמנה כרגע');
  });

  it("סינון לפי ספק טוען רק מוצרים שמסתיימים אצל אותו ספק", () => {
    const { lines, skipped } = recurringTemplateCart(
      [
        { item_id: "item-beer", supplier_id: "sup-a", quantity: 2 },
        { item_id: "item-milk", supplier_id: "sup-a", quantity: 5 },
      ],
      CATALOG,
      SUPPLIERS,
      PRICES,
      { supplierId: "sup-a" },
    );
    expect(skipped).toBe(0);
    expect(Object.keys(lines)).toEqual(["item-beer", "item-milk"]);

    const onlyBeta = recurringTemplateCart(
      [
        { item_id: "item-beer", supplier_id: "sup-b", quantity: 1 },
        { item_id: "item-milk", supplier_id: "sup-a", quantity: 1 },
      ],
      CATALOG,
      SUPPLIERS,
      PRICES,
      { supplierId: "sup-b" },
    );
    expect(onlyBeta.skipped).toBe(1);
    expect(Object.keys(onlyBeta.lines)).toEqual(["item-beer"]);
  });

  it("קיבוץ לפי ספק מציג שם מוצר, כמות וספק לכל שורה", () => {
    const template = {
      id: "tpl-1",
      name: "הזמנת בר",
      items: [
        { item_id: "item-beer", supplier_id: "sup-a", quantity: 2 },
        { item_id: "item-milk", supplier_id: "sup-a", quantity: 5 },
        { item_id: "item-beer", supplier_id: "sup-b", quantity: 1 },
      ],
    } as const;

    const groups = recurringTemplateSupplierGroups(
      template as never,
      CATALOG,
      new Map(SUPPLIERS.map((s) => [s.id, s])),
      (item, qty) => `${qty} ${item.unit ?? ""}`.trim(),
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]?.supplier_name).toBe("אלפא");
    expect(groups[0]?.lines).toHaveLength(2);
    expect(groups[1]?.supplier_name).toBe("בטא");
    expect(groups[1]?.lines[0]?.item_name).toBe("בירה");
  });
});

describe("טיוטת הזמנה שנשמרת בין ביקורים", () => {
  const USER = "user-1";
  const BUSINESS = "biz-1";
  const LINES = [{ item_id: "item-beer", supplier_id: "sup-a", packs: 2, pieces: 4 }];
  const KEY = `office_order_draft:${USER}:${BUSINESS}`;
  let env: FakeBrowserEnv;

  beforeEach(() => {
    env = installFakeBrowser();
  });

  afterEach(() => {
    env.restore();
  });

  it("העגלה חוזרת כמו שהייתה אחרי יציאה מהעמוד", () => {
    saveOrderDraft(USER, BUSINESS, LINES);
    expect(loadOrderDraft(USER, BUSINESS)?.lines).toEqual(LINES);
  });

  it("הטיוטה שמורה לכל משתמש ולכל עסק בנפרד", () => {
    saveOrderDraft(USER, BUSINESS, LINES);
    expect(loadOrderDraft("user-2", BUSINESS)).toBeNull();
    expect(loadOrderDraft(USER, "biz-2")).toBeNull();
  });

  it("שליחת ההזמנה או ניקוי הבחירה מוחקים את הטיוטה", () => {
    saveOrderDraft(USER, BUSINESS, LINES);
    clearOrderDraft(USER, BUSINESS);
    expect(loadOrderDraft(USER, BUSINESS)).toBeNull();

    saveOrderDraft(USER, BUSINESS, LINES);
    saveOrderDraft(USER, BUSINESS, []);
    expect(loadOrderDraft(USER, BUSINESS)).toBeNull();
  });

  it("טיוטה בת יותר משבוע כבר לא מוצעת לשחזור", () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    env.storage.set(KEY, JSON.stringify({ saved_at: old, lines: LINES }));
    expect(loadOrderDraft(USER, BUSINESS)).toBeNull();
    expect(env.storage.has(KEY)).toBe(false);
  });

  it("תוכן פגום בזיכרון הדפדפן לא מפיל את העמוד", () => {
    env.storage.set(KEY, "{{{");
    expect(loadOrderDraft(USER, BUSINESS)).toBeNull();
  });

  it("דפדפן במצב פרטי — שמירה לא זורקת וקריאה מחזירה null", () => {
    env.breakStorage(true);
    expect(() => saveOrderDraft(USER, BUSINESS, LINES)).not.toThrow();
    expect(loadOrderDraft(USER, BUSINESS)).toBeNull();
  });

  it("מתי נשמרה הטיוטה מוצג בשפה של המשתמש", () => {
    expect(draftSavedAgoLabel(new Date().toISOString())).toBe("עכשיו");
    expect(draftSavedAgoLabel(new Date(Date.now() - 5 * 60000).toISOString())).toBe("לפני 5 דק׳");
    expect(draftSavedAgoLabel(new Date(Date.now() - 3 * 3600000).toISOString())).toBe("לפני 3 שעות");
    expect(draftSavedAgoLabel(new Date(Date.now() - 26 * 3600000).toISOString())).toBe("אתמול");
  });
});
