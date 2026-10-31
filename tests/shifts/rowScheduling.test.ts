/**
 * שיבוץ במודל השורות — כל שורה מחזיקה עובד אחד ביום.
 *
 * נבדקים: איך נשמר שיבוץ לתא (הוספה / החלפה / תא ישן עם כמה עובדים),
 * איך נבנית הטבלה, רשימת העובדים בחלון השיבוץ (מיון, חסימות, יום חופש),
 * ועורך השורות (ולידציה, ימים, שעות שונות לפי יום, שכפול).
 */
import { describe, expect, it } from "vitest";
import {
  assignmentsByRowCell,
  buildTeamPrefMap,
  copyRowDays,
  initialRowDraft,
  nextRowSortOrder,
  pickerCandidates,
  planRowAssignment,
  rowDaysFor,
  rowHeadlineHours,
  rowPref,
  setRowDraftPerDay,
  validateRowDraft,
} from "@/lib/shiftRows";
import { GENERAL_SHIFT_SECTION_KEY } from "@/lib/shiftTemplates";
import type { ShiftTemplate } from "@/types/database";
import { DEPT, USER, makeAssignment, makePreference, makeProfile, makeShiftTemplate } from "../helpers/factories";

const MON = "2026-07-13";
const WEEK = ["2026-07-12", "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18"];

function row(id: string, name: string, start: string, end: string, over: Partial<ShiftTemplate> = {}) {
  return makeShiftTemplate({ id, name, start_time: start, end_time: end, department_id: DEPT.service, shift_key: null, ...over });
}

const host1 = row("host-1", "אירוח ערב", "19:30", "23:30");
const host2 = row("host-2", "אירוח ערב", "19:30", "23:30");
const bar = row("bar-1", "בר", "18:00", "02:00", { department_id: DEPT.bar });
const general = row("mgr", "מנהל", "21:00", "01:00", { department_id: null });

/* ------------------------------------------------------------------ */
describe("שמירת שיבוץ לתא", () => {
  it("תא ריק — מוסיפים", () => {
    expect(planRowAssignment([], USER.employee)).toEqual({ kind: "insert", deleteIds: [] });
  });

  it("אותו עובד כבר בתא — לא עושים כלום", () => {
    expect(planRowAssignment([{ id: "a1", employee_id: USER.employee }], USER.employee)).toEqual({ kind: "noop" });
  });

  it("עובד אחר בתא — מחליפים אותו באותה רשומה", () => {
    expect(planRowAssignment([{ id: "a1", employee_id: USER.employee2 }], USER.employee)).toEqual({
      kind: "update",
      id: "a1",
      deleteIds: [],
    });
  });

  it("תא ישן עם כמה עובדים — נשאר רק הנבחר והשאר נמחקים", () => {
    const existing = [
      { id: "a1", employee_id: USER.employee2 },
      { id: "a2", employee_id: USER.employee3 },
    ];
    expect(planRowAssignment(existing, USER.employee)).toEqual({ kind: "update", id: "a1", deleteIds: ["a2"] });
  });

  it("תא ישן שהנבחר כבר בו — שומרים את הרשומה שלו ומוחקים את האחרים", () => {
    const existing = [
      { id: "a1", employee_id: USER.employee2 },
      { id: "a2", employee_id: USER.employee },
      { id: "a3", employee_id: USER.employee3 },
    ];
    expect(planRowAssignment(existing, USER.employee)).toEqual({ kind: "update", id: "a2", deleteIds: ["a1", "a3"] });
  });
});

