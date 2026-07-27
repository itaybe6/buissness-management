import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Field, Icon, Input, PageLoader, ErrorState, Textarea } from "@/components/ui";
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
    <div className="w-full page-enter">
      <div className="evt-toolbar">
        <EventsSubNav active="list" />
      </div>

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
        <div className="flex flex-col gap-6">
          {upcoming.length > 0 && periodFilter !== "past" && (
            <>
              {featured && (isDefaultView || periodFilter === "upcoming" || dateFilter) && (
                <FeaturedEvent event={featured} />
              )}
              {(isDefaultView ? rest : featured ? upcoming.slice(1) : upcoming).length > 0 && (
                <section>
                  <h2 className="page-section-label">
                    {isDefaultView ? (
                      <>בהמשך <span>({rest.length})</span></>
                    ) : dateFilter ? (
                      <>אירועים בתאריך <span>({upcoming.length})</span></>
                    ) : (
                      <>אירועים עתידיים <span>({upcoming.length})</span></>
                    )}
                  </h2>
                  <div className="evt-rows">
                    {(isDefaultView ? rest : featured ? upcoming.slice(1) : upcoming).map((e, i) => (
                      <EventRow key={e.id} event={e} index={i} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {upcoming.length === 0 && periodFilter !== "past" && isDefaultView && (
            <div className="evt-none">
              <Icon name="event_upcoming" size={22} />
              <span>אין אירועים קרובים כרגע</span>
            </div>
          )}

          {past.length > 0 && periodFilter !== "upcoming" && (
            <section>
              <h2 className="page-section-label">
                {periodFilter === "past" || dateFilter ? (
                  <>אירועים שעברו <span>({past.length})</span></>
                ) : (
                  <>היו כבר <span>({past.length})</span></>
                )}
              </h2>
              <div className="evt-past-strip">
                {past.map((e) => (
                  <PastCard key={e.id} event={e} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

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
      <span className="evt-past-media" aria-hidden>
        {cover ? (
          isVideoUrl(cover) ? (
            <video src={cover} muted playsInline preload="metadata" />
          ) : (
            <img src={cover} alt="" />
          )
        ) : (
          <Icon name="celebration" size={22} />
        )}
      </span>
      <span className="evt-past-title">{e.title}</span>
      <span className="evt-past-date">{d.toLocaleDateString("he-IL", dateOpts)}</span>
    </Link>
  );
}
