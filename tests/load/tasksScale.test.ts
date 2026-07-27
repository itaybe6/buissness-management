/**
 * בדיקות עומס — משימות בעסק עם היסטוריה ארוכה.
 *
 * טבלת המשימות צוברת שורות: כל סימון של משימה קבועה יוצר שורה. אחרי שנה
 * מדובר באלפי שורות שהאפליקציה טוענת ומסננת בכל פתיחה של הצ׳ק־ליסט.
 * הבדיקות מוודאות שהעובד עדיין רואה בדיוק את המשימות של היום.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTodayTasks, isTaskVisibleInDailyChecklist } from "@/lib/todayTasks";
import { pendingTasksForEmployee } from "@/lib/pendingTasks";
import { matchesRecurrenceWeekday, serializeRecurrenceWeekdays } from "@/lib/taskRecurrence";
import { assertScalesLinearly, assertWithinBudget, measureBest } from "../helpers/perf";
import { BUSINESS_ID, DEPT, USER, makeTask, makeTaskTemplate } from "../helpers/factories";
import type { Task, TaskTemplate } from "@/types/database";

/** רביעי 08/07/2026. */
const TODAY = "2026-07-08";
const WEDNESDAY = 3;

const TEMPLATE_COUNT = 150;
const EMPLOYEE_COUNT = 60;
const HISTORY_DAYS = 180;

const templates: TaskTemplate[] = Array.from({ length: TEMPLATE_COUNT }, (_, i) =>
  makeTaskTemplate({
    id: `tpl-${i}`,
    title: `משימה קבועה ${i}`,
    department_id: i % 3 === 0 ? null : i % 3 === 1 ? DEPT.bar : DEPT.kitchen,
    recurrence_weekday: i % 5 === 0 ? [-1] : [i % 7],
    active: i % 20 !== 0,
  }),
);

/** חצי שנה של שורות שנוצרו מסימון משימות קבועות + משימות חד-פעמיות. */
function buildHistory(employeeCount: number): Task[] {
  const tasks: Task[] = [];
  for (let e = 0; e < employeeCount; e++) {
    const employeeId = e === 0 ? USER.employee : `emp-${e}`;
    for (let d = 0; d < HISTORY_DAYS; d++) {
      const date = new Date("2026-07-08T12:00:00");
      date.setDate(date.getDate() - d);
      const iso = date.toISOString().slice(0, 10);
      const templateIndex = (e + d) % TEMPLATE_COUNT;

      tasks.push(
        makeTask({
          id: `done-${e}-${d}`,
          template_id: `tpl-${templateIndex}`,
          type: "recurring",
          recurrence_weekday: templates[templateIndex].recurrence_weekday,
          assigned_to: employeeId,
          due_date: iso,
          status: "done",
          completed_at: `${iso}T20:00:00`,
        }),
      );

      if (d % 30 === 0) {
        tasks.push(
          makeTask({
            id: `one-${e}-${d}`,
            title: `משימה חד-פעמית ${e}-${d}`,
            type: "one_time",
            assigned_to: employeeId,
            due_date: iso,
            status: d === 0 ? "open" : "done",
            completed_at: d === 0 ? null : `${iso}T20:00:00`,
          }),
        );
      }
    }
  }
  return tasks;
}

