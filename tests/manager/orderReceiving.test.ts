/**
 * המנהל מקבל סחורה מהספק — כולל המקרה שהכול הגיע.
 *
 * קבלת שורת הזמנה נוגעת בשלושה מקומות בבת אחת: סגירת השורה, פתיחת שורת
 * יתרה, ועדכון המלאי במחסן. אם אחד מהם לא מסונכרן — המלאי משקר. הבדיקות
 * כאן עוברות על כל צירוף אפשרי, עם דגש על «הגיע הכול» ועל תיקון בדיעבד.
 */
import { describe, expect, it } from "vitest";
import {
  RECEIVE_QTY_ERROR,
  STOCK_BELOW_ZERO_ERROR,
  isValidReceivedQty,
  nextWarehouseQty,
  orderReceivedRemainderQty,
  planOrderReceive,
  planReceiveCorrection,
} from "@/lib/inventoryReceive";
import {
  batchHasActivePartialDelivery,
  groupInventoryOrdersByBatch,
  isPartialReceivedOrderLine,
  orderBatchTotal,
  orderLineBillableQty,
} from "@/api/inventory";
import { countUnacknowledgedPartialDeliveryBatches } from "@/lib/partialOrderNotifications";
import { makeOrder } from "../helpers/factories";

// ---------------------------------------------------------------------------
// אימות הכמות שהמנהל מקליד
// ---------------------------------------------------------------------------

describe("כמה מותר להקליד בשדה «כמה הגיע»", () => {
  it("כמות בין 1 לכמות שהוזמנה תקינה", () => {
    expect(isValidReceivedQty(10, 1)).toBe(true);
    expect(isValidReceivedQty(10, 7)).toBe(true);
    expect(isValidReceivedQty(10, 10)).toBe(true);
  });

  it("אפס או שלילי נדחה — «לא הגיע» זו פעולה אחרת", () => {
    expect(isValidReceivedQty(10, 0)).toBe(false);
    expect(isValidReceivedQty(10, -3)).toBe(false);
  });

  it("יותר ממה שהוזמן נדחה", () => {
    expect(isValidReceivedQty(10, 11)).toBe(false);
    expect(isValidReceivedQty(10, 100)).toBe(false);
  });

  it("ערך לא מספרי נדחה ולא מייצר NaN במלאי", () => {
    expect(isValidReceivedQty(10, Number.NaN)).toBe(false);
    expect(isValidReceivedQty(10, Infinity)).toBe(false);
    expect(isValidReceivedQty(10, Number("abc"))).toBe(false);
  });

  it("כמות שברירית מותרת (ק״ג / ליטר)", () => {
    expect(isValidReceivedQty(10, 2.5)).toBe(true);
    expect(isValidReceivedQty(2.5, 2.5)).toBe(true);
  });

  it("הזמנה של יחידה אחת שהגיעה במלואה", () => {
    expect(isValidReceivedQty(1, 1)).toBe(true);
  });

  it("התכנון זורק את ההודעה שהמנהל רואה", () => {
    expect(() => planOrderReceive({ ordered: 10, received: 0 })).toThrow(RECEIVE_QTY_ERROR);
    expect(() => planOrderReceive({ ordered: 10, received: 11 })).toThrow(RECEIVE_QTY_ERROR);
  });
});

// ---------------------------------------------------------------------------
// המקרה המרכזי: הגיע הכול
// ---------------------------------------------------------------------------

describe("הגיע הכול — הזמנה נסגרת במלואה", () => {
  const plan = planOrderReceive({ ordered: 10, received: 10 });

  it("אין יתרה", () => {
    expect(plan.remainderQty).toBe(0);
    expect(plan.fullyArrived).toBe(true);
  });

  it("לא נפתחת שורת המשך — זה מה שמונע «הזמנות רפאים»", () => {
    expect(plan.createsRemainder).toBe(false);
  });

  it("כל הכמות נכנסת למלאי", () => {
    expect(plan.stockDelta).toBe(10);
  });

  it("הרישום ביומן לא כולל «מתוך» — הכול הגיע", () => {
    expect(plan.note).toBe("הגיע · נוסף למלאי +10");
    expect(plan.note).not.toContain("מתוך");
  });

  it("גם כמות שברירית שהגיעה במלואה נסגרת נקי", () => {
    const decimal = planOrderReceive({ ordered: 2.5, received: 2.5 });
    expect(decimal.fullyArrived).toBe(true);
    expect(decimal.remainderQty).toBe(0);
    expect(decimal.stockDelta).toBe(2.5);
  });

  it("היתרה מחושבת אפס ולא מספר שלילי זעיר", () => {
    expect(orderReceivedRemainderQty(10, 10)).toBe(0);
    expect(orderReceivedRemainderQty(10, 12)).toBe(0);
  });
});

