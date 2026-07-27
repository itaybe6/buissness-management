/**
 * ממשק העובד — מסך «מסמכים».
 *
 * העובד רואה שם שני סוגי מסמכים: הסכמים כלליים שכל העסק חותם עליהם, והסכמים
 * אישיים שהופקו עבורו. טופס 101 הוא מקרה מיוחד — תמיד עותק גלובלי אחד.
 */
import { describe, expect, it } from "vitest";
import {
  agreementsForEmployee,
  form101Template,
  globalAgreements,
  globalForm101Template,
  isSigned,
  personalAgreements,
  signatureOf,
} from "@/api/agreements";
import { idCardByEmployee, idCardsMap, isImageUrl } from "@/api/employeeIdCards";
import { BUSINESS_ID, USER, makeAgreement, makeSignature } from "../helpers/factories";
import type { EmployeeIdCard } from "@/types/database";

const workAgreement = makeAgreement({ id: "agr-work", type: "work", title: "הסכם עבודה" });
const harassmentAgreement = makeAgreement({
  id: "agr-harassment",
  type: "sexual_harassment",
  title: "מניעת הטרדה מינית",
});
const globalForm101 = makeAgreement({ id: "agr-101", type: "form_101", title: "טופס 101", employee_id: null });
const personalForMe = makeAgreement({ id: "agr-mine", type: "other", title: "נספח אישי", employee_id: USER.employee });
const personalForOther = makeAgreement({
  id: "agr-theirs",
  type: "other",
  title: "נספח של עובד אחר",
  employee_id: USER.employee2,
});

describe("אילו הסכמים העובד רואה", () => {
  const all = [workAgreement, harassmentAgreement, globalForm101, personalForMe, personalForOther];

  it("רואה הסכמים כלליים והסכם אישי שלו", () => {
    const mine = agreementsForEmployee(all, USER.employee).map((a) => a.id);
    expect(mine).toEqual(["agr-work", "agr-harassment", "agr-101", "agr-mine"]);
  });

  it("לא רואה הסכם אישי של עובד אחר", () => {
    expect(agreementsForEmployee(all, USER.employee).map((a) => a.id)).not.toContain("agr-theirs");
  });

  it("עובד בלי הסכמים אישיים רואה רק את הכלליים", () => {
    const other = agreementsForEmployee(all, USER.employee3).map((a) => a.id);
    expect(other).toEqual(["agr-work", "agr-harassment", "agr-101"]);
  });

  it("כשקיים 101 גלובלי — עותקים אישיים של 101 מוסתרים כדי לא להציג כפילות", () => {
    const personal101 = makeAgreement({ id: "agr-101-mine", type: "form_101", employee_id: USER.employee });
    const list = agreementsForEmployee([globalForm101, personal101], USER.employee).map((a) => a.id);
    expect(list).toEqual(["agr-101"]);
  });

  it("שני טפסי 101 גלובליים — מוצג רק הראשון, בלי כפילות ברשימה", () => {
    const duplicate = makeAgreement({ id: "agr-101-dup", type: "form_101", employee_id: null });
    const list = agreementsForEmployee([globalForm101, duplicate], USER.employee).map((a) => a.id);
    expect(list).toEqual(["agr-101"]);
  });

  it("בלי 101 גלובלי — עותק אישי כן מוצג (עסק ישן)", () => {
    const personal101 = makeAgreement({ id: "agr-101-mine", type: "form_101", employee_id: USER.employee });
    expect(agreementsForEmployee([personal101], USER.employee).map((a) => a.id)).toEqual(["agr-101-mine"]);
  });

  it("רשימה ריקה לא קורסת", () => {
    expect(agreementsForEmployee([], USER.employee)).toEqual([]);
  });

  it("הפרדה בין הסכמים קבועים לאישיים", () => {
    expect(globalAgreements(all).map((a) => a.id)).toEqual(["agr-work", "agr-harassment", "agr-101"]);
    expect(personalAgreements(all).map((a) => a.id)).toEqual(["agr-mine", "agr-theirs"]);
  });
});

