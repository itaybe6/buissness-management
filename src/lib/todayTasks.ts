import { DAILY_CHECKLIST_ALL_DEPT_ROLES } from "@/lib/constants";
import { matchesRecurrenceWeekday } from "@/lib/taskRecurrence";
import type { Task, TaskTemplate, UserRole } from "@/types/database";

export const VIRTUAL_TASK_PREFIX = "tpl-";

/** Stable key for expand/collapse — survives virtual → materialized id change. */
export function taskExpansionKey(task: Pick<Task, "id" | "template_id">): string {
  if (task.template_id) return `${VIRTUAL_TASK_PREFIX}${task.template_id}`;
  return task.id;
}

/** Capture checklist order for the current page session. */
export function captureSessionTaskOrder(tasks: Task[]): Map<string, number> {
  return new Map(tasks.map((t, i) => [taskExpansionKey(t), i]));
}

/** Append newly appeared tasks to the end of a frozen session order. */
export function extendSessionTaskOrder(order: Map<string, number>, tasks: Task[]): void {
  for (const t of tasks) {
    const key = taskExpansionKey(t);
    if (!order.has(key)) order.set(key, order.size);
  }
}

/** Re-sort tasks by a frozen session order instead of live status/type rules. */
export function applySessionTaskOrder(tasks: Task[], orderByKey: Map<string, number>): Task[] {
  return [...tasks].sort((a, b) => {
    const aIdx = orderByKey.get(taskExpansionKey(a)) ?? Number.MAX_SAFE_INTEGER;
    const bIdx = orderByKey.get(taskExpansionKey(b)) ?? Number.MAX_SAFE_INTEGER;
    return aIdx - bIdx;
  });
}

function weekdayFromDate(date: string): number {
  return new Date(date + "T12:00:00").getDay();
}

/** Calendar day a materialized recurring task row belongs to. */
export function recurringOccurrenceDate(
  task: Pick<Task, "due_date" | "completed_at" | "created_at">,
): string | null {
  if (task.due_date) return task.due_date;
  if (task.completed_at) return task.completed_at.slice(0, 10);
  return null;
}

/** Whether a materialized recurring row belongs on a given calendar day. */
export function isRecurringTaskForDate(
  task: Pick<Task, "type" | "recurrence_weekday" | "due_date" | "completed_at" | "created_at">,
  date: string,
): boolean {
  if (task.type !== "recurring") return false;
  if (!matchesRecurrenceWeekday(task.recurrence_weekday, weekdayFromDate(date))) return false;

  const occurrence = recurringOccurrenceDate(task);
  if (occurrence) return occurrence === date;

  // Legacy rows without an explicit occurrence date: only show on the day they were created.
  return task.created_at.startsWith(date);
}

export function recurringMaterializedTemplateIds(
  tasks: Task[],
  profileId: string,
  date: string,
): Set<string> {
  const ids = new Set<string>();
  for (const t of tasks) {
    if (t.assigned_to !== profileId || !t.template_id || t.type !== "recurring") continue;
    if (isRecurringTaskForDate(t, date)) ids.add(t.template_id);
  }
  return ids;
}

/** משימה משותפת למחלקה — שורה אחת בלי assigned_to שכל עובדי המחלקה רואים ויכולים לטפל בה. */
export function isDepartmentTask(
  task: Pick<Task, "assigned_to" | "department_id">,
): boolean {
  return !task.assigned_to && task.department_id != null;
}

/** האם שורת משימה קיימת מיועדת לעובד — שיוך אישי או שיוך למחלקה שלו. */
export function taskBelongsToEmployee(
  task: Pick<Task, "assigned_to" | "department_id">,
  profileId: string,
  deptId: string | null,
): boolean {
  if (task.assigned_to) return task.assigned_to === profileId;
  return isDepartmentTask(task) && deptId != null && task.department_id === deptId;
}

export function virtualRecurringTask(t: TaskTemplate, profileId: string, businessId: string): Task {
  return {
    id: `${VIRTUAL_TASK_PREFIX}${t.id}`,
    business_id: businessId,
    template_id: t.id,
    event_id: null,
    department_id: t.department_id,
    title: t.title,
    description: t.description,
    type: "recurring",
    assigned_to: profileId,
    assigned_by: null,
    due_date: null,
    recurrence_weekday: t.recurrence_weekday,
    status: "open",
    approval_status: null,
    photo_url: null,
    media_urls: [],
    completed_at: null,
    last_documented_by: null,
    last_documented_at: null,
    created_at: t.created_at,
    updated_at: t.created_at,
  };
}


/** Open one-time tasks with a past due date roll forward to today. */
export function effectiveOneTimeDueDate(
  task: Pick<Task, "type" | "status" | "due_date">,
  today: string,
): string | null {
  if (task.type !== "one_time" || !task.due_date) return task.due_date;
  if (task.status === "done") return task.due_date;
  return task.due_date < today ? today : task.due_date;
}

export function oneTimeTaskNeedsDueDateRollover(
  task: Pick<Task, "type" | "status" | "due_date">,
  today: string,
): boolean {
  return (
    task.type === "one_time" &&
    !!task.due_date &&
    task.due_date < today &&
    task.status !== "done"
  );
}

