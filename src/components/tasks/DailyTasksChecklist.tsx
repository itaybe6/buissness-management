import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Badge, Icon } from "@/components/ui";
import { EASE_OUT } from "@/components/motion/shared-motion";
import { todayISO } from "@/lib/db";
import { buildTodayTasks, VIRTUAL_TASK_PREFIX } from "@/lib/todayTasks";
import { useCreateTask, useTasks, useUpdateTask, uploadTaskMedia } from "@/api/tasks";
import { useTaskTemplates } from "@/api/taskTemplates";
import type { Task, TaskStatus } from "@/types/database";

type StatusTone = "danger" | "warning" | "success";

const STATUS_META: Record<TaskStatus, { label: string; tone: StatusTone; color: string; icon: string }> = {
  open: { label: "מצריך טיפול", tone: "danger", color: "var(--danger)", icon: "error" },
  in_progress: { label: "בטיפול", tone: "warning", color: "var(--warning)", icon: "pending" },
  done: { label: "בוצע", tone: "success", color: "var(--success)", icon: "check_circle" },
};
const STATUS_ORDER: TaskStatus[] = ["open", "in_progress", "done"];

const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  danger: "text-danger [background:var(--danger-bg)]",
  warning: "text-warning [background:var(--warning-bg)]",
  success: "text-success [background:var(--success-bg)]",
};

const VIDEO_RE = /\.(mp4|mov|m4v|webm|avi|mkv|quicktime)$/i;

function isVideoUrl(url: string): boolean {
  return VIDEO_RE.test(url.split("?")[0]);
}

function taskMedia(task: Task): string[] {
  if (task.media_urls && task.media_urls.length) return task.media_urls;
  return task.photo_url ? [task.photo_url] : [];
}

export function useDailyTaskActions(businessId: string, profileId: string, deptId: string | null) {
  const { data: tasks = [] } = useTasks(businessId);
  const { data: templates = [] } = useTaskTemplates(businessId);
  const update = useUpdateTask(businessId);
  const createTask = useCreateTask();

  const today = todayISO();
  const todayWeekday = new Date().getDay();

  const todayTasks = useMemo(
    () => buildTodayTasks(businessId, tasks, templates, profileId, deptId, today, todayWeekday),
    [businessId, tasks, templates, profileId, deptId, today, todayWeekday],
  );

  function materialize(
    templateId: string,
    extra: { status?: TaskStatus; completed_at?: string | null; media_urls?: string[] },
  ) {
    const tpl = templates.find((t) => t.id === templateId);
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
    if (id.startsWith(VIRTUAL_TASK_PREFIX)) {
      materialize(id.slice(VIRTUAL_TASK_PREFIX.length), {
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
      });
      return;
    }
    update.mutate({ id, status, completed_at: status === "done" ? new Date().toISOString() : null });
  }

  function setMedia(id: string, media_urls: string[]) {
    if (id.startsWith(VIRTUAL_TASK_PREFIX)) {
      materialize(id.slice(VIRTUAL_TASK_PREFIX.length), { media_urls });
      return;
    }
    update.mutate({ id, media_urls });
  }

  return { todayTasks, setStatus, setMedia };
}

