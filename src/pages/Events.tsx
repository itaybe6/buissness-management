import { useState } from "react";
import { Button, Card, EmptyState, Field, Icon, Input, PageLoader, ErrorState, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId, todayISO } from "@/lib/db";
import { useEvents, useCreateEvent } from "@/api/events";

export function Events() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: events, isLoading, isError, refetch } = useEvents(businessId);
  const create = useCreateEvent();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayISO());
  const [desc, setDesc] = useState("");

  const isManager = profile?.role === "manager";

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const now = todayISO();
  const upcoming = (events ?? []).filter((e) => e.event_date.slice(0, 10) >= now);
  const past = (events ?? []).filter((e) => e.event_date.slice(0, 10) < now);

  return (
<<<<<<< HEAD
    <div className="mx-auto max-w-[820px] animate-fadeUp">
      <header className="page-hero">
        <div className="page-hero-inner">
          <div>
            <h1 className="page-hero-title">אירועים</h1>
            <p className="page-hero-sub">אירועים מיוחדים והזמנות</p>
          </div>
          <div className="flex items-center gap-3">
            {upcoming.length > 0 && (
              <div className="page-hero-stat">
                <Icon name="event_upcoming" size={18} style={{ color: "var(--accent-2)" }} />
                <span><strong>{upcoming.length}</strong> קרובים</span>
              </div>
            )}
            {isManager && (
              <Button icon="add" onClick={() => setOpen(true)}>אירוע חדש</Button>
            )}
          </div>
        </div>
      </header>
=======
    <div className="w-full animate-fadeUp">
      <PageHeader
        title="אירועים"
        subtitle="אירועים מיוחדים והזמנות"
        actions={isManager ? <Button icon="add" onClick={() => setOpen(true)}>אירוע חדש</Button> : undefined}
      />
>>>>>>> 6df25a794822348c0586c09d1d825cf46f6db1de

      {(events ?? []).length === 0 ? (
        <EmptyState icon="celebration" title="אין אירועים" description="הוסיפו אירועים מיוחדים ליומן העסק." action={isManager ? <Button icon="add" onClick={() => setOpen(true)}>אירוע חדש</Button> : undefined} />
      ) : (
        <div className="flex flex-col gap-5">
          {upcoming.length > 0 && <Section title="קרובים" events={upcoming} />}
          {past.length > 0 && <Section title="עברו" events={past} dim />}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="אירוע חדש"
        icon="celebration"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>ביטול</Button><Button className="flex-1" loading={create.isPending} onClick={async () => { if (!title.trim()) return; await create.mutateAsync({ business_id: businessId!, title: title.trim(), description: desc || null, event_date: date, created_by: profile?.id }); setOpen(false); setTitle(""); setDesc(""); }}>שמירה</Button></>}
      >
        <div className="flex flex-col gap-3.5">
          <Field label="שם האירוע"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="לדוגמה: אירוע פרטי לקבוצה" /></Field>
          <Field label="תאריך"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="פרטים"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="h-24" /></Field>
        </div>
      </Modal>
    </div>
  );
}

function Section({ title, events, dim }: { title: string; events: { id: string; title: string; description: string | null; event_date: string }[]; dim?: boolean }) {
  return (
    <div>
      <div className="mb-2.5 text-[13px] font-bold uppercase tracking-wide text-text-3">{title}</div>
      <div className="flex flex-col gap-3">
        {events.map((e, i) => {
          const d = new Date(e.event_date);
          return (
            <Card
              key={e.id}
              className={`report-card dash-rise flex items-center gap-4 p-4 ${dim ? "opacity-60" : ""}`}
              style={{ "--rise-delay": `${Math.min(i, 8) * 40}ms` } as React.CSSProperties}
            >
              <div className="avatar-chip grid h-14 w-14 flex-none place-items-center rounded-[13px]">
                <span className="text-[20px] font-extrabold leading-none text-white">{d.getDate()}</span>
                <span className="text-[10px] font-bold text-white/85">{d.toLocaleDateString("he-IL", { month: "short" })}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold">{e.title}</div>
                {e.description && <div className="mt-0.5 truncate text-[13px] text-text-2">{e.description}</div>}
                <div className="mt-0.5 text-[12px] text-text-3">{d.toLocaleDateString("he-IL", { weekday: "long" })}</div>
              </div>
              <Icon name="celebration" size={22} className="report-card-icon text-text-3" />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
