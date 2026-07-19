import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
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

export function EventDetail() {
  const { eventId } = useParams();
  const navigate = useNavigate();
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

  if (!eventId) return <Navigate to="/events" replace />;
  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;
  if (!event) return <ErrorState message="האירוע לא נמצא." onRetry={() => navigate("/events")} />;

  const d = parseEventDay(event.event_date);
  const days = daysUntilEvent(event.event_date);
  const isPast = days < 0;
  const isToday = days === 0;
  const mediaUrls = event.media_urls ?? [];
  const dateLabel = d.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

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
    <div className="w-full page-enter">
      <div className="evtd-cover" data-empty={mediaUrls.length === 0}>
        {mediaUrls.length > 0 ? (
          <EventMediaCarousel urls={mediaUrls} tall />
        ) : (
          <div className="evtd-cover-fallback" aria-hidden>
            <span className="evt-poster-aurora evt-poster-aurora--1" />
            <span className="evt-poster-aurora evt-poster-aurora--2" />
            <span className="evt-poster-grid" />
            <Icon name="celebration" size={72} className="evt-poster-icon" />
          </div>
        )}
        <span className="evtd-cover-scrim" aria-hidden />
        <div className="evtd-cover-bar">
          <button
            type="button"
            className="evtd-glass-btn"
            onClick={() => navigate("/events")}
            aria-label="חזרה לאירועים"
          >
            <Icon name="arrow_forward" size={20} />
          </button>
          {canManage && (
            <div className="flex items-center gap-2">
              <button type="button" className="evtd-glass-btn" onClick={openEdit} aria-label="עריכת האירוע">
                <Icon name="edit" size={19} />
              </button>
              <button
                type="button"
                className="evtd-glass-btn evtd-glass-btn--danger"
                onClick={() => setDeleteOpen(true)}
                aria-label="מחיקת האירוע"
              >
                <Icon name="delete" size={19} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="evtd-sheet">
        <div className="evtd-daterow">
          <span className="evtd-datechip" aria-hidden>
            <b>{d.getDate()}</b>
            <i>{d.toLocaleDateString("he-IL", { month: "short" })}</i>
          </span>
          <div className="min-w-0 flex-1">
            <span
              className="evtd-pill"
              data-tone={isPast ? "past" : days <= 1 ? "hot" : "soon"}
            >
              {isPast ? "האירוע התקיים" : daysUntilLabel(days)}
            </span>
            <p className="evtd-datelabel">{dateLabel}</p>
          </div>
        </div>

        <h1 className="evtd-title">{event.title}</h1>

        {days > 0 && (
          <div className="evtd-ticket">
            <span className="evtd-ticket-notch evtd-ticket-notch--start" aria-hidden />
            <span className="evtd-ticket-notch evtd-ticket-notch--end" aria-hidden />
            <span className="evtd-ticket-aurora" aria-hidden />
            <div className="evtd-ticket-head">
              <Icon name="local_activity" size={15} />
              הספירה לאחור
            </div>
            <EventCountdown dateStr={event.event_date} />
          </div>
        )}

        {isToday && (
          <div className="evtd-today">
            <span className="evt-live-dot" aria-hidden />
            האירוע מתקיים היום
          </div>
        )}

        {event.description && (
          <section className="evtd-desc">
            <h2 className="evtd-label">פרטי האירוע</h2>
            <p>{event.description}</p>
          </section>
        )}

        {mediaUrls.length > 1 && (
          <section className="evtd-gallery-wrap">
            <h2 className="evtd-label">
              גלריה <span>({mediaUrls.length})</span>
            </h2>
            <div className="evtd-gallery" data-rich={mediaUrls.length >= 3} data-count={mediaUrls.length}>
              {mediaUrls.map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="evtd-gallery-item">
                  {isVideoUrl(url) ? (
                    <>
                      <video src={url} muted playsInline preload="metadata" />
                      <span className="evtd-gallery-play" aria-hidden>
                        <Icon name="play_circle" size={26} />
                      </span>
                    </>
                  ) : (
                    <img src={url} alt={`תמונה ${i + 1} מתוך ${mediaUrls.length}`} loading="lazy" />
                  )}
                </a>
              ))}
            </div>
          </section>
        )}

        <p className="evtd-foot">
          <Icon name="history" size={13} />
          נוסף ללו״ז ב־
          {new Date(event.created_at).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
        </p>
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
