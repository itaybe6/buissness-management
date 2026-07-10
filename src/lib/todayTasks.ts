import { DAILY_CHECKLIST_ALL_DEPT_ROLES } from "@/lib/constants";
import { matchesRecurrenceWeekday } from "@/lib/taskRecurrence";
import type { Task, TaskTemplate, UserRole } from "@/types/database";

export const VIRTUAL_TASK_PREFIX = "tpl-";

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
    created_at: t.created_at,
    updated_at: t.created_at,
  };
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

  const materializedTemplateIds = new Set(
    tasks.filter((t) => t.assigned_to === profileId && t.template_id).map((t) => t.template_id),
  );

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
    ...mine.filter((t) => {
      if (t.type === "recurring") return matchesRecurrenceWeekday(t.recurrence_weekday, todayWeekday);
      if (t.status !== "done") return true;
      return t.due_date === today;
    }),
  ].sort((a, b) => {
    if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
    return a.type === b.type ? 0 : a.type === "recurring" ? -1 : 1;
  });
}
