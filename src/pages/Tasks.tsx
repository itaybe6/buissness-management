import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  PageLoader,
  ErrorState,
  Select,
  Switch,
  Textarea,
} from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId, HE_DAYS, initialsOf, colorFor } from "@/lib/db";
import {
  RECURRENCE_EVERY_DAY,
  formatRecurrenceWeekday,
  recurrenceSelectValue,
} from "@/lib/taskRecurrence";
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask, notifyTaskAssigned } from "@/api/tasks";
import {
  useTaskTemplates,
  useCreateTaskTemplate,
  useUpdateTaskTemplate,
  useDeleteTaskTemplate,
} from "@/api/taskTemplates";
import { useDepartments } from "@/api/departments";
import { useProfiles } from "@/api/users";
import { useBusiness } from "@/api/businesses";
import { MANAGER_ROLES, TASK_CREATE_ROLES } from "@/lib/constants";
import { EmployeeShiftPunch } from "@/components/attendance/EmployeeShiftPunch";
import { TaskWeekSchedule } from "@/components/tasks/TaskWeekSchedule";
import { DailyTasksChecklist, useDailyTaskActions, taskMedia, isVideoUrl } from "@/components/tasks/DailyTasksChecklist";
import type { Department, Task, TaskTemplate, TaskType } from "@/types/database";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  if (h < 21) return "ערב טוב";
  return "לילה טוב";
}

type ManagerTab = "assign" | "templates";
type ListTab = TaskType;

export function Tasks() {
  const businessId = useBusinessId();
  const { profile } = useAuth();

  if (profile && MANAGER_ROLES.includes(profile.role)) {
    return <ManagerTasksView businessId={businessId!} profileId={profile.id} />;
  }
  return <EmployeeTasksView businessId={businessId!} profileId={profile!.id} />;
}

/* ============================== Employee ============================== */

