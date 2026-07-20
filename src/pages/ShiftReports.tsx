import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  PageLoader,
  Select,
  Switch,
  Textarea,
  TimePicker,
} from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useIsMdUp } from "@/hooks/useMediaQuery";
import { useBusinessId, formatCurrency, formatDateShort, todayISO } from "@/lib/db";
import {
  buildTeamMembersFromShift,
  distributeTips,
  formatTimeLabel,
  formatWorkTimeRange,
  getAttendanceHoursForShiftReport,
  normalizeTimeInputValue,
  getAttendanceTimeRangeForShiftReport,
  hoursBetweenTimes,
} from "@/lib/shiftReportTips";
import { useInventory } from "@/api/inventory";
import { buildBonusParticipantsFromTeam } from "@/lib/shiftReportBonuses";
import { buildShiftPayRows, type ShiftPayRow } from "@/lib/shiftReportPay";
import { useProfiles } from "@/api/users";
import { useAttendanceAroundDate } from "@/api/attendance";
import {
  useShiftReports,
  useShiftReport,
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

const MONTH_NAMES = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];
const WEEKDAY_LETTERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const WEEKDAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1] ?? ""} ${y}`;
}

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function ShiftReports() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [month, setMonth] = useState(monthNow());
  const { data: reports, isLoading, isError, refetch } = useShiftReports(businessId, month);
  const { data: users } = useProfiles(businessId);
  const del = useDeleteShiftReport(businessId);

  const [viewing, setViewing] = useState<ShiftReport | null>(null);

  const canManage = !!profile && ["manager", "shift_manager"].includes(profile.role);

  const userName = useMemo(
    () => (id: string) => users?.find((u) => u.id === id)?.full_name ?? "—",
    [users],
  );
  const profileById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);

  const list = reports ?? [];
  const stats = useMemo(() => {
    const totalSales = list.reduce((sum, r) => sum + (Number(r.total_sales) || 0), 0);
    const totalTips = list.reduce((sum, r) => sum + (Number(r.total_tips) || 0), 0);
    const hourlyVals = list.map((r) => Number(r.tips_hourly) || 0).filter((v) => v > 0);
    const avgHourly = hourlyVals.length > 0 ? hourlyVals.reduce((a, b) => a + b, 0) / hourlyVals.length : 0;
    const maxSales = list.reduce((max, r) => Math.max(max, Number(r.total_sales) || 0), 0);
    const best = maxSales > 0 ? list.find((r) => (Number(r.total_sales) || 0) === maxSales) : undefined;
    const byDay = new Map<number, ShiftReport>();
    for (const r of list) {
      const day = new Date(r.report_date + "T00:00:00").getDate();
      if (!byDay.has(day)) byDay.set(day, r);
    }
    return { totalSales, totalTips, avgHourly, maxSales, bestId: best?.id, byDay };
  }, [list]);

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const isCurrentMonth = month === monthNow();
  const todayDay = new Date().getDate();
  const monthDays = daysInMonth(month);

  return (
    <div className="w-full animate-fadeUp">
      <section className="sr-hero">
        <div className="sr-hero-top">
          <div className="sr-month-nav">
            <button
              type="button"
              className="sr-month-btn"
              onClick={() => setMonth(shiftMonth(month, -1))}
              aria-label="חודש קודם"
            >
              <Icon name="chevron_right" size={20} />
            </button>
            <label className="sr-month-label">
              <Icon name="calendar_month" size={16} />
              <span>{monthTitle(month)}</span>
              <input
                type="month"
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
                className="sr-month-input"
                aria-label="בחירת חודש"
              />
            </label>
            <button
              type="button"
              className="sr-month-btn"
              onClick={() => setMonth(shiftMonth(month, 1))}
              aria-label="חודש הבא"
            >
              <Icon name="chevron_left" size={20} />
            </button>
          </div>
          {canManage && (
            <Button icon="add" onClick={() => navigate("/shift-reports/new")}>
              דוח חדש
            </Button>
          )}
        </div>

        <div className="sr-kpis">
          <div className="sr-kpi sr-kpi--sales" style={{ "--i": 0 } as React.CSSProperties}>
            <span className="sr-kpi-icon"><Icon name="point_of_sale" size={19} /></span>
            <div className="sr-kpi-text">
              <span className="sr-kpi-label">מכירות החודש</span>
              <span className="sr-kpi-value">{formatCurrency(stats.totalSales)}</span>
            </div>
          </div>
          <div className="sr-kpi sr-kpi--tips" style={{ "--i": 1 } as React.CSSProperties}>
            <span className="sr-kpi-icon"><Icon name="savings" size={19} /></span>
            <div className="sr-kpi-text">
              <span className="sr-kpi-label">טיפים החודש</span>
              <span className="sr-kpi-value">{formatCurrency(stats.totalTips)}</span>
            </div>
          </div>
          <div className="sr-kpi sr-kpi--hourly" style={{ "--i": 2 } as React.CSSProperties}>
            <span className="sr-kpi-icon"><Icon name="timer" size={19} /></span>
            <div className="sr-kpi-text">
              <span className="sr-kpi-label">ממוצע שעתי מטיפים</span>
              <span className="sr-kpi-value">{formatCurrency(stats.avgHourly)}</span>
            </div>
          </div>
          <div className="sr-kpi sr-kpi--count" style={{ "--i": 3 } as React.CSSProperties}>
            <span className="sr-kpi-icon"><Icon name="receipt_long" size={19} /></span>
            <div className="sr-kpi-text">
              <span className="sr-kpi-label">דוחות שהוגשו</span>
              <span className="sr-kpi-value">{list.length}</span>
            </div>
          </div>
        </div>

        {list.length > 0 && (
          <div className="sr-chart" aria-label="מכירות לפי יום בחודש">
            {Array.from({ length: monthDays }, (_, i) => i + 1).map((day) => {
              const report = stats.byDay.get(day);
              const sales = report ? Number(report.total_sales) || 0 : 0;
              const pct = report && stats.maxSales > 0 ? Math.max(9, (sales / stats.maxSales) * 100) : 0;
              const isToday = isCurrentMonth && day === todayDay;
              const showLabel = day === 1 || day % 5 === 0;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={!report}
                  onClick={() => report && setViewing(report)}
                  className={`sr-bar${report ? " sr-bar--filled" : ""}${isToday ? " sr-bar--today" : ""}`}
                  title={report ? `${formatDateShort(report.report_date)} · ${formatCurrency(sales)}` : undefined}
                  aria-label={report ? `דוח ${formatDateShort(report.report_date)}, מכירות ${formatCurrency(sales)}` : undefined}
                >
                  <span className="sr-bar-track">
                    <i style={report ? { height: `${pct}%` } : undefined} />
                  </span>
                  <span className="sr-bar-day">{showLabel ? day : "\u00a0"}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {list.length === 0 ? (
        <EmptyState
          icon="receipt_long"
          title="אין דוחות לחודש זה"
          description="מלאו דוח סיכום משמרת בסוף המשמרת — כולל סגירת קופה, טיפים וחשבוניות."
          action={
            canManage ? (
              <Button icon="add" onClick={() => navigate("/shift-reports/new")}>
                דוח חדש
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="sr-grid">
          {list.map((r, idx) => {
            const d = new Date(r.report_date + "T00:00:00");
            const dow = d.getDay();
            const sales = Number(r.total_sales) || 0;
            const salesPct = stats.maxSales > 0 ? Math.round((sales / stats.maxSales) * 100) : 0;
            const isBest = stats.bestId === r.id && list.length > 1;
            const invoices = (r.invoice_urls ?? []).length;
            const teamCount = (r.extra?.team_members ?? []).length;
            return (
              <article
                key={r.id}
                className="sr-card"
                style={{ "--i": idx } as React.CSSProperties}
                role="button"
                tabIndex={0}
                onClick={() => setViewing(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setViewing(r);
                  }
                }}
              >
                <header className="sr-card-top">
                  <span className="sr-date-tile" aria-hidden="true">
                    <b>{d.getDate()}</b>
                    <i>{WEEKDAY_LETTERS[dow]}</i>
                  </span>
                  <div className="sr-card-heading">
                    <span className="sr-card-title">יום {WEEKDAY_NAMES[dow]} · {formatDateShort(r.report_date)}</span>
                    <span className="sr-card-sub">
                      {r.manager_names ? `אחמ״ש · ${r.manager_names}` : "דוח סגירת משמרת"}
                    </span>
                  </div>
                  {isBest && (
                    <span className="sr-best">
                      <Icon name="emoji_events" size={13} />
                      שיא החודש
                    </span>
                  )}
                </header>

                <div className="sr-card-stats">
                  <div className="sr-stat sr-stat--sales">
                    <span className="sr-stat-label">מכירות</span>
                    <span className="sr-stat-value">{formatCurrency(sales)}</span>
                    <span className="sr-stat-bar"><i style={{ width: `${salesPct}%` }} /></span>
                  </div>
                  <div className="sr-stat sr-stat--tips">
                    <span className="sr-stat-label">טיפים</span>
                    <span className="sr-stat-value">{formatCurrency(Number(r.total_tips))}</span>
                    <span className="sr-stat-hint">{formatCurrency(Number(r.tips_hourly))} לשעה</span>
                  </div>
                </div>

                <footer className="sr-card-foot">
                  <div className="sr-chips">
                    {teamCount > 0 && (
                      <span className="sr-chip sr-chip--team"><Icon name="groups" size={14} />{teamCount} בצוות</span>
                    )}
                    {invoices > 0 && (
                      <span className="sr-chip sr-chip--invoice"><Icon name="receipt" size={14} />{invoices} חשבוניות</span>
                    )}
                    {r.energy_level != null && (
                      <span className="sr-chip sr-chip--energy"><Icon name="bolt" size={14} />אנרגיה {r.energy_level}/10</span>
                    )}
                  </div>
                  <div className="sr-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setViewing(r)}
                      className="sr-icon-btn"
                      title="צפייה בדוח"
                      aria-label="צפייה בדוח"
                    >
                      <Icon name="visibility" size={18} />
                    </button>
                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/shift-reports/${r.id}/edit`, { state: { report: r } })
                          }
                          className="sr-icon-btn"
                          title="עריכה"
                          aria-label="עריכה"
                        >
                          <Icon name="edit" size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("למחוק את הדוח? הטיפים והתוספות שכר שנוצרו ממנו יימחקו גם הם.")) del.mutate(r.id);
                          }}
                          className="sr-icon-btn sr-icon-btn--danger"
                          title="מחיקה"
                          aria-label="מחיקה"
                        >
                          <Icon name="delete" size={18} />
                        </button>
                      </>
                    )}
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {viewing && (
        <ReportViewer
          report={viewing}
          userName={userName}
          profileById={profileById}
          canManage={canManage}
          onClose={() => setViewing(null)}
          onEdit={() => {
            const r = viewing;
            setViewing(null);
            if (r) navigate(`/shift-reports/${r.id}/edit`, { state: { report: r } });
          }}
        />
      )}
    </div>
  );
}

