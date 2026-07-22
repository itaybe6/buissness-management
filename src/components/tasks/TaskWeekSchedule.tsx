import { useMemo, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Icon } from "@/components/ui";
import { HE_DAYS, addDays, formatDateShort, weekStart, todayISO } from "@/lib/db";
import { useIsMdUp } from "@/hooks/useMediaQuery";
import { matchesRecurrenceWeekday } from "@/lib/taskRecurrence";
import { isOneTimeTaskForDate, isRecurringTaskForDate, recurringOccurrenceDate } from "@/lib/todayTasks";
import type { Department, Profile, Task, TaskTemplate } from "@/types/database";

function dayIndex(iso: string): number {
  return new Date(iso + "T12:00:00").getDay();
}

function tasksForCell(tasks: Task[], employeeId: string, date: string, today: string): Task[] {
  return tasks.filter((t) => {
    if (t.assigned_to !== employeeId) return false;
    if (t.type === "recurring" && t.recurrence_weekday != null) {
      return isRecurringTaskForDate(t, date);
    }
    if (t.type === "one_time") {
      return isOneTimeTaskForDate(t, date, today);
    }
    return false;
  });
}

function templatesForCell(
  templates: TaskTemplate[],
  emp: Profile,
  date: string,
  materialized: Set<string>,
): TaskTemplate[] {
  const weekday = dayIndex(date);
  return templates.filter(
    (t) =>
      t.active &&
      matchesRecurrenceWeekday(t.recurrence_weekday, weekday) &&
      (t.department_id == null || t.department_id === emp.department_id) &&
      !materialized.has(`${emp.id}:${t.id}:${date}`),
  );
}