describe("אצווה שכולה הגיעה — אין התראות ואין תג", () => {
  const fullyReceivedBatch = [
    makeOrder({ batch_id: "batch-full", quantity: 10, received_quantity: 10, status: "received" }),
    makeOrder({ batch_id: "batch-full", quantity: 4, received_quantity: 4, status: "received" }),
    makeOrder({ batch_id: "batch-full", quantity: 6, received_quantity: 6, status: "received" }),
  ];

  it("אף שורה אינה חלקית", () => {
    expect(fullyReceivedBatch.every((l) => !isPartialReceivedOrderLine(l))).toBe(true);
  });

  it("אין אספקה חלקית פעילה", () => {
    expect(batchHasActivePartialDelivery(fullyReceivedBatch)).toBe(false);
  });

  it("התג האדום של מנהלת המשרד לא נדלק", () => {
    expect(countUnacknowledgedPartialDeliveryBatches(fullyReceivedBatch, {})).toBe(0);
  });

  it("החיוב הוא בדיוק מה שהוזמן", () => {
    expect(fullyReceivedBatch.map(orderLineBillableQty)).toEqual([10, 4, 6]);
  });

  it("סכום האצווה מחושב לפי הכמויות המלאות", () => {
    const prices = new Map([["item-1", { main: 10 }]]);
    const total = orderBatchTotal(
      fullyReceivedBatch.map((l) => ({ ...l, item_id: "item-1" })),
      prices,
    );
    expect(total).toBe(200); // (10+4+6) × 10
  });

  it("האצווה עדיין מקובצת יחד להצגה בהיסטוריה", () => {
    const grouped = groupInventoryOrdersByBatch(fullyReceivedBatch);
    expect(grouped.size).toBe(1);
    expect(grouped.get("batch-full")).toHaveLength(3);
  });
});

