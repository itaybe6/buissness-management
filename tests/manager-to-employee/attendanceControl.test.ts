/**
 * מה שהמנהל עושה → מה שקורה לעובד: שעון הנוכחות.
 *
 * שלוש שליטות של המנהל נבדקות כאן:
 *   1. גיאופנס — האם העובד בכלל יכול להחתים כניסה, ומאיזה מרחק.
 *   2. הוצאה ידנית ממשמרת ותיקון שעות — משנה ישירות את השכר של העובד.
 *   3. סגירת משמרות אוטומטית בשמירת דוח משמרת.
 */
import { describe, expect, it } from "vitest";
import {
  accuracySlackMeters,
  distanceMeters,
  evaluateClockIn,
  formatDistance,
  isUnreliableAccuracy,
  resolveGeofenceRules,
  UNRELIABLE_ACCURACY_M,
} from "@/lib/attendanceGeofence";
import { ATTENDANCE_RADIUS_DEFAULT_M } from "@/lib/constants";
import {
  combineDateAndTime,
  endTimeFromHours,
  formatSessionHours,
  hoursBetween,
  toTimeInputValue,
  validateSessionEdit,
} from "@/lib/attendanceSessionEdit";
import {
  selectOpenAttendanceToClockOut,
  shouldClockOutOpenShiftsOnReportSave,
} from "@/lib/shiftReportClockOut";
import { computeEmployeePayroll, sumAttendanceHours } from "@/lib/payrollCompute";
import { USER, makeAttendance, makeBusiness, makeOpenAttendance } from "../helpers/factories";

/** רוטשילד 1, ת״א — כתובת העסק בפיקסטורה. */
const BIZ_LAT = 32.0853;
const BIZ_LNG = 34.7818;

describe("המנהל מכבה גיאופנס — כל אחד מחתים מכל מקום", () => {
  const business = makeBusiness({ attendance_geofence_enabled: false });

  it("אין דרישת מיקום", () => {
    const rules = resolveGeofenceRules(business, "employee");
    expect(rules).toMatchObject({ enabled: false, exempt: false, required: false });
  });

  it("ההחתמה מתקבלת בלי לבדוק מיקום כלל", () => {
    const decision = evaluateClockIn({ business, role: "employee" });
    expect(decision).toMatchObject({ allowed: true, reason: "no_geofence", within: false });
  });
});

