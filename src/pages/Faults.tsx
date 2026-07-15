import { useEffect, useMemo, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { Button, Card, EmptyState, Icon, Input, PageLoader, ErrorState, Field, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useProfiles } from "@/api/users";
import { useAuth } from "@/lib/auth";
import { addDays, todayISO, toISODate, useBusinessId } from "@/lib/db";
import { isVideoFile, isVideoUrl } from "@/lib/media";
import { useFaults, useCreateFault, useUpdateFault, useDeleteFault, uploadFaultPhotos } from "@/api/faults";
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

function canModifyFault(fault: Fault, profileId?: string | null, role?: string | null) {
  if (!profileId) return false;
  if (role === "manager" || role === "shift_manager" || role === "office_manager") return true;
  return fault.reported_by === profileId;
}

function FaultActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fault-actions">
      <button type="button" className="fault-actions__btn" onClick={onEdit} aria-label="עריכת תקלה">
        <Icon name="edit" size={17} />
      </button>
      <button
        type="button"
        className="fault-actions__btn fault-actions__btn--danger"
        onClick={onDelete}
        aria-label="מחיקת תקלה"
      >
        <Icon name="delete" size={17} />
      </button>
    </div>
  );
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
  canModify,
  onEdit,
  onDelete,
}: {
  fault: Fault;
  reporterName?: string;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  statusPending: boolean;
  onStatusChange: (s: FaultStatus) => void;
  canModify?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
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
      <div className="fault-row__head">
        <span className="fault-row__edge" aria-hidden />

        <button type="button" className="fault-row__hit" onClick={onToggle} aria-expanded={expanded}>
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
        </button>

        {canModify && onEdit && onDelete && <FaultActions onEdit={onEdit} onDelete={onDelete} />}

        <button
          type="button"
          className="fault-row__chevron"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? "סגירה" : "פתיחה"}
        >
          <Icon name="expand_more" size={19} />
        </button>
      </div>

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

