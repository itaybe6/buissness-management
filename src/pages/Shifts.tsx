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
  return {
    date,
    isToday: date === today,
    isWeekend: index >= 5,
  };
}

function todayIdxInWeek(wk: string) {
  const t = todayISO();
  for (let i = 0; i < 7; i++) if (addDays(wk, i) === t) return i;
  return 0;
}

function WeekNav({ wkStart, onShift, onToday }: { wkStart: string; onShift: (d: number) => void; onToday?: () => void }) {
  const end = addDays(wkStart, 6);
  const isCurrentWeek = wkStart === weekStart();
  return (
    <div className="shift-week-nav-group">
      <div className="shift-week-nav">
        <button type="button" onClick={() => onShift(7)} className="shift-week-nav-btn" aria-label="שבוע קודם">
          <Icon name="chevron_right" size={20} />
        </button>
        <span className="shift-week-nav-label">{formatDateShort(wkStart)} – {formatDateShort(end)}</span>
        <button type="button" onClick={() => onShift(-7)} className="shift-week-nav-btn" aria-label="שבוע הבא">
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
        return (
          <button
            key={i}
            type="button"
            className="shift-day-pill"
            data-active={active}
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
            {meta.isToday && <span className="shift-day-pill-dot" />}
            {dayComplete?.(i) && <span className="shift-day-pill-dot" style={{ background: "var(--success)" }} />}
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
  const { data: templates, isLoading } = useActiveShiftTemplates(businessId);

  if (isLoading) return <PageLoader />;
  if (!templates || templates.length === 0) {
    return (
      <div className="w-full animate-fadeUp">
        <EmptyState icon="schedule" title="אין משמרות פעילות" description="מנהל העסק צריך להפעיל משמרות בהגדרות העסק." />
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

function EmployeeSchedule({ templates }: { templates: NonNullable<ReturnType<typeof useActiveShiftTemplates>["data"]> }) {
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

  function shiftWeek(d: number) {
    setWkDir(d > 0 ? 1 : -1);
    setWk((w) => addDays(w, d));
  }

  if (isLoading) return <PageLoader />;

  return (
    <div>
      <div className="page-section-label">
        משמרותי לשבוע <span>{formatDateShort(wk)} – {formatDateShort(addDays(wk, 6))}</span>
      </div>
      <div className="shift-toolbar">
        <ShiftLegend />
        <WeekNav wkStart={wk} onShift={shiftWeek} onToday={() => setWk(weekStart())} />
      </div>

      <motion.div
        key={wk}
        initial={reduceMotion ? false : { opacity: 0, x: wkDir * 26 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
      >
        {!isDesktop ? (
          <div className="flex flex-col gap-2.5">
            {HE_DAYS.map((d, i) => {
              const meta = dayMeta(wk, i);
              const dayTemplates = templates.filter((t) => assignMap.has(`${t.id}_${meta.date}`));
              return (
                <div key={i} className="flex items-center gap-3 rounded-card bg-surface px-4 py-3 shadow-card">
                  <div
                    className="flex w-11 flex-none flex-col items-center rounded-xl py-1.5"
                    style={{ background: meta.isToday ? "var(--accent-tint)" : "var(--surface-2)" }}
                  >
                    <span
                      className="text-[10.5px] font-bold"
                      style={{ color: meta.isToday ? "var(--accent-2)" : "var(--text-2)" }}
                    >
                      {d}
                    </span>
                    <span className="text-[15px] font-extrabold leading-tight [font-variant-numeric:tabular-nums]">
                      {meta.date.slice(8, 10)}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    {dayTemplates.length === 0 ? (
                      <span className="text-[12.5px] font-semibold text-text-3">אין שיבוץ</span>
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
                  {HE_DAYS.map((d, i) => {
                    const meta = dayMeta(wk, i);
                    return (
                      <div key={i} className="shift-grid-day" data-today={meta.isToday} data-weekend={meta.isWeekend}>
                        <span className="shift-grid-day-name">{d}</span>
                        <span className="shift-grid-day-date">{formatDateShort(meta.date)}</span>
                        {meta.isToday && <span className="shift-grid-day-today">היום</span>}
                      </div>
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
                      const meta = dayMeta(wk, i);
                      const assigned = assignMap.has(`${t.id}_${meta.date}`);
                      return (
                        <div
                          key={i}
                          className="shift-grid-cell flex items-center justify-center !min-h-[3.25rem]"
                          data-today={meta.isToday}
                          data-weekend={meta.isWeekend}
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
    </div>
  );
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
  const canEdit = isShiftPrefsOpenForWeek(wk, closeDow, closeTime, openDow, openTime);
  const hasWindow = closeDow != null && closeTime != null;

  const prefMap = useMemo(() => {
    const m = new Map<string, "available" | "cannot">();
    (prefs ?? []).forEach((p) => {
      const norm = normalizeAvailability(p.preference);
      if (norm === "available" || norm === "cannot") m.set(`${p.shift_template_id}_${p.shift_date}`, norm);
    });
    return m;
  }, [prefs]);

  const totalCells = templates.length * 7;
  const filledCells = useMemo(() => {
    let n = 0;
    templates.forEach((t) => {
      for (let i = 0; i < 7; i++) {
        if (prefMap.has(`${t.id}_${addDays(wk, i)}`)) n++;
      }
    });
    return n;
  }, [templates, prefMap, wk]);

  const templateIds = useMemo(() => templates.map((t) => t.id), [templates]);
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

  function shiftWeek(d: number) {
    setWk((w) => addDays(w, d));
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

  return (
    <div>
      <div className="shift-toolbar">
        <div className="shift-toolbar-meta">
          <ShiftLegend />
          <span className="shift-stat">{filledCells} מתוך {totalCells} משמרות מסומנות</span>
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
              <div className="shift-progress-fill" style={{ width: `${totalCells ? (filledCells / totalCells) * 100 : 0}%` }} />
            </div>
          </div>
        </div>
        <WeekNav wkStart={wk} onShift={shiftWeek} onToday={() => { setWk(addDays(weekStart(), 7)); setDayIdx(0); }} />
      </div>

      {saveError && (
        <div className="mb-3 flex items-center gap-2 rounded-[11px] border border-danger/30 [background:var(--danger-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-danger">
          <Icon name="error" size={18} />
          {saveError}
        </div>
      )}

      {hasMinimum && !minimumStatus.met && canEdit && (
        <div className="mb-3 flex items-start gap-2 rounded-[11px] border border-warning/30 [background:var(--warning-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-warning">
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
        <div className="mb-3 flex items-center gap-2 rounded-[11px] border border-success/30 [background:var(--success-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-success">
          <Icon name="check_circle" size={18} />
          עמדת בדרישת המינימום לשבוע זה.
        </div>
      )}

      {hasWindow && windowStatus.state === "closed" && (
        <div className="mb-3 flex items-center gap-2 rounded-[11px] border border-warning/30 [background:var(--warning-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-warning">
          <Icon name="lock" size={18} />
          המועד להגשת זמינות לשבוע זה הסתיים ({formatShiftPrefsClose(wk, closeDow!, closeTime!)}).
        </div>
      )}

      {hasWindow && windowStatus.state === "not_yet_open" && openDow != null && openTime != null && (
        <div className="mb-3 flex items-center gap-2 rounded-[11px] border border-warning/30 [background:var(--warning-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-warning">
          <Icon name="hourglass_empty" size={18} />
          חלון ההגשה לשבוע זה עדיין לא נפתח — ייפתח ב-
          {formatShiftPrefsOpen(wk, openDow, openTime, closeDow!)}.
        </div>
      )}

      {hasWindow && canEdit && wk === nextWk && (
        <div className="mb-3 flex items-center gap-2 rounded-[11px] border border-info/30 [background:var(--info-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-info">
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
        <DayStrip wk={wk} value={dayIdx} onChange={setDayIdx} stripId="constraints" dayComplete={hasMinimum ? dayComplete : undefined} />
        <motion.div
          key={`${wk}-${dayIdx}`}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 32 }}
        >
          <Card className="overflow-hidden !p-0">
            {templates.map((t) => {
              const date = addDays(wk, dayIdx);
              const key = `${t.id}_${date}`;
              return (
                <div key={t.id} className="shift-mobile-shift" style={{ "--shift-color": t.color ?? "var(--accent)" } as CSSProperties}>
                  <div className="shift-mobile-shift-head">
                    <span className="shift-mobile-shift-name">{t.name}</span>
                    <span className="shift-shift-time">
                      {t.start_time?.slice(0, 5)}–{t.end_time?.slice(0, 5)}
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <AvailabilityCell
                      horizontal
                      value={prefMap.get(key) ?? null}
                      saving={pending.has(key)}
                      disabled={!canEdit}
                      onSet={(v) => setAvailability(t.id, date, v)}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => fillDay(dayIdx, "available")}
                className="rounded-[9px] px-2.5 py-1.5 text-[12px] font-bold text-info transition hover:[background:var(--info-bg)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                סמן הכל — יכול
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => clearDay(dayIdx)}
                className="rounded-[9px] px-2.5 py-1.5 text-[12px] font-bold text-text-3 transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                נקה יום
              </button>
            </div>
            {savingBar}
          </Card>
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
                  <div key={i} className="shift-grid-day" data-today={meta.isToday} data-weekend={meta.isWeekend}>
                    <span className="shift-grid-day-name">{d}</span>
                    <span className="shift-grid-day-date">{formatDateShort(meta.date)}</span>
                    {meta.isToday && <span className="shift-grid-day-today">היום</span>}
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
                  </div>
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
                    <div key={i} className="shift-grid-cell" data-today={meta.isToday} data-weekend={meta.isWeekend}>
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
                  {HE_DAYS.map((d, i) => {
                    const meta = dayMeta(wk, i);
                    return (
                      <div key={i} className="shift-grid-day" data-today={meta.isToday} data-weekend={meta.isWeekend}>
                        <span className="shift-grid-day-name">{d}</span>
                        <span className="shift-grid-day-date">{formatDateShort(meta.date)}</span>
                        {meta.isToday && <span className="shift-grid-day-today">היום</span>}
                      </div>
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
                      const { available, cannot } = constraintsFor(section.id, t.id, date);
                      const meta = dayMeta(wk, i);
                      const empty = available.length === 0 && cannot.length === 0;
                      return (
                        <div
                          key={i}
                          className="shift-grid-cell shift-constraint-cell"
                          data-today={meta.isToday}
                          data-weekend={meta.isWeekend}
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
                      {HE_DAYS.map((d, i) => {
                        const meta = dayMeta(wk, i);
                        return (
                          <div key={i} className="shift-grid-day" data-today={meta.isToday} data-weekend={meta.isWeekend}>
                            <span className="shift-grid-day-name">{d}</span>
                            <span className="shift-grid-day-date">{formatDateShort(meta.date)}</span>
                            {meta.isToday && <span className="shift-grid-day-today">היום</span>}
                          </div>
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
                          const cellAssignments = assignmentsFor(section.id, t.id, date);
                          const meta = dayMeta(wk, i);
                          return (
                            <div
                              key={i}
                              className="shift-grid-cell"
                              data-today={meta.isToday}
                              data-weekend={meta.isWeekend}
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
                  subtitle={`${pickerTemplate?.name ?? ""} · ${formatDateShort(picker.date)}`}
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
          return (
            <button
              key={e.id}
              type="button"
              disabled={already}
              onClick={() => onPick(e.id)}
              className="shift-picker-item"
            >
              <span
                className="grid h-9 w-9 flex-none place-items-center rounded-full text-[12.5px] font-bold text-white"
                style={{ background: colorFor(e.id) }}
              >
                {initialsOf(e.full_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold leading-tight">{e.full_name}</span>
                <span className="shift-picker-pref" style={{ color: prefStatus.color }}>
                  {prefStatus.label}
                </span>
              </span>
              {already && <Badge tone="neutral">משובץ</Badge>}
            </button>
          );
        })}
      </div>
    </>
  );
}
