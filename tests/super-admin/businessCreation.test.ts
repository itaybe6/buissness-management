/**
 * פתיחת עסק חדש — האשף של הסופר אדמין.
 *
 * שלושה שלבים: פרטי העסק, המודולים שנקנו, ומנהל המערכת הראשון. עסק שנוצר
 * בלי מנהל אי אפשר להתחבר אליו, ועסק עם מודול ששבור בגלל תלות חסרה מציג
 * מסכים ריקים — ולכן שני התנאים נאכפים כאן לפני שנוגעים במסד.
 */
import { describe, expect, it } from "vitest";
import {
  MIN_MANAGER_PASSWORD,
  businessInsertRow,
  featureRowsFor,
  managerFailureMessage,
  managerPayload,
  parseSeatCap,
  validateDetailsStep,
  validateManagerStep,
  validateModuleStep,
} from "@/lib/businessSetup";
import {
  ALL_FEATURE_KEYS,
  emptyFeatureState,
  featureStateForPlan,
  featureStateFromKeys,
} from "@/lib/features";

const GROWTH = featureStateForPlan("growth");

describe("שלב 1 — פרטי העסק", () => {
  it("שם תקין עובר", () => {
    expect(validateDetailsStep({ name: "מסעדת אביחי" })).toBeNull();
  });

  it("שם ריק נחסם", () => {
    expect(validateDetailsStep({ name: "" })).toBe("נא להזין שם עסק");
    expect(validateDetailsStep({ name: "   " })).toBe("נא להזין שם עסק");
  });

  it("שם של תו אחד קצר מדי", () => {
    expect(validateDetailsStep({ name: "א" })).toBe("שם העסק קצר מדי");
  });

  it("שני תווים מספיקים", () => {
    expect(validateDetailsStep({ name: "בר" })).toBeNull();
  });

  it("רווחים מסביב לא נספרים לאורך", () => {
    expect(validateDetailsStep({ name: "  א  " })).toBe("שם העסק קצר מדי");
  });
});

describe("מגבלת משתמשים (מושבים)", () => {
  it("שדה ריק = ללא הגבלה", () => {
    expect(parseSeatCap("")).toEqual({ cap: null, error: null });
    expect(parseSeatCap("   ")).toEqual({ cap: null, error: null });
  });

  it("מספר שלם חיובי מתקבל", () => {
    expect(parseSeatCap("15")).toEqual({ cap: 15, error: null });
    expect(parseSeatCap("1")).toEqual({ cap: 1, error: null });
  });

  it("אפס ומספר שלילי נדחים", () => {
    expect(parseSeatCap("0").error).toBeTruthy();
    expect(parseSeatCap("-5").error).toBeTruthy();
  });

  it("שבר נדחה — אי אפשר חצי עובד", () => {
    expect(parseSeatCap("7.5").error).toBe("מגבלת המשתמשים חייבת להיות מספר שלם חיובי");
  });

  it("טקסט נדחה", () => {
    expect(parseSeatCap("הרבה").error).toBeTruthy();
    expect(parseSeatCap("15 עובדים").error).toBeTruthy();
  });

  it("רווחים סביב מספר תקין לא מפריעים", () => {
    expect(parseSeatCap("  20  ")).toEqual({ cap: 20, error: null });
  });

  it("שגיאה תמיד מחזירה cap null", () => {
    expect(parseSeatCap("abc").cap).toBeNull();
  });
});

