/**
 * לעובד יכולים להיות כמה הסכמים בו־זמנית.
 *
 * הוספת הסכם חדש לעובד לא דורסת הסכם קודם — לא בשמירה (INSERT ולא UPSERT),
 * לא במה שהעובד רואה, ולא בטבלת «מצב מסמכים» של המנהל, שבעבר הציגה רק את
 * ההסכם הראשון של כל עובד.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Supabase מדומה — מתעד כל קריאה לטבלה בלי לגעת ברשת
// ---------------------------------------------------------------------------
const insert = vi.fn(async () => ({ error: null }));
const upsert = vi.fn(async () => ({ error: null }));
const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
const del = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
const from = vi.fn(() => ({ insert, upsert, update, delete: del }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => from(...args) },
}));

import { agreementsForEmployee, createAgreementTemplate, isSigned, personalAgreements } from "@/api/agreements";
import { docKey, employeeDocs, employeeWorkDocs } from "@/pages/agreements/statusDocs";
import type { AgreementTemplate, EmployeeIdCard } from "@/types/database";
import { BUSINESS_ID, USER, makeAgreement, makeSignature } from "../helpers/factories";

const TAX_YEAR = 2026;

const globalWork = makeAgreement({ id: "agr-global-work", type: "work", title: "הסכם עבודה כללי" });
const harassment = makeAgreement({ id: "agr-harass", type: "sexual_harassment", title: "מניעת הטרדה" });
const form101 = makeAgreement({ id: "agr-101", type: "form_101", title: "טופס 101" });

/** שני הסכמים אישיים לאותו עובד — השני נוסף אחרי הראשון ואסור שידרוס אותו. */
const first = makeAgreement({
  id: "agr-first",
  type: "work",
  title: "הסכם עבודה 2025",
  employee_id: USER.employee,
  created_at: "2025-01-01T00:00:00.000Z",
});
const second = makeAgreement({
  id: "agr-second",
  type: "work",
  title: "הסכם עבודה 2026",
  employee_id: USER.employee,
  created_at: "2026-01-01T00:00:00.000Z",
});
const otherDoc = makeAgreement({
  id: "agr-nda",
  type: "other",
  title: "הסכם סודיות",
  employee_id: USER.employee,
});
const colleagueDoc = makeAgreement({
  id: "agr-colleague",
  type: "work",
  title: "הסכם של עובד אחר",
  employee_id: USER.employee2,
});

const withoutGlobalWork = [harassment, form101, first, second, otherDoc, colleagueDoc];
const all = [globalWork, ...withoutGlobalWork];

