import { DAILY_CHECKLIST_ALL_DEPT_ROLES } from "@/lib/constants";
import { matchesRecurrenceWeekday } from "@/lib/taskRecurrence";
import type { Task, TaskTemplate, UserRole } from "@/types/database";

export const VIRTUAL_TASK_PREFIX = "tpl-";

/** Stable key for expand/collapse — survives virtual → materialized id change. */
export function taskExpansionKey(task: Pick<Task, "id" | "template_id">): string {
  if (task.template_id) return `${VIRTUAL_TASK_PREFIX}${task.template_id}`;
  return task.id;
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

export function virtualRecurringTask(t: TaskTemplate, profileId: string, businessId: string): Task {
  return {
    id: `${VIRTUAL_TASK_PREFIX}${t.id}`,
    business_id: businessId,
    template_id: t.id,
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

function completedToday(task: Pick<Task, "completed_at">, today: string): boolean {
  return !!task.completed_at && task.completed_at.startsWith(today);
}

/** Whether an assigned row belongs on today's checklist (any status, including done). */
export function isTaskVisibleInDailyChecklist(
  task: Task,
  today: string,
): boolean {
  if (task.type === "recurring") {
    return isRecurringTaskForDate(task, today);
  }
  if (task.status !== "done") return true;
  if (task.due_date === today) return true;
  if (completedToday(task, today)) return true;
  return false;
}

export function templateVisibleForDailyChecklist(
  template: Pick<TaskTemplate, "department_id">,
  deptId: string | null,
  role?: UserRole | null,
): boolean {
  if (template.department_id == null) return true;
  if (deptId != null && template.department_id === deptId) return true;
  if (deptId == null && role && DAILY_CHECKLIST_ALL_DEPT_ROLES.includes(role)) return true;
  return false;
}

/** Daily checklist: recurring templates for today + assigned one-time / recurring rows. */
export function buildTodayTasks(
  businessId: string,
  tasks: Task[],
  templates: TaskTemplate[],
  profileId: string,
  deptId: string | null,
  today: string,
  todayWeekday: number,
  role?: UserRole | null,
): Task[] {
  const mine = tasks.filter((t) => t.assigned_to === profileId && t.approval_status !== "pending");

  const materializedTemplateIds = recurringMaterializedTemplateIds(tasks, profileId, today);

  const virtualToday = templates
    .filter(
      (t) =>
        t.active &&
        matchesRecurrenceWeekday(t.recurrence_weekday, todayWeekday) &&
        templateVisibleForDailyChecklist(t, deptId, role) &&
        !materializedTemplateIds.has(t.id),
    )
    .map((t) => virtualRecurringTask(t, profileId, businessId));

  return [
    ...virtualToday,
    ...mine.filter((t) => isTaskVisibleInDailyChecklist(t, today)),
  ].sort((a, b) => {
    if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
    return a.type === b.type ? 0 : a.type === "recurring" ? -1 : 1;
  });
}
