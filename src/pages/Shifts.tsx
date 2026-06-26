import { useMemo, useState } from "react";
import { Badge, Card, EmptyState, ErrorState, Icon, PageLoader } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useBusinessId, HE_DAYS, addDays, formatDateShort, weekStart, colorFor, initialsOf } from "@/lib/db";
import { useDepartments } from "@/api/departments";
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
    <div className="mx-auto max-w-[1100px] animate-fadeUp">
      <EmployeeSchedule templates={templates} />
      <div className="my-8 border-t border-border" />
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
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <div className="text-[24px] font-extrabold tracking-tight">סידור עבודה</div>
          <div className="mt-1 text-[14.5px] text-text-2">המשמרות ששובצו לך לשבוע הנוכחי</div>
        </div>
        <WeekNav wkStart={wk} onShift={(d) => setWk((w) => addDays(w, d))} />
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
                  <span className="block text-[10.5px] font-normal text-text-3" style={{ direction: "ltr" }}>
                    {t.start_time?.slice(0, 5)}–{t.end_time?.slice(0, 5)}
                  </span>
                </span>
                {HE_DAYS.map((_, i) => {
                  const date = addDays(wk, i);
                  const assigned = assignMap.has(`${t.id}_${date}`);
                  return (
                    <div
                      key={i}
                      className="rounded-[10px] px-1 py-2.5 text-center text-[12.5px] font-bold"
                      style={
                        assigned
                          ? { background: "var(--accent)", color: "#fff", border: "1.5px solid var(--accent-2)" }
                          : { background: "var(--surface-2)", color: "var(--text-3)", border: "1.5px solid var(--border)" }
                      }
                    >
                      {assigned ? "משובץ" : "—"}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {(assignments ?? []).length === 0 && (
          <div className="mt-4 text-[12.5px] text-text-3">אין משמרות משובצות לשבוע זה.</div>
        )}
      </Card>
    </div>
  );
}

function EmployeeConstraints({ templates }: { templates: NonNullable<ReturnType<typeof useActiveShiftTemplates>["data"]> }) {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const nextWk = addDays(weekStart(), 7);
  const [wk, setWk] = useState(nextWk);
  const { data: prefs, isLoading, error, refetch } = useShiftPreferences(businessId, wk, profile?.id);
  const setPref = useSetPreference(businessId);
  const clearPref = useClearPreference(businessId);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);

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
    if (!profile?.id || !businessId) return;
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
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <div className="text-[24px] font-extrabold tracking-tight">הגשת אילוצי משמרות</div>
          <div className="mt-1 text-[14.5px] text-text-2">
            סמנו מתי אתם יכולים או לא יכולים לעבוד · השבוע הבא נפתח כברירת מחדל
          </div>
        </div>
        <WeekNav wkStart={wk} onShift={(d) => setWk((w) => addDays(w, d))} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-[12.5px] text-text-2">
          <span className="h-4 w-4 rounded" style={{ background: AVAIL_META.available.bg, border: `1.5px solid ${AVAIL_META.available.border}` }} />
          {AVAIL_META.available.label}
        </span>
        <span className="flex items-center gap-1.5 text-[12.5px] text-text-2">
          <span className="h-4 w-4 rounded" style={{ background: AVAIL_META.cannot.bg, border: `1.5px solid ${AVAIL_META.cannot.border}` }} />
          {AVAIL_META.cannot.label}
        </span>
        <span className="mr-auto text-[12.5px] text-text-3">
          {filledCells} מתוך {totalCells} משמרות מסומנות
        </span>
      </div>

      {saveError && (
        <div className="mb-3 flex items-center gap-2 rounded-[11px] border border-danger/30 [background:var(--danger-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-danger">
          <Icon name="error" size={18} />
          {saveError}
        </div>
      )}

      <Card className="p-4">
        <div className="overflow-auto">
          <div className="min-w-[720px]">
            <div className="mb-2 grid grid-cols-[100px_repeat(7,1fr)] gap-2">
              <span />
              {HE_DAYS.map((d, i) => (
                <div key={i} className="text-center">
                  <span className="block text-[13px] font-bold">{d}</span>
                  <span className="block text-[11px] text-text-3">{formatDateShort(addDays(wk, i))}</span>
                  <div className="mt-1.5 flex justify-center gap-1">
                    <button
                      type="button"
                      title="כל המשמרות ביום זה — יכול"
                      onClick={() => fillDay(i, "available")}
                      className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-info transition hover:[background:var(--info-bg)]"
                    >
                      הכל יכול
                    </button>
                    <button
                      type="button"
                      title="נקה יום"
                      onClick={() => clearDay(i)}
                      className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-text-3 transition hover:bg-surface-2"
                    >
                      נקה
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {templates.map((t) => (
              <div key={t.id} className="mb-2 grid grid-cols-[100px_repeat(7,1fr)] items-stretch gap-2">
                <div className="flex flex-col justify-center py-1">
                  <span className="text-[13px] font-bold text-text-2">{t.name}</span>
                  <span className="text-[10.5px] text-text-3" style={{ direction: "ltr" }}>
                    {t.start_time?.slice(0, 5)}–{t.end_time?.slice(0, 5)}
                  </span>
                </div>

                {HE_DAYS.map((_, i) => {
                  const date = addDays(wk, i);
                  const key = `${t.id}_${date}`;
                  const cur = prefMap.get(key) ?? null;
                  const isSaving = pending.has(key);
                  return (
                    <AvailabilityCell
                      key={i}
                      value={cur}
                      saving={isSaving}
                      onSet={(v) => setAvailability(t.id, date, v)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[12.5px] text-text-3">
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
      </Card>
    </div>
  );
}

function AvailabilityCell({
  value,
  saving,
  onSet,
}: {
  value: "available" | "cannot" | null;
  saving?: boolean;
  onSet: (v: Availability | null) => void;
}) {
  const isAvail = value === "available";
  const isCannot = value === "cannot";

  return (
    <div
      className={`flex min-h-[52px] flex-col gap-1 rounded-[10px] border p-1 transition ${saving ? "opacity-60" : ""}`}
      style={{
        background: isAvail ? AVAIL_META.available.bg : isCannot ? AVAIL_META.cannot.bg : "var(--surface-2)",
        borderColor: isAvail ? AVAIL_META.available.border : isCannot ? AVAIL_META.cannot.border : "var(--border)",
      }}
    >
      <button
        type="button"
        disabled={saving}
        onClick={() => onSet(isAvail ? null : "available")}
        className="flex flex-1 items-center justify-center gap-1 rounded-[7px] py-1.5 text-[11.5px] font-bold transition"
        style={
          isAvail
            ? { background: "var(--info)", color: "#fff" }
            : { background: "transparent", color: "var(--text-3)" }
        }
      >
        <Icon name="check" size={15} />
        {AVAIL_META.available.short}
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => onSet(isCannot ? null : "cannot")}
        className="flex flex-1 items-center justify-center gap-1 rounded-[7px] py-1.5 text-[11.5px] font-bold transition"
        style={
          isCannot
            ? { background: "var(--danger)", color: "#fff" }
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

  if (lt || ld) return <PageLoader />;

  if (!templates?.length || !departments?.length) {
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
                  const meta = pref ? AVAIL_META[pref] : null;
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
                      {already ? <Badge tone="neutral">משובץ</Badge> : meta ? <Badge tone={pref === "available" ? "info" : "danger"}>{meta.label}</Badge> : null}
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