function idCard(employeeId: string): EmployeeIdCard {
  return {
    id: `card-${employeeId}`,
    business_id: BUSINESS_ID,
    employee_id: employeeId,
    file_url: "https://files.local/id.jpg",
    file_name: null,
    uploaded_at: "2026-07-01T00:00:00.000Z",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
}

const statusFor = (employeeId: string, agreements: AgreementTemplate[] = all, signatures = [] as ReturnType<typeof makeSignature>[]) =>
  employeeDocs({
    agreements,
    globalFixed: agreements.filter((a) => a.type === "sexual_harassment" && !a.employee_id),
    globalWork: agreements.find((a) => a.type === "work" && !a.employee_id),
    signatures,
    idCards: [],
    employeeId,
    taxYear: TAX_YEAR,
  });

// ---------------------------------------------------------------------------
// שמירה — הסכם חדש נכנס כשורה חדשה
// ---------------------------------------------------------------------------

describe("שמירת הסכם אישי חדש", () => {
  beforeEach(() => {
    insert.mockClear();
    upsert.mockClear();
    update.mockClear();
    del.mockClear();
    from.mockClear();
  });

  const base = {
    business_id: BUSINESS_ID,
    type: "work" as const,
    content: "",
    signature_fields: [],
    created_by: USER.manager,
  };

  it("נשמר ב-INSERT לטבלת התבניות — לא UPSERT ולא UPDATE", async () => {
    await createAgreementTemplate({ ...base, title: "הסכם עבודה 2026", employee_id: USER.employee });

    expect(from).toHaveBeenCalledWith("agreement_templates");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(upsert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("שני הסכמים לאותו עובד → שתי שורות נפרדות, בלי מחיקה של הקודם", async () => {
    await createAgreementTemplate({ ...base, title: "הסכם עבודה 2025", employee_id: USER.employee });
    await createAgreementTemplate({ ...base, title: "הסכם עבודה 2026", employee_id: USER.employee });

    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[0][0]).toMatchObject({ title: "הסכם עבודה 2025", employee_id: USER.employee });
    expect(insert.mock.calls[1][0]).toMatchObject({ title: "הסכם עבודה 2026", employee_id: USER.employee });
    expect(del).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("אפשר גם הסכם עבודה וגם הסכם מסוג «אחר» לאותו עובד", async () => {
    await createAgreementTemplate({ ...base, title: "הסכם עבודה", employee_id: USER.employee });
    await createAgreementTemplate({ ...base, type: "other", title: "הסכם סודיות", employee_id: USER.employee });

    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls.map((c) => (c[0] as { type: string }).type)).toEqual(["work", "other"]);
  });

  it("הפרטים לא משתנים בדרך — מה שנשלח זה מה שנשמר", async () => {
    const input = {
      ...base,
      title: "הסכם עבודה 2026",
      employee_id: USER.employee,
      file_url: "https://files.local/2026.pdf",
      signature_fields: [{ id: "f1", page: 0, x: 0.1, y: 0.2, w: 0.3, h: 0.05, kind: "signature" as const }],
    };
    await createAgreementTemplate(input);
    expect(insert).toHaveBeenCalledWith(input);
  });

  it("שגיאת DB מועברת החוצה ולא נבלעת", async () => {
    insert.mockResolvedValueOnce({ error: new Error("duplicate") } as never);
    await expect(
      createAgreementTemplate({ ...base, title: "x", employee_id: USER.employee }),
    ).rejects.toThrow("duplicate");
  });

  it("טופס 101 אישי נחסם — הוא נשאר מסמך גלובלי יחיד", async () => {
    await expect(
      createAgreementTemplate({ ...base, type: "form_101", title: "טופס 101", employee_id: USER.employee }),
    ).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// מה שהעובד רואה
// ---------------------------------------------------------------------------

describe("העובד רואה את כל ההסכמים שלו", () => {
  it("שני הסכמי עבודה אישיים + «אחר» מופיעים כולם", () => {
    const mine = agreementsForEmployee(all, USER.employee).map((a) => a.id);
    expect(mine).toContain("agr-first");
    expect(mine).toContain("agr-second");
    expect(mine).toContain("agr-nda");
  });

  it("הישן לא נעלם כשנוסף חדש", () => {
    const before = agreementsForEmployee([globalWork, harassment, form101, first], USER.employee).map((a) => a.id);
    const after = agreementsForEmployee([globalWork, harassment, form101, first, second], USER.employee).map((a) => a.id);
    expect(before).toContain("agr-first");
    expect(after).toContain("agr-first");
    expect(after).toContain("agr-second");
    expect(after.length).toBe(before.length + 1);
  });

  it("ההסכם של עובד אחר לא מופיע לי", () => {
    const mine = agreementsForEmployee(all, USER.employee).map((a) => a.id);
    expect(mine).not.toContain("agr-colleague");
  });

  it("כל הסכם נחתם בנפרד — חתימה על אחד לא סוגרת את השני", () => {
    const sigs = [makeSignature({ agreement_id: "agr-first", employee_id: USER.employee, agreed: true })];
    expect(isSigned(sigs, "agr-first", USER.employee)).toBe(true);
    expect(isSigned(sigs, "agr-second", USER.employee)).toBe(false);
    expect(isSigned(sigs, "agr-nda", USER.employee)).toBe(false);
  });

  it("המנהל רואה בטאב «הסכמים» את כל האישיים", () => {
    expect(personalAgreements(all).map((a) => a.id)).toEqual(["agr-first", "agr-second", "agr-nda", "agr-colleague"]);
  });
});

// ---------------------------------------------------------------------------
// טבלת «מצב מסמכים» של המנהל — הבאג שהיה: רק ההסכם הראשון הוצג
// ---------------------------------------------------------------------------

describe("מצב מסמכים — עמודת הסכמי העבודה", () => {
  it("שני הסכמים אישיים → שניהם מופיעים, לא רק הראשון", () => {
    const work = employeeWorkDocs({ agreements: withoutGlobalWork, globalWork: undefined, signatures: [], employeeId: USER.employee });
    expect(work.map((d) => d.template?.id)).toEqual(["agr-first", "agr-second", "agr-nda"]);
    expect(work.map((d) => d.label)).toEqual(["הסכם עבודה 2025", "הסכם עבודה 2026", "הסכם סודיות"]);
  });

  it("הוספת הסכם שני לא מורידה את הראשון מהטבלה", () => {
    const before = employeeWorkDocs({ agreements: [first], globalWork: undefined, signatures: [], employeeId: USER.employee });
    const after = employeeWorkDocs({ agreements: [first, second], globalWork: undefined, signatures: [], employeeId: USER.employee });
    expect(before.map((d) => d.template?.id)).toEqual(["agr-first"]);
    expect(after.map((d) => d.template?.id)).toEqual(["agr-first", "agr-second"]);
  });

  it("הסכם כללי + אישיים — כולם נדרשים, האישי לא מחליף את הכללי", () => {
    const work = employeeWorkDocs({ agreements: all, globalWork, signatures: [], employeeId: USER.employee });
    expect(work.map((d) => d.template?.id)).toEqual(["agr-global-work", "agr-first", "agr-second", "agr-nda"]);
    expect(work.every((d) => !d.optional)).toBe(true);
  });

  it("כל הסכם עם סטטוס חתימה עצמאי", () => {
    const sigs = [
      makeSignature({ agreement_id: "agr-first", employee_id: USER.employee, agreed: true }),
      makeSignature({ agreement_id: "agr-nda", employee_id: USER.employee, agreed: true }),
    ];
    const work = employeeWorkDocs({ agreements: withoutGlobalWork, globalWork: undefined, signatures: sigs, employeeId: USER.employee });
    expect(work.map((d) => [d.template?.id, d.done])).toEqual([
      ["agr-first", true],
      ["agr-second", false],
      ["agr-nda", true],
    ]);
  });

  it("חתימה של עובד אחר על ההסכם לא נזקפת לעובד שלנו", () => {
    const sigs = [makeSignature({ agreement_id: "agr-first", employee_id: USER.employee2, agreed: true })];
    const work = employeeWorkDocs({ agreements: withoutGlobalWork, globalWork: undefined, signatures: sigs, employeeId: USER.employee });
    expect(work.find((d) => d.template?.id === "agr-first")?.done).toBe(false);
  });

  it("agreed=false לא נחשב חתום", () => {
    const sigs = [makeSignature({ agreement_id: "agr-second", employee_id: USER.employee, agreed: false })];
    const work = employeeWorkDocs({ agreements: withoutGlobalWork, globalWork: undefined, signatures: sigs, employeeId: USER.employee });
    expect(work.find((d) => d.template?.id === "agr-second")?.done).toBe(false);
  });

  it("ההסכם של עובד אחר לא מופיע בשורה שלי", () => {
    const work = employeeWorkDocs({ agreements: all, globalWork, signatures: [], employeeId: USER.employee });
    expect(work.map((d) => d.template?.id)).not.toContain("agr-colleague");
  });

  it("עובד בלי הסכמים בכלל → תא «—» אופציונלי אחד, לא שורה ריקה", () => {
    const work = employeeWorkDocs({ agreements: withoutGlobalWork, globalWork: undefined, signatures: [], employeeId: USER.employee3 });
    expect(work).toEqual([{ label: "הסכם עבודה", done: false, optional: true }]);
  });

  it("עובד בלי אישיים אבל עם כללי → רק הכללי", () => {
    const work = employeeWorkDocs({ agreements: all, globalWork, signatures: [], employeeId: USER.employee3 });
    expect(work.map((d) => d.template?.id)).toEqual(["agr-global-work"]);
  });

  it("טופס 101 לא מתערבב בעמודת ההסכמים", () => {
    const personal101 = makeAgreement({ id: "agr-101-personal", type: "form_101", employee_id: USER.employee });
    const work = employeeWorkDocs({ agreements: [...withoutGlobalWork, personal101], globalWork: undefined, signatures: [], employeeId: USER.employee });
    expect(work.map((d) => d.template?.id)).not.toContain("agr-101-personal");
    expect(work.map((d) => d.template?.id)).not.toContain("agr-101");
  });

  it("סדר יציב — לפי סדר ההסכמים שהתקבל (ישן → חדש)", () => {
    const work = employeeWorkDocs({ agreements: [second, first], globalWork: undefined, signatures: [], employeeId: USER.employee });
    expect(work.map((d) => d.template?.id)).toEqual(["agr-second", "agr-first"]);
  });
});

describe("מצב מסמכים — השורה המלאה של העובד", () => {
  it("המונה סופר את כל ההסכמים ולא רק אחד", () => {
    const docs = statusFor(USER.employee);
    // ת.ז + טופס 101 + (כללי + 2 אישיים + סודיות) + הטרדה
    expect(docs.all.length).toBe(2 + 4 + 1);
    expect(docs.workDocs.length).toBe(4);
    expect(docs.fixedDocs.map((d) => d.template?.id)).toEqual(["agr-harass"]);
  });

  it("הרשימה השטוחה שומרת על הסדר: ת.ז, 101, הסכמים, קבועים", () => {
    const docs = statusFor(USER.employee);
    expect(docs.all.map((d) => d.label)).toEqual([
      "תעודת זהות",
      `טופס 101 (${TAX_YEAR})`,
      "הסכם עבודה כללי",
      "הסכם עבודה 2025",
      "הסכם עבודה 2026",
      "הסכם סודיות",
      "מניעת הטרדה",
    ]);
  });

  it("עובד שחתם על הכול מסומן כמושלם רק כשכל ההסכמים נחתמו", () => {
    const partial = [
      makeSignature({ agreement_id: "agr-global-work", employee_id: USER.employee }),
      makeSignature({ agreement_id: "agr-first", employee_id: USER.employee }),
      makeSignature({ agreement_id: "agr-nda", employee_id: USER.employee }),
      makeSignature({ agreement_id: "agr-harass", employee_id: USER.employee }),
      makeSignature({ agreement_id: "agr-101", employee_id: USER.employee }),
    ];
    const docsPartial = employeeDocs({
      agreements: all,
      globalFixed: [harassment],
      globalWork,
      signatures: partial,
      idCards: [idCard(USER.employee)],
      employeeId: USER.employee,
      taxYear: TAX_YEAR,
    });
    const counted = docsPartial.all.filter((d) => !(d.optional && !d.done));
    expect(counted.filter((d) => d.done).length).toBe(counted.length - 1);
    expect(counted.find((d) => !d.done)?.template?.id).toBe("agr-second");

    const full = [...partial, makeSignature({ agreement_id: "agr-second", employee_id: USER.employee })];
    const docsFull = employeeDocs({
      agreements: all,
      globalFixed: [harassment],
      globalWork,
      signatures: full,
      idCards: [idCard(USER.employee)],
      employeeId: USER.employee,
      taxYear: TAX_YEAR,
    });
    expect(docsFull.all.every((d) => d.done)).toBe(true);
  });

  it("שני עובדים באותה טבלה — לכל אחד ההסכמים שלו בלבד", () => {
    const mine = statusFor(USER.employee).workDocs.map((d) => d.template?.id);
    const theirs = statusFor(USER.employee2).workDocs.map((d) => d.template?.id);
    expect(mine).toEqual(["agr-global-work", "agr-first", "agr-second", "agr-nda"]);
    expect(theirs).toEqual(["agr-global-work", "agr-colleague"]);
  });

  it("כל תא בהסכמים מקושר לתבנית שלו — לחיצה פותחת את המסמך הנכון", () => {
    const docs = statusFor(USER.employee);
    for (const d of docs.workDocs) {
      expect(d.template).toBeDefined();
      expect(d.template!.employee_id === null || d.template!.employee_id === USER.employee).toBe(true);
    }
  });
});

describe("מפתחות React יציבים", () => {
  it("שני הסכמים עם אותה כותרת מקבלים מפתחות שונים", () => {
    const dupA = makeAgreement({ id: "agr-dup-a", title: "הסכם עבודה", employee_id: USER.employee });
    const dupB = makeAgreement({ id: "agr-dup-b", title: "הסכם עבודה", employee_id: USER.employee });
    const work = employeeWorkDocs({ agreements: [dupA, dupB], globalWork: undefined, signatures: [], employeeId: USER.employee });
    const keys = work.map((d, i) => docKey(d, i));
    expect(keys).toEqual(["agr-dup-a", "agr-dup-b"]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("כל המפתחות בשורה של עובד ייחודיים", () => {
    const docs = employeeDocs({
      agreements: all,
      globalFixed: [harassment],
      globalWork,
      signatures: [],
      idCards: [idCard(USER.employee)],
      employeeId: USER.employee,
      taxYear: TAX_YEAR,
    });
    const keys = docs.all.map((d, i) => docKey(d, i));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("תא אופציונלי בלי תבנית מקבל מפתח מהתווית והאינדקס", () => {
    expect(docKey({ label: "הסכם עבודה", done: false, optional: true }, 2)).toBe("הסכם עבודה-2");
  });
});