function ChecklistProgress({ total, done }: { total: number; done: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;
  const accent = allDone ? "var(--success)" : "var(--accent-2)";

  return (
    <div className="flex items-center gap-4">
      <div
        className="grid h-14 w-14 flex-none place-items-center rounded-full"
        style={{ background: `conic-gradient(${accent} ${pct * 3.6}deg, var(--border-2) 0deg)` }}
        role="img"
        aria-label={`${pct}% הושלמו`}
      >
        <div className="grid h-11 w-11 place-items-center rounded-full bg-surface">
          {allDone ? (
            <Icon name="check" size={22} style={{ color: "var(--success)" }} />
          ) : (
            <span className="text-[13px] font-extrabold tabular-nums" style={{ color: accent }}>
              {pct}%
            </span>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[15px] font-extrabold tracking-tight">
          {allDone ? "כל המשימות הושלמו!" : done === 0 ? "משימות היום" : `${done} מתוך ${total} הושלמו`}
        </div>
        <div className="mt-0.5 text-[12px] text-text-3">עדכון סטטוס ותיעוד ביצוע</div>
      </div>
    </div>
  );
}

function StatusSegmented({ value, onChange }: { value: TaskStatus; onChange: (s: TaskStatus) => void }) {
  return (
    <div
      className="inline-flex w-full items-center gap-1 rounded-[11px] border border-border bg-surface-2 p-1"
      role="group"
      aria-label="סטטוס המשימה"
    >
      {STATUS_ORDER.map((s) => {
        const m = STATUS_META[s];
        const active = value === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            aria-pressed={active}
            className={`seg-btn flex flex-1 items-center justify-center gap-1.5 rounded-[8px] px-2 py-2 text-[12px] font-bold sm:text-[12.5px] ${
              active ? `${STATUS_TONE_CLASS[m.tone]} shadow-sm` : "text-text-3 hover:text-text-2"
            }`}
          >
            <Icon name={m.icon} size={15} className="flex-none" />
            <span className="truncate">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function MediaThumb({ url, size = 56, onRemove }: { url: string; size?: number; onRemove?: () => void }) {
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
          <div className="grid h-full w-full place-items-center rounded-xl border border-border bg-black/85 text-white shadow-sm">
            <Icon name="play_circle" size={Math.round(size * 0.45)} />
          </div>
        ) : (
          <img src={url} alt="תיעוד משימה" className="h-full w-full rounded-xl border border-border object-cover shadow-sm" />
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

function DailyTaskRow({
  task,
  index,
  businessId,
  onStatus,
  onMedia,
  variant,
}: {
  task: Task;
  index: number;
  businessId: string;
  onStatus: (id: string, status: TaskStatus) => void;
  onMedia: (id: string, media_urls: string[]) => void;
  variant: "default" | "dashboard";
}) {
  const reduce = useReducedMotion();
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

  const rowClass =
    variant === "dashboard"
      ? "rounded-[18px] border border-border/70 bg-surface p-4 shadow-[0_8px_24px_-12px_rgba(15,23,20,0.08)]"
      : "task-row task-enter border-b border-border-2 px-4 py-3.5 last:border-0 hover:bg-surface-2";

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, transform: "translateY(8px)" }}
      animate={{ opacity: 1, transform: "translateY(0)" }}
      transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.24, ease: EASE_OUT }}
      className={rowClass}
      style={
        variant === "default"
          ? ({
              "--row-accent": meta.color,
              "--row-accent-opacity": done ? 0.45 : 1,
              "--enter-delay": `${Math.min(index, 8) * 45}ms`,
            } as React.CSSProperties)
          : undefined
      }
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[11px]"
          style={{ background: `${meta.color}18`, color: meta.color }}
        >
          <Icon name={meta.icon} size={20} />
        </span>

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

      <div className="mt-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
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
          className={`press inline-flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed px-3 py-2.5 text-[12.5px] font-semibold transition disabled:opacity-60 sm:w-auto ${
            variant === "dashboard"
              ? "border-accent-2/30 bg-[rgba(124,58,237,0.04)] text-accent-2 hover:border-accent-2/50 hover:bg-[rgba(124,58,237,0.08)]"
              : "border-border text-text-3 hover:border-accent-2/40 hover:bg-surface-2 hover:text-text-2"
          }`}
        >
          <Icon
            name={uploading ? "hourglass_empty" : media.length ? "add_photo_alternate" : "perm_media"}
            size={18}
            className={uploading ? "animate-pulse" : ""}
          />
          {uploading
            ? "מעלה…"
            : media.length
              ? "הוספת תמונה / סרטון"
              : "צירוף תמונה או סרטון לתיעוד"}
        </button>
      </div>

      {media.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2.5">
          {media.map((url) => (
            <MediaThumb
              key={url}
              url={url}
              size={variant === "dashboard" ? 64 : 56}
              onRemove={() => onMedia(task.id, media.filter((u) => u !== url))}
            />
          ))}
        </div>
      )}

      {error && <span className="mt-2 block text-[12px] font-semibold text-danger">{error}</span>}
    </motion.div>
  );
}

export function DailyTasksChecklist({
  tasks,
  businessId,
  onStatus,
  onMedia,
  variant = "default",
}: {
  tasks: Task[];
  businessId: string;
  onStatus: (id: string, status: TaskStatus) => void;
  onMedia: (id: string, media_urls: string[]) => void;
  variant?: "default" | "dashboard";
}) {
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const todayLabel = new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });

  if (tasks.length === 0) {
    if (variant === "dashboard") {
      return (
        <section className="overflow-hidden rounded-[24px] border border-border/70 bg-surface shadow-[0_20px_40px_-15px_rgba(15,23,20,0.06)]">
          <div className="border-b border-border-2 bg-gradient-to-l from-[rgba(124,58,237,0.06)] to-transparent px-5 py-4 sm:px-6">
            <h2 className="text-[15px] font-extrabold tracking-tight text-text">צ&apos;ק-ליסט משימות יומיות</h2>
            <p className="mt-0.5 text-[12px] text-text-3">{todayLabel}</p>
          </div>
          <div className="px-6 py-10 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full [background:var(--success-bg)]">
              <Icon name="task_alt" size={30} style={{ color: "var(--success)" }} />
            </div>
            <div className="text-[15px] font-extrabold">אין משימות להיום</div>
            <div className="mt-1 text-[13px] text-text-2">לא שויכו אליך משימות קבועות או חד-פעמיות ליום זה.</div>
          </div>
        </section>
      );
    }

    return (
      <div className="overflow-hidden rounded-[20px] border border-border bg-surface px-6 py-12 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full [background:var(--success-bg)]">
          <Icon name="task_alt" size={30} style={{ color: "var(--success)" }} />
        </div>
        <div className="text-[16px] font-extrabold">אין משימות להיום</div>
        <div className="mt-1 text-[13px] text-text-2">לא שויכו אליך משימות קבועות או חד-פעמיות ליום זה.</div>
      </div>
    );
  }

  if (variant === "dashboard") {
    return (
      <section className="overflow-hidden rounded-[24px] border border-border/70 bg-surface shadow-[0_20px_40px_-15px_rgba(15,23,20,0.06)]">
        <div className="border-b border-border-2 bg-gradient-to-l from-[rgba(124,58,237,0.08)] via-[rgba(124,58,237,0.03)] to-transparent px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-extrabold tracking-tight text-text">צ&apos;ק-ליסט משימות יומיות</h2>
              <p className="mt-0.5 text-[12px] text-text-3">{todayLabel}</p>
            </div>
            <ChecklistProgress total={tasks.length} done={doneCount} />
          </div>
        </div>
        <div className="space-y-3 p-4 sm:p-5">
          {tasks.map((t, i) => (
            <DailyTaskRow
              key={t.id}
              task={t}
              index={i}
              businessId={businessId}
              onStatus={onStatus}
              onMedia={onMedia}
              variant="dashboard"
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-border bg-surface">
      {tasks.map((t, i) => (
        <DailyTaskRow
          key={t.id}
          task={t}
          index={i}
          businessId={businessId}
          onStatus={onStatus}
          onMedia={onMedia}
          variant="default"
        />
      ))}
    </div>
  );
}

export { STATUS_META, taskMedia, isVideoUrl };
