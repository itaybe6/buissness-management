/**
 * ממשק העובד — שעון הנוכחות.
 *
 * מכסה את שלושת הדברים שהעובד באמת חווה: הטיימר שרץ על המסך, השאלה אם
 * ההחתמה שלו נופלת בתוך חלון המשמרת (כולל משמרת לילה שחוצה חצות), וכמה
 * שעות נספרו לו בפועל.
 */
import { describe, expect, it } from "vitest";
import { formatShiftElapsed } from "@/hooks/useShiftPunch";
import {
  ATTENDANCE_GEOFENCE_EXEMPT_ROLE_OPTIONS,
  ATTENDANCE_RADIUS_DEFAULT_M,
  ATTENDANCE_RADIUS_MIN_M,
  clampAttendanceRadius,
} from "@/lib/constants";
import {
  attendanceBelongsToTodayFeed,
  calendarDayWindow,
  filterAttendanceForCalendarDay,
  filterAttendanceForTodayShift,
  filterAttendanceNearReportDate,
  filterEmployeeAttendanceGroups,
  getAttendanceHoursInShiftWindow,
  groupAttendanceByEmployee,
  hoursOverlappingWindow,
  punchOverlapsAbsoluteWindow,
  punchOverlapsShiftOnDate,
  punchOverlapsShiftWindow,
  shiftWindowForDate,
  totalPunchDurationHours,
} from "@/lib/attendanceFeed";
import { attemptClockIn, clockInSuccessText, targetAccuracyFor } from "@/lib/attendancePunch";
import { GeolocationFailure, geolocationFailureMessage, getBestPosition } from "@/lib/geolocation";
import {
  TPL,
  USER,
  makeAssignment,
  makeAttendance,
  makeBusiness,
  makeOpenAttendance,
  shiftTemplates,
} from "../helpers/factories";
import type { UserRole } from "@/types/database";

const DATE = "2026-07-08";
const morning = shiftTemplates.find((t) => t.id === TPL.morning)!;
const evening = shiftTemplates.find((t) => t.id === TPL.evening)!;
const night = shiftTemplates.find((t) => t.id === TPL.night)!;

const HOUR = 3.6e6;

describe("טיימר המשמרת שרץ על מסך העובד", () => {
  it("מציג HH:MM:SS מרופד באפסים", () => {
    expect(formatShiftElapsed(0)).toBe("00:00:00");
    expect(formatShiftElapsed(61_000)).toBe("00:01:01");
    expect(formatShiftElapsed(3 * HOUR + 25 * 60_000 + 9_000)).toBe("03:25:09");
  });

  it("שעון שלילי (הפרש שעון בין מכשיר לשרת) מתאפס במקום להציג מינוס", () => {
    expect(formatShiftElapsed(-5000)).toBe("00:00:00");
  });

  it("משמרת ארוכה מ-24 שעות ממשיכה לספור שעות ולא מתאפסת", () => {
    expect(formatShiftElapsed(30 * HOUR)).toBe("30:00:00");
  });

  it("מילישניות חלקיות נחתכות כלפי מטה ולא מקפיצות שנייה", () => {
    expect(formatShiftElapsed(1999)).toBe("00:00:01");
  });
});

