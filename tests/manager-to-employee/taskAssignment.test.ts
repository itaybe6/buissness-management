/**
 * מה שהמנהל עושה → מה שקורה לעובד: משימות.
 *
 * המנהל מגדיר תבניות קבועות למחלקה ומקצה משימות אישיות. שתי החלטות שלו
 * משפיעות ישירות על העובד: לאיזו מחלקה שייכת התבנית, והאם המשימה דורשת
 * אישור לפני שהיא בכלל מגיעה אליו. משימה פתוחה גם חוסמת יציאה ממשמרת.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approvalForAssignee, pendingApprovalTasks } from "@/lib/taskAssignment";
import { buildTodayTasks, templateVisibleForDailyChecklist } from "@/lib/todayTasks";
import { pendingTasksForEmployee } from "@/lib/pendingTasks";
import {
  matchesRecurrenceWeekday,
  serializeRecurrenceWeekdays,
  toggleRecurrenceDay,
} from "@/lib/taskRecurrence";
import { TASK_CREATE_ROLES } from "@/lib/constants";
import { BUSINESS_ID, DEPT, USER, makeTask, makeTaskTemplate } from "../helpers/factories";
import type { UserRole } from "@/types/database";

/** רביעי 08/07/2026. */
const TODAY = "2026-07-08";
const WEDNESDAY = 3;

const users: { id: string; role: UserRole }[] = [
  { id: USER.employee, role: "employee" },
  { id: USER.maintenance, role: "maintenance" },
  { id: USER.shiftManager, role: "shift_manager" },
];

describe("מי בכלל רשאי להקצות משימות", () => {
  it("יצירת משימות קבועות שמורה למנהל", () => {
    expect(TASK_CREATE_ROLES).toEqual(["manager"]);
  });
});

describe("מתג «אישור משימות אחזקה» של העסק", () => {
  const base = { canCreateTasks: true, users };

  it("כשהמתג כבוי — כל משימה מגיעה מיד לעובד", () => {
    expect(
      approvalForAssignee({ ...base, approvalEnabled: false, assignedTo: USER.maintenance }),
    ).toBeNull();
  });

  it("כשהמתג דלוק — משימה לאיש אחזקה ממתינה לאישור", () => {
    expect(
      approvalForAssignee({ ...base, approvalEnabled: true, assignedTo: USER.maintenance }),
    ).toBe("pending");
  });

  it("המתג לא נוגע בעובדים רגילים", () => {
    expect(approvalForAssignee({ ...base, approvalEnabled: true, assignedTo: USER.employee })).toBeNull();
    expect(approvalForAssignee({ ...base, approvalEnabled: true, assignedTo: USER.shiftManager })).toBeNull();
  });

  it("משימה בלי נמען לא דורשת אישור", () => {
    expect(approvalForAssignee({ ...base, approvalEnabled: true, assignedTo: null })).toBeNull();
    expect(approvalForAssignee({ ...base, approvalEnabled: true, assignedTo: undefined })).toBeNull();
  });

  it("נמען שלא נמצא ברשימת המשתמשים לא נחשב אחזקה", () => {
    expect(
      approvalForAssignee({ ...base, approvalEnabled: true, assignedTo: "usr-unknown" }),
    ).toBeNull();
  });

  it("מי שלא רשאי ליצור משימות לא מייצר גם בקשות אישור", () => {
    expect(
      approvalForAssignee({ ...base, canCreateTasks: false, approvalEnabled: true, assignedTo: USER.maintenance }),
    ).toBeNull();
  });
});

describe("תור האישורים של המנהל", () => {
  const tasks = [
    makeTask({ id: "t1", approval_status: "pending" }),
    makeTask({ id: "t2", approval_status: "approved" }),
    makeTask({ id: "t3", approval_status: null }),
    makeTask({ id: "t4", approval_status: "pending" }),
  ];

  it("המנהל רואה רק את הממתינות", () => {
    expect(pendingApprovalTasks(tasks, "manager").map((t) => t.id)).toEqual(["t1", "t4"]);
  });

  it("אחראי משמרת לא רואה תור אישורים", () => {
    expect(pendingApprovalTasks(tasks, "shift_manager")).toEqual([]);
  });

  it("עובד ואיש אחזקה בוודאי לא", () => {
    expect(pendingApprovalTasks(tasks, "employee")).toEqual([]);
    expect(pendingApprovalTasks(tasks, "maintenance")).toEqual([]);
    expect(pendingApprovalTasks(tasks, null)).toEqual([]);
  });
});