describe("שלב 2 — המודולים שנקנו", () => {
  it("חבילה תקינה עוברת", () => {
    expect(validateModuleStep({ state: GROWTH, seats: "50" })).toBeNull();
  });

  it("בלי אף מודול — נחסם", () => {
    expect(validateModuleStep({ state: emptyFeatureState(), seats: "" })).toBe("יש להפעיל לפחות מודול אחד");
  });

  it("שכר בלי שעון נוכחות — נחסם עם הסבר בעברית", () => {
    const broken = featureStateFromKeys(["payroll"]);
    expect(validateModuleStep({ state: broken, seats: "" })).toContain("שעון נוכחות");
  });

  it("בלאי בלי סחורות — נחסם", () => {
    const broken = featureStateFromKeys(["waste"]);
    const error = validateModuleStep({ state: broken, seats: "" });
    expect(error).toContain("בלאי");
    expect(error).toContain("סחורות");
  });

  it("אחרי הוספת התלות — עובר", () => {
    expect(validateModuleStep({ state: featureStateFromKeys(["attendance", "payroll"]), seats: "" })).toBeNull();
    expect(validateModuleStep({ state: featureStateFromKeys(["inventory", "waste"]), seats: "" })).toBeNull();
  });

  it("כל תוכנית מוכנה מראש עוברת את הבדיקה", () => {
    for (const plan of ["starter", "growth", "full"] as const) {
      expect(validateModuleStep({ state: featureStateForPlan(plan), seats: "" }), plan).toBeNull();
    }
  });

  it("מגבלת מושבים לא תקינה נתפסת גם בשלב הזה", () => {
    expect(validateModuleStep({ state: GROWTH, seats: "-3" })).toBeTruthy();
  });

  it("מודול בודד בלי תלויות תקין לבדו", () => {
    expect(validateModuleStep({ state: featureStateFromKeys(["events"]), seats: "" })).toBeNull();
  });
});

describe("שלב 3 — מנהל המערכת הראשון", () => {
  const valid = { full_name: "אביחי כהן", email: "avichai@test.local", password: "secret123" };

  it("פרטים מלאים עוברים", () => {
    expect(validateManagerStep(valid)).toBeNull();
  });

  it("שם חסר נחסם", () => {
    expect(validateManagerStep({ ...valid, full_name: "  " })).toBe("נא להזין שם מלא למנהל המערכת");
  });

  it("אימייל חסר נחסם", () => {
    expect(validateManagerStep({ ...valid, email: "" })).toBe("נא להזין אימייל למנהל המערכת");
  });

  it("אימייל לא תקין נחסם", () => {
    for (const email of ["notanemail", "a@b", "a@b.c", "@test.local", "a b@test.local"]) {
      expect(validateManagerStep({ ...valid, email }), email).toBe("כתובת האימייל אינה תקינה");
    }
  });

  it("אימייל תקין עם רווחים מסביב מתקבל", () => {
    expect(validateManagerStep({ ...valid, email: "  a@test.local  " })).toBeNull();
  });

  it("סיסמה חסרה או קצרה נחסמת", () => {
    expect(validateManagerStep({ ...valid, password: "" })).toBe("נא להזין סיסמה ראשונית");
    expect(validateManagerStep({ ...valid, password: "12345" })).toContain(String(MIN_MANAGER_PASSWORD));
  });

  it("סיסמה באורך המינימלי בדיוק מתקבלת", () => {
    expect(MIN_MANAGER_PASSWORD).toBe(6);
    expect(validateManagerStep({ ...valid, password: "123456" })).toBeNull();
  });
});

describe("השורה שנכתבת לטבלת העסקים", () => {
  it("שם ופתקים נחתכים, ופתק ריק נשמר כ-null", () => {
    const row = businessInsertRow({ name: "  מסעדה  ", state: GROWTH, seats: "50", notes: "   " });
    expect(row.name).toBe("מסעדה");
    expect(row.admin_notes).toBeNull();
  });

  it("פתק אמיתי נשמר חתוך", () => {
    const row = businessInsertRow({ name: "מסעדה", state: GROWTH, seats: "", notes: "  לקוח VIP  " });
    expect(row.admin_notes).toBe("לקוח VIP");
  });

  it("התוכנית מזוהה אוטומטית מסט המודולים", () => {
    expect(businessInsertRow({ name: "א", state: featureStateForPlan("starter"), seats: "" }).plan).toBe("starter");
    expect(businessInsertRow({ name: "א", state: featureStateForPlan("full"), seats: "" }).plan).toBe("full");
  });

  it("סט מודולים מותאם אישית מסומן custom", () => {
    const custom = featureStateFromKeys(["attendance", "events"]);
    expect(businessInsertRow({ name: "א", state: custom, seats: "" }).plan).toBe("custom");
  });

  it("אפשר לכפות תוכנית ידנית", () => {
    const row = businessInsertRow({ name: "א", state: featureStateForPlan("starter"), seats: "", plan: "custom" });
    expect(row.plan).toBe("custom");
  });

  it("מגבלת מושבים ריקה נשמרת כ-null (ללא הגבלה)", () => {
    expect(businessInsertRow({ name: "א", state: GROWTH, seats: "" }).max_users).toBeNull();
    expect(businessInsertRow({ name: "א", state: GROWTH, seats: "25" }).max_users).toBe(25);
  });

  it("יוצר לא ידוע נשמר כ-null ולא כ-undefined", () => {
    expect(businessInsertRow({ name: "א", state: GROWTH, seats: "" }).created_by).toBeNull();
    expect(businessInsertRow({ name: "א", state: GROWTH, seats: "", createdBy: "usr-1" }).created_by).toBe("usr-1");
  });
});

