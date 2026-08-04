/**
 * ממשק מנהלת המשרד — ניתוח הוצאות לפי ספק בעמוד «חשבוניות וקבלות».
 *
 * המנהלת בוחרת ספק ורואה כמה עוד חייבים לו החודש, ואם הסכום או כמות
 * המסמכים חורגים ממה שרגיל אצל אותו ספק. כאן נבדק בדיוק מה המספרים
 * האלה אומרים: מה נחשב חוב פתוח, איך נקבע ה"רגיל", ומתי המערכת
 * מתריעה על חריגה.
 */
import { describe, expect, it } from "vitest";
import {
  METRIC_BILLED,
  METRIC_COUNT,
  buildVendorSpend,
  deviationOf,
  formatPct,
  levelsForValues,
  monthsUpTo,
  receiptMonth,
  risingStreak,
  shiftMonth,
  spendVerdict,
  totalsOf,
  vendorMonthRows,
  vendorSeries,
} from "@/lib/supplierSpend";
import type { OfficeReceipt, ReceiptType } from "@/types/database";

let seq = 0;

function doc(
  vendor: string,
  type: ReceiptType,
  amount: number,
  documentDate: string | null,
  extra: Partial<OfficeReceipt> = {}
): OfficeReceipt {
  seq += 1;
  return {
    id: `doc-${seq}`,
    business_id: "biz",
    type,
    amount,
    vendor_name: vendor,
    vendor_details: null,
    supplier_id: null,
    document_date: documentDate,
    file_url: "https://example.test/f.pdf",
    notes: null,
    created_by: "office",
    created_at: `${documentDate ?? "2026-01-01"}T09:00:00.000Z`,
    updated_at: `${documentDate ?? "2026-01-01"}T09:00:00.000Z`,
    ...extra,
  };
}

/** ספק עם חשבונית אחת בכל חודש שנמסר. */
function monthly(vendor: string, amounts: Record<string, number>): OfficeReceipt[] {
  return Object.entries(amounts).map(([month, amount]) => doc(vendor, "tax_invoice", amount, `${month}-10`));
}

describe("כמה כסף אנחנו חייבים לספק", () => {
  it("חשבונית מס מייצרת חוב, קבלה סוגרת אותו", () => {
    const t = totalsOf([
      doc("אלפא", "tax_invoice", 1000, "2026-08-03"),
      doc("אלפא", "receipt", 400, "2026-08-20"),
    ]);
    expect(t.billed).toBe(1000);
    expect(t.paid).toBe(400);
    expect(t.balance).toBe(600);
    expect(t.count).toBe(2);
  });

  it("«חשבונית מס קבלה» היא חיוב ותשלום כאחד — ולכן לא נשאר חוב", () => {
    const t = totalsOf([doc("בטא", "tax_invoice_receipt", 750, "2026-08-05")]);
    expect(t.billed).toBe(750);
    expect(t.paid).toBe(750);
    expect(t.balance).toBe(0);
  });

  it("סכומים שמגיעים מהשרת כמחרוזת עדיין מסתכמים נכון", () => {
    const t = totalsOf([doc("גמא", "tax_invoice", "1200.50" as unknown as number, "2026-08-05")]);
    expect(t.billed).toBeCloseTo(1200.5);
  });
});

describe("שיוך מסמך לחודש ולספק", () => {
  it("מסמך בלי תאריך משויך לחודש שבו הועלה", () => {
    const uploaded = doc("דלתא", "receipt", 100, null, { created_at: "2026-07-22T11:00:00.000Z" });
    expect(receiptMonth(uploaded)).toBe("2026-07");
  });

  it("תאריך המסמך גובר על מועד ההעלאה", () => {
    const late = doc("דלתא", "receipt", 100, "2026-06-30", { created_at: "2026-07-22T11:00:00.000Z" });
    expect(receiptMonth(late)).toBe("2026-06");
  });

  it("שם ספק שנכתב עם רווחים או אותיות גדולות מתקבץ לספק אחד", () => {
    const vendors = buildVendorSpend([
      doc("Rami Levy", "tax_invoice", 100, "2026-08-01"),
      doc("  rami   levy ", "tax_invoice", 50, "2026-08-05"),
    ]);
    expect(vendors).toHaveLength(1);
    expect(vendors[0].totals.billed).toBe(150);
  });

  it("ספק שקושר למערכת נשאר נפרד מספק שהוקלד ידנית עם אותו שם", () => {
    const vendors = buildVendorSpend([
      doc("אלפא", "tax_invoice", 100, "2026-08-01", { supplier_id: "sup-1" }),
      doc("אלפא", "tax_invoice", 60, "2026-08-02"),
    ]);
    expect(vendors).toHaveLength(2);
    expect(vendors.map((v) => v.supplierId).sort()).toEqual([null, "sup-1"]);
  });
});

