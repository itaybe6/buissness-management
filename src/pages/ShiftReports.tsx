import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Input,
  PageHeader,
  PageLoader,
  Select,
  Switch,
  Textarea,
} from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId, formatCurrency, formatDateShort, todayISO, weekStart, addDays } from "@/lib/db";
import { buildTipParticipantsFromShift } from "@/lib/shiftReportTips";
import { useProfiles } from "@/api/users";
import { useActiveShiftTemplates, useShiftAssignments } from "@/api/shifts";
import { useAttendanceMonth } from "@/api/attendance";
import {
  useShiftReports,
  useSaveShiftReport,
  useDeleteShiftReport,
  uploadInvoices,
  type SaveShiftReportInput,
} from "@/api/shiftReports";
import type {
  Profile,
  ShiftReport,
  ShiftReportParticipant,
  ShiftReportSalesItem,
  ShiftTemplate,
} from "@/types/database";

function monthNow() {
  return new Date().toISOString().slice(0, 7);
}

export function ShiftReports() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const [month, setMonth] = useState(monthNow());
  const { data: reports, isLoading, isError, refetch } = useShiftReports(businessId, month);
  const { data: users } = useProfiles(businessId);
  const { data: templates } = useActiveShiftTemplates(businessId);
  const del = useDeleteShiftReport(businessId);

  // null = list view; object = editor (new when no id)
  const [editing, setEditing] = useState<ShiftReport | "new" | null>(null);

  const canManage = !!profile && ["manager", "shift_manager"].includes(profile.role);

  const templateName = useMemo(
    () => (id: string | null) => templates?.find((t) => t.id === id)?.name ?? "כללי",
    [templates],
  );
  const userName = useMemo(
    () => (id: string) => users?.find((u) => u.id === id)?.full_name ?? "—",
    [users],
  );

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <div className="mx-auto max-w-[1100px] animate-fadeUp">
      <PageHeader
        title="דוח סגירת משמרת"
        subtitle="סיכום משמרת, סגירת קופה, חשבוניות וטיפים"
        actions={
          <div className="flex items-center gap-2.5">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="!w-[150px]" />
            {canManage && <Button icon="add" onClick={() => setEditing("new")}>דוח חדש</Button>}
          </div>
        }
      />

      {(reports ?? []).length === 0 ? (
        <EmptyState
          icon="receipt_long"
          title="אין דוחות לחודש זה"
          description="מלאו דוח סיכום משמרת בסוף המשמרת — כולל סגירת קופה, טיפים וחשבוניות."
          action={canManage ? <Button icon="add" onClick={() => setEditing("new")}>דוח חדש</Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          {(reports ?? []).map((r) => (
            <Card key={r.id} className="flex flex-col gap-3 p-[18px]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[17px] font-extrabold tracking-tight">{formatDateShort(r.report_date)}</div>
                  <div className="mt-0.5 text-[12.5px] text-text-2">{templateName(r.shift_template_id)}</div>
                </div>
                <Badge tone="violet">{formatCurrency(Number(r.total_tips))} טיפים</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[13px]">
                <div className="rounded-[10px] bg-surface-2 px-3 py-2">
                  <div className="text-[11px] text-text-3">מכירות</div>
                  <div className="font-bold">{formatCurrency(Number(r.total_sales))}</div>
                </div>
                <div className="rounded-[10px] bg-surface-2 px-3 py-2">
                  <div className="text-[11px] text-text-3">שכר שעתי מטיפים</div>
                  <div className="font-bold">{formatCurrency(Number(r.tips_hourly))}</div>
                </div>
              </div>

              {r.manager_names && <div className="text-[12.5px] text-text-2">אחמ״ש: {r.manager_names}</div>}

              <div className="mt-auto flex items-center justify-between border-t border-border-2 pt-3">
                <span className="text-[12px] text-text-3">{(r.invoice_urls ?? []).length} חשבוניות</span>
                {canManage && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditing(r)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:bg-surface-2 hover:text-text"
                      title="עריכה"
                    >
                      <Icon name="edit" size={18} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("למחוק את הדוח? הטיפים שנוצרו ממנו יימחקו גם הם.")) del.mutate(r.id);
                      }}
                      className="grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:[background:var(--danger-bg)] hover:text-danger"
                      title="מחיקה"
                    >
                      <Icon name="delete" size={18} />
                    </button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <ReportEditor
          report={editing === "new" ? null : editing}
          businessId={businessId!}
          createdBy={profile?.id ?? null}
          users={(users ?? []).filter((u) => u.active && (u.wage_type ?? "hourly") === "tips")}
          templates={templates ?? []}
          userName={userName}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------- Editor ------------------------------- */

interface EditorState {
  report_date: string;
  shift_template_id: string;
  manager_names: string;
  total_sales: string;
  delivery_sales: string;
  avg_per_diner: string;
  total_tips: string;
  service_pct: string;
  first_release: string;
  energy_level: string;
  unusual_events: string;
  team_talks: string;
  team_voice: string;
  daily_tasks_done: boolean;
  urgent_inventory: string;
  faults_maintenance: string;
  top_seller: string;
  participants: ShiftReportParticipant[];
  sales_items: ShiftReportSalesItem[];
  invoice_urls: string[];
}

function blankState(): EditorState {
  return {
    report_date: todayISO(),
    shift_template_id: "",
    manager_names: "",
    total_sales: "",
    delivery_sales: "",
    avg_per_diner: "",
    total_tips: "",
    service_pct: "",
    first_release: "",
    energy_level: "",
    unusual_events: "",
    team_talks: "",
    team_voice: "",
    daily_tasks_done: false,
    urgent_inventory: "",
    faults_maintenance: "",
    top_seller: "",
    participants: [],
    sales_items: [],
    invoice_urls: [],
  };
}

function fromReport(r: ShiftReport): EditorState {
  return {
    report_date: r.report_date,
    shift_template_id: r.shift_template_id ?? "",
    manager_names: r.manager_names ?? "",
    total_sales: String(r.total_sales ?? ""),
    delivery_sales: String(r.delivery_sales ?? ""),
    avg_per_diner: String(r.avg_per_diner ?? ""),
    total_tips: String(r.total_tips ?? ""),
    service_pct: String(r.service_pct ?? ""),
    first_release: r.first_release ?? "",
    energy_level: r.energy_level != null ? String(r.energy_level) : "",
    unusual_events: r.unusual_events ?? "",
    team_talks: r.team_talks ?? "",
    team_voice: r.team_voice ?? "",
    daily_tasks_done: r.daily_tasks_done,
    urgent_inventory: r.urgent_inventory ?? "",
    faults_maintenance: r.faults_maintenance ?? "",
    top_seller: r.extra?.top_seller ?? "",
    participants: r.extra?.tip_participants ?? [],
    sales_items: r.extra?.sales_items ?? [],
    invoice_urls: r.invoice_urls ?? [],
  };
}

function ReportEditor({
  report,
  businessId,
  createdBy,
  users,
  templates,
  userName,
  onClose,
}: {
  report: ShiftReport | null;
  businessId: string;
  createdBy: string | null;
  users: Profile[];
  templates: ShiftTemplate[];
  userName: (id: string) => string;
  onClose: () => void;
}) {
  const [s, setS] = useState<EditorState>(report ? fromReport(report) : blankState());
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useSaveShiftReport(businessId);

  const reportMonth = s.report_date.slice(0, 7);
  const reportWeekStart = weekStart(new Date(s.report_date + "T12:00:00"));
  const { data: assignments, isLoading: assignmentsLoading } = useShiftAssignments(
    businessId,
    reportWeekStart,
    addDays(reportWeekStart, 6),
  );
  const { data: attendance, isLoading: attendanceLoading } = useAttendanceMonth(businessId, reportMonth);

  const tipEmployeeIds = useMemo(() => new Set(users.map((u) => u.id)), [users]);
  const participantsKeyRef = useRef(
    report ? `${report.report_date}|${report.shift_template_id ?? ""}` : "",
  );

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!s.report_date || !s.shift_template_id || assignmentsLoading || attendanceLoading) return;

    const key = `${s.report_date}|${s.shift_template_id}`;
    if (participantsKeyRef.current === key) return;
    participantsKeyRef.current = key;

    const built = buildTipParticipantsFromShift({
      reportDate: s.report_date,
      shiftTemplateId: s.shift_template_id,
      assignments: assignments ?? [],
      tipEmployeeIds,
      attendance: attendance ?? [],
      templates,
    });
    set("participants", built);
  }, [
    s.report_date,
    s.shift_template_id,
    assignments,
    attendance,
    assignmentsLoading,
    attendanceLoading,
    tipEmployeeIds,
    templates,
  ]);

  const totalTips = Number(s.total_tips) || 0;
  const totalHours = s.participants.reduce((sum, p) => sum + (Number(p.hours) || 0), 0);
  const tipsHourly = totalHours > 0 ? totalTips / totalHours : 0;
  const participantsLoading = assignmentsLoading || attendanceLoading;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const urls = await uploadInvoices(businessId, Array.from(files));
      set("invoice_urls", [...s.invoice_urls, ...urls]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "העלאת החשבונית נכשלה");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setError(null);
    const payload: SaveShiftReportInput = {
      id: report?.id,
      business_id: businessId,
      report_date: s.report_date,
      shift_template_id: s.shift_template_id || null,
      manager_names: s.manager_names.trim() || null,
      total_sales: Number(s.total_sales) || 0,
      delivery_sales: Number(s.delivery_sales) || 0,
      avg_per_diner: Number(s.avg_per_diner) || 0,
      total_tips: totalTips,
      service_pct: Number(s.service_pct) || 0,
      first_release: s.first_release.trim() || null,
      energy_level: s.energy_level ? Number(s.energy_level) : null,
      unusual_events: s.unusual_events.trim() || null,
      team_talks: s.team_talks.trim() || null,
      team_voice: s.team_voice.trim() || null,
      daily_tasks_done: s.daily_tasks_done,
      urgent_inventory: s.urgent_inventory.trim() || null,
      faults_maintenance: s.faults_maintenance.trim() || null,
      extra: {
        tip_participants: s.participants.filter((p) => p.employee_id),
        sales_items: s.sales_items.filter((i) => i.label.trim()),
        top_seller: s.top_seller.trim(),
      },
      invoice_urls: s.invoice_urls,
      created_by: report?.created_by ?? createdBy,
    };
    try {
      await save.mutateAsync(payload);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שמירת הדוח נכשלה");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={report ? "עריכת דוח משמרת" : "דוח סיכום משמרת"}
      subtitle="סגירת קופה, צוות, מכירות, לוגיסטיקה וחשבוניות"
      icon="receipt_long"
      maxWidth={720}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
          <Button className="flex-1" icon="save" loading={save.isPending} onClick={submit}>שמירת דוח</Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {/* פרטי משמרת */}
        <Section icon="event" title="פרטי משמרת">
          <div className="grid grid-cols-2 gap-3">
            <Field label="תאריך"><Input type="date" value={s.report_date} onChange={(e) => set("report_date", e.target.value)} /></Field>
            <Field label="משמרת">
              <Select value={s.shift_template_id} onChange={(e) => set("shift_template_id", e.target.value)}>
                <option value="">— כללי —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label='אחמ"ש (אחראי משמרת)'>
            <Input value={s.manager_names} onChange={(e) => set("manager_names", e.target.value)} placeholder="לדוגמה: ים וגד" />
          </Field>
        </Section>

        {/* כספים / סגירת קופה */}
        <Section icon="payments" title="סגירת קופה">
          <div className="grid grid-cols-2 gap-3">
            <Field label='סה"כ מכירות (₪)'><Input type="number" inputMode="decimal" value={s.total_sales} onChange={(e) => set("total_sales", e.target.value)} /></Field>
            <Field label="משלוחים / וולט (₪)"><Input type="number" inputMode="decimal" value={s.delivery_sales} onChange={(e) => set("delivery_sales", e.target.value)} /></Field>
            <Field label="ממוצע לסועד (₪)"><Input type="number" inputMode="decimal" value={s.avg_per_diner} onChange={(e) => set("avg_per_diner", e.target.value)} /></Field>
            <Field label="אחוז שירות (%)"><Input type="number" inputMode="decimal" value={s.service_pct} onChange={(e) => set("service_pct", e.target.value)} /></Field>
          </div>
        </Section>

        {/* טיפים */}
        <Section icon="savings" title="טיפים">
          <div className="grid grid-cols-2 gap-3">
            <Field label='סה"כ טיפים (₪)'><Input type="number" inputMode="decimal" value={s.total_tips} onChange={(e) => set("total_tips", e.target.value)} /></Field>
            <Field label="שכר שעתי מטיפים">
              <div className="field flex items-center bg-surface-2 font-bold">{formatCurrency(tipsHourly)}</div>
            </Field>
          </div>

          <div className="mt-1 text-[12.5px] text-text-2">
            העובדים נטענים אוטומטית מהשיבוץ במשמרת — עדכנו שעות במידת הצורך. הטיפים יתחלקו לפי שעות ויופיעו במסך השכר.
          </div>

          {participantsLoading ? (
            <div className="rounded-[11px] border border-border bg-surface-2 px-3.5 py-4 text-center text-[13px] text-text-2">
              טוען עובדים מהמשמרת...
            </div>
          ) : !s.shift_template_id ? (
            <div className="rounded-[11px] border border-dashed border-border px-3.5 py-4 text-center text-[13px] text-text-2">
              בחרו משמרת כדי לטעון את עובדי הטיפים.
            </div>
          ) : s.participants.length === 0 ? (
            <div className="rounded-[11px] border border-dashed border-border px-3.5 py-4 text-center text-[13px] text-text-2">
              לא נמצאו עובדי טיפים משובצים למשמרת זו בתאריך שנבחר.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[11px] border border-border">
              <div className="grid grid-cols-[1fr_90px_auto_36px] items-center gap-2 border-b border-border bg-surface-2 px-3 py-2 text-[11.5px] font-bold text-text-3">
                <span>עובד</span>
                <span>שעות</span>
                <span>חלק בטיפים</span>
                <span />
              </div>
              <div className="flex flex-col divide-y divide-border-2">
                {s.participants.map((p, idx) => (
                  <div key={p.employee_id} className="grid grid-cols-[1fr_90px_auto_36px] items-center gap-2 px-3 py-2.5">
                    <span className="truncate text-[14px] font-semibold">{userName(p.employee_id)}</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="שעות"
                      value={p.hours || ""}
                      onChange={(e) => {
                        const next = [...s.participants];
                        next[idx] = { ...next[idx], hours: Number(e.target.value) || 0 };
                        set("participants", next);
                      }}
                    />
                    <span className="whitespace-nowrap text-[12.5px] font-bold text-accent-2">
                      {formatCurrency(tipsHourly * (Number(p.hours) || 0))}
                    </span>
                    <button
                      onClick={() => set("participants", s.participants.filter((_, i) => i !== idx))}
                      className="grid h-9 w-9 place-items-center rounded-lg text-text-3 hover:[background:var(--danger-bg)] hover:text-danger"
                      title="הסרה מהרשימה"
                    >
                      <Icon name="close" size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* הצוות */}
        <Section icon="groups" title="הצוות">
          <div className="grid grid-cols-2 gap-3">
            <Field label="מתי שוחרר עובד ראשון"><Input value={s.first_release} onChange={(e) => set("first_release", e.target.value)} placeholder="23:00" /></Field>
            <Field label="אנרגיות בצוות (1-10)"><Input type="number" min={1} max={10} value={s.energy_level} onChange={(e) => set("energy_level", e.target.value)} /></Field>
          </div>
          <Field label="אירועים חריגים (איחורים, הברזות, משהו אישי?)">
            <Textarea rows={3} value={s.unusual_events} onChange={(e) => set("unusual_events", e.target.value)} />
          </Field>
          <Field label="שיחות שנעשו במשמרת (פידבק, חידוד נהלים, מילה טובה)">
            <Textarea rows={4} value={s.team_talks} onChange={(e) => set("team_talks", e.target.value)} />
          </Field>
          <Field label="הקול של הצוות (בקשות / מה היה חסר)">
            <Textarea rows={2} value={s.team_voice} onChange={(e) => set("team_voice", e.target.value)} />
          </Field>
        </Section>

        {/* מכירות */}
        <Section icon="local_bar" title="מכירות">
          <div className="flex flex-col gap-2">
            {s.sales_items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_110px_36px] items-center gap-2">
                <Input
                  placeholder="פריט (לדוגמה: קוקטיילים)"
                  value={item.label}
                  onChange={(e) => {
                    const next = [...s.sales_items];
                    next[idx] = { ...next[idx], label: e.target.value };
                    set("sales_items", next);
                  }}
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="כמות"
                  value={item.count || ""}
                  onChange={(e) => {
                    const next = [...s.sales_items];
                    next[idx] = { ...next[idx], count: Number(e.target.value) || 0 };
                    set("sales_items", next);
                  }}
                />
                <button
                  onClick={() => set("sales_items", s.sales_items.filter((_, i) => i !== idx))}
                  className="grid h-9 w-9 place-items-center rounded-lg text-text-3 hover:[background:var(--danger-bg)] hover:text-danger"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            ))}
            <Button
              variant="secondary"
              icon="add"
              onClick={() => set("sales_items", [...s.sales_items, { label: "", count: 0 }])}
              className="self-start"
            >
              הוספת פריט מכירה
            </Button>
          </div>
          <Field label="מי מכר הכי הרבה"><Input value={s.top_seller} onChange={(e) => set("top_seller", e.target.value)} /></Field>
        </Section>

        {/* לוגיסטיקה */}
        <Section icon="inventory_2" title="לוגיסטיקה ותחזוקה">
          <label className="flex cursor-pointer items-center justify-between rounded-[11px] border border-border px-3.5 py-3">
            <span className="text-[14px] font-semibold">משימות יומיות בוצעו</span>
            <Switch checked={s.daily_tasks_done} onChange={(v) => set("daily_tasks_done", v)} />
          </label>
          <Field label="מלאי שנגמר וחייב הזמנה דחופה">
            <Textarea rows={2} value={s.urgent_inventory} onChange={(e) => set("urgent_inventory", e.target.value)} />
          </Field>
          <Field label="תקלות ותחזוקה (משהו נשבר / צריך תיקון?)">
            <Textarea rows={2} value={s.faults_maintenance} onChange={(e) => set("faults_maintenance", e.target.value)} />
          </Field>
        </Section>

        {/* חשבוניות */}
        <Section icon="receipt" title="חשבוניות">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {s.invoice_urls.map((url, idx) => (
              <div key={idx} className="group relative overflow-hidden rounded-[11px] border border-border">
                <a href={url} target="_blank" rel="noreferrer" className="block">
                  {/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) ? (
                    <img src={url} alt="חשבונית" className="h-28 w-full object-cover" />
                  ) : (
                    <div className="flex h-28 w-full flex-col items-center justify-center gap-1 bg-surface-2 text-text-2">
                      <Icon name="description" size={26} />
                      <span className="text-[11px]">קובץ</span>
                    </div>
                  )}
                </a>
                <button
                  onClick={() => set("invoice_urls", s.invoice_urls.filter((_, i) => i !== idx))}
                  className="absolute left-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg bg-black/55 text-white hover:bg-black/75"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
            <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-[11px] border border-dashed border-border text-text-3 hover:bg-surface-2">
              {uploading ? <Icon name="hourglass_top" size={24} /> : <Icon name="add_a_photo" size={24} />}
              <span className="text-[11.5px] font-semibold">{uploading ? "מעלה..." : "העלאת חשבונית"}</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>
          </div>
        </Section>

        {error && (
          <div className="flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
            <Icon name="error" size={18} /> {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 border-b border-border-2 pb-2">
        <Icon name={icon} size={19} className="text-accent-2" />
        <span className="text-[14.5px] font-extrabold">{title}</span>
      </div>
      {children}
    </div>
  );
}
