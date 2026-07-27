/**
 * ממשק איש האחזקה — «מעקב שכר» לפי עבודה.
 *
 * הוא לא מקבל שכר לפי שעות אלא לפי תקלה: מגיש מחיר עבודה, המנהל מאשר,
 * ורק אז זה נכנס לשכר. הבדיקות מוודאות שכסף לא נספר לפני אישור, ושכל
 * תשלום מאושר מופיע בדיוק פעם אחת עם התאריך הנכון.
 */
import { describe, expect, it } from "vitest";
import { buildFaultPayRows, faultPayMonthLabel, sumFaultPayAmount } from "@/lib/faultPayrollRows";
import { sumShiftRowTotals } from "@/lib/payrollShiftRows";
import { USER, makeFault } from "../helpers/factories";

const APPROVED = {
  pay_employee_id: USER.maintenance,
  pay_approval_status: "approved" as const,
  pay_approved_at: "2026-07-08T15:00:00.000Z",
  pay_approved_by: USER.manager,
};

describe("סכום התשלום לאיש האחזקה", () => {
  it("מסכם רק תקלות שאושרו", () => {
    const faults = [
      makeFault({ ...APPROVED, work_price: 400 }),
      makeFault({ ...APPROVED, work_price: 250 }),
      makeFault({ pay_employee_id: USER.maintenance, pay_approval_status: "pending", work_price: 900 }),
    ];
    expect(sumFaultPayAmount(faults, USER.maintenance)).toBe(650);
  });

  it("תקלה שהוגשה ולא אושרה שווה אפס", () => {
    const faults = [
      makeFault({
        pay_employee_id: USER.maintenance,
        pay_approval_status: "pending",
        pay_submitted_at: "2026-07-08T14:00:00.000Z",
        work_price: 900,
      }),
    ];
    expect(sumFaultPayAmount(faults, USER.maintenance)).toBe(0);
  });

  it("תקלה בלי הגשת מחיר כלל שווה אפס", () => {
    expect(sumFaultPayAmount([makeFault()], USER.maintenance)).toBe(0);
  });

  it("תשלום ששויך לאיש אחזקה אחר לא נספר לי", () => {
    const faults = [makeFault({ ...APPROVED, pay_employee_id: USER.employee2, work_price: 400 })];
    expect(sumFaultPayAmount(faults, USER.maintenance)).toBe(0);
  });

  it("מחיר לא מספרי לא הופך את הסכום ל-NaN", () => {
    const faults = [
      makeFault({ ...APPROVED, work_price: 400 }),
      makeFault({ ...APPROVED, work_price: Number.NaN }),
    ];
    expect(sumFaultPayAmount(faults, USER.maintenance)).toBe(400);
  });

  it("רשימה ריקה מחזירה אפס", () => {
    expect(sumFaultPayAmount([], USER.maintenance)).toBe(0);
  });

  it("סכומים עשרוניים נשמרים במלואם", () => {
    const faults = [makeFault({ ...APPROVED, work_price: 149.9 }), makeFault({ ...APPROVED, work_price: 0.1 })];
    expect(sumFaultPayAmount(faults, USER.maintenance)).toBeCloseTo(150, 5);
  });
});

describe("שורות התשלום שהוא רואה במסך", () => {
  it("כל תקלה מאושרת מקבלת שורה עם הסכום שאושר", () => {
    const rows = buildFaultPayRows([makeFault({ ...APPROVED, description: "מקרר לא מקרר", work_price: 400 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "תקלה: מקרר לא מקרר",
      hours: 0,
      hourly: 0,
      earned: 400,
      isTips: false,
      timeLabel: null,
    });
  });

  it("מזהה השורה נגזר מהתקלה כדי למנוע כפילות ברשימה", () => {
    const fault = makeFault({ ...APPROVED, id: "fault-77", work_price: 400 });
    expect(buildFaultPayRows([fault])[0].id).toBe("fault-fault-77");
  });

  it("תקלה שממתינה לאישור לא מופיעה כשורה", () => {
    const rows = buildFaultPayRows([
      makeFault({ pay_employee_id: USER.maintenance, pay_approval_status: "pending", work_price: 400 }),
    ]);
    expect(rows).toEqual([]);
  });

  it("תקלה מאושרת בלי מחיר לא מופיעה", () => {
    expect(buildFaultPayRows([makeFault({ ...APPROVED, work_price: null })])).toEqual([]);
  });

  it("תקלה מאושרת בלי מועד אישור לא מופיעה (אין לה תאריך לשבץ בו)", () => {
    const rows = buildFaultPayRows([
      makeFault({ ...APPROVED, pay_approved_at: null, work_price: 400 }),
    ]);
    expect(rows).toEqual([]);
  });

  it("תיאור ארוך נחתך ל-48 תווים עם שלוש נקודות", () => {
    const long = "א".repeat(80);
    const rows = buildFaultPayRows([makeFault({ ...APPROVED, description: long, work_price: 100 })]);
    expect(rows[0].title).toBe(`תקלה: ${"א".repeat(48)}…`);
  });

  it("תיאור באורך 48 בדיוק לא נחתך", () => {
    const exact = "ב".repeat(48);
    const rows = buildFaultPayRows([makeFault({ ...APPROVED, description: exact, work_price: 100 })]);
    expect(rows[0].title).toBe(`תקלה: ${exact}`);
  });

  it("השורות ממוינות מהאישור החדש לישן", () => {
    const rows = buildFaultPayRows([
      makeFault({ ...APPROVED, id: "f-old", pay_approved_at: "2026-07-01T10:00:00.000Z", work_price: 100 }),
      makeFault({ ...APPROVED, id: "f-new", pay_approved_at: "2026-07-20T10:00:00.000Z", work_price: 200 }),
      makeFault({ ...APPROVED, id: "f-mid", pay_approved_at: "2026-07-10T10:00:00.000Z", work_price: 150 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["fault-f-new", "fault-f-mid", "fault-f-old"]);
  });

  it("סיכום השורות תואם לסכום התשלומים המאושרים", () => {
    const faults = [
      makeFault({ ...APPROVED, work_price: 400 }),
      makeFault({ ...APPROVED, work_price: 250 }),
    ];
    const totals = sumShiftRowTotals(buildFaultPayRows(faults));
    expect(totals.earned).toBe(650);
    expect(totals.hours).toBe(0);
    expect(totals.avg).toBe(0); // אין שעות — אין ממוצע לשעה
    expect(totals.earned).toBe(sumFaultPayAmount(faults, USER.maintenance));
  });

  it("רשימה ריקה מחזירה אפס שורות", () => {
    expect(buildFaultPayRows([])).toEqual([]);
  });
});

describe("תווית התאריך של התשלום", () => {
  it("מציגה יום בשבוע ותאריך מלא", () => {
    const fault = makeFault({ ...APPROVED, pay_approved_at: "2026-07-08T15:00:00.000Z", work_price: 400 });
    expect(faultPayMonthLabel(fault)).toContain("ביולי 2026");
  });

  it("תקלה שלא אושרה מחזירה מחרוזת ריקה", () => {
    expect(faultPayMonthLabel(makeFault())).toBe("");
  });
});
