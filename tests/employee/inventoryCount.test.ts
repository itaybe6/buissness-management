/**
 * ממשק העובד — ספירת מלאי.
 *
 * העובד סופר בשטח ביחידות בודדות ("11 בקבוקים"), אבל המערכת שומרת ביחידת
 * המידה הראשית ("ארגז"). ההמרה הדו-כיוונית הזו היא המקום הכי נפוץ לטעויות
 * מלאי, ולכן היא מכוסה כאן לעומק — כולל מקרים של הגדרה חסרה.
 */
import { describe, expect, it } from "vitest";
import {
  BASE_UNIT,
  INVENTORY_UNITS,
  formatItemQty,
  formatQtyWithPieces,
  hasPieceBreakdown,
  isTrackedLowStock,
  itemHasPieces,
  itemWarehouseQty,
  mainUnitToPieces,
  pieceUnitLabel,
  piecesToMainUnit,
  splitPackageQty,
} from "@/api/inventory";
import { WAREHOUSE, makeItemWithQty, makeWarehouseStock } from "../helpers/factories";

describe("מתי אפשר להזין יחידות בודדות", () => {
  it("רק גודל אריזה מפורש יוצר פירוק — לא שם היחידה", () => {
    expect(hasPieceBreakdown(24)).toBe(true);
    expect(hasPieceBreakdown(null)).toBe(false);
    expect(hasPieceBreakdown(0)).toBe(false);
    expect(hasPieceBreakdown(undefined)).toBe(false);
  });

  it("מוצר שהיחידה שלו היא הפריט עצמו לא מקבל שכבה שנייה", () => {
    expect(itemHasPieces(makeItemWithQty({ unit: "בקבוק", units_per_package: null }))).toBe(false);
    expect(itemHasPieces(makeItemWithQty({ unit: "ק״ג", units_per_package: null }))).toBe(false);
    expect(itemHasPieces(makeItemWithQty({ unit: "ליטר", units_per_package: null }))).toBe(false);
  });

  it("מארז עם גודל אריזה כן מקבל שכבה שנייה", () => {
    const crate = makeItemWithQty({ unit: "ארגז", units_per_package: 24, piece_unit: "בקבוק" });
    expect(itemHasPieces(crate)).toBe(true);
  });

  it("שם הפריט הבודד נופל ליחידת הבסיס כשלא הוגדר", () => {
    expect(pieceUnitLabel("בקבוק")).toBe("בקבוק");
    expect(pieceUnitLabel(null)).toBe(BASE_UNIT);
    expect(pieceUnitLabel("   ")).toBe(BASE_UNIT);
  });

  it("כל יחידות המידה בקטלוג ייחודיות", () => {
    const values = INVENTORY_UNITS.map((u) => u.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toContain(BASE_UNIT);
  });
});

describe("המרה בין בודדים ליחידת המידה", () => {
  it("24 בודדים בארגז של 24 = ארגז אחד", () => {
    expect(piecesToMainUnit(24, 24)).toBe(1);
  });

  it("12 בודדים בארגז של 24 = חצי ארגז", () => {
    expect(piecesToMainUnit(12, 24)).toBe(0.5);
  });

  it("שבר מעוגל לארבע ספרות אחרי הנקודה", () => {
    expect(piecesToMainUnit(1, 3)).toBe(0.3333);
  });

  it("אריזה של אפס או שלילית מחזירה את הבודדים כמו שהם", () => {
    expect(piecesToMainUnit(11, 0)).toBe(11);
    expect(piecesToMainUnit(11, -5)).toBe(11);
  });

  it("המרה חזרה לבודדים", () => {
    expect(mainUnitToPieces(2, 24)).toBe(48);
    expect(mainUnitToPieces(0.5, 24)).toBe(12);
    expect(mainUnitToPieces(7, 0)).toBe(7);
  });

  it("הלוך-חזור שומר על הכמות המקורית", () => {
    for (const pieces of [1, 7, 23, 24, 25, 100]) {
      expect(mainUnitToPieces(piecesToMainUnit(pieces, 24), 24)).toBe(pieces);
    }
  });
});

describe("פיצול לאריזות + בודדים", () => {
  it("2.5 ארגזים של 6 = 2 ארגזים + 3 בודדים", () => {
    expect(splitPackageQty(2.5, 6)).toEqual({ packages: 2, pieces: 3, totalPieces: 15 });
  });

  it("כמות שלמה נותנת אפס בודדים", () => {
    expect(splitPackageQty(3, 24)).toEqual({ packages: 3, pieces: 0, totalPieces: 72 });
  });

  it("פחות מאריזה אחת = רק בודדים", () => {
    expect(splitPackageQty(0.25, 24)).toEqual({ packages: 0, pieces: 6, totalPieces: 6 });
  });

  it("אפס נשאר אפס", () => {
    expect(splitPackageQty(0, 24)).toEqual({ packages: 0, pieces: 0, totalPieces: 0 });
  });

  it("בלי גודל אריזה — הכול נספר כאריזות", () => {
    expect(splitPackageQty(9, 0)).toEqual({ packages: 9, pieces: 0, totalPieces: 9 });
  });

  it("שבר לא עגול מעוגל לבודד הקרוב ולא יוצר חצי בקבוק", () => {
    const { packages, pieces, totalPieces } = splitPackageQty(0.3333, 3);
    expect(Number.isInteger(packages)).toBe(true);
    expect(Number.isInteger(pieces)).toBe(true);
    expect(totalPieces).toBe(1);
  });
});

describe("תצוגת כמות לעובד", () => {
  it("אריזות + בודדים", () => {
    expect(formatQtyWithPieces(2.5, "ארגז", 6)).toBe("2 ארגז + 3 יחידות");
  });

  it("הפריט הבודד מוצג בשם שהמנהל נתן לו", () => {
    const crate = makeItemWithQty({ unit: "ארגז", units_per_package: 6, piece_unit: "בקבוק" });
    expect(formatItemQty(crate, 2.5)).toBe("2 ארגז + 3 בקבוק");
  });

  it("מוצר שהוא פריט בודד מוצג בשורה אחת בלי שכבה שנייה", () => {
    const bottle = makeItemWithQty({ unit: "בקבוק", units_per_package: null });
    expect(formatItemQty(bottle, 7)).toBe("7 בקבוק");
  });

  it("אריזות שלמות בלבד", () => {
    expect(formatQtyWithPieces(3, "ארגז", 24)).toBe("3 ארגז");
  });

  it("בודדים בלבד", () => {
    expect(formatQtyWithPieces(0.25, "ארגז", 24)).toBe("6 יחידות");
  });

  it("אפס מוצג עם יחידת המידה", () => {
    expect(formatQtyWithPieces(0, "ארגז", 24)).toBe("0 ארגז");
  });

  it("יחידת בסיס מוצגת כמות שהיא בלי פירוק", () => {
    expect(formatQtyWithPieces(11, "יחידות", null)).toBe("11 יחידות");
  });

  it("בלי גודל אריזה מוצגת הכמות הגולמית", () => {
    expect(formatQtyWithPieces(2.5, "ארגז", null)).toBe("2.5 ארגז");
  });

  it("בלי יחידת מידה מוצג המספר בלבד", () => {
    expect(formatQtyWithPieces(4, null, null)).toBe("4");
  });

  it("רווחים ביחידת המידה לא מייצרים תצוגה שבורה", () => {
    expect(formatQtyWithPieces(4, "   ", null)).toBe("4");
  });
});

describe("מלאי לפי מחסן והתראת מינימום", () => {
  it("שולף כמות של מחסן מסוים", () => {
    const item = makeItemWithQty({
      warehouse_stocks: [
        makeWarehouseStock({ warehouse_id: WAREHOUSE.main, quantity: 8 }),
        makeWarehouseStock({ warehouse_id: WAREHOUSE.bar, warehouse_name: "מחסן בר", quantity: 3 }),
      ],
    });
    expect(itemWarehouseQty(item, WAREHOUSE.main)).toBe(8);
    expect(itemWarehouseQty(item, WAREHOUSE.bar)).toBe(3);
  });

  it("מחסן בלי ספירה מחזיר אפס ולא undefined", () => {
    const item = makeItemWithQty({ warehouse_stocks: [] });
    expect(itemWarehouseQty(item, WAREHOUSE.main)).toBe(0);
  });

  it("כמות מתחת או שווה למינימום מסומנת כחוסר", () => {
    expect(isTrackedLowStock(makeItemWithQty({ min_quantity: 5, current_qty: 4 }))).toBe(true);
    expect(isTrackedLowStock(makeItemWithQty({ min_quantity: 5, current_qty: 5 }))).toBe(true);
    expect(isTrackedLowStock(makeItemWithQty({ min_quantity: 5, current_qty: 6 }))).toBe(false);
  });

  it("מוצר בלי מינימום מוגדר לא מתריע גם כשהוא באפס", () => {
    expect(isTrackedLowStock(makeItemWithQty({ min_quantity: 0, current_qty: 0 }))).toBe(false);
  });
});
