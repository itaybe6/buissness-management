import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, EmptyState, ErrorState, Icon, PageLoader } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { PageEnter, PressableCard, StaggerGrid, StaggerItem } from "@/components/motion/shared-motion";
import { useAuth } from "@/lib/auth";
import { useBusinessId, formatCurrency, formatDateShort } from "@/lib/db";
import { useShiftReports } from "@/api/shiftReports";
import { useShiftTemplates } from "@/api/shifts";
import {
  HE_DAYS_SHORT,
  HE_MONTHS,
  monthLabel,
  monthNow,
  shiftMonth,
} from "@/lib/payrollShiftRows";
import type { ShiftReport } from "@/types/database";

const WEEKDAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function compactTips(n: number): string {
  if (Math.abs(n) >= 1000) return "₪" + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return formatCurrency(n);
}

export function MonthlyTips() {
  const businessId = useBusinessId();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [month, setMonth] = useState(monthNow());
  const [selected, setSelected] = useState<ShiftReport | null>(null);

  const { data: reports = [], isLoading, isError, refetch } = useShiftReports(businessId, month);
  const { data: templates = [] } = useShiftTemplates(businessId);

  const templateById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);

  const stats = useMemo(() => {
    const list = reports.filter((r) => (Number(r.total_tips) || 0) > 0);
    const all = reports;
    const totalTips = all.reduce((s, r) => s + (Number(r.total_tips) || 0), 0);
    const hourlyVals = all.map((r) => Number(r.tips_hourly) || 0).filter((v) => v > 0);
    const avgHourly = hourlyVals.length ? hourlyVals.reduce((a, b) => a + b, 0) / hourlyVals.length : 0;
    const maxTips = list.reduce((max, r) => Math.max(max, Number(r.total_tips) || 0), 0);
    const bestId = maxTips > 0 ? list.find((r) => (Number(r.total_tips) || 0) === maxTips)?.id : undefined;
    const avgPerShift = all.length ? totalTips / all.length : 0;

    const monthDays = daysInMonth(month);
    const daily = Array.from({ length: monthDays }, (_, i) => {
      const day = i + 1;
      const dayReports = all.filter((r) => new Date(r.report_date + "T12:00:00").getDate() === day);
      const tips = dayReports.reduce((s, r) => s + (Number(r.total_tips) || 0), 0);
      return { day, tips, count: dayReports.length };
    });
    const maxDaily = daily.reduce((m, d) => Math.max(m, d.tips), 0);

    return { totalTips, avgHourly, avgPerShift, maxTips, bestId, daily, maxDaily, withTips: list.length, count: all.length };
  }, [reports, month]);

  const sorted = useMemo(
    () => [...reports].sort((a, b) => b.report_date.localeCompare(a.report_date) || b.created_at.localeCompare(a.created_at)),
    [reports],
  );

  const canManage = !!profile && ["manager", "shift_manager", "office_manager"].includes(profile.role);
  const atCurrentMonth = month >= monthNow();

  if (isLoading) return <PageLoader label="טוען טיפים..." />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const shiftTitle = (r: ShiftReport) => {
    if (r.shift_template_id) {
      const t = templateById.get(r.shift_template_id);
      if (t?.name) return t.name;
    }
    return "משמרת";
  };

  return (
    <PageEnter className="mt-page">
      <div className="mt-shell">
        <section className="mt-hero" aria-label="סיכום טיפים לחודש">
          <div className="mt-hero-bar">
            <Link to="/dashboard" className="mt-back">
              <Icon name="arrow_forward" size={18} />
              דשבורד
            </Link>
            <span className="mt-badge">
              <Icon name="volunteer_activism" size={14} />
              קופת טיפים
            </span>
          </div>

          <div className="mt-month-nav">
            <button
              type="button"
              className="mt-month-btn"
              aria-label="חודש קודם"
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              <Icon name="chevron_right" size={20} />
            </button>
            <span className="mt-month-label">
              <Icon name="calendar_month" size={16} />
              {monthLabel(month)}
            </span>
            <button
              type="button"
              className="mt-month-btn"
              aria-label="חודש הבא"
              disabled={atCurrentMonth}
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              <Icon name="chevron_left" size={20} />
            </button>
          </div>

          <p className="mt-hero-kicker">סה״כ טיפים ב{HE_MONTHS[Number(month.split("-")[1]) - 1]}</p>
          <div className="mt-hero-total">{formatCurrency(stats.totalTips)}</div>

          <div className="mt-stat-row">
            <div className="mt-stat">
              <span className="mt-stat-value">{stats.count}</span>
              <span className="mt-stat-label">משמרות</span>
            </div>
            <div className="mt-stat">
              <span className="mt-stat-value">{formatCurrency(stats.avgHourly)}</span>
              <span className="mt-stat-label">ממוצע לשעה</span>
            </div>
            <div className="mt-stat">
              <span className="mt-stat-value">{compactTips(stats.avgPerShift)}</span>
              <span className="mt-stat-label">למשמרת</span>
            </div>
          </div>

          {stats.maxDaily > 0 && (
            <div className="mt-spark" aria-label="טיפים לפי יום בחודש">
              {stats.daily.map(({ day, tips }) => {
                const pct = Math.max(tips > 0 ? 12 : 0, (tips / stats.maxDaily) * 100);
                const isToday =
                  month === monthNow() && day === new Date().getDate();
                return (
                  <span
                    key={day}
                    className={`mt-spark-bar${tips > 0 ? " mt-spark-bar--on" : ""}${isToday ? " mt-spark-bar--today" : ""}`}
                    style={{ ["--h" as string]: `${pct}%` }}
                    title={tips > 0 ? `יום ${day}: ${formatCurrency(tips)}` : undefined}
                  >
                    <i />
                  </span>
                );
              })}
            </div>
          )}
        </section>

        {sorted.length === 0 ? (
          <EmptyState
            icon="savings"
            title="אין דוחות משמרת לחודש זה"
            description="ברגע שיוזנו דוחות סגירת משמרת עם קופת טיפים — הן יופיעו כאן, משמרת אחר משמרת."
            action={
              canManage ? (
                <Button icon="add" onClick={() => navigate("/shift-reports/new")}>
                  דוח משמרת חדש
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <header className="mt-list-head">
              <h2 className="mt-list-title">לפי משמרת</h2>
              <span className="mt-list-meta">{sorted.length} דוחות</span>
            </header>

            <StaggerGrid className="mt-shift-list">
              {sorted.map((r) => {
                const d = new Date(r.report_date + "T12:00:00");
                const dow = d.getDay();
                const tips = Number(r.total_tips) || 0;
                const hourly = Number(r.tips_hourly) || 0;
                const team = (r.extra?.tip_participants ?? r.extra?.team_members ?? []).length;
                const pct = stats.maxTips > 0 && tips > 0 ? (tips / stats.maxTips) * 100 : 0;
                const isBest = stats.bestId === r.id && sorted.length > 1 && tips > 0;

                return (
                  <StaggerItem key={r.id}>
                    <PressableCard>
                      <button
                        type="button"
                        className="mt-shift"
                        onClick={() => setSelected(r)}
                        aria-label={`${shiftTitle(r)} · ${formatDateShort(r.report_date)} · ${formatCurrency(tips)}`}
                      >
                      <span className="mt-shift-date" aria-hidden>
                        <b>{d.getDate()}</b>
                        <i>{HE_DAYS_SHORT[dow]}</i>
                      </span>

                      <div className="mt-shift-body">
                        <div className="mt-shift-top">
                          <span className="mt-shift-name">{shiftTitle(r)}</span>
                          {isBest && (
                            <span className="mt-shift-best">
                              <Icon name="emoji_events" size={13} />
                              שיא
                            </span>
                          )}
                        </div>
                        <p className="mt-shift-sub">
                          יום {WEEKDAY_NAMES[dow]}
                          {r.manager_names ? ` · ${r.manager_names}` : ""}
                        </p>
                        <div className="mt-shift-meta">
                          {hourly > 0 && (
                            <span>
                              <Icon name="timer" size={13} />
                              {formatCurrency(hourly)}/ש׳
                            </span>
                          )}
                          {team > 0 && (
                            <span>
                              <Icon name="groups" size={13} />
                              {team} במחלקת טיפים
                            </span>
                          )}
                        </div>
                        {tips > 0 && (
                          <span className="mt-shift-meter">
                            <i style={{ width: `${pct}%` }} />
                          </span>
                        )}
                      </div>

                      <div className="mt-shift-amount">
                        <span className={`mt-shift-tips${tips <= 0 ? " mt-shift-tips--zero" : ""}`}>
                          {formatCurrency(tips)}
                        </span>
                        <Icon name="chevron_left" size={18} className="mt-shift-chevron" />
                      </div>
                      </button>
                    </PressableCard>
                  </StaggerItem>
                );
              })}
            </StaggerGrid>
          </>
        )}
      </div>

      <ShiftTipsSheet
        report={selected}
        shiftTitle={selected ? shiftTitle(selected) : ""}
        canManage={canManage}
        onClose={() => setSelected(null)}
        onOpenReport={() => {
          if (selected) navigate("/shift-reports");
        }}
      />
    </PageEnter>
  );
}

function ShiftTipsSheet({
  report,
  shiftTitle,
  canManage,
  onClose,
  onOpenReport,
}: {
  report: ShiftReport | null;
  shiftTitle: string;
  canManage: boolean;
  onClose: () => void;
  onOpenReport: () => void;
}) {
  if (!report) return null;

  const d = new Date(report.report_date + "T12:00:00");
  const tips = Number(report.total_tips) || 0;
  const hourly = Number(report.tips_hourly) || 0;
  const sales = Number(report.total_sales) || 0;
  const servicePct = Number(report.service_pct) || 0;
  const participants = report.extra?.tip_participants ?? report.extra?.team_members ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      icon="savings"
      title={shiftTitle}
      subtitle={`${WEEKDAY_NAMES[d.getDay()]} · ${formatDateShort(report.report_date)}`}
      footer={
        canManage ? (
          <>
            <Button variant="secondary" onClick={onClose} className="flex-1">
              סגור
            </Button>
            <Button icon="receipt_long" onClick={onOpenReport} className="flex-1">
              לדוח המלא
            </Button>
          </>
        ) : (
          <Button onClick={onClose} className="w-full">
            סגור
          </Button>
        )
      }
    >
      <div className="mt-sheet-hero">
        <span className="mt-sheet-label">יצא מהקופה</span>
        <span className="mt-sheet-total">{formatCurrency(tips)}</span>
      </div>

      <div className="mt-sheet-grid">
        <SheetCell icon="timer" label="ממוצע לשעה" value={hourly > 0 ? formatCurrency(hourly) : "—"} />
        <SheetCell icon="point_of_sale" label="מכירות" value={sales > 0 ? formatCurrency(sales) : "—"} />
        <SheetCell icon="percent" label="אחוז שירות" value={servicePct > 0 ? `${servicePct}%` : "—"} />
        <SheetCell icon="groups" label="על טיפים" value={participants.length > 0 ? String(participants.length) : "—"} />
      </div>

      {report.manager_names && (
        <p className="mt-sheet-note">
          <Icon name="shield_person" size={16} />
          אחמ״ש: {report.manager_names}
        </p>
      )}
    </Modal>
  );
}

function SheetCell({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="mt-sheet-cell">
      <span className="mt-sheet-cell-icon">
        <Icon name={icon} size={17} />
      </span>
      <span className="mt-sheet-cell-label">{label}</span>
      <span className="mt-sheet-cell-value">{value}</span>
    </div>
  );
}
