/**
 * יומן המלאי שהמנהל רואה — מי שינה, מה, וכמה.
 *
 * השורה ביומן חייבת להיות קריאה לבן אדם: "+1 ארגז + 3 יח׳" ולא "+1.125".
 * החישוב עובר דרך יחידות בודדות (מספרים שלמים) כדי שלא יצטבר סחף עשרוני
 * אחרי עשרות ספירות מלאי.
 */
import { describe, expect, it } from "vitest";
import {
  formatQtyChangeWithPieces,
  formatQtyWithPieces,
  mainUnitToPieces,
  piecesToMainUnit,
  qtyChangeInPieces,
  splitPackageQty,
} from "@/api/inventory";

describe("הפרש כמות ביחידות בודדות", () => {
  it("תוספת של ארגז שלם", () => {
    expect(qtyChangeInPieces(2, 3, 24)).toBe(24);
  });

  it("תוספת של כמה בודדים", () => {
    expect(qtyChangeInPieces(2, 2.5, 24)).toBe(12);
  });

  it("הפחתה מחזירה מספר שלילי", () => {
    expect(qtyChangeInPieces(3, 2, 24)).toBe(-24);
  });

  it("בלי שינוי — אפס", () => {
    expect(qtyChangeInPieces(3, 3, 24)).toBe(0);
  });

  it("התוצאה תמיד מספר שלם — אין חצי בקבוק", () => {
    for (const [prev, next, pack] of [
      [0.3333, 0.6666, 3],
      [1.1, 2.7, 7],
      [5.05, 5.15, 20],
    ]) {
      expect(Number.isInteger(qtyChangeInPieces(prev, next, pack))).toBe(true);
    }
  });

  it("בלי גודל אריזה ההפרש הוא ביחידות הראשיות", () => {
    expect(qtyChangeInPieces(2, 5, 0)).toBe(3);
  });
});

describe("תצוגת השינוי ביומן", () => {
  it("תוספת של בודדים בלבד", () => {
    expect(formatQtyChangeWithPieces(2, 2.5, "ארגז", 24)).toBe("+12 יח׳");
  });

  it("תוספת של אריזות שלמות", () => {
    expect(formatQtyChangeWithPieces(2, 4, "ארגז", 24)).toBe("+2 ארגז");
  });

  it("תוספת מעורבת — אריזות + בודדים", () => {
    expect(formatQtyChangeWithPieces(0, 1.25, "ארגז", 24)).toBe("+1 ארגז + 6 יח׳");
  });

  it("הפחתה מוצגת עם מינוס", () => {
    expect(formatQtyChangeWithPieces(4, 2, "ארגז", 24)).toBe("-2 ארגז");
    expect(formatQtyChangeWithPieces(2.5, 2, "ארגז", 24)).toBe("-12 יח׳");
  });

  it("בלי שינוי מוצג «0»", () => {
    expect(formatQtyChangeWithPieces(3, 3, "ארגז", 24)).toBe("0");
    expect(formatQtyChangeWithPieces(3, 3, "יחידות", null)).toBe("0");
  });

  it("יחידת בסיס מוצגת כמספר פשוט", () => {
    expect(formatQtyChangeWithPieces(5, 12, "יחידות", null)).toBe("+7");
    expect(formatQtyChangeWithPieces(12, 5, "יחידות", null)).toBe("-7");
  });

  it("מוצר בלי גודל אריזה מוצג כמספר, כולל שבר", () => {
    expect(formatQtyChangeWithPieces(1, 2.5, "ק״ג", null)).toBe("+1.5");
  });

  it("לעולם אין עשרוניות בתצוגת אריזות", () => {
    const label = formatQtyChangeWithPieces(0, 1.125, "ארגז", 8);
    expect(label).toBe("+1 ארגז + 1 יח׳");
    expect(label).not.toContain(".");
  });

  it("שינוי גדול מאוד עדיין קריא", () => {
    expect(formatQtyChangeWithPieces(0, 100, "ארגז", 6)).toBe("+100 ארגז");
  });

  it("יחידת מידה ריקה לא משאירה רווחים מיותרים", () => {
    expect(formatQtyChangeWithPieces(0, 2, "  ", 6)).toBe("+2");
  });
});

describe("עקביות בין התצוגות", () => {
  it("הכמות שמוצגת אחרי השינוי תואמת לכמות + ההפרש", () => {
    const before = 2;
    const after = 3.5;
    const pack = 24;

    const deltaPieces = qtyChangeInPieces(before, after, pack);
    const afterPieces = Math.round(mainUnitToPieces(before, pack)) + deltaPieces;

    expect(afterPieces).toBe(Math.round(mainUnitToPieces(after, pack)));
    expect(piecesToMainUnit(afterPieces, pack)).toBe(after);
  });

  it("הפיצול לאריזות תואם לתווית שמוצגת", () => {
    const { packages, pieces } = splitPackageQty(3.25, 24);
    expect(formatQtyWithPieces(3.25, "ארגז", 24)).toBe(`${packages} ארגז + ${pieces} יח׳`);
  });

  it("סדרת שינויים קטנים לא צוברת סחף", () => {
    let qty = 0;
    for (let i = 0; i < 24; i++) {
      const next = piecesToMainUnit(Math.round(mainUnitToPieces(qty, 24)) + 1, 24);
      expect(qtyChangeInPieces(qty, next, 24)).toBe(1);
      qty = next;
    }
    expect(qty).toBe(1); // 24 בודדים = ארגז אחד בדיוק
  });
});