describe("גיאופנס — הגדרות ההחתמה", () => {
  it("רדיוס ברירת המחדל הוא 100 מטר — מתחת לזה רעש ה-GPS חוסם עובדים שנמצאים בעסק", () => {
    expect(ATTENDANCE_RADIUS_DEFAULT_M).toBe(100);
  });

  it("רדיוס שהמנהל מזין נחתך לטווח שפוי", () => {
    expect(clampAttendanceRadius(250)).toBe(250);
    expect(clampAttendanceRadius(1)).toBe(ATTENDANCE_RADIUS_MIN_M);
    expect(clampAttendanceRadius(99999)).toBe(5000);
    expect(clampAttendanceRadius(120.6)).toBe(121);
  });

  it("רשימת הפטורים כוללת רק תפקידים אמיתיים ובלי כפילויות", () => {
    const valid: UserRole[] = [
      "super_admin",
      "manager",
      "shift_manager",
      "office_manager",
      "employee",
      "maintenance",
      "event_manager",
    ];
    for (const role of ATTENDANCE_GEOFENCE_EXEMPT_ROLE_OPTIONS) {
      expect(valid).toContain(role);
    }
    expect(new Set(ATTENDANCE_GEOFENCE_EXEMPT_ROLE_OPTIONS).size).toBe(
      ATTENDANCE_GEOFENCE_EXEMPT_ROLE_OPTIONS.length,
    );
  });

  it("סופר אדמין אינו אופציה לפטור — הוא לא מחתים שעון בעסק", () => {
    expect(ATTENDANCE_GEOFENCE_EXEMPT_ROLE_OPTIONS).not.toContain("super_admin");
  });
});

// ---------------------------------------------------------------------------
// איך העובד מקבל מיקום מהמכשיר, ומה ההחתמה עושה עם מה שהתקבל
// ---------------------------------------------------------------------------

interface ScriptedFix {
  afterMs: number;
  coords?: { lat: number; lng: number; accuracy: number };
  errorCode?: 1 | 2 | 3;
}

