import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
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
import { SCHEDULER_ROLES } from "@/lib/constants";
import {
  formatShiftPrefsClose,
  formatShiftPrefsCloseRule,
  formatShiftPrefsOpen,
  formatShiftPrefsWindowRule,
  getShiftPrefsWindowStatus,
  isShiftPrefsOpenForWeek,
} from "@/lib/shift-deadline";
import type { Availability, Profile } from "@/types/database";

const AVAIL_META: Record<"available" | "cannot", { label: string; short: string; bg: string; color: string; border: string }> = {
  available: { label: "יכול", short: "יכול", bg: "var(--info-bg)", color: "var(--info)", border: "#bcd0ff" },
  cannot: { label: "לא יכול", short: "לא", bg: "var(--danger-bg)", color: "var(--danger)", border: "#f6caca" },
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
    <div className="shift-week-nav">
      <button type="button" onClick={() => onShift(7)} className="shift-week-nav-btn" aria-label="שבוע קודם">
        <Icon name="chevron_right" size={20} />
      </button>
      <span className="shift-week-nav-label">{formatDateShort(wkStart)} – {formatDateShort(end)}</span>
      <button type="button" onClick={() => onShift(-7)} className="shift-week-nav-btn" aria-label="שבוע הבא">
        <Icon name="chevron_left" size={20} />
      </button>
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
    <header className="page-hero">
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
}: {
  wk: string;
  value: number;
  onChange: (i: number) => void;
  stripId: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="shift-day-strip md:hidden">
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
      layout
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
      <div className="mx-auto max-w-[900px] animate-fadeUp">
        <EmptyState icon="schedule" title="אין משמרות פעילות" description="מנהל העסק צריך להפעיל משמרות בהגדרות העסק." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1240px] animate-fadeUp">
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
        {/* Phone: the week as a vertical rundown */}
        <div className="flex flex-col gap-2.5 md:hidden">
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

        {/* Desktop: week grid */}
        <Card className="hidden overflow-hidden !p-0 shadow-sm md:block">
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
      </motion.div>
    </div>
  );
}