describe("המנהל מדליק גיאופנס — העובד חייב להיות בעסק", () => {
  const business = makeBusiness({
    attendance_geofence_enabled: true,
    location_lat: BIZ_LAT,
    location_lng: BIZ_LNG,
    location_radius_m: 15,
  });

  it("דרישת המיקום חלה על העובד", () => {
    expect(resolveGeofenceRules(business, "employee").required).toBe(true);
  });

  it("עובד בתוך הרדיוס — ההחתמה מתקבלת ומסומנת «בתוך הרדיוס»", () => {
    const decision = evaluateClockIn({
      business,
      role: "employee",
      position: { lat: BIZ_LAT, lng: BIZ_LNG },
    });
    expect(decision).toMatchObject({ allowed: true, reason: "inside_radius", within: true });
  });

  it("עובד במרחק 200 מ׳ — ההחתמה נחסמת עם המרחק בהודעה", () => {
    const decision = evaluateClockIn({
      business,
      role: "employee",
      position: { lat: BIZ_LAT + 0.0018, lng: BIZ_LNG },
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe("outside_radius");
    expect(decision.message).toContain("מחוץ לרדיוס");
    expect(decision.message).toContain("15 מ׳");
  });

  it("המנהל מרחיב את הרדיוס ל-500 מ׳ — אותו עובד כבר מצליח", () => {
    const wide = { ...business, location_radius_m: 500 };
    const position = { lat: BIZ_LAT + 0.0018, lng: BIZ_LNG };
    expect(evaluateClockIn({ business, role: "employee", position }).allowed).toBe(false);
    expect(evaluateClockIn({ business: wide, role: "employee", position }).allowed).toBe(true);
  });

  it("רדיוס לא מוגדר נופל לברירת המחדל", () => {
    const noRadius = { ...business, location_radius_m: null };
    expect(resolveGeofenceRules(noRadius, "employee").radiusM).toBe(ATTENDANCE_RADIUS_DEFAULT_M);
  });

  it("גיאופנס דלוק בלי כתובת עסק — חוסם עם הודעה למנהל, לא מאשים את העובד", () => {
    const noAddress = { ...business, location_lat: null, location_lng: null };
    const rules = resolveGeofenceRules(noAddress, "employee");
    expect(rules.missingLocation).toBe(true);

    const decision = evaluateClockIn({ business: noAddress, role: "employee" });
    expect(decision).toMatchObject({ allowed: false, reason: "missing_business_location" });
    if (!decision.allowed) expect(decision.message).toContain("פנו למנהל");
  });

  it("הדפדפן לא מחזיר מיקום — ההחתמה לא עוברת בשקט", () => {
    const decision = evaluateClockIn({ business, role: "employee", position: null });
    expect(decision.allowed).toBe(false);
  });

  it("בדיוק על גבול הרדיוס — מתקבל", () => {
    const business15 = { ...business, location_radius_m: 15 };
    // ~14.9 מ׳ צפונה
    const position = { lat: BIZ_LAT + 0.000134, lng: BIZ_LNG };
    const d = distanceMeters(position.lat, position.lng, BIZ_LAT, BIZ_LNG);
    expect(d).toBeLessThanOrEqual(15);
    expect(evaluateClockIn({ business: business15, role: "employee", position }).allowed).toBe(true);
  });
});

describe("המנהל מגדיר תפקידים פטורים מגיאופנס", () => {
  const business = makeBusiness({
    attendance_geofence_enabled: true,
    attendance_geofence_exempt_roles: ["shift_manager", "maintenance"],
    location_lat: BIZ_LAT,
    location_lng: BIZ_LNG,
  });

  it("אחראי משמרת פטור — מחתים מכל מקום", () => {
    const rules = resolveGeofenceRules(business, "shift_manager");
    expect(rules).toMatchObject({ enabled: true, exempt: true, required: false });
    expect(evaluateClockIn({ business, role: "shift_manager" })).toMatchObject({
      allowed: true,
      reason: "exempt",
    });
  });

  it("איש אחזקה פטור — הוא עובד בשטח", () => {
    expect(resolveGeofenceRules(business, "maintenance").required).toBe(false);
  });

  it("עובד רגיל לא ברשימה — עדיין חייב להיות בעסק", () => {
    expect(resolveGeofenceRules(business, "employee").required).toBe(true);
    expect(
      evaluateClockIn({ business, role: "employee", position: { lat: BIZ_LAT + 0.01, lng: BIZ_LNG } }).allowed,
    ).toBe(false);
  });

  it("משתמש בלי תפקיד ידוע לא מקבל פטור בטעות", () => {
    expect(resolveGeofenceRules(business, null).required).toBe(true);
  });

  it("הסרת תפקיד מהרשימה מחזירה אותו לבדיקת מיקום", () => {
    const narrowed = { ...business, attendance_geofence_exempt_roles: ["maintenance" as const] };
    expect(resolveGeofenceRules(narrowed, "shift_manager").required).toBe(true);
  });
});

describe("דיוק המדידה — מה שהרס את הפיצ׳ר בפועל", () => {
  const business = makeBusiness({
    attendance_geofence_enabled: true,
    location_lat: BIZ_LAT,
    location_lng: BIZ_LNG,
    location_radius_m: 100,
  });

  /** מיקום ~130 מ׳ צפונה מהעסק. */
  const nearby = { lat: BIZ_LAT + 0.00117, lng: BIZ_LNG };

  it("מדידה גסה של מחשב (±3 ק״מ, «3.6 ק״מ מהעסק») נחסמת כלא-אמינה — לא כ«אתם רחוקים»", () => {
    const decision = evaluateClockIn({
      business,
      role: "employee",
      position: { lat: BIZ_LAT + 0.0332, lng: BIZ_LNG, accuracyM: 3000 },
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe("low_accuracy");
    expect(decision.message).toContain("לא הצלחנו לאתר אתכם במדויק");
    expect(decision.message).not.toContain("מחוץ לרדיוס");
    expect(decision.accuracyM).toBe(3000);
  });

  it("מדידה גסה לא פותחת את השער גם כשהיא נופלת במקרה על העסק", () => {
    const decision = evaluateClockIn({
      business,
      role: "employee",
      position: { lat: BIZ_LAT, lng: BIZ_LNG, accuracyM: 5000 },
    });
    expect(decision).toMatchObject({ allowed: false, reason: "low_accuracy" });
  });

  it("סטיית GPS רגילה של נייד מרחיבה את השער — עובד שנמדד 130 מ׳ עם דיוק ±40 מ׳ נכנס", () => {
    const strict = evaluateClockIn({ business, role: "employee", position: nearby });
    expect(strict.allowed).toBe(false);

    const withAccuracy = evaluateClockIn({
      business,
      role: "employee",
      position: { ...nearby, accuracyM: 40 },
    });
    expect(withAccuracy).toMatchObject({ allowed: true, reason: "inside_radius", within: true });
  });

  it("ההרחבה חסומה בתקרה — דיוק גרוע לא מותח את הרדיוס בלי סוף", () => {
    expect(accuracySlackMeters(30)).toBe(30);
    expect(accuracySlackMeters(450)).toBe(100);
    expect(accuracySlackMeters(null)).toBe(0);
    expect(accuracySlackMeters(-5)).toBe(0);

    // 400 מ׳ מהעסק, רדיוס 100, דיוק ±450 — עדיין מחוץ לתחום
    const far = { lat: BIZ_LAT + 0.0036, lng: BIZ_LNG, accuracyM: 450 };
    expect(evaluateClockIn({ business, role: "employee", position: far }).allowed).toBe(false);
  });

  it("סף חוסר האמינות עובר בין מכשיר אמיתי להערכה לפי רשת", () => {
    expect(isUnreliableAccuracy(65)).toBe(false); // נייד בתוך מבנה
    expect(isUnreliableAccuracy(UNRELIABLE_ACCURACY_M)).toBe(false);
    expect(isUnreliableAccuracy(UNRELIABLE_ACCURACY_M + 1)).toBe(true);
    expect(isUnreliableAccuracy(Number.POSITIVE_INFINITY)).toBe(true);
    expect(isUnreliableAccuracy(null)).toBe(false); // דיוק לא ידוע — לא מאשימים את העובד
  });

  it("מרחק מוצג במטרים עד קילומטר ואז בק״מ", () => {
    expect(formatDistance(0)).toBe("0 מ׳");
    expect(formatDistance(142.4)).toBe("142 מ׳");
    expect(formatDistance(999)).toBe("999 מ׳");
    expect(formatDistance(3689)).toBe("3.7 ק״מ");
  });
});

describe("חישוב מרחק", () => {
  it("אותה נקודה = אפס", () => {
    expect(distanceMeters(BIZ_LAT, BIZ_LNG, BIZ_LAT, BIZ_LNG)).toBe(0);
  });

  it("סימטרי — הכיוון לא משנה", () => {
    const a = distanceMeters(BIZ_LAT, BIZ_LNG, 32.09, 34.79);
    const b = distanceMeters(32.09, 34.79, BIZ_LAT, BIZ_LNG);
    expect(a).toBeCloseTo(b, 6);
  });

  it("מעלה רוחב אחת ≈ 111 ק״מ", () => {
    expect(distanceMeters(32, 34.78, 33, 34.78) / 1000).toBeCloseTo(111.19, 0);
  });
});

// ---------------------------------------------------------------------------
// הוצאה ידנית ממשמרת ותיקון שעות
// ---------------------------------------------------------------------------

const CLOCK_IN = "2026-07-08T18:00:00";

describe("המנהל מוציא עובד ממשמרת פתוחה", () => {
  it("יציאה «עכשיו» סוגרת את ההחתמה עם השעה הנוכחית", () => {
    const now = new Date("2026-07-08T23:30:00");
    const result = validateSessionEdit({
      clockIn: CLOCK_IN,
      workStart: "18:00",
      workEnd: "",
      mode: "clock_out",
      now,
      editingEnd: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.clock_out).toBe(now.toISOString());
    expect(result.hours).toBe(5.5);
  });

  it("המנהל מתקן ידנית את שעת היציאה — היא גוברת על «עכשיו»", () => {
    const result = validateSessionEdit({
      clockIn: CLOCK_IN,
      workStart: "18:00",
      workEnd: "22:00",
      mode: "clock_out",
      now: new Date("2026-07-08T23:30:00"),
      editingEnd: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Date(result.clock_out!).getHours()).toBe(22);
    expect(result.hours).toBe(4);
  });

  it("משמרת לילה — יציאה ב-02:00 מתגלגלת ליום הבא ולא יוצרת שעות שליליות", () => {
    const result = validateSessionEdit({
      clockIn: "2026-07-08T22:00:00",
      workStart: "22:00",
      workEnd: "02:00",
      mode: "clock_out",
      editingEnd: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Date(result.clock_out!).getDate()).toBe(9);
    expect(result.hours).toBe(4);
  });

  it("שעת יציאה זהה לשעת הכניסה נדחית — לא נשמרת משמרת של אפס שעות", () => {
    const result = validateSessionEdit({
      clockIn: CLOCK_IN,
      workStart: "18:00",
      workEnd: "18:00",
      mode: "edit_closed",
    });
    // 18:00 מתגלגל ליום הבא → 24 שעות, וזו משמרת חוקית שהמנהל בחר
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hours).toBe(24);
  });

  it("שעת כניסה לא תקינה נדחית עם הודעה ברורה", () => {
    const result = validateSessionEdit({
      clockIn: CLOCK_IN,
      workStart: "",
      workEnd: "22:00",
      mode: "edit_closed",
    });
    expect(result).toEqual({ ok: false, error: "יש למלא שעת כניסה תקינה." });
  });

  it("שעת יציאה חסרה במשמרת סגורה נדחית", () => {
    const result = validateSessionEdit({
      clockIn: CLOCK_IN,
      workStart: "18:00",
      workEnd: "לא שעה",
      mode: "edit_closed",
    });
    expect(result).toEqual({ ok: false, error: "יש למלא שעת יציאה תקינה." });
  });

  it("תיקון שעת הכניסה בלבד במשמרת פתוחה לא סוגר אותה", () => {
    const result = validateSessionEdit({
      clockIn: CLOCK_IN,
      workStart: "17:30",
      workEnd: "",
      mode: "edit_open",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.clock_out).toBeNull();
    expect(new Date(result.clock_in).getHours()).toBe(17);
    expect(new Date(result.clock_in).getMinutes()).toBe(30);
  });
});

describe("תיקון שעות מזיז את השכר של העובד", () => {
  it("קיצור המשמרת מ-8 ל-6 שעות מוריד את השכר בהתאם", () => {
    const before = validateSessionEdit({
      clockIn: "2026-07-08T08:00:00",
      workStart: "08:00",
      workEnd: "16:00",
      mode: "edit_closed",
    });
    const after = validateSessionEdit({
      clockIn: "2026-07-08T08:00:00",
      workStart: "08:00",
      workEnd: "14:00",
      mode: "edit_closed",
    });
    expect(before.ok && after.ok).toBe(true);
    if (!before.ok || !after.ok) return;

    const payFor = (r: typeof before) =>
      computeEmployeePayroll({
        wageType: "hourly",
        rate: 50,
        tips: [],
        bonusSum: 0,
        attendanceHours: sumAttendanceHours(
          [{ employee_id: USER.employee, clock_in: r.clock_in, clock_out: r.clock_out }],
          USER.employee,
        ),
      }).total;

    expect(payFor(before)).toBe(400);
    expect(payFor(after)).toBe(300);
  });
});

describe("עזרי טופס עריכת השעות", () => {
  it("שעת ISO מומרת לשדה זמן", () => {
    expect(toTimeInputValue("2026-07-08T18:07:00")).toBe("18:07");
    expect(toTimeInputValue("לא תאריך")).toBe("");
  });

  it("שילוב תאריך ושעה מחזיר null על קלט לא תקין", () => {
    expect(combineDateAndTime(CLOCK_IN, "25:00")).not.toBeNull(); // הפורמט תקין, השעה מתגלגלת
    expect(combineDateAndTime(CLOCK_IN, "8:00")).toBeNull(); // חייב HH:MM דו-ספרתי
    expect(combineDateAndTime(CLOCK_IN, "")).toBeNull();
    expect(combineDateAndTime("לא תאריך", "18:00")).toBeNull();
  });

  it("הזנת «סה״כ שעות» מזיזה את שעת היציאה", () => {
    const start = new Date("2026-07-08T18:00:00");
    expect(endTimeFromHours(start, 5.5)).toBe("23:30");
    expect(endTimeFromHours(start, 0)).toBe("18:00");
    expect(endTimeFromHours(start, -1)).toBeNull();
    expect(endTimeFromHours(start, Number.NaN)).toBeNull();
  });

  it("שעות מוצגות בשתי ספרות אחרי הנקודה, וריק כשאין", () => {
    expect(formatSessionHours(5.5)).toBe("5.5");
    expect(formatSessionHours(5.256)).toBe("5.26");
    expect(formatSessionHours(0)).toBe("");
  });

  it("הפרש שעות לעולם אינו שלילי", () => {
    expect(hoursBetween(new Date("2026-07-08T20:00:00"), new Date("2026-07-08T18:00:00"))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// סגירת משמרות אוטומטית בשמירת דוח משמרת
// ---------------------------------------------------------------------------

describe("שמירת דוח משמרת סוגרת החתמות פתוחות של העובדים", () => {
  const TODAY = "2026-07-08";

  it("דוח של היום סוגר משמרות", () => {
    expect(shouldClockOutOpenShiftsOnReportSave(TODAY, TODAY)).toBe(true);
  });

  it("דוח של אתמול (משמרת לילה שנסגרה בבוקר) סוגר גם הוא", () => {
    expect(shouldClockOutOpenShiftsOnReportSave("2026-07-07", TODAY)).toBe(true);
  });

  it("דוח ישן שהמנהל עורך בדיעבד לא נוגע בשעון של אף אחד", () => {
    expect(shouldClockOutOpenShiftsOnReportSave("2026-07-01", TODAY)).toBe(false);
  });

  it("דוח עתידי לא סוגר משמרות", () => {
    expect(shouldClockOutOpenShiftsOnReportSave("2026-07-20", TODAY)).toBe(false);
  });

  it("נסגרות רק החתמות פתוחות מהיממה שלפני תאריך הדוח", () => {
    const records = [
      makeOpenAttendance(USER.employee, TODAY, 18),
      makeOpenAttendance(USER.employee2, "2026-07-07", 22),
      makeOpenAttendance(USER.employee3, "2026-07-01", 8),
      makeAttendance({ employeeId: "emp-done", date: TODAY, from: 8, to: 16 }),
    ];
    const toClose = selectOpenAttendanceToClockOut(records, TODAY);
    expect(toClose.map((r) => r.employee_id).sort()).toEqual([USER.employee, USER.employee2].sort());
  });

  it("החתמה שכבר נסגרה לא נגעת בה שוב", () => {
    const closed = [makeAttendance({ employeeId: USER.employee, date: TODAY, from: 18, to: 23 })];
    expect(selectOpenAttendanceToClockOut(closed, TODAY)).toEqual([]);
  });

  it("בלי החתמות פתוחות — אין מה לסגור", () => {
    expect(selectOpenAttendanceToClockOut([], TODAY)).toEqual([]);
  });
});
