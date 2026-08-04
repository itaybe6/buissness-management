import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { Button, Field, Icon, Input, PageLoader, ErrorState, Textarea } from "@/components/ui";
import { EASE_OUT } from "@/components/motion/shared-motion";
import { Modal } from "@/components/ui/Modal";
import { EventCountdown } from "@/components/events/EventCountdown";
import { EventMediaPicker, revokeEventMediaEntries, type MediaEntry } from "@/components/events/EventMediaPicker";
import { EventsFilter, type EventPeriodFilter } from "@/components/events/EventsFilter";
import { daysUntilEvent, daysUntilLabel, parseEventDay } from "@/components/events/eventTime";
import { useAuth } from "@/lib/auth";
import { EVENT_MANAGE_ROLES } from "@/lib/constants";
import { useBusinessId, todayISO } from "@/lib/db";
import { isVideoUrl } from "@/lib/media";
import { useEvents, useCreateEvent, uploadEventMediaFiles } from "@/api/events";
import { EventsSubNav } from "@/components/events/EventsSubNav";
import type { EventRecord } from "@/types/database";

function EventsHero({
  upcomingCount,
  pastCount,
  todayCount,
}: {
  upcomingCount: number;
  pastCount: number;
  todayCount: number;
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
    <header className="evid-hero" aria-label="לוח אירועים">
      <span className="evid-glow evid-glow--1" aria-hidden />
      <span className="evid-glow evid-glow--2" aria-hidden />
      <span className="evid-grid-lines" aria-hidden />
      <span className="evid-orb evid-orb--1" aria-hidden>
        <Icon name="event" size={15} />
      </span>
      <span className="evid-orb evid-orb--2" aria-hidden>
        <Icon name="schedule" size={13} />
      </span>
      <span className="evid-orb evid-orb--3" aria-hidden>
        <Icon name="celebration" size={14} />
      </span>

      <div className="evid-hero-inner">
        <motion.div className="evid-hero-bar" {...rise(0)}>
          <span className="evid-kicker">
            <span className="evid-kicker-dot" aria-hidden />
            לוח אירועים
          </span>
        </motion.div>

        <motion.div className="evid-hero-copy" {...rise(0.05)}>
          <h1 className="evid-title">
            מה קורה
            <br />
            <span className="evid-title-em">על הבמה?</span>
          </h1>
          <p className="evid-sub">
            כל אירוע במקום אחד — מה שקרוב, מה שעבר, ומה שמחכה להדליק את הערב.
          </p>
        </motion.div>

        <motion.div className="evid-stats" {...rise(0.12)}>
          <div className="evid-stat">
            <span className="evid-stat-label">
              <Icon name="event_upcoming" size={13} />
              עתידיים
            </span>
            <span className="evid-stat-value">{upcomingCount}</span>
          </div>
          <div className="evid-stat">
            <span className="evid-stat-label">
              <Icon name="history" size={13} />
              עברו
            </span>
            <span className="evid-stat-value">{pastCount}</span>
          </div>
          <div className="evid-stat" data-tone={todayCount > 0 ? "live" : undefined}>
            <span className="evid-stat-label">
              <Icon name="today" size={13} />
              היום
            </span>
            <span className="evid-stat-value">{todayCount}</span>
          </div>
        </motion.div>

        <motion.div className="evid-hero-nav" {...rise(0.18)}>
          <EventsSubNav active="list" variant="ink" />
        </motion.div>
      </div>
    </header>
  );
}

