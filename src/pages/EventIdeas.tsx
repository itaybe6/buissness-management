import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Button,
  Field,
  Icon,
  Input,
  PageLoader,
  ErrorState,
  Textarea,
} from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EventsSubNav } from "@/components/events/EventsSubNav";
import { EASE_OUT, SPRING } from "@/components/motion/shared-motion";
import { useIsMdUp } from "@/hooks/useMediaQuery";
import {
  useCreateEventIdea,
  useDeleteEventIdea,
  useEventIdeas,
  useUpdateEventIdea,
} from "@/api/eventIdeas";
import { useProfiles } from "@/api/users";
import { useAuth } from "@/lib/auth";
import { EVENT_MANAGE_ROLES } from "@/lib/constants";
import { useBusinessId, colorFor } from "@/lib/db";
import type { EventIdea, Profile } from "@/types/database";

/** Rotating placeholder line under the composer title. */
const PROMPTS = [
  "ערב ג'אז על הגג…",
  "תחרות קוקטיילים מקוריים…",
  "מסיבת נושא — לבן וזהב…",
  "סדנת מיקסולוגיה לצוות…",
  "ערב DJ עם אמנות חיה…",
];

/** One-tap title seeds — fill the field for anyone who is stuck. */
const SEEDS = ["ערב ג'אז על הגג", "תחרות קוקטיילים", "מסיבת לבן וזהב", "סדנת מיקסולוגיה", "ערב DJ ואמנות חיה"];

const DAY_MS = 86_400_000;

type GroupKey = "today" | "yesterday" | "week" | "older";

const GROUP_LABEL: Record<GroupKey, string> = {
  today: "היום",
  yesterday: "אתמול",
  week: "השבוע האחרון",
  older: "קודם לכן",
};

const GROUP_ORDER: GroupKey[] = ["today", "yesterday", "week", "older"];

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function groupOf(iso: string): GroupKey {
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days <= 7) return "week";
  return "older";
}

/** Short, chat-style timestamp. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  if (min < 1) return "עכשיו";
  if (min < 60) return `לפני ${min} דק׳`;
  const hours = Math.round(min / 60);
  if (hours < 24) return hours === 1 ? "לפני שעה" : `לפני ${hours} שעות`;
  const days = Math.round(hours / 24);
  if (days === 1) return "אתמול";
  if (days < 7) return `לפני ${days} ימים`;
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

function SparkBurst({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="evid-burst" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="evid-spark" style={{ "--i": i } as React.CSSProperties} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Hero — full-bleed ink header shared by mobile and desktop.
 * ------------------------------------------------------------------ */
