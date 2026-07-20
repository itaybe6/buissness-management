import { useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { Button, Field, Icon, Input, PageLoader, ErrorState, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { EventCountdown } from "@/components/events/EventCountdown";
import { EventMediaCarousel } from "@/components/events/EventMediaCarousel";
import { EventMediaPicker, revokeEventMediaEntries, type MediaEntry } from "@/components/events/EventMediaPicker";
import { daysUntilEvent, daysUntilLabel, parseEventDay } from "@/components/events/eventTime";
import { useAuth } from "@/lib/auth";
import { EVENT_MANAGE_ROLES } from "@/lib/constants";
import { useBusinessId } from "@/lib/db";
import { isVideoUrl } from "@/lib/media";
import { useEvent, useUpdateEvent, useDeleteEvent, uploadEventMediaFiles } from "@/api/events";

/** One media tile in the gallery rail — degrades to a placeholder if the URL is dead. */
function GalleryTile({ url, index, total }: { url: string; index: number; total: number }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="evtd-gallery-item" data-failed>
        <span className="evtd-gallery-broken">
          <Icon name="image_not_supported" size={26} />
          <span>הקובץ אינו זמין</span>
        </span>
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="evtd-gallery-item">
      {isVideoUrl(url) ? (
        <>
          <video src={url} muted playsInline preload="metadata" onError={() => setFailed(true)} />
          <span className="evtd-gallery-play" aria-hidden>
            <Icon name="play_arrow" size={26} />
          </span>
        </>
      ) : (
        <img
          src={url}
          alt={`תמונה ${index + 1} מתוך ${total}`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      <span className="evtd-gallery-index" aria-hidden>
        {index + 1}
      </span>
    </a>
  );
}

/** Where the user came from, stashed on the link that opened this page. */
type EventFromState = { from?: string; fromLabel?: string };

export function EventDetail() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: event, isLoading, isError, refetch } = useEvent(businessId, eventId);
  const update = useUpdateEvent(businessId);
  const remove = useDeleteEvent(businessId);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [desc, setDesc] = useState("");
  const [existingMedia, setExistingMedia] = useState<string[]>([]);
  const [newMedia, setNewMedia] = useState<MediaEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = !!(profile?.role && EVENT_MANAGE_ROLES.includes(profile.role));

  const fromState = (location.state ?? null) as EventFromState | null;
  const backLabel = `חזרה ל${fromState?.fromLabel ?? "אירועים"}`;

  /**
   * Back goes wherever the user came from. Real history is preferred so the
   * previous screen keeps its scroll position and filters; on a cold entry
   * (deep link, bookmark, shared URL) there is nothing to pop, so fall back
   * to the origin recorded on the link, then to the events list.
   */
  function goBack() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fromState?.from ?? "/events");
  }

  if (!eventId) return <Navigate to="/events" replace />;
  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;
  if (!event) return <ErrorState message="האירוע לא נמצא." onRetry={() => navigate("/events")} />;

  const d = parseEventDay(event.event_date);
  const days = daysUntilEvent(event.event_date);
  const isPast = days < 0;
  const isToday = days === 0;
  const mediaUrls = event.media_urls ?? [];
  const weekday = d.toLocaleDateString("he-IL", { weekday: "long" });
  const dateLabel = d.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const statusTone = isPast ? "past" : days <= 1 ? "hot" : "soon";
  const statusLabel = isPast ? "האירוע התקיים" : isToday ? "קורה היום" : daysUntilLabel(days);

  function openEdit() {
    setTitle(event!.title);
    setDate(event!.event_date.slice(0, 10));
    setDesc(event!.description ?? "");
    setExistingMedia(event!.media_urls ?? []);
    setNewMedia([]);
    setError(null);
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    revokeEventMediaEntries(newMedia);
    setNewMedia([]);
    setError(null);
  }

  async function saveEdit() {
    setError(null);
    if (!title.trim()) return setError("נא להזין שם לאירוע");
    setBusy(true);
    try {
      const uploaded = newMedia.length ? await uploadEventMediaFiles(businessId!, newMedia.map((m) => m.file)) : [];
      await update.mutateAsync({
        id: event!.id,
        title: title.trim(),
        description: desc || null,
        event_date: date,
        media_urls: [...existingMedia, ...uploaded],
      });
      closeEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בעדכון האירוע");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      await remove.mutateAsync(event!.id);
      navigate("/events", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה במחיקת האירוע");
      setBusy(false);
    }
  }

  return (
    <div className="evtd-page page-enter" data-past={isPast || undefined}>
      <section className="evtd-hero" aria-label={event.title} data-empty={mediaUrls.length === 0 || undefined}>
        <div className="evtd-cover">
          {mediaUrls.length > 0 ? (
            <EventMediaCarousel urls={mediaUrls} />
          ) : (
            <div className="evtd-cover-fallback" aria-hidden>
              <span className="evt-poster-aurora evt-poster-aurora--1" />
              <span className="evt-poster-aurora evt-poster-aurora--2" />
              <span className="evt-poster-grid" />
              <Icon name="celebration" size={72} className="evt-poster-icon" />
            </div>
          )}
        </div>
        <span className="evtd-cover-scrim" aria-hidden />

        <div className="evtd-topbar">
          <button type="button" className="evtd-glass-btn" onClick={goBack} aria-label={backLabel}>
            <Icon name="arrow_forward" size={20} />
          </button>
          {canManage && (
            <div className="evtd-topbar-actions">
              <button type="button" className="evtd-glass-btn" onClick={openEdit} aria-label="עריכת האירוע">
                <Icon name="edit" size={18} />
              </button>
              <button
                type="button"
                className="evtd-glass-btn evtd-glass-btn--danger"
                onClick={() => setDeleteOpen(true)}
                aria-label="מחיקת האירוע"
              >
                <Icon name="delete" size={18} />
              </button>
            </div>
          )}
        </div>

        <div className="evtd-hero-text">
          <span className="evtd-status" data-tone={statusTone}>
            {!isPast && days <= 1 && <span className="evt-live-dot" aria-hidden />}
            {statusLabel}
          </span>
          <h1 className="evtd-title">{event.title}</h1>
          <p className="evtd-when">
            <Icon name="calendar_month" size={15} />
            {dateLabel}
          </p>
        </div>
      </section>

      <div className="evtd-body">
        {days > 0 && (
          <section className="evtd-countdown" aria-label="ספירה לאחור לאירוע">
            <div className="evtd-countdown-head">
              <span className="evtd-countdown-icon" aria-hidden>
                <Icon name="hourglass_top" size={14} />
              </span>
              <p className="evtd-countdown-kicker">הספירה לאחור</p>
              <span className="evtd-countdown-day">{weekday}</span>
            </div>
            <EventCountdown dateStr={event.event_date} />
          </section>
        )}

        {isToday && (
          <div className="evtd-today">
            <span className="evtd-today-ring" aria-hidden>
              <span className="evt-live-dot" />
            </span>
            <div>
              <p className="evtd-today-title">הערב זה קורה</p>
              <p className="evtd-today-sub">האירוע מתקיים היום — בהצלחה!</p>
            </div>
          </div>
        )}

        {event.description && (
          <section className="evtd-section">
            <h2 className="evtd-label">
              <Icon name="notes" size={15} />
              פרטי האירוע
            </h2>
            <p className="evtd-desc-text">{event.description}</p>
          </section>
        )}

        {mediaUrls.length > 1 && (
          <section className="evtd-section evtd-section--flush">
            <div className="evtd-gallery-head">
              <h2 className="evtd-label">
                <Icon name="photo_library" size={15} />
                גלריה
              </h2>
              <span className="evtd-gallery-count">{mediaUrls.length} קבצים</span>
            </div>
            <div className="evtd-gallery">
              {mediaUrls.map((url, i) => (
                <GalleryTile key={url} url={url} index={i} total={mediaUrls.length} />
              ))}
            </div>
          </section>
        )}

        <footer className="evtd-foot">
          <Icon name="history" size={13} />
          <span>
            נוסף ללו״ז ב־
            {new Date(event.created_at).toLocaleDateString("he-IL", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        </footer>
      </div>

      <Modal
        open={editOpen}
        onClose={closeEdit}
        title="עריכת אירוע"
        icon="edit"
        footer={
          <>
            <Button variant="secondary" onClick={closeEdit}>ביטול</Button>
            <Button className="flex-1" loading={busy} onClick={saveEdit}>שמירה</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <Field label="שם האירוע">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="תאריך">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="תיאור האירוע">
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="h-24" />
          </Field>
          {existingMedia.length > 0 && (
            <Field label="מדיה קיימת">
              <div className="grid grid-cols-3 gap-2">
                {existingMedia.map((url) => (
                  <div key={url} className="relative aspect-square overflow-hidden rounded-[11px] border border-border bg-surface-2">
                    {isVideoUrl(url) ? (
                      <>
                        <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/30 text-white">
                          <Icon name="play_circle" size={28} />
                        </span>
                      </>
                    ) : (
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => setExistingMedia((prev) => prev.filter((u) => u !== url))}
                      className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      aria-label="הסרת קובץ"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </Field>
          )}
          <Field label="הוספת תמונות וסרטונים">
            <EventMediaPicker media={newMedia} onChange={setNewMedia} />
          </Field>
          {error && <p className="text-[13px] text-danger">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="מחיקת אירוע"
        icon="delete"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>ביטול</Button>
            <Button className="flex-1" loading={busy} onClick={confirmDelete}>מחיקה</Button>
          </>
        }
      >
        <p className="text-[14px] text-text-2">
          למחוק את האירוע <strong>{event.title}</strong>? פעולה זו אינה ניתנת לביטול.
        </p>
      </Modal>
    </div>
  );
}
