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
import { useBusinessId, formatCurrency, formatDateShort, todayISO } from "@/lib/db";
import {
  buildTeamMembersFromShift,
  formatWorkTimeRange,
  getAttendanceHoursForShiftReport,
  getAttendanceTimeRangeForShiftReport,
  hoursBetweenTimes,
} from "@/lib/shiftReportTips";
import { useInventory } from "@/api/inventory";
import { computeBonusPayouts } from "@/lib/shiftReportBonuses";
import { useProfiles } from "@/api/users";
import { useAttendanceAroundDate } from "@/api/attendance";
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
  ShiftReportOutOfStockItem,
  ShiftReportParticipant,
  ShiftReportSalesItem,
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
  const del = useDeleteShiftReport(businessId);

  // null = list view; object = editor (new when no id)
  const [editing, setEditing] = useState<ShiftReport | "new" | null>(null);
  const [viewing, setViewing] = useState<ShiftReport | null>(null);

  const canManage = !!profile && ["manager", "shift_manager"].includes(profile.role);

  const userName = useMemo(
    () => (id: string) => users?.find((u) => u.id === id)?.full_name ?? "—",
    [users],
  );
  const shiftManagers = useMemo(
    () => (users ?? []).filter((u) => u.active && u.role === "shift_manager"),
    [users],
  );

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <div className="w-full animate-fadeUp">
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
                  <div className="mt-0.5 text-[12.5px] text-text-2">דוח יומי</div>
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
                <div className="flex gap-1">
                  <button
                    onClick={() => setViewing(r)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:bg-surface-2 hover:text-text"
                    title="צפייה בדוח"
                  >
                    <Icon name="visibility" size={18} />
                  </button>
                  {canManage && (
                    <>
                      <button
                        onClick={() => setEditing(r)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:bg-surface-2 hover:text-text"
                        title="עריכה"
                      >
                        <Icon name="edit" size={18} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("למחוק את הדוח? הטיפים והתוספות שכר שנוצרו ממנו יימחקו גם הם.")) del.mutate(r.id);
                        }}
                        className="grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:[background:var(--danger-bg)] hover:text-danger"
                        title="מחיקה"
                      >
                        <Icon name="delete" size={18} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {viewing && (
        <ReportViewer
          report={viewing}
          userName={userName}
          canManage={canManage}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setViewing(null);
            setEditing(viewing);
          }}
        />
      )}

      {editing && (
        <ReportEditor
          report={editing === "new" ? null : editing}
          businessId={businessId!}
          createdBy={profile?.id ?? null}
          users={(users ?? []).filter((u) => u.active && (u.wage_type ?? "hourly") === "tips")}
          allUsers={(users ?? []).filter((u) => u.active)}
          shiftManagers={shiftManagers}
          userName={userName}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------- Editor ------------------------------- */

interface EditorBonusRow {
  employee_id: string;
  bonus_pct: string;
}

interface EditorState {
  report_date: string;
  manager_id: string;
  total_sales: string;
  delivery_sales: string;
  avg_per_diner: string;
  total_tips: string;
  first_release: string;
  energy_level: string;
  unusual_events: string;
  team_talks: string;
  team_voice: string;
  daily_tasks_done: boolean;
  urgent_inventory_enabled: boolean;
  out_of_stock_items: ShiftReportOutOfStockItem[];
  urgent_inventory: string;
  faults_enabled: boolean;
  faults_maintenance: string;
  top_seller: string;
  participants: ShiftReportParticipant[];
  team_members: ShiftReportParticipant[];
  bonus_participants: EditorBonusRow[];
  sales_items: ShiftReportSalesItem[];
  invoice_urls: string[];
}

function blankState(): EditorState {
  return {
    report_date: todayISO(),
    manager_id: "",
    total_sales: "",
    delivery_sales: "",
    avg_per_diner: "",
    total_tips: "",
    first_release: "",
    energy_level: "",
    unusual_events: "",
    team_talks: "",
    team_voice: "",
    daily_tasks_done: false,
    urgent_inventory_enabled: false,
    out_of_stock_items: [],
    urgent_inventory: "",
    faults_enabled: false,
    faults_maintenance: "",
    top_seller: "",
    participants: [],
    team_members: [],
    bonus_participants: [],
    sales_items: [],
    invoice_urls: [],
  };
}

function fromReport(r: ShiftReport, allUsers: Profile[]): EditorState {
  const legacyPct = Number(r.service_pct) || 0;
  const managerId =
    r.extra?.manager_id ??
    allUsers.find((u) => u.role === "shift_manager" && u.full_name === r.manager_names)?.id ??
    "";

  return {
    report_date: r.report_date,
    manager_id: managerId,
    total_sales: String(r.total_sales ?? ""),
    delivery_sales: String(r.delivery_sales ?? ""),
    avg_per_diner: String(r.avg_per_diner ?? ""),
    total_tips: String(r.total_tips ?? ""),
    first_release: r.first_release ?? "",
    energy_level: r.energy_level != null ? String(r.energy_level) : "",
    unusual_events: r.unusual_events ?? "",
    team_talks: r.team_talks ?? "",
    team_voice: r.team_voice ?? "",
    daily_tasks_done: r.daily_tasks_done,
    urgent_inventory_enabled:
      (r.extra?.out_of_stock_items?.length ?? 0) > 0 || !!r.urgent_inventory?.trim(),
    out_of_stock_items: r.extra?.out_of_stock_items ?? [],
    urgent_inventory: r.urgent_inventory ?? "",
    faults_enabled: !!r.faults_maintenance?.trim(),
    faults_maintenance: r.faults_maintenance ?? "",
    top_seller: r.extra?.top_seller ?? "",
    participants: r.extra?.tip_participants ?? [],
    team_members: (r.extra?.team_members ?? []).filter(
      (p) => (Number(p.attendance_hours) || Number(p.hours) || 0) > 0,
    ),
    bonus_participants: (r.extra?.bonus_participants ?? []).map((p) => ({
      employee_id: p.employee_id,
      bonus_pct: String(p.bonus_pct ?? legacyPct),
    })),
    sales_items: r.extra?.sales_items ?? [],
    invoice_urls: r.invoice_urls ?? [],
  };
}

function ReportEditor({
  report,
  businessId,
  createdBy,
  users,
  allUsers,
  shiftManagers,
  userName,
  onClose,
}: {
  report: ShiftReport | null;
  businessId: string;
  createdBy: string | null;
  users: Profile[];
  allUsers: Profile[];
  shiftManagers: Profile[];
  userName: (id: string) => string;
  onClose: () => void;
}) {
  const [s, setS] = useState<EditorState>(report ? fromReport(report, allUsers) : blankState());
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useSaveShiftReport(businessId);

  const { data: attendance, isLoading: attendanceLoading } = useAttendanceAroundDate(businessId, s.report_date);
  const { data: inventoryItems = [] } = useInventory(businessId);

  const tipEmployeeIds = useMemo(() => new Set(users.map((u) => u.id)), [users]);
  const rosterKeyRef = useRef(
    (report?.extra?.team_members?.length ?? 0) > 0 ? report!.report_date : "",
  );

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));

  function attendanceReportInput(employeeId: string, reportDate: string) {
    return {
      attendance: attendance ?? [],
      employeeId,
      reportDate,
      shiftTemplateId: "",
      templates: [],
    };
  }

  const shiftAttendanceHours = (employeeId: string) =>
    getAttendanceHoursForShiftReport(attendanceReportInput(employeeId, s.report_date));

  const shiftAttendanceRange = (employeeId: string) =>
    getAttendanceTimeRangeForShiftReport(attendanceReportInput(employeeId, s.report_date));

  useEffect(() => {
    if (!s.report_date || attendanceLoading) return;

    const key = s.report_date;
    if (rosterKeyRef.current === key) return;
    rosterKeyRef.current = key;

    const team = buildTeamMembersFromShift({
      reportDate: s.report_date,
      shiftTemplateId: "",
      assignments: [],
      attendance: attendance ?? [],
      templates: [],
    });
    const tips = team.filter((p) => tipEmployeeIds.has(p.employee_id));
    setS((prev) => ({ ...prev, team_members: team, participants: tips }));
  }, [s.report_date, attendance, attendanceLoading, tipEmployeeIds]);

  useEffect(() => {
    if (attendanceLoading || !s.report_date) return;
    setS((prev) => {
      let changed = false;
      const nextParticipants = prev.participants
        .map((p) => {
          if (!p.employee_id) return p;
          const attHrs = getAttendanceHoursForShiftReport(attendanceReportInput(p.employee_id, prev.report_date));
          const range = getAttendanceTimeRangeForShiftReport(attendanceReportInput(p.employee_id, prev.report_date));
          const synced = Math.abs((Number(p.hours) || 0) - (Number(p.attendance_hours) || 0)) <= 0.01;
          if (p.attendance_hours === attHrs && (!synced || !range)) return p;
          changed = true;
          return {
            ...p,
            attendance_hours: attHrs,
            ...(synced && range
              ? { hours: attHrs, work_start: range.work_start, work_end: range.work_end }
              : {}),
          };
        })
        .filter((p) => !p.employee_id || (Number(p.hours) || 0) > 0);
      const nextTeam = prev.team_members
        .map((p) => {
          if (!p.employee_id) return p;
          const attHrs = getAttendanceHoursForShiftReport(attendanceReportInput(p.employee_id, prev.report_date));
          const range = getAttendanceTimeRangeForShiftReport(attendanceReportInput(p.employee_id, prev.report_date));
          const synced = Math.abs((Number(p.hours) || 0) - (Number(p.attendance_hours) || 0)) <= 0.01;
          if (p.attendance_hours === attHrs && (!synced || !range)) return p;
          changed = true;
          return {
            ...p,
            attendance_hours: attHrs,
            ...(synced && range
              ? { hours: attHrs, work_start: range.work_start, work_end: range.work_end }
              : {}),
          };
        })
        .filter(
          (p) =>
            !p.employee_id ||
            (Number(p.hours) || 0) > 0 ||
            (!!p.work_start && !!p.work_end),
        );
      if (nextTeam.length !== prev.team_members.length) changed = true;
      if (nextParticipants.length !== prev.participants.length) changed = true;
      if (!changed) return prev;
      return { ...prev, participants: nextParticipants, team_members: nextTeam };
    });
  }, [attendance, attendanceLoading, s.report_date]);

  const totalTips = Number(s.total_tips) || 0;
  const totalSales = Number(s.total_sales) || 0;
  const totalHours = s.participants.reduce((sum, p) => sum + (Number(p.hours) || 0), 0);
  const tipsHourly = totalHours > 0 ? totalTips / totalHours : 0;
  const bonusPayouts = useMemo(
    () =>
      computeBonusPayouts(
        totalSales,
        s.bonus_participants.map((p) => ({
          employee_id: p.employee_id,
          bonus_pct: Number(p.bonus_pct) || 0,
        })),
      ),
    [totalSales, s.bonus_participants],
  );
  const participantsLoading = attendanceLoading;
  const availableTeamUsers = allUsers.filter((u) => !s.team_members.some((p) => p.employee_id === u.id));
  const availableBonusUsers = allUsers.filter(
    (u) => !s.bonus_participants.some((p) => p.employee_id === u.id),
  );
  const selectedOutOfStockIds = useMemo(
    () => new Set(s.out_of_stock_items.map((i) => i.item_id)),
    [s.out_of_stock_items],
  );

  function updateParticipant(idx: number, patch: Partial<ShiftReportParticipant>) {
    const next = [...s.participants];
    next[idx] = { ...next[idx], ...patch };
    if (patch.employee_id) {
      next[idx].attendance_hours = shiftAttendanceHours(patch.employee_id);
    }
    set("participants", next);
  }

  function updateTeamMember(idx: number, patch: Partial<ShiftReportParticipant>) {
    const current = s.team_members[idx];
    if (!current) return;

    const nextRow: ShiftReportParticipant = { ...current, ...patch };

    if (patch.work_start !== undefined || patch.work_end !== undefined) {
      const start = patch.work_start ?? current.work_start ?? "";
      const end = patch.work_end ?? current.work_end ?? "";
      if (start && end) {
        nextRow.hours = hoursBetweenTimes(start, end);
      }
    }

    if (patch.employee_id) {
      const range = shiftAttendanceRange(patch.employee_id);
      const attHrs = range?.hours ?? shiftAttendanceHours(patch.employee_id);
      nextRow.attendance_hours = attHrs;
      nextRow.hours = attHrs;
      nextRow.work_start = range?.work_start ?? "";
      nextRow.work_end = range?.work_end ?? "";
    }

    const next = [...s.team_members];
    next[idx] = nextRow;

    setS((prev) => {
      let participants = prev.participants;
      const employeeId = nextRow.employee_id;
      if (employeeId && tipEmployeeIds.has(employeeId)) {
        const existingIdx = participants.findIndex((p) => p.employee_id === employeeId);
        if (existingIdx >= 0) {
          const synced =
            Math.abs((Number(participants[existingIdx].hours) || 0) - (Number(participants[existingIdx].attendance_hours) || 0)) <=
            0.01;
          if (
            synced ||
            patch.employee_id ||
            patch.hours !== undefined ||
            patch.work_start !== undefined ||
            patch.work_end !== undefined
          ) {
            participants = participants.map((p, i) =>
              i === existingIdx
                ? {
                    ...p,
                    hours: nextRow.hours,
                    attendance_hours: nextRow.attendance_hours,
                    work_start: nextRow.work_start,
                    work_end: nextRow.work_end,
                  }
                : p,
            );
          }
        } else {
          participants = [
            ...participants,
            {
              employee_id: employeeId,
              hours: nextRow.hours,
              attendance_hours: nextRow.attendance_hours,
              work_start: nextRow.work_start,
              work_end: nextRow.work_end,
            },
          ];
        }
      }
      return { ...prev, team_members: next, participants };
    });
  }

  function removeTeamMember(idx: number) {
    const removed = s.team_members[idx];
    setS((prev) => ({
      ...prev,
      team_members: prev.team_members.filter((_, i) => i !== idx),
      participants:
        removed?.employee_id && tipEmployeeIds.has(removed.employee_id)
          ? prev.participants.filter((p) => p.employee_id !== removed.employee_id)
          : prev.participants,
    }));
  }

  function toggleOutOfStockItem(itemId: string) {
    const next = new Set(selectedOutOfStockIds);
    if (next.has(itemId)) {
      next.delete(itemId);
    } else {
      next.add(itemId);
    }
    const items = inventoryItems
      .filter((item) => next.has(item.id))
      .map((item) => ({ item_id: item.id, name: item.name }));
    set("out_of_stock_items", items);
  }

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

  function updateBonusRow(idx: number, patch: Partial<EditorBonusRow>) {
    const next = [...s.bonus_participants];
    next[idx] = { ...next[idx], ...patch };
    set("bonus_participants", next);
  }

  async function submit() {
    setError(null);
    const outOfStockItems = s.urgent_inventory_enabled ? s.out_of_stock_items : [];
    const urgentInventoryText = s.urgent_inventory_enabled
      ? outOfStockItems.length > 0
        ? outOfStockItems.map((i) => i.name).join(", ")
        : s.urgent_inventory.trim() || null
      : null;
    const faultsText = s.faults_enabled ? s.faults_maintenance.trim() || null : null;
    const manager = shiftManagers.find((m) => m.id === s.manager_id);
    const bonusRows = s.bonus_participants
      .filter((p) => p.employee_id && (Number(p.bonus_pct) || 0) > 0)
      .map((p) => ({ employee_id: p.employee_id, bonus_pct: Number(p.bonus_pct) || 0 }));
    const payload: SaveShiftReportInput = {
      id: report?.id,
      business_id: businessId,
      report_date: s.report_date,
      shift_template_id: null,
      manager_names: manager?.full_name ?? null,
      total_sales: Number(s.total_sales) || 0,
      delivery_sales: Number(s.delivery_sales) || 0,
      avg_per_diner: Number(s.avg_per_diner) || 0,
      total_tips: totalTips,
      service_pct: 0,
      first_release: s.first_release.trim() || null,
      energy_level: s.energy_level ? Number(s.energy_level) : null,
      unusual_events: s.unusual_events.trim() || null,
      team_talks: s.team_talks.trim() || null,
      team_voice: s.team_voice.trim() || null,
      daily_tasks_done: s.daily_tasks_done,
      urgent_inventory: urgentInventoryText,
      faults_maintenance: faultsText,
      extra: {
        tip_participants: s.participants.filter((p) => p.employee_id),
        team_members: s.team_members.filter((p) => p.employee_id),
        out_of_stock_items: outOfStockItems,
        bonus_participants: bonusRows,
        manager_id: s.manager_id || undefined,
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
        <Section icon="event" title="פרטי היום">
          <div className="grid grid-cols-2 gap-3">
            <Field label="תאריך"><Input type="date" value={s.report_date} onChange={(e) => set("report_date", e.target.value)} /></Field>
            <Field label='אחמ"ש (אחראי משמרת)'>
              <Select value={s.manager_id} onChange={(e) => set("manager_id", e.target.value)}>
                <option value="">— בחר אחמ״ש —</option>
                {shiftManagers.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        {/* כספים / סגירת קופה */}
        <Section icon="payments" title="סגירת קופה">
          <div className="grid grid-cols-2 gap-3">
            <Field label='סה"כ מכירות (₪)'><Input type="number" inputMode="decimal" value={s.total_sales} onChange={(e) => set("total_sales", e.target.value)} /></Field>
            <Field label="משלוחים / וולט (₪)"><Input type="number" inputMode="decimal" value={s.delivery_sales} onChange={(e) => set("delivery_sales", e.target.value)} /></Field>
            <Field label="ממוצע לסועד (₪)"><Input type="number" inputMode="decimal" value={s.avg_per_diner} onChange={(e) => set("avg_per_diner", e.target.value)} /></Field>
          </div>
        </Section>

        {/* אחוזים מהקופה */}
        <Section icon="percent" title="אחוזים מהקופה">
          <div className="text-[12.5px] text-text-2">
            בחרו עובדים שמקבלים אחוז מסכום המכירות — הסכום יתווסף למשכורת שלהם לפי הדוח.
          </div>

          {s.bonus_participants.length > 0 && (
            <div className="overflow-hidden rounded-[11px] border border-border">
              <div className="grid grid-cols-[1fr_90px_100px_auto] items-center gap-2 border-b border-border bg-surface-2 px-3 py-2 text-[11.5px] font-bold text-text-3">
                <span>עובד</span>
                <span>אחוז (%)</span>
                <span>סכום</span>
                <span />
              </div>
              <div className="flex flex-col divide-y divide-border-2">
                {s.bonus_participants.map((row, idx) => {
                  const payout = bonusPayouts.find((p) => p.employee_id === row.employee_id);
                  return (
                    <div key={row.employee_id || `bonus-${idx}`} className="grid grid-cols-[1fr_90px_100px_auto] items-center gap-2 px-3 py-2.5">
                      {row.employee_id ? (
                        <span className="truncate text-[14px] font-semibold">{userName(row.employee_id)}</span>
                      ) : (
                        <Select
                          value={row.employee_id}
                          onChange={(e) => updateBonusRow(idx, { employee_id: e.target.value })}
                        >
                          <option value="">— בחר עובד —</option>
                          {availableBonusUsers.map((u) => (
                            <option key={u.id} value={u.id}>{u.full_name}</option>
                          ))}
                        </Select>
                      )}
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.1}
                        placeholder="%"
                        value={row.bonus_pct}
                        onChange={(e) => updateBonusRow(idx, { bonus_pct: e.target.value })}
                      />
                      <span className="text-[12.5px] font-bold tabular-nums text-accent">
                        {payout && payout.amount > 0 ? formatCurrency(payout.amount) : "—"}
                      </span>
                      <button
                        onClick={() => set("bonus_participants", s.bonus_participants.filter((_, i) => i !== idx))}
                        className="grid h-9 w-9 place-items-center rounded-lg text-text-3 hover:[background:var(--danger-bg)] hover:text-danger"
                        title="הסרה"
                      >
                        <Icon name="close" size={18} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {availableBonusUsers.length > 0 && (
            <Button
              variant="secondary"
              icon="person_add"
              onClick={() => set("bonus_participants", [...s.bonus_participants, { employee_id: "", bonus_pct: "" }])}
              className="self-start"
            >
              הוספת עובד לאחוזים
            </Button>
          )}
        </Section>

        {/* הצוות */}
        <Section icon="groups" title="הצוות">
          <div className="text-[12.5px] text-text-2">
            העובדים נטענים אוטומטית מנוכחות היום. ניתן לערוך שעות עבודה (מ-עד) או להוסיף עובדים ידנית.
          </div>

          {participantsLoading ? (
            <div className="rounded-[11px] border border-border bg-surface-2 px-3.5 py-4 text-center text-[13px] text-text-2">
              טוען עובדים מהיום...
            </div>
          ) : s.team_members.length === 0 ? (
            <div className="rounded-[11px] border border-dashed border-border px-3.5 py-4 text-center text-[13px] text-text-2">
              לא נמצאה נוכחות לתאריך זה — ניתן להוסיף עובדים ידנית.
            </div>
          ) : null}

          {s.team_members.length > 0 && (
            <div className="report-team-list">
              {s.team_members.map((p, idx) => {
                const edited =
                  p.attendance_hours != null &&
                  Math.abs((Number(p.hours) || 0) - p.attendance_hours) > 0.01;
                return (
                  <div key={p.employee_id || `team-${idx}`} className="report-team-row">
                    <div className="report-team-row-top">
                      <div className="report-team-identity">
                        <span className="report-team-avatar" aria-hidden="true">
                          <Icon name="schedule" size={17} />
                        </span>
                        <div className="report-team-name-wrap">
                          {p.employee_id ? (
                            <span className="report-team-name">{userName(p.employee_id)}</span>
                          ) : (
                            <Select
                              value={p.employee_id}
                              onChange={(e) => updateTeamMember(idx, { employee_id: e.target.value })}
                            >
                              <option value="">— בחר עובד —</option>
                              {availableTeamUsers.map((u) => (
                                <option key={u.id} value={u.id}>{u.full_name}</option>
                              ))}
                            </Select>
                          )}
                          {edited && <span className="report-team-edited">שונה מנוכחות</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeTeamMember(idx)}
                        className="report-team-remove"
                        title="הסרה מהרשימה"
                        aria-label="הסרה מהרשימה"
                      >
                        <Icon name="close" size={18} />
                      </button>
                    </div>

                    <div className="report-team-controls">
                      <div className="report-team-field-block">
                        <span className="report-team-field-label">שעות עבודה</span>
                        <div className="report-team-times">
                          <input
                            type="time"
                            value={p.work_start ?? ""}
                            onChange={(e) => updateTeamMember(idx, { work_start: e.target.value })}
                            className="field report-team-time-field"
                          />
                          <span className="report-team-dash" aria-hidden="true">–</span>
                          <input
                            type="time"
                            value={p.work_end ?? ""}
                            onChange={(e) => updateTeamMember(idx, { work_end: e.target.value })}
                            className="field report-team-time-field"
                          />
                        </div>
                      </div>

                      <div className="report-team-field-block">
                        <span className="report-team-field-label">סה״כ שעות</span>
                        <div className="report-team-hours-wrap">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step={0.25}
                            min={0}
                            placeholder="0"
                            value={p.hours || ""}
                            onChange={(e) => updateTeamMember(idx, { hours: Number(e.target.value) || 0 })}
                            className="report-team-hours-field"
                          />
                          <span className="report-team-hours-unit">שע׳</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {availableTeamUsers.length > 0 && (
            <Button
              variant="secondary"
              icon="person_add"
              onClick={() =>
                set("team_members", [
                  ...s.team_members,
                  { employee_id: "", hours: 0, work_start: "", work_end: "" },
                ])
              }
              className="self-start"
            >
              הוספת עובד
            </Button>
          )}

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

        {/* טיפים */}
        <Section icon="savings" title="טיפים">
          <div className="grid grid-cols-2 gap-3">
            <Field label='סה"כ טיפים (₪)'><Input type="number" inputMode="decimal" value={s.total_tips} onChange={(e) => set("total_tips", e.target.value)} /></Field>
            <Field label="שכר שעתי מטיפים">
              <div className="field flex items-center bg-surface-2 font-bold">{formatCurrency(tipsHourly)}</div>
            </Field>
          </div>

          <div className="mt-1 text-[12.5px] text-text-2">
            עובדי טיפים נמשכים מרשימת הצוות — ניתן לתקן שעות לחלוקה (למשל אם עובד שכח לדווח כניסה).
          </div>

          {participantsLoading ? (
            <div className="rounded-[11px] border border-border bg-surface-2 px-3.5 py-4 text-center text-[13px] text-text-2">
              טוען עובדי טיפים...
            </div>
          ) : s.participants.length === 0 ? (
            <div className="rounded-[11px] border border-dashed border-border px-3.5 py-4 text-center text-[13px] text-text-2">
              לא נמצאו עובדי טיפים ברשימת הצוות.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[11px] border border-border">
              <div className="grid grid-cols-[1fr_100px_72px_90px_auto] items-center gap-2 border-b border-border bg-surface-2 px-3 py-2 text-[11.5px] font-bold text-text-3">
                <span>עובד</span>
                <span>שעות עבודה</span>
                <span>נוכחות</span>
                <span>שעות לחלוקה</span>
                <span>חלק בטיפים</span>
              </div>
              <div className="flex flex-col divide-y divide-border-2">
                {s.participants.map((p, idx) => {
                  const attHrs = p.attendance_hours ?? null;
                  const edited = attHrs != null && Math.abs((Number(p.hours) || 0) - attHrs) > 0.01;
                  const teamRow = s.team_members.find((m) => m.employee_id === p.employee_id);
                  return (
                    <div key={p.employee_id || `tip-${idx}`} className="grid grid-cols-[1fr_100px_72px_90px_auto] items-center gap-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <span className="block truncate text-[14px] font-semibold">{userName(p.employee_id)}</span>
                        {edited && (
                          <span className="text-[11px] font-semibold text-amber-600">שונה מנוכחות</span>
                        )}
                      </div>
                      <span className="text-[12.5px] tabular-nums text-text-2">
                        {formatWorkTimeRange(teamRow?.work_start ?? p.work_start, teamRow?.work_end ?? p.work_end)}
                      </span>
                      <span className={`text-[13px] tabular-nums ${attHrs != null ? "text-text-2" : "text-text-3"}`}>
                        {formatShiftHours(attHrs)}
                      </span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step={0.25}
                        min={0}
                        placeholder="שעות"
                        value={p.hours || ""}
                        onChange={(e) => updateParticipant(idx, { hours: Number(e.target.value) || 0 })}
                      />
                      <span className="whitespace-nowrap text-[12.5px] font-bold text-accent-2">
                        {formatCurrency(tipsHourly * (Number(p.hours) || 0))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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

          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center justify-between rounded-[11px] border border-border px-3.5 py-3">
              <span className="text-[14px] font-semibold">מלאי שנגמר וחייב הזמנה דחופה</span>
              <Switch
                checked={s.urgent_inventory_enabled}
                onChange={(v) => {
                  set("urgent_inventory_enabled", v);
                  if (!v) set("out_of_stock_items", []);
                }}
              />
            </label>
            {s.urgent_inventory_enabled && (
              inventoryItems.length === 0 ? (
                <div className="rounded-[11px] border border-dashed border-border px-3.5 py-4 text-center text-[13px] text-text-2">
                  אין מוצרים במלאי. הוסיפו מוצרים במודול המלאי.
                </div>
              ) : (
                <div className="flex max-h-52 flex-col gap-1.5 overflow-y-auto rounded-[11px] border border-border p-2">
                  {inventoryItems.map((item) => {
                    const checked = selectedOutOfStockIds.has(item.id);
                    return (
                      <label
                        key={item.id}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 transition-colors ${
                          checked ? "bg-accent/5" : "hover:bg-surface-2"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOutOfStockItem(item.id)}
                            className="h-4 w-4 flex-none accent-[var(--accent)]"
                          />
                          <span className="truncate text-[14px] font-semibold">{item.name}</span>
                        </span>
                        <span className="flex-none text-[11.5px] font-semibold text-text-3">
                          {item.current_qty} {item.unit}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center justify-between rounded-[11px] border border-border px-3.5 py-3">
              <span className="text-[14px] font-semibold">תקלות ותחזוקה</span>
              <Switch
                checked={s.faults_enabled}
                onChange={(v) => {
                  set("faults_enabled", v);
                  if (!v) set("faults_maintenance", "");
                }}
              />
            </label>
            {s.faults_enabled && (
              <Field label="פרטי תקלה / תחזוקה (משהו נשבר / צריך תיקון?)">
                <Textarea rows={2} value={s.faults_maintenance} onChange={(e) => set("faults_maintenance", e.target.value)} />
              </Field>
            )}
          </div>
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

function formatShiftHours(h: number | null | undefined): string {
  if (h == null || h <= 0) return "—";
  const rounded = Math.round(h * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
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

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>;
}

function DetailCell({ label, value, span }: { label: string; value: React.ReactNode; span?: boolean }) {
  return (
    <div className={`rounded-[10px] bg-surface-2 px-3 py-2.5 ${span ? "col-span-2" : ""}`}>
      <div className="text-[11px] text-text-3">{label}</div>
      <div className="mt-0.5 text-[14px] font-semibold text-text">{value || "—"}</div>
    </div>
  );
}

function DetailText({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <div className="rounded-[10px] border border-border bg-surface-2 px-3.5 py-3">
      <div className="text-[11px] font-bold text-text-3">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-text">{value}</div>
    </div>
  );
}

function ReportViewer({
  report,
  userName,
  canManage,
  onClose,
  onEdit,
}: {
  report: ShiftReport;
  userName: (id: string) => string;
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const participants = report.extra?.tip_participants ?? [];
  const teamMembers = report.extra?.team_members ?? [];
  const outOfStockItems = report.extra?.out_of_stock_items ?? [];
  const bonusParticipants = report.extra?.bonus_participants ?? [];
  const salesItems = report.extra?.sales_items ?? [];
  const totalTips = Number(report.total_tips) || 0;
  const totalHours = participants.reduce((sum, p) => sum + (Number(p.hours) || 0), 0);
  const tipsHourly = totalHours > 0 ? totalTips / totalHours : Number(report.tips_hourly) || 0;
  const bonusPayouts = computeBonusPayouts(Number(report.total_sales) || 0, bonusParticipants);

  return (
    <Modal
      open
      onClose={onClose}
      title="צפייה בדוח משמרת"
      subtitle={formatDateShort(report.report_date)}
      icon="visibility"
      maxWidth={720}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>סגירה</Button>
          {canManage && <Button icon="edit" onClick={onEdit}>עריכה</Button>}
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <Section icon="event" title="פרטי היום">
          <DetailGrid>
            <DetailCell label="תאריך" value={formatDateShort(report.report_date)} />
            <DetailCell label='אחמ"ש' value={report.manager_names} />
          </DetailGrid>
        </Section>

        <Section icon="payments" title="סגירת קופה">
          <DetailGrid>
            <DetailCell label='סה"כ מכירות' value={formatCurrency(Number(report.total_sales))} />
            <DetailCell label="משלוחים / וולט" value={formatCurrency(Number(report.delivery_sales))} />
            <DetailCell label="ממוצע לסועד" value={formatCurrency(Number(report.avg_per_diner))} />
          </DetailGrid>
        </Section>

        {bonusParticipants.length > 0 && (
          <Section icon="percent" title="אחוזים מהקופה">
            <div className="flex flex-col gap-1.5">
              {bonusParticipants.map((p) => {
                const payout = bonusPayouts.find((b) => b.employee_id === p.employee_id);
                return (
                  <div key={p.employee_id} className="flex items-center justify-between rounded-[11px] border border-border px-3.5 py-2.5">
                    <span className="text-[14px] font-semibold">
                      {userName(p.employee_id)}
                      {p.bonus_pct != null && (
                        <span className="mr-2 text-[12px] font-semibold text-text-3">{p.bonus_pct}%</span>
                      )}
                    </span>
                    {payout && payout.amount > 0 && (
                      <span className="text-[12.5px] font-bold text-accent">{formatCurrency(payout.amount)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        <Section icon="savings" title="טיפים">
          <DetailGrid>
            <DetailCell label='סה"כ טיפים' value={formatCurrency(totalTips)} />
            <DetailCell label="שכר שעתי מטיפים" value={formatCurrency(tipsHourly)} />
          </DetailGrid>
          {participants.length > 0 && (
            <div className="overflow-hidden rounded-[11px] border border-border">
              <div className="grid grid-cols-[1fr_72px_auto] items-center gap-2 border-b border-border bg-surface-2 px-3 py-2 text-[11.5px] font-bold text-text-3">
                <span>עובד</span>
                <span>שעות</span>
                <span>חלק בטיפים</span>
              </div>
              <div className="flex flex-col divide-y divide-border-2">
                {participants.map((p) => (
                  <div key={p.employee_id} className="grid grid-cols-[1fr_72px_auto] items-center gap-2 px-3 py-2.5">
                    <span className="truncate text-[14px] font-semibold">{userName(p.employee_id)}</span>
                    <span className="text-[13px] tabular-nums text-text-2">{Number(p.hours) || 0}</span>
                    <span className="text-[12.5px] font-bold text-accent-2">
                      {formatCurrency(tipsHourly * (Number(p.hours) || 0))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section icon="groups" title="הצוות">
          {teamMembers.length > 0 && (
            <div className="overflow-hidden rounded-[11px] border border-border">
              <div className="grid grid-cols-[1fr_110px_72px] items-center gap-2 border-b border-border bg-surface-2 px-3 py-2 text-[11.5px] font-bold text-text-3">
                <span>עובד</span>
                <span>שעות עבודה</span>
                <span>סה״כ שעות</span>
              </div>
              <div className="flex flex-col divide-y divide-border-2">
                {teamMembers.map((p) => (
                  <div key={p.employee_id} className="grid grid-cols-[1fr_110px_72px] items-center gap-2 px-3 py-2.5">
                    <span className="truncate text-[14px] font-semibold">{userName(p.employee_id)}</span>
                    <span className="text-[13px] tabular-nums text-text-2">
                      {formatWorkTimeRange(p.work_start, p.work_end)}
                    </span>
                    <span className="text-[13px] tabular-nums text-text-2">
                      {(Number(p.hours) || 0) > 0 ? formatShiftHours(Number(p.hours)) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DetailGrid>
            <DetailCell label="שחרור ראשון" value={report.first_release} />
            <DetailCell label="אנרגיות בצוות" value={report.energy_level != null ? `${report.energy_level}/10` : null} />
          </DetailGrid>
          <DetailText label="אירועים חריגים" value={report.unusual_events} />
          <DetailText label="שיחות במשמרת" value={report.team_talks} />
          <DetailText label="הקול של הצוות" value={report.team_voice} />
        </Section>

        {(salesItems.length > 0 || report.extra?.top_seller) && (
          <Section icon="local_bar" title="מכירות">
            {salesItems.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {salesItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-[10px] bg-surface-2 px-3 py-2">
                    <span className="text-[14px] font-semibold">{item.label}</span>
                    <span className="text-[13px] font-bold tabular-nums text-text-2">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
            {report.extra?.top_seller && (
              <DetailCell label="מי מכר הכי הרבה" value={report.extra.top_seller} span />
            )}
          </Section>
        )}

        <Section icon="inventory_2" title="לוגיסטיקה ותחזוקה">
          <DetailCell
            label="משימות יומיות"
            value={report.daily_tasks_done ? "בוצעו" : "לא בוצעו"}
            span
          />
          {(outOfStockItems.length > 0 || report.urgent_inventory) && (
            <div className="rounded-[10px] border border-border bg-surface-2 px-3.5 py-3">
              <div className="text-[11px] font-bold text-text-3">מלאי שנגמר</div>
              {outOfStockItems.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {outOfStockItems.map((item) => (
                    <span key={item.item_id} className="rounded-full border border-border bg-surface px-2.5 py-1 text-[12.5px] font-semibold">
                      {item.name}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-1 text-[13.5px] leading-relaxed text-text">{report.urgent_inventory}</div>
              )}
            </div>
          )}
          <DetailText label="תקלות ותחזוקה" value={report.faults_maintenance} />
        </Section>

        {(report.invoice_urls ?? []).length > 0 && (
          <Section icon="receipt" title="חשבוניות">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {(report.invoice_urls ?? []).map((url, idx) => (
                <a
                  key={idx}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-[11px] border border-border hover:opacity-90"
                >
                  {/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) ? (
                    <img src={url} alt="חשבונית" className="h-28 w-full object-cover" />
                  ) : (
                    <div className="flex h-28 w-full flex-col items-center justify-center gap-1 bg-surface-2 text-text-2">
                      <Icon name="description" size={26} />
                      <span className="text-[11px]">קובץ</span>
                    </div>
                  )}
                </a>
              ))}
            </div>
          </Section>
        )}
      </div>
    </Modal>
  );
}
