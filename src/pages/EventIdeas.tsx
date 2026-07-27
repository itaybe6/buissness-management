import { useEffect, useMemo, useState } from "react";
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
import { EventsSubNav } from "@/components/events/EventsSubNav";
import { PageEnter, EASE_OUT, SPRING } from "@/components/motion/shared-motion";
import {
  useCreateEventIdea,
  useDeleteEventIdea,
  useEventIdeas,
  useUpdateEventIdea,
} from "@/api/eventIdeas";
import { useProfiles } from "@/api/users";
import { useAuth } from "@/lib/auth";
import { EVENT_MANAGE_ROLES } from "@/lib/constants";
import { useBusinessId, colorFor, initialsOf } from "@/lib/db";
import type { EventIdea } from "@/types/database";

const PROMPTS = [
  "ערב ג'azz על הגג…",
  "תחרות קוקטיילים מקוריים…",
  "מסיבת thème — לבן וזהב…",
  "סדנת מיקסולוגיה לצוות…",
  "אירוע DJ + אמנות חייה…",
];

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `היום · ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function SparkBurst({ active }: { active: boolean }) {
  if (!active) return null;
  const sparks = Array.from({ length: 10 }, (_, i) => i);
  return (
    <div className="evidea-spark-burst" aria-hidden>
      {sparks.map((i) => (
        <span key={i} className="evidea-spark" style={{ "--i": i } as React.CSSProperties} />
      ))}
    </div>
  );
}

function IdeasHero({ count, contributors }: { count: number; contributors: number }) {
  const reduce = useReducedMotion();

  return (
    <section className="evidea-hero" aria-label="רעיונות לאירועים">
      <div className="evidea-hero__fx" aria-hidden>
        <span className="evidea-hero__grid" />
        <span className="evidea-hero__chip evidea-hero__chip--1">
          <Icon name="lightbulb" size={14} />
        </span>
        <span className="evidea-hero__chip evidea-hero__chip--2">
          <Icon name="auto_awesome" size={13} />
        </span>
        <span className="evidea-hero__chip evidea-hero__chip--3">
          <Icon name="celebration" size={13} />
        </span>
      </div>

      <div className="evidea-hero__body">
        <motion.p
          className="evidea-hero__kicker"
          initial={reduce ? false : { opacity: 0, transform: "translateY(6px)" }}
          animate={{ opacity: 1, transform: "translateY(0)" }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
        >
          <span className="evidea-hero__kicker-dot" aria-hidden />
          בנק רעיונות
        </motion.p>

        <motion.h1
          className="evidea-hero__title"
          initial={reduce ? false : { opacity: 0, transform: "translateY(10px)" }}
          animate={{ opacity: 1, transform: "translateY(0)" }}
          transition={{ duration: 0.34, delay: 0.05, ease: EASE_OUT }}
        >
          מה חלמתם
          <br />
          <span className="evidea-hero__title-accent">לעשות הבא?</span>
        </motion.h1>

        <motion.p
          className="evidea-hero__sub"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.12, ease: EASE_OUT }}
        >
          כל רעיון — קריצה לאירוע הבא. שתפו, השראו, תנו למנהלת האירועים את הניצוץ.
        </motion.p>

        <motion.div
          className="evidea-hero__stats"
          initial={reduce ? false : { opacity: 0, transform: "translateY(8px)" }}
          animate={{ opacity: 1, transform: "translateY(0)" }}
          transition={{ duration: 0.32, delay: 0.18, ease: EASE_OUT }}
        >
          <span className="evidea-stat">
            <Icon name="tips_and_updates" size={15} />
            <strong>{count}</strong>
            {count === 1 ? " רעיון" : " רעיונות"}
          </span>
          <span className="evidea-stat">
            <Icon name="groups" size={15} />
            <strong>{contributors}</strong>
            {contributors === 1 ? " תורם/ת" : " תורמים"}
          </span>
        </motion.div>
      </div>
    </section>
  );
}

function IdeaComposer({
  title,
  body,
  saving,
  error,
  success,
  promptIndex,
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
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const reduce = useReducedMotion();
  const [focused, setFocused] = useState(false);

  return (
    <motion.section
      className="evidea-composer"
      data-focused={focused || undefined}
      data-success={success || undefined}
      initial={reduce ? false : { opacity: 0, transform: "translateY(14px)" }}
      animate={{ opacity: 1, transform: "translateY(0)" }}
      transition={{ duration: 0.36, delay: 0.1, ease: EASE_OUT }}
    >
      <SparkBurst active={success} />

      <div className="evidea-composer__glow" aria-hidden />

      <div className="evidea-composer__head">
        <motion.span
          className="evidea-composer__icon"
          animate={success ? { rotate: [0, -8, 8, 0], scale: [1, 1.12, 1] } : {}}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          aria-hidden
        >
          <Icon name={success ? "check" : "edit_note"} size={22} />
        </motion.span>
        <div className="min-w-0 flex-1">
          <h2 className="evidea-composer__title">זרקו רעיון לעגלה</h2>
          <AnimatePresence mode="wait">
            <motion.p
              key={promptIndex}
              className="evidea-composer__hint"
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

      <div
        className="evidea-composer__fields"
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false);
        }}
      >
        <Field label="כותרת הרעיון">
          <Input
            value={title}
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
        <Field label="פרטים (אופציונלי)">
          <Textarea
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            placeholder="למה זה מתאים? מה האווירה? מה קורה בפועל?"
            rows={4}
            className="evidea-composer__textarea min-h-[108px] resize-none"
          />
          <span className="evidea-composer__count">{body.length > 0 ? `${body.length} תווים` : " "}</span>
        </Field>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            className="evidea-composer__error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <motion.div className="evidea-composer__foot" layout={!reduce}>
        <Button
          icon={success ? "check" : "send"}
          loading={saving}
          onClick={onSubmit}
          className="evidea-composer__submit"
          disabled={success}
        >
          {success ? "פורסם!" : "פרסום רעיון"}
        </Button>
      </motion.div>
    </motion.section>
  );
}

function IdeaCard({
  idea,
  index,
  authorName,
  canEdit,
  canDelete,
  isFresh,
  onEdit,
  onDelete,
}: {
  idea: EventIdea;
  index: number;
  authorName: string;
  canEdit: boolean;
  canDelete: boolean;
  isFresh: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const longBody = (idea.body?.length ?? 0) > 140;
  const avatarColor = colorFor(idea.created_by);

  return (
    <motion.article
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, transform: "translateY(16px) scale(0.98)" }}
      animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
      exit={reduce ? undefined : { opacity: 0, transform: "translateY(-8px) scale(0.97)", transition: { duration: 0.2 } }}
      transition={{ ...SPRING, delay: Math.min(index * 0.04, 0.24) }}
      whileHover={reduce ? undefined : { transform: "translateY(-3px)" }}
      className="evidea-card"
      data-fresh={isFresh || undefined}
      style={{ "--idea-accent": avatarColor } as React.CSSProperties}
    >
      <span className="evidea-card__edge" aria-hidden />
      <span className="evidea-card__index" aria-hidden>
        #{index + 1}
      </span>

      <div className="evidea-card__head">
        <span className="evidea-card__avatar-ring">
          <span className="evidea-card__avatar" style={{ background: avatarColor }}>
            {initialsOf(authorName)}
          </span>
        </span>
        <div className="evidea-card__meta">
          <span className="evidea-card__author">{authorName}</span>
          <time className="evidea-card__when" dateTime={idea.created_at}>
            {formatWhen(idea.created_at)}
          </time>
        </div>
        {(canEdit || canDelete) && (
          <div className="evidea-card__actions">
            {canEdit && (
              <button type="button" className="evidea-card__action press" onClick={onEdit} aria-label="עריכה">
                <Icon name="edit" size={17} />
              </button>
            )}
            {canDelete && (
              <button type="button" className="evidea-card__action press" onClick={onDelete} aria-label="מחיקה">
                <Icon name="delete" size={17} />
              </button>
            )}
          </div>
        )}
      </div>

      <h3 className="evidea-card__title">{idea.title}</h3>

      {idea.body && (
        <div className="evidea-card__body-wrap">
          <motion.p
            className="evidea-card__body"
            animate={{ maxHeight: expanded || !longBody ? 600 : 72 }}
            transition={{ duration: 0.32, ease: EASE_OUT }}
          >
            {idea.body}
          </motion.p>
          {longBody && (
            <button type="button" className="evidea-card__more press" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "פחות" : "קרא עוד"}
              <Icon name={expanded ? "expand_less" : "expand_more"} size={16} />
            </button>
          )}
        </div>
      )}

      {isFresh && (
        <motion.span
          className="evidea-card__fresh-badge"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING}
        >
          <Icon name="auto_awesome" size={12} />
          חדש
        </motion.span>
      )}
    </motion.article>
  );
}

function IdeasEmpty() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className="evidea-empty"
      initial={reduce ? false : { opacity: 0, transform: "translateY(12px)" }}
      animate={{ opacity: 1, transform: "translateY(0)" }}
      transition={{ duration: 0.36, ease: EASE_OUT }}
    >
      <div className="evidea-empty__icon-wrap" aria-hidden>
        <span className="evidea-empty__ring evidea-empty__ring--1" />
        <span className="evidea-empty__ring evidea-empty__ring--2" />
        <span className="evidea-empty__bulb">
          <Icon name="lightbulb" size={36} />
        </span>
      </div>
      <h3 className="evidea-empty__title">הבמה ריקה — מחכה לניצוץ הראשון</h3>
      <p className="evidea-empty__sub">
        עדיין אין רעיונות. תהיו הראשונים לזרוק מחשבה — כל הצוות רואה, ומנהלת האירועים אוספת השראה.
      </p>
    </motion.div>
  );
}

export function EventIdeas() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
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

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EventIdea | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventIdea | null>(null);

  const canManage = !!(profile?.role && EVENT_MANAGE_ROLES.includes(profile.role));

  const userById = useMemo(
    () => new Map(users.map((u) => [u.id, u.full_name ?? "עובד/ת"] as const)),
    [users],
  );

  const contributors = useMemo(
    () => new Set(ideas.map((i) => i.created_by)).size,
    [ideas],
  );

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
      window.setTimeout(() => setSuccess(false), 1600);
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

  return (
    <PageEnter className="evidea-page w-full">
      <IdeasHero count={ideas.length} contributors={contributors} />

      <EventsSubNav active="ideas" />

      <IdeaComposer
        title={title}
        body={body}
        saving={saving}
        error={composerError}
        success={success}
        promptIndex={promptIndex}
        onTitleChange={setTitle}
        onBodyChange={setBody}
        onSubmit={submitIdea}
      />

      <section className="evidea-list-section" aria-label="כל הרעיונות">
        <div className="evidea-list-head">
          <h2 className="evidea-list-title">
            <Icon name="forum" size={17} />
            כל הרעיונות
          </h2>
          <span className="evidea-list-count">{ideas.length}</span>
        </div>

        {ideas.length === 0 ? (
          <IdeasEmpty />
        ) : (
          <div className="evidea-list">
            <AnimatePresence mode="popLayout">
              {ideas.map((idea, i) => {
                const isOwner = idea.created_by === profile?.id;
                return (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    index={ideas.length - i - 1}
                    authorName={userById.get(idea.created_by) ?? "עובד/ת"}
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
        )}
      </section>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="עריכת רעיון"
        icon="edit"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>ביטול</Button>
            <Button className="flex-1" loading={update.isPending} onClick={saveEdit}>שמירה</Button>
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
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>ביטול</Button>
            <Button className="flex-1" loading={remove.isPending} onClick={confirmDelete}>מחיקה</Button>
          </>
        }
      >
        <p className="text-[14px] text-text-2">
          למחוק את הרעיון <strong>{deleteTarget?.title}</strong>?
        </p>
      </Modal>
    </PageEnter>
  );
}
