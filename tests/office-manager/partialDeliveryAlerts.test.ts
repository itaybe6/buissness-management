/**
 * ממשק מנהלת המשרד — התג האדום על «סחורות» כשמשלוח הגיע חלקית.
 *
 * הסימון «ראיתי» נשמר מקומית בדפדפן לכל משתמש ולכל עסק בנפרד. הבדיקות
 * מוודאות שהתג לא נדלק סתם, שהוא חוזר כשמגיעה אספקה חלקית חדשה, ושדפדפן
 * במצב פרטי (localStorage חסום) לא מפיל את המסך.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { batchHasActivePartialDelivery } from "@/api/inventory";
import {
  PARTIAL_ORDER_ACK_EVENT,
  acknowledgePartialOrderBatch,
  countUnacknowledgedPartialDeliveryBatches,
  getPartialOrderAcks,
  isPartialDeliveryBatchUnacknowledged,
} from "@/lib/partialOrderNotifications";
import { installFakeBrowser, type FakeBrowserEnv } from "../helpers/browserEnv";
import { BUSINESS_ID, OTHER_BUSINESS_ID, USER, makeOrder } from "../helpers/factories";

let env: FakeBrowserEnv;

beforeEach(() => {
  env = installFakeBrowser();
});

afterEach(() => {
  env.restore();
});

/** אצווה עם משלוח חלקי ויתרה פתוחה. */
function partialBatch(createdAt = "2026-07-08T15:00:00Z") {
  return [
    makeOrder({ batch_id: "batch-a", quantity: 10, received_quantity: 6, status: "received", created_at: createdAt }),
    makeOrder({ batch_id: "batch-a", quantity: 4, status: "requested", created_at: createdAt }),
  ];
}

describe("שמירת «ראיתי» מקומית", () => {
  it("בלי סימונים קודמים מוחזרת מפה ריקה", () => {
    expect(getPartialOrderAcks(USER.officeManager, BUSINESS_ID)).toEqual({});
  });

  it("סימון נשמר ונקרא חזרה", () => {
    acknowledgePartialOrderBatch(USER.officeManager, BUSINESS_ID, "batch-a", "2026-07-08T16:00:00Z");
    expect(getPartialOrderAcks(USER.officeManager, BUSINESS_ID)).toEqual({ "batch-a": "2026-07-08T16:00:00Z" });
  });

  it("סימון משדר אירוע כדי שהתג יתעדכן מיד", () => {
    acknowledgePartialOrderBatch(USER.officeManager, BUSINESS_ID, "batch-a", "2026-07-08T16:00:00Z");
    expect(env.events).toEqual([
      {
        type: PARTIAL_ORDER_ACK_EVENT,
        detail: { userId: USER.officeManager, businessId: BUSINESS_ID, batchKey: "batch-a", at: "2026-07-08T16:00:00Z" },
      },
    ]);
  });

  it("סימונים של משתמשים שונים לא מתערבבים", () => {
    acknowledgePartialOrderBatch(USER.officeManager, BUSINESS_ID, "batch-a");
    expect(getPartialOrderAcks(USER.manager, BUSINESS_ID)).toEqual({});
  });

  it("סימונים של עסקים שונים לא מתערבבים", () => {
    acknowledgePartialOrderBatch(USER.officeManager, BUSINESS_ID, "batch-a");
    expect(getPartialOrderAcks(USER.officeManager, OTHER_BUSINESS_ID)).toEqual({});
  });

  it("סימון נוסף לא מוחק סימונים קודמים", () => {
    acknowledgePartialOrderBatch(USER.officeManager, BUSINESS_ID, "batch-a", "2026-07-08T16:00:00Z");
    acknowledgePartialOrderBatch(USER.officeManager, BUSINESS_ID, "batch-b", "2026-07-09T16:00:00Z");
    expect(Object.keys(getPartialOrderAcks(USER.officeManager, BUSINESS_ID))).toEqual(["batch-a", "batch-b"]);
  });

  it("תוכן פגום ב-localStorage לא מפיל את המסך", () => {
    env.storage.set(`office_partial_order_ack:${USER.officeManager}:${BUSINESS_ID}`, "{not json");
    expect(getPartialOrderAcks(USER.officeManager, BUSINESS_ID)).toEqual({});
  });

  it("ערך שאינו אובייקט (מערך / מחרוזת / null) מוחזר כמפה ריקה", () => {
    const key = `office_partial_order_ack:${USER.officeManager}:${BUSINESS_ID}`;
    env.storage.set(key, "null");
    expect(getPartialOrderAcks(USER.officeManager, BUSINESS_ID)).toEqual({});
    env.storage.set(key, '"text"');
    expect(getPartialOrderAcks(USER.officeManager, BUSINESS_ID)).toEqual({});
  });

  it("דפדפן במצב פרטי — קריאה מחזירה ריק וכתיבה לא זורקת", () => {
    env.breakStorage(true);
    expect(getPartialOrderAcks(USER.officeManager, BUSINESS_ID)).toEqual({});
    expect(() => acknowledgePartialOrderBatch(USER.officeManager, BUSINESS_ID, "batch-a")).not.toThrow();
  });
});

