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

function dayMeta(wk: string, index: number) {
  const date = addDays(wk, index);
  const today = todayISO();
  return {
    date,
    isToday: date === today,
    isWeekend: index >= 5,
  };
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
  const [wk, setWk] = useState(weekStart());
  const { data: assignments, isLoading } = useShiftAssignments(businessId, wk, addDays(wk, 6), profile?.id);

  const assignMap = useMemo(() => {
    const m = new Set<string>();
    (assignments ?? []).forEach((a) => m.add(`${a.shift_template_id}_${a.shift_date}`));
    return m;
  }, [assignments]);

  if (isLoading) return <PageLoader />;

  return (
    <div>
      <div className="page-section-label">
        משמרותי לשבוע <span>{formatDateShort(wk)} – {formatDateShort(addDays(wk, 6))}</span>
      </div>
      <div className="shift-toolbar">
        <ShiftLegend />
        <WeekNav wkStart={wk} onShift={(d) => setWk((w) => addDays(w, d))} onToday={() => setWk(weekStart())} />
      </div>

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
                  const { date } = dayMeta(wk, i);
                  const assigned = assignMap.has(`${t.id}_${date}`);
                  const meta = dayMeta(wk, i);
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
    </div>
  );
}

function EmployeeConstraints({ templates }: { templates: NonNullable<ReturnType<typeof useActiveShiftTemplates>["data"]> }) {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: business } = useBusiness(businessId);
  const nextWk = addDays(weekStart(), 7);
  const [wk, setWk] = useState(nextWk);
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
        <WeekNav wkStart={wk} onShift={(d) => setWk((w) => addDays(w, d))} onToday={() => setWk(addDays(weekStart(), 7))} />
      </div>

      {saveError && (
        <div className="mb-3 flex items-center gap-2 rounded-[11px] border border-danger/30 [background:var(--danger-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-danger">
          <Icon name="error" size={18} />
          {saveError}
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
      </Card>
    </div>
  );
}

function AvailabilityCell({
  value,
  saving,
  disabled,
  onSet,
}: {
  value: "available" | "cannot" | null;
  saving?: boolean;
  disabled?: boolean;
  onSet: (v: Availability | null) => void;
}) {
  const isAvail = value === "available";
  const isCannot = value === "cannot";
  const locked = disabled || saving;

  return (
    <div
      className={`flex min-h-[52px] flex-col gap-1 rounded-[10px] border p-1 transition ${locked ? "opacity-60" : ""}`}
      style={{
        background: isAvail ? AVAIL_META.available.bg : isCannot ? AVAIL_META.cannot.bg : "var(--surface)",
        borderColor: isAvail ? AVAIL_META.available.border : isCannot ? AVAIL_META.cannot.border : "var(--border)",
      }}
    >
      <button
        type="button"
        disabled={locked}
        onClick={() => onSet(isAvail ? null : "available")}
        className="seg-btn flex flex-1 items-center justify-center gap-1 rounded-[7px] py-1.5 text-[11.5px] font-bold transition"
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
        className="seg-btn flex flex-1 items-center justify-center gap-1 rounded-[7px] py-1.5 text-[11.5px] font-bold transition"
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
function SchedulerView() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const reduceMotion = useReducedMotion();
  const [wk, setWk] = useState(weekStart());
  const { data: templates, isLoading: lt } = useActiveShiftTemplates(businessId);
  const { data: departments, isLoading: ld } = useDepartments(businessId);
  const { data: employees } = useProfiles(businessId);
  const { data: prefs } = useShiftPreferences(businessId, wk);
  const { data: assignments } = useShiftAssignments(businessId, wk, addDays(wk, 6));
  const addAssign = useAddAssignment(businessId);
  const removeAssign = useRemoveAssignment(businessId);
  const [picker, setPicker] = useState<{ dept: string | null; templateId: string; date: string } | null>(null);

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

  const assignmentsFor = (deptId: string | null, templateId: string, date: string) =>
    (assignments ?? []).filter((a) => {
      if (a.shift_template_id !== templateId || a.shift_date !== date) return false;
      const empDept = empById.get(a.employee_id)?.department_id ?? null;
      if (deptId === null) return empDept === null;
      return a.department_id === deptId || (!a.department_id && empDept === deptId);
    });

  const totalAssignments = (assignments ?? []).length;

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
        <WeekNav wkStart={wk} onShift={(d) => setWk((w) => addDays(w, d))} onToday={() => setWk(weekStart())} />
      </div>

      <div className="flex flex-col gap-5">
        {scheduleSections.map((section, sectionIndex) => (
          <div
            key={section.id ?? "general"}
            className="shift-dept-card shift-section-enter"
            style={{ "--dept-color": section.color, "--enter-delay": `${sectionIndex * 70}ms` } as CSSProperties}
          >
            <div className="shift-dept-accent-bar" style={{ background: section.color }} />
            <div className="shift-dept-header">
              <span className="shift-dept-dot" style={colorDotStyle(section.color)} />
              <span className="shift-dept-name">{section.name}</span>
              <Badge tone="neutral">{employeesInSection(section.id).length} עובדים</Badge>
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
                      const cellAssignments = assignmentsFor(section.id, t.id, date);
                      const meta = dayMeta(wk, i);
                      return (
                        <div key={i} className="shift-grid-cell" data-today={meta.isToday} data-weekend={meta.isWeekend}>
                          {cellAssignments.map((a) => {
                            const e = empById.get(a.employee_id);
                            return (
                              <div key={a.id} className="shift-assign-chip group">
                                <span className="shift-assign-avatar" style={{ background: colorFor(a.employee_id) }}>
                                  {initialsOf(e?.full_name)}
                                </span>
                                <span className="shift-assign-name">{e?.full_name?.split(" ")[0]}</span>
                                <button
                                  type="button"
                                  onClick={() => removeAssign.mutate(a.id)}
                                  className="shift-assign-remove"
                                  aria-label="הסר שיבוץ"
                                >
                                  <Icon name="close" size={14} />
                                </button>
                              </div>
                            );
                          })}
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
          </div>
        ))}
      </div>

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
              initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shift-picker-head">
                <div className="shift-picker-title">שיבוץ עובד</div>
                <button
                  type="button"
                  onClick={() => setPicker(null)}
                  className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-text-2 transition hover:bg-surface"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
              <div className="shift-picker-list">
                {employeesInSection(picker.dept).length === 0 && (
                  <div className="px-3 py-6 text-center text-[13px] text-text-3">
                    {picker.dept
                      ? "אין עובדים במחלקה זו. שייכו עובדים בעמוד המשתמשים."
                      : "אין עובדים ללא מחלקה."}
                  </div>
                )}
                {employeesInSection(picker.dept).map((e) => {
                  const pref = prefMap.get(`${e.id}_${picker.templateId}_${picker.date}`);
                  const meta = pref ? AVAIL_META[pref] : null;
                  const already = (assignments ?? []).some(
                    (a) => a.employee_id === e.id && a.shift_template_id === picker.templateId && a.shift_date === picker.date
                  );
                  return (
                    <button
                      key={e.id}
                      type="button"
                      disabled={already}
                      onClick={() => {
                        addAssign.mutate({
                          business_id: businessId!,
                          department_id: picker.dept,
                          employee_id: e.id,
                          shift_date: picker.date,
                          shift_template_id: picker.templateId,
                          assigned_by: profile?.id ?? null,
                        });
                        setPicker(null);
                      }}
                      className="shift-picker-item"
                    >
                      <span
                        className="grid h-9 w-9 flex-none place-items-center rounded-[10px] text-[12.5px] font-bold text-white"
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
