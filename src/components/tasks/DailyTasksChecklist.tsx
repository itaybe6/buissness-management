import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button, Icon } from "@/components/ui";
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
  open: { label: "מצריך טיפול", short: "פתוח", tone: "danger", color: "var(--danger)", icon: "radio_button_unchecked" },
  in_progress: { label: "בטיפול", short: "בטיפול", tone: "warning", color: "var(--warning)", icon: "timelapse" },
  done: { label: "בוצע", short: "בוצע", tone: "success", color: "var(--success)", icon: "check_circle" },
};
const STATUS_ORDER: TaskStatus[] = ["open", "in_progress", "done"];

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
  const [overrides, setOverrides] = useState<
    Record<string, Partial<Pick<Task, "status" | "completed_at" | "media_urls">>>
  >({});

  const today = todayISO();
  const todayWeekday = new Date().getDay();

  const todayTasks = useMemo(() => {
    const built = buildTodayTasks(businessId, tasks, templates, profileId, deptId, today, todayWeekday, role);
    return built.map((t) => {
      const patch = overrides[t.id];
      return patch ? { ...t, ...patch } : t;
    });
  }, [businessId, tasks, templates, profileId, deptId, today, todayWeekday, role, overrides]);

  // Clear overrides once the virtual row is gone (materialized) or the real row matches.
  useEffect(() => {
    const visibleIds = new Set(
      buildTodayTasks(businessId, tasks, templates, profileId, deptId, today, todayWeekday, role).map((t) => t.id),
    );
    setOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(prev)) {
        if (!visibleIds.has(id)) {
          delete next[id];
          changed = true;
          continue;
        }
        if (id.startsWith(VIRTUAL_TASK_PREFIX)) continue;
        const server = tasks.find((t) => t.id === id);
        const patch = prev[id];
        if (!server || !patch) continue;
        const statusOk = patch.status == null || server.status === patch.status;
        const mediaOk =
          patch.media_urls == null ||
          JSON.stringify(server.media_urls ?? []) === JSON.stringify(patch.media_urls);
        if (statusOk && mediaOk) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [businessId, tasks, templates, profileId, deptId, today, todayWeekday, role]);

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
    const completed_at = status === "done" ? new Date().toISOString() : null;
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], status, completed_at } }));
    if (id.startsWith(VIRTUAL_TASK_PREFIX)) {
      materialize(id.slice(VIRTUAL_TASK_PREFIX.length), { status, completed_at });
      return;
    }
    update.mutate({ id, status, completed_at });
  }

  function setMedia(id: string, media_urls: string[]) {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], media_urls } }));
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
    <div className="flex items-center gap-3">
      <div
        className="relative grid h-11 w-11 flex-none place-items-center"
        role="img"
        aria-label={`${pct}% הושלמו`}
      >
        <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border-2)" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke={accent}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${pct * 0.973} 100`}
            style={{ transition: "stroke-dasharray 400ms var(--ease-out), stroke 200ms var(--ease-out)" }}
          />
        </svg>
        {allDone ? (
          <Icon name="check" size={18} style={{ color: "var(--success)" }} />
        ) : (
          <span className="text-[11px] font-extrabold tabular-nums" style={{ color: accent }}>
            {done}/{total}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-extrabold tracking-tight text-text">
          {allDone ? "הכל בוצע" : done === 0 ? "עדיין לא התחלת" : `${total - done} נותרו`}
        </div>
        <div className="mt-0.5 text-[11px] text-text-3">{pct}% מהיום</div>
      </div>
    </div>
  );
}