describe("חודשים בגרף המגמה", () => {
  it("החלון מסתיים בחודש הנבחר וכולל חודשים ריקים", () => {
    const months = monthsUpTo("2026-02", 4);
    expect(months).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("מעבר שנה מחושב נכון גם אחורה", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 2)).toBe("2026-02");
  });

  it("חודש בלי מסמכים מופיע בסדרה כאפס ולא נעלם", () => {
    const [vendor] = buildVendorSpend(monthly("אלפא", { "2026-06": 500, "2026-08": 700 }));
    const series = vendorSeries(vendor, "2026-08", 3);
    expect(series.map((m) => [m.month, m.billed])).toEqual([
      ["2026-06", 500],
      ["2026-07", 0],
      ["2026-08", 700],
    ]);
  });
});

describe("האם החודש הזה כמו בדרך כלל", () => {
  const usual = { "2026-04": 1000, "2026-05": 1000, "2026-06": 1000, "2026-07": 1000 };

  function seriesFor(amounts: Record<string, number>, endMonth: string) {
    const [vendor] = buildVendorSpend(monthly("אלפא", amounts));
    return vendorSeries(vendor, endMonth, 12);
  }

  it("סכום זהה לחודשים הקודמים נחשב רגיל", () => {
    const dev = deviationOf(seriesFor({ ...usual, "2026-08": 1050 }, "2026-08"), "2026-08", METRIC_BILLED);
    expect(dev.level).toBe("normal");
    expect(dev.baseline).toBe(1000);
    expect(formatPct(dev.pct)).toBe("+5%");
  });

  it("קפיצה של 60% מסומנת כחריגה", () => {
    const dev = deviationOf(seriesFor({ ...usual, "2026-08": 1600 }, "2026-08"), "2026-08", METRIC_BILLED);
    expect(dev.level).toBe("spike");
    expect(formatPct(dev.pct)).toBe("+60%");
    expect(dev.sampleSize).toBe(4);
  });

  it("עלייה מתונה מסומנת כמעל הרגיל — לא כחריגה", () => {
    const dev = deviationOf(seriesFor({ ...usual, "2026-08": 1250 }, "2026-08"), "2026-08", METRIC_BILLED);
    expect(dev.level).toBe("above");
  });

  it("ירידה חדה מסומנת בנפרד מעלייה", () => {
    const dev = deviationOf(seriesFor({ ...usual, "2026-08": 300 }, "2026-08"), "2026-08", METRIC_BILLED);
    expect(dev.level).toBe("drop");
  });

  it("ה«רגיל» הוא חציון — חודש חריג אחד לא מזיז אותו", () => {
    const dev = deviationOf(
      seriesFor({ "2026-04": 1000, "2026-05": 1000, "2026-06": 9000, "2026-07": 1000, "2026-08": 1000 }, "2026-08"),
      "2026-08",
      METRIC_BILLED
    );
    expect(dev.baseline).toBe(1000);
    expect(dev.level).toBe("normal");
  });

  it("חודש ראשון מול ספק — אין למה להשוות", () => {
    const dev = deviationOf(seriesFor({ "2026-08": 1000 }, "2026-08"), "2026-08", METRIC_BILLED);
    expect(dev.level).toBe("new");
    expect(dev.pct).toBeNull();
  });

  it("חודש היסטוריה בודד מספיק ל«מעל הרגיל» אבל לא להכרזת חריגה", () => {
    const dev = deviationOf(seriesFor({ "2026-07": 1000, "2026-08": 3000 }, "2026-08"), "2026-08", METRIC_BILLED);
    expect(dev.level).toBe("above");
    expect(dev.sampleSize).toBe(1);
  });

  it("כמות המסמכים נמדדת באותה שיטה כמו הסכום", () => {
    const receipts = [
      doc("אלפא", "tax_invoice", 100, "2026-06-01"),
      doc("אלפא", "tax_invoice", 100, "2026-07-01"),
      doc("אלפא", "tax_invoice", 100, "2026-08-01"),
      doc("אלפא", "tax_invoice", 100, "2026-08-02"),
      doc("אלפא", "tax_invoice", 100, "2026-08-03"),
      doc("אלפא", "tax_invoice", 100, "2026-08-04"),
    ];
    const [vendor] = buildVendorSpend(receipts);
    const dev = deviationOf(vendorSeries(vendor, "2026-08", 12), "2026-08", METRIC_COUNT);
    expect(dev.current).toBe(4);
    expect(dev.baseline).toBe(1);
    expect(dev.level).toBe("spike");
  });

  it("צביעת עמודות הגרף נגזרת מהסדרה עצמה — כל מדד והרגיל שלו", () => {
    expect(levelsForValues([100, 100, 100, 400])).toEqual(["new", "normal", "normal", "spike"]);
  });

  it("רצף עלייה מזוהה רק כשכל חודש גבוה מקודמו", () => {
    const rising = vendorSeries(
      buildVendorSpend(monthly("אלפא", { "2026-06": 500, "2026-07": 800, "2026-08": 1200 }))[0],
      "2026-08",
      3
    );
    expect(risingStreak(rising, "2026-08", METRIC_BILLED)).toBe(2);

    const bumpy = vendorSeries(
      buildVendorSpend(monthly("אלפא", { "2026-06": 900, "2026-07": 400, "2026-08": 1200 }))[0],
      "2026-08",
      3
    );
    expect(risingStreak(bumpy, "2026-08", METRIC_BILLED)).toBe(1);
  });
});