function FaultFormMedia({
  fileRef,
  media,
  existingPhotos,
  onFileChange,
  onRemoveMedia,
  onRemoveExisting,
  onPickFiles,
}: {
  fileRef: RefObject<HTMLInputElement>;
  media: MediaEntry[];
  existingPhotos?: string[];
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemoveMedia: (index: number) => void;
  onRemoveExisting?: (index: number) => void;
  onPickFiles: () => void;
}) {
  const existing = existingPhotos ?? [];
  const hasMedia = existing.length > 0 || media.length > 0;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={onFileChange}
      />

      {!hasMedia ? (
        <button
          type="button"
          onClick={onPickFiles}
          className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-[13px] border border-dashed border-border bg-surface-2 text-text-3 hover:border-accent-2 hover:text-ink"
        >
          <Icon name="perm_media" size={34} />
          <span className="text-[13.5px] font-semibold">צילום או העלאת תמונות וסרטונים</span>
          <span className="text-[12px]">ניתן לבחור כמה קבצים · הקבצים יכווצו לפני העלאה</span>
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            {existing.map((url, i) => (
              <div key={url} className="relative aspect-square overflow-hidden rounded-[11px] border border-border bg-surface-2">
                {isVideoUrl(url) ? (
                  <>
                    <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                    <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/30 text-white">
                      <Icon name="play_circle" size={28} />
                    </span>
                  </>
                ) : (
                  <img src={url} alt={`תמונה ${i + 1}`} className="h-full w-full object-cover" />
                )}
                {onRemoveExisting && (
                  <button
                    type="button"
                    onClick={() => onRemoveExisting(i)}
                    className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    aria-label="הסרת קובץ"
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
              </div>
            ))}
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
                  onClick={() => onRemoveMedia(i)}
                  className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  aria-label="הסרת קובץ"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={onPickFiles}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[11px] border border-dashed border-border bg-surface-2 text-text-3 hover:border-accent-2 hover:text-ink"
            >
              <Icon name="add" size={24} />
              <span className="text-[11px] font-semibold">הוספה</span>
            </button>
          </div>
          <div className="text-[12px] text-text-3">
            {existing.length + media.length} קבצים
            {media.some((m) => m.isVideo) || existing.some((u) => isVideoUrl(u))
              ? media.some((m) => !m.isVideo) || existing.some((u) => !isVideoUrl(u))
                ? " · תמונות וסרטונים"
                : " · סרטונים"
              : " · תמונות"}
          </div>
        </div>
      )}
    </>
  );
}

function FaultsToolbar({
  search,
  onSearchChange,
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
  onReport,
}: {
  search: string;
  onSearchChange: (v: string) => void;
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
  onReport?: () => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const dateFilteredTotal = counts.needs_handling + counts.in_progress + counts.handled;

  return (
    <>
      <div className="faults-searchbar">
        <label className="faults-searchbar__field">
          <Icon name="search" size={19} className="faults-searchbar__icon" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="חיפוש תקלה..."
            className="faults-searchbar__input"
            aria-label="חיפוש תקלה"
          />
          {search && (
            <button
              type="button"
              className="faults-searchbar__clear"
              onClick={() => onSearchChange("")}
              aria-label="נקה חיפוש"
            >
              <Icon name="close" size={15} />
            </button>
          )}
        </label>

        <button
          type="button"
          className="faults-searchbar__icon-btn"
          data-active={hasActiveFilters}
          aria-label="סינון"
          aria-expanded={filterOpen}
          onClick={() => setFilterOpen(true)}
        >
          <Icon name="tune" size={20} />
          {hasActiveFilters && <span className="faults-searchbar__badge" aria-hidden />}
        </button>

        {onReport && (
          <button
            type="button"
            className="faults-searchbar__icon-btn faults-searchbar__icon-btn--accent hidden md:grid"
            aria-label="דיווח תקלה"
            onClick={onReport}
          >
            <Icon name="add_a_photo" size={20} />
          </button>
        )}
      </div>

      <Modal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="סינון תקלות"
        icon="tune"
        subtitle="לפי סטטוס ותאריך"
        footer={
          <>
            {hasActiveFilters && (
              <Button variant="secondary" onClick={onClear}>
                נקה הכל
              </Button>
            )}
            <Button className="flex-1" onClick={() => setFilterOpen(false)}>
              הצג {visibleCount} תקלות
            </Button>
          </>
        }
      >
        <div className="faults-filter-sheet">
          <div className="faults-filter-sheet__section">
            <span className="faults-filter-sheet__label">סטטוס</span>
            <div className="faults-filter-sheet__grid" role="group" aria-label="סינון לפי סטטוס">
              <button
                type="button"
                className="faults-filter-sheet__opt"
                data-active={filter === null}
                onClick={() => onFilterChange(null)}
              >
                <span className="faults-filter-sheet__opt-main">הכל</span>
                <span className="faults-filter-sheet__opt-count">{dateFilteredTotal}</span>
              </button>
              {STATUS_ORDER.map((s) => {
                const m = STATUS_META[s];
                return (
                  <button
                    key={s}
                    type="button"
                    className="faults-filter-sheet__opt"
                    data-active={filter === s}
                    data-tone={m.tone}
                    onClick={() => onFilterChange(filter === s ? null : s)}
                  >
                    <Icon name={m.icon} size={16} />
                    <span className="faults-filter-sheet__opt-main">{m.label}</span>
                    <span className="faults-filter-sheet__opt-count">{counts[s]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="faults-filter-sheet__section">
            <span className="faults-filter-sheet__label">תאריך</span>
            <div className="faults-filter-sheet__grid" role="group" aria-label="סינון לפי תאריך">
              {DATE_PRESETS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className="faults-filter-sheet__opt"
                  data-active={datePreset === key}
                  onClick={() => onDatePresetChange(key)}
                >
                  {key === "custom" && <Icon name="calendar_today" size={15} />}
                  <span className="faults-filter-sheet__opt-main">{label}</span>
                </button>
              ))}
            </div>

            {datePreset === "custom" && (
              <div className="faults-filter-sheet__range">
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
          </div>
        </div>
      </Modal>
    </>
  );
}

export function Faults() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: faults, isLoading, isError, refetch } = useFaults(businessId);
  const { data: profiles } = useProfiles(businessId);
  const createFault = useCreateFault();
  const updateFault = useUpdateFault(businessId);
  const deleteFault = useDeleteFault(businessId);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingFault, setEditingFault] = useState<Fault | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Fault | null>(null);
  const [desc, setDesc] = useState("");
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [media, setMedia] = useState<MediaEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FaultStatus | null>(null);
  const [search, setSearch] = useState("");
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

  const { from: dateFrom, to: dateTo } = resolveDateRange(datePreset, customFrom, customTo);
  const dateFiltered = (faults ?? []).filter((f) => matchesDateRange(f.created_at, dateFrom, dateTo));

  const counts = { needs_handling: 0, in_progress: 0, handled: 0 } as Record<FaultStatus, number>;
  dateFiltered.forEach((f) => (counts[f.status] += 1));

  const searchQ = search.trim().toLowerCase();
  const visible = dateFiltered.filter((f) => {
    if (filter && f.status !== filter) return false;
    if (!searchQ) return true;
    const reporter = f.reported_by ? reporterById.get(f.reported_by) ?? "" : "";
    return f.description.toLowerCase().includes(searchQ) || reporter.toLowerCase().includes(searchQ);
  });
  const hasActiveFilters = filter !== null || datePreset !== "all";
  const hasListFilters = hasActiveFilters || !!searchQ;

  const dayGroups = groupFaultsByDay(visible);
  const indexById = new Map(visible.map((f, i) => [f.id, i]));

  function resetForm() {
    setDesc("");
    setExistingPhotos([]);
    setMedia((prev) => {
      revokeMediaEntries(prev);
      return [];
    });
    setError(null);
  }

  function openEdit(fault: Fault) {
    setEditingFault(fault);
    setDesc(fault.description);
    setExistingPhotos(fault.photo_urls ?? []);
    setMedia([]);
    setError(null);
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditingFault(null);
    resetForm();
  }

  function openDelete(fault: Fault) {
    setDeleteTarget(fault);
    setError(null);
    setDeleteOpen(true);
  }

  function closeDelete() {
    setDeleteOpen(false);
    setDeleteTarget(null);
    setError(null);
  }

  function removeExistingPhoto(index: number) {
    setExistingPhotos((prev) => prev.filter((_, i) => i !== index));
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

  async function submitEdit() {
    if (!editingFault) return;
    setError(null);
    if (!desc.trim()) return setError("נא לתאר את התקלה");
    setBusy(true);
    try {
      const uploaded = media.length ? await uploadFaultPhotos(businessId!, media.map((m) => m.file)) : [];
      await updateFault.mutateAsync({
        id: editingFault.id,
        description: desc.trim(),
        photo_urls: [...existingPhotos, ...uploaded],
      });
      closeEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בעדכון התקלה");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteFault.mutateAsync(deleteTarget.id);
      if (expandedId === deleteTarget.id) setExpandedId(null);
      closeDelete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה במחיקת התקלה");
    } finally {
      setBusy(false);
    }
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
        <FaultFormMedia
          fileRef={fileRef}
          media={media}
          onFileChange={handleFileChange}
          onRemoveMedia={removeMedia}
          onPickFiles={() => fileRef.current?.click()}
        />
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

  const editModal = (
    <Modal
      open={editOpen}
      onClose={closeEdit}
      title="עריכת תקלה"
      icon="edit"
      footer={
        <>
          <Button variant="secondary" onClick={closeEdit}>
            ביטול
          </Button>
          <Button className="flex-1" loading={busy} onClick={submitEdit}>
            שמירת שינויים
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <FaultFormMedia
          fileRef={fileRef}
          media={media}
          existingPhotos={existingPhotos}
          onFileChange={handleFileChange}
          onRemoveMedia={removeMedia}
          onRemoveExisting={removeExistingPhoto}
          onPickFiles={() => fileRef.current?.click()}
        />
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

  const deleteModal = (
    <Modal
      open={deleteOpen}
      onClose={closeDelete}
      title="מחיקת תקלה"
      icon="delete"
      footer={
        <>
          <Button variant="secondary" onClick={closeDelete}>
            ביטול
          </Button>
          <Button className="flex-1" loading={busy} onClick={confirmDelete}>
            מחיקה
          </Button>
        </>
      }
    >
      <p className="text-[14px] leading-relaxed text-text-2">
        למחוק את התקלה
        {deleteTarget ? ` "${deleteTarget.description.slice(0, 60)}${deleteTarget.description.length > 60 ? "…" : ""}"` : ""}?
        פעולה זו לא ניתנת לביטול.
      </p>
      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
          <Icon name="error" size={18} /> {error}
        </div>
      )}
    </Modal>
  );

  const toolbar = (
    <FaultsToolbar
      search={search}
      onSearchChange={setSearch}
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
      onReport={canReport ? () => setOpen(true) : undefined}
    />
  );

  const faultList = visible.length === 0 ? (
    <EmptyState
      icon="build"
      title={hasListFilters ? "אין תקלות בסינון זה" : "אין תקלות"}
      description={
        hasListFilters ? "נסו לשנות את החיפוש או הסינון." : "כל הכבוד! לא דווחו תקלות."
      }
    />
  ) : (
    <>
      <div className="faults-feed md:hidden">
        {dayGroups.map((group) => (
          <section key={group.day} className="faults-day">
            <header className="faults-day__head">
              <span className="faults-day__label">{group.label}</span>
              <span className="faults-day__count">{group.items.length}</span>
              <span className="faults-day__line" aria-hidden />
            </header>
            <div className="faults-day__list">
              {group.items.map((f) => {
                const modifiable = canModifyFault(f, profile?.id, profile?.role);
                return (
                  <FaultRowMobile
                    key={f.id}
                    fault={f}
                    reporterName={f.reported_by ? reporterById.get(f.reported_by) : undefined}
                    index={indexById.get(f.id) ?? 0}
                    expanded={expandedId === f.id}
                    onToggle={() => setExpandedId((prev) => (prev === f.id ? null : f.id))}
                    statusPending={updateFault.isPending}
                    onStatusChange={(status) => onStatusChange(f.id, status, f.status)}
                    canModify={modifiable}
                    onEdit={modifiable ? () => openEdit(f) : undefined}
                    onDelete={modifiable ? () => openDelete(f) : undefined}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-3">
        {visible.map((f) => {
          const meta = STATUS_META[f.status];
          const mediaUrls = f.photo_urls ?? [];
          const reporterName = f.reported_by ? reporterById.get(f.reported_by) : undefined;
          const modifiable = canModifyFault(f, profile?.id, profile?.role);
          return (
            <Card key={f.id} className="flex flex-col overflow-hidden p-0">
              <div className="h-1.5" style={{ background: meta.color }} />
              <FaultMediaCarousel urls={mediaUrls} />
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-bold leading-snug">{f.description}</div>
                    <div className="mt-1.5 text-[12px] text-text-3">{formatFaultTime(f.created_at)}</div>
                    {reporterName && (
                      <div className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-text-3">
                        <Icon name="person" size={14} />
                        דווח על ידי {reporterName}
                      </div>
                    )}
                  </div>
                  {modifiable && <FaultActions onEdit={() => openEdit(f)} onDelete={() => openDelete(f)} />}
                </div>
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
    </>
  );

  return (
    <div className="w-full animate-fadeUp">
      <div className="faults-mobile md:pb-0">
        {toolbar}
        {faultList}
        {canReport && (
          <button type="button" className="faults-fab md:hidden" onClick={() => setOpen(true)}>
            <Icon name="add_a_photo" size={20} />
            <span>דיווח תקלה</span>
          </button>
        )}
      </div>

      {reportModal}
      {editModal}
      {deleteModal}
    </div>
  );
}
