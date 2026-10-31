import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Badge, Button, Card, EmptyState, ErrorState, Icon, Input, PageLoader, TimePicker } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
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
  useSetRowAssignment,
  useRemoveAssignment,
  useCreateShiftTemplate,
  useUpdateShiftTemplate,
  useReplaceShiftTemplateDays,
  useDeleteShiftTemplate,
} from "@/api/shifts";
import { useIsMdUp } from "@/hooks/useMediaQuery";
import { ROLE_LABELS, SCHEDULER_ROLES } from "@/lib/constants";
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
import { MAX_ASSIGNED_DAYS_PER_WEEK, WEEKLY_DAY_OFF_ERROR } from "@/lib/shift-assignment-limits";
import { getHebrewDayInfo } from "@/lib/hebrewCalendar";
import {
  assignmentsByRowCell,
  buildEmployeePrefMap,
  buildTeamPrefMap,
  copyRowDays,
  employeesForSection,
  isManagementDepartment,
  templatesForStaff,
  unplacedEmployeeCount,
  nextRowSortOrder,
  pickerCandidates,
  initialRowDraft,
  rowDaysFor,
  rowHeadlineHours,
  rowPref,
  setRowDraftPerDay,
  validateRowDraft,
  type RowDraft,
  type PrefMark,
} from "@/lib/shiftRows";
import {
  shiftSectionKey,
  sortShiftTemplates,
  templatesForDepartment,

} from "@/lib/shiftTemplates";
import {
  dayIndexFromISO,
  formatHours,
  hhmm,
  hoursOnDay,
  uniformHoursLabel,
  weekWindows,
  windowsOnDay,
  type ShiftWindow,
} from "@/lib/shiftTemplateHours";
import type { Availability, Profile, ShiftAssignment, ShiftTemplate } from "@/types/database";

const HE_DAY_LETTERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

const AVAIL_META: Record<"available" | "cannot", { label: string; short: string; bg: string; color: string; border: string }> = {
  available: { label: "יכול", short: "יכול", bg: "var(--info-bg)", color: "var(--info)", border: "#bcd0ff" },
  cannot: { label: "לא יכול", short: "לא", bg: "var(--danger-bg)", color: "var(--danger)", border: "#f6caca" },
};

const PREF_STATUS: Record<"available" | "cannot" | "none", { label: string; color: string }> = {
  available: { label: "יכול", color: "var(--info)" },
  cannot: { label: "לא יכול", color: "var(--danger)" },
  none: { label: "לא סימן עדיין", color: "var(--text-3)" },
};


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

function rowHoursText(template: ShiftTemplate): string {
  return uniformHoursLabel(template) ?? "שעות לפי יום";
}

