import { useMemo, useState } from "react";
import { Badge, Card, EmptyState, Icon, PageLoader } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useBusinessId, HE_DAYS, addDays, formatDateShort, weekStart, colorFor, initialsOf } from "@/lib/db";
import { useDepartments } from "@/api/departments";
import { useProfiles } from "@/api/users";
import {
  useShiftTemplates,
  useShiftPreferences,
  useSetPreference,
  useClearPreference,
  useShiftAssignments,
  useAddAssignment,
  useRemoveAssignment,
} from "@/api/shifts";
import { SCHEDULER_ROLES } from "@/lib/constants";
import type { Availability, Profile } from "@/types/database";

const PREF_ORDER: (Availability | null)[] = [null, "prefer", "available", "cannot"];
const PREF_META: Record<string, { label: string; bg: string; color: string; border: string }> = {
  none: { label: "—", bg: "var(--surface-2)", color: "var(--text-3)", border: "var(--border)" },
  prefer: { label: "מעדיף", bg: "var(--accent)", color: "#fff", border: "var(--accent-2)" },
  available: { label: "יכול", bg: "var(--info-bg)", color: "var(--info)", border: "#bcd0ff" },
  cannot: { label: "לא יכול", bg: "var(--danger-bg)", color: "var(--danger)", border: "#f6caca" },
};

export function Shifts() {
  const { profile } = useAuth();
  const isScheduler = profile && SCHEDULER_ROLES.includes(profile.role);
  return isScheduler ? <SchedulerView /> : <EmployeeConstraints />;
}

function WeekNav({ wkStart, onShift }: { wkStart: string; onShift: (d: number) => void }) {
  const end = addDays(wkStart, 6);
  return (
    <div className="flex items-center gap-1 rounded-[11px] border border-border bg-surface p-1">
      <button onClick={() => onShift(7)} className="grid h-8 w-8 place-items-center rounded-lg text-text-2 hover:bg-surface-2"><Icon name="chevron_right" size={20} /></button>
      <span className="whitespace-nowrap px-2 text-[13.5px] font-bold">{formatDateShort(wkStart)} – {formatDateShort(end)}</span>
      <button onClick={() => onShift(-7)} className="grid h-8 w-8 place-items-center rounded-lg text-text-2 hover:bg-surface-2"><Icon name="chevron_left" size={20} /></button>
    </div>
  );
}