describe("מתי התג נדלק", () => {
  it("אצווה חלקית שלא סומנה — התג נדלק", () => {
    expect(isPartialDeliveryBatchUnacknowledged("batch-a", partialBatch(), {})).toBe(true);
  });

  it("אחרי סימון — התג כבוי", () => {
    const acks = { "batch-a": "2026-07-08T16:00:00Z" };
    expect(isPartialDeliveryBatchUnacknowledged("batch-a", partialBatch("2026-07-08T15:00:00Z"), acks)).toBe(false);
  });

  it("אספקה חלקית חדשה אחרי הסימון מדליקה שוב", () => {
    const acks = { "batch-a": "2026-07-08T16:00:00Z" };
    expect(isPartialDeliveryBatchUnacknowledged("batch-a", partialBatch("2026-07-08T17:00:00Z"), acks)).toBe(true);
  });

  it("סימון בדיוק באותו רגע נחשב מסומן", () => {
    const acks = { "batch-a": "2026-07-08T15:00:00Z" };
    expect(isPartialDeliveryBatchUnacknowledged("batch-a", partialBatch("2026-07-08T15:00:00Z"), acks)).toBe(false);
  });

  it("אצווה שהגיעה במלואה לא מדליקה תג גם בלי סימון", () => {
    const full = [makeOrder({ batch_id: "batch-a", quantity: 10, received_quantity: 10, status: "received" })];
    expect(isPartialDeliveryBatchUnacknowledged("batch-a", full, {})).toBe(false);
  });

  it("אצווה שכולה עדיין בהזמנה לא מדליקה תג", () => {
    const pending = [makeOrder({ batch_id: "batch-a", quantity: 10, status: "ordered" })];
    expect(isPartialDeliveryBatchUnacknowledged("batch-a", pending, {})).toBe(false);
  });
});

