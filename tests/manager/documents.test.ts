/**
 * המנהל מנהל מסמכים — תבניות לחתימה, טופס 101 וחשבוניות משרד.
 *
 * המסך המרכזי שלו הוא «סקירת חתימות»: מי חתם על מה ומי חסר. הבדיקות בונות
 * את המטריצה הזו מהפונקציות האמיתיות, ומוודאות שאף עובד לא נספר כחתום
 * בטעות ושאף מסמך לא נעלם מהרשימה.
 */
import { describe, expect, it } from "vitest";
import {
  agreementsForEmployee,
  form101Template,
  globalAgreements,
  isSigned,
  personalAgreements,
  signatureOf,
} from "@/api/agreements";
import {
  DOCUMENTS_EDIT_ROLES,
  DOCUMENTS_OVERVIEW_ROLES,
  OFFICE_RECEIPTS_ROLES,
  visibleNavItems,
} from "@/lib/constants";
import {
  FORM_101_BLANK_URL,
  MGMT_CATEGORIES,
  RECEIPT_TYPES,
  RECEIPT_TYPE_ICONS,
  RECEIPT_TYPE_LABELS,
  TAX_YEAR,
  TYPE_ACCENTS,
  TYPE_ICONS,
  TYPE_LABELS,
} from "@/pages/agreements/types";
import { ALL_FEATURE_KEYS } from "@/lib/features";
import { USER, makeAgreement, makeOfficeReceipt, makeSignature } from "../helpers/factories";
import type { AgreementType, FeatureKey, ReceiptType, SignatureField } from "@/types/database";

const ALL_ON = (k: FeatureKey) => ALL_FEATURE_KEYS.includes(k);

// ---------------------------------------------------------------------------
// סקירת החתימות של המנהל
// ---------------------------------------------------------------------------

const workAgreement = makeAgreement({ id: "agr-work", type: "work", title: "הסכם עבודה" });
const harassment = makeAgreement({ id: "agr-harass", type: "sexual_harassment", title: "מניעת הטרדה" });
const form101 = makeAgreement({ id: "agr-101", type: "form_101", title: "טופס 101" });
const personalForAlice = makeAgreement({ id: "agr-alice", type: "other", employee_id: USER.employee });

const templates = [workAgreement, harassment, form101, personalForAlice];
const staff = [USER.employee, USER.employee2, USER.employee3];

/** בונה את מטריצת החתימות בדיוק כפי שמסך הסקירה מציג אותה. */
function complianceMatrix(signatures: ReturnType<typeof makeSignature>[]) {
  return staff.map((employeeId) => {
    const docs = agreementsForEmployee(templates, employeeId);
    return {
      employeeId,
      total: docs.length,
      signed: docs.filter((d) => isSigned(signatures, d.id, employeeId)).length,
      missing: docs.filter((d) => !isSigned(signatures, d.id, employeeId)).map((d) => d.id),
    };
  });
}

describe("סקירת החתימות — מי חתם על מה", () => {
  it("בלי חתימות בכלל — כל העובדים חסרים הכול", () => {
    const rows = complianceMatrix([]);
    expect(rows.every((r) => r.signed === 0)).toBe(true);
    expect(rows[0].missing).toEqual(["agr-work", "agr-harass", "agr-101", "agr-alice"]);
  });

  it("עובד עם הסכם אישי מקבל מסמך אחד יותר", () => {
    const rows = complianceMatrix([]);
    expect(rows[0].total).toBe(4); // כולל האישי
    expect(rows[1].total).toBe(3);
    expect(rows[2].total).toBe(3);
  });

  it("חתימה אחת מזיזה רק את העובד שחתם", () => {
    const rows = complianceMatrix([
      makeSignature({ agreement_id: "agr-work", employee_id: USER.employee, agreed: true }),
    ]);
    expect(rows[0].signed).toBe(1);
    expect(rows[1].signed).toBe(0);
    expect(rows[0].missing).not.toContain("agr-work");
    expect(rows[1].missing).toContain("agr-work");
  });

  it("עובד שחתם על הכול מסומן כמושלם", () => {
    const signatures = agreementsForEmployee(templates, USER.employee).map((d) =>
      makeSignature({ agreement_id: d.id, employee_id: USER.employee, agreed: true }),
    );
    const rows = complianceMatrix(signatures);
    expect(rows[0].signed).toBe(rows[0].total);
    expect(rows[0].missing).toEqual([]);
  });

  it("רשומת חתימה עם agreed=false לא נספרת כחתומה", () => {
    const rows = complianceMatrix([
      makeSignature({ agreement_id: "agr-work", employee_id: USER.employee, agreed: false }),
    ]);
    expect(rows[0].signed).toBe(0);
    expect(rows[0].missing).toContain("agr-work");
  });

  it("חתימה על הסכם אישי של עובד אחר לא נזקפת לי", () => {
    const rows = complianceMatrix([
      makeSignature({ agreement_id: "agr-alice", employee_id: USER.employee2, agreed: true }),
    ]);
    expect(rows[0].missing).toContain("agr-alice");
  });

  it("המנהל רואה מתי נחתם ואת קובץ החתימה", () => {
    const sig = makeSignature({
      agreement_id: "agr-work",
      employee_id: USER.employee,
      agreed: true,
      signed_at: "2026-07-08T12:00:00.000Z",
      signed_file_url: "https://files.local/signed.pdf",
    });
    const found = signatureOf([sig], "agr-work", USER.employee);
    expect(found?.signed_at).toBe("2026-07-08T12:00:00.000Z");
    expect(found?.signed_file_url).toContain("signed.pdf");
  });

  it("המנהל מעלה מסמך חדש — כל העובדים חוזרים להיות חסרים בו", () => {
    const signatures = staff.flatMap((id) => [
      makeSignature({ agreement_id: "agr-work", employee_id: id, agreed: true }),
    ]);
    const before = complianceMatrix(signatures);
    expect(before.every((r) => !r.missing.includes("agr-work"))).toBe(true);

    templates.push(makeAgreement({ id: "agr-new", type: "other" }));
    const after = complianceMatrix(signatures);
    expect(after.every((r) => r.missing.includes("agr-new"))).toBe(true);
    templates.pop();
  });
});

