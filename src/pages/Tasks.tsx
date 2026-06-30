import { useMemo, useRef, useState } from "react";
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
import { useBusinessId, HE_DAYS, initialsOf, colorFor, todayISO } from "@/lib/db";
import {
  RECURRENCE_EVERY_DAY,
  formatRecurrenceWeekday,
  matchesRecurrenceWeekday,
  recurrenceSelectValue,
} from "@/lib/taskRecurrence";
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask, uploadTaskMedia, notifyTaskAssigned } from "@/api/tasks";
import {
  useTaskTemplates,
  useCreateTaskTemplate,
  useUpdateTaskTemplate,
  useDeleteTaskTemplate,
} from "@/api/taskTemplates";
import { useDepartments } from "@/api/departments";
import { useProfiles } from "@/api/users";
import { useBusiness } from "@/api/businesses";
import { TaskWeekSchedule } from "@/components/tasks/TaskWeekSchedule";
import type { Department, Task, TaskStatus, TaskTemplate, TaskType } from "@/types/database";

type ManagerTab = "assign" | "templates";
type ListTab = TaskType;

const MANAGER_ROLES = ["manager", "shift_manager"];

type StatusTone = "danger" | "warning" | "success";
const STATUS_META: Record<TaskStatus, { label: string; tone: StatusTone; color: string; icon: string }> = {
  open: { label: "מצריך טיפול", tone: "danger", color: "var(--danger)", icon: "error" },
  in_progress: { label: "בטיפול", tone: "warning", color: "var(--warning)", icon: "pending" },
  done: { label: "בוצע", tone: "success", color: "var(--success)", icon: "check_circle" },
};
const STATUS_ORDER: TaskStatus[] = ["open", "in_progress", "done"];

/** Active-pill styling per status tone (tinted bg + colored text, matches Badge). */
const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  danger: "text-danger [background:var(--danger-bg)]",
  warning: "text-warning [background:var(--warning-bg)]",
  success: "text-success [background:var(--success-bg)]",
};

const VIDEO_RE = /\.(mp4|mov|m4v|webm|avi|mkv|quicktime)$/i;
function isVideoUrl(url: string): boolean {
  return VIDEO_RE.test(url.split("?")[0]);
}
/** Media attached to a task: prefer media_urls, fall back to the legacy single photo_url. */
function taskMedia(task: Task): string[] {
  if (task.media_urls && task.media_urls.length) return task.media_urls;
  return task.photo_url ? [task.photo_url] : [];
}

export function Tasks() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const isManager = profile && MANAGER_ROLES.includes(profile.role);

  if (isManager) return <ManagerTasksView businessId={businessId!} profileId={profile!.id} />;
  return <EmployeeTasksView businessId={businessId!} profileId={profile!.id} />;
}

/* ============================== Employee ============================== */

const VIRTUAL_PREFIX = "tpl-";