/* ------------------------------------------------------------------ */
describe("טבלת השיבוץ", () => {
  it("כל תא מחזיק עובד אחד, לפי שורה ותאריך", () => {
    const { byCell } = assignmentsByRowCell(
      [
        makeAssignment({ employee_id: USER.employee, shift_template_id: host1.id, shift_date: MON }),
        makeAssignment({ employee_id: USER.employee2, shift_template_id: host2.id, shift_date: MON }),
      ],
      [host1, host2],
    );
    expect(byCell.get(`${host1.id}_${MON}`)?.employee_id).toBe(USER.employee);
    expect(byCell.get(`${host2.id}_${MON}`)?.employee_id).toBe(USER.employee2);
  });

  it("שיבוץ לשורה שנמחקה לא מופיע ולא נספר", () => {
    const { byCell, weekCounts } = assignmentsByRowCell(
      [makeAssignment({ shift_template_id: "deleted-row", shift_date: MON })],
      [host1],
    );
    expect(byCell.size).toBe(0);
    expect(weekCounts.size).toBe(0);
  });

  it("סופר שיבוצים לכל מחלקה בנפרד, ושורות כלליות בקבוצת 'כללי'", () => {
    const { weekCounts } = assignmentsByRowCell(
      [
        makeAssignment({ employee_id: USER.employee, shift_template_id: host1.id, shift_date: WEEK[0] }),
        makeAssignment({ employee_id: USER.employee, shift_template_id: host1.id, shift_date: WEEK[1] }),
        makeAssignment({ employee_id: USER.employee2, shift_template_id: bar.id, shift_date: WEEK[1] }),
        makeAssignment({ employee_id: USER.manager, shift_template_id: general.id, shift_date: WEEK[1] }),
      ],
      [host1, bar, general],
    );
    expect(weekCounts.get(DEPT.service)).toBe(2);
    expect(weekCounts.get(DEPT.bar)).toBe(1);
    expect(weekCounts.get(GENERAL_SHIFT_SECTION_KEY)).toBe(1);
  });

  it("תא ישן עם שני עובדים — מוצג הראשון ששובץ ונספר פעם אחת", () => {
    const { byCell, weekCounts } = assignmentsByRowCell(
      [
        makeAssignment({ employee_id: USER.employee2, shift_template_id: host1.id, shift_date: MON, created_at: "2026-07-02T10:00:00Z" }),
        makeAssignment({ employee_id: USER.employee, shift_template_id: host1.id, shift_date: MON, created_at: "2026-07-01T10:00:00Z" }),
      ],
      [host1],
    );
    expect(byCell.get(`${host1.id}_${MON}`)?.employee_id).toBe(USER.employee);
    expect(weekCounts.get(DEPT.service)).toBe(1);
  });

  it("סימון התנגשות: העובד ששובץ סימן 'לא יכול' בשעות האלה", () => {
    const prefs = buildTeamPrefMap([
      makePreference({ employee_id: USER.employee, shift_date: MON, start_time: "19:30", end_time: "23:30", preference: "cannot" }),
    ]);
    expect(rowPref(prefs, USER.employee, host2, MON)).toBe("cannot");
    expect(rowPref(prefs, USER.employee2, host2, MON)).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
describe("רשימת העובדים בחלון השיבוץ", () => {
  const dana = makeProfile({ id: "dana", full_name: "דנה לוי", department_id: DEPT.service });
  const avi = makeProfile({ id: "avi", full_name: "אבי כהן", department_id: DEPT.service });
  const gal = makeProfile({ id: "gal", full_name: "גל מזרחי", department_id: DEPT.service });
  const benny = makeProfile({ id: "benny", full_name: "בני פרץ", department_id: DEPT.service });
  const team = [dana, avi, gal, benny];
  const rowNames = new Map([
    [host1.id, host1.name],
    [host2.id, host2.name],
    ["early", "פתיחה"],
  ]);

  const teamPrefs = buildTeamPrefMap([
    makePreference({ employee_id: "dana", shift_date: MON, start_time: "19:30", end_time: "23:30", preference: "cannot" }),
    makePreference({ employee_id: "gal", shift_date: MON, start_time: "19:30", end_time: "23:30", preference: "available" }),
    makePreference({ employee_id: "benny", shift_date: MON, start_time: "19:30", end_time: "23:30", preference: "prefer" }),
  ]);

  function candidates(over: Partial<Parameters<typeof pickerCandidates>[0]> = {}) {
    return pickerCandidates({
      employees: team,
      template: host2,
      date: MON,
      currentEmployeeId: null,
      assignments: [],
      teamPrefs,
      rowNames,
      ...over,
    });
  }

  it("קודם מי שיכול, אחר כך מי שלא סימן, ובסוף מי שלא יכול", () => {
    expect(candidates().map((c) => c.employee.id)).toEqual(["benny", "gal", "avi", "dana"]);
  });

  it("בתוך כל קבוצה — לפי שם", () => {
    const c = candidates().filter((x) => x.pref === "available");
    expect(c.map((x) => x.employee.full_name)).toEqual(["בני פרץ", "גל מזרחי"]);
  });

  it("'מעדיף' הישן נחשב 'יכול'", () => {
    expect(candidates().find((c) => c.employee.id === "benny")?.pref).toBe("available");
  });

  it("חיפוש לפי חלק מהשם", () => {
    expect(candidates({ query: "כהן" }).map((c) => c.employee.id)).toEqual(["avi"]);
    expect(candidates({ query: "  " })).toHaveLength(4);
    expect(candidates({ query: "אין כזה" })).toEqual([]);
  });

  it("העובד שכבר בשורה מסומן ולא נחסם בגלל יום חופש", () => {
    const sixDays = WEEK.slice(0, 6).map((d) => makeAssignment({ employee_id: "dana", shift_template_id: host2.id, shift_date: d }));
    const d = candidates({ currentEmployeeId: "dana", assignments: sixDays }).find((c) => c.employee.id === "dana")!;
    expect(d.isCurrent).toBe(true);
    expect(d.dayOffBlocked).toBe(false);
  });

  it("6 ימי שיבוץ בשבוע — אי אפשר לשבץ ליום שביעי", () => {
    const sixDays = WEEK.filter((d) => d !== MON).map((d) =>
      makeAssignment({ employee_id: "avi", shift_template_id: host1.id, shift_date: d }),
    );
    const a = candidates({ assignments: sixDays }).find((c) => c.employee.id === "avi")!;
    expect(a.assignedDays).toBe(6);
    expect(a.dayOffBlocked).toBe(true);
  });

  it("6 ימים אבל אחד מהם הוא היום הזה — שורה נוספת באותו יום מותרת", () => {
    const sixDays = WEEK.slice(0, 6).map((d) => makeAssignment({ employee_id: "avi", shift_template_id: "early", shift_date: d }));
    const a = candidates({ assignments: sixDays }).find((c) => c.employee.id === "avi")!;
    expect(a.dayOffBlocked).toBe(false);
    expect(a.otherRowsToday).toEqual(["פתיחה"]);
  });

  it("5 ימים — עדיין אפשר", () => {
    const fiveDays = WEEK.slice(2, 7).map((d) => makeAssignment({ employee_id: "avi", shift_template_id: host1.id, shift_date: d }));
    expect(candidates({ assignments: fiveDays }).find((c) => c.employee.id === "avi")!.dayOffBlocked).toBe(false);
  });

  it("שיבוצים משבוע אחר לא נספרים", () => {
    const lastWeek = ["2026-07-05", "2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11"].map((d) =>
      makeAssignment({ employee_id: "avi", shift_template_id: host1.id, shift_date: d }),
    );
    const a = candidates({ assignments: lastWeek }).find((c) => c.employee.id === "avi")!;
    expect(a.assignedDays).toBe(0);
    expect(a.dayOffBlocked).toBe(false);
  });

  it("מציג באיזו שורה אחרת העובד כבר משובץ היום (שורה כפולה עם אותו שם)", () => {
    const a = candidates({
      assignments: [makeAssignment({ employee_id: "gal", shift_template_id: host1.id, shift_date: MON })],
    }).find((c) => c.employee.id === "gal")!;
    expect(a.otherRowsToday).toEqual(["אירוח ערב"]);
  });

  it("שורה שנמחקה מוצגת כ'משמרת אחרת'", () => {
    const a = candidates({
      assignments: [makeAssignment({ employee_id: "gal", shift_template_id: "gone", shift_date: MON })],
    }).find((c) => c.employee.id === "gal")!;
    expect(a.otherRowsToday).toEqual(["משמרת אחרת"]);
  });

  it("שיבוץ של עובד אחר לא משפיע על הספירה של העובד", () => {
    const others = WEEK.map((d) => makeAssignment({ employee_id: "dana", shift_template_id: host1.id, shift_date: d }));
    const a = candidates({ assignments: others }).find((c) => c.employee.id === "avi")!;
    expect(a.assignedDays).toBe(0);
    expect(a.otherRowsToday).toEqual([]);
  });

  it("אין עובדים במחלקה — רשימה ריקה", () => {
    expect(candidates({ employees: [] })).toEqual([]);
  });

  it("שורה שלא פעילה ביום הזה — אין אילוצים להציג", () => {
    const sundayOnly = row("sun", "אירוח ערב", "19:30", "23:30", {
      days: [{ day_of_week: 0, start_time: "19:30", end_time: "23:30" }],
    });
    expect(candidates({ template: sundayOnly }).every((c) => c.pref === undefined)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
describe("עורך השורות — ולידציה", () => {
  const ok = { name: "אירוח ערב", start: "19:30", end: "23:30", days: [true, false, false, false, false, false, false] };

  it("שורה תקינה", () => {
    expect(validateRowDraft(ok)).toBeNull();
  });

  it("שם ריק או רק רווחים", () => {
    expect(validateRowDraft({ ...ok, name: "" })).toBe("name");
    expect(validateRowDraft({ ...ok, name: "   " })).toBe("name");
  });

  it("חסרה שעה", () => {
    expect(validateRowDraft({ ...ok, start: "" })).toBe("hours");
    expect(validateRowDraft({ ...ok, end: "" })).toBe("hours");
  });

  it("התחלה וסיום זהים (גם כשאחד עם שניות)", () => {
    expect(validateRowDraft({ ...ok, start: "20:00", end: "20:00:00" })).toBe("same_hours");
  });

  it("שורה חדשה בלי ימים מסומנים לא נשמרת", () => {
    expect(validateRowDraft({ ...ok, days: Array(7).fill(false) })).toBe("days");
  });

  it("משמרת לילה — סיום לפני ההתחלה זה תקין", () => {
    expect(validateRowDraft({ ...ok, start: "22:00", end: "02:00" })).toBeNull();
  });
});

describe("עורך השורות — ימים ושעות", () => {
  const onlyDays = (...on: number[]) => [0, 1, 2, 3, 4, 5, 6].map((i) => on.includes(i));

  it("שורה חדשה — רק הימים שנבחרו, בשעות שבטופס", () => {
    expect(rowDaysFor(null, { start: "19:30", end: "23:30", days: onlyDays(0, 4) })).toEqual([
      { day_of_week: 0, start_time: "19:30", end_time: "23:30" },
      { day_of_week: 4, start_time: "19:30", end_time: "23:30" },
    ]);
  });

  it("שורה חדשה בלי ימים — אין ימים לשמירה", () => {
    expect(rowDaysFor(null, { start: "19:30", end: "23:30", days: Array(7).fill(false) })).toEqual([]);
  });

  const varied = row("v", "אירוח", "19:30", "23:30", {
    days: [
      { day_of_week: 0, start_time: "19:30:00", end_time: "23:30:00" },
      { day_of_week: 5, start_time: "12:00:00", end_time: "17:00:00" },
    ],
  });

  it("עריכה בלי לגעת בשעות — כל יום שומר את השעות שלו", () => {
    expect(rowDaysFor(varied, { start: "19:30", end: "23:30", days: onlyDays(0, 5) })).toEqual([
      { day_of_week: 0, start_time: "19:30", end_time: "23:30" },
      { day_of_week: 5, start_time: "12:00", end_time: "17:00" },
    ]);
  });

  it("עריכה בלי לגעת בשעות — יום שהודלק מקבל את שעות הכותרת", () => {
    const days = rowDaysFor(varied, { start: "19:30", end: "23:30", days: onlyDays(0, 2, 5) });
    expect(days.find((d) => d.day_of_week === 2)).toEqual({ day_of_week: 2, start_time: "19:30", end_time: "23:30" });
    expect(days.find((d) => d.day_of_week === 5)?.start_time).toBe("12:00");
  });

  it("עריכה בלי לגעת בשעות — יום שכובה יורד", () => {
    expect(rowDaysFor(varied, { start: "19:30", end: "23:30", days: onlyDays(0) }).map((d) => d.day_of_week)).toEqual([0]);
  });

  it("שינוי שעות — חל על כל הימים, גם על שישי עם השעות המיוחדות", () => {
    expect(rowDaysFor(varied, { start: "20:00", end: "00:00", days: onlyDays(0, 5) })).toEqual([
      { day_of_week: 0, start_time: "20:00", end_time: "00:00" },
      { day_of_week: 5, start_time: "20:00", end_time: "00:00" },
    ]);
  });

  it("שעות מהמסד עם שניות לא נחשבות כשינוי", () => {
    const fromDb = { ...varied, start_time: "19:30:00", end_time: "23:30:00" };
    expect(rowDaysFor(fromDb, { start: "19:30", end: "23:30", days: onlyDays(5) })).toEqual([
      { day_of_week: 5, start_time: "12:00", end_time: "17:00" },
    ]);
  });
});

describe("שכפול שורה וסדר", () => {
  it("שכפול מעתיק בדיוק את הימים והשעות, כולל ימים כבויים", () => {
    const r = row("r", "אירוח", "19:30", "23:30", {
      days: [
        { day_of_week: 1, start_time: "19:30", end_time: "23:30" },
        { day_of_week: 5, start_time: "12:00", end_time: "17:00" },
      ],
    });
    expect(copyRowDays(r)).toEqual([
      { day_of_week: 1, start_time: "19:30", end_time: "23:30" },
      { day_of_week: 5, start_time: "12:00", end_time: "17:00" },
    ]);
  });

  it("שורה ישנה בלי ימים מוגדרים רצה כל השבוע — השכפול מקבל 7 ימים", () => {
    expect(copyRowDays(host1)).toHaveLength(7);
  });

  it("שורה חדשה נוספת בתחתית המחלקה", () => {
    expect(nextRowSortOrder([])).toBe(0);
    expect(nextRowSortOrder([{ sort_order: 0 }, { sort_order: 4 }, { sort_order: 2 }])).toBe(5);
  });
});

/* ------------------------------------------------------------------ */
describe("עורך השורות — שעות לפי יום", () => {
  const blank = initialRowDraft(null);
  const H = (start: string, end: string) => ({ start, end });

  it("שורה חדשה נפתחת בלי ימים, באותן שעות לכל הימים", () => {
    expect(blank.days.every((d) => !d)).toBe(true);
    expect(blank.perDay).toBe(false);
    expect(blank.dayHours).toHaveLength(7);
  });

  it("שורה עם שעות שונות לפי יום נפתחת במצב 'שעות לפי יום' עם השעות שלה", () => {
    const r = row("v", "אחמ״ש", "19:30", "01:00", {
      days: [
        { day_of_week: 0, start_time: "21:00:00", end_time: "01:00:00" },
        { day_of_week: 1, start_time: "19:30:00", end_time: "01:00:00" },
        { day_of_week: 5, start_time: "16:00:00", end_time: "08:45:00" },
      ],
    });
    const d = initialRowDraft(r);
    expect(d.perDay).toBe(true);
    expect(d.days).toEqual([true, true, false, false, false, true, false]);
    expect(d.dayHours?.[0]).toEqual(H("21:00", "01:00"));
    expect(d.dayHours?.[5]).toEqual(H("16:00", "08:45"));
  });

  it("שורה שכל הימים שלה באותן שעות נפתחת במצב 'אותן שעות'", () => {
    expect(initialRowDraft(host1).perDay).toBe(false);
    expect(initialRowDraft(host1).start).toBe("19:30");
  });

  it("מעבר ל'שעות לפי יום' ממלא כל יום בשעות המשותפות", () => {
    const d = setRowDraftPerDay({ ...blank, start: "19:30", end: "23:30", days: [true, true, false, false, false, false, false] }, true);
    expect(d.dayHours?.[0]).toEqual(H("19:30", "23:30"));
    expect(d.dayHours?.[3]).toEqual(H("19:30", "23:30"));
  });

  it("מעבר ל'שעות לפי יום' לא דורס יום שכבר קיבל שעות", () => {
    const withFriday = { ...blank, start: "19:30", end: "23:30", dayHours: blank.dayHours!.map((h, i) => (i === 5 ? H("12:00", "17:00") : h)) };
    expect(setRowDraftPerDay(withFriday, true).dayHours?.[5]).toEqual(H("12:00", "17:00"));
  });

  it("חזרה ל'אותן שעות' בלי שעות משותפות — לוקחת את השעות של היום הראשון שנבחר", () => {
    const perDay = {
      ...blank,
      perDay: true,
      days: [false, true, false, false, false, true, false],
      dayHours: blank.dayHours!.map((h, i) => (i === 1 ? H("20:00", "00:00") : i === 5 ? H("12:00", "17:00") : h)),
    };
    const d = setRowDraftPerDay(perDay, false);
    expect(d.perDay).toBe(false);
    expect([d.start, d.end]).toEqual(["20:00", "00:00"]);
  });

  it("ולידציה: יום שנבחר בלי שעות — אי אפשר לשמור", () => {
    const d = { ...blank, name: "אחמ״ש", perDay: true, days: [true, true, false, false, false, false, false] };
    d.dayHours = blank.dayHours!.map((h, i) => (i === 0 ? H("19:30", "01:00") : h));
    expect(validateRowDraft(d)).toBe("hours");
  });

  it("ולידציה: יום שהתחלה וסיום שלו זהים", () => {
    const d = {
      ...blank,
      name: "אחמ״ש",
      perDay: true,
      days: [true, false, false, false, false, false, false],
      dayHours: blank.dayHours!.map((h, i) => (i === 0 ? H("20:00", "20:00") : h)),
    };
    expect(validateRowDraft(d)).toBe("same_hours");
  });

  it("ולידציה: יום שלא נבחר לא נבדק גם אם אין לו שעות", () => {
    const d = {
      ...blank,
      name: "אחמ״ש",
      perDay: true,
      days: [true, false, false, false, false, false, false],
      dayHours: blank.dayHours!.map((h, i) => (i === 0 ? H("19:30", "01:00") : h)),
    };
    expect(validateRowDraft(d)).toBeNull();
  });

  it("ולידציה: לפי יום בלי ימים", () => {
    expect(validateRowDraft({ ...blank, name: "אחמ״ש", perDay: true })).toBe("days");
  });

  it("ולידציה: במצב 'לפי יום' לא צריך שעות משותפות", () => {
    const d = {
      ...blank,
      name: "אחמ״ש",
      start: "",
      end: "",
      perDay: true,
      days: [true, false, false, false, false, false, false],
      dayHours: blank.dayHours!.map((h, i) => (i === 0 ? H("19:30", "01:00") : h)),
    };
    expect(validateRowDraft(d)).toBeNull();
  });

  it("שמירה לפי יום — כל יום עם השעות שלו, ורק הימים שנבחרו", () => {
    const d = {
      ...blank,
      perDay: true,
      days: [true, false, false, false, false, true, false],
      dayHours: blank.dayHours!.map((h, i) => (i === 0 ? H("21:00", "01:00") : i === 5 ? H("16:00", "08:45") : H("10:00", "11:00"))),
    };
    expect(rowDaysFor(null, d)).toEqual([
      { day_of_week: 0, start_time: "21:00", end_time: "01:00" },
      { day_of_week: 5, start_time: "16:00", end_time: "08:45" },
    ]);
  });

  it("שמירה לפי יום — כותרת השורה היא השעות של היום הראשון", () => {
    const days = [
      { day_of_week: 1, start_time: "19:30", end_time: "01:00" },
      { day_of_week: 5, start_time: "16:00", end_time: "08:45" },
    ];
    expect(rowHeadlineHours(days, { start: "", end: "" })).toEqual(H("19:30", "01:00"));
  });

  it("כותרת בלי ימים — השעות מהטופס", () => {
    expect(rowHeadlineHours([], { start: "19:30", end: "23:30" })).toEqual(H("19:30", "23:30"));
  });

  it("עריכה במצב 'לפי יום' ושמירה — הימים מתעדכנים בדיוק", () => {
    const r = row("v", "אחמ״ש", "19:30", "01:00", {
      days: [
        { day_of_week: 0, start_time: "21:00", end_time: "01:00" },
        { day_of_week: 5, start_time: "16:00", end_time: "08:45" },
      ],
    });
    const d = initialRowDraft(r);
    d.dayHours = d.dayHours!.map((h, i) => (i === 5 ? H("15:00", "23:00") : h));
    d.days = d.days.map((on, i) => (i === 2 ? true : on));
    expect(rowDaysFor(r, d)).toEqual([
      { day_of_week: 0, start_time: "21:00", end_time: "01:00" },
      { day_of_week: 2, start_time: "19:30", end_time: "01:00" },
      { day_of_week: 5, start_time: "15:00", end_time: "23:00" },
    ]);
  });
});