function colorDotStyle(color: string | null | undefined, ring = 3): CSSProperties {
  const c = color ?? "#94a3b8";
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

const HE_DAY_LETTERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function WeekNav({ wkStart, onShift, onToday }: { wkStart: string; onShift: (d: number) => void; onToday?: () => void }) {
  const end = addDays(wkStart, 6);
  const isCurrentWeek = wkStart === weekStart();
  return (
    <div className="shift-week-nav-group">
      <div className="shift-week-nav">
        <button type="button" onClick={() => onShift(7)} className="shift-week-nav-btn" aria-label="שבוע קודם">
          <Icon name="chevron_right" size={20} />
        </button>
        <span className="shift-week-nav-label">
          {formatDateShort(wkStart)} – {formatDateShort(end)}
        </span>
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

function DayStrip({
  wk,
  value,
  onChange,
  stripId,
  onShiftWeek,
}: {
  wk: string;
  value: number;
  onChange: (i: number) => void;
  stripId: string;
  onShiftWeek: (deltaDays: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="shift-day-strip" data-with-nav="true">
      <button
        type="button"
        className="shift-day-strip-nav"
        onClick={() => onShiftWeek(7)}
        aria-label="שבוע קודם"
      >
        <Icon name="chevron_right" size={18} />
      </button>
      <div className="shift-day-strip-days">
        {HE_DAY_LETTERS.map((d, i) => {
          const meta = dayMeta(wk, i);
          const active = i === value;
          const dayLabel = HE_DAYS[i];
          return (
            <button
              key={i}
              type="button"
              className="shift-day-pill"
              data-active={active}
              title={`${dayLabel} · ${formatDateShort(meta.date)}`}
              aria-label={`${dayLabel} · ${formatDateShort(meta.date)}`}
              onClick={() => onChange(i)}
              aria-pressed={active}
            >
              {active && (
                <motion.span
                  layoutId={`task-day-pill-${stripId}`}
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
      <button
        type="button"
        className="shift-day-strip-nav"
        onClick={() => onShiftWeek(-7)}
        aria-label="שבוע הבא"
      >
        <Icon name="chevron_left" size={18} />
      </button>
    </div>
  );
}

function TaskChip({ task, onToggle }: { task: Task; onToggle?: (id: string, done: boolean) => void }) {
  const done = task.status === "done";
  const recurring = task.type === "recurring";

  return (
    <button
      type="button"
      disabled={!onToggle}
      onClick={() => onToggle?.(task.id, done)}
      className={`group flex w-full items-start gap-1 rounded-[9px] border px-1.5 py-1 text-right transition ${
        done
          ? "border-success/30 [background:var(--success-bg)] opacity-75"
          : recurring
            ? "border-accent-2/30 [background:var(--violet-bg)] hover:brightness-[1.02]"
            : "border-info/30 [background:var(--info-bg)] hover:brightness-[1.02]"
      } ${onToggle ? "cursor-pointer" : "cursor-default"}`}
    >
      <Icon
        name={done ? "check_circle" : recurring ? "event_repeat" : "edit_note"}
        size={14}
        className={`mt-0.5 flex-none ${done ? "text-success" : recurring ? "text-accent-2" : "text-info"}`}
      />
      <span
        className={`min-w-0 flex-1 truncate text-[11px] font-bold leading-tight ${done ? "text-text-3 line-through" : "text-text"}`}
      >
        {task.title}
      </span>
    </button>
  );
}

function TemplateChip({ template }: { template: TaskTemplate }) {
  return (
    <div className="group flex w-full items-start gap-1 rounded-[9px] border border-accent-2/30 [background:var(--violet-bg)] px-1.5 py-1 text-right">
      <Icon name="event_repeat" size={14} className="mt-0.5 flex-none text-accent-2" />
      <span className="min-w-0 flex-1 truncate text-[11px] font-bold leading-tight text-text">{template.title}</span>
    </div>
  );
}

function sectionTaskCount(
  employees: Profile[],
  weekDates: string[],
  tasks: Task[],
  templates: TaskTemplate[],
  materialized: Set<string>,
  today: string,
) {
  let n = 0;
  employees.forEach((emp) => {
    weekDates.forEach((date) => {
      n += tasksForCell(tasks, emp.id, date, today).length;
      n += templatesForCell(templates, emp, date, materialized).length;
    });
  });
  return n;
}

interface TaskWeekScheduleProps {
  tasks: Task[];
  templates?: TaskTemplate[];
  employees: Profile[];
  departments: Department[];
  employeeFilter?: string;
  embedded?: boolean;
  onToggle?: (id: string, done: boolean) => void;
}

export function TaskWeekSchedule({
  tasks,
  templates = [],
  employees,
  departments,
  employeeFilter,
  onToggle,
}: TaskWeekScheduleProps) {
  const reduceMotion = useReducedMotion();
  const isDesktop = useIsMdUp();
  const [wk, setWk] = useState(weekStart());
  const [wkDir, setWkDir] = useState(1);
  const [dayIdx, setDayIdx] = useState(() => todayIdxInWeek(weekStart()));

  const activeEmployees = useMemo(
    () => (employees ?? []).filter((e) => e.active && (!employeeFilter || e.id === employeeFilter)),
    [employees, employeeFilter],
  );

  const deptSections = useMemo(() => {
    const sections: { dept: Department | null; employees: Profile[] }[] = [];

    departments.forEach((dept) => {
      const deptEmps = activeEmployees.filter((e) => e.department_id === dept.id);
      if (deptEmps.length > 0) sections.push({ dept, employees: deptEmps });
    });

    const unassigned = activeEmployees.filter((e) => !e.department_id);
    if (unassigned.length > 0) {
      sections.push({ dept: null, employees: unassigned });
    }

    return sections;
  }, [departments, activeEmployees]);

  const weekDates = useMemo(() => HE_DAYS.map((_, i) => addDays(wk, i)), [wk]);
  const today = todayISO();

  const materialized = useMemo(() => {
    const s = new Set<string>();
    tasks.forEach((t) => {
      if (!t.template_id || !t.assigned_to || t.type !== "recurring") return;
      const date = recurringOccurrenceDate(t);
      if (date) s.add(`${t.assigned_to}:${t.template_id}:${date}`);
    });
    return s;
  }, [tasks]);

  const totalTasks = useMemo(
    () => sectionTaskCount(activeEmployees, weekDates, tasks, templates, materialized, today),
    [tasks, templates, materialized, activeEmployees, weekDates, today],
  );

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

  if (departments.length === 0 && activeEmployees.length === 0) {
    return null;
  }

  const selectedDate = weekDates[dayIdx];

  return (
    <div>
      {isDesktop && (
        <div className="shift-toolbar">
          <div className="shift-toolbar-meta">
            <span className="shift-stat">{totalTasks} משימות בשבוע זה</span>
          </div>
          <WeekNav wkStart={wk} onShift={shiftWeek} onToday={goToday} />
        </div>
      )}

      {deptSections.length === 0 ? (
        <div className="rounded-card bg-surface px-5 py-6 text-center text-[13px] text-text-3 shadow-card">
          אין עובדים פעילים להצגה.
        </div>
      ) : (
        <>
          {/* Mobile: day-by-day view */}
          {!isDesktop && (
          <div>
            <DayStrip
              wk={wk}
              value={dayIdx}
              onChange={setDayIdx}
              stripId="tasks"
              onShiftWeek={shiftWeek}
            />
            <motion.div
              key={`${wk}-${dayIdx}`}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 340, damping: 32 }}
              className="flex flex-col gap-4"
            >
              {deptSections.map(({ dept, employees: deptEmps }) => {
                const deptColor = dept?.color ?? "#94a3b8";
                const dayCount = sectionTaskCount(deptEmps, [selectedDate], tasks, templates, materialized, today);
                return (
                  <div
                    key={dept?.id ?? "unassigned"}
                    className="shift-dept-card"
                    style={{ "--dept-color": deptColor } as CSSProperties}
                  >
                    <div className="shift-dept-header" style={{ cursor: "default" }}>
                      <span className="shift-dept-dot" style={colorDotStyle(deptColor)} />
                      <span className="shift-dept-name">{dept?.name ?? "ללא מחלקה"}</span>
                      <div className="shift-dept-stats">
                        <span className="shift-dept-stat">
                          <strong>{deptEmps.length}</strong> עובדים
                        </span>
                        <span className="shift-dept-stat">
                          <strong>{dayCount}</strong> משימות היום
                        </span>
                      </div>
                    </div>
                    <div>
                      {deptEmps.map((emp) => {
                        const cellTasks = tasksForCell(tasks, emp.id, selectedDate, today);
                        const cellTemplates = templatesForCell(templates, emp, selectedDate, materialized);
                        const isEmpty = cellTasks.length === 0 && cellTemplates.length === 0;
                        return (
                          <div key={emp.id} className="task-mobile-emp-row">
                            <div className="task-mobile-emp-name">{emp.full_name}</div>
                            {isEmpty ? (
                              <span className="task-mobile-emp-empty">—</span>
                            ) : (
                              <div className="task-mobile-emp-chips">
                                {cellTemplates.map((tpl) => (
                                  <TemplateChip key={`tpl-${tpl.id}`} template={tpl} />
                                ))}
                                {cellTasks.map((task) => (
                                  <TaskChip key={task.id} task={task} onToggle={onToggle} />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </div>
          )}

          {/* Desktop: full week grid per department */}
          {isDesktop && (
          <motion.div
            key={wk}
            initial={reduceMotion ? false : { opacity: 0, x: wkDir * 26 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="flex flex-col gap-5"
          >
            {deptSections.map(({ dept, employees: deptEmps }, sectionIndex) => {
              const deptColor = dept?.color ?? "#94a3b8";
              const weekCount = sectionTaskCount(deptEmps, weekDates, tasks, templates, materialized, today);
              return (
                <div
                  key={dept?.id ?? "unassigned"}
                  className="shift-dept-card shift-section-enter"
                  style={{ "--dept-color": deptColor, "--enter-delay": `${sectionIndex * 70}ms` } as CSSProperties}
                >
                  <div className="shift-dept-header" style={{ cursor: "default" }}>
                    <span className="shift-dept-dot" style={colorDotStyle(deptColor)} />
                    <span className="shift-dept-name">{dept?.name ?? "ללא מחלקה"}</span>
                    <div className="shift-dept-stats">
                      <span className="shift-dept-stat">
                        <strong>{deptEmps.length}</strong> עובדים
                      </span>
                      <span className="shift-dept-stat">
                        <strong>{weekCount}</strong> משימות השבוע
                      </span>
                    </div>
                  </div>
                  <div className="shift-grid-wrap">
                    <div className="shift-grid">
                      <div className="shift-grid-head">
                        <div className="shift-grid-corner">עובד</div>
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
                      {deptEmps.map((emp) => (
                        <div key={emp.id} className="shift-grid-row">
                          <div className="shift-grid-row-label">
                            <span className="text-[13px] font-extrabold text-text">{emp.full_name}</span>
                          </div>
                          {weekDates.map((date) => {
                            const cellTasks = tasksForCell(tasks, emp.id, date, today);
                            const cellTemplates = templatesForCell(templates, emp, date, materialized);
                            const meta = dayMeta(wk, weekDates.indexOf(date));
                            const isEmpty = cellTasks.length === 0 && cellTemplates.length === 0;
                            return (
                              <div
                                key={date}
                                className="shift-grid-cell"
                                data-today={meta.isToday}
                                data-weekend={meta.isWeekend}
                                data-empty={isEmpty}
                              >
                                {isEmpty ? (
                                  <span className="text-[11px] font-semibold text-text-3">—</span>
                                ) : (
                                  <>
                                    {cellTemplates.map((tpl) => (
                                      <TemplateChip key={`tpl-${tpl.id}`} template={tpl} />
                                    ))}
                                    {cellTasks.map((task) => (
                                      <TaskChip key={task.id} task={task} onToggle={onToggle} />
                                    ))}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </motion.div>
          )}
        </>
      )}
    </div>
  );
}