function EmployeeTasksView({ businessId, profileId }: { businessId: string; profileId: string }) {
  const { profile, hasFeature } = useAuth();
  const { data: tasks, isLoading, isError, refetch } = useTasks(businessId);
  const { data: templates, isLoading: tplLoading } = useTaskTemplates(businessId);
  const { data: departments, isLoading: deptLoading } = useDepartments(businessId);
  const { data: users } = useProfiles(businessId);
  const { data: business } = useBusiness(businessId);
  const update = useUpdateTask(businessId);
  const { todayTasks, setStatus, setMedia } = useDailyTaskActions(businessId, profileId, profile?.department_id ?? null);
  const [weekOpen, setWeekOpen] = useState(false);

  if (isLoading || tplLoading || deptLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const remaining = todayTasks.filter((t) => t.status !== "done").length;
  const total = todayTasks.length;
  const doneCount = total - remaining;
  const todayLabel = new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
  const mine = (tasks ?? []).filter((t) => t.assigned_to === profileId && t.approval_status !== "pending");
  const firstName = (profile?.full_name ?? "").split(/\s+/)[0];

  return (
    <div className="employee-home w-full animate-fadeUp pb-2">
      <header className="employee-home-hero mb-5 overflow-hidden rounded-[22px] border border-border/70 px-4 py-5 sm:px-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-3">{business?.name ?? "העסק שלך"}</p>
        <h1 className="mt-1 text-[clamp(1.35rem,5vw,1.75rem)] font-extrabold tracking-tight text-text">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-[13px] text-text-2">{todayLabel}</p>
        {total > 0 && (
          <div className="mt-4 flex items-center gap-3 rounded-[14px] border border-border/60 bg-surface/80 px-3 py-2.5">
            <span
              className="grid h-10 w-10 flex-none place-items-center rounded-full text-[12px] font-extrabold tabular-nums"
              style={{
                background: doneCount === total ? "var(--success-bg)" : "var(--accent-tint)",
                color: doneCount === total ? "var(--success)" : "var(--accent-2)",
              }}
            >
              {doneCount}/{total}
            </span>
            <div className="min-w-0 text-[12.5px] leading-snug text-text-2">
              {remaining === 0 ? "סיימת את כל משימות היום" : `${remaining} משימות ממתינות לטיפול`}
            </div>
          </div>
        )}
      </header>

      {hasFeature("attendance") && <EmployeeShiftPunch />}

      <DailyTasksChecklist
        tasks={todayTasks}
        businessId={businessId}
        onStatus={setStatus}
        onMedia={setMedia}
        variant="employee"
      />

      <section className="mt-6">
        <button
          type="button"
          onClick={() => setWeekOpen((v) => !v)}
          className="press flex w-full items-center justify-between rounded-[16px] border border-border/70 bg-surface px-4 py-3.5 text-right shadow-sm"
        >
          <span className="text-[14px] font-bold text-text">לוח שבועי</span>
          <Icon name={weekOpen ? "expand_less" : "expand_more"} size={22} className="text-text-3" />
        </button>
        {weekOpen && (
          <div className="mt-3">
            <TaskWeekSchedule
              embedded
              tasks={mine}
              templates={templates ?? []}
              employees={users ?? []}
              departments={departments ?? []}
              employeeFilter={profileId}
              onToggle={(id, done) =>
                update.mutate({ id, status: done ? "open" : "done", completed_at: done ? null : new Date().toISOString() })
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}

/* ============================== Manager ============================== */

function ManagerTasksView({ businessId, profileId }: { businessId: string; profileId: string }) {
  const { profile } = useAuth();
  const canCreateTasks = !!(profile && TASK_CREATE_ROLES.includes(profile.role));
  const { data: tasks, isLoading: tasksLoading, isError: tasksError, refetch: refetchTasks } = useTasks(businessId);
  const { data: templates, isLoading: tplLoading, isError: tplError, refetch: refetchTpl } = useTaskTemplates(businessId);
  const { data: departments, isLoading: deptLoading } = useDepartments(businessId);
  const { data: users } = useProfiles(businessId);
  const { data: business } = useBusiness(businessId);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask(businessId);
  const delTask = useDeleteTask(businessId);
  const createTpl = useCreateTaskTemplate(businessId);
  const updateTpl = useUpdateTaskTemplate(businessId);
  const delTpl = useDeleteTaskTemplate(businessId);

  const [managerTab, setManagerTab] = useState<ManagerTab>("assign");

  useEffect(() => {
    if (!canCreateTasks && managerTab === "templates") setManagerTab("assign");
  }, [canCreateTasks, managerTab]);

  const userById = useMemo(() => {
    const m = new Map<string, string>();
    (users ?? []).forEach((u) => m.set(u.id, u.full_name ?? ""));
    return m;
  }, [users]);

  const templateById = useMemo(() => {
    const m = new Map<string, TaskTemplate>();
    (templates ?? []).forEach((t) => m.set(t.id, t));
    return m;
  }, [templates]);

  if (tasksLoading || tplLoading || deptLoading) return <PageLoader />;
  if (tasksError || tplError) return <ErrorState onRetry={() => { refetchTasks(); refetchTpl(); }} />;

  const oneTimeAssigned = (tasks ?? []).filter((t) => t.type === "one_time");

  // אישור מנהל: רק מנהל מאשר, ורק כשהמתג של העסק דלוק
  const approvalEnabled = !!business?.maintenance_task_approval;
  const canApprove = profile?.role === "manager";
  const pendingApprovals = canApprove
    ? (tasks ?? []).filter((t) => t.approval_status === "pending")
    : [];

  // משימה לאיש אחזקה דורשת אישור מנהל (כשהמתג של העסק דלוק)
  function approvalForAssignee(assignedTo: string | null | undefined): "pending" | null {
    if (!approvalEnabled || !canCreateTasks || !assignedTo) return null;
    const target = (users ?? []).find((u) => u.id === assignedTo);
    return target?.role === "maintenance" ? "pending" : null;
  }

  const scheduleBlock = (
    <div className="mt-10">
      <TaskWeekSchedule
        tasks={tasks ?? []}
        templates={templates ?? []}
        employees={users ?? []}
        departments={departments ?? []}
        onToggle={(id, done) =>
          updateTask.mutate({ id, status: done ? "open" : "done", completed_at: done ? null : new Date().toISOString() })
        }
      />
    </div>
  );

  return (
    <div className="w-full animate-fadeUp">
      <PageHeader
        title="משימות"
        subtitle="משימות קבועות · שיוך לעובדים · חד-פעמיות"
      />

      {canApprove && pendingApprovals.length > 0 && (
        <ApprovalQueue
          tasks={pendingApprovals}
          userById={userById}
          onApprove={(id) =>
            updateTask.mutate(
              { id, approval_status: "approved" },
              { onSuccess: () => notifyTaskAssigned(id) }, // אושר → הגיע לעובד → מייל
            )
          }
          onReject={(id) => delTask.mutate(id)}
        />
      )}

      <div className="mb-5 inline-flex gap-1 rounded-[12px] border border-border bg-surface-2 p-1">
        {(
          [
            ["assign", "שיוך משימות", "person_add"],
            ...(canCreateTasks ? ([["templates", "משימות קבועות", "event_repeat"]] as const) : []),
          ] as const
        ).map(([k, label, icon]) => (
          <button
            key={k}
            onClick={() => setManagerTab(k)}
            className={`inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-[14px] font-bold transition ${
              managerTab === k ? "text-white [background:var(--ink)]" : "text-text-2"
            }`}
          >
            <Icon name={icon} size={18} />
            {label}
          </button>
        ))}
      </div>

      {managerTab === "templates" && canCreateTasks ? (
        <FixedTasksPanel
          templates={templates ?? []}
          departments={departments ?? []}
          saving={createTpl.isPending}
          onAdd={async (input) => {
            await createTpl.mutateAsync({
              business_id: businessId,
              title: input.title,
              description: input.description,
              department_id: input.department_id,
              recurrence_weekday: input.recurrence_weekday,
              sort_order: templates?.length ?? 0,
            });
          }}
          onUpdate={(input) => updateTpl.mutate(input)}
          onDelete={(id) => delTpl.mutate(id)}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {canCreateTasks && (
            <QuickAssignPanel
              users={users ?? []}
              saving={createTask.isPending}
              onAssign={async (input) => {
                const approval = approvalForAssignee(input.assigned_to);
                const id = await createTask.mutateAsync({
                  business_id: businessId,
                  assigned_by: profileId,
                  approval_status: approval,
                  ...input,
                });
                // משימה שהגיעה ישירות לעובד (לא ממתינה לאישור) → מייל התראה
                if (!approval && input.assigned_to) notifyTaskAssigned(id);
              }}
            />
          )}

          {!canCreateTasks && (
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <Icon name="info" size={22} className="mt-0.5 text-text-3" />
                <div>
                  <div className="text-[15px] font-bold text-text">צפייה בלבד</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-text-2">
                    רק מנהל העסק יכול ליצור משימות חדשות ולהגדיר משימות קבועות.
                  </p>
                </div>
              </div>
            </Card>
          )}

          <div>
            <div className="mb-3 text-[15px] font-bold">משימות חד-פעמיות שהוקצו</div>
            <TaskList
              tasks={oneTimeAssigned}
              tab="one_time"
              userById={userById}
              templateById={templateById}
              showAssignee
              showDelete={canCreateTasks}
              onToggle={(id, done) =>
                updateTask.mutate({ id, status: done ? "open" : "done", completed_at: done ? null : new Date().toISOString() })
              }
              onDelete={canCreateTasks ? (id) => delTask.mutate(id) : undefined}
            />
          </div>
        </div>
      )}

      {scheduleBlock}
    </div>
  );
}

/* ============================== Approval Queue ============================== */

function ApprovalQueue({
  tasks,
  userById,
  onApprove,
  onReject,
}: {
  tasks: Task[];
  userById: Map<string, string>;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <Card className="mb-5 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border-2 bg-[var(--warning-bg)] px-4 py-3 text-[15px] font-bold text-warning">
        <Icon name="verified_user" size={20} />
        משימות הממתינות לאישורך
        <Badge tone="warning">{tasks.length}</Badge>
      </div>
      {tasks.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center gap-3 border-b border-border-2 px-4 py-3.5 last:border-0">
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-semibold">{t.title}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-text-3">
              {t.assigned_to && (
                <>
                  <span
                    className="grid h-4 w-4 place-items-center rounded-full text-[8px] font-bold text-white"
                    style={{ background: colorFor(t.assigned_to) }}
                  >
                    {initialsOf(userById.get(t.assigned_to))}
                  </span>
                  לאיש אחזקה {userById.get(t.assigned_to)}
                  <span>·</span>
                </>
              )}
              {t.assigned_by && <span>הורד ע״י {userById.get(t.assigned_by) ?? "אחראי משמרת"}</span>}
            </div>
            {t.description && <div className="mt-0.5 text-[12.5px] text-text-3">{t.description}</div>}
          </div>
          <div className="flex flex-none items-center gap-2">
            <Button icon="check" onClick={() => onApprove(t.id)}>
              אישור
            </Button>
            <button
              onClick={() => onReject(t.id)}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-[13px] font-bold text-text-2 hover:[background:var(--danger-bg)] hover:text-danger"
            >
              <Icon name="close" size={18} />
              דחייה
            </button>
          </div>
        </div>
      ))}
    </Card>
  );
}

/* ============================== Shared UI ============================== */

function MediaThumb({ url, size = 40, onRemove }: { url: string; size?: number; onRemove?: () => void }) {
  const video = isVideoUrl(url);
  return (
    <div className="group relative flex-none" style={{ width: size, height: size }}>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title={video ? "צפייה בסרטון" : "צפייה בתמונה"}
        className="block h-full w-full"
      >
        {video ? (
          <div className="grid h-full w-full place-items-center rounded-lg border border-border bg-black/80 text-white">
            <Icon name="play_circle" size={Math.round(size * 0.5)} />
          </div>
        ) : (
          <img src={url} alt="מדיה" className="h-full w-full rounded-lg border border-border object-cover" />
        )}
      </a>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onRemove();
          }}
          title="הסרה"
          className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-border bg-surface text-text-2 shadow hover:text-danger"
        >
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  );
}

function TaskList({
  tasks,
  tab,
  userById,
  templateById,
  showAssignee,
  showDelete,
  onToggle,
  onDelete,
}: {
  tasks: ReturnType<typeof useTasks>["data"] extends (infer T)[] | undefined ? NonNullable<T>[] : never;
  tab: ListTab;
  userById?: Map<string, string>;
  templateById?: Map<string, TaskTemplate>;
  showAssignee?: boolean;
  showDelete?: boolean;
  onToggle: (id: string, done: boolean) => void;
  onDelete?: (id: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon="checklist"
        title="אין משימות"
        description={tab === "one_time" ? "אין משימות חד-פעמיות פתוחות." : "אין משימות קבועות."}
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      {tasks.map((t) => {
        const done = t.status === "done";
        const tpl = t.template_id ? templateById?.get(t.template_id) : null;
        return (
          <div key={t.id} className="flex items-center gap-3.5 border-b border-border-2 px-4 py-3.5 last:border-0 hover:bg-surface-2">
            <button onClick={() => onToggle(t.id, done)}>
              <Icon
                name={done ? "check_circle" : "radio_button_unchecked"}
                size={24}
                style={{ color: done ? "var(--success)" : "var(--text-3)" }}
              />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className={`text-[14.5px] font-semibold ${done ? "text-text-3 line-through" : ""}`}>{t.title}</div>
                {tpl && <Badge tone="violet">ממשימה קבועה</Badge>}
                {!t.template_id && t.type === "one_time" && showAssignee && (
                  <Badge tone="info">חד-פעמית</Badge>
                )}
                {t.status === "in_progress" && <Badge tone="warning">בטיפול</Badge>}
                {t.approval_status === "pending" && <Badge tone="warning">ממתין לאישור מנהל</Badge>}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-text-3">
                {showAssignee && t.assigned_to && userById && (
                  <>
                    <span
                      className="grid h-4 w-4 place-items-center rounded-full text-[8px] font-bold text-white"
                      style={{ background: colorFor(t.assigned_to) }}
                    >
                      {initialsOf(userById.get(t.assigned_to))}
                    </span>
                    {userById.get(t.assigned_to)}
                    <span>·</span>
                  </>
                )}
                {!showAssignee && !t.assigned_to && <span>לא משויך · </span>}
                {t.type === "recurring" && t.recurrence_weekday != null
                  ? formatRecurrenceWeekday(t.recurrence_weekday)
                  : t.due_date
                    ? new Date(t.due_date).toLocaleDateString("he-IL")
                    : "ללא תאריך"}
              </div>
            </div>
            {taskMedia(t).slice(0, 3).map((url) => (
              <MediaThumb key={url} url={url} size={36} />
            ))}
            {taskMedia(t).length > 3 && (
              <span className="text-[12px] font-semibold text-text-3">+{taskMedia(t).length - 3}</span>
            )}
            {showDelete && onDelete && (
              <button
                onClick={() => onDelete(t.id)}
                className="grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:[background:var(--danger-bg)] hover:text-danger"
              >
                <Icon name="delete" size={19} />
              </button>
            )}
          </div>
        );
      })}
    </Card>
  );
}

/* ============================== Fixed Tasks Panel ============================== */

function AutoGrowTextarea({
  defaultValue,
  maxHeight = 220,
  className = "",
  onBlur,
  disabled,
  placeholder,
}: {
  defaultValue?: string;
  maxHeight?: number;
  className?: string;
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function syncHeight() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }

  useEffect(() => {
    syncHeight();
  }, [defaultValue, maxHeight]);

  return (
    <Textarea
      ref={ref}
      defaultValue={defaultValue}
      placeholder={placeholder}
      disabled={disabled}
      onInput={syncHeight}
      onBlur={onBlur}
      className={`overflow-y-auto leading-relaxed ${className}`}
      style={{ maxHeight }}
    />
  );
}

function FixedTaskTemplateRow({
  template,
  departments,
  onUpdate,
  onDelete,
}: {
  template: TaskTemplate;
  departments: Department[];
  onUpdate: (input: {
    id: string;
    title?: string;
    description?: string | null;
    department_id?: string | null;
    recurrence_weekday?: number | null;
    active?: boolean;
  }) => void;
  onDelete: (id: string) => void;
}) {
  function parseRecurrence(value: string): number | null {
    if (value === "none") return null;
    return Number(value);
  }

  return (
    <div
      className="rounded-[12px] border border-border bg-surface-2 p-3.5"
      style={{ opacity: template.active ? 1 : 0.55 }}
    >
      <div className="flex flex-wrap items-start gap-2.5">
        <div className="mt-2">
          <Switch checked={template.active} onChange={(v) => onUpdate({ id: template.id, active: v })} />
        </div>
        <Input
          className="min-w-[120px] flex-1 !bg-surface"
          defaultValue={template.title}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== template.title) onUpdate({ id: template.id, title: v });
          }}
          disabled={!template.active}
        />
        <Select
          className="w-full min-w-[130px] flex-1 !bg-surface sm:max-w-[150px] sm:flex-none"
          value={template.department_id ?? ""}
          onChange={(e) => {
            const v = e.target.value || null;
            if (v !== (template.department_id ?? null)) onUpdate({ id: template.id, department_id: v });
          }}
          disabled={!template.active}
        >
          <option value="">כל העסק (ללא מחלקה)</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select
          className="w-full min-w-[120px] flex-1 !bg-surface sm:max-w-[130px] sm:flex-none"
          value={recurrenceSelectValue(template.recurrence_weekday)}
          onChange={(e) => {
            const v = parseRecurrence(e.target.value);
            if (v !== template.recurrence_weekday) onUpdate({ id: template.id, recurrence_weekday: v });
          }}
          disabled={!template.active}
        >
          <option value="none">לא קבועה</option>
          <option value={String(RECURRENCE_EVERY_DAY)}>כל יום</option>
          {HE_DAYS.map((d, i) => (
            <option key={i} value={String(i)}>
              כל {d}
            </option>
          ))}
        </Select>
        {!template.active ? <Badge tone="neutral">כבויה</Badge> : null}
        <button
          type="button"
          onClick={() => onDelete(template.id)}
          className="grid h-8 w-8 flex-none place-items-center rounded-lg text-text-3 hover:[background:var(--danger-bg)] hover:text-danger"
        >
          <Icon name="delete" size={18} />
        </button>
      </div>

      <div className="mt-2.5 pr-0 sm:pr-10">
        <AutoGrowTextarea
          key={`${template.id}-${template.description ?? ""}`}
          defaultValue={template.description ?? ""}
          placeholder="תיאור (אופציונלי)"
          disabled={!template.active}
          className="!min-h-[44px] !resize-y !bg-surface !py-2.5 text-[13px]"
          onBlur={(e) => {
            const v = e.target.value.trim() || null;
            if (v !== (template.description ?? null)) onUpdate({ id: template.id, description: v });
          }}
        />
      </div>
    </div>
  );
}