export function ShiftReportEditorPage() {
  const { reportId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const isNew = location.pathname.endsWith("/new");

  const stateReport = (location.state as { report?: ShiftReport } | null)?.report;
  const { data: fetchedReport, isLoading, isError, refetch } = useShiftReport(
    businessId,
    !isNew && !stateReport ? (reportId ?? null) : null,
  );
  const { data: users } = useProfiles(businessId);

  const canManage = !!profile && ["manager", "shift_manager"].includes(profile.role);
  const report = isNew ? null : (stateReport ?? fetchedReport ?? null);

  const userName = useMemo(
    () => (id: string) => users?.find((u) => u.id === id)?.full_name ?? "—",
    [users],
  );
  const shiftManagers = useMemo(
    () => (users ?? []).filter((u) => u.active && u.role === "shift_manager"),
    [users],
  );

  function goBack() {
    if (location.key !== "default") navigate(-1);
    else navigate("/shift-reports", { replace: true });
  }

  if (!canManage) return <Navigate to="/shift-reports" replace />;
  if (!businessId) return <PageLoader />;

  if (!isNew && !stateReport && isLoading) return <PageLoader />;
  if (!isNew && !report && !isLoading) {
    return (
      <ErrorState
        message={isError ? undefined : "הדוח לא נמצא."}
        onRetry={isError ? refetch : goBack}
      />
    );
  }

  return (
    <ReportEditor
      report={report}
      businessId={businessId}
      createdBy={profile?.id ?? null}
      users={(users ?? []).filter((u) => u.active && (u.wage_type ?? "hourly") === "tips")}
      allUsers={(users ?? []).filter((u) => u.active)}
      shiftManagers={shiftManagers}
      userName={userName}
      onClose={goBack}
    />
  );
}

/* ------------------------------- Editor ------------------------------- */

interface EditorState {
  report_date: string;
  manager_ids: string[];
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
  sales_items: ShiftReportSalesItem[];
  invoice_urls: string[];
}

function managerIdsFromReport(r: ShiftReport, allUsers: Profile[]): string[] {
  if (r.extra?.manager_ids?.length) return r.extra.manager_ids;
  if (r.extra?.manager_id) return [r.extra.manager_id];
  if (!r.manager_names?.trim()) return [];

  const names = r.manager_names
    .split(/,| ו(?=\S)/)
    .map((n) => n.trim())
    .filter(Boolean);
  const shiftManagers = allUsers.filter((u) => u.role === "shift_manager");
  return names
    .map((name) => shiftManagers.find((u) => u.full_name === name)?.id)
    .filter((id): id is string => !!id);
}

function formatManagerNames(ids: string[], shiftManagers: Profile[]): string | null {
  const names = ids
    .map((id) => shiftManagers.find((m) => m.id === id)?.full_name)
    .filter((name): name is string => !!name);
  return names.length > 0 ? names.join(", ") : null;
}

function blankState(): EditorState {
  return {
    report_date: todayISO(),
    manager_ids: [],
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
    sales_items: [],
    invoice_urls: [],
  };
}

function fromReport(r: ShiftReport, allUsers: Profile[]): EditorState {
  return {
    report_date: r.report_date,
    manager_ids: managerIdsFromReport(r, allUsers),
    total_sales: String(r.total_sales ?? ""),
    delivery_sales: String(r.delivery_sales ?? ""),
    avg_per_diner: String(r.avg_per_diner ?? ""),
    total_tips: String(r.total_tips ?? ""),
    first_release: normalizeTimeInputValue(r.first_release),
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
    sales_items: r.extra?.sales_items ?? [],
    invoice_urls: r.invoice_urls ?? [],
  };
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date((iso || todayISO()) + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Big tappable money input — ₪ sign + oversized tabular figure. */
function MoneyField({
  label,
  value,
  onChange,
  hero,
  tone,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hero?: boolean;
  tone?: "accent";
  hint?: string;
}) {
  return (
    <label className="srw-money" data-hero={hero ? "true" : undefined} data-tone={tone}>
      <span className="srw-money-label">{label}</span>
      <span className="srw-money-row">
        <span className="srw-money-sign" aria-hidden="true">₪</span>
        <input
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="srw-money-input"
        />
      </span>
      {hint && <span className="srw-money-hint">{hint}</span>}
    </label>
  );
}

/** 1–10 segmented energy rating — tap the same value again to clear it. */
function EnergyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const current = Number(value) || 0;
  return (
    <div className="srw-energy">
      <div className="srw-energy-bar" role="group" aria-label="אנרגיות בצוות">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            data-on={n <= current}
            onClick={() => onChange(current === n ? "" : String(n))}
            aria-label={`${n} מתוך 10`}
            aria-pressed={n === current}
            style={{ "--i": n } as React.CSSProperties}
          >
            <i />
          </button>
        ))}
      </div>
      <span className="srw-energy-read">{current > 0 ? `${current}/10` : "לא דורג"}</span>
    </div>
  );
}

