/**
 * ממשק העובד — צ׳ק־ליסט המשימות היומי.
 *
 * המסך מורכב משני מקורות: תבניות קבועות של המחלקה (שורות "וירטואליות"
 * שנוצרות רק כשמסמנים אותן) ומשימות חד-פעמיות שהוקצו אישית. הבדיקות כאן
 * מתמקדות בשיוך המחלקתי, באישור המנהל, ובחסימת היציאה מהמשמרת.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VIRTUAL_TASK_PREFIX,
  buildEmployeeEventTasks,
  buildTodayTasks,
  isDepartmentTask,
  isTaskVisibleInDailyChecklist,
  taskBelongsToEmployee,
  taskExpansionKey,
  templateVisibleForDailyChecklist,
  virtualRecurringTask,
} from "@/lib/todayTasks";
import { pendingTasksForEmployee } from "@/lib/pendingTasks";
import { BUSINESS_ID, DEPT, USER, makeTask, makeTaskTemplate } from "../helpers/factories";

/** רביעי, 08/07/2026 (יום 3 בשבוע). */
const TODAY = "2026-07-08";
const WEDNESDAY = 3;

describe("שיוך תבנית קבועה למחלקה", () => {
  it("תבנית כלל-עסקית (בלי מחלקה) מוצגת לכולם", () => {
    const tpl = makeTaskTemplate({ department_id: null });
    expect(templateVisibleForDailyChecklist(tpl, DEPT.bar)).toBe(true);
    expect(templateVisibleForDailyChecklist(tpl, null)).toBe(true);
    expect(templateVisibleForDailyChecklist(tpl, DEPT.kitchen)).toBe(true);
  });

  it("תבנית של מחלקה מוצגת רק לעובדי אותה מחלקה", () => {
    const tpl = makeTaskTemplate({ department_id: DEPT.bar });
    expect(templateVisibleForDailyChecklist(tpl, DEPT.bar)).toBe(true);
    expect(templateVisibleForDailyChecklist(tpl, DEPT.kitchen)).toBe(false);
  });

  it("עובד בלי מחלקה לא רואה תבניות מחלקתיות", () => {
    const tpl = makeTaskTemplate({ department_id: DEPT.bar });
    expect(templateVisibleForDailyChecklist(tpl, null, "employee")).toBe(false);
  });

  it("מנהל / אחמ״ש / מנהלת משרד בלי מחלקה רואים את כל התבניות", () => {
    const tpl = makeTaskTemplate({ department_id: DEPT.bar });
    expect(templateVisibleForDailyChecklist(tpl, null, "manager")).toBe(true);
    expect(templateVisibleForDailyChecklist(tpl, null, "shift_manager")).toBe(true);
    expect(templateVisibleForDailyChecklist(tpl, null, "office_manager")).toBe(true);
  });

  it("בדשבורד אישי — גם אחמ״ש בלי מחלקה לא רואה תבניות של מחלקות אחרות", () => {
    const tpl = makeTaskTemplate({ department_id: DEPT.bar });
    expect(templateVisibleForDailyChecklist(tpl, null, "shift_manager", { personal: true })).toBe(false);
    expect(templateVisibleForDailyChecklist(tpl, null, "manager", { personal: true })).toBe(false);
  });

  it("מעקב אחמ״ש — רואה את כל המחלקות גם אם משובץ למחלקה", () => {
    const kitchen = makeTaskTemplate({ department_id: DEPT.kitchen });
    expect(templateVisibleForDailyChecklist(kitchen, DEPT.bar, "shift_manager", { allDepartments: true })).toBe(
      true,
    );
    expect(templateVisibleForDailyChecklist(kitchen, null, "shift_manager", { allDepartments: true })).toBe(true);
  });

  it("בדשבורד אישי — עובד בר רואה רק בר + כללי", () => {
    const bar = makeTaskTemplate({ department_id: DEPT.bar });
    const wait = makeTaskTemplate({ department_id: DEPT.service });
    const global = makeTaskTemplate({ department_id: null });
    expect(templateVisibleForDailyChecklist(bar, DEPT.bar, "employee", { personal: true })).toBe(true);
    expect(templateVisibleForDailyChecklist(wait, DEPT.bar, "employee", { personal: true })).toBe(false);
    expect(templateVisibleForDailyChecklist(global, DEPT.bar, "employee", { personal: true })).toBe(true);
  });

  it("איש אחזקה בלי מחלקה לא מקבל את כל התבניות", () => {
    const tpl = makeTaskTemplate({ department_id: DEPT.bar });
    expect(templateVisibleForDailyChecklist(tpl, null, "maintenance")).toBe(false);
  });
});

