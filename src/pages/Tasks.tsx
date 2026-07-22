import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  Input,
  PageLoader,
  ErrorState,
  Select,
  Switch,
  Textarea,
} from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId, HE_DAYS, initialsOf, colorFor, colorForDepartment } from "@/lib/db";
import {
  RECURRENCE_EVERY_DAY,
  formatRecurrenceDayBadge,
  formatRecurrenceWeekday,
  isEveryDayRecurrence,
  selectedRecurrenceDays,
  serializeRecurrenceWeekdays,
  toggleRecurrenceDay,
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
import { WorkerHome } from "@/components/dashboard/WorkerHome";
import { TaskWeekSchedule } from "@/components/tasks/TaskWeekSchedule";
import { RecurringTasksBoard } from "@/components/tasks/RecurringTasksBoard";
import { taskMedia, isVideoUrl } from "@/components/tasks/DailyTasksChecklist";
import type { Department, Task, TaskTemplate, TaskType } from "@/types/database";

type ManagerTab = "tracking" | "one_time" | "templates";
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
  const { data: tasks, isLoading, isError, refetch } = useTasks(businessId);
  const { data: templates, isLoading: tplLoading } = useTaskTemplates(businessId);
  const { data: departments, isLoading: deptLoading } = useDepartments(businessId);
  const { data: users } = useProfiles(businessId);
  const update = useUpdateTask(businessId);
  const [weekOpen, setWeekOpen] = useState(false);

  if (isLoading || tplLoading || deptLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const mine = (tasks ?? []).filter((t) => t.assigned_to === profileId && t.approval_status !== "pending");

  return (
    <WorkerHome variant="employee">
      <section className="worker-week-section">
        <button
          type="button"
          onClick={() => setWeekOpen((v) => !v)}
          className="worker-week-toggle press"
        >
          <span className="flex items-center gap-2.5">
            <span className="worker-week-toggle-icon">
              <Icon name="calendar_view_week" size={20} className="text-accent-2" />
            </span>
            <span className="text-[14px] font-bold text-text">לוח שבועי</span>
          </span>
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
    </WorkerHome>
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

  const [managerTab, setManagerTab] = useState<ManagerTab>("tracking");

  useEffect(() => {
    if (!canCreateTasks && managerTab !== "tracking") setManagerTab("tracking");
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

  const trackingBlock = (
    <RecurringTasksBoard
      tasks={tasks ?? []}
      templates={templates ?? []}
      employees={users ?? []}
      departments={departments ?? []}
    />
  );

  return (
    <div className="w-full animate-fadeUp">
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

      {canCreateTasks && (
        <div className="tasks-mgr-tabs mb-5">
          {(
            [
              ["tracking", "מעקב ביצוע", "fact_check"],
              ["one_time", "משימות חד-פעמיות", "playlist_add_check"],
              ["templates", "משימות קבועות", "event_repeat"],
            ] as const
          ).map(([k, label, icon]) => (
            <button
              key={k}
              type="button"
              data-active={managerTab === k}
              onClick={() => setManagerTab(k)}
              className="tasks-mgr-tab-btn seg-btn"
            >
              <Icon name={icon} size={16} className="flex-none shrink-0" />
              <span className="tasks-mgr-tab-label">{label}</span>
            </button>
          ))}
        </div>
      )}

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
          onUpdate={async (input) => {
            await updateTpl.mutateAsync(input);
          }}
          onDelete={(id) => delTpl.mutate(id)}
        />
      ) : managerTab === "one_time" && canCreateTasks ? (
        <OneTimeTasksPanel
          users={users ?? []}
          tasks={oneTimeAssigned}
          userById={userById}
          templateById={templateById}
          saving={createTask.isPending}
          onAssign={async (input) => {
            const approval = approvalForAssignee(input.assigned_to);
            const id = await createTask.mutateAsync({
              business_id: businessId,
              assigned_by: profileId,
              approval_status: approval,
              ...input,
            });
            if (!approval && input.assigned_to) notifyTaskAssigned(id);
          }}
          onToggle={(id, done) =>
            updateTask.mutate({ id, status: done ? "open" : "done", completed_at: done ? null : new Date().toISOString() })
          }
          onDelete={(id) => delTask.mutate(id)}
        />
      ) : (
        trackingBlock
      )}
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

const HE_DAY_LETTERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function RecurrenceDayPicker({
  value,
  onChange,
  disabled,
}: {
  value: number[] | number | null;
  onChange: (v: number[]) => void;
  disabled?: boolean;
}) {
  const normalized = serializeRecurrenceWeekdays(value);
  const everyDay = isEveryDayRecurrence(normalized);
  const selected = new Set(everyDay ? [0, 1, 2, 3, 4, 5, 6] : selectedRecurrenceDays(normalized));

  return (
    <div className="ftp-daypicker" role="group" aria-label="תדירות — בחירה מרובה">
      <button
        type="button"
        aria-pressed={everyDay}
        data-active={everyDay}
        disabled={disabled}
        onClick={() => onChange([RECURRENCE_EVERY_DAY])}
        className="ftp-day-all"
      >
        <Icon name="all_inclusive" size={15} />
        כל יום
      </button>
      <span className="ftp-daypicker-sep" aria-hidden="true" />
      {HE_DAYS.map((day, i) => {
        const active = everyDay || selected.has(i);
        return (
          <button
            key={day}
            type="button"
            aria-pressed={active}
            data-active={active}
            disabled={disabled}
            onClick={() => onChange(toggleRecurrenceDay(normalized, i))}
            title={active ? `הסרת ${day}` : `הוספת ${day}`}
            className="ftp-day-dot"
          >
            {HE_DAY_LETTERS[i]}
          </button>
        );
      })}
    </div>
  );
}

function DepartmentPicker({
  departments,
  value,
  onChange,
  disabled,
}: {
  departments: Department[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      aria-label="מחלקה"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">כל העסק</option>
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </Select>
  );
}

function FixedTaskCard({
  template,
  departments,
  index,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
}: {
  template: TaskTemplate;
  departments: Department[];
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (input: {
    id: string;
    title?: string;
    description?: string | null;
    department_id?: string | null;
    recurrence_weekday?: number[] | null;
    active?: boolean;
  }) => void | Promise<void>;
  onDelete: (id: string) => void;
}) {
  const dept = template.department_id
    ? departments.find((d) => d.id === template.department_id) ?? null
    : null;
  const tone = dept ? colorForDepartment(dept.id, dept.color) : null;
  const [recurrenceDraft, setRecurrenceDraft] = useState<number[]>(() =>
    serializeRecurrenceWeekdays(template.recurrence_weekday),
  );
  const [recurrenceError, setRecurrenceError] = useState<string | null>(null);
  const displayRecurrence = expanded ? recurrenceDraft : template.recurrence_weekday;
  const daily = isEveryDayRecurrence(displayRecurrence);
  const dayBadge = formatRecurrenceDayBadge(displayRecurrence);

  useEffect(() => {
    if (expanded) {
      setRecurrenceDraft(serializeRecurrenceWeekdays(template.recurrence_weekday));
      setRecurrenceError(null);
    }
  }, [expanded, template.id, template.recurrence_weekday]);

  async function flushRecurrenceDraft(): Promise<boolean> {
    const next = serializeRecurrenceWeekdays(recurrenceDraft);
    const prev = serializeRecurrenceWeekdays(template.recurrence_weekday);
    if (next.join() === prev.join()) return true;
    try {
      await onUpdate({ id: template.id, recurrence_weekday: next });
      setRecurrenceError(null);
      return true;
    } catch (err) {
      setRecurrenceError(err instanceof Error ? err.message : "שמירת התדירות נכשלה");
      return false;
    }
  }

  async function handleToggle() {
    if (expanded) {
      const saved = await flushRecurrenceDraft();
      if (!saved) return;
    }
    onToggle();
  }

  return (
    <article
      className="ftp-card"
      data-off={!template.active || undefined}
      data-expanded={expanded || undefined}
      style={
        {
          ...(tone ? { "--ftp-tone": tone } : null),
          animationDelay: `${Math.min(index, 8) * 45}ms`,
        } as CSSProperties
      }
    >
      <span className="ftp-card-edge" aria-hidden="true" />
      <div className="ftp-card-head">
        <button type="button" onClick={() => void handleToggle()} aria-expanded={expanded} className="ftp-card-main">
          <span className="ftp-card-day" aria-hidden="true" data-multi={dayBadge.length > 1 || undefined}>
            {daily ? (
              <Icon name="all_inclusive" size={20} />
            ) : dayBadge ? (
              dayBadge
            ) : (
              <Icon name="event_busy" size={18} />
            )}
          </span>
          <span className="ftp-card-copy">
            <span className="ftp-card-title">{template.title}</span>
            <span className="ftp-card-meta">
              <span className="ftp-card-meta-item">
                <Icon name="event_repeat" size={13} />
                {formatRecurrenceWeekday(displayRecurrence)}
              </span>
              <span className="ftp-card-meta-item">
                {tone ? (
                  <span className="ftp-dept-dot" style={{ "--chip-tone": tone } as CSSProperties} aria-hidden="true" />
                ) : (
                  <Icon name="storefront" size={13} />
                )}
                {dept?.name ?? "כל העסק"}
              </span>
              {template.description && (
                <span className="ftp-card-meta-item">
                  <Icon name="notes" size={13} />
                  הוראות
                </span>
              )}
              {!template.active && <span className="ftp-off-tag">כבויה</span>}
            </span>
          </span>
        </button>
        <Switch checked={template.active} onChange={(v) => onUpdate({ id: template.id, active: v })} />
        <button
          type="button"
          onClick={() => void handleToggle()}
          aria-label={expanded ? "סגירת עריכה" : "עריכת המשימה"}
          className="ftp-card-more"
        >
          <Icon name="expand_more" size={20} />
        </button>
      </div>

      {expanded && (
        <div className="ftp-card-editor">
          <label className="ftp-editor-block ftp-editor-wide">
            <span className="ftp-editor-label">
              <Icon name="edit" size={14} />
              שם המשימה
            </span>
            <Input
              defaultValue={template.title}
              disabled={!template.active}
              className="!bg-surface"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== template.title) onUpdate({ id: template.id, title: v });
              }}
            />
          </label>

          <div className="ftp-editor-block">
            <span className="ftp-editor-label">
              <Icon name="event_repeat" size={14} />
              תדירות
            </span>
            <RecurrenceDayPicker
              value={recurrenceDraft}
              disabled={!template.active}
              onChange={(v) => {
                setRecurrenceDraft(serializeRecurrenceWeekdays(v));
                setRecurrenceError(null);
              }}
            />
            {recurrenceError && (
              <span className="mt-2 block text-[12.5px] font-semibold leading-relaxed text-danger">
                {recurrenceError}
              </span>
            )}
          </div>

          <div className="ftp-editor-block">
            <span className="ftp-editor-label">
              <Icon name="storefront" size={14} />
              מחלקה
            </span>
            <DepartmentPicker
              departments={departments}
              value={template.department_id ?? ""}
              disabled={!template.active}
              onChange={(v) => {
                const next = v || null;
                if (next !== (template.department_id ?? null)) onUpdate({ id: template.id, department_id: next });
              }}
            />
          </div>

          <label className="ftp-editor-block ftp-editor-wide">
            <span className="ftp-editor-label">
              <Icon name="notes" size={14} />
              תיאור והוראות
            </span>
            <AutoGrowTextarea
              key={`${template.id}-${template.description ?? ""}`}
              defaultValue={template.description ?? ""}
              placeholder="פרטים, הוראות ביצוע, דגשים…"
              disabled={!template.active}
              className="!min-h-[44px] !resize-y !bg-surface !py-2.5 text-[13px]"
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== (template.description ?? null)) onUpdate({ id: template.id, description: v });
              }}
            />
          </label>

          <div className="ftp-editor-foot">
            <span className="ftp-editor-autosave">
              <Icon name="cloud_done" size={15} />
              השינויים נשמרים אוטומטית
            </span>
            <button type="button" onClick={() => onDelete(template.id)} className="ftp-editor-delete">
              <Icon name="delete" size={16} />
              מחיקת משימה
            </button>
          </div>
        </div>
      )}
    </article>
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
    recurrence_weekday: number[] | null;
  }) => Promise<void>;
  onUpdate: (input: {
    id: string;
    title?: string;
    description?: string | null;
    department_id?: string | null;
    recurrence_weekday?: number[] | null;
    active?: boolean;
  }) => void;
  onDelete: (id: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [recurrence, setRecurrence] = useState<number[]>([RECURRENCE_EVERY_DAY]);
  const [addError, setAddError] = useState<string | null>(null);

  const activeCount = templates.filter((t) => t.active).length;
  const offCount = templates.length - activeCount;
  const previewDept = departmentId
    ? departments.find((d) => d.id === departmentId)?.name ?? "המחלקה"
    : "כל העסק";

  function resetAddForm() {
    setTitle("");
    setDescription("");
    setDepartmentId("");
    setRecurrence([RECURRENCE_EVERY_DAY]);
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
    try {
      await onAdd({
        title: title.trim(),
        description: description.trim() || null,
        department_id: departmentId || null,
        recurrence_weekday: serializeRecurrenceWeekdays(recurrence),
      });
      closeAddModal();
    } catch {
      setAddError("שמירת המשימה נכשלה. נסו שוב.");
    }
  }

  return (
    <>
      <section className="ftp">
        <header className="ftp-hero">
          <span className="ftp-hero-icon">
            <Icon name="event_repeat" size={23} />
          </span>
          <div className="ftp-hero-copy">
            <h2 className="ftp-hero-title">משימות קבועות</h2>
            <p className="ftp-hero-sub">
              {templates.length === 0
                ? "מופיעות אוטומטית לעובדים לפי יום ומחלקה"
                : offCount > 0
                  ? `${activeCount} פעילות · ${offCount} כבויות`
                  : `${activeCount} פעילות · מופיעות אוטומטית לפי יום ומחלקה`}
            </p>
          </div>
          <button type="button" onClick={() => setAddOpen(true)} className="ftp-add-btn">
            <Icon name="add" size={19} />
            הוספה
          </button>
        </header>

        {templates.length === 0 ? (
          <EmptyState
            icon="event_repeat"
            title="אין משימות קבועות עדיין"
            description="הוסיפו את המשימות הקבועות של העסק — למשל ניקוי, ספירת מלאי, פתיחת קופה."
            action={
              <Button icon="add" onClick={() => setAddOpen(true)}>
                הוספת משימה ראשונה
              </Button>
            }
          />
        ) : (
          <div className="ftp-list">
            {templates.map((t, i) => (
              <FixedTaskCard
                key={t.id}
                template={t}
                departments={departments}
                index={i}
                expanded={expandedId === t.id}
                onToggle={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
                onUpdate={onUpdate}
                onDelete={(id) => {
                  onDelete(id);
                  setExpandedId((cur) => (cur === id ? null : cur));
                }}
              />
            ))}
          </div>
        )}
      </section>

      <Modal
        open={addOpen}
        onClose={closeAddModal}
        title="הוספת משימה קבועה"
        subtitle="תופיע אוטומטית לעובדים לפי היום והמחלקה"
        icon="event_repeat"
        maxWidth={560}
        footer={
          <>
            <Button variant="secondary" onClick={closeAddModal}>
              ביטול
            </Button>
            <Button className="flex-1" icon="add" loading={saving} onClick={handleAdd}>
              הוספת משימה
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="שם המשימה">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="לדוגמה: ניקוי אזור הבר"
              autoFocus
            />
          </Field>

          <div>
            <span className="label-text">תדירות</span>
            <div className="mt-1.5">
              <RecurrenceDayPicker value={recurrence} onChange={setRecurrence} />
            </div>
          </div>

          <Field label="מחלקה">
            <DepartmentPicker departments={departments} value={departmentId} onChange={setDepartmentId} />
          </Field>

          <Field label="תיאור (אופציונלי)">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="פרטים, הוראות ביצוע, דגשים…"
              rows={4}
              className="max-h-[240px] min-h-[96px] resize-y overflow-y-auto leading-relaxed"
            />
          </Field>

          <div className="ftp-preview">
            <Icon name="auto_awesome" size={18} />
            <span>
              המשימה תופיע <b>{formatRecurrenceWeekday(recurrence)}</b> אצל <b>{previewDept}</b>
            </span>
          </div>

          {addError && <span className="text-[13px] font-semibold text-danger">{addError}</span>}
        </div>
      </Modal>
    </>
  );
}

/* ============================== One-time Tasks Panel ============================== */

function AssigneePicker({
  users,
  value,
  onChange,
}: {
  users: { id: string; full_name: string | null }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select
      aria-label="שיוך לעובד"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      searchable
      searchPlaceholder="חיפוש עובד..."
    >
      <option value="">לא משויך</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.full_name || "ללא שם"}
        </option>
      ))}
    </Select>
  );
}