/** Tappable people chips — replaces a dropdown for short rosters. */
function PeoplePicker({
  people,
  selected,
  onToggle,
  empty,
}: {
  people: Profile[];
  selected: string[];
  onToggle: (id: string) => void;
  empty: string;
}) {
  if (people.length === 0) return <div className="srw-empty">{empty}</div>;
  return (
    <div className="srw-people">
      {people.map((p) => {
        const on = selected.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            className="srw-person"
            data-on={on}
            aria-pressed={on}
            onClick={() => onToggle(p.id)}
          >
            <span className="srw-person-av" aria-hidden="true">{initialsOf(p.full_name ?? "")}</span>
            <span className="srw-person-name">{p.full_name}</span>
            <Icon name={on ? "check_circle" : "radio_button_unchecked"} size={17} />
          </button>
        );
      })}
    </div>
  );
}

interface WizardStep {
  key: string;
  icon: string;
  title: string;
  hint: string;
  body: ReactNode;
}

/** Mobile-only step flow: glass header + segment track, animated stage, sticky actions. */
function ReportWizardShell({
  kicker,
  steps,
  step,
  dir,
  onStep,
  onClose,
  onFinish,
  error,
}: {
  kicker: string;
  steps: WizardStep[];
  step: number;
  dir: 1 | -1;
  onStep: (next: number) => void;
  onClose: () => void;
  onFinish: () => void;
  error: string | null;
}) {
  const active = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="srw-page">
      {/* Compact utility bar — back + progress only. The step title lives in the
          hero below, so nothing is printed twice. */}
      <header className="srw-head">
        <button type="button" className="srw-head-back" onClick={onClose} aria-label="יציאה">
          <Icon name="arrow_forward" size={20} />
        </button>
        <div className="srw-track" role="tablist" aria-label="שלבי הדוח">
          {steps.map((d, i) => (
            <button
              key={d.key}
              type="button"
              role="tab"
              className="srw-track-seg"
              data-state={i < step ? "done" : i === step ? "active" : "todo"}
              onClick={() => onStep(i)}
              aria-label={d.title}
              aria-selected={i === step}
            >
              <i />
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="srw-error">
          <Icon name="error" size={18} />
          {error}
        </div>
      )}

      <div className="srw-stage" key={active.key} data-dir={dir}>
        <div className="srw-hero">
          <span className="srw-hero-icon" aria-hidden="true">
            <Icon name={active.icon} size={24} />
          </span>
          <div className="srw-hero-text">
            <span className="srw-hero-kicker">
              {kicker} · שלב {step + 1} מתוך {steps.length}
            </span>
            <h1 className="srw-hero-title">{active.title}</h1>
            <p className="srw-hero-hint">{active.hint}</p>
          </div>
        </div>
        {active.body}
      </div>

      <footer className="srw-foot">
        <button
          type="button"
          className="srw-back"
          onClick={() => (step === 0 ? onClose() : onStep(step - 1))}
        >
          {step === 0 ? (
            "ביטול"
          ) : (
            <>
              <Icon name="chevron_right" size={19} />
              חזור
            </>
          )}
        </button>
        <button
          type="button"
          className="srw-next"
          data-final={isLast ? "true" : undefined}
          onClick={() => (isLast ? onFinish() : onStep(step + 1))}
        >
          {isLast ? (
            <>
              <Icon name="preview" size={19} />
              תצוגה מקדימה
            </>
          ) : (
            <>
              {steps[step + 1].title}
              <Icon name="chevron_left" size={19} />
            </>
          )}
        </button>
      </footer>
    </div>
  );
}

