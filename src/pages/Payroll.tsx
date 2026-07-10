import { useMemo, useState } from "react";
import { Badge, Button, Card, Field, Icon, Input, PageHeader, PageLoader, ErrorState, Select } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { WAGE_TYPE_LABELS } from "@/lib/constants";
import { useBusinessId, formatCurrency, initialsOf, colorFor, todayISO } from "@/lib/db";
import { useProfiles } from "@/api/users";
import { useAttendanceMonth } from "@/api/attendance";
import { useTips, useAddTip, useShiftBonuses } from "@/api/payroll";
import { useActiveShiftTemplates } from "@/api/shifts";
import { computeEmployeePayroll, sumAttendanceHours } from "@/lib/payrollCompute";

function monthNow() {
  return new Date().toISOString().slice(0, 7);
}

export function Payroll() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const [month, setMonth] = useState(monthNow());
  const { data: users, isLoading, isError, refetch } = useProfiles(businessId);
  const { data: attendance } = useAttendanceMonth(businessId, month);
  const { data: tips } = useTips(businessId, month);
  const { data: bonuses } = useShiftBonuses(businessId, month);
  const { data: templates } = useActiveShiftTemplates(businessId);
  const addTip = useAddTip(businessId);
  const [tipOpen, setTipOpen] = useState(false);

  const isPayrollManager = profile && ["manager", "office_manager"].includes(profile.role);

  const rows = useMemo(() => {
    const employees = (users ?? []).filter((u) => isPayrollManager || u.id === profile?.id);
    return employees.map((u) => {
      const rate = Number(u.hourly_rate ?? 0);
      const wageType = u.wage_type ?? "hourly";
      const myTips = (tips ?? []).filter((t) => t.employee_id === u.id);
      const myBonuses = (bonuses ?? []).filter((b) => b.employee_id === u.id);
      const bonusSum = myBonuses.reduce((s, b) => s + Number(b.amount), 0);

      // עובד טיפים: השכר מקופת הטיפים עם רצפת מינימום לכל משמרת בנפרד.
      // עובד שעתי: שעות נוכחות × תעריף, ללא טיפים.
      const pay = computeEmployeePayroll({
        wageType,
        rate,
        tips: myTips,
        bonusSum,
        attendanceHours: sumAttendanceHours(attendance ?? [], u.id),
      });
      return { id: u.id, name: u.full_name, ...pay };
    });
  }, [users, attendance, tips, bonuses, isPayrollManager, profile?.id]);

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const totals = rows.reduce(
    (acc, r) => ({
      hours: acc.hours + r.hours,
      base: acc.base + (r.wageType === "hourly" ? r.base : 0),
      tips: acc.tips + r.tips,
      topup: acc.topup + r.topup,
      bonus: acc.bonus + r.bonus,
      total: acc.total + r.total,
    }),
    { hours: 0, base: 0, tips: 0, topup: 0, bonus: 0, total: 0 },
  );

  return (
    <div className="w-full animate-fadeUp">
      <PageHeader
        title="שכר וטיפים"
        subtitle="חישוב לפי שעות נוכחות + טיפים + תוספת מאחוז קופה"
        actions={
          <div className="flex items-center gap-2.5">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="!w-[150px]" />
            {isPayrollManager && <Button icon="add" onClick={() => setTipOpen(true)}>הזנת טיפ</Button>}
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-6">
        {[
<<<<<<< HEAD
          { label: "סה״כ שעות", value: Math.round(totals.hours).toLocaleString("he-IL"), icon: "schedule", color: "var(--info)", tint: "var(--info-bg)" },
          { label: "שכר שעתי", value: formatCurrency(totals.base), icon: "payments", color: "var(--text)", tint: "var(--surface-2)" },
          { label: "טיפים", value: formatCurrency(totals.tips), icon: "savings", color: "var(--accent-2)", tint: "var(--accent-tint)" },
          { label: "השלמות למינימום", value: formatCurrency(totals.topup), icon: "add_card", color: "var(--warning)", tint: "var(--warning-bg)" },
          { label: "סה״כ לתשלום", value: formatCurrency(totals.total), icon: "account_balance_wallet", color: "var(--success)", tint: "var(--success-bg)" },
        ].map((k, i) => (
          <div
            key={k.label}
            className="stat-tile dash-rise"
            style={{ "--tile-color": k.color, "--tile-tint": k.tint, "--rise-delay": `${i * 45}ms` } as React.CSSProperties}
          >
            <span className="stat-tile-icon"><Icon name={k.icon} size={21} /></span>
            <div className="stat-tile-value">{k.value}</div>
            <div className="stat-tile-label">{k.label}</div>
          </div>
=======
          { label: "סה״כ שעות", value: Math.round(totals.hours).toLocaleString("he-IL"), icon: "schedule" },
          { label: "שכר שעתי", value: formatCurrency(totals.base), icon: "payments" },
          { label: "טיפים", value: formatCurrency(totals.tips), icon: "savings" },
          { label: "השלמות למינימום", value: formatCurrency(totals.topup), icon: "add_card" },
          { label: "תוספת מאחוז קופה", value: formatCurrency(totals.bonus), icon: "percent" },
          { label: "סה״כ לתשלום", value: formatCurrency(totals.total), icon: "account_balance_wallet" },
        ].map((k) => (
          <Card key={k.label} className="p-[18px]">
            <span className="grid h-10 w-10 place-items-center rounded-[11px] [background:var(--surface-2)]"><Icon name={k.icon} size={21} className="text-ink" /></span>
            <div className="mt-3 text-[22px] font-extrabold tracking-tight">{k.value}</div>
            <div className="text-[12.5px] text-text-2">{k.label}</div>
          </Card>
>>>>>>> 6df25a794822348c0586c09d1d825cf46f6db1de
        ))}
      </div>

      <Card className="overflow-hidden !p-0 shadow-card">
        <div className="overflow-auto">
          <div className="min-w-[720px]">
<<<<<<< HEAD
            <div className="grid grid-cols-[1.7fr_0.8fr_0.7fr_0.8fr_1fr_0.9fr_1fr] gap-2 border-b border-border bg-surface-2 px-5 py-3 text-[11.5px] font-bold uppercase tracking-wide text-text-3">
              <span>עובד</span><span>סוג</span><span>שעות</span><span>תעריף</span><span>בסיס / טיפים</span><span>השלמה</span><span>סה״כ</span>
            </div>
            {rows.map((r) => (
              <div key={r.id} className="data-row grid grid-cols-[1.7fr_0.8fr_0.7fr_0.8fr_1fr_0.9fr_1fr] items-center gap-2 border-b border-border-2 px-5 py-3 text-[13.5px]">
=======
            <div className="grid grid-cols-[1.7fr_0.8fr_0.7fr_0.8fr_1fr_0.9fr_0.9fr_1fr] gap-2 border-b border-border bg-surface-2 px-5 py-3 text-[12px] font-bold text-text-3">
              <span>עובד</span><span>סוג</span><span>שעות</span><span>תעריף</span><span>בסיס / טיפים</span><span>השלמה</span><span>תוספת קופה</span><span>סה״כ</span>
            </div>
            {rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[1.7fr_0.8fr_0.7fr_0.8fr_1fr_0.9fr_0.9fr_1fr] items-center gap-2 border-b border-border-2 px-5 py-3 text-[13.5px]">
>>>>>>> 6df25a794822348c0586c09d1d825cf46f6db1de
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="person-chip h-8 w-8 rounded-[9px] text-[12px]" style={{ background: colorFor(r.id) }}>{initialsOf(r.name)}</span>
                  <span className="truncate font-bold">{r.name}</span>
                </span>
                <span><Badge tone={r.wageType === "tips" ? "violet" : "neutral"}>{WAGE_TYPE_LABELS[r.wageType]}</Badge></span>
<<<<<<< HEAD
                <span className="tabular-nums">{r.hours.toFixed(1)}</span>
                <span className="tabular-nums">{r.rate ? formatCurrency(r.rate) : "—"}</span>
                <span className={`tabular-nums ${r.wageType === "tips" ? "font-bold text-accent-2" : ""}`}>{formatCurrency(r.wageType === "tips" ? r.tips : r.base)}</span>
                <span className="tabular-nums text-text-2">{r.topup > 0 ? formatCurrency(r.topup) : "—"}</span>
                <span className="font-extrabold tabular-nums">{formatCurrency(r.total)}</span>
=======
                <span>{r.hours.toFixed(1)}</span>
                <span>{r.rate ? formatCurrency(r.rate) : "—"}</span>
                <span className={r.wageType === "tips" ? "text-accent-2" : undefined}>{formatCurrency(r.wageType === "tips" ? r.tips : r.base)}</span>
                <span className="text-text-2">{r.topup > 0 ? formatCurrency(r.topup) : "—"}</span>
                <span className={r.bonus > 0 ? "text-accent" : "text-text-2"}>{r.bonus > 0 ? formatCurrency(r.bonus) : "—"}</span>
                <span className="font-extrabold">{formatCurrency(r.total)}</span>
>>>>>>> 6df25a794822348c0586c09d1d825cf46f6db1de
              </div>
            ))}
            {rows.length === 0 && <div className="px-5 py-10 text-center text-text-2">אין נתונים לחודש זה.</div>}
          </div>
        </div>
      </Card>

      {tipOpen && (
        <TipModal
          users={(users ?? []).filter((u) => (u.wage_type ?? "hourly") === "tips")}
          templates={(templates ?? []).map((t) => ({ id: t.id, name: t.name }))}
          saving={addTip.isPending}
          onClose={() => setTipOpen(false)}
          onSave={async (input) => { await addTip.mutateAsync({ business_id: businessId!, ...input }); setTipOpen(false); }}
        />
      )}
    </div>
  );
}

function TipModal({
  users,
  templates,
  onClose,
  onSave,
  saving,
}: {
  users: { id: string; full_name: string | null }[];
  templates: { id: string; name: string }[];
  onClose: () => void;
  onSave: (input: { employee_id: string; shift_date: string; shift_template_id: string | null; amount: number; hours: number }) => Promise<void>;
  saving: boolean;
}) {
  const [employeeId, setEmployeeId] = useState(users[0]?.id ?? "");
  const [date, setDate] = useState(todayISO());
  const [templateId, setTemplateId] = useState("");
  const [amount, setAmount] = useState("");
  const [hours, setHours] = useState("");

  return (
    <Modal
      open
      onClose={onClose}
      title="הזנת טיפ"
      icon="savings"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
          <Button className="flex-1" loading={saving} onClick={() => employeeId && onSave({ employee_id: employeeId, shift_date: date, shift_template_id: templateId || null, amount: Number(amount) || 0, hours: Number(hours) || 0 })}>שמירה</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label="עובד"><Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>{users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="תאריך"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="משמרת"><Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}><option value="">— כללי —</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="סכום טיפ (₪)"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="שעות במשמרת"><Input type="number" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}
