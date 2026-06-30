import { useMemo, useState } from "react";
import { Badge, Card, Icon } from "@/components/ui";
import { HE_DAYS, addDays, formatDateShort, weekStart } from "@/lib/db";
import { matchesRecurrenceWeekday } from "@/lib/taskRecurrence";
import type { Department, Profile, Task, TaskTemplate } from "@/types/database";

function dayIndex(iso: string): number {
  return new Date(iso + "T12:00:00").getDay();
}

function tasksForCell(tasks: Task[], employeeId: string, date: string): Task[] {
  const weekday = dayIndex(date);
  return tasks.filter((t) => {
    if (t.assigned_to !== employeeId) return false;
    if (t.type === "recurring" && t.recurrence_weekday != null) {
      return matchesRecurrenceWeekday(t.recurrence_weekday, weekday);
    }
    if (t.type === "one_time" && t.due_date) {
      return t.due_date === date;
    }
    return false;
  });
}

/**
 * משימות קבועות (מתבניות) החלות על העובד ביום נתון — לפי המחלקה שלו או כלליות לכל העסק.
 * מדלגים על תבנית שכבר הומרה למשימה אמיתית של העובד (כדי לא להציג כפול).
 */
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
      !materialized.has(`${emp.id}:${t.id}`),
  );
}

function WeekNav({ wkStart, onShift }: { wkStart: string; onShift: (d: number) => void }) {
  const end = addDays(wkStart, 6);
  return (
    <div className="flex items-center gap-1 rounded-[11px] border border-border bg-surface px-1 shadow-sm">
      <button
        type="button"
        onClick={() => onShift(7)}
        className="grid h-8 w-8 place-items-center rounded-lg text-text-2 hover:bg-surface-2"
      >
        <Icon name="chevron_right" size={20} />
      </button>
      <span className="whitespace-nowrap px-2 text-[13.5px] font-bold">
        {formatDateShort(wkStart)} – {formatDateShort(end)}
      </span>
      <button
        type="button"
        onClick={() => onShift(-7)}
        className="grid h-8 w-8 place-items-center rounded-lg text-text-2 hover:bg-surface-2"
      >
        <Icon name="chevron_left" size={20} />
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
      <span className={`min-w-0 flex-1 truncate text-[11px] font-bold leading-tight ${done ? "text-text-3 line-through" : "text-text"}`}>
        {task.title}
      </span>
    </button>
  );
}

/** תצוגה בלבד — משימה קבועה אינה משויכת לעובד בודד, ולכן אינה ניתנת לסימון מכאן. */
function TemplateChip({ template }: { template: TaskTemplate }) {
  return (
    <div className="group flex w-full items-start gap-1 rounded-[9px] border border-accent-2/30 [background:var(--violet-bg)] px-1.5 py-1 text-right">
      <Icon name="event_repeat" size={14} className="mt-0.5 flex-none text-accent-2" />
      <span className="min-w-0 flex-1 truncate text-[11px] font-bold leading-tight text-text">
        {template.title}
      </span>
    </div>
  );
}

interface TaskWeekScheduleProps {
  tasks: Task[];
  templates?: TaskTemplate[];
  employees: Profile[];
  departments: Department[];
  /** When set, only this employee's row is shown (within their department). */
  employeeFilter?: string;
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
  const [wk, setWk] = useState(weekStart());

