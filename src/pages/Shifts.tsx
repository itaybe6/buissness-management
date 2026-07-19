import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Badge, Card, EmptyState, ErrorState, Icon, PageLoader } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useBusinessId, HE_DAYS, addDays, formatDateShort, weekStart, todayISO, colorFor, initialsOf } from "@/lib/db";
import { useDepartments } from "@/api/departments";
import { useBusiness } from "@/api/businesses";
import { useProfiles } from "@/api/users";
import {
  useActiveShiftTemplates,
  useShiftPreferences,
  useSetPreference,
  useClearPreference,
  useShiftAssignments,
  useAddAssignment,
  useRemoveAssignment,
} from "@/api/shifts";
import { useIsMdUp } from "@/hooks/useMediaQuery";
import { SCHEDULER_ROLES } from "@/lib/constants";
import {
  formatShiftPrefsClose,
  formatShiftPrefsCloseRule,
  formatShiftPrefsOpen,
  formatShiftPrefsWindowRule,
  getShiftPrefsWindowStatus,
  isShiftPrefsOpenForWeek,
} from "@/lib/shift-deadline";
import {
  formatShiftPrefsMinimumSummary,
  getShiftPrefsMinimumStatus,
  hasShiftPrefsMinimumRules,
  isShiftPrefsDayComplete,
} from "@/lib/shift-prefs-minimum";
import {
  MAX_ASSIGNED_DAYS_PER_WEEK,
  canAssignEmployeeOnDate,
  countAssignedDaysInWeek,
  weekStartFromDateISO,
} from "@/lib/shift-assignment-limits";
import { getHebrewDayInfo } from "@/lib/hebrewCalendar";
import type { Availability, Profile, ShiftAssignment } from "@/types/database";

const AVAIL_META: Record<"available" | "cannot", { label: string; short: string; bg: string; color: string; border: string }> = {
  available: { label: "יכול", short: "יכול", bg: "var(--info-bg)", color: "var(--info)", border: "#bcd0ff" },
  cannot: { label: "לא יכול", short: "לא", bg: "var(--danger-bg)", color: "var(--danger)", border: "#f6caca" },
};

const PREF_STATUS: Record<"available" | "cannot" | "none", { label: string; color: string }> = {
  available: { label: "יכול", color: "var(--info)" },
  cannot: { label: "לא יכול", color: "var(--danger)" },
  none: { label: "לא סימן עדיין", color: "var(--text-3)" },
};

function normalizeAvailability(pref: Availability | undefined): Availability | null {
  if (!pref || pref === "prefer") return pref === "prefer" ? "available" : null;
  return pref;
}

export function Shifts() {
  const { profile } = useAuth();
  const isScheduler = profile && SCHEDULER_ROLES.includes(profile.role);
  return isScheduler ? <SchedulerView /> : <EmployeeView />;
}

function colorDotStyle(color: string | null | undefined, ring = 3): CSSProperties {
  const c = color ?? "#fdab3d";
  return {
    background: c,
    boxShadow: `0 0 0 ${ring}px color-mix(in srgb, ${c} 28%, transparent)`,
  };
}

function dayMeta(wk: string, index: number) {
  const date = addDays(wk, index);
  const today = todayISO();
  const hebrew = getHebrewDayInfo(date);
  return {
    date,
    isToday: date === today,
    isWeekend: index >= 5,
    hebrewDate: hebrew.hebrewDate,
    holiday: hebrew.holiday,
    isMajorHoliday: hebrew.isMajor,
  };
}

function ShiftDayHead({
  name,
  meta,
  children,
}: {
  name: string;
  meta: ReturnType<typeof dayMeta>;
  children?: ReactNode;
}) {
  const title = meta.holiday ? `${meta.hebrewDate} · ${meta.holiday}` : meta.hebrewDate;
  return (
    <div
      className="shift-grid-day"
      data-today={meta.isToday}
      data-weekend={meta.isWeekend}
      data-holiday={!!meta.holiday}
      data-major-holiday={meta.isMajorHoliday}
      title={title}
    >
      <span className="shift-grid-day-name">{name}</span>
      <span className="shift-grid-day-date">{formatDateShort(meta.date)}</span>
      <span className="shift-grid-day-hebrew">{meta.hebrewDate}</span>
      {meta.holiday && <span className="shift-grid-day-holiday">{meta.holiday}</span>}
      {meta.isToday && <span className="shift-grid-day-today">היום</span>}
      {children}
    </div>
  );
}

function SelectedDayHolidayNote({ wk, dayIdx }: { wk: string; dayIdx: number }) {
  const meta = dayMeta(wk, dayIdx);
  if (!meta.holiday) return null;
  return (
    <div className="shift-day-holiday-note" data-major-holiday={meta.isMajorHoliday}>
      <Icon name="event" size={16} />
      <span>
        {HE_DAYS[dayIdx]} · {meta.hebrewDate} · <strong>{meta.holiday}</strong>
      </span>
    </div>
  );
}

function todayIdxInWeek(wk: string) {
  const t = todayISO();
  for (let i = 0; i < 7; i++) if (addDays(wk, i) === t) return i;
  return 0;
}

function shiftTimeIcon(start?: string | null) {
  const h = Number((start ?? "").slice(0, 2));
  if (Number.isNaN(h)) return "schedule";
  if (h >= 5 && h < 11) return "wb_sunny";
  if (h >= 11 && h < 16) return "light_mode";
  if (h >= 16 && h < 21) return "wb_twilight";
  return "bedtime";
}

function shiftDurationLabel(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  const hrs = mins / 60;
  return `${Number.isInteger(hrs) ? hrs : hrs.toFixed(1)} שע׳`;
}

/* Circular week-progress ring for the availability hero */
function ProgressRing({ pct, done }: { pct: number; done: boolean }) {
  const r = 25;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="prefs2-ring" data-done={done}>
      <svg viewBox="0 0 60 60" aria-hidden="true">
        <circle className="prefs2-ring-track" cx="30" cy="30" r={r} />
        <circle
          className="prefs2-ring-fill"
          cx="30"
          cy="30"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
        />
      </svg>
      <span className="prefs2-ring-label">{done ? <Icon name="check" size={22} /> : `${Math.round(clamped)}%`}</span>
    </div>
  );
}

function WeekNav({
  wkStart,
  onShift,
  onToday,
  maxWeekStart,
}: {
  wkStart: string;
  onShift: (d: number) => void;
  onToday?: () => void;
  /** When set, blocks navigating past this week (ISO Sunday). */
  maxWeekStart?: string;
}) {
  const end = addDays(wkStart, 6);
  const isCurrentWeek = wkStart === weekStart();
  const atMax = maxWeekStart != null && wkStart >= maxWeekStart;
  return (
    <div className="shift-week-nav-group">
      <div className="shift-week-nav">
        <button type="button" onClick={() => onShift(7)} className="shift-week-nav-btn" aria-label="שבוע קודם">
          <Icon name="chevron_right" size={20} />
        </button>
        <span className="shift-week-nav-label">{formatDateShort(wkStart)} – {formatDateShort(end)}</span>
        <button
          type="button"
          onClick={() => onShift(-7)}
          className="shift-week-nav-btn"
          aria-label="שבוע הבא"
          disabled={atMax}
        >
          <Icon name="chevron_left" size={20} />
        </button>
      </div>
      {onToday && !isCurrentWeek && (
        <button type="button" onClick={onToday} className="shift-week-today">
          היום
        </button>
      )}
    </div>
  );
}

function ShiftLegend() {
  return (
    <div className="shift-toolbar-meta">
      <span className="shift-legend-chip" data-tone="available">{AVAIL_META.available.label}</span>
      <span className="shift-legend-chip" data-tone="cannot">{AVAIL_META.cannot.label}</span>
    </div>
  );
}

function ShiftPageHero({
  title,
  subtitle,
  stats,
}: {
  title: string;
  subtitle: string;
  stats?: ReactNode;
}) {
  return (
    <header className="page-hero page-hero--plain">
      <div className="page-hero-inner">
        <div>
          <h1 className="page-hero-title">{title}</h1>
          <p className="page-hero-sub">{subtitle}</p>
        </div>
        {stats && <div className="page-hero-stats">{stats}</div>}
      </div>
    </header>
  );
}