function EmployeeConstraints({ templates }: { templates: NonNullable<ReturnType<typeof useActiveShiftTemplates>["data"]> }) {
  const businessId = useBusinessId();
  const { profile } = useAuth();
<<<<<<< HEAD
  const reduceMotion = useReducedMotion();
=======
  const { data: business } = useBusiness(businessId);
>>>>>>> 0da8c298dcac68eaedd310a6b1341c8017f1354f
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
      {setPref.isPending || clearPref.isPending ? (
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

<<<<<<< HEAD
      {/* Phone: pick a day, mark availability per shift */}
      <div className="md:hidden">
        <DayStrip wk={wk} value={dayIdx} onChange={setDayIdx} stripId="constraints" />
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
                      onSet={(v) => setAvailability(t.id, date, v)}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() => fillDay(dayIdx, "available")}
                className="rounded-[9px] px-2.5 py-1.5 text-[12px] font-bold text-info transition hover:[background:var(--info-bg)]"
              >
                סמן הכל — יכול
              </button>
              <button
                type="button"
                onClick={() => clearDay(dayIdx)}
                className="rounded-[9px] px-2.5 py-1.5 text-[12px] font-bold text-text-3 transition hover:bg-surface-2"
              >
                נקה יום
              </button>
            </div>
            {savingBar}
          </Card>
        </motion.div>
      </div>

      {/* Desktop: full week grid */}
      <Card className="hidden overflow-hidden !p-0 shadow-sm md:block">
=======
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

      <Card className="overflow-hidden !p-0 shadow-sm">
>>>>>>> 0da8c298dcac68eaedd310a6b1341c8017f1354f
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
<<<<<<< HEAD
        {savingBar}
=======

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
>>>>>>> 0da8c298dcac68eaedd310a6b1341c8017f1354f
      </Card>
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
<<<<<<< HEAD
      className={`flex gap-1 rounded-[10px] border p-1 transition ${horizontal ? "flex-row" : "min-h-[52px] flex-col"} ${saving ? "opacity-60" : ""}`}
=======
      className={`flex min-h-[52px] flex-col gap-1 rounded-[10px] border p-1 transition ${locked ? "opacity-60" : ""}`}
>>>>>>> 0da8c298dcac68eaedd310a6b1341c8017f1354f
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

function SchedulerView() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const reduceMotion = useReducedMotion();
  const [wk, setWk] = useState(weekStart());
  const [wkDir, setWkDir] = useState(1);
  const [dayIdx, setDayIdx] = useState(() => todayIdxInWeek(weekStart()));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { data: templates, isLoading: lt } = useActiveShiftTemplates(businessId);
  const { data: departments, isLoading: ld } = useDepartments(businessId);
  const { data: employees } = useProfiles(businessId);
  const { data: prefs } = useShiftPreferences(businessId, wk);
  const { data: assignments } = useShiftAssignments(businessId, wk, addDays(wk, 6));
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

  if (lt || ld) return <PageLoader />;

  if (!templates?.length || scheduleSections.length === 0) {
    return (
      <div className="mx-auto max-w-[900px] animate-fadeUp">
        <EmptyState
          icon="calendar_month"
          title="חסרה הגדרה לסידור"
          description="כדי לבנות סידור עבודה צריך להגדיר מחלקות ולהפעיל לפחות משמרת אחת בהגדרות העסק."
        />
      </div>
    );
  }

  const employeesInSection = (deptId: string | null) =>
    (employees ?? []).filter(
      (e) => e.active && (deptId ? e.department_id === deptId : !e.department_id)
    );

  const matchesSection = (deptId: string | null, a: { employee_id: string; department_id: string | null }) => {
    const empDept = empById.get(a.employee_id)?.department_id ?? null;
    if (deptId === null) return empDept === null;
    return a.department_id === deptId || (!a.department_id && empDept === deptId);
  };

  const assignmentsFor = (deptId: string | null, templateId: string, date: string) =>
    (assignments ?? []).filter(
      (a) => a.shift_template_id === templateId && a.shift_date === date && matchesSection(deptId, a)
    );

  const sectionWeekCount = (deptId: string | null) =>
    (assignments ?? []).filter((a) => matchesSection(deptId, a)).length;

  const totalAssignments = (assignments ?? []).length;

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
    <div className="mx-auto max-w-[1240px] animate-fadeUp">
      <ShiftPageHero
        title="סידור עבודה"
        subtitle="שיבוץ עובדים לפי מחלקות, משמרות ואילוצי זמינות."
        stats={
          <>
            <div className="page-hero-stat">
              <Icon name="event_available" size={18} style={{ color: "var(--accent-2)" }} />
              <span><strong>{totalAssignments}</strong> שיבוצים</span>
            </div>
            <div className="page-hero-stat">
              <Icon name="category" size={18} style={{ color: "var(--info)" }} />
              <span><strong>{scheduleSections.length}</strong> מחלקות</span>
            </div>
          </>
        }
      />

      <div className="shift-toolbar">
        <div className="shift-toolbar-meta">
          <ShiftLegend />
        </div>
        <WeekNav wkStart={wk} onShift={shiftWeek} onToday={goToday} />
      </div>

      {/* Phone: day-by-day scheduling */}
      <div className="md:hidden">
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
                      <strong>{employeesInSection(section.id).length}</strong> עובדים
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
                            onClick={() => setPicker({ dept: section.id, templateId: t.id, date })}
                          >
                            <Icon name="person_add" size={15} />
                            שיבוץ
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

      {/* Desktop: full week board per department */}
      <motion.div
        key={wk}
        initial={reduceMotion ? false : { opacity: 0, x: wkDir * 26 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="hidden flex-col gap-5 md:flex"
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
                    <strong>{employeesInSection(section.id).length}</strong> עובדים
                  </span>
                  <span className="shift-dept-stat">
                    <strong>{sectionWeekCount(section.id)}</strong> שיבוצים השבוע
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
                list={employeesInSection(picker.dept)}
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
      </AnimatePresence>
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
          const meta = pref ? AVAIL_META[pref] : null;
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
              <span className="flex-1 text-[13.5px] font-semibold">{e.full_name}</span>
              {already ? (
                <Badge tone="neutral">משובץ</Badge>
              ) : meta ? (
                <Badge tone={pref === "available" ? "info" : "danger"}>{meta.label}</Badge>
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );
}