/** The day's hours, shown in the cell only when they differ from the row label. */
function variedDayHours(template: ShiftTemplate, dayIndex: number): string | null {
  const label = formatHours(hoursOnDay(template, dayIndex));
  const uniform = uniformHoursLabel(template);
  if (!label || (uniform && label === uniform)) return null;
  return label;
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
  maxWeekStart,
}: {
  wkStart: string;
  onShift: (d: number) => void;
  /** When set, blocks navigating past this week (ISO Sunday). */
  maxWeekStart?: string;
}) {
  const end = addDays(wkStart, 6);
  const atMax = maxWeekStart != null && wkStart >= maxWeekStart;
  return (
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
  onShiftWeek,
  maxWeekStart,
}: {
  wk: string;
  value: number;
  onChange: (i: number) => void;
  stripId: string;
  dayComplete?: (dayIndex: number) => boolean;
  onShiftWeek?: (deltaDays: number) => void;
  /** When set, blocks navigating past this week (ISO Sunday). */
  maxWeekStart?: string;
}) {
  const reduceMotion = useReducedMotion();
  const atMax = maxWeekStart != null && wk >= maxWeekStart;
  return (
    <div className="shift-day-strip" data-with-nav={onShiftWeek ? "true" : undefined}>
      {onShiftWeek && (
        <button
          type="button"
          className="shift-day-strip-nav"
          onClick={() => onShiftWeek(7)}
          aria-label="שבוע קודם"
        >
          <Icon name="chevron_right" size={18} />
        </button>
      )}
      <div className="shift-day-strip-days">
        {HE_DAY_LETTERS.map((d, i) => {
          const meta = dayMeta(wk, i);
          const active = i === value;
          const dayLabel = HE_DAYS[i];
          const pillTitle = meta.holiday
            ? `${dayLabel} · ${meta.hebrewDate} · ${meta.holiday}`
            : `${dayLabel} · ${meta.hebrewDate}`;
          return (
            <button
              key={i}
              type="button"
              className="shift-day-pill"
              data-active={active}
              data-holiday={!!meta.holiday}
              data-major-holiday={meta.isMajorHoliday}
              title={pillTitle}
              aria-label={pillTitle}
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
      {onShiftWeek && (
        <button
          type="button"
          className="shift-day-strip-nav"
          onClick={() => onShiftWeek(-7)}
          aria-label="שבוע הבא"
          disabled={atMax}
        >
          <Icon name="chevron_left" size={18} />
        </button>
      )}
    </div>
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
  useShiftAssignments(businessId, weekStart(), addDays(weekStart(), 6));
  useShiftPreferences(businessId, addDays(weekStart(), 7), profile?.id);
  useProfiles(businessId);
  const { data: departments } = useDepartments(businessId);

  // Rows of the employee's own department, plus the management department's
  // rows for department/shift managers — these are the rows they submit
  // availability for.
  const myTemplates = useMemo(
    () => templatesForStaff(templates ?? [], profile, departments ?? []),
    [templates, profile, departments],
  );

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
        <EmployeeConstraints templates={myTemplates} />
        <EmployeeSchedule templates={myTemplates} allTemplates={templates} collapsed />
      </div>
    );
  }

  return (
    <div className="w-full animate-fadeUp">
      <ShiftPageHero
        title="משמרות"
        subtitle="סידור העבודה של המחלקה ועדכון זמינות לשבוע הבא."
      />
      <EmployeeSchedule templates={myTemplates} allTemplates={templates} />
      <div className="page-section-label mt-8">
        העדפות זמינות <span>לשבוע הבא</span>
      </div>
      <EmployeeConstraints templates={myTemplates} />
    </div>
  );
}

function EmployeeSchedule({
  templates,
  allTemplates,
  collapsed = false,
}: {
  /** The employee's own shifts (department or general). */
  templates: ShiftTemplate[];
  /** Every active shift in the business — so an assignment to a shift outside
   *  the employee's department still shows up. */
  allTemplates: ShiftTemplate[];
  collapsed?: boolean;
}) {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const reduceMotion = useReducedMotion();
  const isDesktop = useIsMdUp();
  const [wk, setWk] = useState(weekStart());
  const [wkDir, setWkDir] = useState(1);
  // The whole week's roster — employees see who is in every row of their department.
  const { data: assignments, isLoading } = useShiftAssignments(businessId, wk, addDays(wk, 6));
  const { data: people } = useProfiles(businessId);

  const nameById = useMemo(() => new Map((people ?? []).map((p) => [p.id, p.full_name])), [people]);

  const myAssignments = useMemo(
    () => (assignments ?? []).filter((a) => a.employee_id === profile?.id),
    [assignments, profile?.id],
  );

  const assignMap = useMemo(() => {
    const m = new Set<string>();
    myAssignments.forEach((a) => m.add(`${a.shift_template_id}_${a.shift_date}`));
    return m;
  }, [myAssignments]);

  // Who sits in each row on each day.
  const occupantByCell = useMemo(() => {
    const m = new Map<string, string>();
    (assignments ?? []).forEach((a) => m.set(`${a.shift_template_id}_${a.shift_date}`, a.employee_id));
    return m;
  }, [assignments]);

  // Own department's rows first; rows from other departments only when I'm in them.
  const rows = useMemo(() => {
    const own = new Set(templates.map((t) => t.id));
    const assignedIds = new Set(myAssignments.map((a) => a.shift_template_id));
    const extra = allTemplates.filter((t) => !own.has(t.id) && assignedIds.has(t.id));
    return [...templates, ...sortShiftTemplates(extra)];
  }, [templates, allTemplates, myAssignments]);

  const assignedCount = myAssignments.length;

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
            סידור העבודה <span>{formatDateShort(wk)} – {formatDateShort(addDays(wk, 6))}</span>
          </div>
          <div className="shift-toolbar">
            <ShiftLegend />
            <WeekNav wkStart={wk} onShift={shiftWeek} />
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
                <WeekNav wkStart={wk} onShift={shiftWeek} />
              </div>
            )}
            {HE_DAYS.map((d, i) => {
              const meta = dayMeta(wk, i);
              const dayTemplates = rows.filter((t) => assignMap.has(`${t.id}_${meta.date}`));
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
                          {t.name} · <bdi dir="ltr">{formatHours(hoursOnDay(t, i)) ?? t.start_time?.slice(0, 5)}</bdi>
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
                {rows.length === 0 && (
                  <div className="shift-grid-row">
                    <div className="shift-dept-empty" style={{ gridColumn: "1 / -1" }}>
                      <Icon name="schedule" size={16} />
                      <span>עדיין לא הוגדרו משמרות למחלקה שלך.</span>
                    </div>
                  </div>
                )}
                {rows.map((t) => (
                  <div key={t.id} className="shift-grid-row">
                    <div className="shift-grid-row-label">
                      <div className="shift-shift-name">
                        <span className="shift-shift-dot" style={colorDotStyle(t.color, 2)} />
                        {t.name}
                      </div>
                      <span className="shift-shift-time">{rowHoursText(t)}</span>
                    </div>
                    {HE_DAYS.map((_, i) => {
                      const meta = dayMeta(wk, i);
                      const occupant = occupantByCell.get(`${t.id}_${meta.date}`);
                      const mine = !!occupant && occupant === profile?.id;
                      const hours = hoursOnDay(t, i);
                      const varied = variedDayHours(t, i);
                      return (
                        <div
                          key={i}
                          className="shift-grid-cell flex items-center justify-center !min-h-[3.25rem]"
                          data-today={meta.isToday}
                          data-weekend={meta.isWeekend}
                          data-holiday={!!meta.holiday}
                          data-off={!hours && !occupant}
                        >
                          {varied && <bdi dir="ltr" className="shift-cell-time">{varied}</bdi>}
                          {mine ? (
                            <span className="shift-assigned-badge">
                              <Icon name="check_circle" size={15} />
                              אני
                            </span>
                          ) : occupant ? (
                            <span className="shift-roster-name">{nameById.get(occupant)?.split(" ")[0] ?? "עובד"}</span>
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
            {myAssignments.length === 0 && (
              <div className="border-t border-border px-5 py-4 text-[13px] text-text-3">
                אין לך משמרות משובצות לשבוע זה.
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

function EmployeeConstraints({ templates }: { templates: ShiftTemplate[] }) {
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

  // Keyed by hours window + date: one mark covers every row with those hours.
  const prefMap = useMemo(() => buildEmployeePrefMap(prefs ?? []), [prefs]);

  const dayWindows = useMemo(() => HE_DAYS.map((_, i) => windowsOnDay(templates, i)), [templates]);
  const gridWindows = useMemo(() => weekWindows(templates), [templates]);
  const idsForDay = (dayIndex: number) => dayWindows[dayIndex].map((w) => w.key);
  const totalDays = 7;
  const filledDays = useMemo(() => {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const ids = idsForDay(i);
      if (ids.length === 0 || isShiftPrefsDayComplete(wk, i, ids, prefMap)) n++;
    }
    return n;
  }, [wk, templates, prefMap]);

  const minimumRules = {
    minWeekdays: business?.shift_prefs_min_weekdays ?? null,
    minWeekend: business?.shift_prefs_min_weekend ?? null,
  };
  const hasMinimum = hasShiftPrefsMinimumRules(minimumRules);
  const minimumStatus = useMemo(
    () => getShiftPrefsMinimumStatus(wk, idsForDay, prefMap, minimumRules),
    [wk, templates, prefMap, minimumRules.minWeekdays, minimumRules.minWeekend],
  );
  const dayComplete = (dayIndex: number) => {
    const ids = idsForDay(dayIndex);
    if (ids.length === 0) return true;
    return isShiftPrefsDayComplete(wk, dayIndex, ids, prefMap);
  };

  /** Max target week for submission: one week ahead (not two). */
  function shiftWeek(d: number) {
    setWk((w) => {
      const next = addDays(w, d);
      return next > nextWk ? nextWk : next;
    });
    setDayIdx(0);
  }

  async function setAvailability(window: ShiftWindow, date: string, value: Availability | null) {
    if (!profile?.id || !businessId || !canEdit) return;
    const key = `${window.key}_${date}`;
    setPending((s) => new Set(s).add(key));
    setSaveError(null);
    try {
      if (value === null) {
        await clearPref.mutateAsync({
          employee_id: profile.id,
          shift_date: date,
          start_time: window.start,
          end_time: window.end,
        });
      } else {
        await setPref.mutateAsync({
          business_id: businessId,
          employee_id: profile.id,
          week_start: wk,
          shift_date: date,
          start_time: window.start,
          end_time: window.end,
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
    await Promise.all(dayWindows[dayIndex].map((w) => setAvailability(w, addDays(wk, dayIndex), value)));
  }

  async function clearDay(dayIndex: number) {
    await Promise.all(dayWindows[dayIndex].map((w) => setAvailability(w, addDays(wk, dayIndex), null)));
  }

  if (isLoading) return <PageLoader label="טוען אילוצים..." />;
  if (error) return <ErrorState message="לא ניתן לטעון את האילוצים" onRetry={() => refetch()} />;
  if (templates.length === 0) {
    return (
      <EmptyState
        icon="schedule"
        title="אין משמרות למחלקה שלך"
        description="מנהל העסק צריך להגדיר משמרות למחלקה שלך בהגדרות העסק."
      />
    );
  }

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

  return (
    <div>
      {!isDesktop ? (
        <section className="payroll-hero prefs-hero prefs2-hero">
          <div className="payroll-hero-top">
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
          <WeekNav wkStart={wk} onShift={shiftWeek} maxWeekStart={nextWk} />
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
        <DayStrip
          wk={wk}
          value={dayIdx}
          onChange={setDayIdx}
          stripId="constraints"
          dayComplete={dayComplete}
          onShiftWeek={shiftWeek}
          maxWeekStart={nextWk}
        />
        <SelectedDayHolidayNote wk={wk} dayIdx={dayIdx} />
        <motion.div
          key={`${wk}-${dayIdx}`}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 32 }}
        >
          <div className="prefs2-list">
            {dayWindows[dayIdx].length === 0 && (
              <p className="shift-dept-empty">אין משמרות ביום זה.</p>
            )}
            {dayWindows[dayIdx].map((w, idx) => {
              const hours = { start: w.start, end: w.end };
              const date = addDays(wk, dayIdx);
              const key = `${w.key}_${date}`;
              const val = prefMap.get(key) ?? null;
              const saving = pending.has(key);
              const duration = shiftDurationLabel(hours.start, hours.end);
              return (
                <div
                  key={w.key}
                  className="prefs2-card"
                  data-state={val ?? "none"}
                  data-editable={canEdit ? "true" : "false"}
                  style={{ "--shift-color": w.color ?? "var(--accent)", "--enter-delay": `${idx * 45}ms` } as CSSProperties}
                >
                  <div className="prefs2-card-head">
                    <span className="prefs2-card-icon">
                      <Icon name={shiftTimeIcon(hours.start)} size={18} />
                    </span>
                    <div className="prefs2-card-titles">
                      <span className="prefs2-card-name">{w.names.join(" · ")}</span>
                      <span className="prefs2-card-time">
                        <Icon name="schedule" size={12} />
                        <bdi dir="ltr">{formatHours(hours)}</bdi>
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
                        onClick={() => setAvailability(w, date, val === "available" ? null : "available")}
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
                        onClick={() => setAvailability(w, date, val === "cannot" ? null : "cannot")}
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
                        className="rounded-md px-1.5 py-0.5 text-[11.5px] font-bold text-info transition hover:[background:var(--info-bg)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        הכל יכול
                      </button>
                      <button
                        type="button"
                        title="נקה יום"
                        disabled={!canEdit}
                        onClick={() => clearDay(i)}
                        className="rounded-md px-1.5 py-0.5 text-[11.5px] font-bold text-text-3 transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        נקה
                      </button>
                    </div>
                  </ShiftDayHead>
                );
              })}
            </div>

            {gridWindows.map((w) => (
              <div key={w.key} className="shift-grid-row">
                <div className="shift-grid-row-label">
                  <div className="shift-shift-name">
                    <span className="shift-shift-dot" style={colorDotStyle(w.color, 2)} />
                    {w.names.join(" · ")}
                  </div>
                  <span className="shift-shift-time">{formatHours(w)}</span>
                </div>

                {HE_DAYS.map((_, i) => {
                  const date = addDays(wk, i);
                  const key = `${w.key}_${date}`;
                  const cur = prefMap.get(key) ?? null;
                  const isSaving = pending.has(key);
                  const meta = dayMeta(wk, i);
                  const runs = dayWindows[i].some((d) => d.key === w.key);
                  return (
                    <div
                      key={i}
                      className="shift-grid-cell"
                      data-today={meta.isToday}
                      data-weekend={meta.isWeekend}
                      data-holiday={!!meta.holiday}
                      data-off={!runs}
                    >
                      {runs ? (
                        <AvailabilityCell
                          value={cur}
                          saving={isSaving}
                          disabled={!canEdit}
                          onSet={(v) => setAvailability(w, date, v)}
                        />
                      ) : (
                        <span className="shift-cell-off">—</span>
                      )}
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
        className={`seg-btn flex flex-1 items-center justify-center gap-1 rounded-[7px] text-[12.5px] font-bold transition ${horizontal ? "py-2 text-[12.5px]" : "py-1.5"}`}
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
        className={`seg-btn flex flex-1 items-center justify-center gap-1 rounded-[7px] text-[12.5px] font-bold transition ${horizontal ? "py-2 text-[12.5px]" : "py-1.5"}`}
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
/** The cell the picker fills: one row on one date. Each row holds a single employee. */
type PickerState = {
  dept: string | null;
  isManagement: boolean;
  template: ShiftTemplate;
  date: string;
  current: ShiftAssignment | null;
};
type SchedulerTab = "assignments" | "constraints";
/** One department block in the scheduler, with its own rows. */
type ScheduleSection = { id: string; name: string; color: string; isManagement: boolean; templates: ShiftTemplate[] };
/** Adding a row to a department (template = null) or editing an existing one. */
type RowEditorState = { section: ScheduleSection; template: ShiftTemplate | null };

/* Shown inside a department block that has no rows yet. */
function SectionNoShifts() {
  return (
    <div className="shift-dept-empty">
      <Icon name="schedule" size={16} />
      <span>עדיין אין שורות במחלקה זו.</span>
    </div>
  );
}

/* The "+" under each department: adds a row (name + hours) for one employee. */
function AddRowButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="shift-add-row" onClick={onClick}>
      <Icon name="add" size={18} />
      הוספת שורה
    </button>
  );
}

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

/* The employee sitting in a row on a day — tap the name to swap, × to clear. */
function RowOccupant({
  employeeId,
  name,
  conflict,
  onReplace,
  onRemove,
}: {
  employeeId: string;
  name?: string | null;
  /** The employee marked "can't" for these hours. */
  conflict: boolean;
  onReplace: () => void;
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
      data-conflict={conflict || undefined}
      title={conflict ? "העובד סימן שלא יכול בשעות האלה" : undefined}
    >
      <button type="button" className="shift-assign-swap" onClick={onReplace} aria-label="החלפת עובד">
        <span className="shift-assign-avatar" style={{ background: colorFor(employeeId) }}>
          {initialsOf(name)}
        </span>
        <span className="shift-assign-name">{name?.split(" ")[0]}</span>
      </button>
      {conflict && <Icon name="error" size={15} className="shift-assign-conflict" />}
      <button type="button" onClick={onRemove} className="shift-assign-remove" aria-label="הסר שיבוץ">
        <Icon name="close" size={14} />
      </button>
    </motion.div>
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
  window,
  available,
  cannot,
}: {
  window: ShiftWindow;
  available: Profile[];
  cannot: Profile[];
}) {
  const total = available.length + cannot.length;
  const shiftColor = window.color ?? "var(--accent)";

  return (
    <div className="shift-mobile-constraint-row" style={{ "--shift-color": shiftColor } as CSSProperties}>
      <div className="shift-mobile-constraint-head">
        <div className="shift-mobile-constraint-title">
          <span className="shift-mobile-constraint-dot" style={colorDotStyle(shiftColor, 2)} />
          <span className="shift-mobile-constraint-name">{window.names.join(" · ")}</span>
          <bdi dir="ltr" className="shift-mobile-constraint-time">{formatHours(window)}</bdi>
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

type SectionWindows = { week: ShiftWindow[]; days: ShiftWindow[][] };
const NO_WINDOWS: SectionWindows = { week: [], days: HE_DAYS.map(() => []) };

/**
 * Constraints are submitted per hours window, so this board shows one row per
 * distinct window in the department — duplicated rows collapse into one.
 */
function SchedulerConstraintsBoard({
  wk,
  wkDir,
  dayIdx,
  setDayIdx,
  onShiftWeek,
  scheduleSections,
  employeesBySection,
  prefMap,
  reduceMotion,
  isDesktop,
}: {
  wk: string;
  wkDir: number;
  dayIdx: number;
  setDayIdx: (i: number) => void;
  onShiftWeek: (deltaDays: number) => void;
  scheduleSections: ScheduleSection[];
  employeesBySection: Map<string, Profile[]>;
  prefMap: Map<string, "available" | "cannot">;
  reduceMotion: boolean | null;
  isDesktop: boolean;
}) {
  const windowsBySection = useMemo(() => {
    const m = new Map<string, SectionWindows>();
    for (const section of scheduleSections) {
      m.set(shiftSectionKey(section.id), {
        week: weekWindows(section.templates),
        days: HE_DAYS.map((_, i) => windowsOnDay(section.templates, i)),
      });
    }
    return m;
  }, [scheduleSections]);

  const windowsFor = (deptId: string | null) => windowsBySection.get(shiftSectionKey(deptId)) ?? NO_WINDOWS;

  const cellConstraints = useMemo(() => {
    const m = new Map<string, { available: Profile[]; cannot: Profile[] }>();
    const weekCounts = new Map<string, number>();
    for (const section of scheduleSections) {
      const sectionKey = shiftSectionKey(section.id);
      const list = employeesBySection.get(sectionKey) ?? [];
      const days = windowsBySection.get(sectionKey)?.days ?? NO_WINDOWS.days;
      let n = 0;
      days.forEach((windows, i) => {
        const date = addDays(wk, i);
        for (const w of windows) {
          const available: Profile[] = [];
          const cannot: Profile[] = [];
          for (const e of list) {
            const status = prefMap.get(`${e.id}_${w.key}_${date}`);
            if (status === "available") available.push(e);
            else if (status === "cannot") cannot.push(e);
          }
          n += available.length + cannot.length;
          m.set(`${sectionKey}_${w.key}_${date}`, { available, cannot });
        }
      });
      weekCounts.set(sectionKey, n);
    }
    return { byCell: m, weekCounts };
  }, [scheduleSections, employeesBySection, windowsBySection, wk, prefMap]);

  const constraintsFor = (deptId: string | null, key: string, date: string) =>
    cellConstraints.byCell.get(`${shiftSectionKey(deptId)}_${key}_${date}`) ?? { available: [], cannot: [] };

  return (
    <>
      {!isDesktop ? (
      <div className="shift-constraints-mobile">
        <DayStrip
          wk={wk}
          value={dayIdx}
          onChange={setDayIdx}
          stripId="constraints-board"
          onShiftWeek={onShiftWeek}
        />
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
            const windows = windowsFor(section.id).days[dayIdx];
            const dayMarked = windows.reduce((n, w) => {
              const { available, cannot } = constraintsFor(section.id, w.key, date);
              return n + available.length + cannot.length;
            }, 0);
            return (
              <div
                key={shiftSectionKey(section.id)}
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
                  {section.templates.length === 0 && <SectionNoShifts />}
                  {windows.map((w) => {
                    const { available, cannot } = constraintsFor(section.id, w.key, date);
                    return <MobileConstraintShiftRow key={w.key} window={w} available={available} cannot={cannot} />;
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
        {scheduleSections.map((section, sectionIndex) => {
          const sectionKey = shiftSectionKey(section.id);
          const windows = windowsFor(section.id);
          return (
            <div
              key={sectionKey}
              className="shift-dept-card shift-section-enter"
              style={{ "--dept-color": section.color, "--enter-delay": `${sectionIndex * 70}ms` } as CSSProperties}
            >
              <div className="shift-dept-header" style={{ cursor: "default" }}>
                <span className="shift-dept-dot" style={colorDotStyle(section.color)} />
                <span className="shift-dept-name">{section.name}</span>
                <div className="shift-dept-stats">
                  <span className="shift-dept-stat">
                    <strong>{employeesBySection.get(sectionKey)?.length ?? 0}</strong> עובדים
                  </span>
                  <span className="shift-dept-stat">
                    <strong>{cellConstraints.weekCounts.get(sectionKey) ?? 0}</strong> אילוצים השבוע
                  </span>
                </div>
              </div>
              {windows.week.length === 0 ? (
                <SectionNoShifts />
              ) : (
              <div className="shift-grid-wrap">
                <div className="shift-grid">
                  <div className="shift-grid-head">
                    <div className="shift-grid-corner">שעות</div>
                    {HE_DAYS.map((d, i) => (
                      <ShiftDayHead key={i} name={d} meta={dayMeta(wk, i)} />
                    ))}
                  </div>
                  {windows.week.map((w) => (
                    <div key={w.key} className="shift-grid-row">
                      <div className="shift-grid-row-label">
                        <div className="shift-shift-name">
                          <span className="shift-shift-dot" style={colorDotStyle(w.color, 2)} />
                          {w.names.join(" · ")}
                        </div>
                        <span className="shift-shift-time">{formatHours(w)}</span>
                      </div>
                      {HE_DAYS.map((_, i) => {
                        const date = addDays(wk, i);
                        const runs = windows.days[i].some((d) => d.key === w.key);
                        const { available, cannot } = constraintsFor(section.id, w.key, date);
                        const meta = dayMeta(wk, i);
                        const empty = !runs || (available.length === 0 && cannot.length === 0);
                        return (
                          <div
                            key={i}
                            className="shift-grid-cell shift-constraint-cell"
                            data-today={meta.isToday}
                            data-weekend={meta.isWeekend}
                            data-holiday={!!meta.holiday}
                            data-empty={empty}
                            data-off={!runs}
                          >
                            {empty ? (
                              <span className="text-[12px] font-semibold text-text-3">—</span>
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
              )}
            </div>
          );
        })}
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
  const setRowAssignment = useSetRowAssignment(businessId);
  const removeAssign = useRemoveAssignment(businessId);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [rowEditor, setRowEditor] = useState<RowEditorState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // employee + hours window + date → what they marked.
  const prefMap = useMemo(() => buildTeamPrefMap(prefs ?? []), [prefs]);

  const empById = useMemo(() => {
    const m = new Map<string, Profile>();
    (employees ?? []).forEach((e) => m.set(e.id, e));
    return m;
  }, [employees]);

  const activeDepartments = useMemo(
    () => (departments ?? []).filter((d) => d.active),
    [departments]
  );

  const scheduleSections = useMemo<ScheduleSection[]>(() => {
    const all = templates ?? [];
    return activeDepartments.map((d) => ({
      id: d.id,
      name: d.name,
      color: d.color ?? "#7c3aed",
      isManagement: isManagementDepartment(d),
      templates: templatesForDepartment(all, d.id),
    }));
  }, [activeDepartments, templates]);

  const unassignedCount = useMemo(
    () => unplacedEmployeeCount(employees ?? [], activeDepartments),
    [employees, activeDepartments],
  );

  // A management department also lists department managers and shift managers.
  const employeesBySection = useMemo(() => {
    const m = new Map<string, Profile[]>();
    for (const section of scheduleSections) {
      m.set(
        shiftSectionKey(section.id),
        employeesForSection(employees ?? [], { id: section.id, name: section.name, is_management: section.isManagement }),
      );
    }
    return m;
  }, [scheduleSections, employees]);

  // One employee per row per day.
  const assignmentByCell = useMemo(
    () => assignmentsByRowCell(assignments ?? [], templates ?? []),
    [assignments, templates],
  );

  useEffect(() => {
    if (!picker) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [picker]);

  if (lt || ld || le || (viewMode === "assignments" ? la : lp)) return <PageLoader />;

  if (!templates || scheduleSections.length === 0) {
    return (
      <div className="w-full animate-fadeUp">
        <EmptyState
          icon="calendar_month"
          title="חסרה הגדרה לסידור"
          description="כדי לבנות סידור עבודה צריך להגדיר מחלקות בהגדרות העסק. את השורות של כל מחלקה מוסיפים כאן, בסידור."
        />
      </div>
    );
  }

  const assignmentFor = (templateId: string, date: string) =>
    assignmentByCell.byCell.get(`${templateId}_${date}`) ?? null;

  function shiftWeek(d: number) {
    const next = addDays(wk, d);
    setWkDir(d > 0 ? 1 : -1);
    setWk(next);
    setDayIdx(todayIdxInWeek(next));
  }

  function toggleSection(key: string) {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  function openPicker(section: ScheduleSection, template: ShiftTemplate, date: string) {
    setActionError(null);
    setPicker({
      dept: section.id,
      isManagement: section.isManagement,
      template,
      date,
      current: assignmentFor(template.id, date),
    });
  }

  function removeAssignment(id: string) {
    setActionError(null);
    removeAssign.mutate(id, { onError: () => setActionError("לא ניתן להסיר את השיבוץ. נסו שוב.") });
  }

  function occupantFor(section: ScheduleSection, t: ShiftTemplate, date: string, a: ShiftAssignment) {
    return (
      <RowOccupant
        key={a.id}
        employeeId={a.employee_id}
        name={empById.get(a.employee_id)?.full_name}
        conflict={rowPref(prefMap, a.employee_id, t, date) === "cannot"}
        onReplace={() => openPicker(section, t, date)}
        onRemove={() => removeAssignment(a.id)}
      />
    );
  }

  return (
    <div className="w-full animate-fadeUp">
      <div className="shift-scheduler-head mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SchedulerModeToggle value={viewMode} onChange={setViewMode} />
        {isDesktop && <WeekNav wkStart={wk} onShift={shiftWeek} />}
      </div>

      {unassignedCount > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-[11px] border border-border bg-surface-2 px-3.5 py-2.5 text-[13px] font-semibold text-text-2">
          <Icon name="group" size={18} />
          {unassignedCount} עובדים בלי מחלקה לא מופיעים בסידור. שייכו אותם למחלקה בעמוד המשתמשים.
        </div>
      )}

      {actionError && (
        <div className="mb-3 flex items-center gap-2 rounded-[11px] border border-danger/30 [background:var(--danger-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-danger">
          <Icon name="error" size={18} />
          {actionError}
        </div>
      )}

      {viewMode === "constraints" ? (
        <SchedulerConstraintsBoard
          wk={wk}
          wkDir={wkDir}
          dayIdx={dayIdx}
          setDayIdx={setDayIdx}
          onShiftWeek={shiftWeek}
          scheduleSections={scheduleSections}
          employeesBySection={employeesBySection}
          prefMap={prefMap}
          reduceMotion={reduceMotion}
          isDesktop={isDesktop}
        />
      ) : (
        <>
      {!isDesktop ? (
      <div>
        <DayStrip
          wk={wk}
          value={dayIdx}
          onChange={setDayIdx}
          stripId="scheduler"
          onShiftWeek={shiftWeek}
        />
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
                key={shiftSectionKey(section.id)}
                className="shift-dept-card"
                style={{ "--dept-color": section.color } as CSSProperties}
              >
                <div className="shift-dept-header" style={{ cursor: "default" }}>
                  <span className="shift-dept-dot" style={colorDotStyle(section.color)} />
                  <span className="shift-dept-name">{section.name}</span>
                  <div className="shift-dept-stats">
                    <span className="shift-dept-stat">
                      <strong>{employeesBySection.get(shiftSectionKey(section.id))?.length ?? 0}</strong> עובדים
                    </span>
                  </div>
                </div>
                <div>
                  {section.templates.length === 0 && <SectionNoShifts />}
                  {section.templates.map((t) => {
                    const a = assignmentFor(t.id, date);
                    const hours = hoursOnDay(t, dayIdx);
                    return (
                      <div
                        key={t.id}
                        className="shift-mobile-shift"
                        style={{ "--shift-color": t.color ?? "var(--accent)" } as CSSProperties}
                      >
                        <div className="shift-mobile-shift-head">
                          <button
                            type="button"
                            className="shift-row-edit"
                            onClick={() => setRowEditor({ section, template: t })}
                            aria-label={`עריכת ${t.name}`}
                          >
                            <span className="shift-mobile-shift-name">{t.name}</span>
                            <Icon name="edit" size={14} className="shift-row-edit-icon" />
                          </button>
                          <span className="shift-shift-time">{formatHours(hours) ?? "לא פעיל"}</span>
                        </div>
                        <div className="shift-mobile-chips">
                          <AnimatePresence initial={false}>
                            {a && occupantFor(section, t, date, a)}
                          </AnimatePresence>
                          {!a &&
                            (hours ? (
                              <button
                                type="button"
                                className="shift-mobile-add"
                                aria-label="שיבוץ עובד"
                                onClick={() => openPicker(section, t, date)}
                              >
                                <Icon name="person_add" size={18} />
                              </button>
                            ) : (
                              <span className="shift-cell-off">אין משמרת ביום זה</span>
                            ))}
                        </div>
                      </div>
                    );
                  })}
                  <AddRowButton onClick={() => setRowEditor({ section, template: null })} />
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
          const sectionKey = shiftSectionKey(section.id);
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
                    <strong>{section.templates.length}</strong> שורות
                  </span>
                  <span className="shift-dept-stat">
                    <strong>{employeesBySection.get(sectionKey)?.length ?? 0}</strong> עובדים
                  </span>
                  <span className="shift-dept-stat">
                    <strong>{assignmentByCell.weekCounts.get(sectionKey) ?? 0}</strong> שיבוצים השבוע
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
                {section.templates.length === 0 ? (
                  <SectionNoShifts />
                ) : (
                <div className="shift-grid-wrap">
                  <div className="shift-grid">
                    <div className="shift-grid-head">
                      <div className="shift-grid-corner">משמרת</div>
                      {HE_DAYS.map((d, i) => (
                        <ShiftDayHead key={i} name={d} meta={dayMeta(wk, i)} />
                      ))}
                    </div>
                    {section.templates.map((t) => (
                      <div key={t.id} className="shift-grid-row">
                        <div className="shift-grid-row-label">
                          <button
                            type="button"
                            className="shift-row-edit"
                            onClick={() => setRowEditor({ section, template: t })}
                            aria-label={`עריכת ${t.name}`}
                          >
                            <span className="shift-shift-name">
                              <span className="shift-shift-dot" style={colorDotStyle(t.color, 2)} />
                              {t.name}
                              <Icon name="edit" size={14} className="shift-row-edit-icon" />
                            </span>
                            <span className="shift-shift-time">{rowHoursText(t)}</span>
                          </button>
                        </div>
                        {HE_DAYS.map((_, i) => {
                          const date = addDays(wk, i);
                          const a = assignmentFor(t.id, date);
                          const meta = dayMeta(wk, i);
                          const hours = hoursOnDay(t, i);
                          const varied = variedDayHours(t, i);
                          return (
                            <div
                              key={i}
                              className="shift-grid-cell"
                              data-today={meta.isToday}
                              data-weekend={meta.isWeekend}
                              data-holiday={!!meta.holiday}
                              data-empty={!!hours && !a}
                              data-off={!hours}
                            >
                              {varied && <bdi dir="ltr" className="shift-cell-time">{varied}</bdi>}
                              <AnimatePresence initial={false}>
                                {a && occupantFor(section, t, date, a)}
                              </AnimatePresence>
                              {!a &&
                                (hours ? (
                                  <button
                                    type="button"
                                    onClick={() => openPicker(section, t, date)}
                                    className="shift-add-btn"
                                    aria-label="שיבוץ עובד"
                                  >
                                    <Icon name="add" size={18} />
                                  </button>
                                ) : (
                                  <span className="shift-cell-off">—</span>
                                ))}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                )}
                <AddRowButton onClick={() => setRowEditor({ section, template: null })} />
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
                    const hours = formatHours(hoursOnDay(picker.template, dayIndexFromISO(picker.date)));
                    // Isolate the range so RTL text doesn't flip it to "01:00–19:30".
                    return [picker.template.name, hours && `⁦${hours}⁩`, formatDateShort(picker.date), he.holiday ?? he.hebrewDate]
                      .filter(Boolean)
                      .join(" · ");
                  })()}
                  list={employeesBySection.get(shiftSectionKey(picker.dept)) ?? []}
                  teamPrefs={prefMap}
                  assignments={assignments ?? []}
                  templates={templates}
                  assigning={setRowAssignment.isPending}
                  onClose={() => setPicker(null)}
                  onPick={(employeeId) => {
                    setActionError(null);
                    setRowAssignment.mutate(
                      {
                        business_id: businessId!,
                        department_id: picker.dept,
                        employee_id: employeeId,
                        shift_date: picker.date,
                        shift_template_id: picker.template.id,
                        assigned_by: profile?.id ?? null,
                      },
                      {
                        onError: (e) => {
                          console.error("[shifts] saving assignment failed", e);
                          setActionError(
                            e instanceof Error && e.message === WEEKLY_DAY_OFF_ERROR
                              ? WEEKLY_DAY_OFF_ERROR
                              : "לא ניתן לשמור את השיבוץ. נסו שוב.",
                          );
                        },
                      },
                    );
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

      {rowEditor && (
        <RowEditorModal
          key={rowEditor.template?.id ?? `new-${rowEditor.section.id}`}
          state={rowEditor}
          businessId={businessId!}
          onClose={() => setRowEditor(null)}
        />
      )}
    </div>
  );
}

function PickerPanel({
  picker,
  subtitle,
  list,
  teamPrefs,
  assignments,
  templates,
  assigning = false,
  onPick,
  onClose,
}: {
  picker: PickerState;
  subtitle: string;
  list: Profile[];
  teamPrefs: Map<string, PrefMark>;
  assignments: ShiftAssignment[];
  templates: ShiftTemplate[];
  assigning?: boolean;
  onPick: (employeeId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const rowNames = useMemo(() => new Map(templates.map((t) => [t.id, t.name])), [templates]);

  // Who said they can come first, then who didn't mark, then who can't.
  const sorted = useMemo(
    () =>
      pickerCandidates({
        employees: list,
        query,
        template: picker.template,
        date: picker.date,
        currentEmployeeId: picker.current?.employee_id ?? null,
        assignments,
        teamPrefs,
        rowNames,
      }),
    [list, query, picker, assignments, teamPrefs, rowNames],
  );

  return (
    <>
      <div className="shift-picker-head">
        <div>
          <div className="shift-picker-title">{picker.current ? "החלפת עובד" : "שיבוץ עובד"}</div>
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
            {picker.isManagement
              ? "אין מנהלי מחלקה או אחראי משמרת פעילים, ואין עובדים במחלקה זו."
              : picker.dept
                ? "אין עובדים במחלקה זו. שייכו עובדים בעמוד המשתמשים."
                : "אין עובדים פעילים בעסק."}
          </div>
        )}
        {list.length > 0 && sorted.length === 0 && (
          <div className="px-3 py-6 text-center text-[13px] text-text-3">לא נמצאו עובדים בשם הזה.</div>
        )}
        {sorted.map(({ employee: e, pref, isCurrent, otherRowsToday, assignedDays, dayOffBlocked }) => {
          const prefStatus = PREF_STATUS[pref ?? "none"];
          const disabled = isCurrent || dayOffBlocked || assigning;
          const detail = dayOffBlocked
            ? `${MAX_ASSIGNED_DAYS_PER_WEEK}/${MAX_ASSIGNED_DAYS_PER_WEEK} ימים · חובה יום חופש`
            : [
                // Managers from other departments: say who they are.
                e.department_id !== picker.dept ? ROLE_LABELS[e.role] : null,
                prefStatus.label,
                otherRowsToday.length > 0 ? `כבר ב${otherRowsToday.join(", ")}` : null,
                assignedDays > 0 ? `${assignedDays}/${MAX_ASSIGNED_DAYS_PER_WEEK} ימים` : null,
              ]
                .filter(Boolean)
                .join(" · ");
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
                  {detail}
                </span>
              </span>
              {isCurrent && <Badge tone="neutral">בשורה הזו</Badge>}
              {dayOffBlocked && <Badge tone="danger">יום חופש</Badge>}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* Add a row to a department, or edit / duplicate / delete one. A row = one employee per day. */
function RowEditorModal({
  state,
  businessId,
  onClose,
}: {
  state: RowEditorState;
  businessId: string;
  onClose: () => void;
}) {
  const { section, template } = state;
  const create = useCreateShiftTemplate(businessId);
  const update = useUpdateShiftTemplate(businessId);
  const replaceDays = useReplaceShiftTemplateDays(businessId);
  const del = useDeleteShiftTemplate(businessId);

  // A new row starts with no days — the manager taps the days it runs.
  const [draft, setDraft] = useState<RowDraft>(() => initialRowDraft(template));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = create.isPending || update.isPending || replaceDays.isPending || del.isPending;
  const draftError = validateRowDraft(draft);
  const valid = draftError === null;
  const patch = (next: Partial<RowDraft>) => setDraft((d) => ({ ...d, ...next }));
  const setDayHours = (i: number, next: Partial<{ start: string; end: string }>) =>
    setDraft((d) => ({
      ...d,
      dayHours: (d.dayHours ?? []).map((h, j) => (j === i ? { ...h, ...next } : h)),
    }));

  async function save() {
    if (!valid) return;
    setError(null);
    const days = rowDaysFor(template, draft);
    const headline = rowHeadlineHours(days, draft);
    try {
      if (template) {
        await update.mutateAsync({
          id: template.id,
          name: draft.name.trim(),
          start_time: headline.start,
          end_time: headline.end,
        });
        await replaceDays.mutateAsync({ id: template.id, days });
      } else {
        await create.mutateAsync({
          business_id: businessId,
          department_id: section.id,
          name: draft.name.trim(),
          start_time: headline.start,
          end_time: headline.end,
          color: section.color,
          sort_order: nextRowSortOrder(section.templates),
          days,
        });
      }
      onClose();
    } catch {
      setError("לא ניתן לשמור את השורה. נסו שוב.");
    }
  }

  async function duplicate() {
    if (!template) return;
    setError(null);
    try {
      await create.mutateAsync({
        business_id: businessId,
        department_id: template.department_id,
        name: template.name,
        start_time: hhmm(template.start_time),
        end_time: hhmm(template.end_time),
        color: template.color ?? section.color,
        sort_order: template.sort_order,
        days: copyRowDays(template),
      });
      onClose();
    } catch {
      setError("לא ניתן לשכפל את השורה. נסו שוב.");
    }
  }

  async function remove() {
    if (!template) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setError(null);
    try {
      await del.mutateAsync(template.id);
      onClose();
    } catch {
      setError("לא ניתן למחוק את השורה. נסו שוב.");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={template ? "עריכת שורה" : "שורה חדשה"}
      subtitle={section.name}
      icon="view_agenda"
      maxWidth={440}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {template && (
              <>
                <Button variant="danger" icon="delete" onClick={remove} disabled={busy}>
                  {confirmDelete ? "אישור מחיקה" : "מחיקה"}
                </Button>
                <Button variant="secondary" icon="content_copy" onClick={duplicate} disabled={busy}>
                  שכפול
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              ביטול
            </Button>
            <Button icon="save" loading={create.isPending || update.isPending || replaceDays.isPending} disabled={!valid || busy} onClick={save}>
              {template ? "שמירה" : "הוספה"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="label-text">שם השורה</span>
          <Input
            className="mt-1.5"
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="לדוגמה: אירוח ערב"
            autoFocus={!template}
          />
        </label>
        <div>
          <span className="label-text">ימים</span>
          <div className="stx-daypick mt-1.5" role="group" aria-label="ימים שהשורה פעילה">
            {HE_DAY_LETTERS.map((letter, i) => (
              <button
                key={i}
                type="button"
                className="stx-daypick-day"
                data-on={draft.days[i] || undefined}
                aria-pressed={draft.days[i]}
                aria-label={HE_DAYS[i]}
                onClick={() => patch({ days: draft.days.map((v, j) => (j === i ? !v : v)) })}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label-text">שעות</span>
          <div className="row-hours-mode mt-1.5" role="group" aria-label="סוג השעות">
            <button
              type="button"
              className="stx-daypick-day"
              data-on={!draft.perDay || undefined}
              aria-pressed={!draft.perDay}
              onClick={() => setDraft((d) => setRowDraftPerDay(d, false))}
            >
              אותן שעות בכל הימים
            </button>
            <button
              type="button"
              className="stx-daypick-day"
              data-on={draft.perDay || undefined}
              aria-pressed={!!draft.perDay}
              onClick={() => setDraft((d) => setRowDraftPerDay(d, true))}
            >
              שעות לפי יום
            </button>
          </div>
        </div>
        {!draft.perDay ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label-text">משעה</span>
              <TimePicker className="mt-1.5" value={draft.start} onChange={(v) => patch({ start: v })} />
            </label>
            <label className="block">
              <span className="label-text">עד שעה</span>
              <TimePicker className="mt-1.5" value={draft.end} onChange={(v) => patch({ end: v })} />
            </label>
          </div>
        ) : draft.days.some(Boolean) ? (
          <div className="row-day-hours">
            {draft.days.map((on, i) =>
              on ? (
                <div key={i} className="row-day-hours-row">
                  <span className="row-day-hours-name">{HE_DAYS[i]}</span>
                  <TimePicker
                    value={draft.dayHours?.[i]?.start ?? ""}
                    onChange={(v) => setDayHours(i, { start: v })}
                    placeholder="משעה"
                  />
                  <TimePicker
                    value={draft.dayHours?.[i]?.end ?? ""}
                    onChange={(v) => setDayHours(i, { end: v })}
                    placeholder="עד שעה"
                  />
                </div>
              ) : null,
            )}
          </div>
        ) : (
          <p className="text-[13px] font-semibold text-text-3">בחרו ימים כדי לקבוע לכל יום את השעות שלו.</p>
        )}
        {confirmDelete && (
          <p className="text-[13px] font-semibold text-danger">
            מחיקת השורה מוחקת גם את כל השיבוצים שלה. לחצו שוב לאישור.
          </p>
        )}
        {draftError === "same_hours" && (
          <p className="text-[13px] font-semibold text-danger">שעת הסיום חייבת להיות שונה משעת ההתחלה.</p>
        )}
        {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