/* Mobile day selector — 7 pills with a spring-animated active thumb */
function DayStrip({
  wk,
  value,
  onChange,
  stripId,
  dayComplete,
}: {
  wk: string;
  value: number;
  onChange: (i: number) => void;
  stripId: string;
  dayComplete?: (dayIndex: number) => boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="shift-day-strip">
      {HE_DAYS.map((d, i) => {
        const meta = dayMeta(wk, i);
        const active = i === value;
        const pillTitle = meta.holiday ? `${meta.hebrewDate} · ${meta.holiday}` : meta.hebrewDate;
        return (
          <button
            key={i}
            type="button"
            className="shift-day-pill"
            data-active={active}
            data-holiday={!!meta.holiday}
            data-major-holiday={meta.isMajorHoliday}
            title={pillTitle}
            onClick={() => onChange(i)}
            aria-pressed={active}
          >
            {active && (
              <motion.span
                layoutId={`day-pill-${stripId}`}
                className="shift-day-pill-bg"
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <span className="shift-day-pill-name">{d}</span>
            <span className="shift-day-pill-date">{meta.date.slice(8, 10)}</span>
            <span className="shift-day-pill-inds">
              {meta.isToday && <span className="shift-day-pill-dot" />}
              {meta.holiday && !meta.isToday && <span className="shift-day-pill-holiday-dot" aria-hidden />}
              {dayComplete?.(i) && (
                <span className="shift-day-pill-check">
                  <Icon name="check" size={11} />
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* Assignment chip — springs in on add, shrinks away on remove */
function AssignChip({
  employeeId,
  name,
  onRemove,
}: {
  employeeId: string;
  name?: string | null;
  onRemove: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, scale: 0.8, y: 5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 480, damping: 32 }}
      className="shift-assign-chip group"
    >
      <span className="shift-assign-avatar" style={{ background: colorFor(employeeId) }}>
        {initialsOf(name)}
      </span>
      <span className="shift-assign-name">{name?.split(" ")[0]}</span>
      <button type="button" onClick={onRemove} className="shift-assign-remove" aria-label="הסר שיבוץ">
        <Icon name="close" size={14} />
      </button>
    </motion.div>
  );
}

/* ------------------------------- Employee ------------------------------- */
function EmployeeView() {
  const businessId = useBusinessId();
  const isDesktop = useIsMdUp();
  const { profile } = useAuth();
  const { data: templates, isLoading } = useActiveShiftTemplates(businessId);
  // Warm the child queries in parallel with templates (same keys as
  // EmployeeSchedule/EmployeeConstraints) — avoids a fetch waterfall on mobile.
  useShiftAssignments(businessId, weekStart(), addDays(weekStart(), 6), profile?.id);
  useShiftPreferences(businessId, addDays(weekStart(), 7), profile?.id);

  if (isLoading) return <PageLoader />;
  if (!templates || templates.length === 0) {
    return (
      <div className="w-full animate-fadeUp">
        <EmptyState icon="schedule" title="אין משמרות פעילות" description="מנהל העסק צריך להפעיל משמרות בהגדרות העסק." />
      </div>
    );
  }

  if (!isDesktop) {
    return (
      <div className="w-full animate-fadeUp employee-shifts-mobile">
        <EmployeeConstraints templates={templates} />
        <EmployeeSchedule templates={templates} collapsed />
      </div>
    );
  }

  return (
    <div className="w-full animate-fadeUp">
      <ShiftPageHero
        title="משמרות"
        subtitle="צפייה בשיבוצים שלך ועדכון זמינות לשבוע הבא."
      />
      <EmployeeSchedule templates={templates} />
      <div className="page-section-label mt-8">
        העדפות זמינות <span>לשבוע הבא</span>
      </div>
      <EmployeeConstraints templates={templates} />
    </div>
  );
}

function EmployeeSchedule({
  templates,
  collapsed = false,
}: {
  templates: NonNullable<ReturnType<typeof useActiveShiftTemplates>["data"]>;
  collapsed?: boolean;
}) {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const reduceMotion = useReducedMotion();
  const isDesktop = useIsMdUp();
  const [wk, setWk] = useState(weekStart());
  const [wkDir, setWkDir] = useState(1);
  const { data: assignments, isLoading } = useShiftAssignments(businessId, wk, addDays(wk, 6), profile?.id);

  const assignMap = useMemo(() => {
    const m = new Set<string>();
    (assignments ?? []).forEach((a) => m.add(`${a.shift_template_id}_${a.shift_date}`));
    return m;
  }, [assignments]);

  const assignedCount = (assignments ?? []).length;

  function shiftWeek(d: number) {
    setWkDir(d > 0 ? 1 : -1);
    setWk((w) => addDays(w, d));
  }

  if (isLoading) return <PageLoader />;

  const scheduleBody = (
    <>
      {!collapsed && (
        <>
          <div className="page-section-label">
            משמרותי לשבוע <span>{formatDateShort(wk)} – {formatDateShort(addDays(wk, 6))}</span>
          </div>
          <div className="shift-toolbar">
            <ShiftLegend />
            <WeekNav wkStart={wk} onShift={shiftWeek} onToday={() => setWk(weekStart())} />
          </div>
        </>
      )}

      <motion.div
        key={wk}
        initial={reduceMotion ? false : { opacity: 0, x: wkDir * 26 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
      >
        {!isDesktop ? (
          <div className="employee-shifts-assignments-list">
            {collapsed && (
              <div className="employee-shifts-assignments-nav">
                <WeekNav wkStart={wk} onShift={shiftWeek} onToday={() => setWk(weekStart())} />
              </div>
            )}
            {HE_DAYS.map((d, i) => {
              const meta = dayMeta(wk, i);
              const dayTemplates = templates.filter((t) => assignMap.has(`${t.id}_${meta.date}`));
              return (
                <div key={i} className="employee-shifts-assignment-row" data-holiday={!!meta.holiday}>
                  <div
                    className="employee-shifts-assignment-date"
                    data-today={meta.isToday}
                    data-holiday={!!meta.holiday}
                    title={meta.holiday ? `${meta.hebrewDate} · ${meta.holiday}` : meta.hebrewDate}
                  >
                    <span className="employee-shifts-assignment-dow">{d}</span>
                    <span className="employee-shifts-assignment-num">{meta.date.slice(8, 10)}</span>
                    {meta.holiday && <span className="employee-shifts-assignment-holiday-dot" />}
                  </div>
                  <div className="employee-shifts-assignment-shifts">
                    {meta.holiday && (
                      <span className="employee-shifts-assignment-holiday" data-major-holiday={meta.isMajorHoliday}>
                        {meta.holiday}
                      </span>
                    )}
                    {dayTemplates.length === 0 ? (
                      <span className="employee-shifts-assignment-empty">אין שיבוץ</span>
                    ) : (
                      dayTemplates.map((t) => (
                        <span key={t.id} className="shift-assigned-badge">
                          <Icon name="check_circle" size={14} />
                          {t.name} · {t.start_time?.slice(0, 5)}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Card className="overflow-hidden !p-0 shadow-sm">
            <div className="shift-grid-wrap">
              <div className="shift-grid min-w-[680px]">
                <div className="shift-grid-head">
                  <div className="shift-grid-corner">משמרת</div>
                  {HE_DAYS.map((d, i) => (
                    <ShiftDayHead key={i} name={d} meta={dayMeta(wk, i)} />
                  ))}
                </div>
                {templates.map((t) => (
                  <div key={t.id} className="shift-grid-row">
                    <div className="shift-grid-row-label">
                      <div className="shift-shift-name">
                        <span className="shift-shift-dot" style={colorDotStyle(t.color, 2)} />
                        {t.name}
                      </div>
                      <span className="shift-shift-time">
                        {t.start_time?.slice(0, 5)}–{t.end_time?.slice(0, 5)}
                      </span>
                    </div>
                    {HE_DAYS.map((_, i) => {
                      const meta = dayMeta(wk, i);
                      const assigned = assignMap.has(`${t.id}_${meta.date}`);
                      return (
                        <div
                          key={i}
                          className="shift-grid-cell flex items-center justify-center !min-h-[3.25rem]"
                          data-today={meta.isToday}
                          data-weekend={meta.isWeekend}
                          data-holiday={!!meta.holiday}
                        >
                          {assigned ? (
                            <span className="shift-assigned-badge">
                              <Icon name="check_circle" size={15} />
                              משובץ
                            </span>
                          ) : (
                            <span className="text-[12px] font-semibold text-text-3">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            {(assignments ?? []).length === 0 && (
              <div className="border-t border-border px-5 py-4 text-[13px] text-text-3">
                אין משמרות משובצות לשבוע זה.
              </div>
            )}
          </Card>
        )}
      </motion.div>
    </>
  );

  if (collapsed) {
    return (
      <details className="employee-shifts-assignments">
        <summary className="employee-shifts-assignments-summary">
          <span className="employee-shifts-assignments-summary-main">
            <Icon name="event_available" size={20} />
            <span>
              <span className="employee-shifts-assignments-summary-title">השיבוצים שלי</span>
              <span className="employee-shifts-assignments-summary-sub">
                {assignedCount > 0 ? `${assignedCount} משמרות השבוע` : "אין שיבוצים לשבוע זה"}
              </span>
            </span>
          </span>
          <Icon name="expand_more" size={22} className="employee-shifts-assignments-chevron" />
        </summary>
        <div className="employee-shifts-assignments-body">{scheduleBody}</div>
      </details>
    );
  }

  return <div>{scheduleBody}</div>;
}

function EmployeeConstraints({ templates }: { templates: NonNullable<ReturnType<typeof useActiveShiftTemplates>["data"]> }) {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const reduceMotion = useReducedMotion();
  const isDesktop = useIsMdUp();
  const { data: business } = useBusiness(businessId);
  const nextWk = addDays(weekStart(), 7);
  const [wk, setWk] = useState(nextWk);
  const [dayIdx, setDayIdx] = useState(0);
  const { data: prefs, isLoading, error, refetch } = useShiftPreferences(businessId, wk, profile?.id);
  const setPref = useSetPreference(businessId);
  const clearPref = useClearPreference(businessId);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);

  const closeDow = business?.shift_prefs_deadline_dow;
  const closeTime = business?.shift_prefs_deadline_time;
  const openDow = business?.shift_prefs_open_dow;
  const openTime = business?.shift_prefs_open_time;
  const windowStatus = getShiftPrefsWindowStatus(wk, closeDow, closeTime, openDow, openTime);
  const canEdit =
    wk <= nextWk && isShiftPrefsOpenForWeek(wk, closeDow, closeTime, openDow, openTime);
  const hasWindow = closeDow != null && closeTime != null;

  const prefMap = useMemo(() => {
    const m = new Map<string, "available" | "cannot">();
    (prefs ?? []).forEach((p) => {
      const norm = normalizeAvailability(p.preference);
      if (norm === "available" || norm === "cannot") m.set(`${p.shift_template_id}_${p.shift_date}`, norm);
    });
    return m;
  }, [prefs]);

  const templateIds = useMemo(() => templates.map((t) => t.id), [templates]);
  const totalDays = 7;
  const filledDays = useMemo(() => {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      if (isShiftPrefsDayComplete(wk, i, templateIds, prefMap)) n++;
    }
    return n;
  }, [wk, templateIds, prefMap]);

  const minimumRules = {
    minWeekdays: business?.shift_prefs_min_weekdays ?? null,
    minWeekend: business?.shift_prefs_min_weekend ?? null,
  };
  const hasMinimum = hasShiftPrefsMinimumRules(minimumRules);
  const minimumStatus = useMemo(
    () => getShiftPrefsMinimumStatus(wk, templateIds, prefMap, minimumRules),
    [wk, templateIds, prefMap, minimumRules.minWeekdays, minimumRules.minWeekend],
  );
  const dayComplete = (dayIndex: number) =>
    isShiftPrefsDayComplete(wk, dayIndex, templateIds, prefMap);

  /** Max target week for submission: one week ahead (not two). */
  function shiftWeek(d: number) {
    setWk((w) => {
      const next = addDays(w, d);
      return next > nextWk ? nextWk : next;
    });
    setDayIdx(0);
  }

  async function setAvailability(templateId: string, date: string, value: Availability | null) {
    if (!profile?.id || !businessId || !canEdit) return;
    const key = `${templateId}_${date}`;
    setPending((s) => new Set(s).add(key));
    setSaveError(null);
    try {
      if (value === null) {
        await clearPref.mutateAsync({ employee_id: profile.id, shift_date: date, shift_template_id: templateId });
      } else {
        await setPref.mutateAsync({
          business_id: businessId,
          employee_id: profile.id,
          week_start: wk,
          shift_date: date,
          shift_template_id: templateId,
          preference: value,
        });
      }
    } catch {
      setSaveError("לא ניתן לשמור את האילוץ. נסו שוב.");
    } finally {
      setPending((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }

  async function fillDay(dayIndex: number, value: Availability) {
    await Promise.all(templates.map((t) => setAvailability(t.id, addDays(wk, dayIndex), value)));
  }

  async function clearDay(dayIndex: number) {
    await Promise.all(templates.map((t) => setAvailability(t.id, addDays(wk, dayIndex), null)));
  }

  if (isLoading) return <PageLoader label="טוען אילוצים..." />;
  if (error) return <ErrorState message="לא ניתן לטעון את האילוצים" onRetry={() => refetch()} />;

  const savingBar = (
    <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3.5 text-[12.5px] text-text-3">
      {!canEdit ? (
        <>
          <Icon name="lock" size={16} />
          הזמינות לשבוע זה נעולה — לא ניתן לערוך
        </>
      ) : setPref.isPending || clearPref.isPending ? (
        <>
          <Icon name="sync" size={16} className="animate-spin" />
          שומר...
        </>
      ) : (
        <>
          <Icon name="cloud_done" size={16} />
          האילוצים נשמרים אוטומטית
        </>
      )}
    </div>
  );

  const progressPct = totalDays ? (filledDays / totalDays) * 100 : 0;
  const atMaxWeek = wk >= nextWk;

  return (
    <div>
      {!isDesktop ? (
        <section className="payroll-hero prefs-hero prefs2-hero">
          <div className="payroll-hero-top">
            <div className="payroll-month-nav">
              <button
                type="button"
                className="payroll-month-btn"
                aria-label="שבוע קודם"
                onClick={() => shiftWeek(7)}
              >
                <Icon name="chevron_right" size={20} />
              </button>
              <span className="payroll-month-label">
                {formatDateShort(wk)} – {formatDateShort(addDays(wk, 6))}
              </span>
              <button
                type="button"
                className="payroll-month-btn"
                aria-label="שבוע הבא"
                onClick={() => shiftWeek(-7)}
                disabled={atMaxWeek}
              >
                <Icon name="chevron_left" size={20} />
              </button>
            </div>
            <span className="shifts-hero-badge" data-state={canEdit ? "open" : "locked"}>
              <Icon name={canEdit ? "edit_calendar" : "lock"} size={14} />
              {canEdit ? "פתוח להגשה" : "נעול"}
            </span>
          </div>

          <div className="prefs2-hero-main">
            <div className="prefs2-hero-nums">
              <p className="payroll-hero-label">הגשת זמינות</p>
              <div className="payroll-hero-total prefs-hero-total">
                {filledDays}
                <span className="prefs-hero-of">/{totalDays}</span>
              </div>
              <p className="prefs2-hero-label">ימים סומנו</p>
            </div>
            <ProgressRing pct={progressPct} done={filledDays === totalDays} />
          </div>

          {hasMinimum && (
            <div className="payroll-hero-chips">
              {minimumStatus.minWeekdays > 0 && (
                <span className="prefs-goal" data-ok={minimumStatus.weekdayMet}>
                  <Icon name={minimumStatus.weekdayMet ? "check_circle" : "radio_button_unchecked"} size={14} />
                  א׳–ה׳ {minimumStatus.weekdayDone}/{minimumStatus.minWeekdays}
                </span>
              )}
              {minimumStatus.minWeekend > 0 && (
                <span className="prefs-goal" data-ok={minimumStatus.weekendMet}>
                  <Icon name={minimumStatus.weekendMet ? "check_circle" : "radio_button_unchecked"} size={14} />
                  סופ״ש {minimumStatus.weekendDone}/{minimumStatus.minWeekend}
                </span>
              )}
            </div>
          )}

          {hasMinimum && !minimumStatus.met && canEdit && (
            <p className="prefs-hero-note" data-tone="warn">
              <Icon name="flag" size={14} />
              <span>
                {minimumStatus.minWeekdays > 0 && !minimumStatus.weekdayMet && (
                  <>חסרים {minimumStatus.minWeekdays - minimumStatus.weekdayDone} ימים באמצע שבוע. </>
                )}
                {minimumStatus.minWeekend > 0 && !minimumStatus.weekendMet && (
                  <>חסרים {minimumStatus.minWeekend - minimumStatus.weekendDone} ימים בסופ״ש. </>
                )}
                יום מלא = כל המשמרות באותו יום מסומנות.
              </span>
            </p>
          )}

          {hasWindow && windowStatus.state === "closed" && (
            <p className="prefs-hero-note">
              <Icon name="lock" size={14} />
              <span>ההגשה לשבוע זה נסגרה ({formatShiftPrefsClose(wk, closeDow!, closeTime!)})</span>
            </p>
          )}

          {hasWindow && windowStatus.state === "not_yet_open" && openDow != null && openTime != null && (
            <p className="prefs-hero-note">
              <Icon name="hourglass_empty" size={14} />
              <span>חלון ההגשה ייפתח ב-{formatShiftPrefsOpen(wk, openDow, openTime, closeDow!)}</span>
            </p>
          )}

          {hasWindow && canEdit && wk === nextWk && (
            <p className="prefs-hero-note">
              <Icon name="schedule" size={14} />
              <span>ניתן לעדכן עד {formatShiftPrefsClose(wk, closeDow!, closeTime!)}</span>
            </p>
          )}
        </section>
      ) : (
        <div className="shift-toolbar">
          <div className="shift-toolbar-meta">
            <ShiftLegend />
            <span className="shift-stat">{filledDays} מתוך {totalDays} ימים סומנו</span>
            {hasMinimum && (
              <span
                className="shift-stat"
                style={{ color: minimumStatus.met ? "var(--success)" : "var(--warning)" }}
              >
                {minimumStatus.weekdayDone}/{minimumStatus.minWeekdays || "—"} אמצע שבוע ·{" "}
                {minimumStatus.weekendDone}/{minimumStatus.minWeekend || "—"} סופ״ש
              </span>
            )}
            <div className="hidden w-28 sm:block">
              <div className="shift-progress-bar">
                <div className="shift-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          </div>
          <WeekNav
            wkStart={wk}
            onShift={shiftWeek}
            onToday={() => { setWk(nextWk); setDayIdx(0); }}
            maxWeekStart={nextWk}
          />
        </div>
      )}

      {saveError && (
        <div className="mb-3 flex items-center gap-2 rounded-[11px] border border-danger/30 [background:var(--danger-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-danger">
          <Icon name="error" size={18} />
          {saveError}
        </div>
      )}

      {hasMinimum && !minimumStatus.met && canEdit && (
        <div className="mb-3 hidden items-start gap-2 rounded-[11px] border border-warning/30 [background:var(--warning-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-warning md:flex">
          <Icon name="warning" size={18} className="mt-0.5 flex-none" />
          <span>
            חובה להשלים לפחות{" "}
            {formatShiftPrefsMinimumSummary(minimumRules)}. יום מלא = כל המשמרות באותו יום מסומנות.
            {minimumStatus.minWeekdays > 0 && !minimumStatus.weekdayMet && (
              <> חסרים {minimumStatus.minWeekdays - minimumStatus.weekdayDone} ימים באמצע שבוע.</>
            )}
            {minimumStatus.minWeekend > 0 && !minimumStatus.weekendMet && (
              <> חסרים {minimumStatus.minWeekend - minimumStatus.weekendDone} ימים בסופ״ש.</>
            )}
          </span>
        </div>
      )}

      {hasMinimum && minimumStatus.met && canEdit && (
        <div className="mb-3 hidden items-center gap-2 rounded-[11px] border border-success/30 [background:var(--success-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-success md:flex">
          <Icon name="check_circle" size={18} />
          עמדת בדרישת המינימום לשבוע זה.
        </div>
      )}

      {hasWindow && windowStatus.state === "closed" && (
        <div className="mb-3 hidden items-center gap-2 rounded-[11px] border border-warning/30 [background:var(--warning-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-warning md:flex">
          <Icon name="lock" size={18} />
          המועד להגשת זמינות לשבוע זה הסתיים ({formatShiftPrefsClose(wk, closeDow!, closeTime!)}).
        </div>
      )}

      {hasWindow && windowStatus.state === "not_yet_open" && openDow != null && openTime != null && (
        <div className="mb-3 hidden items-center gap-2 rounded-[11px] border border-warning/30 [background:var(--warning-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-warning md:flex">
          <Icon name="hourglass_empty" size={18} />
          חלון ההגשה לשבוע זה עדיין לא נפתח — ייפתח ב-
          {formatShiftPrefsOpen(wk, openDow, openTime, closeDow!)}.
        </div>
      )}

      {hasWindow && canEdit && wk === nextWk && (
        <div className="mb-3 hidden items-center gap-2 rounded-[11px] border border-info/30 [background:var(--info-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-info md:flex">
          <Icon name="schedule" size={18} />
          {openDow != null && openTime != null ? (
            <>
              חלון פתוח: {formatShiftPrefsWindowRule(openDow, openTime, closeDow!, closeTime!)} · נסגר ב-
              {formatShiftPrefsClose(wk, closeDow!, closeTime!)}
            </>
          ) : (
            <>
              ניתן לעדכן עד {formatShiftPrefsClose(wk, closeDow!, closeTime!)} ·{" "}
              {formatShiftPrefsCloseRule(closeDow!, closeTime!)}
            </>
          )}
        </div>
      )}

      {/* Phone: pick a day, mark availability per shift */}
      {!isDesktop ? (
      <div>
        <DayStrip wk={wk} value={dayIdx} onChange={setDayIdx} stripId="constraints" dayComplete={dayComplete} />
        <SelectedDayHolidayNote wk={wk} dayIdx={dayIdx} />
        <motion.div
          key={`${wk}-${dayIdx}`}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 32 }}
        >
          <div className="prefs2-list">
            {templates.map((t, idx) => {
              const date = addDays(wk, dayIdx);
              const key = `${t.id}_${date}`;
              const val = prefMap.get(key) ?? null;
              const saving = pending.has(key);
              const duration = shiftDurationLabel(t.start_time, t.end_time);
              return (
                <div
                  key={t.id}
                  className="prefs2-card"
                  data-state={val ?? "none"}
                  data-editable={canEdit ? "true" : "false"}
                  style={{ "--shift-color": t.color ?? "var(--accent)", "--enter-delay": `${idx * 45}ms` } as CSSProperties}
                >
                  <div className="prefs2-card-head">
                    <span className="prefs2-card-icon">
                      <Icon name={shiftTimeIcon(t.start_time)} size={18} />
                    </span>
                    <div className="prefs2-card-titles">
                      <span className="prefs2-card-name">{t.name}</span>
                      <span className="prefs2-card-time">
                        <Icon name="schedule" size={12} />
                        {t.start_time?.slice(0, 5)}–{t.end_time?.slice(0, 5)}
                        {duration && <span className="prefs2-card-dur">{duration}</span>}
                      </span>
                    </div>
                  </div>
                  {canEdit ? (
                    <div className="pref-seg">
                      <button
                        type="button"
                        className="pref-seg-btn"
                        data-kind="yes"
                        data-on={val === "available"}
                        data-saving={saving}
                        disabled={saving}
                        onClick={() => setAvailability(t.id, date, val === "available" ? null : "available")}
                      >
                        <Icon name="check" size={15} />
                        יכול
                      </button>
                      <button
                        type="button"
                        className="pref-seg-btn"
                        data-kind="no"
                        data-on={val === "cannot"}
                        data-saving={saving}
                        disabled={saving}
                        onClick={() => setAvailability(t.id, date, val === "cannot" ? null : "cannot")}
                      >
                        <Icon name="close" size={15} />
                        לא יכול
                      </button>
                    </div>
                  ) : (
                    <span className="prefs2-locked" data-state={val ?? "none"}>
                      <Icon
                        name={val === "available" ? "check_circle" : val === "cannot" ? "cancel" : "lock"}
                        size={14}
                      />
                      {val === "available" ? "יכול" : val === "cannot" ? "לא יכול" : "לא סומן"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="prefs2-day-actions">
            <button
              type="button"
              className="prefs2-action prefs2-action--fill btn-press"
              disabled={!canEdit}
              onClick={() => fillDay(dayIdx, "available")}
            >
              <Icon name="done_all" size={17} />
              סמן הכל — יכול
            </button>
            <button
              type="button"
              className="prefs2-action prefs2-action--clear btn-press"
              disabled={!canEdit}
              onClick={() => clearDay(dayIdx)}
            >
              <Icon name="delete_sweep" size={17} />
              נקה יום
            </button>
          </div>

          <div className="prefs2-autosave">
            {!canEdit ? (
              <>
                <Icon name="lock" size={14} />
                נעול לעריכה — חלון ההגשה סגור
              </>
            ) : setPref.isPending || clearPref.isPending ? (
              <>
                <Icon name="sync" size={14} className="animate-spin" />
                שומר...
              </>
            ) : (
              <>
                <Icon name="cloud_done" size={14} />
                נשמר אוטומטית
              </>
            )}
          </div>
        </motion.div>
      </div>
      ) : (
      /* Desktop: full week grid */
      <Card className="overflow-hidden !p-0 shadow-sm">
        <div className="shift-grid-wrap">
          <div className="shift-grid min-w-[720px]">
            <div className="shift-grid-head">
              <div className="shift-grid-corner">משמרת</div>
              {HE_DAYS.map((d, i) => {
                const meta = dayMeta(wk, i);
                return (
                  <ShiftDayHead key={i} name={d} meta={meta}>
                    {hasMinimum && dayComplete(i) && (
                      <span className="shift-grid-day-today" style={{ color: "var(--success)" }}>
                        מלא
                      </span>
                    )}
                    <div className="mt-1.5 flex justify-center gap-1">
                      <button
                        type="button"
                        title="כל המשמרות ביום זה — יכול"
                        disabled={!canEdit}
                        onClick={() => fillDay(i, "available")}
                        className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-info transition hover:[background:var(--info-bg)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        הכל יכול
                      </button>
                      <button
                        type="button"
                        title="נקה יום"
                        disabled={!canEdit}
                        onClick={() => clearDay(i)}
                        className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-text-3 transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        נקה
                      </button>
                    </div>
                  </ShiftDayHead>
                );
              })}
            </div>

            {templates.map((t) => (
              <div key={t.id} className="shift-grid-row">
                <div className="shift-grid-row-label">
                  <div className="shift-shift-name">
                    <span className="shift-shift-dot" style={colorDotStyle(t.color, 2)} />
                    {t.name}
                  </div>
                  <span className="shift-shift-time">
                    {t.start_time?.slice(0, 5)}–{t.end_time?.slice(0, 5)}
                  </span>
                </div>

                {HE_DAYS.map((_, i) => {
                  const date = addDays(wk, i);
                  const key = `${t.id}_${date}`;
                  const cur = prefMap.get(key) ?? null;
                  const isSaving = pending.has(key);
                  const meta = dayMeta(wk, i);
                  return (
                    <div
                      key={i}
                      className="shift-grid-cell"
                      data-today={meta.isToday}
                      data-weekend={meta.isWeekend}
                      data-holiday={!!meta.holiday}
                    >
                      <AvailabilityCell
                        value={cur}
                        saving={isSaving}
                        disabled={!canEdit}
                        onSet={(v) => setAvailability(t.id, date, v)}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {savingBar}
      </Card>
      )}
    </div>
  );
}

function AvailabilityCell({
  value,
  saving,
  disabled,
  onSet,
  horizontal = false,
}: {
  value: "available" | "cannot" | null;
  saving?: boolean;
  disabled?: boolean;
  onSet: (v: Availability | null) => void;
  horizontal?: boolean;
}) {
  const isAvail = value === "available";
  const isCannot = value === "cannot";
  const locked = disabled || saving;

  return (
    <div
      className={`flex gap-1 rounded-[10px] border p-1 transition ${horizontal ? "flex-row" : "min-h-[52px] flex-col"} ${locked ? "opacity-60" : ""}`}
      style={{
        background: isAvail ? AVAIL_META.available.bg : isCannot ? AVAIL_META.cannot.bg : "var(--surface)",
        borderColor: isAvail ? AVAIL_META.available.border : isCannot ? AVAIL_META.cannot.border : "var(--border)",
      }}
    >
      <button
        type="button"
        disabled={locked}
        onClick={() => onSet(isAvail ? null : "available")}
        className={`seg-btn flex flex-1 items-center justify-center gap-1 rounded-[7px] text-[11.5px] font-bold transition ${horizontal ? "py-2 text-[12.5px]" : "py-1.5"}`}
        style={
          isAvail
            ? { background: "var(--info)", color: "#fff", boxShadow: "var(--shadow-sm)" }
            : { background: "transparent", color: "var(--text-3)" }
        }
      >
        <Icon name="check" size={15} />
        {AVAIL_META.available.short}
      </button>
      <button
        type="button"
        disabled={locked}
        onClick={() => onSet(isCannot ? null : "cannot")}
        className={`seg-btn flex flex-1 items-center justify-center gap-1 rounded-[7px] text-[11.5px] font-bold transition ${horizontal ? "py-2 text-[12.5px]" : "py-1.5"}`}
        style={
          isCannot
            ? { background: "var(--danger)", color: "#fff", boxShadow: "var(--shadow-sm)" }
            : { background: "transparent", color: "var(--text-3)" }
        }
      >
        <Icon name="close" size={15} />
        {AVAIL_META.cannot.short}
      </button>
    </div>
  );
}

/* ------------------------------- Scheduler ------------------------------- */
type PickerState = { dept: string | null; templateId: string; date: string };
type SchedulerTab = "assignments" | "constraints";

function SchedulerModeToggle({ value, onChange }: { value: SchedulerTab; onChange: (v: SchedulerTab) => void }) {
  const reduceMotion = useReducedMotion();
  const tabs: { key: SchedulerTab; label: string; icon: string }[] = [
    { key: "assignments", label: "שיבוץ", icon: "calendar_month" },
    { key: "constraints", label: "אילוצים", icon: "event_busy" },
  ];

  return (
    <div className="shift-mode-toggle" role="tablist" aria-label="תצוגת סידור">
      {tabs.map(({ key, label, icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active}
            onClick={() => onChange(key)}
            className="shift-mode-toggle-btn"
          >
            {active && (
              <motion.span
                layoutId={reduceMotion ? undefined : "shift-mode-thumb"}
                className="shift-mode-toggle-thumb"
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }}
              />
            )}
            <Icon name={icon} size={18} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ConstraintChip({
  employeeId,
  name,
  status,
  compact,
}: {
  employeeId: string;
  name?: string | null;
  status: "available" | "cannot";
  compact?: boolean;
}) {
  const meta = AVAIL_META[status];
  return (
    <div
      className={`shift-constraint-chip${compact ? " shift-constraint-chip--compact" : ""}`}
      data-status={status}
      style={{ borderColor: meta.border, background: meta.bg }}
    >
      <span className="shift-assign-avatar" style={{ background: colorFor(employeeId) }}>
        {initialsOf(name)}
      </span>
      <span className="shift-constraint-name">{name?.split(" ")[0] ?? "עובד"}</span>
      <Icon name={status === "available" ? "check" : "close"} size={compact ? 12 : 13} style={{ color: meta.color }} />
    </div>
  );
}

function MobileConstraintShiftRow({
  template,
  available,
  cannot,
}: {
  template: NonNullable<ReturnType<typeof useActiveShiftTemplates>["data"]>[number];
  available: Profile[];
  cannot: Profile[];
}) {
  const total = available.length + cannot.length;
  const shiftColor = template.color ?? "var(--accent)";

  return (
    <div className="shift-mobile-constraint-row" style={{ "--shift-color": shiftColor } as CSSProperties}>
      <div className="shift-mobile-constraint-head">
        <div className="shift-mobile-constraint-title">
          <span className="shift-mobile-constraint-dot" style={colorDotStyle(shiftColor, 2)} />
          <span className="shift-mobile-constraint-name">{template.name}</span>
          <span className="shift-mobile-constraint-time">
            {template.start_time?.slice(0, 5)}–{template.end_time?.slice(0, 5)}
          </span>
        </div>
        {total > 0 && <span className="shift-mobile-constraint-badge">{total}</span>}
      </div>

      {total === 0 ? (
        <p className="shift-mobile-constraint-empty">אין אילוצים מסומנים</p>
      ) : (
        <div
          className="shift-mobile-constraint-cols"
          data-cols={available.length > 0 && cannot.length > 0 ? "2" : "1"}
        >
          {available.length > 0 && (
            <div className="shift-mobile-constraint-col" data-tone="available">
              <div className="shift-mobile-constraint-col-head">
                <Icon name="check_circle" size={14} />
                <span>יכול</span>
                <span className="shift-mobile-constraint-col-count">{available.length}</span>
              </div>
              <div className="shift-mobile-constraint-chips">
                {available.map((employee) => (
                  <ConstraintChip
                    key={employee.id}
                    employeeId={employee.id}
                    name={employee.full_name}
                    status="available"
                    compact
                  />
                ))}
              </div>
            </div>
          )}
          {cannot.length > 0 && (
            <div className="shift-mobile-constraint-col" data-tone="cannot">
              <div className="shift-mobile-constraint-col-head">
                <Icon name="cancel" size={14} />
                <span>לא יכול</span>
                <span className="shift-mobile-constraint-col-count">{cannot.length}</span>
              </div>
              <div className="shift-mobile-constraint-chips">
                {cannot.map((employee) => (
                  <ConstraintChip
                    key={employee.id}
                    employeeId={employee.id}
                    name={employee.full_name}
                    status="cannot"
                    compact
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SchedulerConstraintsBoard({
  wk,
  wkDir,
  dayIdx,
  setDayIdx,
  scheduleSections,
  templates,
  employees,
  prefMap,
  reduceMotion,
  isDesktop,
}: {
  wk: string;
  wkDir: number;
  dayIdx: number;
  setDayIdx: (i: number) => void;
  scheduleSections: { id: string | null; name: string; color: string }[];
  templates: NonNullable<ReturnType<typeof useActiveShiftTemplates>["data"]>;
  employees: Profile[];
  prefMap: Map<string, "available" | "cannot">;
  reduceMotion: boolean | null;
  isDesktop: boolean;
}) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const employeesBySection = useMemo(() => {
    const m = new Map<string, Profile[]>();
    for (const section of scheduleSections) {
      const key = section.id ?? "null";
      m.set(
        key,
        employees.filter((e) => {
          if (!e.active) return false;
          if (section.id === null) return !e.department_id;
          return e.department_id === section.id;
        })
      );
    }
    return m;
  }, [scheduleSections, employees]);

  const cellConstraints = useMemo(() => {
    const m = new Map<string, { available: Profile[]; cannot: Profile[] }>();
    for (const section of scheduleSections) {
      const sectionKey = section.id ?? "null";
      const list = employeesBySection.get(sectionKey) ?? [];
      for (const t of templates) {
        for (let i = 0; i < 7; i++) {
          const date = addDays(wk, i);
          const available: Profile[] = [];
          const cannot: Profile[] = [];
          for (const e of list) {
            if (q && !(e.full_name ?? "").toLowerCase().includes(q)) continue;
            const status = prefMap.get(`${e.id}_${t.id}_${date}`);
            if (status === "available") available.push(e);
            else if (status === "cannot") cannot.push(e);
          }
          m.set(`${sectionKey}_${t.id}_${date}`, { available, cannot });
        }
      }
    }
    return m;
  }, [scheduleSections, employeesBySection, templates, wk, prefMap, q]);

  const sectionWeekCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const section of scheduleSections) {
      const sectionKey = section.id ?? "null";
      let n = 0;
      for (const t of templates) {
        for (let i = 0; i < 7; i++) {
          const cell = cellConstraints.get(`${sectionKey}_${t.id}_${addDays(wk, i)}`);
          if (cell) n += cell.available.length + cell.cannot.length;
        }
      }
      m.set(sectionKey, n);
    }
    return m;
  }, [scheduleSections, templates, cellConstraints, wk]);

  const constraintsFor = (deptId: string | null, templateId: string, date: string) =>
    cellConstraints.get(`${deptId ?? "null"}_${templateId}_${date}`) ?? { available: [], cannot: [] };

  return (
    <>
      <div className="shift-constraints-search-wrap">
        <div className="shift-constraints-search">
          <Icon name="search" size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-3" />
          <input
            className="field !py-2.5 !pr-9"
            placeholder="חיפוש עובד..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {!isDesktop ? (
      <div className="shift-constraints-mobile">
        <DayStrip wk={wk} value={dayIdx} onChange={setDayIdx} stripId="constraints-board" />
        <SelectedDayHolidayNote wk={wk} dayIdx={dayIdx} />
        <motion.div
          key={`${wk}-${dayIdx}-constraints`}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 32 }}
          className="flex flex-col gap-3"
        >
          {scheduleSections.map((section) => {
            const date = addDays(wk, dayIdx);
            const dayMarked = templates.reduce((n, t) => {
              const { available, cannot } = constraintsFor(section.id, t.id, date);
              return n + available.length + cannot.length;
            }, 0);
            return (
              <div
                key={section.id ?? "general"}
                className="shift-dept-card"
                style={{ "--dept-color": section.color } as CSSProperties}
              >
                <div className="shift-dept-header" style={{ cursor: "default" }}>
                  <span className="shift-dept-dot" style={colorDotStyle(section.color)} />
                  <span className="shift-dept-name">{section.name}</span>
                  <div className="shift-dept-stats">
                    <span className="shift-dept-stat">
                      <strong>{dayMarked}</strong> אילוצים היום
                    </span>
                  </div>
                </div>
                <div>
                  {templates.map((t) => {
                    const { available, cannot } = constraintsFor(section.id, t.id, date);
                    return (
                      <MobileConstraintShiftRow
                        key={t.id}
                        template={t}
                        available={available}
                        cannot={cannot}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </motion.div>
      </div>
      ) : (
      <motion.div
        key={`${wk}-constraints`}
        initial={reduceMotion ? false : { opacity: 0, x: wkDir * 26 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="flex flex-col gap-5"
      >
        {scheduleSections.map((section, sectionIndex) => (
          <div
            key={section.id ?? "general"}
            className="shift-dept-card shift-section-enter"
            style={{ "--dept-color": section.color, "--enter-delay": `${sectionIndex * 70}ms` } as CSSProperties}
          >
            <div className="shift-dept-header" style={{ cursor: "default" }}>
              <span className="shift-dept-dot" style={colorDotStyle(section.color)} />
              <span className="shift-dept-name">{section.name}</span>
              <div className="shift-dept-stats">
                <span className="shift-dept-stat">
                  <strong>{employeesBySection.get(section.id ?? "null")?.length ?? 0}</strong> עובדים
                </span>
                <span className="shift-dept-stat">
                  <strong>{sectionWeekCounts.get(section.id ?? "null") ?? 0}</strong> אילוצים השבוע
                </span>
              </div>
            </div>
            <div className="shift-grid-wrap">
              <div className="shift-grid">
                <div className="shift-grid-head">
                  <div className="shift-grid-corner">משמרת</div>
                  {HE_DAYS.map((d, i) => (
                    <ShiftDayHead key={i} name={d} meta={dayMeta(wk, i)} />
                  ))}
                </div>
                {templates.map((t) => (
                  <div key={t.id} className="shift-grid-row">
                    <div className="shift-grid-row-label">
                      <div className="shift-shift-name">
                        <span className="shift-shift-dot" style={colorDotStyle(t.color, 2)} />
                        {t.name}
                      </div>
                      <span className="shift-shift-time">
                        {t.start_time?.slice(0, 5)}–{t.end_time?.slice(0, 5)}
                      </span>
                    </div>
                    {HE_DAYS.map((_, i) => {
                      const date = addDays(wk, i);
                      const { available, cannot } = constraintsFor(section.id, t.id, date);
                      const meta = dayMeta(wk, i);
                      const empty = available.length === 0 && cannot.length === 0;
                      return (
                        <div
                          key={i}
                          className="shift-grid-cell shift-constraint-cell"
                          data-today={meta.isToday}
                          data-weekend={meta.isWeekend}
                          data-holiday={!!meta.holiday}
                          data-empty={empty}
                        >
                          {empty ? (
                            <span className="text-[11px] font-semibold text-text-3">—</span>
                          ) : (
                            <div className="flex w-full flex-col gap-1">
                              {available.map((employee) => (
                                <ConstraintChip
                                  key={employee.id}
                                  employeeId={employee.id}
                                  name={employee.full_name}
                                  status="available"
                                />
                              ))}
                              {cannot.map((employee) => (
                                <ConstraintChip
                                  key={employee.id}
                                  employeeId={employee.id}
                                  name={employee.full_name}
                                  status="cannot"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </motion.div>
      )}
    </>
  );
}

function SchedulerView() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const reduceMotion = useReducedMotion();
  const isDesktop = useIsMdUp();
  const [wk, setWk] = useState(weekStart());
  const [wkDir, setWkDir] = useState(1);
  const [dayIdx, setDayIdx] = useState(() => todayIdxInWeek(weekStart()));
  const [viewMode, setViewMode] = useState<SchedulerTab>("assignments");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { data: templates, isLoading: lt } = useActiveShiftTemplates(businessId);
  const { data: departments, isLoading: ld } = useDepartments(businessId);
  const { data: employees, isLoading: le } = useProfiles(businessId);
  const { data: prefs, isLoading: lp } = useShiftPreferences(businessId, wk);
  const { data: assignments, isLoading: la } = useShiftAssignments(businessId, wk, addDays(wk, 6));
  const addAssign = useAddAssignment(businessId);
  const removeAssign = useRemoveAssignment(businessId);
  const [picker, setPicker] = useState<PickerState | null>(null);

  const prefMap = useMemo(() => {
    const m = new Map<string, "available" | "cannot">();
    (prefs ?? []).forEach((p) => {
      const norm = normalizeAvailability(p.preference);
      if (norm === "available" || norm === "cannot") m.set(`${p.employee_id}_${p.shift_template_id}_${p.shift_date}`, norm);
    });
    return m;
  }, [prefs]);

  const empById = useMemo(() => {
    const m = new Map<string, Profile>();
    (employees ?? []).forEach((e) => m.set(e.id, e));
    return m;
  }, [employees]);

  const activeDepartments = useMemo(
    () => (departments ?? []).filter((d) => d.active),
    [departments]
  );

  const scheduleSections = useMemo(() => {
    const sections: { id: string | null; name: string; color: string }[] = activeDepartments.map((d) => ({
      id: d.id,
      name: d.name,
      color: d.color ?? "#7c3aed",
    }));
    const unassigned = (employees ?? []).filter((e) => e.active && !e.department_id);
    if (unassigned.length > 0) {
      sections.push({ id: null, name: "כללי", color: "#94a3b8" });
    }
    return sections;
  }, [activeDepartments, employees]);

  const employeesBySection = useMemo(() => {
    const m = new Map<string, Profile[]>();
    for (const section of scheduleSections) {
      m.set(
        section.id ?? "null",
        (employees ?? []).filter(
          (e) => e.active && (section.id ? e.department_id === section.id : !e.department_id)
        )
      );
    }
    return m;
  }, [scheduleSections, employees]);

  const assignmentsByCell = useMemo(() => {
    const m = new Map<string, ShiftAssignment[]>();
    const weekCounts = new Map<string, number>();
    const list = assignments ?? [];
    for (const section of scheduleSections) {
      weekCounts.set(section.id ?? "null", 0);
    }
    for (const section of scheduleSections) {
      const sectionKey = section.id ?? "null";
      for (const a of list) {
        const empDept = empById.get(a.employee_id)?.department_id ?? null;
        const matches =
          section.id === null
            ? empDept === null
            : a.department_id === section.id || (!a.department_id && empDept === section.id);
        if (!matches) continue;
        const key = `${sectionKey}_${a.shift_template_id}_${a.shift_date}`;
        const bucket = m.get(key);
        if (bucket) bucket.push(a);
        else m.set(key, [a]);
        weekCounts.set(sectionKey, (weekCounts.get(sectionKey) ?? 0) + 1);
      }
    }
    return { byCell: m, weekCounts };
  }, [assignments, scheduleSections, empById]);

  const assignmentsByCellMap = assignmentsByCell.byCell;
  const sectionWeekCounts = assignmentsByCell.weekCounts;

  useEffect(() => {
    if (!picker) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [picker]);

  if (lt || ld || le || (viewMode === "assignments" ? la : lp)) return <PageLoader />;

  if (!templates?.length || scheduleSections.length === 0) {
    return (
      <div className="w-full animate-fadeUp">
        <EmptyState
          icon="calendar_month"
          title="חסרה הגדרה לסידור"
          description="כדי לבנות סידור עבודה צריך להגדיר מחלקות ולהפעיל לפחות משמרת אחת בהגדרות העסק."
        />
      </div>
    );
  }

  const assignmentsFor = (deptId: string | null, templateId: string, date: string) =>
    assignmentsByCellMap.get(`${deptId ?? "null"}_${templateId}_${date}`) ?? [];

  function shiftWeek(d: number) {
    const next = addDays(wk, d);
    setWkDir(d > 0 ? 1 : -1);
    setWk(next);
    setDayIdx(todayIdxInWeek(next));
  }

  function goToday() {
    const w = weekStart();
    setWk(w);
    setDayIdx(todayIdxInWeek(w));
  }

  function toggleSection(key: string) {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  const pickerTemplate = picker ? templates.find((t) => t.id === picker.templateId) : null;

  return (
    <div className="w-full animate-fadeUp">
      <div className="shift-scheduler-head mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SchedulerModeToggle value={viewMode} onChange={setViewMode} />
        <WeekNav wkStart={wk} onShift={shiftWeek} onToday={goToday} />
      </div>

      {viewMode === "constraints" ? (
        <SchedulerConstraintsBoard
          wk={wk}
          wkDir={wkDir}
          dayIdx={dayIdx}
          setDayIdx={setDayIdx}
          scheduleSections={scheduleSections}
          templates={templates}
          employees={employees ?? []}
          prefMap={prefMap}
          reduceMotion={reduceMotion}
          isDesktop={isDesktop}
        />
      ) : (
        <>
      {!isDesktop ? (
      <div>
        <DayStrip wk={wk} value={dayIdx} onChange={setDayIdx} stripId="scheduler" />
        <SelectedDayHolidayNote wk={wk} dayIdx={dayIdx} />
        <motion.div
          key={`${wk}-${dayIdx}`}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 32 }}
          className="flex flex-col gap-4"
        >
          {scheduleSections.map((section) => {
            const date = addDays(wk, dayIdx);
            return (
              <div
                key={section.id ?? "general"}
                className="shift-dept-card"
                style={{ "--dept-color": section.color } as CSSProperties}
              >
                <div className="shift-dept-header" style={{ cursor: "default" }}>
                  <span className="shift-dept-dot" style={colorDotStyle(section.color)} />
                  <span className="shift-dept-name">{section.name}</span>
                  <div className="shift-dept-stats">
                    <span className="shift-dept-stat">
                      <strong>{employeesBySection.get(section.id ?? "null")?.length ?? 0}</strong> עובדים
                    </span>
                  </div>
                </div>
                <div>
                  {templates.map((t) => {
                    const cellAssignments = assignmentsFor(section.id, t.id, date);
                    return (
                      <div
                        key={t.id}
                        className="shift-mobile-shift"
                        style={{ "--shift-color": t.color ?? "var(--accent)" } as CSSProperties}
                      >
                        <div className="shift-mobile-shift-head">
                          <span className="shift-mobile-shift-name">{t.name}</span>
                          <span className="shift-shift-time">
                            {t.start_time?.slice(0, 5)}–{t.end_time?.slice(0, 5)}
                          </span>
                        </div>
                        <div className="shift-mobile-chips">
                          <AnimatePresence initial={false}>
                            {cellAssignments.map((a) => (
                              <AssignChip
                                key={a.id}
                                employeeId={a.employee_id}
                                name={empById.get(a.employee_id)?.full_name}
                                onRemove={() => removeAssign.mutate(a.id)}
                              />
                            ))}
                          </AnimatePresence>
                          <button
                            type="button"
                            className="shift-mobile-add"
                            aria-label="שיבוץ עובד"
                            onClick={() => setPicker({ dept: section.id, templateId: t.id, date })}
                          >
                            <Icon name="person_add" size={18} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </motion.div>
      </div>
      ) : (
      <motion.div
        key={wk}
        initial={reduceMotion ? false : { opacity: 0, x: wkDir * 26 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="flex flex-col gap-5"
      >
        {scheduleSections.map((section, sectionIndex) => {
          const sectionKey = section.id ?? "general";
          const isCollapsed = collapsed.has(sectionKey);
          return (
            <div
              key={sectionKey}
              className="shift-dept-card shift-section-enter"
              style={{ "--dept-color": section.color, "--enter-delay": `${sectionIndex * 70}ms` } as CSSProperties}
            >
              <button
                type="button"
                className="shift-dept-header"
                onClick={() => toggleSection(sectionKey)}
                aria-expanded={!isCollapsed}
              >
                <span className="shift-dept-dot" style={colorDotStyle(section.color)} />
                <span className="shift-dept-name">{section.name}</span>
                <div className="shift-dept-stats">
                  <span className="shift-dept-stat">
                    <strong>{employeesBySection.get(section.id ?? "null")?.length ?? 0}</strong> עובדים
                  </span>
                  <span className="shift-dept-stat">
                    <strong>{sectionWeekCounts.get(section.id ?? "null") ?? 0}</strong> שיבוצים השבוע
                  </span>
                  <span className="shift-dept-collapse" data-open={!isCollapsed}>
                    <Icon name="expand_less" size={18} />
                  </span>
                </div>
              </button>
              <motion.div
                initial={false}
                animate={{ height: isCollapsed ? 0 : "auto", opacity: isCollapsed ? 0 : 1 }}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 34 }}
                style={{ overflow: "hidden" }}
              >
                <div className="shift-grid-wrap">
                  <div className="shift-grid">
                    <div className="shift-grid-head">
                      <div className="shift-grid-corner">משמרת</div>
                      {HE_DAYS.map((d, i) => (
                        <ShiftDayHead key={i} name={d} meta={dayMeta(wk, i)} />
                      ))}
                    </div>
                    {templates.map((t) => (
                      <div key={t.id} className="shift-grid-row">
                        <div className="shift-grid-row-label">
                          <div className="shift-shift-name">
                            <span className="shift-shift-dot" style={colorDotStyle(t.color, 2)} />
                            {t.name}
                          </div>
                          <span className="shift-shift-time">
                            {t.start_time?.slice(0, 5)}–{t.end_time?.slice(0, 5)}
                          </span>
                        </div>
                        {HE_DAYS.map((_, i) => {
                          const date = addDays(wk, i);
                          const cellAssignments = assignmentsFor(section.id, t.id, date);
                          const meta = dayMeta(wk, i);
                          return (
                            <div
                              key={i}
                              className="shift-grid-cell"
                              data-today={meta.isToday}
                              data-weekend={meta.isWeekend}
                              data-holiday={!!meta.holiday}
                              data-empty={cellAssignments.length === 0}
                            >
                              <AnimatePresence initial={false}>
                                {cellAssignments.map((a) => (
                                  <AssignChip
                                    key={a.id}
                                    employeeId={a.employee_id}
                                    name={empById.get(a.employee_id)?.full_name}
                                    onRemove={() => removeAssign.mutate(a.id)}
                                  />
                                ))}
                              </AnimatePresence>
                              <button
                                type="button"
                                onClick={() => setPicker({ dept: section.id, templateId: t.id, date })}
                                className="shift-add-btn"
                                aria-label="הוסף עובד"
                              >
                                <Icon name="add" size={18} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })}
      </motion.div>
      )}

      {createPortal(
        <AnimatePresence>
          {picker && (
            <motion.div
              key="picker-backdrop"
              className="shift-picker-backdrop"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setPicker(null)}
            >
              <motion.div
                className="shift-picker-panel"
                initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                onClick={(e) => e.stopPropagation()}
              >
                <PickerPanel
                  picker={picker}
                  subtitle={(() => {
                    const he = getHebrewDayInfo(picker.date);
                    return `${pickerTemplate?.name ?? ""} · ${formatDateShort(picker.date)} · ${
                      he.holiday ?? he.hebrewDate
                    }`;
                  })()}
                  list={employeesBySection.get(picker.dept ?? "null") ?? []}
                  prefMap={prefMap}
                  assignments={assignments ?? []}
                  onClose={() => setPicker(null)}
                  onPick={(employeeId) => {
                    addAssign.mutate({
                      business_id: businessId!,
                      department_id: picker.dept,
                      employee_id: employeeId,
                      shift_date: picker.date,
                      shift_template_id: picker.templateId,
                      assigned_by: profile?.id ?? null,
                    });
                    setPicker(null);
                  }}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
        </>
      )}
    </div>
  );
}

function PickerPanel({
  picker,
  subtitle,
  list,
  prefMap,
  assignments,
  onPick,
  onClose,
}: {
  picker: PickerState;
  subtitle: string;
  list: Profile[];
  prefMap: Map<string, "available" | "cannot">;
  assignments: { employee_id: string; shift_template_id: string; shift_date: string }[];
  onPick: (employeeId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const filtered = q ? list.filter((e) => (e.full_name ?? "").includes(q)) : list;

  return (
    <>
      <div className="shift-picker-head">
        <div>
          <div className="shift-picker-title">שיבוץ עובד</div>
          <div className="mt-0.5 text-[12px] font-semibold text-text-3">{subtitle}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="סגירה" className="icon-btn !h-8 !w-8 !rounded-[9px]">
          <Icon name="close" size={18} />
        </button>
      </div>
      {list.length > 6 && (
        <div className="shift-picker-search">
          <input
            className="field !py-2.5"
            placeholder="חיפוש עובד..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      )}
      <div className="shift-picker-list">
        {list.length === 0 && (
          <div className="px-3 py-6 text-center text-[13px] text-text-3">
            {picker.dept
              ? "אין עובדים במחלקה זו. שייכו עובדים בעמוד המשתמשים."
              : "אין עובדים ללא מחלקה."}
          </div>
        )}
        {list.length > 0 && filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-[13px] text-text-3">לא נמצאו עובדים בשם הזה.</div>
        )}
        {filtered.map((e) => {
          const pref = prefMap.get(`${e.id}_${picker.templateId}_${picker.date}`);
          const prefStatus = PREF_STATUS[pref ?? "none"];
          const already = assignments.some(
            (a) => a.employee_id === e.id && a.shift_template_id === picker.templateId && a.shift_date === picker.date
          );
          const weekStartISO = weekStartFromDateISO(picker.date);
          const assignedDays = countAssignedDaysInWeek(assignments, e.id, weekStartISO);
          const dayOffBlocked = !already && !canAssignEmployeeOnDate(assignments, e.id, picker.date);
          const disabled = already || dayOffBlocked;
          return (
            <button
              key={e.id}
              type="button"
              disabled={disabled}
              onClick={() => onPick(e.id)}
              className="shift-picker-item"
              title={dayOffBlocked ? "חובה יום חופש אחד לפחות בשבוע (מקסימום 6 ימי שיבוץ)" : undefined}
            >
              <span
                className="grid h-9 w-9 flex-none place-items-center rounded-full text-[12.5px] font-bold text-white"
                style={{ background: colorFor(e.id) }}
              >
                {initialsOf(e.full_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold leading-tight">{e.full_name}</span>
                <span className="shift-picker-pref" style={{ color: dayOffBlocked ? "var(--danger)" : prefStatus.color }}>
                  {dayOffBlocked
                    ? `${MAX_ASSIGNED_DAYS_PER_WEEK}/${MAX_ASSIGNED_DAYS_PER_WEEK} ימים · חובה יום חופש`
                    : assignedDays > 0
                      ? `${prefStatus.label} · ${assignedDays}/${MAX_ASSIGNED_DAYS_PER_WEEK} ימים`
                      : prefStatus.label}
                </span>
              </span>
              {already && <Badge tone="neutral">משובץ</Badge>}
              {dayOffBlocked && <Badge tone="danger">יום חופש</Badge>}
            </button>
          );
        })}
      </div>
    </>
  );
}