function ReportEditorShell({
  title,
  subtitle,
  icon,
  onBack,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  onBack: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="sr-editor-page page-enter w-full">
      <header className="sr-editor-head">
        <button type="button" className="icon-btn shrink-0" onClick={onBack} aria-label="חזור">
          <Icon name="arrow_forward" size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-extrabold leading-tight tracking-tight md:text-[22px]">{title}</h1>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-text-3 md:text-[13px]">{subtitle}</p>}
        </div>
        {icon && (
          <span className="avatar-chip hidden h-10 w-10 shrink-0 rounded-[11px] sm:grid">
            <Icon name={icon} size={23} className="text-white" />
          </span>
        )}
      </header>
      <div className="sr-editor-body">{children}</div>
      <footer className="sr-editor-foot">{footer}</footer>
    </div>
  );
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
  const [inventorySearch, setInventorySearch] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [step, setStep] = useState(0);
  const [stepDir, setStepDir] = useState<1 | -1>(1);
  const [openTeamRows, setOpenTeamRows] = useState<Set<string>>(new Set());
  const pageRef = useRef<HTMLDivElement>(null);
  const isMdUp = useIsMdUp();
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
  const totalHours = s.participants.reduce((sum, p) => sum + (Number(p.hours) || 0), 0);
  const tipsHourly = totalHours > 0 ? totalTips / totalHours : 0;
  const tipDistribution = useMemo(
    () => distributeTips(totalTips, s.participants.filter((p) => p.employee_id)),
    [totalTips, s.participants],
  );
  const tipByEmployee = useMemo(
    () => new Map(tipDistribution.map((row) => [row.employee_id, row])),
    [tipDistribution],
  );
  const profileById = useMemo(() => new Map(allUsers.map((u) => [u.id, u])), [allUsers]);
  const participantsLoading = attendanceLoading;
  const availableTeamUsers = allUsers.filter((u) => !s.team_members.some((p) => p.employee_id === u.id));
  const selectedOutOfStockIds = useMemo(
    () => new Set(s.out_of_stock_items.map((i) => i.item_id)),
    [s.out_of_stock_items],
  );
  const inventorySearchResults = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    if (!q) return [];
    return inventoryItems
      .filter((item) => !selectedOutOfStockIds.has(item.id))
      .filter((item) => item.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [inventoryItems, inventorySearch, selectedOutOfStockIds]);

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

  function toggleTeamRow(key: string) {
    setOpenTeamRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
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

  async function submit() {
    setError(null);
    const outOfStockItems = s.urgent_inventory_enabled ? s.out_of_stock_items : [];
    const urgentInventoryText = s.urgent_inventory_enabled
      ? outOfStockItems.length > 0
        ? outOfStockItems.map((i) => i.name).join(", ")
        : s.urgent_inventory.trim() || null
      : null;
    const faultsText = s.faults_enabled ? s.faults_maintenance.trim() || null : null;
    const teamIds = s.team_members.filter((p) => p.employee_id).map((p) => p.employee_id);
    const bonusRows = buildBonusParticipantsFromTeam(teamIds, allUsers);
    const payload: SaveShiftReportInput = {
      id: report?.id,
      business_id: businessId,
      report_date: s.report_date,
      shift_template_id: null,
      manager_names: formatManagerNames(s.manager_ids, shiftManagers),
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
        manager_ids: s.manager_ids.length > 0 ? s.manager_ids : undefined,
        manager_id: s.manager_ids[0] || undefined,
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

  if (previewing) {
    const managerLabel = formatManagerNames(s.manager_ids, shiftManagers) ?? "—";
    const teamRows = s.team_members.filter((p) => p.employee_id);
    const salesItems = s.sales_items.filter((i) => i.label.trim());
    const outOfStockItems = s.urgent_inventory_enabled ? s.out_of_stock_items : [];
    const urgentInventoryText = s.urgent_inventory_enabled
      ? outOfStockItems.length > 0
        ? null
        : s.urgent_inventory.trim() || null
      : null;
    const faultsText = s.faults_enabled ? s.faults_maintenance.trim() || null : null;

    return (
      <Modal
        open
        onClose={() => setPreviewing(false)}
        title="תצוגה מקדימה לפני הגשה"
        subtitle={s.report_date ? formatDateShort(s.report_date) : "בדקו את הפרטים לפני הגשת הדוח"}
        icon="preview"
        maxWidth={720}
        footer={
          <>
            <Button variant="secondary" icon="edit" onClick={() => setPreviewing(false)}>
              חזרה לעריכה
            </Button>
            <Button className="flex-1" icon="send" loading={save.isPending} onClick={submit}>
              הגש
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          {error && (
            <div className="rounded-[11px] border border-danger/30 bg-[var(--danger-bg)] px-3.5 py-3 text-[13.5px] font-semibold text-danger">
              {error}
            </div>
          )}

          <Section icon="event" title="פרטי היום">
            <DetailGrid>
              <DetailCell label="תאריך" value={s.report_date ? formatDateShort(s.report_date) : "—"} />
              <DetailCell label='אחמ"ש' value={managerLabel} />
            </DetailGrid>
          </Section>

          <Section icon="payments" title="סגירת קופה">
            <DetailGrid>
              <DetailCell label='סה"כ מכירות' value={formatCurrency(Number(s.total_sales) || 0)} />
              <DetailCell label="משלוחים / וולט" value={formatCurrency(Number(s.delivery_sales) || 0)} />
              <DetailCell label="ממוצע לסועד" value={formatCurrency(Number(s.avg_per_diner) || 0)} />
            </DetailGrid>
          </Section>

          <Section icon="savings" title="טיפים">
            <DetailGrid>
              <DetailCell label='סה"כ טיפים' value={formatCurrency(totalTips)} />
              <DetailCell label="שכר שעתי מטיפים" value={formatCurrency(tipsHourly)} />
            </DetailGrid>
          </Section>

          <Section icon="groups" title="פירוט צוות המשמרת">
            <div className="text-[12.5px] text-text-2">
              כל מי שעבד במשמרת. לעובדי טיפים החלק מהקופה מחושב לפי השעות שלהם, ולשאר לפי השכר השעתי בפרופיל.
            </div>
            <ShiftTeamPay
              rows={buildShiftPayRows({
                team: teamRows,
                tipByEmployee,
                profileById,
                userName,
                tipsHourly,
              })}
            />
            <DetailGrid>
              <DetailCell label="שחרור ראשון" value={formatTimeLabel(s.first_release)} />
              <DetailCell
                label="אנרגיות בצוות"
                value={s.energy_level ? `${s.energy_level}/10` : null}
              />
            </DetailGrid>
            <DetailText label="אירועים חריגים" value={s.unusual_events} />
            <DetailText label="שיחות במשמרת" value={s.team_talks} />
            <DetailText label="הקול של הצוות" value={s.team_voice} />
          </Section>

          {(salesItems.length > 0 || s.top_seller.trim()) && (
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
              {s.top_seller.trim() && (
                <DetailCell label="מי מכר הכי הרבה" value={s.top_seller.trim()} span />
              )}
            </Section>
          )}

          <Section icon="inventory_2" title="לוגיסטיקה ותחזוקה">
            <DetailCell
              label="משימות יומיות"
              value={s.daily_tasks_done ? "בוצעו" : "לא בוצעו"}
              span
            />
            {(outOfStockItems.length > 0 || urgentInventoryText) && (
              <div className="rounded-[10px] border border-border bg-surface-2 px-3.5 py-3">
                <div className="text-[11px] font-bold text-text-3">מלאי שנגמר</div>
                {outOfStockItems.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {outOfStockItems.map((item) => (
                      <span
                        key={item.item_id}
                        className="rounded-full border border-border bg-surface px-2.5 py-1 text-[12.5px] font-semibold"
                      >
                        {item.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1 text-[13.5px] leading-relaxed text-text">{urgentInventoryText}</div>
                )}
              </div>
            )}
            <DetailText label="תקלות ותחזוקה" value={faultsText} />
          </Section>

          {s.invoice_urls.length > 0 && (
            <Section icon="receipt" title="חשבוניות">
              <div className="text-[13px] font-semibold text-text-2">
                {s.invoice_urls.length} קבצים מצורפים
              </div>
            </Section>
          )}
        </div>
      </Modal>
    );
  }

  const today = todayISO();
  const yesterday = addDaysISO(today, -1);
  const dayDate = new Date((s.report_date || today) + "T00:00:00");

  const teamList = (
    <div className="srt-list">
      {s.team_members.map((p, idx) => {
        const key = p.employee_id || `new-${idx}`;
        // Blank rows still need an employee picked, so they can't collapse.
        const open = !p.employee_id || openTeamRows.has(key);
        const edited =
          p.attendance_hours != null &&
          Math.abs((Number(p.hours) || 0) - p.attendance_hours) > 0.01;
        return (
          <div
            key={key}
            className="srt-row"
            data-open={open}
            style={{ "--i": idx } as React.CSSProperties}
          >
            <div className="srt-head">
              {p.employee_id && (
                <button
                  type="button"
                  className="srt-toggle"
                  onClick={() => toggleTeamRow(key)}
                  aria-expanded={open}
                  aria-label={`${userName(p.employee_id)} — עריכת שעות`}
                />
              )}
              <span className="srt-av" aria-hidden="true">
                {p.employee_id ? initialsOf(userName(p.employee_id)) : <Icon name="person_add" size={17} />}
              </span>
              <span className="srt-id">
                {p.employee_id ? (
                  <b>{userName(p.employee_id)}</b>
                ) : (
                  <b className="srt-id-placeholder">עובד חדש</b>
                )}
                <i>
                  {formatWorkTimeRange(p.work_start ?? undefined, p.work_end ?? undefined)}
                  {edited && <em className="srt-edited">שונה מנוכחות</em>}
                </i>
              </span>
              <span className="srt-hours">
                <input
                  type="number"
                  inputMode="decimal"
                  step={0.25}
                  min={0}
                  placeholder="0"
                  value={p.hours || ""}
                  onChange={(e) => updateTeamMember(idx, { hours: Number(e.target.value) || 0 })}
                  aria-label={`סה״כ שעות — ${p.employee_id ? userName(p.employee_id) : "עובד חדש"}`}
                />
                <em>שע׳</em>
              </span>
              {p.employee_id && <Icon name="expand_more" size={20} className="srt-chev" />}
            </div>

            <div className="srt-body">
              <div className="srt-body-inner">
                {!p.employee_id && (
                  <Select
                    searchable
                    searchPlaceholder="חיפוש עובד..."
                    value={p.employee_id}
                    onChange={(e) => updateTeamMember(idx, { employee_id: e.target.value })}
                  >
                    <option value="">— בחר עובד —</option>
                    {availableTeamUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </Select>
                )}

                <div className="srt-times">
                  <label className="srt-time">
                    <span>כניסה</span>
                    <input
                      type="time"
                      value={p.work_start ?? ""}
                      onChange={(e) => updateTeamMember(idx, { work_start: e.target.value })}
                    />
                  </label>
                  <label className="srt-time">
                    <span>יציאה</span>
                    <input
                      type="time"
                      value={p.work_end ?? ""}
                      onChange={(e) => updateTeamMember(idx, { work_end: e.target.value })}
                    />
                  </label>
                </div>

                <button type="button" className="srt-remove" onClick={() => removeTeamMember(idx)}>
                  <Icon name="person_remove" size={17} />
                  הסרה מהדוח
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const steps: WizardStep[] = [
    {
      key: "day",
      icon: "event",
      title: "פרטי היום",
      hint: "על איזה תאריך הדוח, ומי היה אחראי המשמרת",
      body: (
        <div className="srw-stack">
          <div className="srw-card">
            <span className="srw-card-label">תאריך הדוח</span>
            <label className="srw-date">
              <span className="srw-date-num">{dayDate.getDate()}</span>
              <span className="srw-date-meta">
                <b>יום {WEEKDAY_NAMES[dayDate.getDay()]}</b>
                <i>{MONTH_NAMES[dayDate.getMonth()]} {dayDate.getFullYear()}</i>
              </span>
              <Icon name="edit_calendar" size={19} className="srw-date-edit" />
              <input
                type="date"
                value={s.report_date}
                onChange={(e) => e.target.value && set("report_date", e.target.value)}
                className="srw-date-input"
                aria-label="תאריך הדוח"
              />
            </label>
            <div className="srw-quick">
              <button type="button" data-active={s.report_date === today} onClick={() => set("report_date", today)}>
                היום
              </button>
              <button type="button" data-active={s.report_date === yesterday} onClick={() => set("report_date", yesterday)}>
                אתמול
              </button>
            </div>
          </div>

          <div className="srw-card">
            <div className="srw-card-head">
              <span className="srw-card-label">אחמ״ש (אחראי משמרת)</span>
              {s.manager_ids.length > 0 && <span className="srw-count-pill">{s.manager_ids.length}</span>}
            </div>
            <p className="srw-note">ניתן לסמן יותר מאחד אם היו כמה אחמ״שים במשמרת.</p>
            <PeoplePicker
              people={shiftManagers}
              selected={s.manager_ids}
              empty="אין אחמ״שים רשומים בעסק."
              onToggle={(id) =>
                set(
                  "manager_ids",
                  s.manager_ids.includes(id)
                    ? s.manager_ids.filter((m) => m !== id)
                    : [...s.manager_ids, id],
                )
              }
            />
          </div>
        </div>
      ),
    },
    {
      key: "cash",
      icon: "payments",
      title: "סגירת קופה",
      hint: "מה נכנס בקופה היום, ומה נמכר",
      body: (
        <div className="srw-stack">
          <MoneyField
            hero
            label='סה"כ מכירות'
            value={s.total_sales}
            onChange={(v) => set("total_sales", v)}
          />
          <div className="srw-duo">
            <MoneyField label="משלוחים / וולט" value={s.delivery_sales} onChange={(v) => set("delivery_sales", v)} />
            <MoneyField label="ממוצע לסועד" value={s.avg_per_diner} onChange={(v) => set("avg_per_diner", v)} />
          </div>

          <div className="srw-card">
            <div className="srw-card-head">
              <span className="srw-card-label">פירוט מכירות</span>
              {s.sales_items.length > 0 && <span className="srw-count-pill">{s.sales_items.length}</span>}
            </div>
            {s.sales_items.length === 0 ? (
              <div className="srw-empty">אפשר לפרט כמה קוקטיילים, בקבוקים או מנות נמכרו.</div>
            ) : (
              <div className="srw-items">
                {s.sales_items.map((item, idx) => (
                  <div key={idx} className="srw-item" style={{ "--i": idx } as React.CSSProperties}>
                    <input
                      className="srw-item-name"
                      placeholder="פריט (לדוגמה: קוקטיילים)"
                      value={item.label}
                      onChange={(e) => {
                        const next = [...s.sales_items];
                        next[idx] = { ...next[idx], label: e.target.value };
                        set("sales_items", next);
                      }}
                    />
                    <input
                      className="srw-item-qty"
                      type="number"
                      inputMode="numeric"
                      placeholder="0"
                      value={item.count || ""}
                      onChange={(e) => {
                        const next = [...s.sales_items];
                        next[idx] = { ...next[idx], count: Number(e.target.value) || 0 };
                        set("sales_items", next);
                      }}
                    />
                    <button
                      type="button"
                      className="srw-item-x"
                      onClick={() => set("sales_items", s.sales_items.filter((_, i) => i !== idx))}
                      aria-label="הסרת פריט"
                    >
                      <Icon name="close" size={17} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              className="srw-add"
              onClick={() => set("sales_items", [...s.sales_items, { label: "", count: 0 }])}
            >
              <Icon name="add" size={18} />
              הוספת פריט מכירה
            </button>
          </div>

          <div className="srw-card">
            <span className="srw-card-label">מי מכר הכי הרבה</span>
            <Input
              value={s.top_seller}
              onChange={(e) => set("top_seller", e.target.value)}
              placeholder="שם העובד"
            />
          </div>
        </div>
      ),
    },
    {
      key: "team",
      icon: "groups",
      title: "הצוות",
      hint: "שעות העבודה, האנרגיה בשטח ומה נאמר במשמרת",
      body: (
        <div className="srw-stack">
          <div className="srw-card">
            <div className="srw-card-head">
              <span className="srw-card-label">צוות המשמרת</span>
              {s.team_members.length > 0 && <span className="srw-count-pill">{s.team_members.length}</span>}
            </div>
            <p className="srw-note">
              העובדים נטענים אוטומטית מנוכחות היום. ניתן לערוך שעות עבודה (מ-עד) או להוסיף עובדים ידנית.
            </p>

            {participantsLoading ? (
              <div className="srw-empty">טוען עובדים מהיום…</div>
            ) : s.team_members.length === 0 ? (
              <div className="srw-empty">לא נמצאה נוכחות לתאריך זה — ניתן להוסיף עובדים ידנית.</div>
            ) : (
              teamList
            )}

            {availableTeamUsers.length > 0 && (
              <button
                type="button"
                className="srw-add"
                onClick={() =>
                  set("team_members", [
                    ...s.team_members,
                    { employee_id: "", hours: 0, work_start: "", work_end: "" },
                  ])
                }
              >
                <Icon name="person_add" size={18} />
                הוספת עובד
              </button>
            )}
          </div>

          <div className="srw-card">
            <span className="srw-card-label">מתי שוחרר עובד ראשון</span>
            <TimePicker value={s.first_release} onChange={(v) => set("first_release", v)} />
          </div>

          <div className="srw-card">
            <span className="srw-card-label">אנרגיות בצוות</span>
            <EnergyPicker value={s.energy_level} onChange={(v) => set("energy_level", v)} />
          </div>

          <div className="srw-card">
            <span className="srw-card-label">אירועים חריגים</span>
            <p className="srw-note">איחורים, הברזות, משהו אישי?</p>
            <Textarea rows={3} value={s.unusual_events} onChange={(e) => set("unusual_events", e.target.value)} />
          </div>

          <div className="srw-card">
            <span className="srw-card-label">שיחות שנעשו במשמרת</span>
            <p className="srw-note">פידבק, חידוד נהלים, מילה טובה</p>
            <Textarea rows={4} value={s.team_talks} onChange={(e) => set("team_talks", e.target.value)} />
          </div>

          <div className="srw-card">
            <span className="srw-card-label">הקול של הצוות</span>
            <p className="srw-note">בקשות / מה היה חסר</p>
            <Textarea rows={2} value={s.team_voice} onChange={(e) => set("team_voice", e.target.value)} />
          </div>
        </div>
      ),
    },
    {
      key: "tips",
      icon: "savings",
      title: "טיפים",
      hint: "הסכום נכנס — החלוקה מתעדכנת לבד לפי שעות",
      body: (
        <div className="srw-stack">
          <MoneyField
            hero
            tone="accent"
            label='סה"כ טיפים'
            value={s.total_tips}
            onChange={(v) => set("total_tips", v)}
          />
          <div className="srw-duo">
            <div className="srw-readout">
              <span className="srw-readout-label">שכר שעתי מטיפים</span>
              <span className="srw-readout-value">{formatCurrency(tipsHourly)}</span>
            </div>
            <div className="srw-readout">
              <span className="srw-readout-label">שעות על טיפים</span>
              <span className="srw-readout-value">{totalHours > 0 ? formatShiftHours(totalHours) : "0"}</span>
            </div>
          </div>

          <div className="srw-card">
            <div className="srw-card-head">
              <span className="srw-card-label">חלוקה לפי שעות</span>
              {tipDistribution.length > 0 && <span className="srw-count-pill">{tipDistribution.length}</span>}
            </div>
            {tipDistribution.length === 0 ? (
              <div className="srw-empty">אין עובדים על טיפים עם שעות במשמרת הזו.</div>
            ) : (
              <div className="srw-split">
                {tipDistribution.map((row, idx) => {
                  const share = totalTips > 0 ? Math.max(4, (row.amount / totalTips) * 100) : 0;
                  return (
                    <div key={row.employee_id} className="srw-split-row" style={{ "--i": idx } as React.CSSProperties}>
                      <span className="srw-split-avatar" aria-hidden="true">
                        {initialsOf(userName(row.employee_id))}
                      </span>
                      <span className="srw-split-text">
                        <b>{userName(row.employee_id)}</b>
                        <i>{formatShiftHours(row.hours)} שע׳</i>
                      </span>
                      <span className="srw-split-amount">{formatCurrency(row.amount)}</span>
                      <span className="srw-split-bar" aria-hidden="true">
                        <i style={{ width: `${share}%` }} />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "close",
      icon: "task_alt",
      title: "סגירה",
      hint: "משימות, מלאי, תקלות וחשבוניות",
      body: (
        <div className="srw-stack">
          <label className="srw-toggle">
            <span className="srw-toggle-text">
              <b>משימות יומיות בוצעו</b>
              <i>כל הצ׳ק־ליסט של סוף המשמרת נסגר</i>
            </span>
            <Switch checked={s.daily_tasks_done} onChange={(v) => set("daily_tasks_done", v)} />
          </label>

          <div className="srw-group">
            <label className="srw-toggle">
              <span className="srw-toggle-text">
                <b>מלאי שנגמר</b>
                <i>מוצרים שחייבים הזמנה דחופה</i>
              </span>
              <Switch
                checked={s.urgent_inventory_enabled}
                onChange={(v) => {
                  set("urgent_inventory_enabled", v);
                  if (!v) {
                    set("out_of_stock_items", []);
                    setInventorySearch("");
                  }
                }}
              />
            </label>
            {s.urgent_inventory_enabled &&
              (inventoryItems.length === 0 ? (
                <div className="srw-empty">אין מוצרים במלאי. הוסיפו מוצרים במודול המלאי.</div>
              ) : (
                <div className="srw-panel">
                  {s.out_of_stock_items.length > 0 && (
                    <div className="srw-tags">
                      {s.out_of_stock_items.map((item) => {
                        const inv = inventoryItems.find((i) => i.id === item.item_id);
                        return (
                          <button
                            key={item.item_id}
                            type="button"
                            className="srw-tag"
                            onClick={() => toggleOutOfStockItem(item.item_id)}
                          >
                            <span>{item.name}</span>
                            {inv && <em>{inv.current_qty} {inv.unit}</em>}
                            <Icon name="close" size={14} />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="srw-search">
                    <Icon name="search" size={18} />
                    <input
                      type="search"
                      value={inventorySearch}
                      onChange={(e) => setInventorySearch(e.target.value)}
                      placeholder="חיפוש מוצר להוספה..."
                    />
                  </div>

                  {!inventorySearch.trim() ? (
                    <p className="srw-note srw-note--center">
                      {s.out_of_stock_items.length > 0
                        ? "ניתן לחפש ולהוסיף עוד מוצרים"
                        : "הקלידו שם מוצר כדי להוסיף לרשימה"}
                    </p>
                  ) : inventorySearchResults.length === 0 ? (
                    <p className="srw-note srw-note--center">לא נמצאו מוצרים</p>
                  ) : (
                    <div className="srw-results">
                      {inventorySearchResults.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            toggleOutOfStockItem(item.id);
                            setInventorySearch("");
                          }}
                        >
                          <span>{item.name}</span>
                          <em>{item.current_qty} {item.unit}</em>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>

          <div className="srw-group">
            <label className="srw-toggle">
              <span className="srw-toggle-text">
                <b>תקלות ותחזוקה</b>
                <i>משהו נשבר או צריך תיקון?</i>
              </span>
              <Switch
                checked={s.faults_enabled}
                onChange={(v) => {
                  set("faults_enabled", v);
                  if (!v) set("faults_maintenance", "");
                }}
              />
            </label>
            {s.faults_enabled && (
              <div className="srw-panel">
                <Textarea
                  rows={3}
                  placeholder="מה קרה, מה צריך לתקן…"
                  value={s.faults_maintenance}
                  onChange={(e) => set("faults_maintenance", e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="srw-card">
            <div className="srw-card-head">
              <span className="srw-card-label">חשבוניות</span>
              {s.invoice_urls.length > 0 && <span className="srw-count-pill">{s.invoice_urls.length}</span>}
            </div>
            <div className="srw-files">
              {s.invoice_urls.map((url, idx) => (
                <div key={idx} className="srw-file" style={{ "--i": idx } as React.CSSProperties}>
                  <a href={url} target="_blank" rel="noreferrer">
                    {/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) ? (
                      <img src={url} alt="חשבונית" />
                    ) : (
                      <span className="srw-file-doc">
                        <Icon name="description" size={24} />
                        קובץ
                      </span>
                    )}
                  </a>
                  <button
                    type="button"
                    className="srw-file-x"
                    onClick={() => set("invoice_urls", s.invoice_urls.filter((_, i) => i !== idx))}
                    aria-label="הסרת חשבונית"
                  >
                    <Icon name="close" size={15} />
                  </button>
                </div>
              ))}
              <label className="srw-file-add" data-busy={uploading ? "true" : undefined}>
                <Icon name={uploading ? "hourglass_top" : "add_a_photo"} size={23} />
                <span>{uploading ? "מעלה…" : "העלאת חשבונית"}</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  disabled={uploading}
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </label>
            </div>
          </div>
        </div>
      ),
    },
  ];

  function goStep(next: number) {
    if (next < 0 || next >= steps.length || next === step) return;
    setStepDir(next > step ? 1 : -1);
    setStep(next);
    pageRef.current?.closest("main")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openPreview() {
    setError(null);
    setPreviewing(true);
  }

  if (!isMdUp) {
    return (
      <div ref={pageRef}>
        <ReportWizardShell
          kicker={report ? "עריכת דוח משמרת" : "דוח סיכום משמרת"}
          steps={steps}
          step={Math.min(step, steps.length - 1)}
          dir={stepDir}
          onStep={goStep}
          onClose={onClose}
          onFinish={openPreview}
          error={error}
        />
      </div>
    );
  }

  return (
    <ReportEditorShell
      title={report ? "עריכת דוח משמרת" : "דוח סיכום משמרת"}
      subtitle="סגירת קופה, צוות, מכירות, לוגיסטיקה וחשבוניות"
      icon="receipt_long"
      onBack={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ביטול
          </Button>
          <Button className="flex-1" icon="preview" onClick={openPreview}>
            תצוגה מקדימה
          </Button>
        </>
      }
    >
      <div className="srw-desktop flex flex-col gap-6">
        {steps.map((d) => (
          <Section key={d.key} icon={d.icon} title={d.title}>
            {d.body}
          </Section>
        ))}

        {error && (
          <div className="flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
            <Icon name="error" size={18} /> {error}
          </div>
        )}
      </div>
    </ReportEditorShell>
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

function ShiftTeamPay({ rows }: { rows: ShiftPayRow[] }) {
  const [filter, setFilter] = useState<"all" | "tips" | "hourly">("all");

  const tipRows = rows.filter((r) => r.onTips);
  const hourlyRows = rows.filter((r) => !r.onTips);
  const shown = filter === "tips" ? tipRows : filter === "hourly" ? hourlyRows : rows;

  const sumHours = shown.reduce((sum, r) => sum + r.hours, 0);
  const sumAmount = shown.reduce((sum, r) => sum + r.amount, 0);

  if (rows.length === 0) {
    return <div className="srw-empty">לא נוספו עובדים לדוח.</div>;
  }

  const tabs = [
    { key: "all" as const, label: "הכל", count: rows.length },
    { key: "tips" as const, label: "על טיפים", count: tipRows.length },
    { key: "hourly" as const, label: "שעתי", count: hourlyRows.length },
  ];

  return (
    <div className="srp">
      <div className="srp-tabs" role="tablist" aria-label="סינון לפי סוג שכר">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={filter === t.key}
            data-active={filter === t.key}
            disabled={t.count === 0}
            onClick={() => setFilter(t.key)}
          >
            {t.label}
            <em>{t.count}</em>
          </button>
        ))}
      </div>

      <div className="srp-sum">
        <div>
          <span>עובדים</span>
          <b>{shown.length}</b>
        </div>
        <div>
          <span>שעות</span>
          <b>{sumHours > 0 ? formatShiftHours(sumHours) : "0"}</b>
        </div>
        <div>
          <span>{filter === "tips" ? "סה״כ לחלוקה" : "עלות שכר"}</span>
          <b>{formatCurrency(sumAmount)}</b>
        </div>
      </div>

      <div className="srp-list">
        {shown.map((r, idx) => (
          <div
            key={r.employee_id}
            className="srp-row"
            data-tone={r.onTips ? "tips" : "hourly"}
            style={{ "--i": idx } as React.CSSProperties}
          >
            <span className="srp-avatar" aria-hidden="true">{initialsOf(r.name)}</span>
            <div className="srp-main">
              <div className="srp-name-row">
                <b className="srp-name">{r.name}</b>
                <span className="srp-badge">{r.onTips ? "טיפים" : "שעתי"}</span>
              </div>
              <div className="srp-meta">
                <span>{formatWorkTimeRange(r.work_start ?? undefined, r.work_end ?? undefined)}</span>
                <i aria-hidden="true">·</i>
                <span>{r.hours > 0 ? formatShiftHours(r.hours) : "0"} שע׳</span>
                {!r.rateMissing && (
                  <>
                    <i aria-hidden="true">·</i>
                    <span>{formatCurrency(r.hourly)} לשעה</span>
                  </>
                )}
              </div>
              {r.topup > 0 && (
                <div className="srp-note">
                  <Icon name="shield" size={13} />
                  {formatCurrency(r.fromTips)} מטיפים + {formatCurrency(r.topup)} השלמה למינימום
                </div>
              )}
              {r.rateMissing && (
                <div className="srp-note srp-note--warn">
                  <Icon name="info" size={13} />
                  לא הוגדר שכר שעתי בפרופיל
                </div>
              )}
            </div>
            <span className="srp-amount">{r.rateMissing ? "—" : formatCurrency(r.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportViewer({
  report,
  userName,
  profileById,
  canManage,
  onClose,
  onEdit,
}: {
  report: ShiftReport;
  userName: (id: string) => string;
  profileById: Map<string, Profile>;
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const participants = report.extra?.tip_participants ?? [];
  const teamMembers = report.extra?.team_members ?? [];
  const outOfStockItems = report.extra?.out_of_stock_items ?? [];
  const salesItems = report.extra?.sales_items ?? [];
  const totalTips = Number(report.total_tips) || 0;
  const totalHours = participants.reduce((sum, p) => sum + (Number(p.hours) || 0), 0);
  const tipsHourly = totalHours > 0 ? totalTips / totalHours : Number(report.tips_hourly) || 0;

  // Reports saved before team_members existed only carry the tip participants.
  const teamForPay = teamMembers.length > 0 ? teamMembers : participants;
  const payRows = buildShiftPayRows({
    team: teamForPay,
    tipByEmployee: new Map(distributeTips(totalTips, participants).map((r) => [r.employee_id, r])),
    profileById,
    userName,
    tipsHourly,
  });

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

        <Section icon="savings" title="טיפים">
          <DetailGrid>
            <DetailCell label='סה"כ טיפים' value={formatCurrency(totalTips)} />
            <DetailCell label="שכר שעתי מטיפים" value={formatCurrency(tipsHourly)} />
          </DetailGrid>
        </Section>

        <Section icon="groups" title="צוות המשמרת">
          <div className="text-[12.5px] text-text-2">
            כל מי שעבד במשמרת. לעובדי טיפים החלק מהקופה מחושב לפי השעות שלהם, ולשאר לפי השכר השעתי בפרופיל.
          </div>
          <ShiftTeamPay rows={payRows} />
          <DetailGrid>
            <DetailCell label="שחרור ראשון" value={formatTimeLabel(report.first_release)} />
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
