import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
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

type Granularity = "week" | "month";

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
const SEG_GAP = 2; // px surface gap between stacked segments

function tipHeading(slice: LaborCostSlice): string {
  if (slice.date) {
    return new Date(slice.date + "T12:00:00").toLocaleDateString("he-IL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }
  return slice.label;
}

function TipRow({ cls, label, value }: { cls: string; label: string; value: number }) {
  return (
    <div className="labor-tip-row">
      <span className={`labor-legend-dot labor-legend-dot--${cls}`} />
      <span className="labor-tip-row-label">{label}</span>
      <span className="labor-tip-row-value">{formatCurrency(value)}</span>
    </div>
  );
}

function StackedBarChart({
  data,
  todayISO,
  height = 210,
  formatValue = compactCurrency,
  compact = false,
}: {
  data: LaborCostSlice[];
  todayISO?: string;
  height?: number;
  formatValue?: (n: number) => string;
  compact?: boolean;
}) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [hover, setHover] = useState<{ i: number; cx: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const max = Math.max(1, ...data.map((d) => d.total));
  const valueH = 18;
  const labelH = 20;
  const gap = 6;
  const plotH = Math.max(48, height - valueH - labelH - gap * 2);

  const trackHover = (i: number, el: HTMLElement) => {
    const root = rootRef.current;
    if (!root) return;
    const r = el.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    setHover({ i, cx: r.left - rr.left + r.width / 2 });
  };

  const hi = hover != null ? data[hover.i] : null;
  const rootW = rootRef.current?.getBoundingClientRect().width ?? 0;
  const tipW = 176;
  const tipLeft = hover
    ? Math.min(Math.max(hover.cx, tipW / 2 + 4), Math.max(tipW / 2 + 4, (rootW || hover.cx * 2) - tipW / 2 - 4))
    : 0;

  return (
    <div
      ref={rootRef}
      className="labor-chart"
      style={{ height }}
      dir="rtl"
      data-compact={compact || undefined}
      onPointerLeave={() => setHover(null)}
    >
      <div className="labor-chart-grid" style={{ top: valueH + gap, height: plotH }} aria-hidden>
        <span className="labor-chart-gridline" style={{ bottom: plotH - 1 }} />
        <span className="labor-chart-gridline" style={{ bottom: Math.round(plotH / 2) }} />
        <span className="labor-chart-gridline labor-chart-gridline--base" style={{ bottom: 0 }} />
        <span className="labor-chart-ymax">{formatValue(max)}</span>
      </div>

      <div className="labor-chart-bars" data-hovering={hover != null || undefined}>
        {data.map((d, i) => {
          const isToday = d.highlight || (todayISO && d.date === todayISO);
          const segs = (
            [
              ["bonus", d.bonus],
              ["topup", d.topup],
              ["hourly", d.hourly],
            ] as const
          ).filter(([, v]) => v > 0);
          const totalH = d.total > 0 ? Math.max(6, (d.total / max) * plotH) : 0;
          const avail = Math.max(0, totalH - SEG_GAP * Math.max(0, segs.length - 1));

          return (
            <div
              key={i}
              className="labor-chart-col"
              style={{ ["--i" as string]: i }}
              data-today={isToday || undefined}
              data-empty={d.total <= 0 || undefined}
              data-hover={hover?.i === i || undefined}
              onPointerEnter={(e) => trackHover(i, e.currentTarget)}
              onPointerMove={(e) => trackHover(i, e.currentTarget)}
            >
              <div className="labor-chart-value" style={{ height: valueH }}>
                {d.total > 0 ? formatValue(d.total) : ""}
              </div>
              <div className="labor-chart-stack" style={{ height: plotH }}>
                {d.total > 0 ? (
                  <div className="labor-chart-bar-wrap">
                    {isToday && (
                      <span
                        className="labor-chart-bar-glow"
                        aria-hidden
                        style={{ height: mounted || reduce ? totalH : 0 }}
                      />
                    )}
                    <div className="labor-chart-bar" style={{ height: mounted || reduce ? totalH : 0 }}>
                      {segs.map(([key, v]) => (
                        <div
                          key={key}
                          className={`labor-chart-seg labor-chart-seg--${key}`}
                          style={{ height: (v / d.total) * avail }}
                        />
                      ))}
                      <span className="labor-chart-bar-sheen" aria-hidden />
                    </div>
                  </div>
                ) : (
                  <div className="labor-chart-nub" data-today={isToday || undefined} />
                )}
              </div>
              <div className="labor-chart-label" style={{ height: labelH }}>
                {d.label}
              </div>
            </div>
          );
        })}
      </div>

      {hi && (
        <div className="labor-tip" style={{ left: tipLeft, width: tipW }}>
          <div className="labor-tip-head">{tipHeading(hi)}</div>
          <div className="labor-tip-total">{formatCurrency(hi.total)}</div>
          <div className="labor-tip-rows">
            {hi.total > 0 ? (
              <>
                {hi.hourly > 0 && <TipRow cls="hourly" label="שעתי" value={hi.hourly} />}
                {hi.topup > 0 && <TipRow cls="topup" label="השלמה" value={hi.topup} />}
                {hi.bonus > 0 && <TipRow cls="bonus" label="בונוס" value={hi.bonus} />}
              </>
            ) : (
              <div className="labor-tip-empty">אין עלות שכר ביום זה</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownPill({
  color,
  tint,
  icon,
  label,
  value,
  pct,
}: {
  color: string;
  tint: string;
  icon: string;
  label: string;
  value: number;
  pct: number;
}) {
  if (value <= 0 && pct <= 0) return null;
  return (
    <div className="labor-breakdown-pill">
      <span className="labor-breakdown-pill-icon" style={{ background: tint, color }}>
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

  const [granularity, setGranularity] = useState<Granularity>("week");

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

  const chartData: LaborCostSlice[] = granularity === "week" ? currentWeekDaily : monthSlices;
  const chartTodayISO = granularity === "week" ? todayISO : undefined;

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

  const displayBreakdown = granularity === "week" ? currentWeekTotal : monthTotal;
  const heroTotal = displayBreakdown.total;
  const displayHours = displayBreakdown.hours;
  const avgCostPerHour = displayHours > 0 ? heroTotal / displayHours : 0;
  const breakdownDenom = displayBreakdown.total || 1;
  const hasBreakdownMix =
    [displayBreakdown.hourly, displayBreakdown.topup, displayBreakdown.bonus].filter((v) => v > 0.5).length > 1;

  const monthTrend = pctChange(monthTotal.total, prevMonthTotal);
  const laborPct = monthRevenue > 0 ? (monthTotal.total / monthRevenue) * 100 : null;

  const heToday = now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
  const hasData = monthTotal.total > 0 || dailyRaw.some((d) => d.total > 0);

  return (
    <section className="labor-cost-panel dash-rise" style={{ ["--rise-delay" as string]: "60ms" }}>
      <div className="labor-aura" aria-hidden>
        <span className="labor-aura-blob labor-aura-blob--1" />
        <span className="labor-aura-blob labor-aura-blob--2" />
        <span className="labor-aura-blob labor-aura-blob--3" />
      </div>
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
          <div
            className="labor-granularity"
            role="tablist"
            aria-label="תצוגת זמן"
            style={{ ["--seg" as string]: granularity === "week" ? 0 : 1 }}
          >
            <span className="labor-granularity-thumb" aria-hidden />
            {(
              [
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
        </div>
      </div>

      <div className="labor-cost-body">
        <div className="labor-cost-hero-stat">
          <span className="labor-hero-glow" aria-hidden />
          <span className="labor-hero-sheen" aria-hidden />
          <div className="labor-cost-hero-label">
            {granularity === "week" ? "עלות השבוע" : "עלות החודש"}
          </div>
          <div className="labor-cost-hero-row">
            <span className="labor-cost-hero-amount">
              <CountUp value={heroTotal} format={formatCurrency} />
            </span>
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
                color="var(--labor-hourly)"
                tint="var(--labor-hourly-bg)"
                icon="schedule"
                label="משכורות שעתיות"
                value={displayBreakdown.hourly}
                pct={(displayBreakdown.hourly / breakdownDenom) * 100}
              />
              <BreakdownPill
                color="var(--labor-topup)"
                tint="var(--labor-topup-bg)"
                icon="trending_up"
                label="השלמות (טיפים)"
                value={displayBreakdown.topup}
                pct={(displayBreakdown.topup / breakdownDenom) * 100}
              />
              <BreakdownPill
                color="var(--labor-bonus)"
                tint="var(--labor-bonus-bg)"
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
              {granularity === "week"
                ? `פירוט שבועי · ${formatWeekRange(currentWeekStart)}`
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
