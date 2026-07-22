import { useMemo, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EASE_OUT } from "@/components/motion/shared-motion";
import { HE_DAYS, addDays, colorForDepartment, formatDateShort, todayISO, weekStart } from "@/lib/db";
import { formatRecurrenceWeekday, matchesRecurrenceWeekday } from "@/lib/taskRecurrence";
import { isRecurringTaskForDate } from "@/lib/todayTasks";
import { isVideoUrl, taskMedia } from "@/components/tasks/DailyTasksChecklist";
import type { Department, Profile, Task, TaskStatus, TaskTemplate } from "@/types/database";

/* ============================== model ============================== */

/** Aggregated state of one recurring template on one calendar day. */
type OccStatus = "done" | "in_progress" | "pending" | "missed";

const STATUS_META: Record<OccStatus, { label: string; icon: string; rank: number }> = {
  missed: { label: "לא בוצע", icon: "error", rank: 0 },
  in_progress: { label: "בטיפול", icon: "timelapse", rank: 1 },
  pending: { label: "ממתין", icon: "radio_button_unchecked", rank: 2 },
  done: { label: "בוצע", icon: "check_circle", rank: 3 },
};

type StatusFilter = "all" | "done" | "in_progress" | "todo" | "media";

interface Performer {
  id: string;
  name: string;
  avatarUrl: string | null;
  status: TaskStatus;
  at: string | null;
  media: string[];
}

interface Occurrence {
  template: TaskTemplate;
  status: OccStatus;
  performers: Performer[];
  media: string[];
  /** Timestamp of the completion / last documentation shown on the row. */
  at: string | null;
}

interface DeptSection {
  id: string;
  name: string;
  tone: string;
  occurrences: Occurrence[];
  done: number;
  total: number;
}

const STATUS_WEIGHT: Record<TaskStatus, number> = { done: 2, in_progress: 1, open: 0 };

function weekdayOf(date: string): number {
  return new Date(date + "T12:00:00").getDay();
}

function timeOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function longDate(date: string): string {
  return new Date(date + "T12:00:00").toLocaleDateString("he-IL", { day: "numeric", month: "long" });
}

/** Collapses every materialized row of a template into one manager-facing state. */
function buildOccurrence(
  template: TaskTemplate,
  rows: Task[],
  employeeById: Map<string, Profile>,
  date: string,
  today: string,
): Occurrence {
  const byPerson = new Map<string, Performer>();
  const media: string[] = [];
  let best: OccStatus = date < today ? "missed" : "pending";
  let at: string | null = null;

  for (const row of rows) {
    const rowMedia = taskMedia(row);
    media.push(...rowMedia);

    if (row.status === "done" && best !== "done") best = "done";
    else if (row.status === "in_progress" && best !== "done") best = "in_progress";

    const stamp = row.completed_at ?? row.last_documented_at ?? null;
    if (stamp && (!at || stamp > at)) at = stamp;

    const actorId = row.last_documented_by ?? row.assigned_to;
    if (!actorId) continue;
    const profile = employeeById.get(actorId);
    const prev = byPerson.get(actorId);
    const next: Performer = {
      id: actorId,
      name: profile?.full_name ?? "עובד",
      avatarUrl: profile?.avatar_url ?? null,
      status: row.status,
      at: stamp,
      media: [...(prev?.media ?? []), ...rowMedia],
    };
    if (!prev || STATUS_WEIGHT[row.status] > STATUS_WEIGHT[prev.status]) {
      byPerson.set(actorId, next);
    } else {
      byPerson.set(actorId, { ...prev, media: next.media });
    }
  }

  const performers = [...byPerson.values()].sort(
    (a, b) => STATUS_WEIGHT[b.status] - STATUS_WEIGHT[a.status],
  );

  return { template, status: best, performers, media: [...new Set(media)], at };
}

function matchesFilter(occ: Occurrence, filter: StatusFilter): boolean {
  switch (filter) {
    case "done":
      return occ.status === "done";
    case "in_progress":
      return occ.status === "in_progress";
    case "todo":
      return occ.status === "pending" || occ.status === "missed";
    case "media":
      return occ.media.length > 0;
    default:
      return true;
  }
}

/* ============================== atoms ============================== */