  const activeEmployees = useMemo(
    () => (employees ?? []).filter((e) => e.active && (!employeeFilter || e.id === employeeFilter)),
    [employees, employeeFilter]
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

  // תבניות שכבר הומרו למשימה אמיתית של עובד — לפי "${employeeId}:${templateId}"
  const materialized = useMemo(() => {
    const s = new Set<string>();
    tasks.forEach((t) => {
      if (t.template_id && t.assigned_to) s.add(`${t.assigned_to}:${t.template_id}`);
    });
    return s;
  }, [tasks]);

  const totalTasks = useMemo(() => {
    let n = 0;
    activeEmployees.forEach((emp) => {
      weekDates.forEach((date) => {
        n += tasksForCell(tasks, emp.id, date).length;
        n += templatesForCell(templates, emp, date, materialized).length;
      });
    });
    return n;
  }, [tasks, templates, materialized, activeEmployees, weekDates]);

  if (departments.length === 0 && activeEmployees.length === 0) {
    return null;
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-surface-2 px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3.5">
          <div>
            <div className="text-[18px] font-extrabold tracking-tight">סידור משימות שבועי</div>
            <div className="mt-1 text-[13.5px] text-text-2">
              {employeeFilter ? "המשימות שלך לפי ימים" : "כל המשימות לפי מחלקות ועובדים"}
            </div>
          </div>
          <WeekNav wkStart={wk} onShift={(d) => setWk((w) => addDays(w, d))} />
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-3 border-t border-border/70 pt-3.5">
          <span className="flex items-center gap-1.5 text-[12.5px] text-text-2">
            <span className="h-3 w-3 rounded border border-accent-2/30 [background:var(--violet-bg)]" />
            קבועה
          </span>
          <span className="flex items-center gap-1.5 text-[12.5px] text-text-2">
            <span className="h-3 w-3 rounded border border-info/30 [background:var(--info-bg)]" />
            חד-פעמית
          </span>
          <span className="flex items-center gap-1.5 text-[12.5px] text-text-2">
            <span className="h-3 w-3 rounded border border-success/30 [background:var(--success-bg)]" />
            הושלמה
          </span>
          <span className="mr-auto text-[12.5px] text-text-3">{totalTasks} משימות בשבוע זה</span>
        </div>
      </div>

      {deptSections.length === 0 ? (
        <div className="p-6 text-center text-[13px] text-text-3">אין עובדים פעילים להצגה.</div>
      ) : (
        <div className="flex flex-col">
          {deptSections.map(({ dept, employees: deptEmps }) => {
            const deptColor = dept?.color ?? "#94a3b8";
            return (
              <div key={dept?.id ?? "unassigned"} className="border-b border-border-2 last:border-0">
                <div className="h-1 w-full" style={{ background: deptColor }} />
                <div
                  className="flex items-center gap-2.5 border-b border-border px-5 py-3"
                  style={{
                    background: `linear-gradient(180deg, color-mix(in srgb, ${deptColor} 10%, var(--surface)) 0%, var(--surface-2) 100%)`,
                  }}
                >
                  <span
                    className="h-3 w-3 rounded-full ring-[3px] ring-black/[0.04]"
                    style={{ background: deptColor }}
                  />
                  <span className="text-[15px] font-extrabold">{dept?.name ?? "ללא מחלקה"}</span>
                  <Badge tone="neutral">{deptEmps.length} עובדים</Badge>
                </div>

                <div className="overflow-auto bg-surface">
                  <div className="min-w-[920px]">
                    <div className="grid grid-cols-[130px_repeat(7,1fr)] border-b border-border bg-surface-2">
                      <div className="border-l border-border px-3 py-2.5 text-[12px] font-bold text-text-3">
                        עובד
                      </div>
                      {HE_DAYS.map((d, i) => (
                        <div key={i} className="border-l border-border px-2 py-2.5">
                          <div className="text-[12.5px] font-bold">{d}</div>
                          <div className="text-[11px] text-text-3">{formatDateShort(weekDates[i])}</div>
                        </div>
                      ))}
                    </div>

                    {deptEmps.map((emp) => (
                      <div
                        key={emp.id}
                        className="grid grid-cols-[130px_repeat(7,1fr)] border-b border-border-2 last:border-0"
                      >
                        <div className="flex items-center border-l border-border-2 bg-surface-2/40 px-3 py-2.5">
                          <span className="truncate text-[13px] font-bold text-text-2">{emp.full_name}</span>
                        </div>
                        {weekDates.map((date) => {
                          const cellTasks = tasksForCell(tasks, emp.id, date);
                          const cellTemplates = templatesForCell(templates, emp, date, materialized);
                          const isEmpty = cellTasks.length === 0 && cellTemplates.length === 0;
                          return (
                            <div
                              key={date}
                              className="flex min-h-[58px] flex-col gap-1 border-l border-border-2 bg-surface p-1.5"
                            >
                              {isEmpty ? (
                                <span className="grid flex-1 place-items-center text-[11px] text-text-3">—</span>
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
        </div>
      )}
    </Card>
  );
}
