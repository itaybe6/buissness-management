/**
 * מה שהמנהל עושה → מה שקורה לעובד: הרשאות, מודולים ומסמכים.
 *
 * שינוי תפקיד, כיבוי מודול או העלאת הסכם — כל אחד מהם משנה מיידית מה העובד
 * רואה ומה נדרש ממנו. כאן נבדק שהשינוי באמת מגיע אליו, ושלא נפתחת לו דלת
 * שלא התכוונו אליה.
 */
import { describe, expect, it } from "vitest";
import { getHomePath, visibleNavItems } from "@/lib/constants";
import {
  ALL_FEATURE_KEYS,
  applyFeatureToggle,
  detectPlan,
  enabledKeysOf,
  featureStateForPlan,
} from "@/lib/features";
import { agreementsForEmployee, isSigned, signatureOf } from "@/api/agreements";
import { buildFaultPayRows, sumFaultPayAmount } from "@/lib/faultPayrollRows";
import { USER, makeAgreement, makeFault, makeSignature } from "../helpers/factories";
import type { FeatureKey, UserRole } from "@/types/database";

function keysFor(role: UserRole, state: Record<FeatureKey, boolean>): string[] {
  return visibleNavItems(role, (k) => state[k]).map((i) => i.key);
}

const FULL = featureStateForPlan("full");

describe("המנהל משנה לעובד תפקיד", () => {
  it("עובד → אחראי משמרת: נפתחים לו סידור עבודה, דוח משמרת ומשימות", () => {
    const before = keysFor("employee", FULL);
    const after = keysFor("shift_manager", FULL);

    expect(before).not.toContain("shift-reports");
    expect(after).toEqual(expect.arrayContaining(["shift-reports", "tasks", "faults"]));
  });

  it("עובד → מנהלת משרד: נפתח שכר של כל העסק, נסגר סידור העבודה", () => {
    const after = keysFor("office_manager", FULL);
    expect(after).toContain("payroll");
    expect(after).toContain("users");
    expect(after).not.toContain("shifts");
  });

  it("עובד → איש אחזקה: מאבד הכול חוץ מתקלות ומעקב שכר", () => {
    expect(keysFor("maintenance", FULL)).toEqual(["faults", "my-shifts"]);
  });

  it("שינוי התפקיד משנה גם את מסך הבית שאליו הוא נוחת", () => {
    expect(getHomePath("employee")).toBe("/dashboard");
    expect(getHomePath("maintenance")).toBe("/faults");
    expect(getHomePath("event_manager")).toBe("/events");
  });

  it("אף שינוי תפקיד בתוך העסק לא פותח מסכי פלטפורמה", () => {
    const businessRoles: UserRole[] = [
      "manager",
      "shift_manager",
      "office_manager",
      "employee",
      "maintenance",
      "event_manager",
    ];
    for (const role of businessRoles) {
      const keys = keysFor(role, FULL);
      expect(keys).not.toContain("platform");
      expect(keys).not.toContain("businesses");
      expect(keys).not.toContain("platform-users");
    }
  });

  it("רק מנהל מקבל את הגדרות העסק — שם נמצאים הגיאופנס וחלון האילוצים", () => {
    expect(keysFor("manager", FULL)).toContain("settings");
    for (const role of ["shift_manager", "office_manager", "employee", "maintenance"] as const) {
      expect(keysFor(role, FULL)).not.toContain("settings");
    }
  });
});

describe("כיבוי מודול מוריד מסך גם לעובד וגם למנהל", () => {
  it("כיבוי «סידור עבודה» — העובד מאבד את מסך המשמרות", () => {
    const state = applyFeatureToggle(FULL, "shifts", false).state;
    expect(keysFor("employee", state)).not.toContain("shifts");
    expect(keysFor("manager", state)).not.toContain("shifts");
  });

  it("כיבוי «שעון נוכחות» מפיל גם את מודול השכר — והעובד מאבד את שניהם", () => {
    const result = applyFeatureToggle(FULL, "attendance", false);
    expect(result.turnedOff).toContain("payroll");
    expect(keysFor("manager", result.state)).not.toContain("attendance");
    expect(keysFor("office_manager", result.state)).not.toContain("payroll");
  });

  it("«מעקב שכר» האישי של העובד נשאר גם כשהכול כבוי", () => {
    const off = Object.fromEntries(ALL_FEATURE_KEYS.map((k) => [k, false])) as Record<FeatureKey, boolean>;
    expect(keysFor("employee", off)).toContain("my-shifts");
  });

  it("כיבוי «סחורות» מוריד לעובד את ספירת המלאי ולמנהלת את הספקים", () => {
    const state = applyFeatureToggle(FULL, "inventory", false).state;
    expect(keysFor("employee", state)).not.toContain("inventory");
    expect(keysFor("office_manager", state)).not.toContain("suppliers");
  });

  it("כיבוי «הסכמים» מוריד לעובד את מסך המסמכים", () => {
    const state = applyFeatureToggle(FULL, "agreements", false).state;
    expect(keysFor("employee", state)).not.toContain("agreements");
  });

  it("הדלקה חוזרת מחזירה בדיוק את מה שנלקח", () => {
    const off = applyFeatureToggle(FULL, "shifts", false).state;
    const back = applyFeatureToggle(off, "shifts", true).state;
    expect(keysFor("employee", back)).toEqual(keysFor("employee", FULL));
  });
});