function FixedTasksPanel({
  templates,
  departments,
  saving,
  onAdd,
  onUpdate,
  onDelete,
}: {
  templates: TaskTemplate[];
  departments: Department[];
  saving: boolean;
  onAdd: (input: {
    title: string;
    description: string | null;
    department_id: string | null;
    recurrence_weekday: number | null;
  }) => Promise<void>;
  onUpdate: (input: {
    id: string;
    title?: string;
    description?: string | null;
    department_id?: string | null;
    recurrence_weekday?: number | null;
    active?: boolean;
  }) => void;
  onDelete: (id: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [recurrence, setRecurrence] = useState(String(RECURRENCE_EVERY_DAY));
  const [addError, setAddError] = useState<string | null>(null);

  function parseRecurrence(value: string): number | null {
    if (value === "none") return null;
    return Number(value);
  }

  function resetAddForm() {
    setTitle("");
    setDescription("");
    setDepartmentId("");
    setRecurrence(String(RECURRENCE_EVERY_DAY));
    setAddError(null);
  }

  function closeAddModal() {
    setAddOpen(false);
    resetAddForm();
  }

  async function handleAdd() {
    setAddError(null);
    if (!title.trim()) {
      setAddError("נא להזין שם משימה");
      return;
    }
    if (recurrence === "none") {
      setAddError("נא לבחור תדירות");
      return;
    }
    try {
      await onAdd({
        title: title.trim(),
        description: description.trim() || null,
        department_id: departmentId || null,
        recurrence_weekday: parseRecurrence(recurrence),
      });
      closeAddModal();
    } catch {
      setAddError("שמירת המשימה נכשלה. נסו שוב.");
    }
  }

  return (
    <>
      <Card className="p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[16px] font-bold">
            <Icon name="event_repeat" size={22} className="text-accent-2" />
            משימות קבועות
          </div>
          <Button icon="add" onClick={() => setAddOpen(true)}>
            הוספת משימה קבועה
          </Button>
        </div>
        <p className="mb-4 text-[13px] text-text-2">
          משימה קבועה מוגדרת פעם אחת ומופיעה אוטומטית אצל עובדי המחלקה שבחרת — או אצל כולם, אם לא
          בחרת מחלקה. ניתן לקבוע תדירות יומית או לפי יום בשבוע. אין שיוך לעובד מסוים; לשיוך אישי
          השתמשו במשימה חד-פעמית.
        </p>

        {templates.length === 0 ? (
          <EmptyState
            embedded
            icon="event_repeat"
            title="אין משימות קבועות עדיין"
            description="הוסיפו את המשימות הקבועות של העסק — למשל ניקוי, ספירת מלאי, פתיחת קופה."
            action={
              <Button icon="add" onClick={() => setAddOpen(true)}>
                הוספת משימה קבועה
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {templates.map((t) => (
              <FixedTaskTemplateRow
                key={t.id}
                template={t}
                departments={departments}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={addOpen}
        onClose={closeAddModal}
        title="הוספת משימה קבועה"
        subtitle="המשימה תופיע אוטומטית לפי התדירות והמחלקה שתבחרו"
        icon="event_repeat"
        maxWidth={560}
        footer={
          <>
            <Button variant="secondary" onClick={closeAddModal}>
              ביטול
            </Button>
            <Button className="flex-1" icon="add" loading={saving} onClick={handleAdd}>
              הוספה
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <Field label="שם המשימה">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="לדוגמה: ניקוי אזור הבר"
              autoFocus
            />
          </Field>

          <Field label="תיאור (אופציונלי)">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="פרטים, הוראות ביצוע, קישורים וכו'"
              rows={5}
              className="min-h-[120px] max-h-[280px] resize-y overflow-y-auto leading-relaxed"
            />
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="מחלקה">
              <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">כל העסק (ללא מחלקה)</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="תדירות">
              <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
                <option value={String(RECURRENCE_EVERY_DAY)}>כל יום</option>
                {HE_DAYS.map((d, i) => (
                  <option key={i} value={String(i)}>
                    כל {d}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {addError && <span className="text-[13px] font-semibold text-danger">{addError}</span>}
        </div>
      </Modal>
    </>
  );
}

/* ============================== Quick Assign Panel ============================== */

function QuickAssignPanel({
  users,
  saving,
  onAssign,
}: {
  users: { id: string; full_name: string | null }[];
  saving: boolean;
  onAssign: (input: {
    title: string;
    description: string | null;
    type: TaskType;
    template_id: string | null;
    assigned_to: string | null;
    due_date: string | null;
    recurrence_weekday: number | null;
  }) => Promise<void>;
}) {
  const [assignedTo, setAssignedTo] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleAssign() {
    setError(null);
    setSuccess(false);

    if (!title.trim()) return setError("נא להזין כותרת");
    await onAssign({
      title: title.trim(),
      description: description.trim() || null,
      type: "one_time",
      template_id: null,
      assigned_to: assignedTo || null,
      due_date: dueDate || null,
      recurrence_weekday: null,
    });

    setSuccess(true);
    setTitle("");
    setDescription("");
    setDueDate("");
    setTimeout(() => setSuccess(false), 2500);
  }

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2 text-[16px] font-bold">
        <Icon name="person_add" size={22} className="text-accent-2" />
        שיוך משימה חד-פעמית
      </div>
      <p className="mb-4 text-[13px] text-text-2">
        משימה חד-פעמית מוקצית לעובד מסוים ומופיעה אצלו ברשימת המשימות. משימות קבועות מוגדרות בלשונית
        &quot;משימות קבועות&quot; ומשויכות למחלקה.
      </p>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Field label="שיוך לעובד">
          <Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">— לא משויך —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="כותרת המשימה">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="לדוגמה: הכנת אירוע פרטי" />
        </Field>
      </div>

      <div className="mt-3.5 grid gap-3.5 lg:grid-cols-2">
        <Field label="תיאור (אופציונלי)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="h-20" />
        </Field>
        <Field label="תאריך יעד">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Button icon="person_add" loading={saving} onClick={handleAssign}>
          שייך משימה
        </Button>
        {error && <span className="text-[13px] font-semibold text-danger">{error}</span>}
        {success && <span className="text-[13px] font-semibold text-success">המשימה שויכה בהצלחה</span>}
      </div>
    </Card>
  );
}
