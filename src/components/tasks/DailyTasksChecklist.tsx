import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Badge, Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { EASE_OUT } from "@/components/motion/shared-motion";
import { todayISO } from "@/lib/db";
import { buildTodayTasks, VIRTUAL_TASK_PREFIX } from "@/lib/todayTasks";
import { useCreateTask, useTasks, useUpdateTask, uploadTaskMedia } from "@/api/tasks";
import { useTaskTemplates } from "@/api/taskTemplates";
import type { Task, TaskStatus, UserRole } from "@/types/database";

type StatusTone = "danger" | "warning" | "success";
type ChecklistVariant = "default" | "dashboard" | "employee";

const STATUS_META: Record<TaskStatus, { label: string; short: string; tone: StatusTone; color: string; icon: string }> = {
  open: { label: "מצריך טיפול", short: "פתוח", tone: "danger", color: "var(--danger)", icon: "error" },
  in_progress: { label: "בטיפול", short: "בטיפול", tone: "warning", color: "var(--warning)", icon: "pending" },
  done: { label: "בוצע", short: "בוצע", tone: "success", color: "var(--success)", icon: "check_circle" },
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

export function useDailyTaskActions(
  businessId: string,
  profileId: string,
  deptId: string | null,
  role?: UserRole | null,
) {
  const { data: tasks = [] } = useTasks(businessId);
  const { data: templates = [] } = useTaskTemplates(businessId);
  const update = useUpdateTask(businessId);
  const createTask = useCreateTask();

  const today = todayISO();
  const todayWeekday = new Date().getDay();

  const todayTasks = useMemo(
    () => buildTodayTasks(businessId, tasks, templates, profileId, deptId, today, todayWeekday, role),
    [businessId, tasks, templates, profileId, deptId, today, todayWeekday, role],
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

function ChecklistProgress({ total, done, compact }: { total: number; done: number; compact?: boolean }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;
  const accent = allDone ? "var(--success)" : "var(--accent-2)";
  const ring = compact ? "h-12 w-12" : "h-14 w-14";
  const inner = compact ? "h-9 w-9" : "h-11 w-11";

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <div
        className={`grid ${ring} flex-none place-items-center rounded-full`}
        style={{ background: `conic-gradient(${accent} ${pct * 3.6}deg, var(--border-2) 0deg)` }}
        role="img"
        aria-label={`${pct}% הושלמו`}
      >
        <div className={`grid ${inner} place-items-center rounded-full bg-surface`}>
          {allDone ? (
            <Icon name="check" size={compact ? 18 : 22} style={{ color: "var(--success)" }} />
          ) : (
            <span className="text-[12px] font-extrabold tabular-nums sm:text-[13px]" style={{ color: accent }}>
              {pct}%
            </span>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[14px] font-extrabold tracking-tight sm:text-[15px]">
          {allDone ? "כל המשימות הושלמו" : done === 0 ? "משימות היום" : `${done} מתוך ${total} הושלמו`}
        </div>
        <div className="mt-0.5 text-[11.5px] text-text-3 sm:text-[12px]">עדכון סטטוס ותיעוד ביצוע</div>
      </div>
    </div>
  );
}

function StatusSegmented({
  value,
  onChange,
  mobileLarge,
}: {
  value: TaskStatus;
  onChange: (s: TaskStatus) => void;
  mobileLarge?: boolean;
}) {
  return (
    <div
      className={`task-status-seg inline-flex w-full items-stretch gap-1 rounded-[14px] border border-border bg-surface-2 p-1 ${
        mobileLarge ? "task-status-seg-mobile" : ""
      }`}
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
            aria-label={m.label}
            className={`seg-btn flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[10px] px-1 py-2.5 sm:flex-row sm:gap-1.5 sm:px-2 sm:py-2 ${
              mobileLarge ? "min-h-[52px] sm:min-h-0" : ""
            } ${active ? `${STATUS_TONE_CLASS[m.tone]} shadow-sm` : "text-text-3 hover:text-text-2"}`}
          >
            <Icon name={m.icon} size={mobileLarge ? 20 : 16} className="flex-none sm:hidden" />
            <Icon name={m.icon} size={15} className="hidden flex-none sm:block" />
            <span className={`truncate font-bold ${mobileLarge ? "text-[11px] sm:text-[12.5px]" : "text-[11px] sm:text-[12.5px]"}`}>
              <span className="sm:hidden">{m.short}</span>
              <span className="hidden sm:inline">{m.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MediaLightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  const video = url ? isVideoUrl(url) : false;

  return (
    <Modal open={!!url} onClose={onClose} title={video ? "סרטון תיעוד" : "תמונת תיעוד"} maxWidth={720}>
      {url && (
        <div className="overflow-hidden rounded-[14px] bg-black/90">
          {video ? (
            <video src={url} controls playsInline className="max-h-[70dvh] w-full" />
          ) : (
            <img src={url} alt="תיעוד משימה" className="max-h-[70dvh] w-full object-contain" />
          )}
        </div>
      )}
    </Modal>
  );
}

function MediaThumb({
  url,
  size = 72,
  onRemove,
  onPreview,
}: {
  url: string;
  size?: number;
  onRemove?: () => void;
  onPreview?: () => void;
}) {
  const video = isVideoUrl(url);

  return (
    <div className="task-media-thumb group relative flex-none snap-start" style={{ width: size, height: size }}>
      <button
        type="button"
        onClick={onPreview}
        title={video ? "צפייה בסרטון" : "צפייה בתמונה"}
        className="press block h-full w-full overflow-hidden rounded-[14px] border border-border bg-surface-2 shadow-sm"
      >
        {video ? (
          <div className="grid h-full w-full place-items-center bg-ink text-white">
            <Icon name="play_circle" size={Math.round(size * 0.38)} />
          </div>
        ) : (
          <img src={url} alt="תיעוד משימה" className="h-full w-full object-cover" loading="lazy" />
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="הסרה"
          className="press absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full border border-border bg-surface text-text-2 shadow-md"
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

function TaskMediaUpload({
  uploading,
  hasMedia,
  onCamera,
  onGallery,
  mobileStack,
}: {
  uploading: boolean;
  hasMedia: boolean;
  onCamera: () => void;
  onGallery: () => void;
  mobileStack?: boolean;
}) {
  if (mobileStack) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCamera}
          disabled={uploading}
          className="press flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-[14px] [background:var(--ink)] px-3 py-3 text-[12px] font-bold text-white shadow-sm disabled:opacity-60"
        >
          <Icon name={uploading ? "hourglass_empty" : "photo_camera"} size={22} className={uploading ? "animate-pulse" : ""} />
          {uploading ? "מעלה…" : "צילום"}
        </button>
        <button
          type="button"
          onClick={onGallery}
          disabled={uploading}
          className="press flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-[14px] border border-border bg-surface-2 px-3 py-3 text-[12px] font-bold text-text-2 disabled:opacity-60"
        >
          <Icon name="photo_library" size={22} />
          {hasMedia ? "הוספה" : "גלריה"}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onGallery}
      disabled={uploading}
      className="press inline-flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-border px-3 py-2.5 text-[12.5px] font-semibold text-text-3 transition hover:border-accent-2/40 hover:bg-surface-2 hover:text-text-2 disabled:opacity-60 sm:w-auto"
    >
      <Icon
        name={uploading ? "hourglass_empty" : hasMedia ? "add_photo_alternate" : "perm_media"}
        size={18}
        className={uploading ? "animate-pulse" : ""}
      />
      {uploading ? "מעלה…" : hasMedia ? "הוספת תמונה / סרטון" : "צירוף תמונה או סרטון לתיעוד"}
    </button>
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
  variant: ChecklistVariant;
}) {
  const reduce = useReducedMotion();
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const meta = STATUS_META[task.status];
  const done = task.status === "done";
  const media = taskMedia(task);
  const isEmployee = variant === "employee";
  const isDashboard = variant === "dashboard";
  const mobileLarge = isEmployee || isDashboard;
  const thumbSize = isEmployee ? 80 : isDashboard ? 72 : 64;

  async function handleFiles(files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    setError(null);
    setUploading(true);
    setUploadProgress(0);
    try {
      const urls: string[] = [];
      for (let i = 0; i < list.length; i++) {
        urls.push(await uploadTaskMedia(businessId, list[i]));
        setUploadProgress(Math.round(((i + 1) / list.length) * 100));
      }
      onMedia(task.id, [...media, ...urls]);
    } catch {
      setError("העלאת המדיה נכשלה");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  const rowClass =
    isDashboard || isEmployee
      ? "task-card-mobile rounded-[18px] border border-border/70 bg-surface p-4 shadow-[0_8px_24px_-12px_rgba(15,23,20,0.08)]"
      : "task-row task-enter border-b border-border-2 px-4 py-3.5 last:border-0 hover:bg-surface-2";

  return (
    <>
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
            : ({ "--row-accent": meta.color } as React.CSSProperties)
        }
      >
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-[12px] sm:h-9 sm:w-9 sm:rounded-[11px]"
            style={{ background: `${meta.color}18`, color: meta.color }}
          >
            <Icon name={meta.icon} size={20} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[15px] font-bold leading-snug sm:text-[14.5px] sm:font-semibold ${done ? "text-text-3 line-through" : ""}`}>
                {task.title}
              </span>
              <Badge tone={task.type === "recurring" ? "violet" : "info"}>
                {task.type === "recurring" ? "קבועה" : "חד-פעמית"}
              </Badge>
            </div>
            {task.description && (
              <div className="mt-1 text-[12.5px] leading-relaxed text-text-3">{task.description}</div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-3">סטטוס</div>
          <StatusSegmented value={task.status} onChange={(s) => onStatus(task.id, s)} mobileLarge={mobileLarge} />
        </div>

        <div className="mt-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-3">תיעוד</div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <TaskMediaUpload
            uploading={uploading}
            hasMedia={media.length > 0}
            onCamera={() => cameraRef.current?.click()}
            onGallery={() => galleryRef.current?.click()}
            mobileStack={isEmployee || isDashboard}
          />
          {uploading && (
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-border-2">
              <motion.div
                className="h-full rounded-full [background:var(--accent)]"
                initial={{ width: "8%" }}
                animate={{ width: `${Math.max(uploadProgress, 12)}%` }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
              />
            </div>
          )}
        </div>

        {media.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-text-3">קבצים ({media.length})</span>
            </div>
            <div className="task-media-strip -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
              {media.map((url) => (
                <MediaThumb
                  key={url}
                  url={url}
                  size={thumbSize}
                  onPreview={() => setPreviewUrl(url)}
                  onRemove={() => onMedia(task.id, media.filter((u) => u !== url))}
                />
              ))}
            </div>
          </div>
        )}

        {error && <span className="mt-2 block text-[12px] font-semibold text-danger">{error}</span>}
      </motion.div>

      <MediaLightbox url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </>
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
  variant?: ChecklistVariant;
}) {
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const todayLabel = new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
  const isEmployee = variant === "employee";
  const isDashboard = variant === "dashboard";
  const wrapped = isEmployee || isDashboard;

  if (tasks.length === 0) {
    if (wrapped) {
      return (
        <section className="overflow-hidden rounded-[22px] border border-border/70 bg-surface shadow-[0_16px_40px_-14px_rgba(15,23,20,0.08)]">
          <div className="border-b border-border-2 bg-surface px-4 py-4 sm:px-6">
            <h2 className="text-[15px] font-extrabold tracking-tight text-text">
              {isEmployee ? "משימות להיום" : "צ'ק-ליסט משימות יומיות"}
            </h2>
            <p className="mt-0.5 text-[12px] text-text-3">{todayLabel}</p>
          </div>
          <div className="px-5 py-10 text-center sm:px-6">
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

  if (wrapped) {
    return (
      <section className="overflow-hidden rounded-[22px] border border-border/70 bg-surface shadow-[0_16px_40px_-14px_rgba(15,23,20,0.08)]">
        <div className="border-b border-border-2 bg-surface px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-extrabold tracking-tight text-text">
                {isEmployee ? "משימות להיום" : "צ'ק-ליסט משימות יומיות"}
              </h2>
              <p className="mt-0.5 text-[12px] text-text-3">{todayLabel}</p>
            </div>
            <ChecklistProgress total={tasks.length} done={doneCount} compact={isEmployee} />
          </div>
        </div>
        <div className="space-y-3 p-3 sm:space-y-3 sm:p-5">
          {tasks.map((t, i) => (
            <DailyTaskRow
              key={t.id}
              task={t}
              index={i}
              businessId={businessId}
              onStatus={onStatus}
              onMedia={onMedia}
              variant={variant}
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