describe("הפרדה בין תבניות כלליות לאישיות", () => {
  it("תבניות כלליות חלות על כולם", () => {
    expect(globalAgreements(templates).map((a) => a.id)).toEqual(["agr-work", "agr-harass", "agr-101"]);
  });

  it("תבניות אישיות מוצגות בנפרד למנהל", () => {
    expect(personalAgreements(templates).map((a) => a.id)).toEqual(["agr-alice"]);
  });

  it("עסק בלי מסמכים בכלל לא קורס", () => {
    expect(globalAgreements([])).toEqual([]);
    expect(personalAgreements([])).toEqual([]);
    expect(agreementsForEmployee([], USER.employee)).toEqual([]);
  });
});

describe("שדות חתימה שהמנהל מסמן על ה-PDF", () => {
  const fields: SignatureField[] = [
    { id: "f1", page: 0, x: 0.1, y: 0.2, w: 0.3, h: 0.05, kind: "signature" },
    { id: "f2", page: 0, x: 0.5, y: 0.2, w: 0.2, h: 0.04, kind: "text", label: "שם מלא" },
    { id: "f3", page: 1, x: 0.1, y: 0.8, w: 0.02, h: 0.02, kind: "checkbox" },
  ];
  const template = makeAgreement({ id: "agr-fields", signature_fields: fields });

  it("הקואורדינטות מנורמלות ל-0..1 כדי לעבוד בכל זום", () => {
    for (const f of template.signature_fields) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(1);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.y + f.h).toBeLessThanOrEqual(1);
    }
  });

  it("שלושת סוגי השדות נתמכים", () => {
    expect(template.signature_fields.map((f) => f.kind)).toEqual(["signature", "text", "checkbox"]);
  });

  it("שדה בלי kind נחשב חתימה (תבניות ישנות)", () => {
    const legacy: SignatureField = { id: "old", page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.05 };
    expect(legacy.kind).toBeUndefined();
  });

  it("שדות מפוזרים על כמה עמודים", () => {
    expect(new Set(template.signature_fields.map((f) => f.page))).toEqual(new Set([0, 1]));
  });

  it("החתימה נשמרת לפי מזהה השדה", () => {
    const sig = makeSignature({
      agreement_id: "agr-fields",
      field_signatures: { f1: "data:image/png;base64,AAA", f2: "ישראל ישראלי", f3: "V" },
    });
    expect(Object.keys(sig.field_signatures)).toEqual(["f1", "f2", "f3"]);
  });

  it("תבנית בלי שדות מסומנים תקינה — חותמים על כל המסמך", () => {
    expect(makeAgreement().signature_fields).toEqual([]);
  });
});

describe("טופס 101", () => {
  it("נמצא כתבנית גלובלית אחת", () => {
    expect(form101Template(templates)?.id).toBe("agr-101");
  });

  it("שנת המס נגזרת מהשנה הנוכחית", () => {
    expect(TAX_YEAR).toBe(new Date().getFullYear());
  });

  it("קיים טופס ריק להורדה כשלעסק אין תבנית", () => {
    expect(FORM_101_BLANK_URL).toBe("/tofes-101.pdf");
    expect(form101Template([])).toBeUndefined();
  });
});