const history = buildHistory(EMPLOYEE_COUNT);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T22:00:00`));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("היקף נתוני המשימות", () => {
  it("ההיסטוריה בסדר גודל של חצי שנה לעסק שלם", () => {
    expect(templates).toHaveLength(TEMPLATE_COUNT);
    expect(history.length).toBeGreaterThan(10_000);
  });
});

describe("צ׳ק־ליסט יומי מתוך היסטוריה ארוכה", () => {
  function checklist(tasks = history) {
    return buildTodayTasks(BUSINESS_ID, tasks, templates, USER.employee, DEPT.bar, TODAY, WEDNESDAY, "employee");
  }

  it("נבנה במהירות גם מול אלפי שורות", () => {
    const { result, ms } = measureBest(() => checklist());
    assertWithinBudget("צ׳ק־ליסט יומי מתוך 10,000+ שורות", ms, 2000);
    expect(result.length).toBeGreaterThan(0);
  });

  it("מציג רק משימות של היום — לא של אתמול ולא של חודש שעבר", () => {
    for (const task of checklist()) {
      if (task.id.startsWith("tpl-")) continue; // שורה וירטואלית של היום
      expect(isTaskVisibleInDailyChecklist(task, TODAY)).toBe(true);
    }
  });

  it("לא מציג משימות של עובדים אחרים", () => {
    for (const task of checklist()) {
      expect([USER.employee, null]).toContain(task.assigned_to);
    }
  });

  it("כל שורה מופיעה פעם אחת בלבד", () => {
    const ids = checklist().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("תבניות לא פעילות ותבניות של מחלקה אחרת לא מגיעות לצ׳ק־ליסט", () => {
    const virtualTemplateIds = checklist()
      .filter((t) => t.id.startsWith("tpl-"))
      .map((t) => t.template_id!);
    for (const id of virtualTemplateIds) {
      const tpl = templates.find((t) => t.id === id)!;
      expect(tpl.active).toBe(true);
      expect([null, DEPT.bar]).toContain(tpl.department_id);
      expect(matchesRecurrenceWeekday(tpl.recurrence_weekday, WEDNESDAY)).toBe(true);
    }
  });

  it("הזמן גדל ליניארית עם היקף ההיסטוריה", () => {
    const small = buildHistory(15);
    const large = buildHistory(60);
    const smallMs = measureBest(() => checklist(small)).ms;
    const largeMs = measureBest(() => checklist(large)).ms;
    assertScalesLinearly({ label: "צ׳ק־ליסט יומי", smallMs, largeMs, ratio: 4, maxGrowthFactor: 20 });
  });
});

describe("חסימת יציאה ממשמרת בהיקף מלא", () => {
  it("מחשבת את המשימות הפתוחות במהירות", () => {
    const { result: pending, ms } = measureBest(() =>
      pendingTasksForEmployee(history, templates, USER.employee, DEPT.bar, WEDNESDAY, "employee"),
    );
    assertWithinBudget("חישוב משימות פתוחות מתוך 10,000+ שורות", ms, 2000);

    for (const item of pending) {
      expect(item.title).toBeTruthy();
      expect(["recurring", "one_time"]).toContain(item.type);
    }
  });

  it("משימות שהושלמו בעבר לא נחשבות פתוחות היום", () => {
    const pending = pendingTasksForEmployee(history, templates, USER.employee, DEPT.bar, WEDNESDAY, "employee");
    const titles = new Set(pending.map((p) => p.title));
    // כל המשימות החד-פעמיות שהושלמו בעבר נושאות שם ייחודי עם התאריך
    expect([...titles].some((t) => t.startsWith("משימה חד-פעמית 0-30"))).toBe(false);
  });

  it("הרשימה עקבית בין הרצות", () => {
    const first = pendingTasksForEmployee(history, templates, USER.employee, DEPT.bar, WEDNESDAY, "employee");
    const second = pendingTasksForEmployee(history, templates, USER.employee, DEPT.bar, WEDNESDAY, "employee");
    expect(second).toEqual(first);
  });
});

describe("נרמול ימי חזרה בהיקף מלא", () => {
  it("כל תבנית מנורמלת לערך תקין לשמירה", () => {
    const { result: serialized, ms } = measureBest(() =>
      templates.map((t) => serializeRecurrenceWeekdays(t.recurrence_weekday)),
    );
    assertWithinBudget("נרמול 150 תבניות", ms, 500);

    for (const days of serialized) {
      expect(days.length).toBeGreaterThan(0);
      for (const d of days) expect(d === -1 || (d >= 0 && d <= 6)).toBe(true);
    }
  });

  it("התאמה ליום בשבוע עקבית לכל התבניות", () => {
    for (const tpl of templates) {
      const matchesAnyDay = [0, 1, 2, 3, 4, 5, 6].some((d) => matchesRecurrenceWeekday(tpl.recurrence_weekday, d));
      expect(matchesAnyDay, tpl.id).toBe(true);
    }
  });
});
