import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button, ErrorState, Icon, PageLoader, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EASE_OUT } from "@/components/motion/shared-motion";
import { useIsMdUp } from "@/hooks/useMediaQuery";
import { useCreateSalaryIssue, useSalaryIssues, useUpdateSalaryIssueStatus } from "@/api/salaryIssues";
import { useSalaryIssueBadgeCount } from "@/hooks/useSalaryIssueBadgeCount";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import {
  SALARY_ISSUE_CATEGORIES,
  SALARY_ISSUE_STATUS_FLOW,
  SALARY_ISSUE_STATUS_META,
  isPayrollManagerRole,
  salaryIssueCategoryMeta,
} from "@/lib/salaryIssues";
import type { SalaryIssue, SalaryIssueStatus } from "@/types/database";

/* ------------------------------------------------------------------ *
 * Time helpers
 * ------------------------------------------------------------------ */
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

function daysAgo(iso: string): number {
  return Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / DAY_MS);
}

function groupOf(iso: string): GroupKey {
  const days = daysAgo(iso);
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

/** Full date + time, used inside the expanded panel. */
function formatFull(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type StatusFilter = SalaryIssueStatus | "all";

/* ------------------------------------------------------------------ *
 * Hero — full-bleed ink header shared by mobile and desktop.
 * ------------------------------------------------------------------ */
function IssuesHero({
  isManager,
  counts,
  total,
  oldestOpenDays,
}: {
  isManager: boolean;
  counts: Record<SalaryIssueStatus, number>;
  total: number;
  oldestOpenDays: number | null;
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

  const allClear = counts.open === 0;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  const subtitle = isManager
    ? allClear
      ? total > 0
        ? "התור נקי — כל הבעיות שדווחו נבדקו."
        : "עדיין לא דווחו בעיות שכר בעסק."
      : `${counts.open} ${counts.open === 1 ? "בעיה ממתינה" : "בעיות ממתינות"} לטיפול${
          oldestOpenDays && oldestOpenDays > 2 ? ` · הוותיקה כבר ${oldestOpenDays} ימים בתור` : ""
        }`
    : total > 0
      ? "כל דיווח נשלח ישירות למנהלת — כאן רואים בדיוק איפה הוא עומד."
      : "משהו בתלוש לא מסתדר? דווחו כאן ונטפל בזה.";

  return (
    <header className="siq-hero" aria-label="בעיות שכר">
      <span className="siq-glow siq-glow--1" data-clear={allClear || undefined} aria-hidden />
      <span className="siq-glow siq-glow--2" aria-hidden />
      <span className="siq-grid-lines" aria-hidden />

      <div className="siq-hero-inner">
        <motion.div className="siq-hero-bar" {...rise(0)}>
          <span className="siq-kicker" data-clear={allClear || undefined}>
            <span className="siq-kicker-dot" aria-hidden />
            {isManager ? "מוקד שכר" : "הדיווחים שלי"}
          </span>
          {isManager && (
            <Link to="/payroll" className="siq-back">
              {/* RTL: "back" points right */}
              <Icon name="arrow_forward" size={16} />
              <span>חזרה לשכר</span>
            </Link>
          )}
        </motion.div>

        <motion.div {...rise(0.05)}>
          <h1 className="siq-title">
            בעיות <span className="siq-title-em">שכר</span>
          </h1>
          <p className="siq-sub">{subtitle}</p>
        </motion.div>

        <motion.div className="siq-stats" {...rise(0.12)}>
          {SALARY_ISSUE_STATUS_FLOW.map((status) => {
            const meta = SALARY_ISSUE_STATUS_META[status];
            const live = status === "open" && counts.open > 0;
            return (
              <div key={status} className="siq-stat" data-live={live || undefined} style={{ "--siq-tone": meta.tone } as React.CSSProperties}>
                <span className="siq-stat-label">
                  <Icon name={meta.icon} size={13} />
                  {meta.short}
                </span>
                <span className="siq-stat-value">{counts[status]}</span>
              </div>
            );
          })}
        </motion.div>

        {total > 0 && (
          <motion.div className="siq-track" role="img" aria-label={`${counts.open} פתוחות, ${counts.in_treatment} בטיפול, ${counts.closed} טופלו`} {...rise(0.18)}>
            {SALARY_ISSUE_STATUS_FLOW.map((status) =>
              counts[status] > 0 ? (
                <span
                  key={status}
                  className="siq-track-seg"
                  style={{
                    width: `${pct(counts[status])}%`,
                    background: SALARY_ISSUE_STATUS_META[status].tone,
                  }}
                />
              ) : null,
            )}
          </motion.div>
        )}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * Status stepper — the manager's one-tap triage control.
 * ------------------------------------------------------------------ */
function StatusStepper({
  status,
  busy,
  onChange,
}: {
  status: SalaryIssueStatus;
  busy: boolean;
  onChange: (status: SalaryIssueStatus) => void;
}) {
  const meta = SALARY_ISSUE_STATUS_META[status];

  return (
    <div
      className="siq-steps"
      role="group"
      aria-label="סטטוס הטיפול"
      data-busy={busy || undefined}
      style={{ "--siq-step": meta.step, "--siq-tone": meta.tone } as React.CSSProperties}
    >
      <span className="siq-steps-thumb" aria-hidden />
      {SALARY_ISSUE_STATUS_FLOW.map((s) => {
        const m = SALARY_ISSUE_STATUS_META[s];
        return (
          <button
            key={s}
            type="button"
            className="siq-step"
            aria-pressed={s === status}
            data-active={s === status || undefined}
            data-done={m.step < meta.step || undefined}
            onClick={() => s !== status && onChange(s)}
          >
            <Icon name={m.step < meta.step ? "check" : m.icon} size={15} />
            <span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Read-only lifecycle for the employee's own report. */
function StatusTimeline({ issue }: { issue: SalaryIssue }) {
  const current = SALARY_ISSUE_STATUS_META[issue.status].step;

  return (
    <ol className="siq-timeline">
      {SALARY_ISSUE_STATUS_FLOW.map((s) => {
        const m = SALARY_ISSUE_STATUS_META[s];
        const done = m.step < current;
        const active = m.step === current;
        const when =
          m.step === 0 ? issue.created_at : active && issue.status_updated_at ? issue.status_updated_at : null;

        return (
          <li
            key={s}
            className="siq-tl-item"
            data-done={done || undefined}
            data-active={active || undefined}
            style={{ "--siq-tone": m.tone } as React.CSSProperties}
          >
            <span className="siq-tl-dot" aria-hidden>
              <Icon name={done ? "check" : m.icon} size={13} />
            </span>
            <span className="siq-tl-body">
              <span className="siq-tl-label">
                {s === "open" ? "הדיווח נשלח" : s === "in_treatment" ? "בטיפול המנהלת" : "טופל ונסגר"}
              </span>
              {when && <span className="siq-tl-when">{formatFull(when)}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ *
 * Case card — one component for both audiences.
 * ------------------------------------------------------------------ */
function IssueCard({
  issue,
  index,
  isManager,
  expanded,
  fresh,
  busy,
  onToggle,
  onStatusChange,
}: {
  issue: SalaryIssue;
  index: number;
  isManager: boolean;
  expanded: boolean;
  fresh: boolean;
  busy: boolean;
  onToggle: () => void;
  onStatusChange: (status: SalaryIssueStatus) => void;
}) {
  const cat = salaryIssueCategoryMeta(issue.category);
  const status = SALARY_ISSUE_STATUS_META[issue.status];
  const name = issue.employee?.full_name ?? "עובד";
  const age = daysAgo(issue.created_at);
  const stale = issue.status === "open" && age >= 3;

  return (
    <article
      className="siq-card"
      data-open={expanded || undefined}
      data-fresh={fresh || undefined}
      data-status={issue.status}
      style={
        {
          "--siq-cat": cat.tone,
          "--siq-tone": status.tone,
          "--i": index,
        } as React.CSSProperties
      }
    >
      <span className="siq-card-edge" aria-hidden />

      <button type="button" className="siq-card-head" aria-expanded={expanded} onClick={onToggle}>
        <span className="siq-card-cat" aria-hidden>
          <Icon name={cat.icon} size={19} />
        </span>

        <span className="siq-card-main">
          <span className="siq-card-titlerow">
            <span className="siq-card-title">{cat.label}</span>
            <span className="siq-pill">
              <Icon name={status.icon} size={13} />
              {status.label}
            </span>
          </span>

          <span className="siq-card-meta">
            {isManager && (
              <>
                <UserAvatar
                  userId={issue.employee_id}
                  name={name}
                  avatarUrl={issue.employee?.avatar_url ?? null}
                  size={20}
                  rounded="circle"
                />
                <span className="siq-card-name">{name}</span>
                <span className="siq-meta-dot" aria-hidden />
              </>
            )}
            <span className="siq-card-when">{formatWhen(issue.created_at)}</span>
            {stale && (
              <span className="siq-stale">
                <Icon name="hourglass_top" size={12} />
                {age} ימים בתור
              </span>
            )}
          </span>

          {/* span, not p — the head is a <button> and only takes phrasing content */}
          <span className="siq-card-desc">{issue.description}</span>
        </span>

        <span className="siq-card-chev" aria-hidden>
          <Icon name="expand_more" size={20} />
        </span>
      </button>

      <div className="siq-card-panel">
        <div className="siq-card-panel-inner">
          {isManager ? (
            <>
              <div className="siq-panel-block">
                <span className="siq-panel-label">
                  <Icon name="flag" size={13} />
                  עדכון סטטוס
                </span>
                <StatusStepper status={issue.status} busy={busy} onChange={onStatusChange} />
              </div>

              <div className="siq-facts">
                <span className="siq-fact">
                  <Icon name="schedule" size={13} />
                  נפתח {formatFull(issue.created_at)}
                </span>
                {issue.status_updated_at && (
                  <span className="siq-fact">
                    <Icon name="history" size={13} />
                    עודכן {formatFull(issue.status_updated_at)}
                    {issue.status_updater?.full_name ? ` · ${issue.status_updater.full_name}` : ""}
                  </span>
                )}
              </div>
            </>
          ) : (
            <StatusTimeline issue={issue} />
          )}
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * Composer fields — one source of truth for the rail card and the
 * mobile bottom sheet.
 * ------------------------------------------------------------------ */
function IssueFields({
  category,
  description,
  error,
  autoFocus,
  onCategoryChange,
  onDescriptionChange,
}: {
  category: string;
  description: string;
  error: string | null;
  autoFocus?: boolean;
  onCategoryChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
}) {
  const picked = category ? salaryIssueCategoryMeta(category) : null;

  return (
    <div className="siq-fields">
      <div className="siq-field">
        <span className="siq-field-label">
          <Icon name="category" size={14} />
          מה סוג הבעיה?
        </span>
        <div className="siq-picker" role="group" aria-label="סוג הבעיה">
          {SALARY_ISSUE_CATEGORIES.map((c, i) => (
            <button
              key={c.value}
              type="button"
              className="siq-tile"
              aria-pressed={category === c.value}
              data-active={category === c.value || undefined}
              style={{ "--siq-cat": c.tone, "--i": i } as React.CSSProperties}
              onClick={() => onCategoryChange(c.value)}
            >
              <span className="siq-tile-icon" aria-hidden>
                <Icon name={c.icon} size={18} />
              </span>
              <span className="siq-tile-label">{c.short}</span>
              <span className="siq-tile-mark" aria-hidden>
                <Icon name="check" size={12} />
              </span>
            </button>
          ))}
        </div>
        <AnimatePresence initial={false} mode="wait">
          {picked && (
            <motion.p
              key={picked.value}
              className="siq-hint"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
            >
              <Icon name="lightbulb" size={13} />
              {picked.hint}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="siq-field">
        <span className="siq-field-label">
          <Icon name="edit_note" size={14} />
          מה קרה בדיוק?
        </span>
        <Textarea
          value={description}
          autoFocus={autoFocus}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="חודש, משמרת, סכומים — כל פרט עוזר לסגור את זה מהר."
          rows={4}
        />
        <span className="siq-count" data-ok={description.trim().length >= 5 || undefined}>
          {description.length > 0 ? `${description.length} תווים` : " "}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            className="siq-error"
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
function IssueComposer({
  category,
  description,
  saving,
  error,
  success,
  onCategoryChange,
  onDescriptionChange,
  onSubmit,
}: {
  category: string;
  description: string;
  saving: boolean;
  error: string | null;
  success: boolean;
  onCategoryChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="siq-rail-card" aria-label="דיווח בעיה חדשה">
      <div className="siq-rail-head">
        <span className="siq-rail-icon" aria-hidden>
          <Icon name="campaign" size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="siq-rail-title">דיווח בעיה חדשה</h2>
          <p className="siq-rail-sub">נשלח ישירות למנהלת, עם עדכון סטטוס כאן</p>
        </div>
      </div>

      <IssueFields
        category={category}
        description={description}
        error={error}
        onCategoryChange={onCategoryChange}
        onDescriptionChange={onDescriptionChange}
      />

      <Button
        className="w-full"
        icon={success ? "check" : "send"}
        loading={saving}
        disabled={success || !category || description.trim().length < 5}
        onClick={onSubmit}
      >
        {success ? "נשלח למנהלת" : "שליחת הדיווח"}
      </Button>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Manager rail — read-only insight cards.
 * ------------------------------------------------------------------ */
function CategoryBoard({ rows, total }: { rows: { value: string; count: number }[]; total: number }) {
  if (rows.length === 0) return null;

  return (
    <section className="siq-rail-card" aria-label="פילוח לפי סוג">
      <div className="siq-rail-head">
        <span className="siq-rail-icon" aria-hidden>
          <Icon name="donut_small" size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="siq-rail-title">פילוח לפי סוג</h2>
          <p className="siq-rail-sub">איפה נופלות הכי הרבה בעיות</p>
        </div>
      </div>

      <ul className="siq-dist">
        {rows.map((row, i) => {
          const cat = salaryIssueCategoryMeta(row.value);
          return (
            <li
              key={row.value}
              className="siq-dist-row"
              style={{ "--siq-cat": cat.tone, "--i": i } as React.CSSProperties}
            >
              <span className="siq-dist-icon" aria-hidden>
                <Icon name={cat.icon} size={14} />
              </span>
              <span className="siq-dist-label">{cat.short}</span>
              <span className="siq-dist-bar" aria-hidden>
                <span className="siq-dist-fill" style={{ width: `${(row.count / total) * 100}%` }} />
              </span>
              <span className="siq-dist-n">{row.count}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ReporterBoard({ rows }: { rows: { id: string; name: string; avatar: string | null; count: number }[] }) {
  if (rows.length < 2) return null;

  return (
    <section className="siq-rail-card" aria-label="מדווחים">
      <div className="siq-rail-head">
        <span className="siq-rail-icon" aria-hidden>
          <Icon name="groups" size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="siq-rail-title">מי מדווח</h2>
          <p className="siq-rail-sub">לפי מספר הדיווחים</p>
        </div>
      </div>

      <ul className="siq-people">
        {rows.map((row, i) => (
          <li key={row.id} className="siq-person" style={{ "--i": i } as React.CSSProperties}>
            <UserAvatar userId={row.id} name={row.name} avatarUrl={row.avatar} size={30} rounded="circle" />
            <span className="siq-person-name">{row.name}</span>
            <span className="siq-person-n">{row.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Employee-side coaching card. */
function TipsBoard() {
  const tips = [
    { icon: "event", text: "ציינו את החודש והמשמרת המדויקת" },
    { icon: "calculate", text: "כתבו את הסכום שקיבלתם מול הסכום שציפיתם" },
    { icon: "bolt", text: "דיווח מוקדם = תיקון כבר בתלוש הקרוב" },
  ];

  return (
    <section className="siq-rail-card" aria-label="איך לדווח נכון">
      <div className="siq-rail-head">
        <span className="siq-rail-icon" aria-hidden>
          <Icon name="tips_and_updates" size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="siq-rail-title">איך לדווח נכון</h2>
          <p className="siq-rail-sub">שלושה דברים שמקצרים את הטיפול</p>
        </div>
      </div>
      <ul className="siq-tips">
        {tips.map((tip, i) => (
          <li key={tip.icon} className="siq-tip" style={{ "--i": i } as React.CSSProperties}>
            <Icon name={tip.icon} size={15} />
            {tip.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Empty states
 * ------------------------------------------------------------------ */
function IssuesEmpty({ isManager, onStart }: { isManager: boolean; onStart: () => void }) {
  return (
    <div className="siq-empty">
      <div className="siq-empty-art" aria-hidden>
        <span className="siq-empty-ring" />
        <span className="siq-empty-ring siq-empty-ring--2" />
        <span className="siq-empty-mark">
          <Icon name={isManager ? "verified" : "receipt_long"} size={26} />
        </span>
      </div>
      <p className="siq-empty-title">{isManager ? "התור נקי" : "אין דיווחים פתוחים"}</p>
      <p className="siq-empty-sub">
        {isManager
          ? "אף עובד לא דיווח על בעיה בשכר. כשמשהו יגיע — הוא יופיע כאן ראשון."
          : "אם משהו בתלוש נראה לא נכון, ספרו לנו ונבדוק את זה מול הרישומים."}
      </p>
      {!isManager && (
        <Button icon="add" onClick={onStart}>
          דיווח בעיה
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */
export function SalaryIssues() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const isManager = isPayrollManagerRole(profile?.role);
  const { markSeen } = useSalaryIssueBadgeCount();
  const isMdUp = useIsMdUp();

  const { data, isLoading, isError, refetch } = useSalaryIssues(businessId, {
    poll: true,
    employeeId: isManager ? null : (profile?.id ?? null),
  });
  const issues = useMemo(() => data ?? [], [data]);

  const createIssue = useCreateSalaryIssue(businessId);
  const updateStatus = useUpdateSalaryIssueStatus(businessId);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const [sheetOpen, setSheetOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [freshId, setFreshId] = useState<string | null>(null);
  const successTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (isManager) markSeen();
  }, [isManager, markSeen]);

  useEffect(() => () => window.clearTimeout(successTimer.current), []);

  /* ---- derived ---- */
  const counts = useMemo(() => {
    const base: Record<SalaryIssueStatus, number> = { open: 0, in_treatment: 0, closed: 0 };
    for (const issue of issues) base[issue.status] += 1;
    return base;
  }, [issues]);

  const oldestOpenDays = useMemo(() => {
    const open = issues.filter((i) => i.status === "open");
    if (open.length === 0) return null;
    return Math.max(...open.map((i) => daysAgo(i.created_at)));
  }, [issues]);

  const categoryRows = useMemo(() => {
    const map = new Map<string, number>();
    for (const issue of issues) map.set(issue.category, (map.get(issue.category) ?? 0) + 1);
    return [...map.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  }, [issues]);

  const reporterRows = useMemo(() => {
    const map = new Map<string, { id: string; name: string; avatar: string | null; count: number }>();
    for (const issue of issues) {
      const row = map.get(issue.employee_id) ?? {
        id: issue.employee_id,
        name: issue.employee?.full_name ?? "עובד",
        avatar: issue.employee?.avatar_url ?? null,
        count: 0,
      };
      row.count += 1;
      map.set(issue.employee_id, row);
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [issues]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return issues.filter((issue) => {
      if (statusFilter !== "all" && issue.status !== statusFilter) return false;
      if (categoryFilter !== "all" && issue.category !== categoryFilter) return false;
      if (!q) return true;
      const haystack = [
        issue.description,
        salaryIssueCategoryMeta(issue.category).label,
        issue.employee?.full_name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [issues, query, statusFilter, categoryFilter]);

  const groups = useMemo(() => {
    const buckets = new Map<GroupKey, SalaryIssue[]>();
    for (const issue of filtered) {
      const key = groupOf(issue.created_at);
      const list = buckets.get(key);
      if (list) list.push(issue);
      else buckets.set(key, [issue]);
    }
    return GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({
      key,
      label: GROUP_LABEL[key],
      items: buckets.get(key) ?? [],
    }));
  }, [filtered]);

  const filtersActive = statusFilter !== "all" || categoryFilter !== "all" || query.trim().length > 0;

  /* ---- actions ---- */
  function toggleCard(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startComposing() {
    if (isMdUp) {
      document.querySelector<HTMLElement>(".siq-rail-card .siq-tile")?.focus();
    } else {
      setSheetOpen(true);
    }
  }

  async function submitIssue() {
    if (!category) {
      setComposerError("בחרו את סוג הבעיה");
      return;
    }
    if (description.trim().length < 5) {
      setComposerError("כתבו עוד קצת — לפחות כמה מילים על מה שקרה");
      return;
    }

    setComposerError(null);
    try {
      const created = await createIssue.mutateAsync({ category, description });
      setCategory("");
      setDescription("");
      setSuccess(true);
      setFreshId(created.id);
      setSheetOpen(false);
      window.clearTimeout(successTimer.current);
      successTimer.current = window.setTimeout(() => {
        setSuccess(false);
        setFreshId(null);
      }, 3200);
    } catch {
      setComposerError("השליחה נכשלה. נסו שוב בעוד רגע.");
    }
  }

  if (isLoading) return <PageLoader />;
  if (isError || !businessId) return <ErrorState onRetry={refetch} />;

  /* Show the new status the moment it is tapped — the stepper thumb should
     never wait for the round-trip. */
  const pending = updateStatus.isPending ? updateStatus.variables : undefined;
  const hasIssues = issues.length > 0;

  return (
    <div className="siq-page page-enter" data-role={isManager ? "manager" : "employee"}>
      <IssuesHero
        isManager={isManager}
        counts={counts}
        total={issues.length}
        oldestOpenDays={oldestOpenDays}
      />

      <div className="siq-body">
        <section className="siq-feed" aria-label={isManager ? "כל בעיות השכר" : "הדיווחים שלי"}>
          {hasIssues && (
            <>
              <div className="siq-toolbar">
                <div className="siq-search">
                  <Icon name="search" size={18} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={isManager ? "חיפוש לפי עובד או תיאור" : "חיפוש בדיווחים שלי"}
                    aria-label="חיפוש בעיות שכר"
                  />
                  {query && (
                    <button type="button" onClick={() => setQuery("")} aria-label="ניקוי חיפוש">
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>

                <div className="siq-chips" role="group" aria-label="סינון לפי סטטוס">
                  <button
                    type="button"
                    className="siq-chip"
                    aria-pressed={statusFilter === "all"}
                    data-active={statusFilter === "all" || undefined}
                    onClick={() => setStatusFilter("all")}
                  >
                    הכל
                    <span className="siq-chip-n">{issues.length}</span>
                  </button>
                  {SALARY_ISSUE_STATUS_FLOW.map((s) => {
                    const m = SALARY_ISSUE_STATUS_META[s];
                    return (
                      <button
                        key={s}
                        type="button"
                        className="siq-chip"
                        aria-pressed={statusFilter === s}
                        data-active={statusFilter === s || undefined}
                        style={{ "--siq-tone": m.tone } as React.CSSProperties}
                        onClick={() => setStatusFilter(s)}
                      >
                        <Icon name={m.icon} size={15} />
                        <span className="siq-chip-text">{m.label}</span>
                        <span className="siq-chip-n">{counts[s]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {categoryRows.length > 1 && (
                <div className="siq-cats" role="group" aria-label="סינון לפי סוג">
                  <button
                    type="button"
                    className="siq-cat"
                    aria-pressed={categoryFilter === "all"}
                    data-active={categoryFilter === "all" || undefined}
                    onClick={() => setCategoryFilter("all")}
                  >
                    <Icon name="filter_list" size={14} />
                    כל הסוגים
                  </button>
                  {categoryRows.map((row) => {
                    const cat = salaryIssueCategoryMeta(row.value);
                    return (
                      <button
                        key={row.value}
                        type="button"
                        className="siq-cat"
                        aria-pressed={categoryFilter === row.value}
                        data-active={categoryFilter === row.value || undefined}
                        style={{ "--siq-cat": cat.tone } as React.CSSProperties}
                        onClick={() =>
                          setCategoryFilter((prev) => (prev === row.value ? "all" : row.value))
                        }
                      >
                        <Icon name={cat.icon} size={14} />
                        {cat.short}
                        <span className="siq-cat-n">{row.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {!hasIssues ? (
            <IssuesEmpty isManager={isManager} onStart={startComposing} />
          ) : filtered.length === 0 ? (
            <div className="siq-noresults">
              <Icon name="search_off" size={26} />
              <p className="siq-noresults-title">לא נמצאו בעיות</p>
              <p className="siq-noresults-sub">נסו מילה אחרת, או נקו את הסינון.</p>
              <Button
                variant="secondary"
                icon="filter_alt_off"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("all");
                  setCategoryFilter("all");
                }}
              >
                ניקוי סינון
              </Button>
            </div>
          ) : (
            <div className="siq-groups">
              {groups.map((group) => (
                <div className="siq-group" key={group.key}>
                  <div className="siq-group-head">
                    <span className="siq-group-label">{group.label}</span>
                    <span className="siq-group-line" aria-hidden />
                    <span className="siq-group-n">{group.items.length}</span>
                  </div>
                  <div className="siq-list">
                    {group.items.map((issue, i) => (
                      <IssueCard
                        key={issue.id}
                        issue={
                          pending?.id === issue.id ? { ...issue, status: pending.status } : issue
                        }
                        index={i}
                        isManager={isManager}
                        expanded={expanded.has(issue.id)}
                        fresh={issue.id === freshId}
                        busy={pending?.id === issue.id}
                        onToggle={() => toggleCard(issue.id)}
                        onStatusChange={(status) => updateStatus.mutate({ id: issue.id, status })}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {filtersActive && filtered.length > 0 && (
            <button
              type="button"
              className="siq-clear"
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
                setCategoryFilter("all");
              }}
            >
              <Icon name="filter_alt_off" size={15} />
              מציג {filtered.length} מתוך {issues.length} — ניקוי סינון
            </button>
          )}
        </section>

        {isMdUp && (
          <aside className="siq-rail" aria-label={isManager ? "סיכום" : "דיווח בעיה"}>
            <div className="siq-rail-inner">
              {isManager ? (
                <>
                  <CategoryBoard rows={categoryRows} total={issues.length} />
                  <ReporterBoard rows={reporterRows} />
                </>
              ) : (
                <>
                  <IssueComposer
                    category={category}
                    description={description}
                    saving={createIssue.isPending}
                    error={composerError}
                    success={success}
                    onCategoryChange={setCategory}
                    onDescriptionChange={setDescription}
                    onSubmit={submitIssue}
                  />
                  <TipsBoard />
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      {!isManager &&
        !isMdUp &&
        createPortal(
          <button type="button" className="siq-fab" onClick={() => setSheetOpen(true)}>
            <Icon name="add" size={21} />
            דיווח בעיה
          </button>,
          document.body,
        )}

      {/* Mobile composer sheet — same fields as the desktop rail */}
      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="דיווח בעיית שכר"
        subtitle="נשלח ישירות למנהלת, ותוכלו לעקוב אחרי הסטטוס"
        icon="campaign"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSheetOpen(false)}>
              ביטול
            </Button>
            <Button
              className="flex-1"
              icon={success ? "check" : "send"}
              loading={createIssue.isPending}
              disabled={success}
              onClick={submitIssue}
            >
              {success ? "נשלח!" : "שליחת הדיווח"}
            </Button>
          </>
        }
      >
        <IssueFields
          category={category}
          description={description}
          error={composerError}
          onCategoryChange={setCategory}
          onDescriptionChange={setDescription}
        />
      </Modal>
    </div>
  );
}
