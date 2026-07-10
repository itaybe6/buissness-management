import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button, Card, EmptyState, Icon, PageHeader, PageLoader, ErrorState, Field, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { isVideoFile, isVideoUrl } from "@/lib/media";
import { useFaults, useCreateFault, useUpdateFault, uploadFaultPhotos } from "@/api/faults";
import type { FaultStatus } from "@/types/database";

type StatusTone = "danger" | "warning" | "success";

const STATUS_META: Record<FaultStatus, { label: string; tone: StatusTone; icon: string; color: string }> = {
  needs_handling: { label: "דורש טיפול", tone: "danger", icon: "error", color: "var(--danger)" },
  in_progress: { label: "בטיפול", tone: "warning", icon: "pending", color: "var(--warning)" },
  handled: { label: "טופל", tone: "success", icon: "check_circle", color: "var(--success)" },
};
const STATUS_ORDER: FaultStatus[] = ["needs_handling", "in_progress", "handled"];

type MediaEntry = { file: File; preview: string; isVideo: boolean };

function revokeMediaEntries(entries: MediaEntry[]) {
  entries.forEach(({ preview }) => URL.revokeObjectURL(preview));
}

function formatFaultTime(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const date = d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "numeric" });
  return `${time} ,${date}`;
}

function FaultMediaItem({ url }: { url: string }) {
  if (isVideoUrl(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="relative block h-full w-full bg-black">
        <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        <span className="absolute inset-0 grid place-items-center bg-black/35 text-white">
          <Icon name="play_circle" size={44} />
        </span>
      </a>
    );
  }
  return <img src={url} alt="תקלה" className="h-full w-full object-cover" />;
}