describe("טופס 101", () => {
  it("נמצא לפי הסוג, בלי שיוך לעובד", () => {
    expect(globalForm101Template([workAgreement, globalForm101])?.id).toBe("agr-101");
    expect(form101Template([workAgreement, globalForm101])?.id).toBe("agr-101");
  });

  it("מחזיר undefined כשאין טופס 101 בעסק", () => {
    expect(form101Template([workAgreement])).toBeUndefined();
  });

  it("עותק אישי בלבד אינו נחשב לתבנית הגלובלית", () => {
    const personal101 = makeAgreement({ type: "form_101", employee_id: USER.employee });
    expect(globalForm101Template([personal101])).toBeUndefined();
  });
});

describe("סטטוס חתימה", () => {
  const signatures = [
    makeSignature({ agreement_id: "agr-work", employee_id: USER.employee, agreed: true }),
    makeSignature({ agreement_id: "agr-work", employee_id: USER.employee2, agreed: true }),
    makeSignature({ agreement_id: "agr-harassment", employee_id: USER.employee, agreed: false }),
  ];

  it("חתום כשקיימת חתימה עם agreed", () => {
    expect(isSigned(signatures, "agr-work", USER.employee)).toBe(true);
  });

  it("רשומת חתימה עם agreed=false אינה חתימה", () => {
    expect(isSigned(signatures, "agr-harassment", USER.employee)).toBe(false);
  });

  it("חתימה של עובד אחר לא נחשבת לי", () => {
    expect(isSigned(signatures, "agr-harassment", USER.employee2)).toBe(false);
  });

  it("הסכם ללא חתימות אינו חתום", () => {
    expect(isSigned(signatures, "agr-101", USER.employee)).toBe(false);
    expect(isSigned([], "agr-work", USER.employee)).toBe(false);
  });

  it("שליפת רשומת החתימה מחזירה את הרשומה של אותו עובד בלבד", () => {
    expect(signatureOf(signatures, "agr-work", USER.employee2)?.employee_id).toBe(USER.employee2);
    expect(signatureOf(signatures, "agr-harassment", USER.employee)).toBeUndefined();
  });
});

describe("צילום תעודת זהות", () => {
  const cards: EmployeeIdCard[] = [
    {
      id: "card-1",
      business_id: BUSINESS_ID,
      employee_id: USER.employee,
      file_url: "https://files.local/id.jpg",
      file_name: "id.jpg",
      uploaded_at: "2026-07-01T10:00:00Z",
      created_at: "2026-07-01T10:00:00Z",
      updated_at: "2026-07-01T10:00:00Z",
    },
  ];

  it("מוצא את הצילום של העובד", () => {
    expect(idCardByEmployee(cards, USER.employee)?.id).toBe("card-1");
  });

  it("מחזיר undefined לעובד בלי צילום, וגם כשהרשימה עוד לא נטענה", () => {
    expect(idCardByEmployee(cards, USER.employee2)).toBeUndefined();
    expect(idCardByEmployee(undefined, USER.employee)).toBeUndefined();
  });

  it("מפת הצילומים ממופתחת לפי מזהה עובד", () => {
    const map = idCardsMap(cards);
    expect(map.get(USER.employee)?.file_url).toContain("id.jpg");
    expect(idCardsMap(undefined).size).toBe(0);
  });

  it("מזהה תמונות לעומת PDF לצורך תצוגה מקדימה", () => {
    expect(isImageUrl("https://files.local/id.jpg")).toBe(true);
    expect(isImageUrl("https://files.local/id.PNG")).toBe(true);
    expect(isImageUrl("https://files.local/id.webp?token=abc")).toBe(true);
    expect(isImageUrl("https://files.local/id.pdf")).toBe(false);
    expect(isImageUrl("https://files.local/id")).toBe(false);
  });
});