describe("בניית הצ׳ק־ליסט של היום", () => {
  const args = (over: {
    tasks?: ReturnType<typeof makeTask>[];
    templates?: ReturnType<typeof makeTaskTemplate>[];
    deptId?: string | null;
  } = {}) =>
    buildTodayTasks(
      BUSINESS_ID,
      over.tasks ?? [],
      over.templates ?? [],
      USER.employee,
      over.deptId === undefined ? DEPT.bar : over.deptId,
      TODAY,
      WEDNESDAY,
      "employee",
    );

  it("תבנית פעילה של היום מופיעה כשורה וירטואלית", () => {
    const tpl = makeTaskTemplate({ id: "tpl-bins", title: "פחים", recurrence_weekday: [-1] });
    const out = args({ templates: [tpl] });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(`${VIRTUAL_TASK_PREFIX}tpl-bins`);
    expect(out[0].title).toBe("פחים");
    expect(out[0].status).toBe("open");
  });

  it("תבנית לא פעילה לא מוצגת", () => {
    expect(args({ templates: [makeTaskTemplate({ active: false })] })).toEqual([]);
  });

  it("תבנית של יום אחר בשבוע לא מוצגת היום", () => {
    expect(args({ templates: [makeTaskTemplate({ recurrence_weekday: [5] })] })).toEqual([]);
  });

  it("תבנית של כמה ימים מוצגת אם היום ברשימה", () => {
    expect(args({ templates: [makeTaskTemplate({ recurrence_weekday: [1, 3, 5] })] })).toHaveLength(1);
  });

  it("אחרי שהמשימה סומנה, השורה האמיתית מחליפה את הווירטואלית ולא מוצגת פעמיים", () => {
    const tpl = makeTaskTemplate({ id: "tpl-bins", title: "פחים" });
    const done = makeTask({
      template_id: "tpl-bins",
      title: "פחים",
      type: "recurring",
      recurrence_weekday: [-1],
      status: "done",
      due_date: TODAY,
      completed_at: `${TODAY}T18:00:00`,
    });
    const out = args({ templates: [tpl], tasks: [done] });
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("done");
  });

  it("משימה חד-פעמית שהוקצתה לעובד מופיעה", () => {
    const out = args({ tasks: [makeTask({ title: "לספור מלאי", due_date: TODAY })] });
    expect(out.map((t) => t.title)).toEqual(["לספור מלאי"]);
  });

  it("משימה של עובד אחר לא מופיעה", () => {
    const out = args({ tasks: [makeTask({ assigned_to: USER.employee2, due_date: TODAY })] });
    expect(out).toEqual([]);
  });

  it("משימה שממתינה לאישור מנהל עדיין לא הגיעה לעובד", () => {
    const out = args({ tasks: [makeTask({ approval_status: "pending", due_date: TODAY })] });
    expect(out).toEqual([]);
  });

  it("משימה שאושרה כן מופיעה", () => {
    const out = args({ tasks: [makeTask({ approval_status: "approved", due_date: TODAY })] });
    expect(out).toHaveLength(1);
  });

  it("משימה בלי תאריך יעד מוצגת עד שמסיימים אותה", () => {
    const out = args({ tasks: [makeTask({ due_date: null })] });
    expect(out).toHaveLength(1);
  });

  it("משימה שהושלמה אתמול לא מוצגת היום", () => {
    const out = args({
      tasks: [makeTask({ due_date: "2026-07-07", status: "done", completed_at: "2026-07-07T20:00:00" })],
    });
    expect(out).toEqual([]);
  });

  it("משימה שנפתחה אתמול ולא הושלמה מתגלגלת להיום", () => {
    const out = args({ tasks: [makeTask({ due_date: "2026-07-07", status: "open" })] });
    expect(out).toHaveLength(1);
  });

  it("משימות קבועות מוצגות לפני חד-פעמיות, ומה שבוצע יורד לסוף", () => {
    const out = args({
      templates: [makeTaskTemplate({ id: "tpl-a", title: "קבועה" })],
      tasks: [
        makeTask({ title: "חד-פעמית", due_date: TODAY }),
        makeTask({ title: "בוצעה", due_date: TODAY, status: "done", completed_at: `${TODAY}T10:00:00` }),
      ],
    });
    expect(out.map((t) => t.title)).toEqual(["קבועה", "חד-פעמית", "בוצעה"]);
  });

  it("עובד ללא מחלקה רואה רק תבניות כלל-עסקיות", () => {
    const out = args({
      deptId: null,
      templates: [
        makeTaskTemplate({ id: "tpl-global", title: "כללי", department_id: null }),
        makeTaskTemplate({ id: "tpl-bar", title: "בר", department_id: DEPT.bar }),
      ],
    });
    expect(out.map((t) => t.title)).toEqual(["כללי"]);
  });

  it("עובד בר לא רואה משימות מלצרות — רק בר + כללי למסעדה", () => {
    const out = buildTodayTasks(
      BUSINESS_ID,
      [],
      [
        makeTaskTemplate({ id: "tpl-bar", title: "ניקוי בר", department_id: DEPT.bar }),
        makeTaskTemplate({ id: "tpl-wait", title: "סידור שולחנות", department_id: DEPT.service }),
        makeTaskTemplate({ id: "tpl-all", title: "נעילה", department_id: null }),
      ],
      USER.employee,
      DEPT.bar,
      TODAY,
      WEDNESDAY,
      "employee",
      { personal: true },
    );
    expect(out.map((t) => t.title).sort()).toEqual(["נעילה", "ניקוי בר"].sort());
  });

  it("רשימות ריקות מחזירות רשימה ריקה", () => {
    expect(args()).toEqual([]);
  });
});

