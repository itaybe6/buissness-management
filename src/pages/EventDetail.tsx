import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, Card, Field, Icon, Input, PageLoader, ErrorState, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { EventMediaCarousel } from "@/components/events/EventMediaCarousel";
import { EventMediaPicker, revokeEventMediaEntries, type MediaEntry } from "@/components/events/EventMediaPicker";
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

  const d = new Date(event.event_date);
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
    <div className="w-full animate-fadeUp">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/events")}
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] font-bold text-text-2 hover:bg-surface-2"
        >
          <Icon name="arrow_forward" size={18} />
          חזרה לאירועים
        </button>
        {canManage && (
          <div className="mr-auto flex items-center gap-2">
            <Button variant="secondary" icon="edit" onClick={openEdit}>עריכה</Button>
            <Button variant="secondary" icon="delete" onClick={() => setDeleteOpen(true)}>מחיקה</Button>
          </div>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        {mediaUrls.length > 0 && <EventMediaCarousel urls={mediaUrls} tall />}

        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-4">
            <div className="avatar-chip grid h-16 w-16 flex-none place-items-center rounded-[14px]">
              <span className="text-[22px] font-extrabold leading-none text-white">{d.getDate()}</span>
              <span className="text-[11px] font-bold text-white/85">{d.toLocaleDateString("he-IL", { month: "short" })}</span>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[clamp(1.35rem,4vw,1.75rem)] font-extrabold tracking-tight text-text">{event.title}</h1>
              <p className="mt-1.5 text-[14px] text-text-2">{dateLabel}</p>
            </div>
          </div>

          {event.description && (
            <div className="mt-5 rounded-[14px] border border-border-2 bg-surface-2 p-4">
              <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-3">תיאור האירוע</div>
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-text">{event.description}</p>
            </div>
          )}

          {mediaUrls.length > 1 && (
            <div className="mt-5">
              <div className="mb-2.5 text-[12px] font-bold uppercase tracking-wide text-text-3">גלריה ({mediaUrls.length})</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {mediaUrls.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="relative aspect-square overflow-hidden rounded-[11px] border border-border bg-surface-2"
                  >
                    {isVideoUrl(url) ? (
                      <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                    ) : (
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

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