/* ------------------------------- Employee ------------------------------- */
function EmployeeConstraints() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const [wk, setWk] = useState(weekStart());
  const { data: templates, isLoading } = useShiftTemplates(businessId);
  const { data: prefs } = useShiftPreferences(businessId, wk, profile?.id);
  const setPref = useSetPreference(businessId);
  const clearPref = useClearPreference(businessId);

  const prefMap = useMemo(() => {
    const m = new Map<string, Availability>();
    (prefs ?? []).forEach((p) => m.set(`${p.shift_template_id}_${p.shift_date}`, p.preference));
    return m;
  }, [prefs]);

  if (isLoading) return <PageLoader />;
  if (!templates || templates.length === 0) {
    return (
      <div className="mx-auto max-w-[900px] animate-fadeUp">
        <EmptyState icon="schedule" title="טרם הוגדרו משמרות" description="מנהל העסק צריך להגדיר שעות משמרת בהגדרות העסק." />
      </div>
    );
  }

  function cycle(templateId: string, date: string) {
    const key = `${templateId}_${date}`;
    const cur = prefMap.get(key) ?? null;
    const next = PREF_ORDER[(PREF_ORDER.indexOf(cur) + 1) % PREF_ORDER.length];
    if (next === null) {
      clearPref.mutate({ employee_id: profile!.id, shift_date: date, shift_template_id: templateId });
    } else {
      setPref.mutate({
        business_id: businessId!,
        employee_id: profile!.id,
        week_start: wk,
        shift_date: date,
        shift_template_id: templateId,
        preference: next,
      });
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] animate-fadeUp">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <div className="text-[24px] font-extrabold tracking-tight">הגשת אילוצי משמרות</div>
          <div className="mt-1 text-[14.5px] text-text-2">לחצו על תא כדי לסמן: מעדיף / יכול / לא יכול</div>
        </div>
        <WeekNav wkStart={wk} onShift={(d) => setWk((w) => addDays(w, d))} />
      </div>

      <div className="mb-3 flex flex-wrap gap-3.5">
        {["prefer", "available", "cannot"].map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-[12.5px] text-text-2">
            <span className="h-4 w-4 rounded" style={{ background: PREF_META[k].bg, border: `1.5px solid ${PREF_META[k].border}` }} />
            {PREF_META[k].label}
          </span>
        ))}
      </div>

      <Card className="p-4">
        <div className="overflow-auto">
          <div className="min-w-[680px]">
            <div className="mb-2 grid grid-cols-[90px_repeat(7,1fr)] gap-2">
              <span />
              {HE_DAYS.map((d, i) => (
                <span key={i} className="text-center">
                  <span className="block text-[13px] font-bold">{d}</span>
                  <span className="block text-[11px] text-text-3">{formatDateShort(addDays(wk, i))}</span>
                </span>
              ))}
            </div>
            {templates.map((t) => (
              <div key={t.id} className="mb-2 grid grid-cols-[90px_repeat(7,1fr)] items-center gap-2">
                <span className="text-[13px] font-bold text-text-2">
                  {t.name}
                  <span className="block text-[10.5px] font-normal text-text-3" style={{ direction: "ltr" }}>{t.start_time?.slice(0,5)}–{t.end_time?.slice(0,5)}</span>
                </span>
                {HE_DAYS.map((_, i) => {
                  const date = addDays(wk, i);
                  const cur = prefMap.get(`${t.id}_${date}`) ?? "none";
                  const meta = PREF_META[cur];
                  return (
                    <button
                      key={i}
                      onClick={() => cycle(t.id, date)}
                      className="rounded-[10px] px-1 py-2.5 text-center text-[12.5px] font-bold transition"
                      style={{ background: meta.bg, color: meta.color, border: `1.5px solid ${meta.border}` }}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 text-[12.5px] text-text-3">האילוצים נשמרים אוטומטית.</div>
      </Card>
    </div>
  );
}

/* ------------------------------- Scheduler ------------------------------- */
function SchedulerView() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const [wk, setWk] = useState(weekStart());
  const { data: templates, isLoading: lt } = useShiftTemplates(businessId);
  const { data: departments, isLoading: ld } = useDepartments(businessId);
  const { data: employees } = useProfiles(businessId);
  const { data: prefs } = useShiftPreferences(businessId, wk);
  const { data: assignments } = useShiftAssignments(businessId, wk, addDays(wk, 6));
  const addAssign = useAddAssignment(businessId);
  const removeAssign = useRemoveAssignment(businessId);
  const [picker, setPicker] = useState<{ dept: string | null; templateId: string; date: string } | null>(null);

  const prefMap = useMemo(() => {
    const m = new Map<string, Availability>();
    (prefs ?? []).forEach((p) => m.set(`${p.employee_id}_${p.shift_template_id}_${p.shift_date}`, p.preference));
    return m;
  }, [prefs]);

  const empById = useMemo(() => {
    const m = new Map<string, Profile>();
    (employees ?? []).forEach((e) => m.set(e.id, e));
    return m;
  }, [employees]);

  if (lt || ld) return <PageLoader />;

  if (!templates?.length || !departments?.length) {
    return (
      <div className="mx-auto max-w-[900px] animate-fadeUp">
        <EmptyState
          icon="calendar_month"
          title="חסרה הגדרה לסידור"
          description="כדי לבנות סידור עבודה צריך להגדיר מחלקות ושעות משמרת בהגדרות העסק."
        />
      </div>
    );
  }

  const assignmentsFor = (deptId: string, templateId: string, date: string) =>
    (assignments ?? []).filter(
      (a) => a.shift_template_id === templateId && a.shift_date === date && (a.department_id === deptId || (!a.department_id && empById.get(a.employee_id)?.department_id === deptId))
    );

  return (
    <div className="animate-fadeUp">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <div className="text-[24px] font-extrabold tracking-tight">סידור עבודה</div>
          <div className="mt-1 text-[14.5px] text-text-2">נבנה מתוך אילוצי העובדים · לכל מחלקה הסידור שלה</div>
        </div>
        <WeekNav wkStart={wk} onShift={(d) => setWk((w) => addDays(w, d))} />
      </div>

      <div className="mb-3 flex flex-wrap gap-3.5">
        <span className="flex items-center gap-1.5 text-[12.5px] text-text-2"><span className="h-2.5 w-2.5 rounded-full bg-accent" />מעדיף</span>
        <span className="flex items-center gap-1.5 text-[12.5px] text-text-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--info)" }} />יכול</span>
        <span className="flex items-center gap-1.5 text-[12.5px] text-text-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--danger)" }} />לא יכול</span>
      </div>

      <div className="flex flex-col gap-5">
        {departments.map((dept) => (
          <Card key={dept.id} className="overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-border bg-surface-2 px-5 py-3">
              <span className="h-3 w-3 rounded-full" style={{ background: dept.color ?? "#7c3aed" }} />
              <span className="text-[15px] font-extrabold">{dept.name}</span>
              <Badge tone="neutral">{(employees ?? []).filter((e) => e.department_id === dept.id).length} עובדים</Badge>
            </div>
            <div className="overflow-auto">
              <div className="min-w-[920px]">
                <div className="grid grid-cols-[120px_repeat(7,1fr)] border-b border-border bg-surface-2/50">
                  <div className="border-l border-border px-3 py-2.5 text-[12px] font-bold text-text-3">משמרת</div>
                  {HE_DAYS.map((d, i) => (
                    <div key={i} className="border-l border-border-2 px-2 py-2.5">
                      <div className="text-[12.5px] font-bold">{d}</div>
                      <div className="text-[11px] text-text-3">{formatDateShort(addDays(wk, i))}</div>
                    </div>
                  ))}
                </div>
                {templates.map((t) => (
                  <div key={t.id} className="grid grid-cols-[120px_repeat(7,1fr)] border-b border-border-2 last:border-0">
                    <div className="border-l border-border-2 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-[13px] font-bold">
                        <span className="h-2 w-2 rounded-full" style={{ background: t.color ?? "#7c3aed" }} />{t.name}
                      </div>
                      <div className="text-[10.5px] text-text-3" style={{ direction: "ltr" }}>{t.start_time?.slice(0,5)}–{t.end_time?.slice(0,5)}</div>
                    </div>
                    {HE_DAYS.map((_, i) => {
                      const date = addDays(wk, i);
                      const cellAssignments = assignmentsFor(dept.id, t.id, date);
                      return (
                        <div key={i} className="flex min-h-[58px] flex-col gap-1.5 border-l border-border-2 p-1.5">
                          {cellAssignments.map((a) => {
                            const e = empById.get(a.employee_id);
                            return (
                              <div key={a.id} className="group flex items-center gap-1.5 rounded-full border border-border-2 bg-surface-2 py-0.5 pl-1 pr-1.5">
                                <span className="grid h-5 w-5 flex-none place-items-center rounded-full text-[9.5px] font-bold text-white" style={{ background: colorFor(a.employee_id) }}>{initialsOf(e?.full_name)}</span>
                                <span className="truncate text-[11.5px] font-semibold">{e?.full_name?.split(" ")[0]}</span>
                                <button onClick={() => removeAssign.mutate(a.id)} className="opacity-0 transition group-hover:opacity-100"><Icon name="close" size={14} className="text-text-3" /></button>
                              </div>
                            );
                          })}
                          <button
                            onClick={() => setPicker({ dept: dept.id, templateId: t.id, date })}
                            className="grid place-items-center rounded-[9px] bg-surface-2 py-1.5 text-text-3 transition hover:[background:var(--accent-tint)] hover:text-ink"
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
          </Card>
        ))}
      </div>

      {/* employee picker */}
      {picker && (
        <div onClick={() => setPicker(null)} className="fixed inset-0 z-[100] grid animate-fadeIn place-items-center bg-black/55 p-5">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[420px] animate-pop overflow-hidden rounded-[18px] bg-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="text-[16px] font-bold">שיבוץ עובד</div>
              <button onClick={() => setPicker(null)} className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-text-2"><Icon name="close" size={18} /></button>
            </div>
            <div className="max-h-[60vh] overflow-auto p-3">
              {(employees ?? []).filter((e) => e.department_id === picker.dept && e.active).length === 0 && (
                <div className="px-3 py-6 text-center text-[13px] text-text-3">אין עובדים במחלקה זו. שייכו עובדים בעמוד המשתמשים.</div>
              )}
              {(employees ?? [])
                .filter((e) => e.department_id === picker.dept && e.active)
                .map((e) => {
                  const pref = prefMap.get(`${e.id}_${picker.templateId}_${picker.date}`);
                  const meta = pref ? PREF_META[pref] : null;
                  const already = (assignments ?? []).some((a) => a.employee_id === e.id && a.shift_template_id === picker.templateId && a.shift_date === picker.date);
                  return (
                    <button
                      key={e.id}
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
                      className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 text-right transition hover:bg-surface-2 disabled:opacity-40"
                    >
                      <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] text-[12.5px] font-bold text-white" style={{ background: colorFor(e.id) }}>{initialsOf(e.full_name)}</span>
                      <span className="flex-1 text-[13.5px] font-semibold">{e.full_name}</span>
                      {already ? <Badge tone="neutral">משובץ</Badge> : meta ? <Badge tone={pref === "prefer" ? "violet" : pref === "available" ? "info" : "danger"}>{meta.label}</Badge> : null}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
