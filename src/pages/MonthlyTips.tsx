import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { Button, EmptyState, ErrorState, Icon, PageLoader } from "@/components/ui";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EASE_OUT } from "@/components/motion/shared-motion";
import { useShiftReports } from "@/api/shiftReports";
import { useShiftTemplates } from "@/api/shifts";
import { useProfiles } from "@/api/users";
import { useAuth } from "@/lib/auth";
import { formatCurrency, useBusinessId } from "@/lib/db";
import { computeTipsHourly } from "@/lib/shiftReportTips";
import {
  HE_DAYS_SHORT,
  HE_MONTHS,
  fmtHours,
  monthLabel,
  monthNow,
  shiftMonth,
} from "@/lib/payrollShiftRows";
import type { Profile, ShiftReport } from "@/types/database";

const WEEKDAY_LONG = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function monthIndex(month: string): number {
  return Number(month.split("-")[1]) - 1;
}

/** ₪1.2k for anything that would otherwise blow a tile's width. */
function compactCurrency(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return "₪" + (n / 1000).toFixed(abs >= 10000 ? 0 : 1) + "k";
  return formatCurrency(n);
}

/** Animated integer — counts up on mount and on every change. */
function useCountUp(value: number, duration = 850): number {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  const from = useRef(0);

  useEffect(() => {
    if (reduce) {
      from.current = value;
      setDisplay(value);
      return;
    }
    const origin = from.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(origin + (value - origin) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduce]);

  return display;
}

/* ------------------------------------------------------------------ *
 * Model
 * ------------------------------------------------------------------ */

interface TipSplit {
  employeeId: string;
  hours: number;
  amount: number;
}

interface ShiftRow {
  id: string;
  report: ShiftReport;
  day: number;
  dow: number;
  title: string;
  /** Shift template colour — the only decorative colour on the page. */
  tone: string | null;
  tips: number;
  hourly: number;
  hours: number;
  sales: number;
  servicePct: number;
  splits: TipSplit[];
}

interface DayCell {
  day: number;
  tips: number;
  count: number;
}

interface LeaderRow {
  id: string;
  tips: number;
  hours: number;
  shifts: number;
}

interface TemplateRow {
  key: string;
  name: string;
  tone: string | null;
  tips: number;
  count: number;
}

type SortKey = "date" | "top";
type Tab = "shifts" | "people";

/* ------------------------------------------------------------------ *
 * Cumulative chart — daily columns + a running-total curve, with the
 * previous month drawn behind it as a ghost. The SVG is stretched with
 * preserveAspectRatio="none", so every stroke carries
 * vector-effect="non-scaling-stroke" and every dot/label is a DOM node
 * positioned in percent instead of an SVG shape (a <circle> would turn
 * into an ellipse). Day 1 sits on the right — the month runs RTL.
 * ------------------------------------------------------------------ */

const CHART_TOP = 12;
const CHART_BOTTOM = 100;
const CHART_BARS = 52;

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Catmull-Rom → cubic bezier, so the running total reads as a curve. */
function smoothPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${round2(points[0][0])} ${round2(points[0][1])}`;
  const t = 0.16;
  let d = `M ${round2(points[0][0])} ${round2(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = clamp(p1[1] + (p2[1] - p0[1]) * t, CHART_TOP - 4, CHART_BOTTOM);
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = clamp(p2[1] - (p3[1] - p1[1]) * t, CHART_TOP - 4, CHART_BOTTOM);
    d += ` C ${round2(c1x)} ${round2(c1y)}, ${round2(c2x)} ${round2(c2y)}, ${round2(p2[0])} ${round2(p2[1])}`;
  }
  return d;
}

/** Running total, normalised to the shared cumulative scale. */
function cumulativePoints(daily: number[], upTo: number, cumMax: number): [number, number][] {
  const n = daily.length;
  const points: [number, number][] = [];
  let sum = 0;
  for (let i = 0; i < upTo && i < n; i++) {
    sum += daily[i];
    const fromStart = ((i + 0.5) / n) * 100;
    const y = CHART_BOTTOM - (cumMax > 0 ? sum / cumMax : 0) * (CHART_BOTTOM - CHART_TOP);
    points.push([100 - fromStart, y]);
  }
  return points;
}

function TipsChart({
  daily,
  prevDaily,
  monthName,
  prevMonthName,
  total,
  prevTotal,
  todayDay,
}: {
  daily: DayCell[];
  prevDaily: number[];
  monthName: string;
  prevMonthName: string;
  total: number;
  prevTotal: number;
  todayDay: number | null;
}) {
  const [active, setActive] = useState<number | null>(null);
  const days = daily.length;

  const geo = useMemo(() => {
    const drawTo = todayDay ? Math.min(todayDay, days) : days;
    const cumMax = Math.max(total, prevTotal, 1);
    const maxDaily = Math.max(1, ...daily.map((d) => d.tips));

    const points = cumulativePoints(
      daily.map((d) => d.tips),
      drawTo,
      cumMax,
    );
    const line = smoothPath(points);
    const area =
      points.length > 1
        ? `${line} L ${round2(points[points.length - 1][0])} ${CHART_BOTTOM} L ${round2(points[0][0])} ${CHART_BOTTOM} Z`
        : "";

    const ghost = prevTotal > 0 ? smoothPath(cumulativePoints(prevDaily, prevDaily.length, cumMax)) : "";

    const tip = points.length > 0 ? points[points.length - 1] : null;

    return { drawTo, maxDaily, line, area, ghost, tip };
  }, [daily, prevDaily, days, total, prevTotal, todayDay]);

  /** Percent from the inline-start edge (RTL → measured from the right). */
  const fromStart = (day: number) => ((day - 0.5) / days) * 100;

  const cell = active ? daily[active - 1] : null;
  const cumUpToActive = active
    ? daily.slice(0, active).reduce((sum, d) => sum + d.tips, 0)
    : 0;
  const activeDays = daily.filter((d) => d.tips > 0).length;

  const ticks = [1, Math.max(2, Math.round(days / 3)), Math.round((days * 2) / 3), days].filter(
    (day, i, arr) => arr.indexOf(day) === i,
  );

  return (
    <div className="tps-chart">
      <div className="tps-chart-head">
        <div className="tps-chart-read" data-on={cell ? true : undefined}>
          <span className="tps-chart-read-k">
            {cell ? `${cell.day} ב${monthName}` : `מצטבר ב${monthName}`}
          </span>
          <b className="tps-chart-read-v">{formatCurrency(cell ? cell.tips : total)}</b>
          <i className="tps-chart-read-s">
            {cell
              ? cell.count > 0
                ? `${cell.count} ${cell.count === 1 ? "משמרת" : "משמרות"} · מצטבר ${compactCurrency(cumUpToActive)}`
                : "לא דווחה משמרת ביום הזה"
              : `${activeDays} ${activeDays === 1 ? "יום" : "ימים"} עם טיפים`}
          </i>
        </div>

        <div className="tps-legend" aria-hidden>
          <span className="tps-legend-item" data-kind="now">
            <i />
            {monthName}
          </span>
          {prevTotal > 0 && (
            <span className="tps-legend-item" data-kind="prev">
              <i />
              {prevMonthName}
            </span>
          )}
        </div>
      </div>

      <div className="tps-chart-stage">
        <svg className="tps-chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="tpsArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.5" />
              <stop offset="70%" stopColor="#34d399" stopOpacity="0.07" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
            </linearGradient>
          </defs>

          <g className="tps-chart-bars">
            {daily.map((d) =>
              d.tips > 0 ? (
                <line
                  key={d.day}
                  className="tps-chart-bar"
                  data-active={active === d.day || undefined}
                  x1={round2(100 - fromStart(d.day))}
                  y1={CHART_BOTTOM}
                  x2={round2(100 - fromStart(d.day))}
                  y2={round2(CHART_BOTTOM - Math.max(4, (d.tips / geo.maxDaily) * CHART_BARS))}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null,
            )}
          </g>

          {geo.ghost && (
            <path className="tps-chart-ghost" d={geo.ghost} fill="none" vectorEffect="non-scaling-stroke" />
          )}
          {geo.area && <path className="tps-chart-area" d={geo.area} fill="url(#tpsArea)" />}
          {geo.line && (
            <path
              className="tps-chart-line"
              d={geo.line}
              fill="none"
              pathLength={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {geo.tip && (
          <span
            className="tps-chart-tip"
            style={
              {
                "--x": 100 - geo.tip[0],
                "--y": geo.tip[1],
              } as CSSProperties
            }
            aria-hidden
          />
        )}

        {active && (
          <span
            className="tps-chart-guide"
            style={{ "--x": fromStart(active) } as CSSProperties}
            aria-hidden
          />
        )}

        <div className="tps-chart-hits" onPointerLeave={() => setActive(null)}>
          {daily.map((d) => (
            <button
              key={d.day}
              type="button"
              className="tps-chart-hit"
              onPointerEnter={() => setActive(d.day)}
              onFocus={() => setActive(d.day)}
              onBlur={() => setActive(null)}
              onClick={() => setActive((cur) => (cur === d.day ? null : d.day))}
              aria-label={`${d.day} ב${monthName}: ${formatCurrency(d.tips)}`}
            />
          ))}
        </div>
      </div>

      <div className="tps-chart-axis" aria-hidden>
        {ticks.map((day) => (
          <span key={day} className="tps-chart-tick" style={{ "--x": fromStart(day) } as CSSProperties}>
            {day}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Hero — full-bleed ink header, shared by mobile and desktop.
 * ------------------------------------------------------------------ */

interface HeroProps {
  month: string;
  onMonth: (month: string) => void;
  atCurrentMonth: boolean;
  total: number;
  shifts: number;
  avgHourly: number;
  avgPerShift: number;
  tipRate: number;
  delta: number | null;
  daily: DayCell[];
  prevDaily: number[];
  prevTotal: number;
  todayDay: number | null;
  tab: Tab;
  onTab: (tab: Tab) => void;
  showTabs: boolean;
  peopleLabel: string;
}

function TipsHero({
  month,
  onMonth,
  atCurrentMonth,
  total,
  shifts,
  avgHourly,
  avgPerShift,
  tipRate,
  delta,
  daily,
  prevDaily,
  prevTotal,
  todayDay,
  tab,
  onTab,
  showTabs,
  peopleLabel,
}: HeroProps) {
  const reduce = useReducedMotion();
  const shownTotal = useCountUp(Math.round(total));

  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, transform: "translateY(10px)" },
          animate: { opacity: 1, transform: "translateY(0)" },
          transition: { duration: 0.34, delay, ease: EASE_OUT },
        };

  const monthName = HE_MONTHS[monthIndex(month)];
  const prevMonthName = HE_MONTHS[monthIndex(shiftMonth(month, -1))];
  const hasChart = daily.some((d) => d.tips > 0) || prevTotal > 0;

  return (
    <header className="tps-hero" aria-label="קופת הטיפים">
      <span className="tps-glow tps-glow--1" data-live={total > 0 || undefined} aria-hidden />
      <span className="tps-glow tps-glow--2" aria-hidden />
      <span className="tps-grid-lines" aria-hidden />

      <div className="tps-hero-inner">
        <motion.div className="tps-hero-bar" {...rise(0)}>
          <span className="tps-kicker">
            <span className="tps-kicker-dot" aria-hidden />
            קופת הטיפים
          </span>
          <Link to="/dashboard" className="tps-back">
            {/* RTL: "back" points right */}
            <Icon name="arrow_forward" size={16} />
            <span>דשבורד</span>
          </Link>
        </motion.div>

        <div className="tps-hero-grid">
          <div className="tps-hero-lead">
            <motion.div className="tps-headline" {...rise(0.05)}>
              <div className="tps-month" role="group" aria-label="בחירת חודש">
                <button
                  type="button"
                  className="tps-month-btn"
                  aria-label="חודש קודם"
                  onClick={() => onMonth(shiftMonth(month, -1))}
                >
                  <Icon name="chevron_right" size={19} />
                </button>
                <span className="tps-month-label">
                  <Icon name="calendar_month" size={15} />
                  {monthLabel(month)}
                </span>
                <button
                  type="button"
                  className="tps-month-btn"
                  aria-label="חודש הבא"
                  disabled={atCurrentMonth}
                  onClick={() => onMonth(shiftMonth(month, 1))}
                >
                  <Icon name="chevron_left" size={19} />
                </button>
              </div>

              <p className="tps-eyebrow">סה״כ שיצא מהקופה ב{monthName}</p>
              <div className="tps-total-row">
                <span className="tps-total">{formatCurrency(shownTotal)}</span>
                {delta !== null && (
                  <span className="tps-delta" data-dir={delta >= 0 ? "up" : "down"}>
                    <Icon name={delta >= 0 ? "trending_up" : "trending_down"} size={15} />
                    {delta >= 0 ? "+" : "−"}
                    {Math.abs(Math.round(delta))}%
                    <i>מול {prevMonthName}</i>
                  </span>
                )}
              </div>
            </motion.div>

            <motion.div className="tps-stats" {...rise(0.12)}>
              <div className="tps-stat">
                <span className="tps-stat-k">
                  <Icon name="receipt_long" size={13} />
                  משמרות
                </span>
                <span className="tps-stat-v">{shifts}</span>
              </div>
              <div className="tps-stat" data-hero>
                <span className="tps-stat-k">
                  <Icon name="timer" size={13} />
                  לשעה
                </span>
                <span className="tps-stat-v">{avgHourly > 0 ? formatCurrency(avgHourly) : "—"}</span>
              </div>
              <div className="tps-stat">
                <span className="tps-stat-k">
                  <Icon name="savings" size={13} />
                  למשמרת
                </span>
                <span className="tps-stat-v">{avgPerShift > 0 ? compactCurrency(avgPerShift) : "—"}</span>
              </div>
              <div className="tps-stat">
                <span className="tps-stat-k">
                  <Icon name="percent" size={13} />
                  מהמכירות
                </span>
                <span className="tps-stat-v">{tipRate > 0 ? `${tipRate.toFixed(1)}%` : "—"}</span>
              </div>
            </motion.div>
          </div>

          {hasChart && (
            <motion.div className="tps-hero-chart" {...rise(0.18)}>
              <TipsChart
                daily={daily}
                prevDaily={prevDaily}
                monthName={monthName}
                prevMonthName={prevMonthName}
                total={total}
                prevTotal={prevTotal}
                todayDay={todayDay}
              />
            </motion.div>
          )}
        </div>

        {showTabs && (
          <div className="tps-tabs" role="tablist" aria-label="תצוגת טיפים" data-i={tab === "shifts" ? 0 : 1}>
            <span className="tps-tabs-thumb" aria-hidden />
            <button
              type="button"
              role="tab"
              className="tps-tab"
              aria-selected={tab === "shifts"}
              onClick={() => onTab("shifts")}
            >
              <Icon name="list_alt" size={16} />
              לפי משמרת
            </button>
            <button
              type="button"
              role="tab"
              className="tps-tab"
              aria-selected={tab === "people"}
              onClick={() => onTab("people")}
            >
              <Icon name="insights" size={16} />
              {peopleLabel}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * One shift — collapsed row that opens into the pool split.
 * ------------------------------------------------------------------ */

function ShiftCard({
  row,
  open,
  onToggle,
  share,
  isBest,
  canManage,
  nameOf,
  avatarOf,
  onOpenReport,
}: {
  row: ShiftRow;
  open: boolean;
  onToggle: () => void;
  share: number;
  isBest: boolean;
  canManage: boolean;
  nameOf: (id: string) => string;
  avatarOf: (id: string) => string | null;
  onOpenReport: () => void;
}) {
  const topSplit = row.splits.length > 0 ? row.splits[0].amount : 0;

  return (
    <article
      className="tps-card"
      data-open={open || undefined}
      data-zero={row.tips <= 0 || undefined}
      style={{ "--tps-tone": row.tone ?? "var(--success)" } as CSSProperties}
    >
      <button
        type="button"
        className="tps-card-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${row.title}, ${row.day} בחודש, ${formatCurrency(row.tips)}`}
      >
        <span className="tps-date" aria-hidden>
          <b>{row.day}</b>
          <i>{HE_DAYS_SHORT[row.dow]}</i>
        </span>

        <span className="tps-card-mid">
          <span className="tps-card-titles">
            <span className="tps-card-title">{row.title}</span>
            {isBest && (
              <span className="tps-best">
                <Icon name="workspace_premium" size={12} />
                שיא החודש
              </span>
            )}
          </span>
          <span className="tps-card-sub">
            יום {WEEKDAY_LONG[row.dow]}
            {row.report.manager_names ? ` · ${row.report.manager_names}` : ""}
          </span>
          <span className="tps-card-chips">
            {row.hourly > 0 && (
              <span>
                <Icon name="timer" size={12} />
                {formatCurrency(row.hourly)}/ש׳
              </span>
            )}
            {row.splits.length > 0 && (
              <span>
                <Icon name="groups" size={12} />
                {row.splits.length}
              </span>
            )}
            {row.sales > 0 && (
              <span>
                <Icon name="point_of_sale" size={12} />
                {compactCurrency(row.sales)}
              </span>
            )}
          </span>
          <span className="tps-meter" aria-hidden>
            <i style={{ width: `${Math.max(row.tips > 0 ? 4 : 0, share)}%` }} />
          </span>
        </span>

        <span className="tps-card-end">
          <span className="tps-card-amount">{formatCurrency(row.tips)}</span>
          <span className="tps-card-chev" aria-hidden>
            <Icon name="expand_more" size={18} />
          </span>
        </span>
      </button>

      <div className="tps-panel">
        <div className="tps-panel-in">
          <div className="tps-facts">
            <div className="tps-fact">
              <span className="tps-fact-k">
                <Icon name="point_of_sale" size={13} />
                מכירות
              </span>
              <span className="tps-fact-v">{row.sales > 0 ? formatCurrency(row.sales) : "—"}</span>
            </div>
            <div className="tps-fact">
              <span className="tps-fact-k">
                <Icon name="percent" size={13} />
                אחוז שירות
              </span>
              <span className="tps-fact-v">{row.servicePct > 0 ? `${row.servicePct}%` : "—"}</span>
            </div>
            <div className="tps-fact">
              <span className="tps-fact-k">
                <Icon name="schedule" size={13} />
                שעות בקופה
              </span>
              <span className="tps-fact-v">{row.hours > 0 ? `${fmtHours(row.hours)}ש׳` : "—"}</span>
            </div>
            <div className="tps-fact">
              <span className="tps-fact-k">
                <Icon name="payments" size={13} />
                לשעה
              </span>
              <span className="tps-fact-v">{row.hourly > 0 ? formatCurrency(row.hourly) : "—"}</span>
            </div>
          </div>

          {row.splits.length > 0 ? (
            <div className="tps-split">
              <div className="tps-split-head">
                <Icon name="groups" size={14} />
                חלוקת הקופה
                <span>{row.splits.length}</span>
              </div>
              <ul className="tps-split-list">
                {row.splits.map((split) => (
                  <li key={split.employeeId} className="tps-split-row">
                    <UserAvatar
                      userId={split.employeeId}
                      name={nameOf(split.employeeId)}
                      avatarUrl={avatarOf(split.employeeId)}
                      size={30}
                      rounded="circle"
                    />
                    <span className="tps-split-name">{nameOf(split.employeeId)}</span>
                    <span className="tps-split-hours">{fmtHours(split.hours)}ש׳</span>
                    {canManage && <span className="tps-split-amt">{formatCurrency(split.amount)}</span>}
                    <span className="tps-split-bar" aria-hidden>
                      <i style={{ width: `${topSplit > 0 ? (split.amount / topSplit) * 100 : 0}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="tps-split-empty">
              <Icon name="person_off" size={15} />
              לא נרשמו עובדים על טיפים במשמרת הזו
            </p>
          )}

          {canManage && (
            <button type="button" className="tps-panel-link" onClick={onOpenReport}>
              <Icon name="receipt_long" size={15} />
              לדוח המשמרת המלא
              <Icon name="chevron_left" size={16} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * Insight boards — the rail on desktop, the second tab on mobile.
 * ------------------------------------------------------------------ */

function Board({
  icon,
  title,
  sub,
  children,
}: {
  icon: string;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className="tps-board">
      <header className="tps-board-head">
        <span className="tps-board-icon" aria-hidden>
          <Icon name={icon} size={16} />
        </span>
        <div className="tps-board-titles">
          <h2 className="tps-board-title">{title}</h2>
          <p className="tps-board-sub">{sub}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export function MonthlyTips() {
  const businessId = useBusinessId();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [month, setMonth] = useState(monthNow());
  const [tab, setTab] = useState<Tab>("shifts");
  const [sort, setSort] = useState<SortKey>("date");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const prevMonth = useMemo(() => shiftMonth(month, -1), [month]);

  const { data: reports = [], isLoading, isError, refetch } = useShiftReports(businessId, month);
  const { data: prevReports = [] } = useShiftReports(businessId, prevMonth);
  const { data: templates = [] } = useShiftTemplates(businessId);
  const { data: profiles = [] } = useProfiles(businessId);

  const canManage = !!profile && ["manager", "shift_manager", "office_manager"].includes(profile.role);

  const templateById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);
  const profileById = useMemo(
    () => new Map<string, Profile>(profiles.map((p) => [p.id, p])),
    [profiles],
  );
  const nameOf = (id: string) => profileById.get(id)?.full_name ?? "עובד";
  const avatarOf = (id: string) => profileById.get(id)?.avatar_url ?? null;

  /* ---- rows ---- */
  const rows = useMemo<ShiftRow[]>(
    () =>
      reports.map((report) => {
        const date = new Date(report.report_date + "T12:00:00");
        const participants = report.extra?.tip_participants ?? report.extra?.team_members ?? [];
        const tips = Number(report.total_tips) || 0;
        const hours = participants.reduce((sum, p) => sum + (Number(p.hours) || 0), 0);
        /* Older reports may predate tips_hourly — fall back to the same split
           the report editor would have written. */
        const hourly = Number(report.tips_hourly) || computeTipsHourly(tips, participants);
        const template = report.shift_template_id ? templateById.get(report.shift_template_id) : undefined;

        return {
          id: report.id,
          report,
          day: date.getDate(),
          dow: date.getDay(),
          title: template?.name || "משמרת",
          tone: template?.color ?? null,
          tips,
          hourly,
          hours,
          sales: Number(report.total_sales) || 0,
          servicePct: Number(report.service_pct) || 0,
          splits: participants
            .filter((p) => p.employee_id && (Number(p.hours) || 0) > 0)
            .map((p) => ({
              employeeId: p.employee_id,
              hours: Number(p.hours) || 0,
              amount: hourly * (Number(p.hours) || 0),
            }))
            .sort((a, b) => b.amount - a.amount),
        };
      }),
    [reports, templateById],
  );

  /* ---- month model ---- */
  const model = useMemo(() => {
    const length = daysInMonth(month);
    const daily: DayCell[] = Array.from({ length }, (_, i) => ({ day: i + 1, tips: 0, count: 0 }));

    let total = 0;
    let hours = 0;
    let sales = 0;
    const weekday = Array.from({ length: 7 }, () => ({ tips: 0, count: 0 }));
    const perEmployee = new Map<string, LeaderRow>();
    const perTemplate = new Map<string, TemplateRow>();

    for (const row of rows) {
      total += row.tips;
      hours += row.hours;
      sales += row.sales;

      const cell = daily[row.day - 1];
      if (cell) {
        cell.tips += row.tips;
        cell.count += 1;
      }

      weekday[row.dow].tips += row.tips;
      weekday[row.dow].count += 1;

      for (const split of row.splits) {
        const cur = perEmployee.get(split.employeeId) ?? {
          id: split.employeeId,
          tips: 0,
          hours: 0,
          shifts: 0,
        };
        cur.tips += split.amount;
        cur.hours += split.hours;
        cur.shifts += 1;
        perEmployee.set(split.employeeId, cur);
      }

      const key = row.report.shift_template_id ?? "none";
      const bucket = perTemplate.get(key) ?? {
        key,
        name: row.title,
        tone: row.tone,
        tips: 0,
        count: 0,
      };
      bucket.tips += row.tips;
      bucket.count += 1;
      perTemplate.set(key, bucket);
    }

    const best = rows.reduce<ShiftRow | null>(
      (top, row) => (row.tips > 0 && (!top || row.tips > top.tips) ? row : top),
      null,
    );

    return {
      daily,
      total,
      hours,
      sales,
      avgHourly: hours > 0 ? total / hours : 0,
      avgPerShift: rows.length > 0 ? total / rows.length : 0,
      tipRate: sales > 0 ? (total / sales) * 100 : 0,
      maxTips: best?.tips ?? 0,
      bestId: rows.length > 1 ? best?.id : undefined,
      weekday,
      leaders: [...perEmployee.values()].sort((a, b) => b.tips - a.tips),
      byTemplate: [...perTemplate.values()].sort((a, b) => b.tips - a.tips),
    };
  }, [rows, month]);

  /* ---- previous month, for the ghost curve and the delta chip ---- */
  const prevDaily = useMemo(() => {
    const length = daysInMonth(prevMonth);
    const daily = Array.from({ length }, () => 0);
    for (const report of prevReports) {
      const day = new Date(report.report_date + "T12:00:00").getDate();
      if (daily[day - 1] !== undefined) daily[day - 1] += Number(report.total_tips) || 0;
    }
    return daily;
  }, [prevReports, prevMonth]);

  const atCurrentMonth = month >= monthNow();
  const todayDay = month === monthNow() ? new Date().getDate() : null;
  const prevTotal = prevDaily.reduce((sum, n) => sum + n, 0);
  /* Mid-month the honest comparison is "same point last month", not the whole
     month — otherwise every running month looks like a collapse. */
  const prevBenchmark = todayDay
    ? prevDaily.slice(0, todayDay).reduce((sum, n) => sum + n, 0)
    : prevTotal;
  const delta =
    prevBenchmark > 0 && model.total > 0 ? ((model.total - prevBenchmark) / prevBenchmark) * 100 : null;

  /* ---- feed ---- */
  const visible = useMemo(() => {
    const q = query.trim();
    const list = q
      ? rows.filter(
          (row) =>
            row.title.includes(q) ||
            (row.report.manager_names ?? "").includes(q) ||
            String(row.day) === q ||
            row.splits.some((split) => nameOf(split.employeeId).includes(q)),
        )
      : rows;

    return [...list].sort((a, b) =>
      sort === "top"
        ? b.tips - a.tips || b.day - a.day
        : b.day - a.day || b.report.created_at.localeCompare(a.report.created_at),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, sort, profileById]);

  const maxWeekday = Math.max(1, ...model.weekday.map((d) => d.tips));
  const topLeader = model.leaders.length > 0 ? model.leaders[0].tips : 0;
  const hasBoards = model.leaders.length > 0 || model.byTemplate.length > 0;

  if (isLoading) return <PageLoader label="טוען טיפים..." />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const hasRows = rows.length > 0;

  return (
    <div className="tps-page page-enter" data-tab={tab}>
      <TipsHero
        month={month}
        onMonth={(next) => {
          setMonth(next);
          setOpenId(null);
        }}
        atCurrentMonth={atCurrentMonth}
        total={model.total}
        shifts={rows.length}
        avgHourly={model.avgHourly}
        avgPerShift={model.avgPerShift}
        tipRate={model.tipRate}
        delta={delta}
        daily={model.daily}
        prevDaily={prevDaily}
        prevTotal={prevTotal}
        todayDay={todayDay}
        tab={tab}
        onTab={setTab}
        showTabs={hasRows && hasBoards}
        peopleLabel={canManage && model.leaders.length > 0 ? "מי הרוויח" : "פילוח"}
      />

      <div className="tps-body">
        <section className="tps-feed" aria-label="משמרות החודש">
          {!hasRows ? (
            <EmptyState
              icon="savings"
              title={`אין דוחות משמרת ב${HE_MONTHS[monthIndex(month)]}`}
              description="ברגע שיוזנו דוחות סגירת משמרת עם קופת טיפים — הן יופיעו כאן, משמרת אחר משמרת, כולל החלוקה בין העובדים."
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
              <div className="tps-toolbar">
                <div className="tps-search">
                  <Icon name="search" size={18} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="משמרת, אחמ״ש או עובד"
                    aria-label="חיפוש במשמרות"
                  />
                  {query && (
                    <button type="button" onClick={() => setQuery("")} aria-label="ניקוי חיפוש">
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>

                <div className="tps-sort" role="group" aria-label="מיון">
                  <button
                    type="button"
                    className="tps-sort-btn"
                    aria-pressed={sort === "date"}
                    data-active={sort === "date" || undefined}
                    onClick={() => setSort("date")}
                  >
                    <Icon name="calendar_month" size={15} />
                    <span>תאריך</span>
                  </button>
                  <button
                    type="button"
                    className="tps-sort-btn"
                    aria-pressed={sort === "top"}
                    data-active={sort === "top" || undefined}
                    onClick={() => setSort("top")}
                  >
                    <Icon name="trending_up" size={15} />
                    <span>הכי גבוה</span>
                  </button>
                </div>
              </div>

              {visible.length === 0 ? (
                <p className="tps-none">
                  <Icon name="search_off" size={18} />
                  לא נמצאה משמרת שמתאימה לחיפוש
                </p>
              ) : (
                <div className="tps-list">
                  {visible.map((row, i) => (
                    <div
                      key={row.id}
                      className="tps-list-item"
                      style={{ "--i": Math.min(i, 12) } as CSSProperties}
                    >
                      <ShiftCard
                        row={row}
                        open={openId === row.id}
                        onToggle={() => setOpenId((cur) => (cur === row.id ? null : row.id))}
                        share={model.maxTips > 0 ? (row.tips / model.maxTips) * 100 : 0}
                        isBest={model.bestId === row.id}
                        canManage={canManage}
                        nameOf={nameOf}
                        avatarOf={avatarOf}
                        onOpenReport={() => navigate("/shift-reports")}
                      />
                    </div>
                  ))}
                </div>
              )}

              {canManage && (
                <Link to="/shift-reports" className="tps-all">
                  <Icon name="receipt_long" size={16} />
                  לכל דוחות המשמרת
                  <Icon name="chevron_left" size={16} />
                </Link>
              )}
            </>
          )}
        </section>

        {hasRows && hasBoards && (
          <aside className="tps-rail" aria-label="פילוח הקופה">
            <div className="tps-rail-inner">
              {canManage && model.leaders.length > 0 && (
                <Board icon="leaderboard" title="מי הרוויח" sub="חלוקת הקופה בין העובדים החודש">
                  <ol className="tps-lead">
                    {model.leaders.map((leader, i) => (
                      <li key={leader.id} className="tps-lead-row" data-rank={i < 3 ? i + 1 : undefined}>
                        <span className="tps-lead-rank" aria-hidden>
                          {i + 1}
                        </span>
                        <UserAvatar
                          userId={leader.id}
                          name={nameOf(leader.id)}
                          avatarUrl={avatarOf(leader.id)}
                          size={32}
                          rounded="circle"
                        />
                        <span className="tps-lead-name">{nameOf(leader.id)}</span>
                        <span className="tps-lead-amt">{formatCurrency(leader.tips)}</span>
                        <span className="tps-lead-meta">
                          {leader.shifts} {leader.shifts === 1 ? "משמרת" : "משמרות"} · {fmtHours(leader.hours)}
                          ש׳
                        </span>
                        <span className="tps-lead-bar" aria-hidden>
                          <i style={{ width: `${topLeader > 0 ? (leader.tips / topLeader) * 100 : 0}%` }} />
                        </span>
                      </li>
                    ))}
                  </ol>
                </Board>
              )}

              <Board icon="calendar_view_week" title="לפי יום בשבוע" sub="מתי הקופה מתמלאת הכי מהר">
                <div className="tps-week">
                  {model.weekday.map((day, i) => (
                    <div
                      key={i}
                      className="tps-week-col"
                      data-best={day.tips > 0 && day.tips === maxWeekday ? true : undefined}
                    >
                      <span className="tps-week-track" aria-hidden>
                        <i style={{ height: `${day.tips > 0 ? Math.max(6, (day.tips / maxWeekday) * 100) : 0}%` }} />
                      </span>
                      <span className="tps-week-day">{HE_DAYS_SHORT[i]}</span>
                      <span className="tps-week-val">{day.tips > 0 ? compactCurrency(day.tips) : "—"}</span>
                    </div>
                  ))}
                </div>
              </Board>

              {model.byTemplate.length > 0 && (
                <Board icon="donut_small" title="לפי סוג משמרת" sub="מאיפה מגיעה הקופה">
                  <ul className="tps-mix">
                    {model.byTemplate.map((bucket) => (
                      <li
                        key={bucket.key}
                        className="tps-mix-row"
                        style={{ "--tps-tone": bucket.tone ?? "var(--success)" } as CSSProperties}
                      >
                        <span className="tps-mix-dot" aria-hidden />
                        <span className="tps-mix-name">{bucket.name}</span>
                        <span className="tps-mix-count">
                          {bucket.count} {bucket.count === 1 ? "משמרת" : "משמרות"}
                        </span>
                        <span className="tps-mix-amt">{formatCurrency(bucket.tips)}</span>
                        <span className="tps-mix-bar" aria-hidden>
                          <i style={{ width: `${model.total > 0 ? (bucket.tips / model.total) * 100 : 0}%` }} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </Board>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