describe("אצווה מעורבת — חלק הגיע במלואו וחלק חלקית", () => {
  const mixed = [
    makeOrder({ batch_id: "b", quantity: 10, received_quantity: 10, status: "received" }),
    makeOrder({ batch_id: "b", quantity: 8, received_quantity: 5, status: "received" }),
    makeOrder({ batch_id: "b", quantity: 3, status: "requested" }), // היתרה
  ];

  it("רק השורה החלקית מסומנת ככזו", () => {
    expect(mixed.map(isPartialReceivedOrderLine)).toEqual([false, true, false]);
  });

  it("האצווה כן מתריעה — יש יתרה פתוחה", () => {
    expect(batchHasActivePartialDelivery(mixed)).toBe(true);
  });

  it("אחרי שהיתרה מתקבלת גם היא — ההתראה נעלמת", () => {
    const closed = [
      mixed[0],
      mixed[1],
      makeOrder({ batch_id: "b", quantity: 3, received_quantity: 3, status: "received" }),
    ];
    expect(batchHasActivePartialDelivery(closed)).toBe(false);
    expect(countUnacknowledgedPartialDeliveryBatches(closed, {})).toBe(0);
  });

  it("המנהל סימן «לא הגיע» על היתרה — ההתראה נעלמת גם בלי שהגיע", () => {
    const withoutRemainder = [mixed[0], mixed[1]];
    expect(batchHasActivePartialDelivery(withoutRemainder)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// אספקה חלקית
// ---------------------------------------------------------------------------

describe("הגיע חלקית — נפתחת שורת יתרה", () => {
  const plan = planOrderReceive({ ordered: 10, received: 6 });

  it("היתרה היא ההפרש", () => {
    expect(plan.remainderQty).toBe(4);
    expect(plan.createsRemainder).toBe(true);
    expect(plan.fullyArrived).toBe(false);
  });

  it("למלאי נכנס רק מה שהגיע", () => {
    expect(plan.stockDelta).toBe(6);
  });

  it("הרישום ביומן מציין כמה מתוך כמה", () => {
    expect(plan.note).toBe("הגיע · נוסף למלאי +6 מתוך 10");
  });

  it("הגיעה יחידה אחת מתוך הרבה — עדיין חלקי תקין", () => {
    const barely = planOrderReceive({ ordered: 100, received: 1 });
    expect(barely.remainderQty).toBe(99);
    expect(barely.stockDelta).toBe(1);
  });

  it("כמעט הכול הגיע — נשארת יתרה של יחידה", () => {
    const almost = planOrderReceive({ ordered: 100, received: 99 });
    expect(almost.remainderQty).toBe(1);
    expect(almost.fullyArrived).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// תיקון קבלה בדיעבד
// ---------------------------------------------------------------------------

describe("תיקון קבלה — ממצב חלקי למצב «הגיע הכול»", () => {
  const plan = planReceiveCorrection({
    ordered: 10,
    previousReceived: 6,
    received: 10,
    hasRemainderOrder: true,
  });

  it("שורת היתרה נמחקת", () => {
    expect(plan.remainderAction).toBe("delete");
    expect(plan.remainderQty).toBe(0);
    expect(plan.fullyArrived).toBe(true);
  });

  it("למלאי נוספים רק ההפרש, לא הכמות המלאה שוב", () => {
    expect(plan.stockDelta).toBe(4);
  });

  it("הרישום מציין «הושלם»", () => {
    expect(plan.note).toBe("תיקון קבלה · 6 → 10 (הושלם)");
  });
});

describe("תיקון קבלה — ממצב «הגיע הכול» למצב חלקי", () => {
  const plan = planReceiveCorrection({
    ordered: 10,
    previousReceived: 10,
    received: 4,
    hasRemainderOrder: false,
  });

  it("נפתחת שורת יתרה חדשה", () => {
    expect(plan.remainderAction).toBe("create");
    expect(plan.createsRemainder).toBe(true);
    expect(plan.remainderQty).toBe(6);
  });

  it("המלאי יורד בהפרש", () => {
    expect(plan.stockDelta).toBe(-6);
  });

  it("הרישום מציין כמה מתוך כמה", () => {
    expect(plan.note).toBe("תיקון קבלה · 10 → 4 מתוך 10");
  });
});

describe("תיקון קבלה — בתוך המצב החלקי", () => {
  it("הגדלת הכמות שהגיעה מקטינה את היתרה הקיימת", () => {
    const plan = planReceiveCorrection({
      ordered: 10,
      previousReceived: 4,
      received: 7,
      hasRemainderOrder: true,
    });
    expect(plan.remainderAction).toBe("update");
    expect(plan.remainderQty).toBe(3);
    expect(plan.stockDelta).toBe(3);
  });

  it("הקטנת הכמות מגדילה את היתרה ומורידה מלאי", () => {
    const plan = planReceiveCorrection({
      ordered: 10,
      previousReceived: 7,
      received: 2,
      hasRemainderOrder: true,
    });
    expect(plan.remainderAction).toBe("update");
    expect(plan.remainderQty).toBe(8);
    expect(plan.stockDelta).toBe(-5);
  });

  it("תיקון לאותו ערך לא עושה כלום", () => {
    const plan = planReceiveCorrection({
      ordered: 10,
      previousReceived: 6,
      received: 6,
      hasRemainderOrder: true,
    });
    expect(plan.noop).toBe(true);
    expect(plan.stockDelta).toBe(0);
    expect(plan.remainderAction).toBe("none");
  });

  it("תיקון ל«הגיע הכול» כששורת היתרה כבר נמחקה ידנית — אין מה למחוק", () => {
    const plan = planReceiveCorrection({
      ordered: 10,
      previousReceived: 6,
      received: 10,
      hasRemainderOrder: false,
    });
    expect(plan.remainderAction).toBe("none");
    expect(plan.fullyArrived).toBe(true);
    expect(plan.stockDelta).toBe(4);
  });

  it("תיקון לכמות לא חוקית נחסם לפני שנוגעים במלאי", () => {
    expect(() =>
      planReceiveCorrection({ ordered: 10, previousReceived: 6, received: 0, hasRemainderOrder: true }),
    ).toThrow(RECEIVE_QTY_ERROR);
    expect(() =>
      planReceiveCorrection({ ordered: 10, previousReceived: 6, received: 15, hasRemainderOrder: true }),
    ).toThrow(RECEIVE_QTY_ERROR);
  });
});

// ---------------------------------------------------------------------------
// המלאי במחסן
// ---------------------------------------------------------------------------

describe("עדכון המלאי אחרי קבלה", () => {
  it("הכמות שהגיעה מתווספת למלאי הקיים", () => {
    expect(nextWarehouseQty(12, 6)).toBe(18);
  });

  it("תיקון שמוריד מלאי מוריד בפועל", () => {
    expect(nextWarehouseQty(18, -6)).toBe(12);
  });

  it("ירידה לאפס בדיוק מותרת", () => {
    expect(nextWarehouseQty(6, -6)).toBe(0);
  });

  it("ירידה מתחת לאפס נחסמת עם הודעה ברורה", () => {
    expect(() => nextWarehouseQty(3, -6)).toThrow(STOCK_BELOW_ZERO_ERROR);
  });

  it("מחסן ריק שמקבל סחורה מגיע לכמות שהתקבלה", () => {
    expect(nextWarehouseQty(0, 10)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// מסלולים שלמים
// ---------------------------------------------------------------------------

describe("מסלול מלא: הזמנה → קבלה → תיקון", () => {
  it("הוזמנו 10, הגיעו 6, ואז תוקן ל-10 — המלאי מסתכם ב-10 בלי יתרה", () => {
    let stock = 0;

    const first = planOrderReceive({ ordered: 10, received: 6 });
    stock = nextWarehouseQty(stock, first.stockDelta);
    expect(stock).toBe(6);
    expect(first.createsRemainder).toBe(true);

    const fix = planReceiveCorrection({
      ordered: 10,
      previousReceived: 6,
      received: 10,
      hasRemainderOrder: true,
    });
    stock = nextWarehouseQty(stock, fix.stockDelta);

    expect(stock).toBe(10);
    expect(fix.remainderAction).toBe("delete");
    expect(fix.fullyArrived).toBe(true);
  });

  it("הוזמנו 10, סומן «הגיע הכול» בטעות, ואז תוקן ל-4 — המלאי מסתכם ב-4 עם יתרה 6", () => {
    let stock = 0;

    const first = planOrderReceive({ ordered: 10, received: 10 });
    stock = nextWarehouseQty(stock, first.stockDelta);
    expect(stock).toBe(10);
    expect(first.createsRemainder).toBe(false);

    const fix = planReceiveCorrection({
      ordered: 10,
      previousReceived: 10,
      received: 4,
      hasRemainderOrder: false,
    });
    stock = nextWarehouseQty(stock, fix.stockDelta);

    expect(stock).toBe(4);
    expect(fix.remainderAction).toBe("create");
    expect(fix.remainderQty).toBe(6);
  });

  it("הזמנה שהגיעה בשני משלוחים מסתכמת בדיוק בכמות שהוזמנה", () => {
    let stock = 0;

    const firstDelivery = planOrderReceive({ ordered: 10, received: 6 });
    stock = nextWarehouseQty(stock, firstDelivery.stockDelta);

    // היתרה שנפתחה (4) מתקבלת במלואה
    const secondDelivery = planOrderReceive({ ordered: firstDelivery.remainderQty, received: 4 });
    stock = nextWarehouseQty(stock, secondDelivery.stockDelta);

    expect(stock).toBe(10);
    expect(secondDelivery.fullyArrived).toBe(true);
    expect(secondDelivery.createsRemainder).toBe(false);
  });

  it("שרשרת תיקונים חוזרת לא מנפחת את המלאי", () => {
    let stock = 0;
    let received = 0;

    const first = planOrderReceive({ ordered: 20, received: 5 });
    stock = nextWarehouseQty(stock, first.stockDelta);
    received = 5;

    for (const next of [12, 8, 20, 3, 20]) {
      const fix = planReceiveCorrection({
        ordered: 20,
        previousReceived: received,
        received: next,
        hasRemainderOrder: received < 20,
      });
      stock = nextWarehouseQty(stock, fix.stockDelta);
      received = next;
    }

    expect(stock).toBe(20); // המלאי תמיד שווה לכמות האחרונה שדווחה
  });
});