/** Week grid / calendar cell for a one-time task row. */
export function isOneTimeTaskForDate(
  task: Pick<Task, "type" | "status" | "due_date" | "completed_at">,
  date: string,
  today: string,
): boolean {
  if (task.type !== "one_time") return false;
  if (task.status === "done") {
    if (task.due_date === date) return true;
    return !!task.completed_at && task.completed_at.startsWith(date);
  }
  if (!task.due_date) return false;
  return effectiveOneTimeDueDate(task, today) === date;
}

function completedOnDate(task: Pick<Task, "completed_at">, date: string): boolean {
  return !!task.completed_at && task.completed_at.startsWith(date);
}

/** Whether an assigned row belongs on a daily checklist for a given calendar day. */
export function isTaskVisibleInDailyChecklistForDate(
  task: Task,
  date: string,
  referenceToday: string,
): boolean {
  if (task.type === "recurring") {
    return isRecurringTaskForDate(task, date);
  }
  if (task.status !== "done") {
    if (!task.due_date) return date === referenceToday;
    if (date === referenceToday) {
      return effectiveOneTimeDueDate(task, referenceToday) === referenceToday;
    }
    return task.due_date === date;
  }
  if (task.due_date === date) return true;
  if (completedOnDate(task, date)) return true;
  return false;
}

/** Whether an assigned row belongs on today's checklist (any status, including done). */
export function isTaskVisibleInDailyChecklist(
  task: Task,
  today: string,
): boolean {
  return isTaskVisibleInDailyChecklistForDate(task, today, today);
}

export type ChecklistDeptScope = {
  /**
   * Personal worker dashboard / clock-out: only own department + restaurant-wide
   * templates. Never expand to all departments (even for shift managers).
   */
  personal?: boolean;
  /**
   * Shift-manager / tracking dashboards: every department's templates,
   * even when the viewer has a department of their own.
   */
  allDepartments?: boolean;
};

/**
 * Which fixed templates belong on an employee's daily checklist.
 * - `department_id = null` → כלל המסעדה (everyone)
 * - matching `department_id` → only that department
 * - `scope.allDepartments` → every department (אחמ״ש dashboard)
 * - managers/shift managers without a department may see all departments,
 *   unless `scope.personal` (worker home / punch) is set
 */
export function templateVisibleForDailyChecklist(
  template: Pick<TaskTemplate, "department_id">,
  deptId: string | null,
  role?: UserRole | null,
  scope?: ChecklistDeptScope,
): boolean {
  if (template.department_id == null) return true;
  if (scope?.allDepartments) return true;
  if (deptId != null && template.department_id === deptId) return true;
  if (
    !scope?.personal &&
    deptId == null &&
    role &&
    DAILY_CHECKLIST_ALL_DEPT_ROLES.includes(role)
  ) {
    return true;
  }
  return false;
}

/** Open event tasks assigned to the employee (personal or department-wide). */
export function buildEmployeeEventTasks(
  tasks: Task[],
  profileId: string,
  deptId: string | null,
  options?: { manageAll?: boolean },
): Task[] {
  return tasks
    .filter(
      (t) =>
        t.event_id != null &&
        t.approval_status !== "pending" &&
        t.status !== "done" &&
        (options?.manageAll || taskBelongsToEmployee(t, profileId, deptId)),
    )
    .sort((a, b) => {
      const aDue = a.due_date ?? "9999-12-31";
      const bDue = b.due_date ?? "9999-12-31";
      if (aDue !== bDue) return aDue.localeCompare(bDue);
      return a.created_at.localeCompare(b.created_at);
    });
}

function sortDailyChecklistTasks(a: Task, b: Task): number {
  if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
  return a.type === b.type ? 0 : a.type === "recurring" ? -1 : 1;
}

/** Daily checklist for a calendar day: recurring templates + assigned rows. */
export function buildTasksForDate(
  businessId: string,
  tasks: Task[],
  templates: TaskTemplate[],
  profileId: string,
  deptId: string | null,
  date: string,
  referenceToday: string,
  role?: UserRole | null,
  scope?: ChecklistDeptScope,
): Task[] {
  const weekday = weekdayFromDate(date);
  const mine = tasks.filter(
    (t) => taskBelongsToEmployee(t, profileId, deptId) && t.approval_status !== "pending",
  );

  const materializedTemplateIds = recurringMaterializedTemplateIds(tasks, profileId, date);

  const virtualForDate = templates
    .filter(
      (t) =>
        t.active &&
        matchesRecurrenceWeekday(t.recurrence_weekday, weekday) &&
        templateVisibleForDailyChecklist(t, deptId, role, scope) &&
        !materializedTemplateIds.has(t.id),
    )
    .map((t) => virtualRecurringTask(t, profileId, businessId));

  return [
    ...virtualForDate,
    ...mine.filter((t) => isTaskVisibleInDailyChecklistForDate(t, date, referenceToday)),
  ].sort(sortDailyChecklistTasks);
}

/** Daily checklist: recurring templates for today + assigned one-time / recurring rows. */
export function buildTodayTasks(
  businessId: string,
  tasks: Task[],
  templates: TaskTemplate[],
  profileId: string,
  deptId: string | null,
  today: string,
  _todayWeekday: number,
  role?: UserRole | null,
  scope?: ChecklistDeptScope,
): Task[] {
  return buildTasksForDate(
    businessId,
    tasks,
    templates,
    profileId,
    deptId,
    today,
    today,
    role,
    scope,
  );
}