function IdeasHero({
  count,
  contributors,
  weekCount,
}: {
  count: number;
  contributors: number;
  weekCount: number;
}) {
  const reduce = useReducedMotion();
  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, transform: "translateY(10px)" },
          animate: { opacity: 1, transform: "translateY(0)" },
          transition: { duration: 0.34, delay, ease: EASE_OUT },
        };

  return (
    <header className="evid-hero" aria-label="רעיונות לאירועים">
      <span className="evid-glow evid-glow--1" aria-hidden />
      <span className="evid-glow evid-glow--2" aria-hidden />
      <span className="evid-grid-lines" aria-hidden />
      <span className="evid-orb evid-orb--1" aria-hidden>
        <Icon name="lightbulb" size={15} />
      </span>
      <span className="evid-orb evid-orb--2" aria-hidden>
        <Icon name="auto_awesome" size={13} />
      </span>
      <span className="evid-orb evid-orb--3" aria-hidden>
        <Icon name="celebration" size={14} />
      </span>

      <div className="evid-hero-inner">
        <motion.div className="evid-hero-bar" {...rise(0)}>
          <span className="evid-kicker">
            <span className="evid-kicker-dot" aria-hidden />
            בנק רעיונות
          </span>
        </motion.div>

        <motion.div className="evid-hero-copy" {...rise(0.05)}>
          <h1 className="evid-title">
            מה חלמתם
            <br />
            <span className="evid-title-em">לעשות הבא?</span>
          </h1>
          <p className="evid-sub">
            כל רעיון — קריצה לאירוע הבא. שתפו, השראו, ותנו למנהלת האירועים את הניצוץ.
          </p>
        </motion.div>

        <motion.div className="evid-stats" {...rise(0.12)}>
          <div className="evid-stat">
            <span className="evid-stat-label">
              <Icon name="tips_and_updates" size={13} />
              רעיונות
            </span>
            <span className="evid-stat-value">{count}</span>
          </div>
          <div className="evid-stat">
            <span className="evid-stat-label">
              <Icon name="groups" size={13} />
              תורמים
            </span>
            <span className="evid-stat-value">{contributors}</span>
          </div>
          <div className="evid-stat" data-tone={weekCount > 0 ? "live" : undefined}>
            <span className="evid-stat-label">
              <Icon name="bolt" size={13} />
              השבוע
            </span>
            <span className="evid-stat-value">{weekCount}</span>
          </div>
        </motion.div>

        <motion.div className="evid-hero-nav" {...rise(0.18)}>
          <EventsSubNav active="ideas" variant="ink" />
        </motion.div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * Composer fields — one source of truth for the rail card and the
 * mobile bottom sheet.
 * ------------------------------------------------------------------ */
function IdeaFields({
  title,
  body,
  error,
  autoFocus,
  inputRef,
  onTitleChange,
  onBodyChange,
  onSubmit,
}: {
  title: string;
  body: string;
  error: string | null;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="evid-fields">
      <Field label="כותרת הרעיון">
        <Input
          ref={inputRef}
          value={title}
          autoFocus={autoFocus}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="תנו לזה שם שמדליק את הדמיון"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
      </Field>

      <div className="evid-seeds" role="group" aria-label="רעיונות פתיחה">
        <span className="evid-seeds-label">
          <Icon name="bolt" size={13} />
          ניצוץ מהיר
        </span>
        <div className="evid-seeds-row">
          {SEEDS.map((seed) => (
            <button
              key={seed}
              type="button"
              className="evid-seed"
              data-active={title === seed || undefined}
              onClick={() => onTitleChange(seed)}
            >
              {seed}
            </button>
          ))}
        </div>
      </div>

      <Field label="פרטים (אופציונלי)">
        <Textarea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder="למה זה מתאים? מה האווירה? מה קורה בפועל?"
          rows={4}
          className="evid-textarea"
        />
        <span className="evid-count">{body.length > 0 ? `${body.length} תווים` : " "}</span>
      </Field>

      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            className="evid-error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            <Icon name="error" size={15} />
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Desktop rail card wrapping the shared fields. */
function IdeaComposer({
  title,
  body,
  saving,
  error,
  success,
  promptIndex,
  inputRef,
  onTitleChange,
  onBodyChange,
  onSubmit,
}: {
  title: string;
  body: string;
  saving: boolean;
  error: string | null;
  success: boolean;
  promptIndex: number;
  inputRef?: React.Ref<HTMLInputElement>;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const reduce = useReducedMotion();
  const [focused, setFocused] = useState(false);

  return (
    <section
      className="evid-composer"
      data-focused={focused || undefined}
      data-success={success || undefined}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false);
      }}
    >
      <SparkBurst active={success} />
      <span className="evid-composer-glow" aria-hidden />

      <div className="evid-composer-head">
        <motion.span
          className="evid-composer-icon"
          animate={success && !reduce ? { rotate: [0, -8, 8, 0], scale: [1, 1.12, 1] } : {}}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          aria-hidden
        >
          <Icon name={success ? "check" : "edit_note"} size={21} />
        </motion.span>
        <div className="min-w-0 flex-1">
          <h2 className="evid-composer-title">זרקו רעיון לעגלה</h2>
          <AnimatePresence mode="wait">
            <motion.p
              key={promptIndex}
              className="evid-composer-hint"
              initial={reduce ? false : { opacity: 0, transform: "translateY(4px)" }}
              animate={{ opacity: 1, transform: "translateY(0)" }}
              exit={reduce ? undefined : { opacity: 0, transform: "translateY(-4px)" }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
            >
              לדוגמה: {PROMPTS[promptIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      <IdeaFields
        title={title}
        body={body}
        error={error}
        inputRef={inputRef}
        onTitleChange={onTitleChange}
        onBodyChange={onBodyChange}
        onSubmit={onSubmit}
      />

      <Button
        icon={success ? "check" : "send"}
        loading={saving}
        onClick={onSubmit}
        disabled={success}
        className="evid-submit"
      >
        {success ? "פורסם!" : "פרסום רעיון"}
      </Button>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Feed card.
 * ------------------------------------------------------------------ */
function IdeaCard({
  idea,
  number,
  author,
  isMine,
  canEdit,
  canDelete,
  isFresh,
  onEdit,
  onDelete,
}: {
  idea: EventIdea;
  number: number;
  author: Profile | undefined;
  isMine: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isFresh: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const longBody = (idea.body?.length ?? 0) > 150;
  const accent = colorFor(idea.created_by);
  const authorName = author?.full_name ?? "עובד/ת";

  return (
    <motion.article
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, transform: "translateY(14px) scale(0.98)" }}
      animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
      exit={
        reduce ? undefined : { opacity: 0, transform: "scale(0.96)", transition: { duration: 0.18 } }
      }
      whileHover={reduce ? undefined : { y: -3 }}
      transition={SPRING}
      className="evid-card"
      data-fresh={isFresh || undefined}
      style={{ "--idea-accent": accent } as React.CSSProperties}
    >
      <span className="evid-card-edge" aria-hidden />
      <span className="evid-card-mark" aria-hidden>
        <Icon name="format_quote" size={62} />
      </span>

      <div className="evid-card-top">
        <span className="evid-card-ring">
          <UserAvatar
            userId={idea.created_by}
            name={authorName}
            avatarUrl={author?.avatar_url}
            size={34}
            rounded="circle"
          />
        </span>
        <div className="evid-card-who">
          <span className="evid-card-author">
            {authorName}
            {isMine && <span className="evid-card-mine">אני</span>}
          </span>
          <span className="evid-card-meta">
            <time dateTime={idea.created_at}>{formatWhen(idea.created_at)}</time>
            <span aria-hidden>·</span>
            <span className="evid-card-no">#{number}</span>
            {isFresh && (
              <motion.span
                className="evid-card-flag"
                initial={reduce ? false : { opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={SPRING}
              >
                <Icon name="auto_awesome" size={11} />
                חדש
              </motion.span>
            )}
          </span>
        </div>

        {(canEdit || canDelete) && (
          <div className="evid-card-actions">
            {canEdit && (
              <button type="button" className="evid-card-action" onClick={onEdit} aria-label="עריכה">
                <Icon name="edit" size={17} />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="evid-card-action evid-card-action--danger"
                onClick={onDelete}
                aria-label="מחיקה"
              >
                <Icon name="delete" size={17} />
              </button>
            )}
          </div>
        )}
      </div>

      <h3 className="evid-card-title">{idea.title}</h3>

      {idea.body && (
        <div className="evid-card-body-wrap">
          <motion.p
            className="evid-card-body"
            animate={{ maxHeight: expanded || !longBody ? 640 : 76 }}
            transition={{ duration: 0.32, ease: EASE_OUT }}
          >
            {idea.body}
          </motion.p>
          {longBody && (
            <button type="button" className="evid-card-more" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "פחות" : "קרא עוד"}
              <Icon name={expanded ? "expand_less" : "expand_more"} size={16} />
            </button>
          )}
        </div>
      )}
    </motion.article>
  );
}

/** Rail widget — who feeds the bank. */
function ContributorBoard({
  rows,
}: {
  rows: { id: string; name: string; avatarUrl: string | null; count: number }[];
}) {
  const top = rows[0]?.count ?? 1;
  return (
    <section className="evid-board">
      <h3 className="evid-board-title">
        <Icon name="workspace_premium" size={16} />
        מובילי הרעיונות
      </h3>
      <ul className="evid-board-list">
        {rows.map((row, i) => (
          <li key={row.id} className="evid-board-row">
            <span className="evid-board-rank" data-first={i === 0 || undefined}>
              {i + 1}
            </span>
            <UserAvatar userId={row.id} name={row.name} avatarUrl={row.avatarUrl} size={30} rounded="circle" />
            <span className="evid-board-name">{row.name}</span>
            <span className="evid-board-bar" aria-hidden>
              <span style={{ width: `${Math.max(12, (row.count / top) * 100)}%` }} />
            </span>
            <span className="evid-board-n">{row.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function IdeasEmpty({ onStart }: { onStart: () => void }) {
  return (
    <motion.div
      className="evid-empty"
      initial={{ opacity: 0, transform: "translateY(12px)" }}
      animate={{ opacity: 1, transform: "translateY(0)" }}
      transition={{ duration: 0.36, ease: EASE_OUT }}
    >
      <div className="evid-empty-art" aria-hidden>
        <span className="evid-empty-ring evid-empty-ring--1" />
        <span className="evid-empty-ring evid-empty-ring--2" />
        <span className="evid-empty-bulb">
          <Icon name="lightbulb" size={34} />
        </span>
      </div>
      <h3 className="evid-empty-title">הבמה ריקה — מחכה לניצוץ הראשון</h3>
      <p className="evid-empty-sub">
        עדיין אין רעיונות. תהיו הראשונים לזרוק מחשבה — כל הצוות רואה, ומנהלת האירועים אוספת השראה.
      </p>
      <Button icon="add" onClick={onStart} className="mt-1">
        כתיבת הרעיון הראשון
      </Button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */

export function EventIdeas() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const isMdUp = useIsMdUp();
  const { data: ideas = [], isLoading, isError, refetch } = useEventIdeas(businessId);
  const { data: users = [] } = useProfiles(businessId);
  const create = useCreateEventIdea();
  const update = useUpdateEventIdea(businessId);
  const remove = useDeleteEventIdea(businessId);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [promptIndex, setPromptIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "mine">("all");

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EventIdea | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventIdea | null>(null);

  const composerInputRef = useRef<HTMLInputElement>(null);

  const canManage = !!(profile?.role && EVENT_MANAGE_ROLES.includes(profile.role));

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u] as const)), [users]);

  const contributors = useMemo(() => new Set(ideas.map((i) => i.created_by)).size, [ideas]);

  const weekCount = useMemo(
    () => ideas.filter((i) => Date.now() - new Date(i.created_at).getTime() < 7 * DAY_MS).length,
    [ideas],
  );

  const mineCount = useMemo(
    () => (profile?.id ? ideas.filter((i) => i.created_by === profile.id).length : 0),
    [ideas, profile?.id],
  );

  /** Newest-first list already; the running number counts from the oldest. */
  const numberById = useMemo(() => {
    const map = new Map<string, number>();
    ideas.forEach((idea, i) => map.set(idea.id, ideas.length - i));
    return map;
  }, [ideas]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ideas.filter((idea) => {
      if (scope === "mine" && idea.created_by !== profile?.id) return false;
      if (!q) return true;
      const author = userById.get(idea.created_by)?.full_name ?? "";
      return (
        idea.title.toLowerCase().includes(q) ||
        (idea.body ?? "").toLowerCase().includes(q) ||
        author.toLowerCase().includes(q)
      );
    });
  }, [ideas, query, scope, profile?.id, userById]);

  const groups = useMemo(() => {
    const buckets = new Map<GroupKey, EventIdea[]>();
    for (const idea of filtered) {
      const key = groupOf(idea.created_at);
      const list = buckets.get(key);
      if (list) list.push(idea);
      else buckets.set(key, [idea]);
    }
    return GROUP_ORDER.filter((k) => buckets.has(k)).map((k) => ({
      key: k,
      label: GROUP_LABEL[k],
      items: buckets.get(k)!,
    }));
  }, [filtered]);

  const board = useMemo(() => {
    const counts = new Map<string, number>();
    for (const idea of ideas) counts.set(idea.created_by, (counts.get(idea.created_by) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([id, count]) => ({
        id,
        name: userById.get(id)?.full_name ?? "עובד/ת",
        avatarUrl: userById.get(id)?.avatar_url ?? null,
        count,
      }));
  }, [ideas, userById]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPromptIndex((p) => (p + 1) % PROMPTS.length);
    }, 3400);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!freshId) return;
    const id = window.setTimeout(() => setFreshId(null), 4000);
    return () => window.clearTimeout(id);
  }, [freshId]);

  function startComposing() {
    if (isMdUp) {
      composerInputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      composerInputRef.current?.focus({ preventScroll: true });
    } else {
      setSheetOpen(true);
    }
  }

  async function submitIdea() {
    setComposerError(null);
    if (!title.trim()) {
      setComposerError("נא להזין כותרת לרעיון");
      return;
    }
    if (!profile?.id || !businessId) return;
    setSaving(true);
    try {
      const newId = await create.mutateAsync({
        business_id: businessId,
        created_by: profile.id,
        title: title.trim(),
        body: body.trim() || null,
      });
      setTitle("");
      setBody("");
      setSuccess(true);
      setFreshId(newId);
      setScope("all");
      setQuery("");
      window.setTimeout(() => setSuccess(false), 1600);
      if (sheetOpen) window.setTimeout(() => setSheetOpen(false), 620);
    } catch {
      setComposerError("שמירת הרעיון נכשלה. נסו שוב.");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(idea: EventIdea) {
    setEditTarget(idea);
    setEditTitle(idea.title);
    setEditBody(idea.body ?? "");
    setEditError(null);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editTarget) return;
    setEditError(null);
    if (!editTitle.trim()) {
      setEditError("נא להזין כותרת");
      return;
    }
    try {
      await update.mutateAsync({
        id: editTarget.id,
        title: editTitle.trim(),
        body: editBody.trim() || null,
      });
      setEditOpen(false);
      setEditTarget(null);
    } catch {
      setEditError("עדכון הרעיון נכשל");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // keep modal open
    }
  }

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const hasIdeas = ideas.length > 0;

  return (
    <div className="evid-page page-enter">
      <IdeasHero count={ideas.length} contributors={contributors} weekCount={weekCount} />

      <div className="evid-body">
        <section className="evid-feed" aria-label="כל הרעיונות">
          {hasIdeas && (
            <div className="evid-toolbar">
              <div className="evid-search">
                <Icon name="search" size={18} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="חיפוש רעיון או שם"
                  aria-label="חיפוש רעיונות"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="ניקוי חיפוש">
                    <Icon name="close" size={16} />
                  </button>
                )}
              </div>
              <div className="evid-chips" role="group" aria-label="סינון רעיונות">
                <button
                  type="button"
                  aria-pressed={scope === "all"}
                  className="evid-chip"
                  data-active={scope === "all" || undefined}
                  onClick={() => setScope("all")}
                >
                  <Icon name="grid_view" size={15} />
                  הכל
                  <span className="evid-chip-n">{ideas.length}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={scope === "mine"}
                  className="evid-chip"
                  data-active={scope === "mine" || undefined}
                  onClick={() => setScope("mine")}
                >
                  <Icon name="person" size={15} />
                  שלי
                  <span className="evid-chip-n">{mineCount}</span>
                </button>
              </div>
            </div>
          )}

          {!hasIdeas ? (
            <IdeasEmpty onStart={startComposing} />
          ) : filtered.length === 0 ? (
            <div className="evid-noresults">
              <Icon name="search_off" size={26} />
              <p className="evid-noresults-title">לא נמצאו רעיונות</p>
              <p className="evid-noresults-sub">נסו מילה אחרת, או נקו את הסינון.</p>
              <Button
                variant="secondary"
                icon="filter_alt_off"
                onClick={() => {
                  setQuery("");
                  setScope("all");
                }}
              >
                ניקוי סינון
              </Button>
            </div>
          ) : (
            <div className="evid-groups">
              {groups.map((group) => (
                <div className="evid-group" key={group.key}>
                  <div className="evid-group-head">
                    <span className="evid-group-label">{group.label}</span>
                    <span className="evid-group-line" aria-hidden />
                    <span className="evid-group-n">{group.items.length}</span>
                  </div>
                  <div className="evid-grid">
                    <AnimatePresence mode="popLayout">
                      {group.items.map((idea) => {
                        const isOwner = idea.created_by === profile?.id;
                        return (
                          <IdeaCard
                            key={idea.id}
                            idea={idea}
                            number={numberById.get(idea.id) ?? 0}
                            author={userById.get(idea.created_by)}
                            isMine={isOwner}
                            canEdit={isOwner}
                            canDelete={isOwner || canManage}
                            isFresh={idea.id === freshId}
                            onEdit={() => openEdit(idea)}
                            onDelete={() => setDeleteTarget(idea)}
                          />
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {isMdUp && (
          <aside className="evid-rail" aria-label="הוספת רעיון">
            <div className="evid-rail-inner">
              <IdeaComposer
                title={title}
                body={body}
                saving={saving}
                error={composerError}
                success={success}
                promptIndex={promptIndex}
                inputRef={composerInputRef}
                onTitleChange={setTitle}
                onBodyChange={setBody}
                onSubmit={submitIdea}
              />
              {board.length > 1 && <ContributorBoard rows={board} />}
            </div>
          </aside>
        )}
      </div>

      {!isMdUp &&
        createPortal(
          <button type="button" className="evid-fab" onClick={() => setSheetOpen(true)}>
            <Icon name="add" size={21} />
            רעיון חדש
          </button>,
          document.body,
        )}

      {/* Mobile composer sheet — same fields as the desktop rail */}
      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="רעיון חדש"
        subtitle={`לדוגמה: ${PROMPTS[promptIndex]}`}
        icon="lightbulb"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSheetOpen(false)}>
              ביטול
            </Button>
            <Button
              className="flex-1"
              icon={success ? "check" : "send"}
              loading={saving}
              disabled={success}
              onClick={submitIdea}
            >
              {success ? "פורסם!" : "פרסום רעיון"}
            </Button>
          </>
        }
      >
        <IdeaFields
          title={title}
          body={body}
          error={composerError}
          autoFocus
          onTitleChange={setTitle}
          onBodyChange={setBody}
          onSubmit={submitIdea}
        />
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="עריכת רעיון"
        icon="edit"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              ביטול
            </Button>
            <Button className="flex-1" loading={update.isPending} onClick={saveEdit}>
              שמירה
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <Field label="כותרת">
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus />
          </Field>
          <Field label="פרטים">
            <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={4} />
          </Field>
          {editError && <p className="text-[13px] text-danger">{editError}</p>}
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="מחיקת רעיון"
        icon="delete"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              ביטול
            </Button>
            <Button className="flex-1" loading={remove.isPending} onClick={confirmDelete}>
              מחיקה
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-text-2">
          למחוק את הרעיון <strong>{deleteTarget?.title}</strong>?
        </p>
      </Modal>
    </div>
  );
}