describe("שינוי תוכנית המנוי משנה את חוויית העובד", () => {
  it("תוכנית «בסיס» — לעובד יש נוכחות, משמרות ומשימות בלבד", () => {
    const starter = featureStateForPlan("starter");
    expect(enabledKeysOf(starter)).toEqual(["attendance", "shifts", "tasks"]);
    expect(keysFor("employee", starter)).toEqual(["dashboard", "shifts", "my-shifts"]);
  });

  it("שדרוג ל«צמיחה» מוסיף לעובד מסמכים וסחורות", () => {
    const growth = featureStateForPlan("growth");
    const keys = keysFor("employee", growth);
    expect(keys).toContain("agreements");
    expect(keys).toContain("inventory");
  });

  it("«מלא» מוסיף גם אירועים", () => {
    expect(keysFor("employee", FULL)).toContain("events");
  });

  it("שדרוג לעולם לא מוריד מסך שהיה קודם", () => {
    const starter = new Set(keysFor("employee", featureStateForPlan("starter")));
    const growth = new Set(keysFor("employee", featureStateForPlan("growth")));
    const full = new Set(keysFor("employee", FULL));
    for (const k of starter) expect(growth.has(k)).toBe(true);
    for (const k of growth) expect(full.has(k)).toBe(true);
  });

  it("כיבוי ידני של מודול בודד הופך את התוכנית ל«מותאם אישית»", () => {
    const state = applyFeatureToggle(featureStateForPlan("growth"), "inventory", false).state;
    expect(detectPlan(state)).toBe("custom");
  });
});

describe("המנהל מעלה הסכם — העובד צריך לחתום", () => {
  const workAgreement = makeAgreement({ id: "agr-work", type: "work", title: "הסכם עבודה" });
  const form101 = makeAgreement({ id: "agr-101", type: "form_101", title: "טופס 101" });

  it("הסכם כללי חדש מופיע לכל העובדים", () => {
    const list = agreementsForEmployee([workAgreement, form101], USER.employee).map((a) => a.id);
    expect(list).toEqual(["agr-work", "agr-101"]);
  });

  it("הסכם אישי מגיע רק לעובד שעבורו הופק", () => {
    const personal = makeAgreement({ id: "agr-personal", employee_id: USER.employee2 });
    expect(agreementsForEmployee([personal], USER.employee).map((a) => a.id)).toEqual([]);
    expect(agreementsForEmployee([personal], USER.employee2).map((a) => a.id)).toEqual(["agr-personal"]);
  });

  it("לפני חתימה — לא חתום; אחרי — חתום", () => {
    expect(isSigned([], "agr-work", USER.employee)).toBe(false);
    const signatures = [makeSignature({ agreement_id: "agr-work", employee_id: USER.employee, agreed: true })];
    expect(isSigned(signatures, "agr-work", USER.employee)).toBe(true);
    expect(signatureOf(signatures, "agr-work", USER.employee)?.signed_at).toBeTruthy();
  });

  it("חתימה של עובד אחד לא פוטרת את השני", () => {
    const signatures = [makeSignature({ agreement_id: "agr-work", employee_id: USER.employee, agreed: true })];
    expect(isSigned(signatures, "agr-work", USER.employee2)).toBe(false);
  });

  it("הסכם נוסף שהמנהל מעלה מוסיף דרישת חתימה חדשה", () => {
    const signatures = [makeSignature({ agreement_id: "agr-work", employee_id: USER.employee, agreed: true })];
    const harassment = makeAgreement({ id: "agr-harassment", type: "sexual_harassment" });
    const all = [workAgreement, harassment];
    const unsigned = agreementsForEmployee(all, USER.employee).filter(
      (a) => !isSigned(signatures, a.id, USER.employee),
    );
    expect(unsigned.map((a) => a.id)).toEqual(["agr-harassment"]);
  });
});

describe("המנהל מאשר תשלום על תקלה — והכסף מגיע לאיש האחזקה", () => {
  const submitted = makeFault({
    id: "fault-1",
    description: "החלפת משאבה",
    pay_employee_id: USER.maintenance,
    work_price: 850,
    pay_approval_status: "pending",
    pay_submitted_at: "2026-07-08T14:00:00.000Z",
  });

  it("לפני אישור — לא מופיע בשכר", () => {
    expect(sumFaultPayAmount([submitted], USER.maintenance)).toBe(0);
    expect(buildFaultPayRows([submitted])).toEqual([]);
  });

  it("אחרי אישור — מופיע כשורה עם הסכום", () => {
    const approved = {
      ...submitted,
      pay_approval_status: "approved" as const,
      pay_approved_by: USER.manager,
      pay_approved_at: "2026-07-08T15:00:00.000Z",
    };
    expect(sumFaultPayAmount([approved], USER.maintenance)).toBe(850);
    const rows = buildFaultPayRows([approved]);
    expect(rows).toHaveLength(1);
    expect(rows[0].earned).toBe(850);
    expect(rows[0].title).toContain("החלפת משאבה");
  });

  it("המנהל משנה את הסכום לפני האישור — משולם הסכום המעודכן", () => {
    const approvedLower = {
      ...submitted,
      work_price: 600,
      pay_approval_status: "approved" as const,
      pay_approved_at: "2026-07-08T15:00:00.000Z",
    };
    expect(sumFaultPayAmount([approvedLower], USER.maintenance)).toBe(600);
  });

  it("תשלום ששויך לעובד אחר לא מגיע לאיש האחזקה", () => {
    const other = {
      ...submitted,
      pay_employee_id: USER.employee,
      pay_approval_status: "approved" as const,
      pay_approved_at: "2026-07-08T15:00:00.000Z",
    };
    expect(sumFaultPayAmount([other], USER.maintenance)).toBe(0);
  });
});