describe("ספירת האצוות שדורשות טיפול", () => {
  it("סופר רק אצוות חלקיות שלא סומנו", () => {
    const orders = [
      ...partialBatch("2026-07-08T15:00:00Z"),
      makeOrder({ batch_id: "batch-b", quantity: 5, received_quantity: 2, status: "received", created_at: "2026-07-09T10:00:00Z" }),
      makeOrder({ batch_id: "batch-b", quantity: 3, status: "requested", created_at: "2026-07-09T10:00:00Z" }),
      makeOrder({ batch_id: "batch-c", quantity: 5, received_quantity: 5, status: "received" }),
    ];
    expect(countUnacknowledgedPartialDeliveryBatches(orders, {})).toBe(2);
    expect(countUnacknowledgedPartialDeliveryBatches(orders, { "batch-a": "2026-07-08T16:00:00Z" })).toBe(1);
    expect(
      countUnacknowledgedPartialDeliveryBatches(orders, {
        "batch-a": "2026-07-08T16:00:00Z",
        "batch-b": "2026-07-09T11:00:00Z",
      }),
    ).toBe(0);
  });

  it("בלי הזמנות בכלל — אפס", () => {
    expect(countUnacknowledgedPartialDeliveryBatches([], {})).toBe(0);
  });

  it("סימון של אצווה אחת לא מכבה אצווה אחרת", () => {
    const orders = [
      ...partialBatch("2026-07-08T15:00:00Z"),
      makeOrder({ batch_id: "batch-b", quantity: 5, received_quantity: 2, status: "received", created_at: "2026-07-09T10:00:00Z" }),
      makeOrder({ batch_id: "batch-b", quantity: 3, status: "requested", created_at: "2026-07-09T10:00:00Z" }),
    ];
    expect(countUnacknowledgedPartialDeliveryBatches(orders, { "batch-a": "2026-07-20T00:00:00Z" })).toBe(1);
  });

  it("מסלול מלא: התג נדלק, המנהלת מסמנת, התג נכבה", () => {
    const orders = partialBatch("2026-07-08T15:00:00Z");
    expect(countUnacknowledgedPartialDeliveryBatches(orders, getPartialOrderAcks(USER.officeManager, BUSINESS_ID))).toBe(1);

    acknowledgePartialOrderBatch(USER.officeManager, BUSINESS_ID, "batch-a", "2026-07-08T16:00:00Z");

    expect(countUnacknowledgedPartialDeliveryBatches(orders, getPartialOrderAcks(USER.officeManager, BUSINESS_ID))).toBe(0);
  });
});

/**
 * מסלול עסקי מלא: מנהל משמרת מסמן «הגיע חלקית» → useReceiveOrder יוצר יתרה → מנהלת המשרד רואה תג.
 * (הקבלה עצמה נבדקת ב-inventoryOrders.test.ts; כאן מדמים את מצב ה-DB אחרי הקבלה.)
 */
describe("מסלול: קבלה חלקית מהספק → התראה למנהלת משרד", () => {
  it("אחרי קבלת 6 מתוך 10 — נוצרת יתרה פתוחה והתג נדלק", () => {
    const afterPartialReceive = [
      makeOrder({
        id: "closed-line",
        batch_id: "batch-supplier-1",
        quantity: 10,
        received_quantity: 6,
        status: "received",
        created_at: "2026-07-08T10:00:00Z",
      }),
      makeOrder({
        id: "remainder-line",
        batch_id: "batch-supplier-1",
        quantity: 4,
        status: "requested",
        created_at: "2026-07-08T15:00:00Z",
      }),
    ];

    expect(batchHasActivePartialDelivery(afterPartialReceive)).toBe(true);
    expect(countUnacknowledgedPartialDeliveryBatches(afterPartialReceive, {})).toBe(1);
    expect(isPartialDeliveryBatchUnacknowledged("batch-supplier-1", afterPartialReceive, {})).toBe(true);
  });

  it("קבלה מלאה של היתרה — התג כבה (אין עוד אספקה חלקית פעילה)", () => {
    const afterFullReceive = [
      makeOrder({
        batch_id: "batch-supplier-1",
        quantity: 10,
        received_quantity: 6,
        status: "received",
        created_at: "2026-07-08T10:00:00Z",
      }),
      makeOrder({
        batch_id: "batch-supplier-1",
        quantity: 4,
        received_quantity: 4,
        status: "received",
        created_at: "2026-07-08T15:00:00Z",
      }),
    ];

    expect(batchHasActivePartialDelivery(afterFullReceive)).toBe(false);
    expect(countUnacknowledgedPartialDeliveryBatches(afterFullReceive, {})).toBe(0);
  });

  it("יתרה שסומנה «לא הגיע» — התג כבה גם אם השורה הראשונה חלקית", () => {
    const remainderClosed = [
      makeOrder({
        batch_id: "batch-supplier-1",
        quantity: 10,
        received_quantity: 6,
        status: "received",
        created_at: "2026-07-08T10:00:00Z",
      }),
    ];

    expect(batchHasActivePartialDelivery(remainderClosed)).toBe(false);
    expect(countUnacknowledgedPartialDeliveryBatches(remainderClosed, {})).toBe(0);
  });
});
