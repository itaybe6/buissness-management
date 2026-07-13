import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button, Card, EmptyState, Icon, Input, PageHeader, PageLoader, ErrorState, Field, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useProfiles } from "@/api/users";
import { useAuth } from "@/lib/auth";
import { addDays, todayISO, toISODate, useBusinessId } from "@/lib/db";
import { isVideoFile, isVideoUrl } from "@/lib/media";
import { useFaults, useCreateFault, useUpdateFault, uploadFaultPhotos } from "@/api/faults";
import type { Fault, FaultStatus } from "@/types/database";

type StatusTone = "danger" | "warning" | "success";

const STATUS_META: Record<FaultStatus, { label: string; tone: StatusTone; icon: string; color: string }> = {
  needs_handling: { label: "דורש טיפול", tone: "danger", icon: "error", color: "var(--danger)" },
  in_progress: { label: "בטיפול", tone: "warning", icon: "pending", color: "var(--warning)" },
  handled: { label: "טופל", tone: "success", icon: "check_circle", color: "var(--success)" },
};
const STATUS_ORDER: FaultStatus[] = ["needs_handling", "in_progress", "handled"];

type DatePreset = "all" | "today" | "7d" | "month" | "custom";

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "today", label: "היום" },
  { key: "7d", label: "7 ימים" },
  { key: "month", label: "החודש" },
  { key: "custom", label: "מותאם" },
];

function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function resolveDateRange(preset: DatePreset, customFrom: string, customTo: string) {
  const today = todayISO();
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "month":
      return { from: monthStartISO(), to: today };
    case "custom":
      return { from: customFrom || null, to: customTo || null };
    default:
      return { from: null as string | null, to: null as string | null };
  }
}

function faultDay(iso: string) {
  return toISODate(new Date(iso));
}

function matchesDateRange(iso: string, from: string | null, to: string | null) {
  if (!from && !to) return true;
  const day = faultDay(iso);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

type MediaEntry = { file: File; preview: string; isVideo: boolean };

function revokeMediaEntries(entries: MediaEntry[]) {
  entries.forEach(({ preview }) => URL.revokeObjectURL(preview));
}

function formatFaultTime(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false });
  const date = d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "numeric" });
  return `${time} ,${date}`;
}

