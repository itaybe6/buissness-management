/**
 * בדיקות עומס — מלאי והזמנות של עסק גדול.
 *
 * התרחיש: 2,000 מוצרים, 12,000 שורות הזמנה ב-600 אצוות, מתוכן מאות אספקות
 * חלקיות. מסך הסחורות מקבץ, מתמחר וסופר התראות — הכול בצד הלקוח.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  batchHasActivePartialDelivery,
  formatQtyWithPieces,
  groupInventoryOrdersByBatch,
  isTrackedLowStock,
  itemWarehouseQty,
  orderBatchTotal,
  splitPackageQty,
} from "@/api/inventory";
import type { SupplierItemPrices } from "@/api/suppliers";
import { nextWarehouseQty, planOrderReceive } from "@/lib/inventoryReceive";
import {
  acknowledgePartialOrderBatch,
  countUnacknowledgedPartialDeliveryBatches,
  getPartialOrderAcks,
} from "@/lib/partialOrderNotifications";
import { assertScalesLinearly, assertWithinBudget, measureBest } from "../helpers/perf";
import { installFakeBrowser, type FakeBrowserEnv } from "../helpers/browserEnv";
import {
  BUSINESS_ID,
  USER,
  WAREHOUSE,
  makeItemWithQty,
  makeOrder,
  makeWarehouseStock,
} from "../helpers/factories";
import type { InventoryOrder } from "@/types/database";

const ITEM_COUNT = 2000;
const BATCH_COUNT = 600;
const LINES_PER_BATCH = 20;

const items = Array.from({ length: ITEM_COUNT }, (_, i) =>
  makeItemWithQty({
    id: `item-${i}`,
    name: `מוצר ${i}`,
    unit: i % 3 === 0 ? "יחידות" : "ארגז",
    units_per_package: i % 3 === 0 ? null : 6 + (i % 18),
    min_quantity: i % 4 === 0 ? 0 : 5,
    current_qty: i % 7,
    warehouse_stocks: [
      makeWarehouseStock({ warehouse_id: WAREHOUSE.main, quantity: i % 7 }),
      makeWarehouseStock({ warehouse_id: WAREHOUSE.bar, warehouse_name: "מחסן בר", quantity: i % 4 }),
    ],
  }),
);

const prices = new Map<string, SupplierItemPrices>(
  items.map((item, i) => [item.id, i % 5 === 0 ? { piece: 1.5 } : { main: 10 + (i % 40) }]),
);

/** אצווה אחת מכל שלוש מגיעה חלקית ומשאירה יתרה פתוחה. */
function buildOrders(batchCount: number): InventoryOrder[] {
  const orders: InventoryOrder[] = [];
  for (let b = 0; b < batchCount; b++) {
    const batchId = `batch-${b}`;
    const partial = b % 3 === 0;
    for (let l = 0; l < LINES_PER_BATCH; l++) {
      const itemIndex = (b * LINES_PER_BATCH + l) % ITEM_COUNT;
      const isFirstLine = l === 0;
      orders.push(
        makeOrder({
          id: `${batchId}-line-${l}`,
          batch_id: batchId,
          item_id: `item-${itemIndex}`,
          quantity: 10,
          received_quantity: partial && isFirstLine ? 6 : null,
          status: partial && isFirstLine ? "received" : "requested",
          created_at: `2026-07-${String((b % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
        }),
      );
    }
  }
  return orders;
}

const orders = buildOrders(BATCH_COUNT);

let env: FakeBrowserEnv;
beforeEach(() => {
  env = installFakeBrowser();
});
afterEach(() => {
  env.restore();
});

describe("היקף נתוני המלאי", () => {
  it("הנתונים בסדר גודל של רשת", () => {
    expect(items).toHaveLength(ITEM_COUNT);
    expect(orders).toHaveLength(BATCH_COUNT * LINES_PER_BATCH);
  });
});

describe("קיבוץ ותמחור אצוות בהיקף מלא", () => {
  it("מקבץ 12,000 שורות ל-600 אצוות", () => {
    const { result: grouped, ms } = measureBest(() => groupInventoryOrdersByBatch(orders));
    assertWithinBudget("קיבוץ 12,000 שורות הזמנה", ms, 2000);

    expect(grouped.size).toBe(BATCH_COUNT);
    for (const [, lines] of grouped) expect(lines).toHaveLength(LINES_PER_BATCH);
  });

  it("מחשב סכום לכל אצווה בלי NaN", () => {
    const grouped = groupInventoryOrdersByBatch(orders);
    const withItems = new Map(items.map((i) => [i.id, i]));

    const { result: totals, ms } = measureBest(() =>
      [...grouped.values()].map((lines) =>
        orderBatchTotal(
          lines.map((l) => ({ ...l, item: withItems.get(l.item_id) ?? null })),
          prices,
        ),
      ),
    );
    assertWithinBudget("תמחור 600 אצוות", ms, 3000);

    expect(totals).toHaveLength(BATCH_COUNT);
    for (const total of totals) {
      expect(Number.isFinite(total)).toBe(true);
      expect(total).toBeGreaterThan(0);
    }
  });

  it("הזמן גדל ליניארית עם מספר האצוות", () => {
    const small = buildOrders(150);
    const large = buildOrders(600);
    const smallMs = measureBest(() => groupInventoryOrdersByBatch(small)).ms;
    const largeMs = measureBest(() => groupInventoryOrdersByBatch(large)).ms;
    assertScalesLinearly({ label: "קיבוץ אצוות", smallMs, largeMs, ratio: 4, maxGrowthFactor: 20 });
  });
});

describe("התראות אספקה חלקית בהיקף מלא", () => {
  it("סופר בדיוק את האצוות החלקיות שטרם סומנו", () => {
    const { result: count, ms } = measureBest(() => countUnacknowledgedPartialDeliveryBatches(orders, {}));
    assertWithinBudget("ספירת התראות מ-12,000 שורות", ms, 2000);

    const expected = Math.ceil(BATCH_COUNT / 3);
    expect(count).toBe(expected);
  });

  it("סימון כל האצוות מאפס את המונה", () => {
    const grouped = groupInventoryOrdersByBatch(orders);
    for (const [key, lines] of grouped) {
      if (batchHasActivePartialDelivery(lines)) {
        acknowledgePartialOrderBatch(USER.officeManager, BUSINESS_ID, key, "2026-08-01T00:00:00.000Z");
      }
    }
    const acks = getPartialOrderAcks(USER.officeManager, BUSINESS_ID);
    expect(Object.keys(acks)).toHaveLength(Math.ceil(BATCH_COUNT / 3));
    expect(countUnacknowledgedPartialDeliveryBatches(orders, acks)).toBe(0);
  });

  it("אצווה אחת שהתעדכנה מחדש מדליקה רק את עצמה", () => {
    const grouped = groupInventoryOrdersByBatch(orders);
    const acks: Record<string, string> = {};
    for (const [key, lines] of grouped) {
      if (batchHasActivePartialDelivery(lines)) acks[key] = "2026-08-01T00:00:00.000Z";
    }
    delete acks["batch-0"];
    expect(countUnacknowledgedPartialDeliveryBatches(orders, acks)).toBe(1);
  });
});

describe("תצוגת כמויות ומינימום לכל הקטלוג", () => {
  it("מפרמט 2,000 מוצרים בלי לזרוק ובלי «undefined»", () => {
    const { result: labels, ms } = measureBest(() =>
      items.map((i) => formatQtyWithPieces(i.current_qty, i.unit, i.units_per_package)),
    );
    assertWithinBudget("פירמוט 2,000 כמויות", ms, 1000);

    expect(labels).toHaveLength(ITEM_COUNT);
    for (const label of labels) {
      expect(label).toBeTruthy();
      expect(label).not.toContain("undefined");
      expect(label).not.toContain("NaN");
    }
  });

  it("פיצול לאריזות תמיד מחזיר מספרים שלמים", () => {
    for (const item of items) {
      if (!item.units_per_package) continue;
      const { packages, pieces } = splitPackageQty(item.current_qty, item.units_per_package);
      expect(Number.isInteger(packages)).toBe(true);
      expect(Number.isInteger(pieces)).toBe(true);
      expect(pieces).toBeLessThan(item.units_per_package);
    }
  });

  it("התראת מינימום מסמנת רק מוצרים עם מינימום מוגדר", () => {
    const { result: low, ms } = measureBest(() => items.filter(isTrackedLowStock));
    assertWithinBudget("סינון חוסרים מ-2,000 מוצרים", ms, 1000);

    expect(low.length).toBeGreaterThan(0);
    for (const item of low) {
      expect(item.min_quantity).toBeGreaterThan(0);
      expect(item.current_qty).toBeLessThanOrEqual(item.min_quantity);
    }
  });

  it("שליפת מלאי לפי מחסן עובדת על כל הקטלוג", () => {
    const { ms } = measureBest(() => items.map((i) => itemWarehouseQty(i, WAREHOUSE.bar)));
    assertWithinBudget("שליפת מלאי מחסן ל-2,000 מוצרים", ms, 1000);
    expect(itemWarehouseQty(items[5], WAREHOUSE.bar)).toBe(5 % 4);
  });
});

describe("קבלת משלוח גדול מהספק", () => {
  /** 600 אצוות × 20 שורות — כל האצווה מתקבלת במלואה בבת אחת. */
  const allLines = orders.map((o) => ({ ordered: o.quantity, received: o.quantity }));

  it("תכנון קבלה מלאה ל-12,000 שורות — מהיר ובלי יתרות", () => {
    const { result: plans, ms } = measureBest(() => allLines.map(planOrderReceive));
    assertWithinBudget("תכנון קבלה מלאה ל-12,000 שורות", ms, 2000);

    expect(plans).toHaveLength(orders.length);
    expect(plans.every((p) => p.fullyArrived)).toBe(true);
    expect(plans.every((p) => p.remainderQty === 0)).toBe(true);
    expect(plans.every((p) => !p.createsRemainder)).toBe(true);
  });

  it("סך הסחורה שנכנסה למלאי שווה בדיוק לסך שהוזמן", () => {
    const ordered = allLines.reduce((s, l) => s + l.ordered, 0);
    const added = allLines.map(planOrderReceive).reduce((s, p) => s + p.stockDelta, 0);
    expect(added).toBe(ordered);
  });

  it("קבלה חלקית של חצי מכל שורה פותחת בדיוק חצי יתרה", () => {
    const half = orders.map((o) => planOrderReceive({ ordered: o.quantity, received: o.quantity / 2 }));
    expect(half.every((p) => p.createsRemainder)).toBe(true);
    const remainder = half.reduce((s, p) => s + p.remainderQty, 0);
    const ordered = orders.reduce((s, o) => s + o.quantity, 0);
    expect(remainder).toBe(ordered / 2);
  });

  it("מלאי מצטבר על פני 12,000 קבלות לא יורד מתחת לאפס ולא מאבד יחידות", () => {
    const { result: stock, ms } = measureBest(() =>
      allLines.reduce((qty, line) => nextWarehouseQty(qty, planOrderReceive(line).stockDelta), 0),
    );
    assertWithinBudget("צבירת מלאי מ-12,000 קבלות", ms, 2000);
    expect(stock).toBe(allLines.reduce((s, l) => s + l.received, 0));
  });

  it("הזמן גדל ליניארית עם מספר השורות", () => {
    const small = allLines.slice(0, 3000);
    const large = allLines;
    const smallMs = measureBest(() => small.map(planOrderReceive)).ms;
    const largeMs = measureBest(() => large.map(planOrderReceive)).ms;
    assertScalesLinearly({ label: "תכנון קבלות", smallMs, largeMs, ratio: 4, maxGrowthFactor: 20 });
  });
});