describe("משימה מחלקתית — שורה אחת לכל המחלקה", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T09:00:00`));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const deptTask = (over: Partial<ReturnType<typeof makeTask>> = {}) =>
    makeTask({
      title: "סידור שולחנות",
      event_id: "event-1",
      assigned_to: null,
      department_id: DEPT.bar,
      due_date: TODAY,
      ...over,
    });

  const checklist = (tasks: ReturnType<typeof makeTask>[], deptId: string | null) =>
    buildTodayTasks(BUSINESS_ID, tasks, [], USER.employee, deptId, TODAY, WEDNESDAY, "employee");

  it("מוצגת לכל עובד במחלקה בלי שיוך אישי", () => {
    expect(isDepartmentTask(deptTask())).toBe(true);
    expect(taskBelongsToEmployee(deptTask(), USER.employee, DEPT.bar)).toBe(true);
    expect(taskBelongsToEmployee(deptTask(), USER.employee2, DEPT.bar)).toBe(true);
  });

  it("לא מוצגת לעובדי מחלקה אחרת או לעובד בלי מחלקה", () => {
    expect(taskBelongsToEmployee(deptTask(), USER.employee, DEPT.kitchen)).toBe(false);
    expect(taskBelongsToEmployee(deptTask(), USER.employee, null)).toBe(false);
  });

  it("משימה עם שיוך אישי נשארת אישית גם אם יש לה מחלקה", () => {
    const personal = deptTask({ assigned_to: USER.employee2 });
    expect(isDepartmentTask(personal)).toBe(false);
    expect(taskBelongsToEmployee(personal, USER.employee, DEPT.bar)).toBe(false);
  });

  it("מופיעה בצ׳ק־ליסט היומי של עובדי המחלקה בלבד", () => {
    expect(checklist([deptTask()], DEPT.bar).map((t) => t.title)).toEqual(["סידור שולחנות"]);
    expect(checklist([deptTask()], DEPT.kitchen)).toEqual([]);
  });

  it("סימון ביצוע סוגר אותה לכל המחלקה", () => {
    const done = deptTask({ status: "done", completed_at: `${TODAY}T10:00:00` });
    expect(checklist([done], DEPT.bar)[0].status).toBe("done");
    expect(
      pendingTasksForEmployee([done], [], USER.employee2, DEPT.bar, WEDNESDAY, "employee"),
    ).toEqual([]);
  });

  it("כל עוד היא פתוחה — חוסמת יציאה ממשמרת לעובדי המחלקה", () => {
    expect(
      pendingTasksForEmployee([deptTask()], [], USER.employee, DEPT.bar, WEDNESDAY, "employee"),
    ).toEqual([{ title: "סידור שולחנות", type: "one_time" }]);
    expect(
      pendingTasksForEmployee([deptTask()], [], USER.employee, DEPT.kitchen, WEDNESDAY, "employee"),
    ).toEqual([]);
  });
});

describe("משימות אירוע לעובד", () => {
  const eventTask = (over: Partial<ReturnType<typeof makeTask>> = {}) =>
    makeTask({
      title: "סידור במה",
      event_id: "event-1",
      assigned_to: null,
      department_id: DEPT.bar,
      due_date: "2026-08-02",
      status: "open",
      ...over,
    });

  it("מציג משימות אירוע פתוחות של המחלקה גם אם תאריך היעד עתידי", () => {
    const out = buildEmployeeEventTasks([eventTask()], USER.employee, DEPT.bar);
    expect(out.map((t) => t.title)).toEqual(["סידור במה"]);
  });

  it("לא מציג משימות אירוע שהושלמו", () => {
    expect(
      buildEmployeeEventTasks(
        [eventTask({ status: "done", completed_at: "2026-07-08T10:00:00" })],
        USER.employee,
        DEPT.bar,
      ),
    ).toEqual([]);
  });

  it("לא מציג משימות אירוע של מחלקה אחרת", () => {
    expect(buildEmployeeEventTasks([eventTask()], USER.employee, DEPT.kitchen)).toEqual([]);
  });
});

describe("מפתח פתיחה/סגירה של כרטיס משימה", () => {
  it("שורה מתבנית שומרת מפתח יציב גם אחרי שהפכה לשורה אמיתית", () => {
    const virtual = virtualRecurringTask(makeTaskTemplate({ id: "tpl-x" }), USER.employee, BUSINESS_ID);
    const materialized = makeTask({ id: "task-real", template_id: "tpl-x", type: "recurring" });
    expect(taskExpansionKey(virtual)).toBe(taskExpansionKey(materialized));
  });

  it("משימה חד-פעמית משתמשת במזהה שלה", () => {
    expect(taskExpansionKey(makeTask({ id: "task-1", template_id: null }))).toBe("task-1");
  });
});

describe("נראות שורה בצ׳ק־ליסט", () => {
  it("משימה קבועה של היום מוצגת", () => {
    const task = makeTask({ type: "recurring", recurrence_weekday: [-1], due_date: TODAY });
    expect(isTaskVisibleInDailyChecklist(task, TODAY)).toBe(true);
  });

  it("משימה קבועה של יום אחר לא מוצגת", () => {
    const task = makeTask({ type: "recurring", recurrence_weekday: [1], due_date: TODAY });
    expect(isTaskVisibleInDailyChecklist(task, TODAY)).toBe(false);
  });

  it("משימה שהושלמה היום נשארת גלויה עד סוף היום", () => {
    const task = makeTask({ due_date: "2026-07-01", status: "done", completed_at: `${TODAY}T09:00:00` });
    expect(isTaskVisibleInDailyChecklist(task, TODAY)).toBe(true);
  });
});

describe("חסימת יציאה ממשמרת בגלל משימות פתוחות", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T22:00:00`));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const pending = (over: {
    tasks?: ReturnType<typeof makeTask>[];
    templates?: ReturnType<typeof makeTaskTemplate>[];
    deptId?: string | null;
  } = {}) =>
    pendingTasksForEmployee(
      over.tasks ?? [],
      over.templates ?? [],
      USER.employee,
      over.deptId === undefined ? DEPT.bar : over.deptId,
      WEDNESDAY,
      "employee",
    );

  it("תבנית שלא סומנה היום נספרת כפתוחה", () => {
    const out = pending({ templates: [makeTaskTemplate({ title: "פחים" })] });
    expect(out).toEqual([{ title: "פחים", type: "recurring" }]);
  });

  it("אחרי שסימנו — לא נספרת יותר", () => {
    const tpl = makeTaskTemplate({ id: "tpl-bins", title: "פחים" });
    const done = makeTask({
      template_id: "tpl-bins",
      type: "recurring",
      recurrence_weekday: [-1],
      status: "done",
      due_date: TODAY,
    });
    expect(pending({ templates: [tpl], tasks: [done] })).toEqual([]);
  });

  it("משימה חד-פעמית פתוחה של היום חוסמת יציאה", () => {
    const out = pending({ tasks: [makeTask({ title: "לנקות מקרר", due_date: TODAY })] });
    expect(out).toEqual([{ title: "לנקות מקרר", type: "one_time" }]);
  });

  it("משימה שבוצעה לא חוסמת", () => {
    const out = pending({ tasks: [makeTask({ due_date: TODAY, status: "done" })] });
    expect(out).toEqual([]);
  });

  it("משימה שממתינה לאישור לא חוסמת — היא עוד לא הגיעה לעובד", () => {
    const out = pending({ tasks: [makeTask({ due_date: TODAY, approval_status: "pending" })] });
    expect(out).toEqual([]);
  });

  it("משימה עתידית לא חוסמת יציאה היום", () => {
    const out = pending({ tasks: [makeTask({ due_date: "2026-07-20" })] });
    expect(out).toEqual([]);
  });

  it("משימה שעבר זמנה מתגלגלת להיום וחוסמת", () => {
    const out = pending({ tasks: [makeTask({ title: "באיחור", due_date: "2026-07-01" })] });
    expect(out).toEqual([{ title: "באיחור", type: "one_time" }]);
  });

  it("משימה של עובד אחר לא חוסמת אותי", () => {
    const out = pending({ tasks: [makeTask({ assigned_to: USER.employee2, due_date: TODAY })] });
    expect(out).toEqual([]);
  });

  it("אין משימות — היציאה חופשית", () => {
    expect(pending()).toEqual([]);
  });
});