function formatFaultTimeRelative(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  const time = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (diffMin < 1) return "ממש עכשיו";
  if (diffMin < 60) return `לפני ${diffMin} דק׳`;
  if (d.toDateString() === now.toDateString()) return `היום · ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `אתמול · ${time}`;
  const date = d.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
  return `${date} · ${time}`;
}

function formatFaultExact(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false });
  const date = d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "numeric" });
  return `${date} · ${time}`;
}

function faultDayLabel(day: string) {
  const today = todayISO();
  if (day === today) return "היום";
  if (day === addDays(today, -1)) return "אתמול";
  const d = new Date(`${day}T00:00:00`);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const weekday = d.toLocaleDateString("he-IL", { weekday: "long" });
  const date = d.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "numeric",
    ...(sameYear ? {} : { year: "numeric" as const }),
  });
  return `${weekday} · ${date}`;
}

type FaultDayGroup = { day: string; label: string; items: Fault[] };

function groupFaultsByDay(list: Fault[]): FaultDayGroup[] {
  const groups: FaultDayGroup[] = [];
  for (const f of list) {
    const day = faultDay(f.created_at);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(f);
    else groups.push({ day, label: faultDayLabel(day), items: [f] });
  }
  return groups;
}

function faultsHeroSummary(needsHandling: number, inProgress: number) {
  if (!needsHandling && !inProgress) return "אין תקלות פתוחות · הכל טופל";
  const parts: string[] = [];
  if (needsHandling) parts.push(needsHandling === 1 ? "תקלה אחת דורשת טיפול" : `${needsHandling} תקלות דורשות טיפול`);
  if (inProgress) parts.push(inProgress === 1 ? "אחת בטיפול" : `${inProgress} בטיפול`);
  return parts.join(" · ");
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
          <span className="fault-media-scrim" aria-hidden />
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

function FaultRowMobile({
  fault,
  reporterName,
  index,
  expanded,
  onToggle,
  statusPending,
  onStatusChange,
}: {
  fault: Fault;
  reporterName?: string;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  statusPending: boolean;
  onStatusChange: (s: FaultStatus) => void;
}) {
  const meta = STATUS_META[fault.status];
  const mediaUrls = fault.photo_urls ?? [];
  const cover = mediaUrls[0];

  return (
    <article
      className="fault-row"
      data-tone={meta.tone}
      data-expanded={expanded}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <button type="button" className="fault-row__head" onClick={onToggle} aria-expanded={expanded}>
        <span className="fault-row__edge" aria-hidden />

        {cover ? (
          <span className="fault-row__thumb">
            {isVideoUrl(cover) ? (
              <>
                <video src={cover} muted playsInline preload="metadata" />
                <span className="fault-row__thumb-play">
                  <Icon name="play_arrow" size={20} />
                </span>
              </>
            ) : (
              <img src={cover} alt="" loading="lazy" />
            )}
            {mediaUrls.length > 1 && (
              <span className="fault-row__thumb-count">
                <Icon name="photo_library" size={10} />
                {mediaUrls.length}
              </span>
            )}
          </span>
        ) : (
          <span className="fault-row__thumb fault-row__thumb--icon">
            <Icon name={meta.icon} size={22} />
          </span>
        )}

        <span className="fault-row__copy">
          <span className="fault-row__title">{fault.description}</span>
          <span className="fault-row__meta">
            <span className="fault-row__pill">
              <span className="fault-row__pill-dot" aria-hidden />
              {meta.label}
            </span>
            <span className="fault-row__meta-sep" aria-hidden>
              ·
            </span>
            <time dateTime={fault.created_at}>{formatFaultTimeRelative(fault.created_at)}</time>
            {reporterName && (
              <>
                <span className="fault-row__meta-sep" aria-hidden>
                  ·
                </span>
                <span className="fault-row__meta-reporter">{reporterName}</span>
              </>
            )}
          </span>
        </span>

        <span className="fault-row__chevron" aria-hidden>
          <Icon name="expand_more" size={19} />
        </span>
      </button>

      <div className="fault-row__panel">
        <div className="fault-row__panel-inner">
          {mediaUrls.length > 0 && <FaultMediaCarousel urls={mediaUrls} tall />}
          <div className="fault-row__details">
            <div className="fault-row__stamp">
              <Icon name="schedule" size={14} />
              <span>{formatFaultExact(fault.created_at)}</span>
              {reporterName && (
                <>
                  <span className="fault-row__meta-sep" aria-hidden>
                    ·
                  </span>
                  <Icon name="person" size={14} />
                  <span>{reporterName}</span>
                </>
              )}
            </div>
            <div className="fault-row__seg">
              <span className="fault-row__seg-label">עדכון סטטוס</span>
              <FaultStatusSegmented value={fault.status} solid disabled={statusPending} onChange={onStatusChange} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function FaultsFilterBar({
  total,
  visibleCount,
  counts,
  filter,
  onFilterChange,
  datePreset,
  onDatePresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  onClear,
  hasActiveFilters,
}: {
  total: number;
  visibleCount: number;
  counts: Record<FaultStatus, number>;
  filter: FaultStatus | null;
  onFilterChange: (s: FaultStatus | null) => void;
  datePreset: DatePreset;
  onDatePresetChange: (p: DatePreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
}) {
  const dateFilteredTotal = counts.needs_handling + counts.in_progress + counts.handled;

  return (
    <div className="faults-filter-bar">
      <div className="faults-filter-bar__row">
        <span className="faults-filter-bar__label">
          <Icon name="calendar_today" size={15} />
          תאריך
        </span>
        <div className="faults-filter-bar__chips faults-filter-bar__chips--scroll" role="group" aria-label="סינון לפי תאריך">
          {DATE_PRESETS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className="faults-filter-chip"
              data-active={datePreset === key}
              onClick={() => onDatePresetChange(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {datePreset === "custom" && (
        <div className="faults-filter-bar__range">
          <Input
            type="date"
            value={customFrom}
            onChange={(e) => onCustomFromChange(e.target.value)}
            className="faults-filter-bar__date"
            aria-label="מתאריך"
          />
          <span className="faults-filter-bar__range-sep">עד</span>
          <Input
            type="date"
            value={customTo}
            onChange={(e) => onCustomToChange(e.target.value)}
            className="faults-filter-bar__date"
            aria-label="עד תאריך"
          />
        </div>
      )}

      <div className="faults-filter-bar__row">
        <span className="faults-filter-bar__label">
          <Icon name="tune" size={15} />
          סטטוס
        </span>
        <div className="faults-filter-bar__chips faults-filter-bar__chips--scroll" role="group" aria-label="סינון לפי סטטוס">
          <button
            type="button"
            className="faults-filter-chip"
            data-active={filter === null}
            onClick={() => onFilterChange(null)}
          >
            הכל
            <span className="faults-filter-chip__count">{dateFilteredTotal}</span>
          </button>
          {STATUS_ORDER.map((s) => {
            const m = STATUS_META[s];
            return (
              <button
                key={s}
                type="button"
                className="faults-filter-chip"
                data-active={filter === s}
                data-tone={m.tone}
                onClick={() => onFilterChange(filter === s ? null : s)}
              >
                <Icon name={m.icon} size={14} />
                {m.label}
                <span className="faults-filter-chip__count">{counts[s]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="faults-filter-bar__meta">
        <span className="faults-filter-bar__result">
          {visibleCount === total ? `${total} תקלות` : `${visibleCount} מתוך ${total} תקלות`}
        </span>
        {hasActiveFilters && (
          <button type="button" className="faults-filter-bar__clear" onClick={onClear}>
            <Icon name="filter_alt_off" size={15} />
            נקה סינון
          </button>
        )}
      </div>
    </div>
  );
}

export function Faults() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: faults, isLoading, isError, refetch } = useFaults(businessId);
  const { data: profiles } = useProfiles(businessId);
  const createFault = useCreateFault();
  const updateFault = useUpdateFault(businessId);
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [media, setMedia] = useState<MediaEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FaultStatus | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef(media);
  mediaRef.current = media;

  useEffect(() => () => revokeMediaEntries(mediaRef.current), []);

  const reporterById = useMemo(() => {
    const map = new Map<string, string>();
    (profiles ?? []).forEach((p) => map.set(p.id, p.full_name ?? "משתמש"));
    return map;
  }, [profiles]);

  const canReport = profile?.role !== "maintenance";

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const total = (faults ?? []).length;
  const { from: dateFrom, to: dateTo } = resolveDateRange(datePreset, customFrom, customTo);
  const dateFiltered = (faults ?? []).filter((f) => matchesDateRange(f.created_at, dateFrom, dateTo));

  const counts = { needs_handling: 0, in_progress: 0, handled: 0 } as Record<FaultStatus, number>;
  dateFiltered.forEach((f) => (counts[f.status] += 1));

  const visible = dateFiltered.filter((f) => (filter ? f.status === filter : true));
  const hasActiveFilters = filter !== null || datePreset !== "all";

  const openNeedsHandling = (faults ?? []).filter((f) => f.status === "needs_handling").length;
  const openInProgress = (faults ?? []).filter((f) => f.status === "in_progress").length;
  const dayGroups = groupFaultsByDay(visible);
  const indexById = new Map(visible.map((f, i) => [f.id, i]));

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

  function clearFilters() {
    setFilter(null);
    setDatePreset("all");
    setCustomFrom("");
    setCustomTo("");
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

  const filterBar = (
    <FaultsFilterBar
      total={total}
      visibleCount={visible.length}
      counts={counts}
      filter={filter}
      onFilterChange={setFilter}
      datePreset={datePreset}
      onDatePresetChange={setDatePreset}
      customFrom={customFrom}
      customTo={customTo}
      onCustomFromChange={setCustomFrom}
      onCustomToChange={setCustomTo}
      onClear={clearFilters}
      hasActiveFilters={hasActiveFilters}
    />
  );

  return (
    <div className="w-full animate-fadeUp">
      {/* ── Mobile ── */}
      <div className="faults-mobile md:hidden">
        <header className="faults-hero">
          <span className="faults-hero__icon">
            <Icon name="handyman" size={22} />
          </span>
          <div className="faults-hero__copy">
            <h1 className="faults-hero__title">תקלות</h1>
            <p className="faults-hero__sub">{faultsHeroSummary(openNeedsHandling, openInProgress)}</p>
          </div>
        </header>

        <div className="faults-tiles" role="group" aria-label="סינון לפי סטטוס">
          {STATUS_ORDER.map((s) => {
            const m = STATUS_META[s];
            return (
              <button
                key={s}
                type="button"
                className="faults-tile"
                data-tone={m.tone}
                data-active={filter === s}
                data-alert={s === "needs_handling" && counts[s] > 0}
                aria-pressed={filter === s}
                onClick={() => setFilter(filter === s ? null : s)}
              >
                <span className="faults-tile__icon">
                  <Icon name={m.icon} size={17} />
                </span>
                <span className="faults-tile__count">{counts[s]}</span>
                <span className="faults-tile__label">{m.label}</span>
              </button>
            );
          })}
        </div>

        <div className="faults-date-row" role="group" aria-label="סינון לפי תאריך">
          <span className="faults-date-row__icon" aria-hidden>
            <Icon name="calendar_today" size={14} />
          </span>
          {DATE_PRESETS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className="faults-filter-chip"
              data-active={datePreset === key}
              onClick={() => setDatePreset(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {datePreset === "custom" && (
          <div className="faults-filter-bar__range">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="faults-filter-bar__date"
              aria-label="מתאריך"
            />
            <span className="faults-filter-bar__range-sep">עד</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="faults-filter-bar__date"
              aria-label="עד תאריך"
            />
          </div>
        )}

        {hasActiveFilters && (
          <div className="faults-results">
            <span className="faults-results__count">
              {visible.length === total ? `${total} תקלות` : `${visible.length} מתוך ${total} תקלות`}
            </span>
            <button type="button" className="faults-filter-bar__clear" onClick={clearFilters}>
              <Icon name="filter_alt_off" size={15} />
              נקה סינון
            </button>
          </div>
        )}

        {visible.length === 0 ? (
          <EmptyState
            icon="build"
            title={hasActiveFilters ? "אין תקלות בסינון זה" : "אין תקלות"}
            description={hasActiveFilters ? "נסו לשנות את הסינון או להציג הכל." : "כל הכבוד! לא דווחו תקלות."}
          />
        ) : (
          <div className="faults-feed">
            {dayGroups.map((group) => (
              <section key={group.day} className="faults-day">
                <header className="faults-day__head">
                  <span className="faults-day__label">{group.label}</span>
                  <span className="faults-day__count">{group.items.length}</span>
                  <span className="faults-day__line" aria-hidden />
                </header>
                <div className="faults-day__list">
                  {group.items.map((f) => (
                    <FaultRowMobile
                      key={f.id}
                      fault={f}
                      reporterName={f.reported_by ? reporterById.get(f.reported_by) : undefined}
                      index={indexById.get(f.id) ?? 0}
                      expanded={expandedId === f.id}
                      onToggle={() => setExpandedId((prev) => (prev === f.id ? null : f.id))}
                      statusPending={updateFault.isPending}
                      onStatusChange={(status) => onStatusChange(f.id, status, f.status)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {canReport && (
          <button type="button" className="faults-fab" onClick={() => setOpen(true)}>
            <Icon name="add_a_photo" size={20} />
            <span>דיווח תקלה</span>
          </button>
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

        <div className="mb-5">{filterBar}</div>

        {visible.length === 0 ? (
          <EmptyState
            icon="build"
            title={hasActiveFilters ? "אין תקלות בסינון זה" : "אין תקלות"}
            description={hasActiveFilters ? "נסו לשנות את הסינון או להציג הכל." : "כל הכבוד! לא דווחו תקלות."}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((f) => {
              const meta = STATUS_META[f.status];
              const mediaUrls = f.photo_urls ?? [];
              const reporterName = f.reported_by ? reporterById.get(f.reported_by) : undefined;
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
                    {reporterName && (
                      <div className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-text-3">
                        <Icon name="person" size={14} />
                        דווח על ידי {reporterName}
                      </div>
                    )}
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