function OneTimeTasksPanel({
  users,
  tasks,
  userById,
  templateById,
  saving,
  onAssign,
  onToggle,
  onDelete,
}: {
  users: { id: string; full_name: string | null }[];
  tasks: Task[];
  userById: Map<string, string>;
  templateById: Map<string, TaskTemplate>;
  saving: boolean;
  onAssign: (input: {
    title: string;
    description: string | null;
    type: TaskType;
    template_id: string | null;
    assigned_to: string | null;
    due_date: string | null;
    recurrence_weekday: number[] | null;
  }) => Promise<void>;
  onToggle: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [assignedTo, setAssignedTo] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const openCount = tasks.filter((t) => t.status !== "done").length;
  const doneCount = tasks.length - openCount;
  const previewAssignee = assignedTo
    ? users.find((u) => u.id === assignedTo)?.full_name || "העובד"
    : "ללא שיוך";
  const previewDue = dueDate
    ? new Date(dueDate).toLocaleDateString("he-IL")
    : "ללא תאריך יעד";

  function resetAddForm() {
    setAssignedTo("");
    setTitle("");
    setDescription("");
    setDueDate("");
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
    try {
      await onAssign({
        title: title.trim(),
        description: description.trim() || null,
        type: "one_time",
        template_id: null,
        assigned_to: assignedTo || null,
        due_date: dueDate || null,
        recurrence_weekday: null,
      });
      closeAddModal();
    } catch {
      setAddError("שמירת המשימה נכשלה. נסו שוב.");
    }
  }

  return (
    <>
      <section className="ftp">
        <header className="ftp-hero">
          <span className="ftp-hero-icon">
            <Icon name="playlist_add_check" size={23} />
          </span>
          <div className="ftp-hero-copy">
            <h2 className="ftp-hero-title">משימות חד-פעמיות</h2>
            <p className="ftp-hero-sub">
              {tasks.length === 0
                ? "משימה חד-פעמית משויכת לעובד ומופיעה אצלו ברשימה"
                : doneCount > 0
                  ? `${openCount} פתוחות · ${doneCount} הושלמו`
                  : `${openCount} פתוחות · משויכות לעובדים ספציפיים`}
            </p>
          </div>
          <button type="button" onClick={() => setAddOpen(true)} className="ftp-add-btn">
            <Icon name="add" size={19} />
            הוספה
          </button>
        </header>

        {tasks.length === 0 ? (
          <EmptyState
            icon="playlist_add_check"
            title="אין משימות חד-פעמיות עדיין"
            description="הוסיפו משימה חד-פעמית לעובד מסוים — למשל הכנת אירוע, סידור מיוחד או משימת אחזקה."
            action={
              <Button icon="add" onClick={() => setAddOpen(true)}>
                הוספת משימה ראשונה
              </Button>
            }
          />
        ) : (
          <TaskList
            tasks={tasks}
            tab="one_time"
            userById={userById}
            templateById={templateById}
            showAssignee
            showDelete
            onToggle={onToggle}
            onDelete={onDelete}
          />
        )}
      </section>

      <Modal
        open={addOpen}
        onClose={closeAddModal}
        title="הוספת משימה חד-פעמית"
        subtitle="משויכת לעובד ומתווספת לרשימת המשימות שלו"
        icon="playlist_add_check"
        maxWidth={560}
        footer={
          <>
            <Button variant="secondary" onClick={closeAddModal}>
              ביטול
            </Button>
            <Button className="flex-1" icon="add" loading={saving} onClick={handleAdd}>
              הוספת משימה
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="שם המשימה">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="לדוגמה: הכנת אירוע פרטי"
              autoFocus
            />
          </Field>

          <Field label="שיוך לעובד">
            <AssigneePicker users={users} value={assignedTo} onChange={setAssignedTo} />
          </Field>

          <Field label="תאריך יעד (אופציונלי)">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>

          <Field label="תיאור (אופציונלי)">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="פרטים, הוראות ביצוע, דגשים…"
              rows={4}
              className="max-h-[240px] min-h-[96px] resize-y overflow-y-auto leading-relaxed"
            />
          </Field>

          <div className="ftp-preview">
            <Icon name="auto_awesome" size={18} />
            <span>
              המשימה תופיע אצל <b>{previewAssignee}</b> · <b>{previewDue}</b>
            </span>
          </div>

          {addError && <span className="text-[13px] font-semibold text-danger">{addError}</span>}
        </div>
      </Modal>
    </>
  );
}
