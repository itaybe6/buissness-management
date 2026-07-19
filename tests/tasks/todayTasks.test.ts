import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pendingTasksForEmployee } from "@/lib/pendingTasks";
import {
  buildTodayTasks,
  isRecurringTaskForDate,
  isTaskVisibleInDailyChecklist,
  recurringMaterializedTemplateIds,
  recurringOccurrenceDate,
  VIRTUAL_TASK_PREFIX,
} from "@/lib/todayTasks";
import type { Task, TaskTemplate } from "@/types/database";

const BUSINESS_ID = "biz-1";
const PROFILE_ID = "emp-1";
const TEMPLATE_ID = "tpl-bins";
const TODAY = "2026-07-13"; // Monday
const YESTERDAY = "2026-07-12"; // Sunday
const TODAY_WEEKDAY = 1;

const YESTERDAY_MEDIA = [
  "https://example.com/bins-1.jpg",
  "https://example.com/bins-2.jpg",
  "https://example.com/bins-3.jpg",
];

const template: TaskTemplate = {
  id: TEMPLATE_ID,
  business_id: BUSINESS_ID,
  title: "פחים",
  description: "לפנות את הפחים",
  recurrence_weekday: [-1],
  department_id: null,
  active: true,
  created_at: "2026-01-01T00:00:00Z",
};

function recurringTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-yesterday",
    business_id: BUSINESS_ID,
    template_id: TEMPLATE_ID,
    title: "פחים",
    description: "לפנות את הפחים",
    type: "recurring",
    assigned_to: PROFILE_ID,
    assigned_by: null,
    due_date: null,
    recurrence_weekday: [-1],
    status: "done",
    approval_status: null,
    photo_url: null,
    media_urls: YESTERDAY_MEDIA,
    completed_at: `${YESTERDAY}T18:00:00.000Z`,
    last_documented_by: null,
    last_documented_at: null,
    created_at: `${YESTERDAY}T10:00:00.000Z`,
    updated_at: `${YESTERDAY}T18:00:00.000Z`,
    ...overrides,
  };
}

function todayChecklist(
  tasks: Task[],
  templates: TaskTemplate[] = [template],
) {
  return buildTodayTasks(
    BUSINESS_ID,
    tasks,
    templates,
    PROFILE_ID,
    null,
    TODAY,
    TODAY_WEEKDAY,
    "employee",
  );
}

describe("recurring task daily reset — פחים with yesterday documentation", () => {
  const yesterdayRow = recurringTask();

  it("does not treat yesterday's completed row as today's occurrence", () => {
    expect(isRecurringTaskForDate(yesterdayRow, TODAY)).toBe(false);
    expect(recurringOccurrenceDate(yesterdayRow)).toBe(YESTERDAY);
  });

  it("hides yesterday's row from today's daily checklist", () => {
    expect(isTaskVisibleInDailyChecklist(yesterdayRow, TODAY)).toBe(false);
  });

  it("does not block a fresh virtual task for today", () => {
    const materialized = recurringMaterializedTemplateIds([yesterdayRow], PROFILE_ID, TODAY);
    expect(materialized.has(TEMPLATE_ID)).toBe(false);
  });

  it("shows פחים as a new open task without yesterday's media", () => {
    const checklist = todayChecklist([yesterdayRow]);

    expect(checklist).toHaveLength(1);
    expect(checklist[0]).toMatchObject({
      id: `${VIRTUAL_TASK_PREFIX}${TEMPLATE_ID}`,
      title: "פחים",
      type: "recurring",
      status: "open",
      media_urls: [],
      completed_at: null,
    });
  });

  it("counts 0% done today — not 100% from yesterday", () => {
    const checklist = todayChecklist([yesterdayRow]);
    const doneCount = checklist.filter((t) => t.status === "done").length;

    expect(doneCount).toBe(0);
    expect(checklist.length - doneCount).toBe(1);
  });

  it("lists פחים as pending again when clocking out today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T12:00:00`));

    const pending = pendingTasksForEmployee(
      [yesterdayRow],
      [template],
      PROFILE_ID,
      null,
      TODAY_WEEKDAY,
      "employee",
    );

    expect(pending).toEqual([{ title: "פחים", type: "recurring" }]);

    vi.useRealTimers();
  });

  it("after completing today, shows today's row with today's media only", () => {
    const todayRow = recurringTask({
      id: "task-today",
      due_date: TODAY,
      status: "done",
      completed_at: `${TODAY}T17:30:00.000Z`,
      media_urls: ["https://example.com/bins-today.jpg"],
      created_at: `${TODAY}T09:00:00.000Z`,
      updated_at: `${TODAY}T17:30:00.000Z`,
    });

    const checklist = todayChecklist([yesterdayRow, todayRow]);

    expect(checklist).toHaveLength(1);
    expect(checklist[0].id).toBe("task-today");
    expect(checklist[0].media_urls).toEqual(["https://example.com/bins-today.jpg"]);
    expect(checklist[0].media_urls).not.toEqual(YESTERDAY_MEDIA);
  });
});

describe("recurringOccurrenceDate", () => {
  it("prefers due_date over completed_at", () => {
    expect(
      recurringOccurrenceDate({
        due_date: TODAY,
        completed_at: `${YESTERDAY}T18:00:00.000Z`,
        created_at: `${YESTERDAY}T10:00:00.000Z`,
      }),
    ).toBe(TODAY);
  });

  it("falls back to completed_at for legacy rows", () => {
    expect(
      recurringOccurrenceDate({
        due_date: null,
        completed_at: `${YESTERDAY}T18:00:00.000Z`,
        created_at: `${YESTERDAY}T10:00:00.000Z`,
      }),
    ).toBe(YESTERDAY);
  });
});

describe("isRecurringTaskForDate", () => {
  it("includes today's materialized recurring row", () => {
    expect(
      isRecurringTaskForDate(
        recurringTask({
          due_date: TODAY,
          completed_at: `${TODAY}T18:00:00.000Z`,
        }),
        TODAY,
      ),
    ).toBe(true);
  });
});

describe("pendingTasksForEmployee with frozen clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T08:00:00`));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not treat yesterday's done recurring row as still open today", () => {
    const pending = pendingTasksForEmployee(
      [recurringTask({ status: "done" })],
      [template],
      PROFILE_ID,
      null,
      TODAY_WEEKDAY,
      "employee",
    );

    // Virtual template is still open → appears as pending until completed today.
    expect(pending).toEqual([{ title: "פחים", type: "recurring" }]);
  });

  it("does not list recurring task as pending once today's row is done", () => {
    const pending = pendingTasksForEmployee(
      [
        recurringTask({
          id: "task-today",
          due_date: TODAY,
          status: "done",
          completed_at: `${TODAY}T12:00:00.000Z`,
        }),
      ],
      [template],
      PROFILE_ID,
      null,
      TODAY_WEEKDAY,
      "employee",
    );

    expect(pending).toEqual([]);
  });
});
