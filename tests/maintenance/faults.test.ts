/**
 * ממשק איש האחזקה — זרימת התקלות והתג האדום.
 *
 * זו התקשורת היחידה שלו עם העסק: תקלה נפתחת ע״י אחמ״ש, מגיעה אליו כהתראה,
 * הוא מטפל ומעדכן סטטוס. הבדיקות מוודאות שהתג נדלק רק על תקלות חדשות
 * שממתינות לטיפול, ונכבה אחרי שנכנס למסך — לכל משתמש ולכל עסק בנפרד.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FAULTS_SEEN_EVENT,
  countNewFaults,
  getFaultsSeenAt,
  markFaultsSeen,
} from "@/lib/faultNotifications";
import { installFakeBrowser, type FakeBrowserEnv } from "../helpers/browserEnv";
import { BUSINESS_ID, OTHER_BUSINESS_ID, USER, makeFault } from "../helpers/factories";
import type { FaultStatus } from "@/types/database";

let env: FakeBrowserEnv;

beforeEach(() => {
  env = installFakeBrowser();
});

afterEach(() => {
  env.restore();
});

const SEEN_AT = "2026-07-08T12:00:00.000Z";

describe("ספירת תקלות חדשות", () => {
  it("לפני שנכנס למסך פעם ראשונה אין ספירה (לא מציפים אותו בהיסטוריה)", () => {
    const faults = [makeFault({ created_at: "2026-07-08T13:00:00.000Z" })];
    expect(countNewFaults(faults, null)).toBe(0);
  });

  it("סופר רק תקלות שנפתחו אחרי הכניסה האחרונה", () => {
    const faults = [
      makeFault({ created_at: "2026-07-08T11:00:00.000Z" }),
      makeFault({ created_at: "2026-07-08T13:00:00.000Z" }),
      makeFault({ created_at: "2026-07-08T14:00:00.000Z" }),
    ];
    expect(countNewFaults(faults, SEEN_AT)).toBe(2);
  });

  it("תקלה שנפתחה בדיוק ברגע הצפייה אינה חדשה", () => {
    expect(countNewFaults([makeFault({ created_at: SEEN_AT })], SEEN_AT)).toBe(0);
  });

  it.each<[FaultStatus, number]>([
    ["needs_handling", 1],
    ["in_progress", 0],
    ["handled", 0],
  ])("סטטוס %s נספר %i פעמים", (status, expected) => {
    const faults = [makeFault({ status, created_at: "2026-07-08T13:00:00.000Z" })];
    expect(countNewFaults(faults, SEEN_AT)).toBe(expected);
  });

  it("רשימה ריקה מחזירה אפס", () => {
    expect(countNewFaults([], SEEN_AT)).toBe(0);
  });

  it("הרבה תקלות ישנות לא מנפחות את התג", () => {
    const old = Array.from({ length: 200 }, (_, i) =>
      makeFault({ created_at: `2026-07-0${(i % 7) + 1}T09:00:00.000Z` }),
    );
    expect(countNewFaults(old, SEEN_AT)).toBe(0);
  });
});

describe("שמירת מועד הצפייה האחרון", () => {
  it("לפני צפייה ראשונה אין מועד שמור", () => {
    expect(getFaultsSeenAt(USER.maintenance, BUSINESS_ID)).toBeNull();
  });

  it("סימון «ראיתי» נשמר ונקרא חזרה", () => {
    markFaultsSeen(USER.maintenance, BUSINESS_ID, SEEN_AT);
    expect(getFaultsSeenAt(USER.maintenance, BUSINESS_ID)).toBe(SEEN_AT);
  });

  it("הסימון משדר אירוע כדי לעדכן את התג מיד", () => {
    markFaultsSeen(USER.maintenance, BUSINESS_ID, SEEN_AT);
    expect(env.events).toEqual([
      {
        type: FAULTS_SEEN_EVENT,
        detail: { userId: USER.maintenance, businessId: BUSINESS_ID, at: SEEN_AT },
      },
    ]);
  });

  it("סימון חדש דורס את הקודם", () => {
    markFaultsSeen(USER.maintenance, BUSINESS_ID, SEEN_AT);
    markFaultsSeen(USER.maintenance, BUSINESS_ID, "2026-07-09T08:00:00.000Z");
    expect(getFaultsSeenAt(USER.maintenance, BUSINESS_ID)).toBe("2026-07-09T08:00:00.000Z");
  });

  it("שני אנשי אחזקה שומרים מועדים נפרדים", () => {
    markFaultsSeen(USER.maintenance, BUSINESS_ID, SEEN_AT);
    expect(getFaultsSeenAt(USER.employee, BUSINESS_ID)).toBeNull();
  });

  it("אותו משתמש בשני עסקים — מועדים נפרדים", () => {
    markFaultsSeen(USER.maintenance, BUSINESS_ID, SEEN_AT);
    expect(getFaultsSeenAt(USER.maintenance, OTHER_BUSINESS_ID)).toBeNull();
  });

  it("localStorage חסום — קריאה מחזירה null וכתיבה לא זורקת", () => {
    env.breakStorage(true);
    expect(getFaultsSeenAt(USER.maintenance, BUSINESS_ID)).toBeNull();
    expect(() => markFaultsSeen(USER.maintenance, BUSINESS_ID)).not.toThrow();
  });
});

describe("מסלול מלא של התג", () => {
  it("נכנס למסך → נפתחת תקלה → התג נדלק → נכנס שוב → כבוי", () => {
    markFaultsSeen(USER.maintenance, BUSINESS_ID, "2026-07-08T12:00:00.000Z");

    const faults = [makeFault({ created_at: "2026-07-08T13:00:00.000Z" })];
    expect(countNewFaults(faults, getFaultsSeenAt(USER.maintenance, BUSINESS_ID))).toBe(1);

    markFaultsSeen(USER.maintenance, BUSINESS_ID, "2026-07-08T14:00:00.000Z");
    expect(countNewFaults(faults, getFaultsSeenAt(USER.maintenance, BUSINESS_ID))).toBe(0);
  });

  it("תקלה שטופלה לא מדליקה את התג מחדש", () => {
    markFaultsSeen(USER.maintenance, BUSINESS_ID, "2026-07-08T12:00:00.000Z");
    const handled = [makeFault({ status: "handled", created_at: "2026-07-08T13:00:00.000Z" })];
    expect(countNewFaults(handled, getFaultsSeenAt(USER.maintenance, BUSINESS_ID))).toBe(0);
  });
});