function ProgressRing({ value, size = 68 }: { value: number; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;

  return (
    <div className="rtb-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="rtb-ring-track" cx={mid} cy={mid} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="rtb-ring-fill"
          cx={mid}
          cy={mid}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * value) / 100}
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      </svg>
      <span className="rtb-ring-value">
        {value}
        <i>%</i>
      </span>
    </div>
  );
}

function MediaTile({ url, onOpen, size }: { url: string; onOpen: () => void; size?: number }) {
  const video = isVideoUrl(url);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="press rtb-media-tile"
      style={size ? ({ "--tile": `${size}px` } as CSSProperties) : undefined}
      title={video ? "צפייה בסרטון" : "צפייה בתמונה"}
    >
      {video ? (
        <>
          <video src={url} muted playsInline preload="metadata" />
          <span className="rtb-media-play">
            <Icon name="play_arrow" size={16} />
          </span>
        </>
      ) : (
        <img src={url} alt="תיעוד משימה" loading="lazy" />
      )}
    </button>
  );
}

function MediaLightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  const video = url ? isVideoUrl(url) : false;
  return (
    <Modal open={!!url} onClose={onClose} title={video ? "סרטון תיעוד" : "תמונת תיעוד"} maxWidth={760}>
      {url && (
        <div className="overflow-hidden rounded-[14px] bg-black/90">
          {video ? (
            <video src={url} controls playsInline autoPlay className="max-h-[70dvh] w-full" />
          ) : (
            <img src={url} alt="תיעוד משימה" className="max-h-[70dvh] w-full object-contain" />
          )}
        </div>
      )}
    </Modal>
  );
}

function PerformerChip({ performer }: { performer: Performer }) {
  const time = timeOf(performer.at);
  return (
    <span className="rtb-who" data-status={performer.status}>
      <UserAvatar
        userId={performer.id}
        name={performer.name}
        avatarUrl={performer.avatarUrl}
        size={20}
        rounded="circle"
      />
      <span className="rtb-who-name">{performer.name}</span>
      {time && <span className="rtb-who-time">{time}</span>}
    </span>
  );
}

/* ============================== row ============================== */

