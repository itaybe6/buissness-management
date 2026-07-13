import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { useAttendanceMonth } from "@/api/attendance";
import { useTips, useShiftBonuses } from "@/api/payroll";
import { useProfiles } from "@/api/users";
import { useShiftTemplates } from "@/api/shifts";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/db";
import { fmtHours } from "@/lib/payrollShiftRows";
import {
  aggregateByMonth,
  aggregateDailyLaborCosts,
  fillMonthDays,
  fillWeekDays,
  formatWeekRange,
  monthKeyFromDate,
  sumLaborCosts,
  weekStartISO,
  type DayLaborCost,
  type LaborCostSlice,
} from "@/lib/payrollDailyCost";
import type { Attendance, ShiftBonus, Tip } from "@/types/database";
import { Icon } from "@/components/ui";
import { CountUp } from "./charts";

type Granularity = "day" | "week" | "month";

function compactCurrency(n: number): string {
  if (Math.abs(n) >= 1000) return "₪" + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return "₪" + Math.round(n).toLocaleString("he-IL");
}

function monthKey(d: Date): string {
  return monthKeyFromDate(d);
}

function shiftMonth(m: string, delta: number): string {
  const d = new Date(m + "-01T12:00:00");
  d.setMonth(d.getMonth() + delta);
  return monthKeyFromDate(d);
}

async function fetchMonthPayrollData(businessId: string, monthISO: string) {
  const start = `${monthISO}-01`;
  const d = new Date(start);
  d.setMonth(d.getMonth() + 1);
  const end = d.toISOString().slice(0, 10);
  const attStart = `${monthISO}-01T00:00:00`;
  const attEnd = d.toISOString();

  const [tipsRes, bonusesRes, attRes] = await Promise.all([
    supabase.from("tips").select("*").eq("business_id", businessId).gte("shift_date", start).lt("shift_date", end),
    supabase.from("shift_bonuses").select("*").eq("business_id", businessId).gte("shift_date", start).lt("shift_date", end),
    supabase.from("attendance").select("*").eq("business_id", businessId).gte("clock_in", attStart).lt("clock_in", attEnd),
  ]);
  if (tipsRes.error) throw tipsRes.error;
  if (bonusesRes.error) throw bonusesRes.error;
  if (attRes.error) throw attRes.error;
  return {
    tips: (tipsRes.data ?? []) as Tip[],
    bonuses: (bonusesRes.data ?? []) as ShiftBonus[],
    attendance: (attRes.data ?? []) as Attendance[],
  };
}

function pctChange(current: number, prev: number): number | null {
  if (prev <= 0 && current <= 0) return null;
  if (prev <= 0) return 100;
  return ((current - prev) / prev) * 100;
}

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const dir = pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat";
  const icon = dir === "up" ? "trending_up" : dir === "down" ? "trending_down" : "trending_flat";
  return (
    <span className="dash-trend" data-dir={dir}>
      <Icon name={icon} size={13} />
      {Math.abs(Math.round(pct))}%
    </span>
  );
}