function StatusSegmented({
  value,
  onChange,
}: {
  value: TaskStatus;
  onChange: (s: TaskStatus) => void;
}) {
  return (
    <div className="task-status-track" role="group" aria-label="סטטוס המשימה">
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
            data-status={s}
            data-active={active ? "true" : "false"}
            className="task-status-chip press"
          >
            <Icon name={m.icon} size={17} className="flex-none" />
            <span className="truncate">{m.short}</span>
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
  onRemove,
  onPreview,
}: {
  url: string;
  onRemove?: () => void;
  onPreview?: () => void;
}) {
  const video = isVideoUrl(url);

  return (
    <div className="task-media-thumb group relative h-14 w-14 flex-none snap-start sm:h-16 sm:w-16">
      <button
        type="button"
        onClick={onPreview}
        title={video ? "צפייה בסרטון" : "צפייה בתמונה"}
        className="press block h-full w-full overflow-hidden rounded-[12px] border border-border bg-surface-2"
      >
        {video ? (
          <div className="grid h-full w-full place-items-center bg-ink text-white">
            <Icon name="play_circle" size={22} />
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
          className="press absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border border-border bg-surface text-text-2 shadow-sm"
        >
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  );
}

function TaskMediaBar({
  media,
  uploading,
  uploadProgress,
  onCamera,
  onGallery,
  onPreview,
  onRemove,
}: {
  media: string[];
  uploading: boolean;
  uploadProgress: number;
  onCamera: () => void;
  onGallery: () => void;
  onPreview: (url: string) => void;
  onRemove: (url: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasMedia = media.length > 0;

  function choose(source: "camera" | "gallery") {
    setPickerOpen(false);
    // Let the modal close before opening the native picker
    window.setTimeout(() => {
      if (source === "camera") onCamera();
      else onGallery();
    }, 180);
  }

  return (
    <>
      <div className="task-media-bar">
        {hasMedia && (
          <div className="task-media-strip flex gap-2 overflow-x-auto pb-0.5">
            {media.map((url) => (
              <MediaThumb
                key={url}
                url={url}
                onPreview={() => onPreview(url)}
                onRemove={() => onRemove(url)}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={uploading}
            className="press task-media-action task-media-action--accent"
          >
            <Icon
              name={uploading ? "hourglass_empty" : hasMedia ? "add_photo_alternate" : "upload"}
              size={18}
              className={uploading ? "animate-pulse" : ""}
            />
            <span>{uploading ? "מעלה…" : hasMedia ? "הוספת תיעוד" : "העלאת תיעוד"}</span>
          </button>
          {hasMedia && (
            <span className="ms-auto text-[11px] font-semibold tabular-nums text-text-3">{media.length} קבצים</span>
          )}
        </div>

        {uploading && (
          <div className="h-1 overflow-hidden rounded-full bg-border-2">
            <motion.div
              className="h-full rounded-full"
              style={{ background: "var(--accent)" }}
              initial={{ width: "8%" }}
              animate={{ width: `${Math.max(uploadProgress, 12)}%` }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
            />
          </div>
        )}
      </div>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        icon="perm_media"
        title="העלאת תיעוד"
        subtitle="בחר איך לצרף תמונה או סרטון"
      >
        <div className="flex flex-col gap-2.5">
          <button type="button" onClick={() => choose("camera")} className="press task-upload-choice">
            <span className="task-upload-choice-icon">
              <Icon name="photo_camera" size={22} />
            </span>
            <span className="min-w-0 flex-1 text-start">
              <span className="block text-[14px] font-extrabold text-text">צילום</span>
              <span className="mt-0.5 block text-[12px] text-text-2">פתח את המצלמה עכשיו</span>
            </span>
            <Icon name="chevron_left" size={20} className="text-text-3" />
          </button>
          <button type="button" onClick={() => choose("gallery")} className="press task-upload-choice">
            <span className="task-upload-choice-icon">
              <Icon name="photo_library" size={22} />
            </span>
            <span className="min-w-0 flex-1 text-start">
              <span className="block text-[14px] font-extrabold text-text">גלריה</span>
              <span className="mt-0.5 block text-[12px] text-text-2">בחר תמונה או סרטון מהמכשיר</span>
            </span>
            <Icon name="chevron_left" size={20} className="text-text-3" />
          </button>
          <Button variant="secondary" onClick={() => setPickerOpen(false)} className="mt-1 w-full">
            ביטול
          </Button>
        </div>
      </Modal>
    </>
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
  const wrapped = variant === "employee" || variant === "dashboard";

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

  return (
    <>
      <motion.div
        initial={reduce ? false : { opacity: 0, transform: "translateY(8px)" }}
        animate={{ opacity: 1, transform: "translateY(0)" }}
        transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.24, ease: EASE_OUT }}
        className={wrapped ? "task-card" : "task-row task-enter border-b border-border-2 px-4 py-3.5 last:border-0 hover:bg-surface-2"}
        data-status={task.status}
        data-done={done ? "true" : "false"}
        style={
          {
            "--row-accent": meta.color,
            "--row-accent-opacity": done ? 0.4 : 1,
            "--enter-delay": `${Math.min(index, 8) * 45}ms`,
          } as React.CSSProperties
        }
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => onStatus(task.id, done ? "open" : "done")}
            className="press task-check-btn"
            style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 14%, transparent)` }}
            aria-label={done ? "סמן כפתוח" : "סמן כבוצע"}
            title={done ? "סמן כפתוח" : "סמן כבוצע"}
          >
            <Icon name={meta.icon} size={22} />
          </button>

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`text-[15px] font-extrabold leading-snug tracking-tight ${done ? "text-text-3 line-through decoration-text-3/50" : "text-text"}`}>
                {task.title}
              </h3>
              <span className={`task-type-pill ${task.type === "recurring" ? "task-type-pill--recurring" : ""}`}>
                {task.type === "recurring" ? "קבועה" : "חד־פעמית"}
              </span>
            </div>
            {task.description && (
              <p className={`mt-1 text-[12.5px] leading-relaxed ${done ? "text-text-3" : "text-text-2"}`}>
                {task.description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3.5">
          <StatusSegmented value={task.status} onChange={(s) => onStatus(task.id, s)} />
        </div>

        <div className="mt-3">
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
          <TaskMediaBar
            media={media}
            uploading={uploading}
            uploadProgress={uploadProgress}
            onCamera={() => cameraRef.current?.click()}
            onGallery={() => galleryRef.current?.click()}
            onPreview={setPreviewUrl}
            onRemove={(url) => onMedia(task.id, media.filter((u) => u !== url))}
          />
        </div>

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
  const title = isEmployee ? "משימות להיום" : "צ'ק-ליסט משימות יומיות";

  if (tasks.length === 0) {
    if (wrapped) {
      return (
        <section className="task-checklist">
          <header className="task-checklist-header">
            <div>
              <h2 className="task-checklist-title">{title}</h2>
              <p className="task-checklist-date">{todayLabel}</p>
            </div>
          </header>
          <div className="px-5 py-11 text-center sm:px-6">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-success-bg">
              <Icon name="task_alt" size={28} style={{ color: "var(--success)" }} />
            </div>
            <div className="text-[15px] font-extrabold text-text">אין משימות להיום</div>
            <div className="mt-1 text-[13px] text-text-2">לא שויכו אליך משימות קבועות או חד־פעמיות ליום זה.</div>
          </div>
        </section>
      );
    }

    return (
      <div className="overflow-hidden rounded-[20px] border border-border bg-surface px-6 py-12 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-success-bg">
          <Icon name="task_alt" size={28} style={{ color: "var(--success)" }} />
        </div>
        <div className="text-[16px] font-extrabold">אין משימות להיום</div>
        <div className="mt-1 text-[13px] text-text-2">לא שויכו אליך משימות קבועות או חד־פעמיות ליום זה.</div>
      </div>
    );
  }

  if (wrapped) {
    return (
      <section className="task-checklist">
        <header className="task-checklist-header">
          <div className="min-w-0">
            <h2 className="task-checklist-title">{title}</h2>
            <p className="task-checklist-date">{todayLabel}</p>
          </div>
          <ChecklistProgress total={tasks.length} done={doneCount} />
        </header>
        <div className="task-checklist-list">
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
