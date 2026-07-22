import type { Task, TaskTemplate, UserRole } from "@/types/database";
import { todayISO } from "@/lib/db";
import { matchesRecurrenceWeekday } from "@/lib/taskRecurrence";
import {
  effectiveOneTimeDueDate,
  isRecurringTaskForDate,
  recurringMaterializedTemplateIds,
  templateVisibleForDailyChecklist,
} from "@/lib/todayTasks";

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
  role?: UserRole | null,
): PendingTask[] {
  const today = todayISO();
  const result: PendingTask[] = [];

  // Recurring templates of today not yet turned into a real row for this date → still open.
  const materializedTemplateIds = recurringMaterializedTemplateIds(tasks, profileId, today);
  templates.forEach((t) => {
    if (
      t.active &&
      matchesRecurrenceWeekday(t.recurrence_weekday, weekday) &&
      templateVisibleForDailyChecklist(t, deptId, role) &&
      !materializedTemplateIds.has(t.id)
    ) {
      result.push({ title: t.title, type: "recurring" });
    }
  });

  // Real rows assigned to the employee that aren't done (pending-approval rows haven't reached them).
  tasks.forEach((t) => {
    if (t.assigned_to !== profileId || t.approval_status === "pending" || t.status === "done") return;
    if (t.type === "recurring") {
      if (isRecurringTaskForDate(t, today)) result.push({ title: t.title, type: "recurring" });
    } else {
      if (!t.due_date || effectiveOneTimeDueDate(t, today) === today) {
        result.push({ title: t.title, type: "one_time" });
      }
    }
  });

  return result;
}