/** משימה קבועה (מתבנית) מוצגת לעובד כשורה וירטואלית עד שהוא מטפל בה — אז נוצרת שורה אמיתית. */
function virtualRecurringTask(t: TaskTemplate, profileId: string, businessId: string): Task {
  return {
    id: `${VIRTUAL_PREFIX}${t.id}`,
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

function EmployeeTasksView({ businessId, profileId }: { businessId: string; profileId: string }) {
  const { profile } = useAuth();
  const { data: tasks, isLoading, isError, refetch } = useTasks(businessId);
  const { data: templates, isLoading: tplLoading } = useTaskTemplates(businessId);
  const { data: departments, isLoading: deptLoading } = useDepartments(businessId);
  const { data: users } = useProfiles(businessId);
  const update = useUpdateTask(businessId);
  const createTask = useCreateTask();

  if (isLoading || tplLoading || deptLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const deptId = profile?.department_id ?? null;
  // משימות שממתינות לאישור מנהל עדיין לא "הגיעו" לעובד — לא מציגים אותן
  const mine = (tasks ?? []).filter((t) => t.assigned_to === profileId && t.approval_status !== "pending");
  const today = todayISO();
  const todayWeekday = new Date().getDay();

  // משימות קבועות של היום — שייכות למחלקת העובד או כלליות לכל העסק (department_id = null).
  // מציגים רק תבניות שעדיין לא הומרו לשורה אמיתית עבור העובד.
  const materializedTemplateIds = new Set(
    (tasks ?? []).filter((t) => t.assigned_to === profileId && t.template_id).map((t) => t.template_id),
  );
  const virtualToday = (templates ?? [])
    .filter(
      (t) =>
        t.active &&
        matchesRecurrenceWeekday(t.recurrence_weekday, todayWeekday) &&
        (t.department_id == null || t.department_id === deptId) &&
        !materializedTemplateIds.has(t.id),
    )
    .map((t) => virtualRecurringTask(t, profileId, businessId));

  // צ'ק-ליסט של היום: משימות קבועות של היום + משימות חד-פעמיות פתוחות / לתאריך היום
  const todayTasks = [
    ...virtualToday,
    ...mine.filter((t) => {
      if (t.type === "recurring") return matchesRecurrenceWeekday(t.recurrence_weekday, todayWeekday);
      // one_time — מציגים כל עוד לא בוצעה, או אם תאריך היעד הוא היום
      if (t.status !== "done") return true;
      return t.due_date === today;
    }),
  ].sort((a, b) => {
    // לא-בוצעו קודם, ובתוך זה קבועות קודם
    if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
    return a.type === b.type ? 0 : a.type === "recurring" ? -1 : 1;
  });

  const remaining = todayTasks.filter((t) => t.status !== "done").length;

  // המרת תבנית קבועה לשורת משימה אמיתית של העובד (בעת סימון סטטוס / צירוף מדיה)
  function materialize(
    templateId: string,
    extra: { status?: TaskStatus; completed_at?: string | null; media_urls?: string[] },
  ) {
    const tpl = (templates ?? []).find((t) => t.id === templateId);
    if (!tpl) return;
    createTask.mutate({
      business_id: businessId,
      template_id: tpl.id,
      title: tpl.title,
      description: tpl.description,
      type: "recurring",
      assigned_to: profileId,
      recurrence_weekday: tpl.recurrence_weekday,
      ...extra,
    });
  }

  function setStatus(id: string, status: TaskStatus) {
    if (id.startsWith(VIRTUAL_PREFIX)) {
      materialize(id.slice(VIRTUAL_PREFIX.length), {
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
      });
      return;
    }
    update.mutate({ id, status, completed_at: status === "done" ? new Date().toISOString() : null });
  }

  function setMedia(id: string, media_urls: string[]) {
    if (id.startsWith(VIRTUAL_PREFIX)) {
      materialize(id.slice(VIRTUAL_PREFIX.length), { media_urls });
      return;
    }
    update.mutate({ id, media_urls });
  }

  const total = todayTasks.length;
  const doneCount = total - remaining;
  const todayLabel = new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto max-w-[760px] animate-fadeUp">
      <PageHeader title="המשימות שלי להיום" subtitle={todayLabel} />

      {total > 0 && <TodayProgress total={total} done={doneCount} />}

      <EmployeeChecklist tasks={todayTasks} businessId={businessId} onStatus={setStatus} onMedia={setMedia} />

      <div className="my-8 border-t border-border" />

      <TaskWeekSchedule
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
  );
}

/** Today's progress: completion ring + encouraging headline. Shown only when there are tasks. */
function TodayProgress({ total, done }: { total: number; done: number }) {
  const pct = Math.round((done / total) * 100);
  const allDone = done === total;
  const accent = allDone ? "var(--success)" : "var(--accent-2)";

  return (
    <Card className="mb-5 flex items-center gap-4 p-4 sm:p-5">
      <div
        className="grid h-16 w-16 flex-none place-items-center rounded-full transition-[background] duration-500"
        style={{ background: `conic-gradient(${accent} ${pct * 3.6}deg, var(--border-2) 0deg)` }}
        role="img"
        aria-label={`${pct}% הושלמו`}
      >
        <div className="grid h-[52px] w-[52px] place-items-center rounded-full bg-surface">
          {allDone ? (
            <Icon name="check" size={26} style={{ color: "var(--success)" }} />
          ) : (
            <span className="text-[15px] font-extrabold tabular-nums" style={{ color: accent }}>
              {pct}%
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div className="text-[16.5px] font-extrabold tracking-tight">
          {allDone ? "כל הכבוד! סיימת להיום 🎉" : done === 0 ? "בוא נתחיל ביום" : "אתה בקצב טוב"}
        </div>
        <div className="mt-0.5 text-[13px] text-text-2">
          {allDone ? `כל ${total} המשימות הושלמו` : `${done} מתוך ${total} משימות הושלמו`}
        </div>
      </div>
    </Card>
  );
}

function EmployeeChecklist({
  tasks,
  businessId,
  onStatus,
  onMedia,
}: {
  tasks: Task[];
  businessId: string;
  onStatus: (id: string, status: TaskStatus) => void;
  onMedia: (id: string, media_urls: string[]) => void;
}) {
  if (tasks.length === 0) {
    return (
      <Card className="px-6 py-12 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full [background:var(--success-bg)]">
          <Icon name="task_alt" size={30} style={{ color: "var(--success)" }} />
        </div>
        <div className="text-[16px] font-extrabold">אין משימות להיום</div>
        <div className="mt-1 text-[13px] text-text-2">לא שויכו אליך משימות קבועות או חד-פעמיות ליום זה. תהנה מהיום! ☕</div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {tasks.map((t, i) => (
        <EmployeeTaskRow
          key={t.id}
          task={t}
          index={i}
          businessId={businessId}
          onStatus={onStatus}
          onMedia={onMedia}
        />
      ))}
    </Card>
  );
}

/** Tappable three-state status control — replaces the dropdown for fast, mobile-friendly updates. */
function StatusSegmented({ value, onChange }: { value: TaskStatus; onChange: (s: TaskStatus) => void }) {
  return (
    <div className="inline-flex flex-1 items-center gap-1 rounded-[11px] border border-border bg-surface-2 p-1" role="group" aria-label="סטטוס המשימה">
      {STATUS_ORDER.map((s) => {
        const m = STATUS_META[s];
        const active = value === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            aria-pressed={active}
            className={`seg-btn flex flex-1 items-center justify-center gap-1.5 rounded-[8px] px-2 py-2 text-[12.5px] font-bold ${
              active ? `${STATUS_TONE_CLASS[m.tone]} shadow-sm` : "text-text-3 hover:text-text-2"
            }`}
          >
            <Icon name={m.icon} size={16} className="flex-none" />
            <span className="truncate">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function EmployeeTaskRow({
  task,
  index,
  businessId,
  onStatus,
  onMedia,
}: {
  task: Task;
  index: number;
  businessId: string;
  onStatus: (id: string, status: TaskStatus) => void;
  onMedia: (id: string, media_urls: string[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = STATUS_META[task.status];
  const done = task.status === "done";
  const media = taskMedia(task);

  async function handleFiles(files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of list) {
        urls.push(await uploadTaskMedia(businessId, file));
      }
      onMedia(task.id, [...media, ...urls]);
    } catch {
      setError("העלאת המדיה נכשלה");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="task-row task-enter border-b border-border-2 px-4 py-3.5 last:border-0 hover:bg-surface-2"
      style={
        {
          "--row-accent": meta.color,
          "--row-accent-opacity": done ? 0.45 : 1,
          "--enter-delay": `${Math.min(index, 8) * 45}ms`,
        } as React.CSSProperties
      }
    >
      <div className="flex items-start gap-3">
        <Icon name={meta.icon} size={22} className="mt-0.5 flex-none" style={{ color: meta.color }} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[14.5px] font-semibold leading-snug ${done ? "text-text-3 line-through" : ""}`}>
              {task.title}
            </span>
            <Badge tone={task.type === "recurring" ? "violet" : "info"}>
              {task.type === "recurring" ? "קבועה" : "חד-פעמית"}
            </Badge>
          </div>
          {task.description && <div className="mt-1 text-[12.5px] leading-relaxed text-text-3">{task.description}</div>}
        </div>
      </div>

      <div className="mt-3">
        <StatusSegmented value={task.status} onChange={(s) => onStatus(task.id, s)} />
      </div>

      <div className="mt-2.5">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="press inline-flex items-center gap-1.5 rounded-[9px] border border-dashed border-border px-2.5 py-1.5 text-[12px] font-semibold text-text-3 hover:border-accent-2/40 hover:bg-surface-2 hover:text-text-2 disabled:opacity-60"
        >
          <Icon
            name={uploading ? "hourglass_empty" : media.length ? "add_photo_alternate" : "photo_camera"}
            size={17}
            className={uploading ? "animate-pulse" : ""}
          />
          {uploading ? "מעלה…" : media.length ? "הוספת תמונת תיעוד" : "צירוף תמונת תיעוד (אופציונלי)"}
        </button>
      </div>

      {media.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {media.map((url) => (
            <MediaThumb
              key={url}
              url={url}
              size={56}
              onRemove={() => onMedia(task.id, media.filter((u) => u !== url))}
            />
          ))}
        </div>
      )}

      {error && <span className="mt-2 block text-[12px] font-semibold text-danger">{error}</span>}
    </div>
  );
}

/* ============================== Manager ============================== */

function ManagerTasksView({ businessId, profileId }: { businessId: string; profileId: string }) {
  const { profile } = useAuth();
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

  // משימה שאחראי משמרת מוריד לאיש אחזקה דורשת אישור מנהל (כשהמתג דלוק)
  function approvalForAssignee(assignedTo: string | null | undefined): "pending" | null {
    if (!approvalEnabled || profile?.role !== "shift_manager" || !assignedTo) return null;
    const target = (users ?? []).find((u) => u.id === assignedTo);
    return target?.role === "maintenance" ? "pending" : null;
  }

  const scheduleBlock = (
    <>
      <div className="my-8 border-t border-border" />
      <TaskWeekSchedule
        tasks={tasks ?? []}
        templates={templates ?? []}
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
          departments={departments ?? []}
          saving={createTpl.isPending}
          onAdd={(input) =>
            createTpl.mutate({
              business_id: businessId,
              title: input.title,
              description: input.description,
              department_id: input.department_id,
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

          <div>
            <div className="mb-3 text-[15px] font-bold">משימות חד-פעמיות שהוקצו</div>
            <TaskList
              tasks={oneTimeAssigned}
              tab="one_time"
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
  }) => void;
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [recurrence, setRecurrence] = useState(String(RECURRENCE_EVERY_DAY));

  const rowGrid =
    "grid grid-cols-[auto_minmax(110px,1fr)_minmax(90px,1fr)_140px_130px_auto_auto] items-center gap-3 rounded-[12px] border border-border bg-surface-2 px-3.5 py-2.5";

  function parseRecurrence(value: string): number | null {
    if (value === "none") return null;
    return Number(value);
  }

  function handleAdd() {
    if (!title.trim() || recurrence === "none") return;
    onAdd({
      title: title.trim(),
      description: description.trim() || null,
      department_id: departmentId || null,
      recurrence_weekday: parseRecurrence(recurrence),
    });
    setTitle("");
    setDescription("");
    setDepartmentId("");
    setRecurrence(String(RECURRENCE_EVERY_DAY));
  }

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2 text-[16px] font-bold">
        <Icon name="event_repeat" size={22} className="text-accent-2" />
        משימות קבועות
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
                value={t.department_id ?? ""}
                onChange={(e) => {
                  const v = e.target.value || null;
                  if (v !== (t.department_id ?? null)) onUpdate({ id: t.id, department_id: v });
                }}
                disabled={!t.active}
              >
                <option value="">כל העסק (ללא מחלקה)</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
              <Select
                className="!bg-surface"
                value={recurrenceSelectValue(t.recurrence_weekday)}
                onChange={(e) => {
                  const v = parseRecurrence(e.target.value);
                  if (v !== t.recurrence_weekday) onUpdate({ id: t.id, recurrence_weekday: v });
                }}
                disabled={!t.active}
              >
                <option value="none">לא קבועה</option>
                <option value={String(RECURRENCE_EVERY_DAY)}>כל יום</option>
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
        <div className="grid gap-2.5 sm:grid-cols-[1fr_1fr_150px_130px_auto]">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="שם המשימה" />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="תיאור (אופציונלי)"
          />
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} title="מחלקה (אופציונלי)">
            <option value="">כל העסק (ללא מחלקה)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
            <option value={String(RECURRENCE_EVERY_DAY)}>כל יום</option>
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