/** דפדפן מזויף שמזרים תיקוני מיקום לפי תסריט — כמו GPS שמתחמם. */
function fakeGeolocation(script: ScriptedFix[]) {
  const cleared: number[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  const geolocation = {
    watchPosition(
      onFix: (pos: { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number }) => void,
      onError?: (err: { code: number; message: string; PERMISSION_DENIED: number; POSITION_UNAVAILABLE: number; TIMEOUT: number }) => void,
    ) {
      for (const step of script) {
        timers.push(
          setTimeout(() => {
            if (step.coords) {
              onFix({
                coords: { latitude: step.coords.lat, longitude: step.coords.lng, accuracy: step.coords.accuracy },
                timestamp: Date.now(),
              });
            } else if (step.errorCode && onError) {
              onError({
                code: step.errorCode,
                message: "fake",
                PERMISSION_DENIED: 1,
                POSITION_UNAVAILABLE: 2,
                TIMEOUT: 3,
              });
            }
          }, step.afterMs),
        );
      }
      return 7;
    },
    clearWatch(id: number) {
      cleared.push(id);
      for (const t of timers) clearTimeout(t);
    },
  };
  return { geolocation, cleared };
}

describe("קבלת מיקום מהדפדפן", () => {
  const opts = { secureContext: true, maxWaitMs: 120 };

  it("התיקון הראשון הוא הגס — נבחר התיקון המדויק שמגיע אחריו", async () => {
    const { geolocation, cleared } = fakeGeolocation([
      { afterMs: 1, coords: { lat: 32.1, lng: 34.8, accuracy: 2400 } },
      { afterMs: 20, coords: { lat: 32.0853, lng: 34.7818, accuracy: 12 } },
    ]);
    const fix = await getBestPosition({ ...opts, targetAccuracyM: 30, geolocation });
    expect(fix.accuracyM).toBe(12);
    expect(fix.lat).toBeCloseTo(32.0853, 4);
    expect(cleared).toContain(7); // לא משאירים watch פתוח שמרוקן סוללה
  });

  it("כשאף תיקון לא מגיע לרמת הדיוק המבוקשת — מוחזר הטוב מביניהם", async () => {
    const { geolocation } = fakeGeolocation([
      { afterMs: 1, coords: { lat: 32.1, lng: 34.8, accuracy: 900 } },
      { afterMs: 10, coords: { lat: 32.09, lng: 34.79, accuracy: 300 } },
    ]);
    const fix = await getBestPosition({ ...opts, targetAccuracyM: 20, geolocation });
    expect(fix.accuracyM).toBe(300);
  });

  it("מדידה גסה שלא משתפרת לא מחזיקה את העובד מול ספינר עד סוף התקציב", async () => {
    const { geolocation } = fakeGeolocation([{ afterMs: 1, coords: { lat: 32.1, lng: 34.8, accuracy: 2400 } }]);
    const started = Date.now();
    const fix = await getBestPosition({
      secureContext: true,
      maxWaitMs: 5000,
      graceAfterFirstFixMs: 40,
      targetAccuracyM: 30,
      geolocation,
    });
    expect(fix.accuracyM).toBe(2400);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("סירוב הרשאה נכשל מיד עם הודעה שאומרת מה לעשות", async () => {
    const { geolocation } = fakeGeolocation([{ afterMs: 1, errorCode: 1 }]);
    await expect(getBestPosition({ ...opts, geolocation })).rejects.toMatchObject({
      code: "permission_denied",
    });
    const failure = await getBestPosition({ ...opts, geolocation }).catch((e) => e);
    expect(geolocationFailureMessage(failure)).toContain("הרשאת מיקום");
  });

  it("שגיאה חולפת בזמן שה-GPS מתחמם לא מבטלת תיקון שמגיע אחריה", async () => {
    const { geolocation } = fakeGeolocation([
      { afterMs: 1, errorCode: 2 },
      { afterMs: 15, coords: { lat: 32.0853, lng: 34.7818, accuracy: 18 } },
    ]);
    const fix = await getBestPosition({ ...opts, targetAccuracyM: 30, geolocation });
    expect(fix.accuracyM).toBe(18);
  });

  it("כשלא מגיע כלום בזמן שהוקצב — כשל timeout, לא המתנה אינסופית", async () => {
    const { geolocation } = fakeGeolocation([]);
    await expect(getBestPosition({ ...opts, geolocation })).rejects.toMatchObject({ code: "timeout" });
  });

  it("חיבור לא מאובטח (http) נחסם בהסבר, לא בשגיאה סתומה", async () => {
    const { geolocation } = fakeGeolocation([{ afterMs: 1, coords: { lat: 32, lng: 34, accuracy: 5 } }]);
    const failure = await getBestPosition({ maxWaitMs: 50, secureContext: false, geolocation }).catch((e) => e);
    expect(failure.code).toBe("insecure_context");
    expect(geolocationFailureMessage(failure)).toContain("https");
  });
});

describe("החתמת כניסה מקצה לקצה", () => {
  const BIZ_LAT = 32.0853;
  const BIZ_LNG = 34.7818;
  const business = makeBusiness({
    attendance_geofence_enabled: true,
    location_lat: BIZ_LAT,
    location_lng: BIZ_LNG,
    location_radius_m: 100,
  });

  const fixedPosition = (lat: number, lng: number, accuracyM: number) => async () => ({
    lat,
    lng,
    accuracyM,
    takenAt: Date.now(),
  });

  it("עובד שעומד בעסק עם נייד — נכנס, וההודעה מציינת את המרחק", async () => {
    const { decision, position } = await attemptClockIn({
      business,
      role: "employee",
      getPosition: fixedPosition(BIZ_LAT + 0.0003, BIZ_LNG, 15),
    });
    expect(decision).toMatchObject({ allowed: true, reason: "inside_radius" });
    expect(position?.accuracyM).toBe(15);
    expect(clockInSuccessText(decision)).toContain("מהעסק");
  });

  it("מנהל שפתח את המסך במחשב מקבל הסבר על המדידה, לא האשמה שהוא בבית", async () => {
    const { decision } = await attemptClockIn({
      business,
      role: "employee",
      getPosition: fixedPosition(BIZ_LAT + 0.0332, BIZ_LNG, 3000),
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe("low_accuracy");
    expect(decision.message).toContain("מהנייד");
  });

  it("עובד שבאמת רחוק נחסם עם המרחק והרדיוס", async () => {
    const { decision } = await attemptClockIn({
      business,
      role: "employee",
      getPosition: fixedPosition(BIZ_LAT + 0.02, BIZ_LNG, 20),
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe("outside_radius");
    expect(decision.message).toContain("מחוץ לרדיוס (100 מ׳)");
  });

  it("תפקיד פטור לא מבקש מיקום מהמכשיר בכלל", async () => {
    let asked = false;
    const exempt = { ...business, attendance_geofence_exempt_roles: ["shift_manager" as const] };
    const { decision, position } = await attemptClockIn({
      business: exempt,
      role: "shift_manager",
      getPosition: async () => {
        asked = true;
        throw new Error("לא אמור להיקרא");
      },
    });
    expect(asked).toBe(false);
    expect(decision).toMatchObject({ allowed: true, reason: "exempt" });
    expect(position).toBeNull();
    expect(clockInSuccessText(decision)).toContain("ללא בדיקת מיקום");
  });

  it("גיאופנס דלוק בלי כתובת — לא מטריחים את העובד בהרשאת מיקום", async () => {
    let asked = false;
    const { decision } = await attemptClockIn({
      business: { ...business, location_lat: null, location_lng: null },
      role: "employee",
      getPosition: async () => {
        asked = true;
        throw new Error("לא אמור להיקרא");
      },
    });
    expect(asked).toBe(false);
    expect(decision).toMatchObject({ allowed: false, reason: "missing_business_location" });
  });

  it("כשל באיתור מיקום מגיע לעובד כהודעה מובנת", async () => {
    const { decision } = await attemptClockIn({
      business,
      role: "employee",
      getPosition: async () => {
        throw new GeolocationFailure("permission_denied", "denied");
      },
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe("no_position");
    expect(decision.message).toContain("הרשאת מיקום");
  });

  it("הדיוק המבוקש נגזר מהרדיוס — אין טעם לחכות לדיוק של מטר", () => {
    expect(targetAccuracyFor(20)).toBe(20);
    expect(targetAccuracyFor(100)).toBe(50);
    expect(targetAccuracyFor(2000)).toBe(50);
  });
});

describe("חלון המשמרת על תאריך קלנדרי", () => {
  it("משמרת בוקר מתחילה ומסתיימת באותו יום", () => {
    const w = shiftWindowForDate(DATE, morning);
    expect(new Date(w.startMs).getHours()).toBe(8);
    expect(new Date(w.endMs).getHours()).toBe(16);
    expect(new Date(w.endMs).getDate()).toBe(8);
  });

  it("משמרת לילה נמתחת ליום שאחרי", () => {
    const w = shiftWindowForDate(DATE, night);
    expect(new Date(w.startMs).getDate()).toBe(8);
    expect(new Date(w.endMs).getDate()).toBe(9);
    expect((w.endMs - w.startMs) / HOUR).toBe(8);
  });

  it("משמרת שמסתיימת בדיוק בשעת ההתחלה נחשבת 24 שעות ולא אפס", () => {
    const round = { ...morning, start_time: "08:00", end_time: "08:00" };
    const w = shiftWindowForDate(DATE, round);
    expect((w.endMs - w.startMs) / HOUR).toBe(24);
  });

  it("חלון היום הקלנדרי הוא חצות עד חצות", () => {
    const w = calendarDayWindow(DATE);
    expect((w.endMs - w.startMs) / HOUR).toBe(24);
    expect(new Date(w.startMs).getHours()).toBe(0);
  });
});

describe("האם ההחתמה נופלת בתוך המשמרת", () => {
  it("החתמת ערב רגילה נמצאת בחלון הערב", () => {
    const punch = makeAttendance({ date: DATE, from: 18.25, to: 22.75 });
    expect(punchOverlapsShiftOnDate(punch.clock_in!, punch.clock_out, DATE, evening)).toBe(true);
  });

  it("החתמת בוקר לא נחשבת למשמרת ערב", () => {
    const punch = makeAttendance({ date: DATE, from: 8, to: 15 });
    expect(punchOverlapsShiftOnDate(punch.clock_in!, punch.clock_out, DATE, evening)).toBe(false);
  });

  it("החתמת לילה שחוצה חצות נכללת במשמרת הלילה של אותו ערב", () => {
    const punch = makeAttendance({ date: DATE, from: 23, to: 1.5 });
    expect(punch.clock_out).toBe("2026-07-09T01:30:00");
    expect(punchOverlapsShiftOnDate(punch.clock_in!, punch.clock_out, DATE, night)).toBe(true);
  });

  it("נגיעה בקצה בלבד לא נחשבת חפיפה (יצא בדיוק כשהמשמרת התחילה)", () => {
    const punch = makeAttendance({ date: DATE, from: 14, to: 18 });
    expect(punchOverlapsShiftOnDate(punch.clock_in!, punch.clock_out, DATE, evening)).toBe(false);
  });

  it("דקה אחת של חפיפה מספיקה", () => {
    const punch = makeAttendance({ date: DATE, from: 14, to: 18 + 1 / 60 });
    expect(punchOverlapsShiftOnDate(punch.clock_in!, punch.clock_out, DATE, evening)).toBe(true);
  });

  it("החתמה פתוחה נמדדת מול «עכשיו»", () => {
    const punch = makeOpenAttendance(USER.employee, DATE, 18);
    const stillInside = new Date(`${DATE}T20:00:00`).getTime();
    expect(punchOverlapsAbsoluteWindow(punch.clock_in!, null, shiftWindowForDate(DATE, evening), stillInside)).toBe(true);
  });

  it("החתמה של יום אחר לא נספרת למשמרת של תאריך הדוח", () => {
    const punch = makeAttendance({ date: "2026-07-09", from: 18, to: 22 });
    expect(punchOverlapsShiftOnDate(punch.clock_in!, punch.clock_out, DATE, evening)).toBe(false);
  });

  it("בדיקת חלון לפי שעון בלבד מזהה גם משמרת לילה", () => {
    const punch = makeAttendance({ date: DATE, from: 23, to: 1.5 });
    expect(punchOverlapsShiftWindow(punch.clock_in!, punch.clock_out, night)).toBe(true);
  });
});

describe("כמה שעות נספרו לעובד", () => {
  it("סופר את החפיפה עם חלון המשמרת בלבד", () => {
    const punch = makeAttendance({ date: DATE, from: 17, to: 22 });
    const hours = getAttendanceHoursInShiftWindow([punch], USER.employee, shiftWindowForDate(DATE, evening));
    expect(hours).toBe(4); // 18:00–22:00
  });

  it("החתמה שלמה מחוץ לחלון נותנת אפס", () => {
    const punch = makeAttendance({ date: DATE, from: 8, to: 12 });
    expect(hoursOverlappingWindow(punch.clock_in!, punch.clock_out, shiftWindowForDate(DATE, evening))).toBe(0);
  });

  it("שתי החתמות באותה משמרת מצטברות", () => {
    const punches = [
      makeAttendance({ date: DATE, from: 18, to: 20 }),
      makeAttendance({ date: DATE, from: 21, to: 23 }),
    ];
    expect(getAttendanceHoursInShiftWindow(punches, USER.employee, shiftWindowForDate(DATE, evening))).toBe(4);
  });

  it("החתמה פתוחה לא נספרת בשעות (אין שעת יציאה)", () => {
    const punches = [makeAttendance({ date: DATE, from: 18, to: 20 }), makeOpenAttendance(USER.employee, DATE, 21)];
    expect(getAttendanceHoursInShiftWindow(punches, USER.employee, shiftWindowForDate(DATE, evening))).toBe(2);
  });

  it("שעות של עובד אחר לא נספרות", () => {
    const punches = [
      makeAttendance({ employeeId: USER.employee, date: DATE, from: 18, to: 22 }),
      makeAttendance({ employeeId: USER.employee2, date: DATE, from: 18, to: 23 }),
    ];
    expect(getAttendanceHoursInShiftWindow(punches, USER.employee, shiftWindowForDate(DATE, evening))).toBe(4);
  });

  it("סך משך ההחתמות מתעלם מחלון המשמרת", () => {
    const punches = [makeAttendance({ date: DATE, from: 17, to: 23.5 })];
    expect(totalPunchDurationHours(punches, USER.employee)).toBe(6.5);
  });

  it("רבע שעה מעוגל לשתי ספרות אחרי הנקודה", () => {
    const punch = makeAttendance({ date: DATE, from: 18, to: 18.25 });
    expect(getAttendanceHoursInShiftWindow([punch], USER.employee, shiftWindowForDate(DATE, evening))).toBe(0.25);
  });
});

describe("פיד הנוכחות של היום", () => {
  it("החתמה שהתחילה היום נכללת גם אם הסתיימה אחרי חצות", () => {
    const punch = makeAttendance({ date: DATE, from: 22, to: 2 });
    expect(attendanceBelongsToTodayFeed(punch, DATE)).toBe(true);
  });

  it("החתמה שהסתיימה היום אבל התחילה אתמול לא מוצגת שוב", () => {
    const punch = makeAttendance({ date: "2026-07-07", from: 22, to: 2 });
    expect(attendanceBelongsToTodayFeed(punch, DATE)).toBe(false);
  });

  it("החתמה פתוחה מאתמול נשארת גלויה (שכחו להחתים יציאה)", () => {
    const punch = makeOpenAttendance(USER.employee, "2026-07-07", 22);
    expect(attendanceBelongsToTodayFeed(punch, DATE)).toBe(true);
  });

  it("רשומה בלי שעת כניסה מסוננת החוצה", () => {
    const broken = { ...makeAttendance({ date: DATE, from: 18, to: 22 }), clock_in: null };
    expect(attendanceBelongsToTodayFeed(broken, DATE)).toBe(false);
  });

  it("כשמודול המשמרות כבוי מוצגות כל ההחתמות של היום", () => {
    const records = [
      makeAttendance({ employeeId: USER.employee, date: DATE, from: 8, to: 12 }),
      makeAttendance({ employeeId: USER.employee2, date: DATE, from: 18, to: 22 }),
    ];
    const out = filterAttendanceForTodayShift({
      records,
      today: DATE,
      assignments: [],
      templates: shiftTemplates,
      shiftsEnabled: false,
    });
    expect(out).toHaveLength(2);
  });

  it("כשיש שיבוצים — מוצגות רק החתמות שחופפות למשמרת של אותו עובד", () => {
    const records = [
      makeAttendance({ employeeId: USER.employee, date: DATE, from: 18, to: 22 }),
      makeAttendance({ employeeId: USER.employee2, date: DATE, from: 8, to: 12 }),
    ];
    const out = filterAttendanceForTodayShift({
      records,
      today: DATE,
      assignments: [
        makeAssignment({ employee_id: USER.employee, shift_date: DATE, shift_template_id: TPL.evening }),
        makeAssignment({ employee_id: USER.employee2, shift_date: DATE, shift_template_id: TPL.evening }),
      ],
      templates: shiftTemplates,
      shiftsEnabled: true,
    });
    expect(out.map((r) => r.employee_id)).toEqual([USER.employee]);
  });

  it("עובד ללא שיבוץ היום לא מופיע בפיד המשמרת", () => {
    const records = [makeAttendance({ employeeId: USER.employee3, date: DATE, from: 18, to: 22 })];
    const out = filterAttendanceForTodayShift({
      records,
      today: DATE,
      assignments: [makeAssignment({ employee_id: USER.employee, shift_date: DATE })],
      templates: shiftTemplates,
      shiftsEnabled: true,
    });
    expect(out).toEqual([]);
  });

  it("בלי שיבוצים בכלל היום — נופלים חזרה להצגת כל ההחתמות", () => {
    const records = [makeAttendance({ employeeId: USER.employee3, date: DATE, from: 18, to: 22 })];
    const out = filterAttendanceForTodayShift({
      records,
      today: DATE,
      assignments: [makeAssignment({ employee_id: USER.employee, shift_date: "2026-07-09" })],
      templates: shiftTemplates,
      shiftsEnabled: true,
    });
    expect(out).toHaveLength(1);
  });

  it("שיבוץ לתבנית שנמחקה לא חוסם את ההחתמה", () => {
    const records = [makeAttendance({ employeeId: USER.employee, date: DATE, from: 3, to: 5 })];
    const out = filterAttendanceForTodayShift({
      records,
      today: DATE,
      assignments: [makeAssignment({ employee_id: USER.employee, shift_date: DATE, shift_template_id: "tpl-deleted" })],
      templates: shiftTemplates,
      shiftsEnabled: true,
    });
    expect(out).toHaveLength(1);
  });
});

describe("טווח סינון סביב תאריך הדוח", () => {
  it("כולל החתמה מאתמול בערב שנמשכה לתאריך הדוח", () => {
    const punch = makeAttendance({ date: "2026-07-07", from: 22, to: 2 });
    expect(filterAttendanceNearReportDate([punch], DATE)).toHaveLength(1);
  });

  it("לא כולל החתמה משבוע שעבר", () => {
    const punch = makeAttendance({ date: "2026-07-01", from: 8, to: 16 });
    expect(filterAttendanceNearReportDate([punch], DATE)).toEqual([]);
  });

  it("סינון ליום קלנדרי תופס גם החתמה שנמשכה לתוך היום", () => {
    const punch = makeAttendance({ date: "2026-07-07", from: 22, to: 2 });
    expect(filterAttendanceForCalendarDay([punch], DATE)).toHaveLength(1);
  });
});

describe("קיבוץ נוכחות לתצוגה", () => {
  it("מאחד כמה החתמות של אותו עובד לכרטיס אחד, ממוינות לפי זמן", () => {
    const records = [
      makeAttendance({ employeeId: USER.employee, date: DATE, from: 18, to: 20, id: "b" }),
      makeAttendance({ employeeId: USER.employee, date: DATE, from: 8, to: 12, id: "a" }),
    ];
    const groups = groupAttendanceByEmployee(records);
    expect(groups).toHaveLength(1);
    expect(groups[0].sessions.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("עובד עם החתמה פתוחה מסומן «במשמרת» ועולה לראש הרשימה", () => {
    const records = [
      makeAttendance({ employeeId: USER.employee2, date: DATE, from: 8, to: 12 }),
      makeOpenAttendance(USER.employee, DATE, 18),
    ];
    const groups = groupAttendanceByEmployee(records);
    expect(groups[0].employeeId).toBe(USER.employee);
    expect(groups[0].onShift).toBe(true);
    expect(groups[1].onShift).toBe(false);
  });

  it("סינון «במשמרת» / «סיימו» מחזיר את הקבוצות הנכונות", () => {
    const groups = groupAttendanceByEmployee([
      makeOpenAttendance(USER.employee, DATE, 18),
      makeAttendance({ employeeId: USER.employee2, date: DATE, from: 8, to: 12 }),
    ]);
    expect(filterEmployeeAttendanceGroups(groups, "all")).toHaveLength(2);
    expect(filterEmployeeAttendanceGroups(groups, "on_shift").map((g) => g.employeeId)).toEqual([USER.employee]);
    expect(filterEmployeeAttendanceGroups(groups, "left").map((g) => g.employeeId)).toEqual([USER.employee2]);
  });

  it("רשימה ריקה מחזירה אפס קבוצות ולא קורסת", () => {
    expect(groupAttendanceByEmployee([])).toEqual([]);
  });
});