function FaultMediaCarousel({ urls, tall }: { urls: string[]; tall?: boolean }) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | null>(null);
  const count = urls.length;

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, count - 1)));
  }, [count]);

  function go(delta: number) {
    setIndex((i) => (i + delta + count) % count);
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStart.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStart.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
    touchStart.current = null;
  }

  if (count === 0) return null;

  return (
    <div
      className={`fault-media group relative w-full overflow-hidden bg-surface-2 ${tall ? "fault-media--tall" : "h-36"}`}
      onTouchStart={count > 1 ? onTouchStart : undefined}
      onTouchEnd={count > 1 ? onTouchEnd : undefined}
    >
      <div key={index} className="absolute inset-0 animate-fadeIn">
        <FaultMediaItem url={urls[index]} />
      </div>

      {count > 1 && (
        <>
          <span className="fault-media-count">
            {index + 1}/{count}
          </span>

          <button
            type="button"
            onClick={() => go(-1)}
            className="fault-media-nav fault-media-nav--prev"
            aria-label="תמונה קודמת"
          >
            <Icon name="chevron_right" size={22} />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="fault-media-nav fault-media-nav--next"
            aria-label="תמונה הבאה"
          >
            <Icon name="chevron_left" size={22} />
          </button>

          <div className="fault-media-dots">
            {urls.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`תמונה ${i + 1}`}
                aria-current={i === index}
                className={`fault-media-dot ${i === index ? "fault-media-dot--active" : ""}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FaultStatusSegmented({
  value,
  onChange,
  disabled,
  solid,
}: {
  value: FaultStatus;
  onChange: (s: FaultStatus) => void;
  disabled?: boolean;
  solid?: boolean;
}) {
  return (
    <div
      className={`fault-status-seg ${solid ? "fault-status-seg--solid" : ""}`}
      role="group"
      aria-label="סטטוס התקלה"
    >
      {STATUS_ORDER.map((s) => {
        const m = STATUS_META[s];
        const active = value === s;
        return (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onChange(s)}
            aria-pressed={active}
            data-status={s}
            data-active={active}
            className="seg-btn fault-status-btn"
          >
            <Icon name={m.icon} size={15} className="flex-none" />
            <span className="truncate">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FaultStatCard({
  status,
  count,
  active,
  onClick,
}: {
  status: FaultStatus;
  count: number;
  active?: boolean;
  onClick?: () => void;
}) {
  const m = STATUS_META[status];
  return (
    <button
      type="button"
      className={`fault-stat ${active ? "fault-stat--active" : ""}`}
      data-tone={m.tone}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="fault-stat-icon" aria-hidden>
        <Icon name={m.icon} size={18} />
      </span>
      <span className="fault-stat-val">{count}</span>
      <span className="fault-stat-lbl">{m.label}</span>
    </button>
  );
}

export function Faults() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: faults, isLoading, isError, refetch } = useFaults(businessId);
  const createFault = useCreateFault();
  const updateFault = useUpdateFault(businessId);
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [media, setMedia] = useState<MediaEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FaultStatus | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef(media);
  mediaRef.current = media;

  useEffect(() => () => revokeMediaEntries(mediaRef.current), []);

  const canReport = profile?.role !== "maintenance";

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const counts = { needs_handling: 0, in_progress: 0, handled: 0 } as Record<FaultStatus, number>;
  (faults ?? []).forEach((f) => (counts[f.status] += 1));

  const visible = (faults ?? []).filter((f) => (filter ? f.status === filter : true));

  function resetForm() {
    setDesc("");
    setMedia((prev) => {
      revokeMediaEntries(prev);
      return [];
    });
    setError(null);
  }

  function addFiles(next: FileList | null) {
    if (!next?.length) return;
    const entries = Array.from(next).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      isVideo: isVideoFile(file),
    }));
    setMedia((prev) => [...prev, ...entries]);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files);
    e.target.value = "";
  }

  function removeMedia(index: number) {
    setMedia((prev) => {
      const entry = prev[index];
      if (entry) URL.revokeObjectURL(entry.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function submit() {
    setError(null);
    if (!desc.trim()) return setError("נא לתאר את התקלה");
    setBusy(true);
    try {
      const photo_urls = media.length ? await uploadFaultPhotos(businessId!, media.map((m) => m.file)) : [];
      await createFault.mutateAsync({
        business_id: businessId!,
        description: desc.trim(),
        photo_urls,
        reported_by: profile?.id,
      });
      setOpen(false);
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה. ודאו שקיים Bucket בשם faults ב-Storage.");
    } finally {
      setBusy(false);
    }
  }

  function toggleFilter(s: FaultStatus) {
    setFilter((prev) => (prev === s ? null : s));
  }

  function onStatusChange(id: string, status: FaultStatus, current: FaultStatus) {
    if (status !== current) updateFault.mutate({ id, status });
  }

  const reportModal = (
    <Modal
      open={open}
      onClose={() => {
        setOpen(false);
        resetForm();
      }}
      title="דיווח תקלה"
      icon="build"
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            ביטול
          </Button>
          <Button className="flex-1" loading={busy} onClick={submit}>
            שליחת דיווח לאחזקה
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />

        {media.length === 0 ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-[13px] border border-dashed border-border bg-surface-2 text-text-3 hover:border-accent-2 hover:text-ink"
          >
            <Icon name="perm_media" size={34} />
            <span className="text-[13.5px] font-semibold">צילום או העלאת תמונות וסרטונים</span>
            <span className="text-[12px]">ניתן לבחור כמה קבצים · הקבצים יכווצו לפני העלאה</span>
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2">
              {media.map(({ preview, isVideo }, i) => (
                <div key={preview} className="relative aspect-square overflow-hidden rounded-[11px] border border-border bg-surface-2">
                  {isVideo ? (
                    <>
                      <video src={preview} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                      <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/30 text-white">
                        <Icon name="play_circle" size={28} />
                      </span>
                    </>
                  ) : (
                    <img src={preview} alt={`תמונה ${i + 1}`} className="h-full w-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeMedia(i)}
                    className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    aria-label="הסרת קובץ"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[11px] border border-dashed border-border bg-surface-2 text-text-3 hover:border-accent-2 hover:text-ink"
              >
                <Icon name="add" size={24} />
                <span className="text-[11px] font-semibold">הוספה</span>
              </button>
            </div>
            <div className="text-[12px] text-text-3">
              {media.length} קבצים נבחרו
              {media.some((m) => m.isVideo) && media.some((m) => !m.isVideo)
                ? " · תמונות וסרטונים"
                : media.every((m) => m.isVideo)
                  ? " · סרטונים"
                  : " · תמונות"}
            </div>
          </div>
        )}

        <Field label="תיאור התקלה">
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="h-24" placeholder="תארו את התקלה..." />
        </Field>
        {error && (
          <div className="flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
            <Icon name="error" size={18} /> {error}
          </div>
        )}
      </div>
    </Modal>
  );

  return (
    <div className="w-full animate-fadeUp">
      {/* ── Mobile ── */}
      <div className="faults-mobile md:hidden">
        {canReport && (
          <button type="button" className="faults-report-btn btn-press" onClick={() => setOpen(true)}>
            <Icon name="add_a_photo" size={22} />
            <span>דיווח תקלה חדשה</span>
          </button>
        )}

        <div className="faults-stats" aria-label="סיכום תקלות">
          {STATUS_ORDER.map((s) => (
            <FaultStatCard
              key={s}
              status={s}
              count={counts[s]}
              active={filter === s}
              onClick={() => toggleFilter(s)}
            />
          ))}
        </div>

        {filter && (
          <button type="button" className="faults-filter-clear" onClick={() => setFilter(null)}>
            <Icon name="filter_alt_off" size={16} />
            הצגת הכל
          </button>
        )}

        {visible.length === 0 ? (
          <EmptyState
            icon="build"
            title={filter ? "אין תקלות בסטטוס זה" : "אין תקלות פתוחות"}
            description={filter ? "נסו סטטוס אחר או הציגו הכל." : "כל הכבוד! לא דווחו תקלות."}
          />
        ) : (
          <div className="faults-feed">
            {visible.map((f, i) => {
              const meta = STATUS_META[f.status];
              const mediaUrls = f.photo_urls ?? [];
              return (
                <article
                  key={f.id}
                  className="fault-card"
                  style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                >
                  {mediaUrls.length > 0 ? (
                    <FaultMediaCarousel urls={mediaUrls} tall />
                  ) : (
                    <div className="fault-media fault-media--empty fault-media--tall">
                      <Icon name="image" size={36} />
                      <span>ללא תמונה</span>
                    </div>
                  )}

                  <div className="fault-card-body">
                    <div className="fault-card-head">
                      <span className="fault-card-status" data-tone={meta.tone} aria-label={meta.label}>
                        <Icon name={meta.icon} size={20} />
                      </span>
                      <div className="fault-card-copy">
                        <h3 className="fault-card-title">{f.description}</h3>
                        <time className="fault-card-time" dateTime={f.created_at}>
                          {formatFaultTime(f.created_at)}
                        </time>
                      </div>
                    </div>

                    <FaultStatusSegmented
                      value={f.status}
                      solid
                      disabled={updateFault.isPending}
                      onChange={(status) => onStatusChange(f.id, status, f.status)}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Desktop ── */}
      <div className="hidden md:block">
        <PageHeader
          title="דיווח תקלות"
          subtitle="מעקב וטיפול בתקלות · עדכון סטטוס ישיר מהכרטיס"
          actions={
            canReport ? (
              <Button icon="add_a_photo" onClick={() => setOpen(true)}>
                דיווח תקלה חדשה
              </Button>
            ) : undefined
          }
        />

        <div className="mb-5 grid grid-cols-3 gap-4">
          {STATUS_ORDER.map((s) => {
            const m = STATUS_META[s];
            const active = filter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleFilter(s)}
                aria-pressed={active}
                className={`flex items-center gap-3.5 rounded-card border bg-surface p-[18px] text-right shadow-sm transition ${
                  active ? "border-transparent ring-2" : "border-border/80 hover:border-border"
                }`}
                style={active ? { boxShadow: `0 0 0 2px ${m.color}` } : undefined}
              >
                <span
                  className="grid h-11 w-11 flex-none place-items-center rounded-[12px]"
                  style={{ background: `var(--${m.tone}-bg)`, color: m.color }}
                >
                  <Icon name={m.icon} size={24} />
                </span>
                <div>
                  <div className="text-[26px] font-extrabold tracking-tight tabular-nums">{counts[s]}</div>
                  <div className="text-[12.5px] text-text-2">{m.label}</div>
                </div>
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon="build"
            title={filter ? "אין תקלות בסטטוס זה" : "אין תקלות פתוחות"}
            description={filter ? "נסו סטטוס אחר או הציגו הכל." : "כל הכבוד! לא דווחו תקלות."}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((f) => {
              const meta = STATUS_META[f.status];
              const mediaUrls = f.photo_urls ?? [];
              return (
                <Card key={f.id} className="flex flex-col overflow-hidden p-0">
                  <div className="h-1.5" style={{ background: meta.color }} />
                  <FaultMediaCarousel urls={mediaUrls} />
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start justify-between">
                      <span
                        className="grid h-11 w-11 place-items-center rounded-[12px]"
                        style={{ background: `var(--${meta.tone}-bg)`, color: meta.color }}
                      >
                        <Icon name={meta.icon} size={24} />
                      </span>
                    </div>
                    <div className="mt-3 text-[14.5px] font-bold leading-snug">{f.description}</div>
                    <div className="mt-1.5 text-[12px] text-text-3">{formatFaultTime(f.created_at)}</div>
                    <FaultStatusSegmented
                      value={f.status}
                      disabled={updateFault.isPending}
                      onChange={(status) => onStatusChange(f.id, status, f.status)}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {reportModal}
    </div>
  );
}