function OccurrenceRow({
  occ,
  index,
  expanded,
  onToggle,
  onPreview,
}: {
  occ: Occurrence;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onPreview: (url: string) => void;
}) {
  const meta = STATUS_META[occ.status];
  const cover = occ.media.slice(0, 2);
  const extra = occ.media.length - cover.length;
  const lead = occ.performers[0];

  return (
    <article
      className="rtb-row"
      data-status={occ.status}
      data-expanded={expanded || undefined}
      style={{ "--enter-delay": `${Math.min(index, 10) * 35}ms` } as CSSProperties}
    >
      <button type="button" className="rtb-row-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="rtb-row-mark" aria-hidden="true">
          <Icon name={meta.icon} size={21} />
        </span>

        <span className="rtb-row-copy">
          <span className="rtb-row-title">{occ.template.title}</span>
          <span className="rtb-row-sub">
            <span className="rtb-row-tag">{meta.label}</span>
            {lead ? (
              <PerformerChip performer={lead} />
            ) : (
              <span className="rtb-who rtb-who--empty">
                <Icon name="person_off" size={14} />
                לא דווח
              </span>
            )}
            {occ.performers.length > 1 && (
              <span className="rtb-row-more">+{occ.performers.length - 1}</span>
            )}
          </span>
        </span>

        {cover.length > 0 && (
          <span className="rtb-row-media" aria-label={`${occ.media.length} קבצי תיעוד`}>
            {cover.map((url) => (
              <span key={url} className="rtb-row-media-thumb">
                {isVideoUrl(url) ? (
                  <video src={url} muted playsInline preload="metadata" />
                ) : (
                  <img src={url} alt="" loading="lazy" />
                )}
              </span>
            ))}
            {extra > 0 && <span className="rtb-row-media-more">+{extra}</span>}
          </span>
        )}

        <span className="rtb-row-chevron" aria-hidden="true">
          <Icon name="expand_more" size={19} />
        </span>
      </button>

      <div className="rtb-row-panel">
        <div className="rtb-row-panel-inner">
          <div className="rtb-row-details">
            <div className="rtb-facts">
              <span className="rtb-fact">
                <Icon name="event_repeat" size={14} />
                {formatRecurrenceWeekday(occ.template.recurrence_weekday)}
              </span>
              {occ.at && (
                <span className="rtb-fact">
                  <Icon name="schedule" size={14} />
                  {timeOf(occ.at)}
                </span>
              )}
              <span className="rtb-fact">
                <Icon name="photo_library" size={14} />
                {occ.media.length > 0 ? `${occ.media.length} קבצי תיעוד` : "ללא תיעוד"}
              </span>
            </div>

            {occ.template.description && (
              <p className="rtb-row-desc">{occ.template.description}</p>
            )}

            {occ.performers.length > 0 && (
              <div className="rtb-block">
                <span className="rtb-block-label">
                  <Icon name="how_to_reg" size={14} />
                  מי טיפל
                </span>
                <div className="rtb-who-list">
                  {occ.performers.map((p) => (
                    <PerformerChip key={p.id} performer={p} />
                  ))}
                </div>
              </div>
            )}

            {occ.media.length > 0 ? (
              <div className="rtb-block">
                <span className="rtb-block-label">
                  <Icon name="perm_media" size={14} />
                  תיעוד
                </span>
                <div className="rtb-media-grid">
                  {occ.media.map((url) => (
                    <MediaTile key={url} url={url} onOpen={() => onPreview(url)} />
                  ))}
                </div>
              </div>
            ) : (
              <span className="rtb-row-hint">
                <Icon name="info" size={15} />
                {occ.status === "done"
                  ? "המשימה סומנה כבוצעה ללא צירוף תמונה או סרטון."
                  : "עדיין לא הועלה תיעוד למשימה זו."}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/* ============================== board ============================== */

interface RecurringTasksBoardProps {
  tasks: Task[];
  templates: TaskTemplate[];
  employees: Profile[];
  departments: Department[];
}

export function RecurringTasksBoard({
  tasks,
  templates,
  employees,
  departments,
}: RecurringTasksBoardProps) {
  const reduceMotion = useReducedMotion();
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const wk = useMemo(() => weekStart(new Date(date + "T12:00:00")), [date]);
  const weekDates = useMemo(() => HE_DAYS.map((_, i) => addDays(wk, i)), [wk]);

  const employeeById = useMemo(() => {
    const m = new Map<string, Profile>();
    employees.forEach((e) => m.set(e.id, e));
    return m;
  }, [employees]);

  const deptById = useMemo(() => {
    const m = new Map<string, Department>();
    departments.forEach((d) => m.set(d.id, d));
    return m;
  }, [departments]);

  const activeTemplates = useMemo(() => templates.filter((t) => t.active), [templates]);

  /** template_id → every materialized recurring row, so day lookups stay cheap. */
  const rowsByTemplate = useMemo(() => {
    const m = new Map<string, Task[]>();
    tasks.forEach((t) => {
      if (t.type !== "recurring" || !t.template_id) return;
      const arr = m.get(t.template_id);
      if (arr) arr.push(t);
      else m.set(t.template_id, [t]);
    });
    return m;
  }, [tasks]);

  const occurrencesFor = useMemo(() => {
    const cache = new Map<string, Occurrence[]>();
    return (d: string): Occurrence[] => {
      const hit = cache.get(d);
      if (hit) return hit;
      const weekday = weekdayOf(d);
      const list = activeTemplates
        .filter((t) => matchesRecurrenceWeekday(t.recurrence_weekday, weekday))
        .map((t) => {
          const rows = (rowsByTemplate.get(t.id) ?? []).filter((r) => isRecurringTaskForDate(r, d));
          return buildOccurrence(t, rows, employeeById, d, today);
        });
      cache.set(d, list);
      return list;
    };
  }, [activeTemplates, rowsByTemplate, employeeById, today]);

  const dayOccurrences = useMemo(() => occurrencesFor(date), [occurrencesFor, date]);

  const counts = useMemo(() => {
    let done = 0;
    let inProgress = 0;
    let todo = 0;
    let media = 0;
    dayOccurrences.forEach((o) => {
      if (o.status === "done") done++;
      else if (o.status === "in_progress") inProgress++;
      else todo++;
      if (o.media.length > 0) media++;
    });
    const total = dayOccurrences.length;
    return { done, inProgress, todo, media, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [dayOccurrences]);

  const weekProgress = useMemo(
    () =>
      weekDates.map((d) => {
        const list = occurrencesFor(d);
        const done = list.filter((o) => o.status === "done").length;
        return { date: d, total: list.length, done, pct: list.length ? done / list.length : 0 };
      }),
    [weekDates, occurrencesFor],
  );

  const sections = useMemo<DeptSection[]>(() => {
    const buckets = new Map<string, Occurrence[]>();
    dayOccurrences.forEach((o) => {
      const key = o.template.department_id ?? "__all__";
      const arr = buckets.get(key);
      if (arr) arr.push(o);
      else buckets.set(key, [o]);
    });

    const out: DeptSection[] = [];
    const push = (id: string, name: string, tone: string, all: Occurrence[]) => {
      const shown = all
        .filter((o) => matchesFilter(o, filter))
        .sort((a, b) => {
          const rank = STATUS_META[a.status].rank - STATUS_META[b.status].rank;
          return rank !== 0 ? rank : a.template.sort_order - b.template.sort_order;
        });
      if (shown.length === 0) return;
      out.push({
        id,
        name,
        tone,
        occurrences: shown,
        done: all.filter((o) => o.status === "done").length,
        total: all.length,
      });
    };

    departments.forEach((d) => {
      const all = buckets.get(d.id);
      if (all) push(d.id, d.name, colorForDepartment(d.id, d.color), all);
    });

    // Orphaned department ids (department deleted after the template was created)
    buckets.forEach((all, key) => {
      if (key === "__all__" || deptById.has(key)) return;
      push(key, "מחלקה שהוסרה", "#94a3b8", all);
    });

    const global = buckets.get("__all__");
    if (global) push("__all__", "כל העסק", "var(--accent)", global);

    return out;
  }, [dayOccurrences, departments, deptById, filter]);

  const isToday = date === today;
  const weekdayName = HE_DAYS[weekdayOf(date)];

  const chips: { key: StatusFilter; label: string; count: number; icon: string }[] = [
    { key: "done", label: "בוצעו", count: counts.done, icon: "check_circle" },
    { key: "in_progress", label: "בטיפול", count: counts.inProgress, icon: "timelapse" },
    { key: "todo", label: date < today ? "לא בוצעו" : "ממתינות", count: counts.todo, icon: "radio_button_unchecked" },
    { key: "media", label: "עם תיעוד", count: counts.media, icon: "perm_media" },
  ];

  function toggleSection(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="rtb">
      <header className="rtb-deck">
        <span className="rtb-deck-glow" aria-hidden="true" />

        <div className="rtb-deck-top">
          <div className="rtb-datenav">
            <button
              type="button"
              className="press rtb-datenav-btn"
              onClick={() => setDate((d) => addDays(d, -1))}
              aria-label="יום קודם"
            >
              <Icon name="chevron_right" size={19} />
            </button>
            <span className="rtb-datenav-copy">
              <span className="rtb-datenav-day">
                {isToday ? "היום" : weekdayName}
                {isToday && <span className="rtb-live-dot" aria-hidden="true" />}
              </span>
              <span className="rtb-datenav-date">
                {isToday ? `${weekdayName} · ${longDate(date)}` : longDate(date)}
              </span>
            </span>
            <button
              type="button"
              className="press rtb-datenav-btn"
              onClick={() => setDate((d) => addDays(d, 1))}
              aria-label="יום הבא"
            >
              <Icon name="chevron_left" size={19} />
            </button>
          </div>

          {!isToday && (
            <button type="button" className="press rtb-today-btn" onClick={() => setDate(today)}>
              <Icon name="today" size={15} />
              חזרה להיום
            </button>
          )}
        </div>

        <div className="rtb-summary">
          <ProgressRing value={counts.pct} />
          <div className="rtb-summary-copy">
            <span className="rtb-summary-title">
              {counts.total === 0
                ? "אין משימות קבועות ליום זה"
                : `${counts.done} מתוך ${counts.total} משימות בוצעו`}
            </span>
            <span className="rtb-summary-sub">
              {counts.total === 0
                ? "המשימות מוגדרות לפי ימים בלשונית משימות קבועות"
                : counts.todo === 0 && counts.inProgress === 0
                  ? "כל המשימות הקבועות של היום הושלמו"
                  : "לחיצה על משימה פותחת את הפרטים, המבצעים והתיעוד"}
            </span>
          </div>
        </div>

        <div className="rtb-strip" role="tablist" aria-label="ימי השבוע">
          {weekProgress.map((d, i) => {
            const active = d.date === date;
            return (
              <button
                key={d.date}
                type="button"
                role="tab"
                aria-selected={active}
                data-active={active || undefined}
                data-today={d.date === today || undefined}
                className="press rtb-strip-day"
                onClick={() => setDate(d.date)}
                title={`${HE_DAYS[i]} ${formatDateShort(d.date)} · ${d.done}/${d.total}`}
              >
                <span className="rtb-strip-name">{HE_DAYS[i].slice(0, 3)}</span>
                <span className="rtb-strip-num">{d.date.slice(8, 10)}</span>
                <span className="rtb-strip-bar" aria-hidden="true">
                  <i style={{ transform: `scaleX(${d.total ? d.pct : 0})` }} />
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {counts.total > 0 && (
        <div className="rtb-filters" role="group" aria-label="סינון לפי סטטוס">
          <button
            type="button"
            className="press rtb-chip"
            data-active={filter === "all" || undefined}
            onClick={() => setFilter("all")}
          >
            הכל
            <b>{counts.total}</b>
          </button>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className="press rtb-chip"
              data-tone={c.key}
              data-active={filter === c.key || undefined}
              disabled={c.count === 0}
              onClick={() => setFilter((f) => (f === c.key ? "all" : c.key))}
            >
              <Icon name={c.icon} size={15} />
              {c.label}
              <b>{c.count}</b>
            </button>
          ))}
        </div>
      )}

      {sections.length === 0 ? (
        <div className="rtb-empty">
          <span className="rtb-empty-icon">
            <Icon name={counts.total === 0 ? "event_busy" : "filter_alt_off"} size={26} />
          </span>
          <span className="rtb-empty-title">
            {counts.total === 0 ? "אין משימות קבועות ליום זה" : "אין משימות שתואמות לסינון"}
          </span>
          <span className="rtb-empty-sub">
            {counts.total === 0
              ? "אפשר להוסיף משימות קבועות ולשייך אותן למחלקה בלשונית «משימות קבועות»."
              : "נסו לבחור סינון אחר או להציג את כל המשימות."}
          </span>
        </div>
      ) : (
        <motion.div
          key={date}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26, ease: EASE_OUT }}
          className="rtb-sections"
        >
          {sections.map((section, si) => {
            const open = !collapsed.has(section.id);
            const pct = section.total ? Math.round((section.done / section.total) * 100) : 0;
            return (
              <article
                key={section.id}
                className="rtb-dept"
                data-open={open || undefined}
                style={
                  {
                    "--dept-tone": section.tone,
                    "--enter-delay": `${Math.min(si, 6) * 60}ms`,
                  } as CSSProperties
                }
              >
                <button
                  type="button"
                  className="rtb-dept-head"
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={open}
                >
                  <span className="rtb-dept-dot" aria-hidden="true" />
                  <span className="rtb-dept-name">{section.name}</span>
                  <span className="rtb-dept-meter" aria-hidden="true">
                    <i style={{ transform: `scaleX(${section.total ? section.done / section.total : 0})` }} />
                  </span>
                  <span className="rtb-dept-ratio">
                    <b>{section.done}</b>/{section.total}
                    <span className="rtb-dept-pct">{pct}%</span>
                  </span>
                  <span className="rtb-dept-chevron" aria-hidden="true">
                    <Icon name="expand_more" size={20} />
                  </span>
                </button>

                {open && (
                  <div className="rtb-rows">
                    {section.occurrences.map((occ, i) => {
                      const key = `${section.id}:${occ.template.id}`;
                      return (
                        <OccurrenceRow
                          key={key}
                          occ={occ}
                          index={i}
                          expanded={expandedId === key}
                          onToggle={() => setExpandedId((cur) => (cur === key ? null : key))}
                          onPreview={setPreview}
                        />
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </motion.div>
      )}

      <MediaLightbox url={preview} onClose={() => setPreview(null)} />
    </section>
  );
}