describe("שורות המודולים שנכתבות לעסק", () => {
  it("נכתבת שורה לכל מודול בקטלוג — גם לכבויים", () => {
    const rows = featureRowsFor("biz-9", featureStateForPlan("starter"));
    expect(rows).toHaveLength(ALL_FEATURE_KEYS.length);
    expect(rows.every((r) => r.business_id === "biz-9")).toBe(true);
  });

  it("הדלוקים והכבויים מסומנים נכון", () => {
    const rows = featureRowsFor("biz-9", featureStateForPlan("starter"));
    const on = rows.filter((r) => r.enabled).map((r) => r.feature_key);
    expect(on.sort()).toEqual(["attendance", "shifts", "tasks"].sort());
    expect(rows.filter((r) => !r.enabled).length).toBe(ALL_FEATURE_KEYS.length - 3);
  });

  it("עסק בלי מודולים מקבל שורות כבויות ולא רשימה ריקה", () => {
    const rows = featureRowsFor("biz-9", emptyFeatureState());
    expect(rows).toHaveLength(ALL_FEATURE_KEYS.length);
    expect(rows.every((r) => r.enabled === false)).toBe(true);
  });

  it("אין מודול כפול", () => {
    const keys = featureRowsFor("biz-9", GROWTH).map((r) => r.feature_key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("יצירת מנהל המערכת", () => {
  it("המטען כולל תפקיד מנהל ושיוך לעסק", () => {
    const payload = managerPayload("biz-9", {
      full_name: "  אביחי  ",
      email: "  a@test.local ",
      password: "secret123",
      phone: " 050-1234567 ",
    });
    expect(payload).toEqual({
      email: "a@test.local",
      password: "secret123",
      full_name: "אביחי",
      phone: "050-1234567",
      role: "manager",
      business_id: "biz-9",
    });
  });

  it("טלפון ריק נשלח כ-undefined ולא כמחרוזת ריקה", () => {
    const payload = managerPayload("biz-9", {
      full_name: "אביחי",
      email: "a@test.local",
      password: "secret123",
      phone: "   ",
    });
    expect(payload.phone).toBeUndefined();
  });

  it("הסיסמה נשלחת כפי שהוזנה — בלי trim שישבור אותה", () => {
    expect(managerPayload("b", { full_name: "א", email: "a@b.co", password: " pass 123 " }).password).toBe(
      " pass 123 ",
    );
  });

  it("כישלון ביצירת המנהל מוסבר עם דרך התאוששות", () => {
    const msg = managerFailureMessage("מסעדת אביחי", "כתובת המייל כבר רשומה במערכת");
    expect(msg).toContain("מסעדת אביחי");
    expect(msg).toContain("כתובת המייל כבר רשומה במערכת");
    expect(msg).toContain("מעמוד העסק");
  });
});

describe("אשף שלם מקצה לקצה", () => {
  it("כל השלבים תקינים → נבנות השורות הנכונות", () => {
    const details = { name: "מסעדת אביחי", notes: "פתיחה ביולי" };
    const modules = { state: featureStateForPlan("growth"), seats: "50" };
    const manager = { full_name: "אביחי כהן", email: "avichai@test.local", password: "secret123" };

    expect(validateDetailsStep(details)).toBeNull();
    expect(validateModuleStep(modules)).toBeNull();
    expect(validateManagerStep(manager)).toBeNull();

    const row = businessInsertRow({ name: details.name, notes: details.notes, ...modules });
    expect(row).toEqual({
      name: "מסעדת אביחי",
      plan: "growth",
      max_users: 50,
      admin_notes: "פתיחה ביולי",
      created_by: null,
    });

    const featureRows = featureRowsFor("biz-new", modules.state);
    expect(featureRows.filter((r) => r.enabled)).toHaveLength(8);

    expect(managerPayload("biz-new", manager).role).toBe("manager");
  });
});
