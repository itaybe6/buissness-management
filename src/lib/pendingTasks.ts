import type { Task, TaskTemplate } from "@/types/database";
import { matchesRecurrenceWeekday } from "@/lib/taskRecurrence";

export interface PendingTask {
  title: string;
  type: "recurring" | "one_time";
}

/**
 * Tasks that are still open for an employee right now — mirrors the daily checklist:
 *  - today's recurring tasks for their department (or business-wide, department_id = null)
 *  - one-time tasks assigned to them that aren't done yet.
 * Used both by the Tasks checklist and the clock-out reminder.
 */
export function pendingTasksForEmployee(
  tasks: Task[],
  templates: TaskTemplate[],
  profileId: string,
  deptId: string | null,
  weekday: number,
): PendingTask[] {
  const result: PendingTask[] = [];

  // Recurring templates of today not yet turned into a real row → still open.
  const materializedTemplateIds = new Set(
    tasks.filter((t) => t.assigned_to === profileId && t.template_id).map((t) => t.template_id),
  );
  templates.forEach((t) => {
    if (
      t.active &&
      matchesRecurrenceWeekday(t.recurrence_weekday, weekday) &&
      (t.department_id == null || t.department_id === deptId) &&
      !materializedTemplateIds.has(t.id)
    ) {
      result.push({ title: t.title, type: "recurring" });
    }
  });

  // Real rows assigned to the employee that aren't done (pending-approval rows haven't reached them).
  tasks.forEach((t) => {
    if (t.assigned_to !== profileId || t.approval_status === "pending" || t.status === "done") return;
    if (t.type === "recurring") {
      if (matchesRecurrenceWeekday(t.recurrence_weekday, weekday)) result.push({ title: t.title, type: "recurring" });
    } else {
      result.push({ title: t.title, type: "one_time" });
    }
  });

  return result;
}