export function Events() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: events, isLoading, isError, refetch } = useEvents(businessId);
  const create = useCreateEvent();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayISO());
  const [desc, setDesc] = useState("");
  const [media, setMedia] = useState<MediaEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [periodFilter, setPeriodFilter] = useState<EventPeriodFilter>("all");
  const [dateFilter, setDateFilter] = useState<string | null>(null);

  const canManage = !!(profile?.role && EVENT_MANAGE_ROLES.includes(profile.role));

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const now = todayISO();
  const allEvents = events ?? [];
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("he");
  const searchedEvents = normalizedQuery
    ? allEvents.filter((event) =>
        [event.title, event.description]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase("he").includes(normalizedQuery)),
      )
    : allEvents;
  const upcomingAll = allEvents.filter((e) => e.event_date.slice(0, 10) >= now);
  const pastAll = allEvents.filter((e) => e.event_date.slice(0, 10) < now).reverse();
  const todayCount = allEvents.filter((e) => e.event_date.slice(0, 10) === now).length;
  const searchedUpcoming = searchedEvents.filter((e) => e.event_date.slice(0, 10) >= now);
  const searchedPast = searchedEvents.filter((e) => e.event_date.slice(0, 10) < now).reverse();
  const hasEvents = allEvents.length > 0;
  const isDefaultView = periodFilter === "all" && !dateFilter && !normalizedQuery;

  let upcoming = searchedUpcoming;
  let past = searchedPast;

  if (dateFilter) {
    const onDate = searchedEvents.filter((e) => e.event_date.slice(0, 10) === dateFilter);
    upcoming = onDate.filter((e) => e.event_date.slice(0, 10) >= now);
    past = onDate.filter((e) => e.event_date.slice(0, 10) < now).reverse();
  } else if (periodFilter === "upcoming") {
    upcoming = searchedUpcoming;
    past = [];
  } else if (periodFilter === "past") {
    upcoming = [];
    past = searchedPast;
  }

  const featured = upcoming[0];
  const rest = upcoming.slice(1);
  const hasFilteredResults = upcoming.length > 0 || past.length > 0;

  function resetForm() {
    setTitle("");
    setDate(todayISO());
    setDesc("");
    setMedia((prev) => {
      revokeEventMediaEntries(prev);
      return [];
    });
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!title.trim()) return setError("נא להזין שם לאירוע");
    setBusy(true);
    try {
      const media_urls = media.length ? await uploadEventMediaFiles(businessId!, media.map((m) => m.file)) : [];
      await create.mutateAsync({
        business_id: businessId!,
        title: title.trim(),
        description: desc || null,
        event_date: date,
        media_urls,
        created_by: profile?.id,
      });
      setOpen(false);
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בשמירת האירוע. ודאו שקיים Bucket בשם events ב-Storage.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="evt-page page-enter">
      <EventsHero upcomingCount={upcomingAll.length} pastCount={pastAll.length} todayCount={todayCount} />

      <div className="evt-body">
      <EventsFilter
        query={searchQuery}
        onQueryChange={setSearchQuery}
        period={periodFilter}
        onPeriodChange={setPeriodFilter}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
        upcomingCount={upcomingAll.length}
        pastCount={pastAll.length}
        canManage={canManage}
        onAdd={() => setOpen(true)}
        filtersEnabled={hasEvents}
      />

      {!hasEvents ? (
        <div className="evt-empty">
          <div className="evt-empty-stack" aria-hidden>
            <span className="evt-empty-poster evt-empty-poster--1">
              <Icon name="local_activity" size={24} />
            </span>
            <span className="evt-empty-poster evt-empty-poster--2">
              <Icon name="nightlife" size={24} />
            </span>
            <span className="evt-empty-poster evt-empty-poster--3">
              <Icon name="celebration" size={30} />
            </span>
          </div>
          <h2 className="evt-empty-title">הבמה עוד ריקה</h2>
          <p className="evt-empty-sub">האירוע הראשון של הבר מחכה שיעלה ללו״ז.</p>
          {canManage && (
            <Button icon="add" onClick={() => setOpen(true)}>
              יוצרים אירוע ראשון
            </Button>
          )}
        </div>
      ) : !hasFilteredResults ? (
        <div className="evt-filter-empty">
          <Icon name={normalizedQuery ? "search_off" : "event_busy"} size={28} />
          <p className="evt-filter-empty-title">
            {normalizedQuery ? "לא נמצאו אירועים" : "אין אירועים בסינון זה"}
          </p>
          <p className="evt-filter-empty-sub">
            {normalizedQuery ? "נסו לחפש בשם אחר או נקו את החיפוש." : "נסו תאריך אחר או שנו את תקופת הסינון."}
          </p>
          <Button
            variant="secondary"
            icon={normalizedQuery ? "search_off" : "filter_alt_off"}
            onClick={() => {
              setSearchQuery("");
              setPeriodFilter("all");
              setDateFilter(null);
            }}
          >
            {normalizedQuery ? "ניקוי חיפוש" : "ניקוי סינון"}
          </Button>
        </div>
      ) : (
        <div className="evt-sections">
          {upcoming.length > 0 && periodFilter !== "past" && (
            <div className="evt-upcoming">
              {featured && (isDefaultView || periodFilter === "upcoming" || dateFilter) && (
                <FeaturedEvent event={featured} />
              )}
              {(isDefaultView ? rest : featured ? upcoming.slice(1) : upcoming).length > 0 && (
                <section className="evt-sec">
                  <SectionHead
                    icon="event_upcoming"
                    label={isDefaultView ? "בהמשך" : dateFilter ? "אירועים בתאריך" : "אירועים עתידיים"}
                    count={isDefaultView ? rest.length : upcoming.length}
                  />
                  <div className="evt-rows">
                    {(isDefaultView ? rest : featured ? upcoming.slice(1) : upcoming).map((e, i) => (
                      <EventRow key={e.id} event={e} index={i} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {upcoming.length === 0 && periodFilter !== "past" && isDefaultView && (
            <div className="evt-none">
              <span className="evt-none-icon" aria-hidden>
                <Icon name="event_upcoming" size={22} />
              </span>
              <p className="evt-none-title">אין אירועים קרובים</p>
              <p className="evt-none-sub">כשיעלה אירוע חדש ללו״ז הוא יופיע כאן ראשון.</p>
            </div>
          )}

          {past.length > 0 && periodFilter !== "upcoming" && (
            <section className="evt-sec">
              <SectionHead
                icon="history"
                label={periodFilter === "past" || dateFilter ? "אירועים שעברו" : "היו כבר"}
                count={past.length}
              />
              <div className="evt-past-strip">
                {past.map((e) => (
                  <PastCard key={e.id} event={e} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      </div>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          resetForm();
        }}
        title="אירוע חדש"
        icon="celebration"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>ביטול</Button>
            <Button className="flex-1" loading={busy} onClick={submit}>שמירה</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <Field label="שם האירוע">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="לדוגמה: אירוע פרטי לקבוצה" />
          </Field>
          <Field label="תאריך">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="תיאור האירוע">
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="h-24" placeholder="פרטים, הערות, דרישות מיוחדות..." />
          </Field>
          <Field label="תמונות וסרטונים">
            <EventMediaPicker media={media} onChange={setMedia} />
          </Field>
          {error && <p className="text-[13px] text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}

/* --------------- Section head --------------- */

function SectionHead({ icon, label, count }: { icon: string; label: string; count: number }) {
  return (
    <div className="evt-sec-head">
      <span className="evt-sec-icon" aria-hidden>
        <Icon name={icon} size={15} />
      </span>
      <h2 className="evt-sec-title">{label}</h2>
      <span className="evt-sec-count">{count}</span>
      <span className="evt-sec-line" aria-hidden />
    </div>
  );
}

/* --------------- Featured "headliner" poster --------------- */

function FeaturedEvent({ event: e }: { event: EventRecord }) {
  const d = parseEventDay(e.event_date);
  const days = daysUntilEvent(e.event_date);
  const isToday = days === 0;
  const mediaUrls = e.media_urls ?? [];
  const cover = mediaUrls[0];

  return (
    <Link to={`/events/${e.id}`} className="evt-feature" aria-label={e.title}>
      <div className="evt-feature-media" aria-hidden>
        {cover ? (
          isVideoUrl(cover) ? (
            <video src={cover} muted playsInline preload="metadata" />
          ) : (
            <img src={cover} alt="" />
          )
        ) : (
          <PosterFallback />
        )}
      </div>
      <span className="evt-feature-scrim" aria-hidden />

      <div className="evt-feature-top">
        <span className="evt-glass-chip evt-glass-chip--live">
          <span className="evt-live-dot" aria-hidden />
          {isToday ? "קורה היום" : "האירוע הבא"}
        </span>
        {mediaUrls.length > 1 && (
          <span className="evt-glass-chip">
            <Icon name="photo_library" size={13} />
            {mediaUrls.length}
          </span>
        )}
        {cover && isVideoUrl(cover) && (
          <span className="evt-glass-chip">
            <Icon name="play_arrow" size={14} />
          </span>
        )}
      </div>

      <div className="evt-feature-body">
        <div className="evt-feature-head">
          <span className="evt-feature-date" aria-hidden>
            <b>{d.getDate()}</b>
            <i>{d.toLocaleDateString("he-IL", { month: "short" })}</i>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="evt-feature-title">{e.title}</h2>
            <p className="evt-feature-meta">
              {d.toLocaleDateString("he-IL", { weekday: "long" })}
              <span className="evt-dot" aria-hidden>•</span>
              {daysUntilLabel(days)}
            </p>
          </div>
        </div>
        <EventCountdown dateStr={e.event_date} />
      </div>
    </Link>
  );
}

/** Charcoal poster background for events without media. */
function PosterFallback() {
  return (
    <span className="evt-poster-fallback" aria-hidden>
      <span className="evt-poster-aurora evt-poster-aurora--1" />
      <span className="evt-poster-aurora evt-poster-aurora--2" />
      <span className="evt-poster-grid" />
      <Icon name="celebration" size={64} className="evt-poster-icon" />
    </span>
  );
}

/* --------------- Upcoming rows --------------- */

function EventRow({ event: e, index }: { event: EventRecord; index: number }) {
  const d = parseEventDay(e.event_date);
  const days = daysUntilEvent(e.event_date);
  const mediaUrls = e.media_urls ?? [];
  const cover = mediaUrls[0];

  return (
    <Link
      to={`/events/${e.id}`}
      className="evt-row dash-rise"
      style={{ "--rise-delay": `${Math.min(index, 8) * 45}ms` } as React.CSSProperties}
    >
      <span className="evt-row-date" aria-hidden>
        <b>{d.getDate()}</b>
        <i>{d.toLocaleDateString("he-IL", { month: "short" })}</i>
      </span>
      <span className="evt-row-copy">
        <span className="evt-row-title">{e.title}</span>
        <span className="evt-row-meta">
          {d.toLocaleDateString("he-IL", { weekday: "long" })}
          <span className="evt-dot" aria-hidden>•</span>
          {daysUntilLabel(days)}
        </span>
      </span>
      {cover ? (
        <span className="evt-row-thumb" aria-hidden>
          {isVideoUrl(cover) ? (
            <>
              <video src={cover} muted playsInline preload="metadata" />
              <Icon name="play_circle" size={20} className="evt-row-play" />
            </>
          ) : (
            <img src={cover} alt="" />
          )}
        </span>
      ) : (
        <span className="evt-row-thumb evt-row-thumb--empty" aria-hidden>
          <Icon name="celebration" size={20} />
        </span>
      )}
      <Icon name="chevron_left" size={20} className="evt-row-chev" aria-hidden />
    </Link>
  );
}

/* --------------- Past archive strip --------------- */

function PastCard({ event: e }: { event: EventRecord }) {
  const d = parseEventDay(e.event_date);
  const cover = (e.media_urls ?? [])[0];
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const dateOpts: Intl.DateTimeFormatOptions = sameYear
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" };

  return (
    <Link to={`/events/${e.id}`} className="evt-past-card">
      <span className="evt-past-media">
        {cover ? (
          isVideoUrl(cover) ? (
            <video src={cover} muted playsInline preload="metadata" />
          ) : (
            <img src={cover} alt="" />
          )
        ) : (
          <span className="evt-past-empty" aria-hidden>
            <Icon name="celebration" size={24} />
          </span>
        )}
        <span className="evt-past-scrim" aria-hidden />
        <span className="evt-past-date">{d.toLocaleDateString("he-IL", dateOpts)}</span>
      </span>
      <span className="evt-past-body">
        <span className="evt-past-title">{e.title}</span>
        <Icon name="chevron_left" size={16} className="evt-past-go" aria-hidden />
      </span>
    </Link>
  );
}
