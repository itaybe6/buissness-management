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
  ATTENDANCE_RADIUS_M,
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
import {
  TPL,
  USER,
  makeAssignment,
  makeAttendance,
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
  it("רדיוס ברירת המחדל הוא 15 מטר", () => {
    expect(ATTENDANCE_RADIUS_M).toBe(15);
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
