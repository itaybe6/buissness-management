import type { TaskApproval, UserRole } from "@/types/database";

/**
 * Whether a newly assigned task must wait for the manager's approval before the
 * employee ever sees it.
 *
 * Only maintenance workers are gated, and only when the business switched
 * `maintenance_task_approval` on. A pending task is hidden from the assignee's
 * checklist (see `buildTodayTasks`) and no assignment email goes out until the
 * manager approves — so getting this wrong either spams the worker or silently
 * swallows their task.
 */
export function approvalForAssignee(input: {
  /** business.maintenance_task_approval */
  approvalEnabled: boolean;
  /** Whether the acting user may create tasks at all. */
  canCreateTasks: boolean;
  assignedTo: string | null | undefined;
  /** Business users, used to look up the assignee's role. */
  users: { id: string; role: UserRole }[];
}): TaskApproval | null {
  const { approvalEnabled, canCreateTasks, assignedTo, users } = input;
  if (!approvalEnabled || !canCreateTasks || !assignedTo) return null;
  const target = users.find((u) => u.id === assignedTo);
  return target?.role === "maintenance" ? "pending" : null;
}

/** Tasks waiting for the manager's approval. Only a manager sees this queue. */
export function pendingApprovalTasks<T extends { approval_status: TaskApproval | null }>(
  tasks: T[],
  role: UserRole | null | undefined,
): T[] {
  if (role !== "manager") return [];
  return tasks.filter((t) => t.approval_status === "pending");
}
