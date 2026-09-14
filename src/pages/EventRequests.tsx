import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { Button, EmptyState, ErrorState, Icon, PageLoader } from "@/components/ui";
import { EASE_OUT } from "@/components/motion/shared-motion";
import { EventsSubNav } from "@/components/events/EventsSubNav";
import { EventRequestCard } from "@/components/events/EventRequestCard";
import { daysUntilEvent, daysUntilLabel, parseEventDay } from "@/components/events/eventTime";
import {
  useDeleteEventRequest,
  useEventManagerTasks,
  useEventRequests,
  useUpdateEventRequestLines,
  useUpdateEventRequestStatus,
  type EventManagerTaskRow,
} from "@/api/eventRequests";
import { useDepartments } from "@/api/departments";
import { useEventRequestBadgeCount } from "@/hooks/useEventRequestBadgeCount";
import { useAuth } from "@/lib/auth";
import { EVENT_REQUEST_HANDLER_ROLES } from "@/lib/constants";
import { colorForDepartment, useBusinessId } from "@/lib/db";
import {
  EVENT_REQUEST_KIND_META,
  EVENT_REQUEST_STATUS_FLOW,
  EVENT_REQUEST_STATUS_META,
  formatRequestWhen,
  getEventRequestsSeenAt,
  requestProgress,
  staffingLines,
  supplyLines,
} from "@/lib/eventRequests";
import type { Department, EventRequest, EventRequestKind, EventRequestStatus } from "@/types/database";

type StatusFilter = "active" | EventRequestStatus;
type KindFilter = "all" | EventRequestKind;

const TASK_STATUS_LABEL = { open: "פתוחה", in_progress: "בביצוע", done: "בוצעה" } as const;

/* ------------------------------------------------------------------ *
 * Hero — same ink shell as the sibling event pages, kept flat.
 * ------------------------------------------------------------------ */
