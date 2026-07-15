import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, EmptyState, Field, Icon, Input, PageHeader, PageLoader, ErrorState, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { EventMediaPicker, revokeEventMediaEntries, type MediaEntry } from "@/components/events/EventMediaPicker";
import { useAuth } from "@/lib/auth";
import { EVENT_MANAGE_ROLES } from "@/lib/constants";
import { useBusinessId, todayISO } from "@/lib/db";
import { isVideoUrl } from "@/lib/media";
import { useEvents, useCreateEvent, uploadEventMediaFiles } from "@/api/events";
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

  const canManage = !!(profile?.role && EVENT_MANAGE_ROLES.includes(profile.role));

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const now = todayISO();
  const upcoming = (events ?? []).filter((e) => e.event_date.slice(0, 10) >= now);
  const past = (events ?? []).filter((e) => e.event_date.slice(0, 10) < now);

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
    <div className="w-full animate-fadeUp">
      <PageHeader
        title="אירועים"
        subtitle="אירועים מיוחדים והזמנות"
        actions={
          canManage ? (
            <Button icon="add" onClick={() => setOpen(true)}>אירוע חדש</Button>
          ) : undefined
        }
      />

      {(events ?? []).length === 0 ? (
        <EmptyState
          icon="celebration"
          title="אין אירועים"
          description="הוסיפו אירועים מיוחדים ליומן העסק."
          action={canManage ? <Button icon="add" onClick={() => setOpen(true)}>אירוע חדש</Button> : undefined}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {upcoming.length > 0 && <Section title="קרובים" events={upcoming} />}
          {past.length > 0 && <Section title="עברו" events={past} dim />}
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

function Section({ title, events, dim }: { title: string; events: EventRecord[]; dim?: boolean }) {
  return (
    <div>
      <div className="mb-2.5 text-[13px] font-bold uppercase tracking-wide text-text-3">{title}</div>
      <div className="flex flex-col gap-3">
        {events.map((e, i) => (
          <EventCard key={e.id} event={e} index={i} dim={dim} />
        ))}
      </div>
    </div>
  );
}

function EventCard({ event: e, index, dim }: { event: EventRecord; index: number; dim?: boolean }) {
  const d = new Date(e.event_date);
  const mediaUrls = e.media_urls ?? [];
  const cover = mediaUrls[0];

  return (
    <Link to={`/events/${e.id}`} className="block">
      <Card
        className={`report-card dash-rise overflow-hidden p-0 ${dim ? "opacity-60" : ""}`}
        style={{ "--rise-delay": `${Math.min(index, 8) * 40}ms` } as React.CSSProperties}
      >
        {cover && (
          <div className="relative h-36 w-full overflow-hidden bg-surface-2">
            {isVideoUrl(cover) ? (
              <>
                <video src={cover} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                <span className="absolute inset-0 grid place-items-center bg-black/25 text-white">
                  <Icon name="play_circle" size={36} />
                </span>
              </>
            ) : (
              <img src={cover} alt="" className="h-full w-full object-cover" />
            )}
            {mediaUrls.length > 1 && (
              <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white">
                <Icon name="photo_library" size={12} />
                {mediaUrls.length}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-4 p-4">
          <div className="avatar-chip grid h-14 w-14 flex-none place-items-center rounded-[13px]">
            <span className="text-[20px] font-extrabold leading-none text-white">{d.getDate()}</span>
            <span className="text-[10px] font-bold text-white/85">{d.toLocaleDateString("he-IL", { month: "short" })}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold">{e.title}</div>
            {e.description && <div className="mt-0.5 truncate text-[13px] text-text-2">{e.description}</div>}
            <div className="mt-0.5 text-[12px] text-text-3">{d.toLocaleDateString("he-IL", { weekday: "long" })}</div>
          </div>
          <Icon name="chevron_left" size={22} className="report-card-icon text-text-3" />
        </div>
      </Card>
    </Link>
  );
}
