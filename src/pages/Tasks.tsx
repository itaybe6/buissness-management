import { useMemo, useState } from "react";
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
import { useAuth } from "@/lib/auth";
import { useBusinessId, HE_DAYS, initialsOf, colorFor } from "@/lib/db";
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from "@/api/tasks";
import {
  useTaskTemplates,
  useCreateTaskTemplate,
  useUpdateTaskTemplate,
  useDeleteTaskTemplate,
} from "@/api/taskTemplates";
import { useDepartments } from "@/api/departments";
import { useProfiles } from "@/api/users";
import { TaskWeekSchedule } from "@/components/tasks/TaskWeekSchedule";
import type { TaskTemplate, TaskType } from "@/types/database";

type ManagerTab = "assign" | "templates";
type AssignMode = "template" | "one_time";
type ListTab = TaskType;

const MANAGER_ROLES = ["manager", "department_manager", "shift_manager"];

export function Tasks() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const isManager = profile && MANAGER_ROLES.includes(profile.role);

  if (isManager) return <ManagerTasksView businessId={businessId!} profileId={profile!.id} />;
  return <EmployeeTasksView businessId={businessId!} profileId={profile!.id} />;
}

/* ============================== Employee ============================== */

function EmployeeTasksView({ businessId, profileId }: { businessId: string; profileId: string }) {
  const { data: tasks, isLoading, isError, refetch } = useTasks(businessId);
  const { data: departments, isLoading: deptLoading } = useDepartments(businessId);
  const { data: users } = useProfiles(businessId);
  const update = useUpdateTask(businessId);
  const [tab, setTab] = useState<ListTab>("one_time");

  if (isLoading || deptLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const visible = (tasks ?? []).filter((t) => t.assigned_to === profileId);
  const list = visible.filter((t) => t.type === tab);

  return (
    <div className="mx-auto max-w-[1100px] animate-fadeUp">
      <PageHeader title="משימות" subtitle="המשימות ששויכו אליך" />
      <ListTabs tab={tab} onTab={setTab} />
      <TaskList
        tasks={list}
        tab={tab}
        onToggle={(id, done) =>
          update.mutate({ id, status: done ? "open" : "done", completed_at: done ? null : new Date().toISOString() })
        }
      />

      <div className="my-8 border-t border-border" />

      <TaskWeekSchedule
        tasks={visible}
        employees={users ?? []}
        departments={departments ?? []}
        employeeFilter={profileId}
        onToggle={(id, done) =>
          update.mutate({ id, status: done ? "open" : "done", completed_at: done ? null : new Date().toISOString() })
        }
      />
    </div>
  );
}

/* ============================== Manager ============================== */

function ManagerTasksView({ businessId, profileId }: { businessId: string; profileId: string }) {
  const { data: tasks, isLoading: tasksLoading, isError: tasksError, refetch: refetchTasks } = useTasks(businessId);
  const { data: templates, isLoading: tplLoading, isError: tplError, refetch: refetchTpl } = useTaskTemplates(businessId);
  const { data: departments, isLoading: deptLoading } = useDepartments(businessId);
  const { data: users } = useProfiles(businessId);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask(businessId);
  const delTask = useDeleteTask(businessId);
  const createTpl = useCreateTaskTemplate(businessId);
  const updateTpl = useUpdateTaskTemplate(businessId);
  const delTpl = useDeleteTaskTemplate(businessId);

  const [managerTab, setManagerTab] = useState<ManagerTab>("assign");
  const [listTab, setListTab] = useState<ListTab>("one_time");

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

  const list = (tasks ?? []).filter((t) => t.type === listTab);

  const scheduleBlock = (
    <>
      <div className="my-8 border-t border-border" />
      <TaskWeekSchedule
        tasks={tasks ?? []}
        employees={users ?? []}
        departments={departments ?? []}
        onToggle={(id, done) =>
          updateTask.mutate({ id, status: done ? "open" : "done", completed_at: done ? null : new Date().toISOString() })
        }
      />
    </>
  );

  return (
    <div className="mx-auto max-w-[1100px] animate-fadeUp">
      <PageHeader
        title="משימות"
        subtitle="משימות קבועות · שיוך לעובדים · חד-פעמיות"
      />

      <div className="mb-5 inline-flex gap-1 rounded-[12px] border border-border bg-surface-2 p-1">
        {(
          [
            ["assign", "שיוך משימות", "person_add"],
            ["templates", "משימות קבועות", "event_repeat"],
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

      {managerTab === "templates" ? (
        <FixedTasksPanel
          templates={templates ?? []}
          saving={createTpl.isPending}
          onAdd={(input) =>
            createTpl.mutate({
              business_id: businessId,
              title: input.title,
              description: input.description,
              recurrence_weekday: input.recurrence_weekday,
              sort_order: templates?.length ?? 0,
            })
          }
          onUpdate={(input) => updateTpl.mutate(input)}
          onDelete={(id) => delTpl.mutate(id)}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <QuickAssignPanel
            users={users ?? []}
            templates={(templates ?? []).filter((t) => t.active)}
            saving={createTask.isPending}
            onAssign={async (input) => {
              await createTask.mutateAsync({
                business_id: businessId,
                assigned_by: profileId,
                ...input,
              });
            }}
          />

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[15px] font-bold">משימות משויכות</div>
              <ListTabs tab={listTab} onTab={setListTab} compact />
            </div>
            <TaskList
              tasks={list}
              tab={listTab}
              userById={userById}
              templateById={templateById}
              showAssignee
              showDelete
              onToggle={(id, done) =>
                updateTask.mutate({ id, status: done ? "open" : "done", completed_at: done ? null : new Date().toISOString() })
              }
              onDelete={(id) => delTask.mutate(id)}
            />
          </div>
        </div>
      )}

      {scheduleBlock}
    </div>
  );
}

/* ============================== Shared UI ============================== */

function ListTabs({ tab, onTab, compact }: { tab: ListTab; onTab: (t: ListTab) => void; compact?: boolean }) {
  return (
    <div className={`inline-flex gap-1 rounded-[12px] border border-border bg-surface-2 p-1 ${compact ? "" : "mb-4"}`}>
      {([["one_time", "חד-פעמיות"], ["recurring", "קבועות"]] as const).map(([k, label]) => (
        <button
          key={k}
          onClick={() => onTab(k)}
          className={`rounded-[10px] px-4 py-2 text-[${compact ? "13" : "14"}px] font-bold transition ${
            tab === k ? "text-white [background:var(--ink)]" : "text-text-2"
          }`}
        >
          {label}
        </button>
      ))}
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
                  ? `כל יום ${HE_DAYS[t.recurrence_weekday]}`
                  : t.due_date
                    ? new Date(t.due_date).toLocaleDateString("he-IL")
                    : "ללא תאריך"}
              </div>
            </div>
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

function FixedTasksPanel({
  templates,
  saving,
  onAdd,
  onUpdate,
  onDelete,
}: {
  templates: TaskTemplate[];
  saving: boolean;
  onAdd: (input: { title: string; description: string | null; recurrence_weekday: number | null }) => void;
  onUpdate: (input: {
    id: string;
    title?: string;
    description?: string | null;
    recurrence_weekday?: number | null;
    active?: boolean;
  }) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recurrence, setRecurrence] = useState("none");

  const rowGrid =
    "grid grid-cols-[auto_minmax(120px,1fr)_minmax(100px,1fr)_130px_auto_auto] items-center gap-3 rounded-[12px] border border-border bg-surface-2 px-3.5 py-2.5";

  function handleAdd() {
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      description: description.trim() || null,
      recurrence_weekday: recurrence === "none" ? null : Number(recurrence),
    });
    setTitle("");
    setDescription("");
    setRecurrence("none");
  }

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2 text-[16px] font-bold">
        <Icon name="event_repeat" size={22} className="text-accent-2" />
        משימות קבועות
      </div>
      <p className="mb-4 text-[13px] text-text-2">
        הגדר כאן את רשימת המשימות הקבועות של העסק. בשלב השיוך תוכל לבחור מהרשימה הזו או ליצור משימה חד-פעמית חדשה.
      </p>

      {templates.length === 0 ? (
        <EmptyState
          icon="event_repeat"
          title="אין משימות קבועות עדיין"
          description="הוסיפו את המשימות הקבועות של העסק — למשל ניקוי, ספירת מלאי, פתיחת קופה."
        />
      ) : (
        <div className="mb-4 flex flex-col gap-2.5">
          {templates.map((t) => (
            <div key={t.id} className={rowGrid} style={{ opacity: t.active ? 1 : 0.55 }}>
              <Switch checked={t.active} onChange={(v) => onUpdate({ id: t.id, active: v })} />
              <Input
                className="!bg-surface"
                defaultValue={t.title}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== t.title) onUpdate({ id: t.id, title: v });
                }}
                disabled={!t.active}
              />
              <Input
                className="!bg-surface"
                defaultValue={t.description ?? ""}
                placeholder="תיאור (אופציונלי)"
                onBlur={(e) => {
                  const v = e.target.value.trim() || null;
                  if (v !== (t.description ?? null)) onUpdate({ id: t.id, description: v });
                }}
                disabled={!t.active}
              />
              <Select
                className="!bg-surface"
                value={t.recurrence_weekday == null ? "none" : String(t.recurrence_weekday)}
                onChange={(e) => {
                  const v = e.target.value === "none" ? null : Number(e.target.value);
                  if (v !== t.recurrence_weekday) onUpdate({ id: t.id, recurrence_weekday: v });
                }}
                disabled={!t.active}
              >
                <option value="none">לא קבועה</option>
                {HE_DAYS.map((d, i) => (
                  <option key={i} value={String(i)}>
                    כל {d}
                  </option>
                ))}
              </Select>
              {!t.active ? <Badge tone="neutral">כבויה</Badge> : <span />}
              <button
                onClick={() => onDelete(t.id)}
                className="grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:[background:var(--danger-bg)] hover:text-danger"
              >
                <Icon name="delete" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-[12px] border border-dashed border-border bg-surface-2 p-3.5">
        <div className="mb-2 text-[13px] font-bold text-text-2">הוספת משימה קבועה</div>
        <div className="grid gap-2.5 sm:grid-cols-[1fr_1fr_130px_auto]">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="שם המשימה" />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="תיאור (אופציונלי)"
          />
          <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
            <option value="none">לא קבועה</option>
            {HE_DAYS.map((d, i) => (
              <option key={i} value={String(i)}>
                כל {d}
              </option>
            ))}
          </Select>
          <Button icon="add" loading={saving} onClick={handleAdd}>
            הוספה
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ============================== Quick Assign Panel ============================== */

function QuickAssignPanel({
  users,
  templates,
  saving,
  onAssign,
}: {
  users: { id: string; full_name: string | null }[];
  templates: TaskTemplate[];
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
  const [mode, setMode] = useState<AssignMode>("template");
  const [assignedTo, setAssignedTo] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const selectedTemplate = templates.find((t) => t.id === templateId);

  async function handleAssign() {
    setError(null);
    setSuccess(false);

    if (mode === "template") {
      if (!templateId) return setError("בחרו משימה קבועה");
      const tpl = templates.find((t) => t.id === templateId);
      if (!tpl) return setError("משימה לא נמצאה");
      await onAssign({
        title: tpl.title,
        description: tpl.description,
        type: tpl.recurrence_weekday != null ? "recurring" : "one_time",
        template_id: tpl.id,
        assigned_to: assignedTo || null,
        due_date: tpl.recurrence_weekday != null ? null : dueDate || null,
        recurrence_weekday: tpl.recurrence_weekday,
      });
    } else {
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
    }

    setSuccess(true);
    if (mode === "one_time") {
      setTitle("");
      setDescription("");
      setDueDate("");
    }
    setTimeout(() => setSuccess(false), 2500);
  }

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2 text-[16px] font-bold">
        <Icon name="person_add" size={22} className="text-accent-2" />
        שיוך משימות
      </div>
      <p className="mb-4 text-[13px] text-text-2">
        בחרו עובד, ואז שייכו משימה מהרשימה הקבועה — או צרו משימה חד-פעמית חדשה שלא קיימת במשימות הקבועות.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["template", "ממשימה קבועה", "event_repeat"],
            ["one_time", "משימה חד-פעמית חדשה", "edit_note"],
          ] as const
        ).map(([k, label, icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setMode(k);
              setError(null);
            }}
            className={`inline-flex items-center gap-2 rounded-[11px] border px-3.5 py-2.5 text-[13.5px] font-bold transition ${
              mode === k
                ? "border-accent-2 bg-[var(--violet-bg)] text-accent-2"
                : "border-border bg-surface text-text-2 hover:bg-surface-2"
            }`}
          >
            <Icon name={icon} size={18} />
            {label}
          </button>
        ))}
      </div>

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

        {mode === "template" ? (
          <Field label="משימה קבועה">
            {templates.length === 0 ? (
              <div className="rounded-[11px] border border-dashed border-border bg-surface-2 px-3 py-2.5 text-[13px] text-text-3">
                אין משימות קבועות — הוסיפו בלשונית &quot;משימות קבועות&quot;
              </div>
            ) : (
              <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">— בחרו משימה —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                    {t.recurrence_weekday != null ? ` (כל ${HE_DAYS[t.recurrence_weekday]})` : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <Field label="כותרת המשימה">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="לדוגמה: הכנת אירוע פרטי" />
          </Field>
        )}
      </div>

      {mode === "one_time" && (
        <div className="mt-3.5 grid gap-3.5 lg:grid-cols-2">
          <Field label="תיאור (אופציונלי)">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="h-20" />
          </Field>
          <Field label="תאריך יעד">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
      )}

      {mode === "template" && selectedTemplate?.recurrence_weekday == null && (
        <div className="mt-3.5 max-w-sm">
          <Field label="תאריך יעד (אופציונלי)">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
      )}

      {selectedTemplate?.description && mode === "template" && (
        <div className="mt-3 rounded-[11px] bg-surface-2 px-3.5 py-2.5 text-[13px] text-text-2">
          {selectedTemplate.description}
        </div>
      )}

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