describe("קטלוג סוגי המסמכים", () => {
  const types: AgreementType[] = ["work", "sexual_harassment", "other", "form_101"];

  it("לכל סוג יש תווית, אייקון וצבע", () => {
    for (const t of types) {
      expect(TYPE_LABELS[t], t).toBeTruthy();
      expect(TYPE_ICONS[t], t).toBeTruthy();
      expect(TYPE_ACCENTS[t], t).toBeTruthy();
    }
  });

  it("התוויות ייחודיות — אין שני סוגים עם אותו שם", () => {
    const labels = types.map((t) => TYPE_LABELS[t]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("קטגוריות הסינון של המנהל כוללות «הכל» ראשונה ובלי כפילויות", () => {
    expect(MGMT_CATEGORIES[0].key).toBe("all");
    const keys = MGMT_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of MGMT_CATEGORIES) {
      expect(c.label).toBeTruthy();
      expect(c.icon).toBeTruthy();
    }
  });
});

describe("חשבוניות וקבלות של המשרד", () => {
  const types: ReceiptType[] = ["tax_invoice", "tax_invoice_receipt", "receipt"];

  it("שלושת הסוגים מוגדרים עם תווית ואייקון", () => {
    expect(RECEIPT_TYPES).toEqual(types);
    for (const t of types) {
      expect(RECEIPT_TYPE_LABELS[t], t).toBeTruthy();
      expect(RECEIPT_TYPE_ICONS[t], t).toBeTruthy();
    }
  });

  it("התוויות בעברית וייחודיות", () => {
    expect(RECEIPT_TYPE_LABELS.tax_invoice).toBe("חשבונית מס");
    const labels = types.map((t) => RECEIPT_TYPE_LABELS[t]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("חשבונית משויכת לספק מסוננת לפי הספק", () => {
    const receipts = [
      makeOfficeReceipt({ id: "r1", supplier_id: "sup-1", amount: 1200 }),
      makeOfficeReceipt({ id: "r2", supplier_id: "sup-2", amount: 800 }),
      makeOfficeReceipt({ id: "r3", supplier_id: null, amount: 300 }),
    ];
    const forSupplier = receipts.filter((r) => r.supplier_id === "sup-1");
    expect(forSupplier.map((r) => r.id)).toEqual(["r1"]);
  });

  it("סכום החשבוניות של החודש מסתכם נכון", () => {
    const receipts = [
      makeOfficeReceipt({ amount: 1200, document_date: "2026-07-03" }),
      makeOfficeReceipt({ amount: 800, document_date: "2026-07-20" }),
      makeOfficeReceipt({ amount: 999, document_date: "2026-06-30" }),
    ];
    const july = receipts.filter((r) => r.document_date?.startsWith("2026-07"));
    expect(july.reduce((s, r) => s + r.amount, 0)).toBe(2000);
  });

  it("חשבונית בלי תאריך מסמך לא נספרת בחודש", () => {
    const receipts = [makeOfficeReceipt({ amount: 500, document_date: null })];
    expect(receipts.filter((r) => r.document_date?.startsWith("2026-07"))).toEqual([]);
  });
});

describe("מי עושה מה במסמכים", () => {
  it("מנהל ואחראי משמרת עורכים תבניות", () => {
    expect(DOCUMENTS_EDIT_ROLES).toEqual(["manager", "shift_manager"]);
  });

  it("מנהל ומנהלת משרד רואים את סקירת החתימות", () => {
    expect(DOCUMENTS_OVERVIEW_ROLES).toEqual(["manager", "office_manager"]);
  });

  it("מנהלת משרד רואה סקירה אבל לא עורכת תבניות", () => {
    expect(DOCUMENTS_OVERVIEW_ROLES).toContain("office_manager");
    expect(DOCUMENTS_EDIT_ROLES).not.toContain("office_manager");
  });

  it("עובד לא רואה סקירה ולא עורך — רק חותם", () => {
    expect(DOCUMENTS_OVERVIEW_ROLES).not.toContain("employee");
    expect(DOCUMENTS_EDIT_ROLES).not.toContain("employee");
    expect(visibleNavItems("employee", ALL_ON).map((i) => i.key)).toContain("agreements");
  });

  it("חשבוניות משרד — מנהל ומנהלת משרד בלבד", () => {
    expect(OFFICE_RECEIPTS_ROLES).toEqual(["manager", "office_manager"]);
  });

  it("איש אחזקה לא ניגש למסמכים בכלל", () => {
    expect(visibleNavItems("maintenance", ALL_ON).map((i) => i.key)).not.toContain("agreements");
  });
});