describe("משימה שממתינה לאישור מוסתרת מהעובד", () => {
  const checklistFor = (tasks: ReturnType<typeof makeTask>[]) =>
    buildTodayTasks(BUSINESS_ID, tasks, [], USER.maintenance, null, TODAY, WEDNESDAY, "maintenance");

  it("לפני אישור — לא מופיעה אצלו בכלל", () => {
    const pendingTask = makeTask({
      title: "תיקון מקרר",
      assigned_to: USER.maintenance,
      approval_status: "pending",
      due_date: TODAY,
    });
    expect(checklistFor([pendingTask])).toEqual([]);
  });

  it("אחרי אישור המנהל — מופיעה", () => {
    const approved = makeTask({
      title: "תיקון מקרר",
      assigned_to: USER.maintenance,
      approval_status: "approved",
      due_date: TODAY,
    });
    expect(checklistFor([approved]).map((t) => t.title)).toEqual(["תיקון מקרר"]);
  });

  it("משימה שממתינה לאישור לא חוסמת לו יציאה ממשמרת", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T22:00:00`));
    const pendingTask = makeTask({
      assigned_to: USER.maintenance,
      approval_status: "pending",
      due_date: TODAY,
    });
    expect(pendingTasksForEmployee([pendingTask], [], USER.maintenance, null, WEDNESDAY, "maintenance")).toEqual([]);
    vi.useRealTimers();
  });
});

describe("המנהל משייך תבנית למחלקה", () => {
  it("תבנית של הבר מגיעה רק לעובדי הבר", () => {
    const barTemplate = makeTaskTemplate({ department_id: DEPT.bar });
    expect(templateVisibleForDailyChecklist(barTemplate, DEPT.bar, "employee")).toBe(true);
    expect(templateVisibleForDailyChecklist(barTemplate, DEPT.kitchen, "employee")).toBe(false);
  });

  it("תבנית כלל-עסקית מגיעה לכולם", () => {
    const global = makeTaskTemplate({ department_id: null });
    for (const dept of [DEPT.bar, DEPT.kitchen, DEPT.service, null]) {
      expect(templateVisibleForDailyChecklist(global, dept, "employee")).toBe(true);
    }
  });

  it("העברת עובד בין מחלקות מחליפה לו את רשימת המשימות", () => {
    const templates = [
      makeTaskTemplate({ id: "tpl-bar", title: "ניקוי בר", department_id: DEPT.bar }),
      makeTaskTemplate({ id: "tpl-kitchen", title: "ניקוי מטבח", department_id: DEPT.kitchen }),
    ];
    const checklist = (dept: string | null) =>
      buildTodayTasks(BUSINESS_ID, [], templates, USER.employee, dept, TODAY, WEDNESDAY, "employee").map(
        (t) => t.title,
      );

    expect(checklist(DEPT.bar)).toEqual(["ניקוי בר"]);
    expect(checklist(DEPT.kitchen)).toEqual(["ניקוי מטבח"]);
  });

  it("עובד שהמנהל לא שייך למחלקה לא רואה משימות מחלקתיות", () => {
    const templates = [makeTaskTemplate({ id: "tpl-bar", title: "ניקוי בר", department_id: DEPT.bar })];
    const checklist = buildTodayTasks(BUSINESS_ID, [], templates, USER.employee, null, TODAY, WEDNESDAY, "employee");
    expect(checklist).toEqual([]);
  });
});

describe("המנהל קובע באילו ימים המשימה חוזרת", () => {
  it("«כל יום» מופיע גם ברביעי וגם בשבת", () => {
    const daily = makeTaskTemplate({ recurrence_weekday: [-1] });
    expect(matchesRecurrenceWeekday(daily.recurrence_weekday, WEDNESDAY)).toBe(true);
    expect(matchesRecurrenceWeekday(daily.recurrence_weekday, 6)).toBe(true);
  });

  it("ימים נבחרים מופיעים רק בהם", () => {
    const monWedFri = makeTaskTemplate({ recurrence_weekday: [1, 3, 5] });
    expect(matchesRecurrenceWeekday(monWedFri.recurrence_weekday, 3)).toBe(true);
    expect(matchesRecurrenceWeekday(monWedFri.recurrence_weekday, 2)).toBe(false);
  });

  it("שינוי הימים מסיר את המשימה מהצ׳ק־ליסט של היום", () => {
    const before = makeTaskTemplate({ id: "tpl-x", title: "פחים", recurrence_weekday: [WEDNESDAY] });
    const after = { ...before, recurrence_weekday: [5] };
    const checklist = (tpl: typeof before) =>
      buildTodayTasks(BUSINESS_ID, [], [tpl], USER.employee, DEPT.bar, TODAY, WEDNESDAY, "employee");

    expect(checklist(before)).toHaveLength(1);
    expect(checklist(after)).toHaveLength(0);
  });

  it("בחירת כל שבעת הימים נשמרת כ«כל יום»", () => {
    expect(serializeRecurrenceWeekdays([0, 1, 2, 3, 4, 5, 6])).toEqual([-1]);
  });

  it("ביטול כל הימים חוזר ל«כל יום» ולא משאיר תבנית מתה", () => {
    expect(serializeRecurrenceWeekdays([])).toEqual([-1]);
  });

  it("הסרת יום בודד מ«כל יום» משאירה שישה ימים", () => {
    expect(toggleRecurrenceDay([-1], 6)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("אי אפשר להוריד את היום האחרון — תמיד נשאר יום אחד", () => {
    expect(toggleRecurrenceDay([3], 3)).toEqual([3]);
  });
});

describe("המנהל מכבה תבנית או מקצה מחדש", () => {
  it("תבנית לא פעילה נעלמת מהעובד", () => {
    const off = makeTaskTemplate({ active: false });
    expect(buildTodayTasks(BUSINESS_ID, [], [off], USER.employee, DEPT.bar, TODAY, WEDNESDAY, "employee")).toEqual([]);
  });

  it("העברת משימה לעובד אחר מסירה אותה מהראשון", () => {
    const task = makeTask({ title: "לספור מלאי", assigned_to: USER.employee2, due_date: TODAY });
    const forFirst = buildTodayTasks(BUSINESS_ID, [task], [], USER.employee, DEPT.bar, TODAY, WEDNESDAY, "employee");
    const forSecond = buildTodayTasks(BUSINESS_ID, [task], [], USER.employee2, DEPT.bar, TODAY, WEDNESDAY, "employee");
    expect(forFirst).toEqual([]);
    expect(forSecond.map((t) => t.title)).toEqual(["לספור מלאי"]);
  });
});

describe("משימות פתוחות חוסמות יציאה ממשמרת", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T23:00:00`));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("תבנית שהמנהל הגדיר להיום וטרם סומנה — חוסמת", () => {
    const tpl = makeTaskTemplate({ title: "סגירת בר", department_id: DEPT.bar });
    const pending = pendingTasksForEmployee([], [tpl], USER.employee, DEPT.bar, WEDNESDAY, "employee");
    expect(pending).toEqual([{ title: "סגירת בר", type: "recurring" }]);
  });

  it("משימה אישית שהמנהל הקצה להיום — חוסמת", () => {
    const task = makeTask({ title: "לקחת אשפה", due_date: TODAY });
    const pending = pendingTasksForEmployee([task], [], USER.employee, DEPT.bar, WEDNESDAY, "employee");
    expect(pending).toEqual([{ title: "לקחת אשפה", type: "one_time" }]);
  });

  it("אחרי שהעובד סימן הכול — היציאה משתחררת", () => {
    const tpl = makeTaskTemplate({ id: "tpl-close", title: "סגירת בר", department_id: DEPT.bar });
    const done = makeTask({
      template_id: "tpl-close",
      type: "recurring",
      recurrence_weekday: [-1],
      status: "done",
      due_date: TODAY,
    });
    expect(pendingTasksForEmployee([done], [tpl], USER.employee, DEPT.bar, WEDNESDAY, "employee")).toEqual([]);
  });

  it("משימה של מחלקה אחרת לא חוסמת אותו", () => {
    const tpl = makeTaskTemplate({ title: "סגירת מטבח", department_id: DEPT.kitchen });
    expect(pendingTasksForEmployee([], [tpl], USER.employee, DEPT.bar, WEDNESDAY, "employee")).toEqual([]);
  });
});