function RequestsHero({
  activeCount,
  openSlots,
  openItems,
  taskCount,
}: {
  activeCount: number;
  openSlots: number;
  openItems: number;
  taskCount: number;
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
    <header className="evid-hero evrqp-hero" aria-label="בקשות מאירועים">
      <div className="evid-hero-inner">
        <motion.div className="evid-hero-bar" {...rise(0)}>
          <span className="evid-kicker">
            <span className="evid-kicker-dot" aria-hidden />
            תיבת בקשות
          </span>
        </motion.div>

        <motion.div className="evid-hero-copy" {...rise(0.05)}>
          <h1 className="evid-title">
            {activeCount > 0 ? (
              <>
                {activeCount} {activeCount === 1 ? "בקשה מחכה" : "בקשות מחכות"}
                <br />
                <span className="evid-title-em">לסידור שלך</span>
              </>
            ) : (
              <>
                הכול מסודר.
                <br />
                <span className="evid-title-em">אין בקשות פתוחות</span>
              </>
            )}
          </h1>
          <p className="evid-sub">
            כאן משבצים עובדים למקומות שביקשה מנהלת האירועים, מסמנים מה כבר נקנה, ורואים אילו משימות היא הוסיפה.
          </p>
        </motion.div>

        <motion.div className="evid-stats evrqp-stats" {...rise(0.12)}>
          <div className="evid-stat" data-tone={activeCount > 0 ? "live" : undefined}>
            <span className="evid-stat-label">
              <Icon name="inbox" size={13} />
              פעילות
            </span>
            <span className="evid-stat-value">{activeCount}</span>
          </div>
          <div className="evid-stat">
            <span className="evid-stat-label">
              <Icon name="person_add" size={13} />
              מקומות לשבץ
            </span>
            <span className="evid-stat-value">{openSlots}</span>
          </div>
          <div className="evid-stat">
            <span className="evid-stat-label">
              <Icon name="shopping_basket" size={13} />
              פריטים לקנות
            </span>
            <span className="evid-stat-value">{openItems}</span>
          </div>
          <div className="evid-stat">
            <span className="evid-stat-label">
              <Icon name="checklist" size={13} />
              משימות שנוספו
            </span>
            <span className="evid-stat-value">{taskCount}</span>
          </div>
        </motion.div>

        <motion.div className="evid-hero-nav" {...rise(0.18)}>
          <EventsSubNav active="requests" variant="ink" />
        </motion.div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * Event group header
 * ------------------------------------------------------------------ */
function EventGroupHead({
  eventId,
  title,
  eventDate,
  items,
  from,
}: {
  eventId: string;
  title: string;
  eventDate: string;
  items: EventRequest[];
  from: string;
}) {
  const d = parseEventDay(eventDate);
  const days = daysUntilEvent(eventDate);
  const staffing = items.filter((r) => r.kind === "staffing").length;
  const supplies = items.filter((r) => r.kind === "supplies").length;
  const done = items.filter((r) => r.status === "closed").length;

  return (
    <Link
      to={`/events/${eventId}`}
      state={{ from, fromLabel: "בקשות" }}
      className="evrqp-group-head"
      data-past={days < 0 || undefined}
      data-soon={days >= 0 && days <= 2 ? "" : undefined}
    >
      <span className="evrqp-group-date" aria-hidden>
        <b>{d.getDate()}</b>
        <i>{d.toLocaleDateString("he-IL", { month: "short" })}</i>
      </span>
      <span className="evrqp-group-copy">
        <span className="evrqp-group-title">{title}</span>
        <span className="evrqp-group-meta">
          {d.toLocaleDateString("he-IL", { weekday: "long" })}
          <span className="evt-dot" aria-hidden>•</span>
          {days < 0 ? "האירוע התקיים" : days === 0 ? "היום" : daysUntilLabel(days)}
        </span>
      </span>
      <span className="evrqp-group-kinds" aria-label="הרכב הבקשות">
        {staffing > 0 && (
          <span className="evrqp-group-kind" data-kind="staffing">
            <Icon name={EVENT_REQUEST_KIND_META.staffing.icon} size={13} />
            {staffing}
          </span>
        )}
        {supplies > 0 && (
          <span className="evrqp-group-kind" data-kind="supplies">
            <Icon name={EVENT_REQUEST_KIND_META.supplies.icon} size={13} />
            {supplies}
          </span>
        )}
        {done > 0 && (
          <span className="evrqp-group-kind" data-kind="done">
            <Icon name="check" size={13} />
            {done}
          </span>
        )}
      </span>
      <Icon name="chevron_left" size={18} className="evrqp-group-go" aria-hidden />
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Rail: what's left to arrange, at a glance
 * ------------------------------------------------------------------ */
function ArrangeSummary({
  requests,
  departments,
}: {
  requests: EventRequest[];
  departments: Department[];
}) {
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d] as const)), [departments]);

  const slotRows = useMemo(() => {
    const rows = new Map<string, { label: string; color: string; open: number; total: number }>();
    for (const r of requests) {
      if (r.kind !== "staffing" || r.status === "closed") continue;
      for (const l of staffingLines(r)) {
        const key = l.department_id ?? `free:${l.label}`;
        const cur = rows.get(key) ?? {
          label: l.label,
          color: colorForDepartment(l.department_id, l.department_id ? deptById.get(l.department_id)?.color : null),
          open: 0,
          total: 0,
        };
        cur.total += l.count;
        cur.open += Math.max(0, l.count - Math.min(l.count, l.assigned?.length ?? 0));
        rows.set(key, cur);
      }
    }
    return [...rows.values()].filter((r) => r.open > 0).sort((a, b) => b.open - a.open);
  }, [requests, deptById]);

  const itemsLeft = useMemo(
    () =>
      requests
        .filter((r) => r.kind === "supplies" && r.status !== "closed")
        .reduce((s, r) => s + supplyLines(r).filter((l) => !l.done).length, 0),
    [requests],
  );

  const slotsLeft = slotRows.reduce((s, r) => s + r.open, 0);

  return (
    <section className="evrqp-rail-card" aria-label="מה נשאר לסדר">
      <header className="evrqp-rail-head">
        <span className="evrqp-rail-icon" aria-hidden>
          <Icon name="fact_check" size={16} />
        </span>
        <h2 className="evrqp-rail-title">מה נשאר לסדר</h2>
      </header>

      {slotsLeft === 0 && itemsLeft === 0 ? (
        <p className="evrqp-rail-done">
          <Icon name="check_circle" size={16} />
          כל המקומות שובצו וכל הפריטים סומנו.
        </p>
      ) : (
        <>
          <div className="evrqp-rail-row">
            <span className="evrqp-rail-row-label">
              <Icon name="person_add" size={15} />
              מקומות לשיבוץ
            </span>
            <b className="evrqp-rail-row-val">{slotsLeft}</b>
          </div>
          {slotRows.length > 0 && (
            <ul className="evrqp-rail-depts">
              {slotRows.map((r) => (
                <li key={r.label} className="evrqp-rail-dept">
                  <span className="evrqp-rail-dot" style={{ background: r.color }} aria-hidden />
                  <span className="evrqp-rail-dept-name">{r.label}</span>
                  <span className="evrqp-rail-dept-val">
                    {r.open} <small>מ־{r.total}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="evrqp-rail-row">
            <span className="evrqp-rail-row-label">
              <Icon name="shopping_basket" size={15} />
              פריטים לקנייה
            </span>
            <b className="evrqp-rail-row-val">{itemsLeft}</b>
          </div>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Task added by the event manager
 * ------------------------------------------------------------------ */
function EventManagerTaskItem({
  task,
  isNew,
  from,
}: {
  task: EventManagerTaskRow;
  isNew: boolean;
  from: string;
}) {
  const target = task.assignee?.full_name
    ? task.assignee.full_name
    : task.department?.name
      ? `כל מחלקת ${task.department.name}`
      : "ללא שיוך";

  return (
    <li className="evrqp-task" data-status={task.status} data-new={isNew || undefined}>
      <span className="evrqp-task-icon" aria-hidden>
        <Icon name={task.status === "done" ? "check_circle" : "radio_button_unchecked"} size={18} />
      </span>
      <div className="evrqp-task-body">
        <div className="evrqp-task-top">
          <span className="evrqp-task-title">{task.title}</span>
          {isNew && <span className="evrqp-new">חדש</span>}
          <span className="evrqp-task-status" data-status={task.status}>
            {TASK_STATUS_LABEL[task.status]}
          </span>
        </div>
        <div className="evrqp-task-meta">
          {task.event && (
            <Link
              to={`/events/${task.event_id}`}
              state={{ from, fromLabel: "בקשות" }}
              className="evrqp-task-event"
            >
              <Icon name="celebration" size={13} />
              {task.event.title}
            </Link>
          )}
          <span className="evt-dot" aria-hidden>•</span>
          <span>
            <Icon name="person" size={13} />
            {target}
          </span>
          <span className="evt-dot" aria-hidden>•</span>
          <span>{formatRequestWhen(task.created_at)}</span>
        </div>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
export function EventRequests() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isHandler = !!profile?.role && EVENT_REQUEST_HANDLER_ROLES.includes(profile.role);

  const { data: requests = [], isLoading, isError, refetch } = useEventRequests(
    isHandler ? businessId : null,
    { poll: true },
  );
  const { data: tasks = [] } = useEventManagerTasks(isHandler ? businessId : null);
  const { data: departments = [] } = useDepartments(isHandler ? businessId : null);
  const updateStatus = useUpdateEventRequestStatus(businessId);
  const updateLines = useUpdateEventRequestLines(businessId);
  const remove = useDeleteEventRequest(businessId);
  const { markSeen } = useEventRequestBadgeCount();

  /** What counted as "seen" when the page opened — drives the "new" markers. */
  const seenAtOnOpen = useRef<string | null>(
    profile?.id && businessId ? getEventRequestsSeenAt(profile.id, businessId) : null,
  );

  useEffect(() => {
    if (isHandler) markSeen();
  }, [isHandler, markSeen]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

  const from = `${location.pathname}${location.search}`;

  const active = useMemo(() => requests.filter((r) => r.status !== "closed"), [requests]);
  const openSlots = active
    .filter((r) => r.kind === "staffing")
    .reduce((s, r) => {
      const p = requestProgress(r);
      return s + (p.total - p.done);
    }, 0);
  const openItems = active
    .filter((r) => r.kind === "supplies")
    .reduce((s, r) => {
      const p = requestProgress(r);
      return s + (p.total - p.done);
    }, 0);

  const filtered = useMemo(
    () =>
      requests.filter((r) => {
        if (kindFilter !== "all" && r.kind !== kindFilter) return false;
        if (statusFilter === "active") return r.status !== "closed";
        return r.status === statusFilter;
      }),
    [requests, kindFilter, statusFilter],
  );

  /** Group by event; upcoming events first (soonest on top), then past ones. */
  const groups = useMemo(() => {
    const byEvent = new Map<string, { title: string; eventDate: string; items: EventRequest[] }>();
    for (const r of filtered) {
      const g = byEvent.get(r.event_id);
      if (g) g.items.push(r);
      else
        byEvent.set(r.event_id, {
          title: r.event?.title ?? "אירוע",
          eventDate: r.event?.event_date ?? r.created_at,
          items: [r],
        });
    }
    return [...byEvent.entries()]
      .map(([eventId, g]) => ({ eventId, ...g }))
      .sort((a, b) => {
        const da = daysUntilEvent(a.eventDate);
        const db = daysUntilEvent(b.eventDate);
        const pa = da < 0 ? 1 : 0;
        const pb = db < 0 ? 1 : 0;
        if (pa !== pb) return pa - pb;
        return pa === 0 ? da - db : db - da;
      });
  }, [filtered]);

  const statusCounts = useMemo(() => {
    const base = kindFilter === "all" ? requests : requests.filter((r) => r.kind === kindFilter);
    return {
      active: base.filter((r) => r.status !== "closed").length,
      open: base.filter((r) => r.status === "open").length,
      in_treatment: base.filter((r) => r.status === "in_treatment").length,
      closed: base.filter((r) => r.status === "closed").length,
    };
  }, [requests, kindFilter]);

  if (!profile) return <PageLoader />;
  if (!isHandler) return <Navigate to="/events" replace />;
  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const hasAny = requests.length > 0 || tasks.length > 0;

  return (
    <div className="evid-page page-enter">
      <RequestsHero
        activeCount={active.length}
        openSlots={openSlots}
        openItems={openItems}
        taskCount={tasks.length}
      />

      <div className="evrqp-body" data-empty={!hasAny || undefined}>
        {!hasAny ? (
          <EmptyState
            icon="outgoing_mail"
            title="אין עדיין בקשות"
            description="כשמנהלת האירועים תבקש שיבוץ עובדים או רשימת מצרכים לאירוע, או תוסיף משימות — זה יופיע כאן ותקבלו התראה."
            action={
              <Button variant="secondary" icon="event" onClick={() => navigate("/events")}>
                ללוח האירועים
              </Button>
            }
          />
        ) : (
          <>
            <section className="evrqp-main" aria-label="בקשות">
              <div className="evrqp-toolbar">
                <div className="evrq-chips" role="tablist" aria-label="סטטוס">
                  {(["active", ...EVENT_REQUEST_STATUS_FLOW] as StatusFilter[]).map((s) => {
                    const label = s === "active" ? "פעילות" : EVENT_REQUEST_STATUS_META[s].short;
                    return (
                      <button
                        key={s}
                        type="button"
                        role="tab"
                        aria-selected={statusFilter === s}
                        className="evrq-chip"
                        data-active={statusFilter === s || undefined}
                        onClick={() => setStatusFilter(s)}
                      >
                        {label}
                        <span className="evrq-chip-count">{statusCounts[s]}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="evrq-chips evrq-chips--kind" role="tablist" aria-label="סוג בקשה">
                  {(["all", "staffing", "supplies"] as KindFilter[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={kindFilter === k}
                      className="evrq-chip"
                      data-active={kindFilter === k || undefined}
                      onClick={() => setKindFilter(k)}
                    >
                      {k !== "all" && <Icon name={EVENT_REQUEST_KIND_META[k].icon} size={14} />}
                      {k === "all" ? "הכול" : EVENT_REQUEST_KIND_META[k].short}
                    </button>
                  ))}
                </div>
              </div>

              {groups.length === 0 ? (
                <div className="evrqp-none">
                  <Icon name="inbox" size={26} />
                  <p className="evrqp-none-title">
                    {statusFilter === "active" ? "אין בקשות פעילות" : "אין בקשות בסינון זה"}
                  </p>
                  <p className="evrqp-none-sub">
                    {statusFilter === "active" ? "הכול טופל — כל הכבוד." : "נסו סטטוס או סוג אחר."}
                  </p>
                </div>
              ) : (
                <div className="evrqp-groups">
                  {groups.map((g) => (
                    <section key={g.eventId} className="evrqp-group" aria-label={g.title}>
                      <EventGroupHead
                        eventId={g.eventId}
                        title={g.title}
                        eventDate={g.eventDate}
                        items={g.items}
                        from={from}
                      />
                      <div className="evrq-list">
                        {g.items.map((r) => (
                          <EventRequestCard
                            key={r.id}
                            request={r}
                            canHandle
                            canDelete
                            onStatus={(id, status) => updateStatus.mutate({ id, status })}
                            onLines={(id, lines, status) => updateLines.mutate({ id, lines, status })}
                            onDelete={(id) => remove.mutate(id)}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>

            <aside className="evrqp-rail" aria-label="סיכום">
              <ArrangeSummary requests={requests} departments={departments} />

              <section className="evrqp-rail-card" aria-label="משימות שנוספו על ידי מנהלת האירועים">
                <header className="evrqp-rail-head">
                  <span className="evrqp-rail-icon" aria-hidden>
                    <Icon name="checklist" size={16} />
                  </span>
                  <h2 className="evrqp-rail-title">משימות שמנהלת האירועים הוסיפה</h2>
                  <span className="evrqp-sec-count">{tasks.length}</span>
                </header>
                {tasks.length === 0 ? (
                  <p className="evrqp-rail-done" data-muted>
                    <Icon name="task_alt" size={16} />
                    עוד לא נוספו משימות לאירועים.
                  </p>
                ) : (
                  <>
                    <ul className="evrqp-tasks">
                      {tasks.slice(0, 25).map((t) => (
                        <EventManagerTaskItem
                          key={t.id}
                          task={t}
                          isNew={!seenAtOnOpen.current || t.created_at > seenAtOnOpen.current}
                          from={from}
                        />
                      ))}
                    </ul>
                    {tasks.length > 25 && (
                      <p className="evrq-hint">מוצגות 25 המשימות האחרונות — את השאר תמצאו בעמוד המשימות.</p>
                    )}
                  </>
                )}
              </section>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