/* ---- Stacked bar chart ---- */
function StackedBarChart({
  data,
  todayISO,
  height = 200,
  formatValue = compactCurrency,
  compact = false,
}: {
  data: LaborCostSlice[];
  todayISO?: string;
  height?: number;
  formatValue?: (n: number) => string;
  compact?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const max = Math.max(1, ...data.map((d) => d.total));
  const plotH = height - 52;

  return (
    <div className="labor-chart" style={{ height }} dir="rtl" data-compact={compact || undefined}>
      <div className="labor-chart-bars">
        {data.map((d, i) => {
          const totalH = (d.total / max) * plotH;
          const hourlyH = d.total > 0 ? (d.hourly / d.total) * totalH : 0;
          const topupH = d.total > 0 ? (d.topup / d.total) * totalH : 0;
          const bonusH = d.total > 0 ? (d.bonus / d.total) * totalH : 0;
          const isToday = d.highlight || (todayISO && d.date === todayISO);

          return (
            <div key={i} className="labor-chart-col group" data-today={isToday || undefined} data-empty={d.total <= 0 || undefined}>
              <div className="labor-chart-value">{d.total > 0 ? formatValue(d.total) : ""}</div>
              <div className="labor-chart-stack" style={{ height: plotH }}>
                <div
                  className="labor-chart-seg labor-chart-seg--bonus"
                  style={{ height: mounted ? bonusH : 0 }}
                  title={d.bonus > 0 ? `בונוס: ${formatCurrency(d.bonus)}` : undefined}
                />
                <div
                  className="labor-chart-seg labor-chart-seg--topup"
                  style={{ height: mounted ? topupH : 0 }}
                  title={d.topup > 0 ? `השלמות: ${formatCurrency(d.topup)}` : undefined}
                />
                <div
                  className="labor-chart-seg labor-chart-seg--hourly"
                  style={{ height: mounted ? hourlyH : 0 }}
                  title={d.hourly > 0 ? `שכר שעתי: ${formatCurrency(d.hourly)}` : undefined}
                />
              </div>
              <div className="labor-chart-label">{d.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BreakdownPill({
  color,
  icon,
  label,
  value,
  pct,
}: {
  color: string;
  icon: string;
  label: string;
  value: number;
  pct: number;
}) {
  if (value <= 0 && pct <= 0) return null;
  return (
    <div className="labor-breakdown-pill">
      <span className="labor-breakdown-pill-icon" style={{ background: color }}>
        <Icon name={icon} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold text-text-3">{label}</div>
        <div className="text-[15px] font-extrabold tabular-nums text-text">{formatCurrency(value)}</div>
      </div>
      {pct > 0 && <span className="labor-breakdown-pct">{Math.round(pct)}%</span>}
    </div>
  );
}

export function EmployeeCostPanel({
  businessId,
  monthRevenue = 0,
}: {
  businessId: string | null;
  monthRevenue?: number;
}) {
  const now = useMemo(() => new Date(), []);
  const todayISO = useMemo(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [now]);
  const thisMonth = monthKey(now);
  const prevMonth = shiftMonth(thisMonth, -1);
  const upToDay = now.getDate();

  const [granularity, setGranularity] = useState<Granularity>("day");

  const { data: profiles = [] } = useProfiles(businessId);
  const { data: templates = [] } = useShiftTemplates(businessId);
  const { data: attendance = [] } = useAttendanceMonth(businessId, thisMonth);
  const { data: tips = [] } = useTips(businessId, thisMonth);
  const { data: bonuses = [] } = useShiftBonuses(businessId, thisMonth);
  const { data: prevAttendance = [] } = useAttendanceMonth(businessId, prevMonth);
  const { data: prevTips = [] } = useTips(businessId, prevMonth);
  const { data: prevBonuses = [] } = useShiftBonuses(businessId, prevMonth);

  const historyMonths = useMemo(() => {
    const keys: string[] = [];
    for (let i = 5; i >= 0; i--) keys.push(shiftMonth(thisMonth, -i));
    return keys;
  }, [thisMonth]);

  const historyQueries = useQueries({
    queries: historyMonths.slice(0, -1).map((mk) => ({
      queryKey: ["labor_cost_month", businessId, mk],
      enabled: !!businessId && granularity === "month",
      queryFn: () => fetchMonthPayrollData(businessId!, mk),
      staleTime: 60_000,
    })),
  });

  const dailyRaw = useMemo(
    () =>
      aggregateDailyLaborCosts({
        profiles,
        attendance,
        tips,
        bonuses,
        templates,
      }),
    [profiles, attendance, tips, bonuses, templates],
  );

  const prevMonthDailyRaw = useMemo(
    () =>
      aggregateDailyLaborCosts({
        profiles,
        attendance: prevAttendance,
        tips: prevTips,
        bonuses: prevBonuses,
        templates,
      }),
    [profiles, prevAttendance, prevTips, prevBonuses, templates],
  );

  const extendedDailyRaw = useMemo(() => {
    const byDate = new Map<string, DayLaborCost>();
    for (const d of [...prevMonthDailyRaw, ...dailyRaw]) byDate.set(d.date, d);
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyRaw, prevMonthDailyRaw]);

  const dailyFilled = useMemo(
    () => fillMonthDays(dailyRaw, thisMonth, upToDay).map((d) => ({
      ...d,
      label: String(new Date(d.date + "T12:00:00").getDate()),
      highlight: d.date === todayISO,
    })),
    [dailyRaw, thisMonth, upToDay, todayISO],
  );

  const currentWeekStart = weekStartISO(todayISO);

  const currentWeekDays = useMemo(
    () => extendedDailyRaw.filter((d) => weekStartISO(d.date) === currentWeekStart),
    [extendedDailyRaw, currentWeekStart],
  );
  const currentWeekTotal = useMemo(() => sumLaborCosts(currentWeekDays), [currentWeekDays]);

  const currentWeekDaily = useMemo(
    () =>
      fillWeekDays(currentWeekDays, currentWeekStart).map((d) => ({
        ...d,
        highlight: d.date === todayISO,
      })),
    [currentWeekDays, currentWeekStart, todayISO],
  );

  const prevWeekStart = useMemo(() => {
    const d = new Date(currentWeekStart + "T12:00:00");
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [currentWeekStart]);
  const prevWeekTotal = useMemo(() => {
    const days = extendedDailyRaw.filter((d) => weekStartISO(d.date) === prevWeekStart);
    return sumLaborCosts(days).total;
  }, [extendedDailyRaw, prevWeekStart]);
  const weekTrend = pctChange(currentWeekTotal.total, prevWeekTotal);

  const monthSlices = useMemo(() => {
    const daysByMonth = new Map<string, DayLaborCost[]>();
    daysByMonth.set(thisMonth, dailyRaw);
    historyMonths.slice(0, -1).forEach((mk, i) => {
      const q = historyQueries[i];
      if (!q?.data) return;
      const days = aggregateDailyLaborCosts({
        profiles,
        attendance: q.data.attendance,
        tips: q.data.tips,
        bonuses: q.data.bonuses,
        templates,
      });
      daysByMonth.set(mk, days);
    });
    return aggregateByMonth(historyMonths, daysByMonth).map((s, i) => ({
      ...s,
      highlight: i === historyMonths.length - 1,
    }));
  }, [dailyRaw, historyMonths, historyQueries, profiles, templates, thisMonth]);

  const chartData: LaborCostSlice[] =
    granularity === "day" ? dailyFilled : granularity === "week" ? currentWeekDaily : monthSlices;

  const chartTodayISO = granularity === "day" || granularity === "week" ? todayISO : undefined;

  const todayCost = dailyFilled.find((d) => d.date === todayISO) ?? { date: todayISO, hours: 0, hourly: 0, topup: 0, bonus: 0, total: 0 };
  const monthTotal = sumLaborCosts(dailyRaw);
  const prevMonthTotal = useMemo(
    () =>
      sumLaborCosts(
        aggregateDailyLaborCosts({
          profiles,
          attendance: prevAttendance,
          tips: prevTips,
          bonuses: prevBonuses,
          templates,
        }),
      ).total,
    [profiles, prevAttendance, prevTips, prevBonuses, templates],
  );

  const displayBreakdown =
    granularity === "day" ? todayCost : granularity === "week" ? currentWeekTotal : monthTotal;

  const heroTotal =
    granularity === "day" ? todayCost.total : granularity === "week" ? currentWeekTotal.total : monthTotal.total;
  const displayHours = displayBreakdown.hours;
  const avgCostPerHour = displayHours > 0 ? heroTotal / displayHours : 0;
  const breakdownDenom = displayBreakdown.total || 1;
  const hasBreakdownMix =
    [displayBreakdown.hourly, displayBreakdown.topup, displayBreakdown.bonus].filter((v) => v > 0.5).length > 1;

  const yesterdayISO = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [now]);
  const yesterdayCost = dailyFilled.find((d) => d.date === yesterdayISO)?.total ?? 0;
  const dayTrend = pctChange(todayCost.total, yesterdayCost);
  const monthTrend = pctChange(monthTotal.total, prevMonthTotal);
  const laborPct = monthRevenue > 0 ? (monthTotal.total / monthRevenue) * 100 : null;

  const heToday = now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
  const periodLabel =
    granularity === "day"
      ? "היום"
      : granularity === "week"
        ? "השבוע"
        : now.toLocaleDateString("he-IL", { month: "long" });

  const hasData = monthTotal.total > 0 || dailyRaw.some((d) => d.total > 0);

  return (
    <section className="labor-cost-panel dash-rise" style={{ ["--rise-delay" as string]: "60ms" }}>
      <div className="labor-cost-top">
        <div className="labor-cost-top-main">
          <span className="dash-panel-icon">
            <Icon name="payments" size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-extrabold tracking-tight text-text sm:text-[16px]">עלויות שכר</h2>
            <p className="mt-0.5 text-[12px] font-semibold text-text-3">{heToday}</p>
          </div>
        </div>

        <div className="labor-cost-top-actions">
          <div className="labor-granularity" role="tablist" aria-label="תצוגת זמן">
            {(
              [
                ["day", "יום"],
                ["week", "שבוע"],
                ["month", "חודש"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={granularity === key}
                className="labor-granularity-btn"
                data-active={granularity === key || undefined}
                onClick={() => setGranularity(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <Link to="/payroll" className="labor-cost-more">
            פירוט מלא
            <Icon name="chevron_left" size={16} />
          </Link>
        </div>
      </div>

      <div className="labor-cost-body">
        <div className="labor-cost-hero-stat">
          <div className="labor-cost-hero-label">
            {granularity === "day" ? "עלות היום" : granularity === "week" ? "עלות השבוע" : "עלות החודש"}
          </div>
          <div className="labor-cost-hero-row">
            <span className="labor-cost-hero-amount">
              <CountUp value={heroTotal} format={formatCurrency} />
            </span>
            {granularity === "day" && dayTrend != null && <TrendBadge pct={dayTrend} />}
            {granularity === "week" && weekTrend != null && <TrendBadge pct={weekTrend} />}
            {granularity === "month" && monthTrend != null && <TrendBadge pct={monthTrend} />}
          </div>
          <div className="labor-cost-hero-meta">
            {displayHours > 0 && (
              <span className="labor-hours-chip">
                <Icon name="timer" size={14} />
                {fmtHours(displayHours)} שעות
                {avgCostPerHour > 0 && <> · {formatCurrency(avgCostPerHour)}/שעה</>}
              </span>
            )}
            {granularity === "day" && yesterdayCost > 0 && (
              <span className="labor-meta-note">אתמול {formatCurrency(yesterdayCost)}</span>
            )}
            {granularity === "week" && prevWeekTotal > 0 && (
              <span className="labor-meta-note">שבוע קודם {formatCurrency(prevWeekTotal)}</span>
            )}
            {granularity === "month" && prevMonthTotal > 0 && (
              <span className="labor-meta-note">חודש קודם {formatCurrency(prevMonthTotal)}</span>
            )}
            {laborPct != null && laborPct > 0 && (
              <span className="labor-pct-chip">{laborPct.toFixed(1)}% מההכנסות</span>
            )}
          </div>

          {(hasBreakdownMix || displayBreakdown.topup > 0.5 || displayBreakdown.bonus > 0.5) && (
            <div className="labor-breakdown-grid">
              <BreakdownPill
                color="var(--violet-bg)"
                icon="schedule"
                label="משכורות שעתיות"
                value={displayBreakdown.hourly}
                pct={(displayBreakdown.hourly / breakdownDenom) * 100}
              />
              <BreakdownPill
                color="var(--labor-topup-bg)"
                icon="trending_up"
                label="השלמות (טיפים)"
                value={displayBreakdown.topup}
                pct={(displayBreakdown.topup / breakdownDenom) * 100}
              />
              <BreakdownPill
                color="var(--labor-bonus-bg)"
                icon="savings"
                label="בונוס מקופה"
                value={displayBreakdown.bonus}
                pct={(displayBreakdown.bonus / breakdownDenom) * 100}
              />
            </div>
          )}
        </div>

        <div className="labor-cost-chart-wrap">
          <div className="labor-chart-head">
            <span className="labor-chart-title">
              {granularity === "day"
                ? `פירוט יומי · ${periodLabel}`
                : granularity === "week"
                  ? `פירוט יומי · ${formatWeekRange(currentWeekStart)}`
                  : "6 חודשים אחרונים"}
            </span>
            <div className="flex flex-wrap gap-3">
              <span className="labor-legend-item">
                <span className="labor-legend-dot labor-legend-dot--hourly" />
                שעתי
              </span>
              <span className="labor-legend-item">
                <span className="labor-legend-dot labor-legend-dot--topup" />
                השלמה
              </span>
              <span className="labor-legend-item">
                <span className="labor-legend-dot labor-legend-dot--bonus" />
                בונוס
              </span>
            </div>
          </div>

          {hasData || chartData.some((d) => d.total > 0) ? (
            <StackedBarChart
              data={chartData}
              todayISO={chartTodayISO}
              compact={granularity === "week"}
            />
          ) : (
            <div className="labor-cost-empty">
              <span className="labor-cost-empty-icon">
                <Icon name="payments" size={22} />
              </span>
              <p>אין נתוני שכר החודש עדיין</p>
            </div>
          )}
        </div>
      </div>

      <div className="labor-cost-footer">
        <div className="labor-cost-footer-stat">
          <Icon name="calendar_month" size={18} />
          <div>
            <div className="text-[10.5px] font-bold text-text-3">סה״כ החודש</div>
            <div className="text-[16px] font-extrabold tabular-nums text-text">{formatCurrency(monthTotal.total)}</div>
          </div>
        </div>
        <div className="labor-cost-footer-stat">
          <Icon name="avg_pace" size={18} />
          <div>
            <div className="text-[10.5px] font-bold text-text-3">ממוצע יומי</div>
            <div className="text-[16px] font-extrabold tabular-nums text-text">
              {formatCurrency(upToDay > 0 ? monthTotal.total / upToDay : 0)}
            </div>
          </div>
        </div>
        <div className="labor-cost-footer-stat">
          <Icon name="group" size={18} />
          <div>
            <div className="text-[10.5px] font-bold text-text-3">השלמות החודש</div>
            <div className="text-[16px] font-extrabold tabular-nums text-text">{formatCurrency(monthTotal.topup)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