describe("המשפט האחד שהמנהלת רואה", () => {
  function verdictFor(receipts: OfficeReceipt[], month: string) {
    const [vendor] = buildVendorSpend(receipts);
    return spendVerdict(vendorSeries(vendor, month, 12), month);
  }

  it("חודש רגיל נאמר במילה אחת, עם הרגיל לצידו", () => {
    const v = verdictFor(monthly("אלפא", { "2026-06": 1000, "2026-07": 1000, "2026-08": 1050 }), "2026-08");
    expect(v.title).toBe("כרגיל");
    expect(v.tone).toBe("success");
    expect(v.detail).toBe("בדרך כלל ₪1,000 בחודש");
  });

  it("קפיצה גדולה מוכרזת כחריגה עם האחוז", () => {
    const v = verdictFor(monthly("אלפא", { "2026-05": 1000, "2026-06": 1000, "2026-07": 1000, "2026-08": 2000 }), "2026-08");
    expect(v.title).toBe("חריגה · +100% מהרגיל");
    expect(v.tone).toBe("danger");
  });

  it("סטייה מתונה מוצגת כאחוז בלבד — בלי המילה חריגה", () => {
    const v = verdictFor(monthly("אלפא", { "2026-06": 1000, "2026-07": 1000, "2026-08": 1250 }), "2026-08");
    expect(v.title).toBe("+25% מהרגיל");
    expect(v.tone).toBe("warning");
  });

  it("עלייה רצופה גוברת על «כרגיל» כשהחודש עצמו לא חורג", () => {
    const v = verdictFor(monthly("אלפא", { "2026-06": 900, "2026-07": 1000, "2026-08": 1050 }), "2026-08");
    expect(v.title).toBe("עלייה 3 חודשים ברצף");
    expect(v.tone).toBe("warning");
  });

  it("חודש ראשון מול ספק לא מתיימר להשוות", () => {
    const v = verdictFor(monthly("אלפא", { "2026-08": 1000 }), "2026-08");
    expect(v.title).toBe("חודש ראשון מול הספק");
    expect(v.detail).toContain("₪1,000");
  });

  it("חודש בלי מסמכים אומר מתי היה האחרון", () => {
    const v = verdictFor(monthly("אלפא", { "2026-05": 800 }), "2026-08");
    expect(v.title).toBe("אין מסמכים החודש");
    expect(v.detail).toContain("מאי");
  });
});

describe("רשימת הספקים לבחירה", () => {
  it("ממוינת לפי החיוב בחודש הנבחר, ומחזיקה גם ספקים בלי מסמכים החודש", () => {
    const receipts = [
      ...monthly("קטן", { "2026-08": 200 }),
      ...monthly("גדול", { "2026-08": 5000 }),
      ...monthly("ישן", { "2026-03": 9000 }),
    ];
    const rows = vendorMonthRows(buildVendorSpend(receipts), "2026-08");
    expect(rows.map((r) => r.vendor.name)).toEqual(["גדול", "קטן", "ישן"]);
    expect(rows[2].month.count).toBe(0);
  });
});
