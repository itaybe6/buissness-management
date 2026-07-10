import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useBusinessId, formatCurrency, initialsOf, colorFor } from "@/lib/db";
import { useBusiness } from "@/api/businesses";
import { useShiftReports } from "@/api/shiftReports";
import { useProfiles } from "@/api/users";
import { useTasks } from "@/api/tasks";
import { useFaults } from "@/api/faults";
import { useInventory } from "@/api/inventory";
import { useWaste } from "@/api/waste";
import { useAttendanceToday } from "@/api/attendance";
import { Icon } from "@/components/ui";
import type { FeatureKey } from "@/types/database";
import { AreaChart, BarChart, CountUp, DonutChart, RadialGauge } from "./charts";

/* ----------------------------- helpers ----------------------------- */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function compactCurrency(n: number): string {
  if (Math.abs(n) >= 1000) return "₪" + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return "₪" + Math.round(n).toLocaleString("he-IL");
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "לילה טוב";
  if (h < 12) return "בוקר טוב";
  if (h < 18) return "צהריים טובים";
  return "ערב טוב";
}

const WD_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

function Trend({ pct }: { pct: number | null }) {
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

/* ----------------------------- KPI card ----------------------------- */
interface Kpi {
  key: string;
  icon: string;
  label: string;
  value: number;
  format: (n: number) => string;
  color: string;
  tint: string;
  sub?: ReactNode;
  to?: string;
}

function KpiCard({ kpi, delay }: { kpi: Kpi; delay: number }) {
  const body = (
    <>
      <div className="relative flex items-center justify-between">
        <span className="dash-kpi-icon grid h-10 w-10 place-items-center rounded-[11px]" style={{ background: kpi.tint, color: kpi.color }}>
          <Icon name={kpi.icon} size={21} />
        </span>
        {kpi.to && <Icon name="chevron_left" size={18} className="dash-kpi-go text-text-3" />}
      </div>
      <div className="relative mt-3">
        <div className="text-[12px] font-bold text-text-3">{kpi.label}</div>
        <div className="mt-0.5 text-[24px] font-extrabold leading-tight tracking-tight tabular-nums text-text">
          <CountUp value={kpi.value} format={kpi.format} />
        </div>
        {kpi.sub && <div className="mt-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-text-2">{kpi.sub}</div>}
      </div>
    </>
  );
  const className = "dash-kpi dash-rise p-4";
  const style = {
    ["--rise-delay" as string]: `${delay}ms`,
    ["--kpi-color" as string]: kpi.color,
  } as React.CSSProperties;
  return kpi.to ? (
    <Link to={kpi.to} className={className} style={style}>
      {body}
    </Link>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  );
}

/* ----------------------------- panel shell ----------------------------- */
function Panel({
  title,
  icon,
  to,
  span,
  delay,
  children,
}: {
  title: string;
  icon: string;
  to?: string;
  span: string;
  delay: number;
  children: ReactNode;
}) {
  return (
    <section className={`dash-panel dash-rise ${span}`} style={{ ["--rise-delay" as string]: `${delay}ms` } as React.CSSProperties}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="dash-panel-icon">
            <Icon name={icon} size={17} />
          </span>
          <h3 className="text-[14.5px] font-extrabold tracking-tight text-text">{title}</h3>
        </div>
        {to && (
          <Link to={to} className="dash-panel-more flex items-center gap-0.5 text-[12px] font-bold text-text-3 transition-colors hover:text-accent-2">
            הצג הכל
            <Icon name="chevron_left" size={16} />
          </Link>
        )}
      </div>
      <div className="p-5 pt-4">{children}</div>
    </section>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: color }} />
      <span className="flex-1 text-[12.5px] font-semibold text-text-2">{label}</span>
      <span className="text-[13px] font-extrabold tabular-nums text-text">{value}</span>
    </div>
  );
}

/* ============================================================ */
export function ManagerDashboard() {
  const businessId = useBusinessId();
  const { profile, features } = useAuth();
  const on = (k: FeatureKey) => features.has(k);

  const now = useMemo(() => new Date(), []);
  const thisMonth = monthKey(now);
  const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const { data: business } = useBusiness(businessId);
  const { data: reports = [] } = useShiftReports(businessId, thisMonth);
  const { data: prevReports = [] } = useShiftReports(businessId, lastMonth);
  const { data: profiles = [] } = useProfiles(businessId);
  const { data: tasks = [] } = useTasks(businessId);
  const { data: faults = [] } = useFaults(businessId);
  const { data: inventory = [] } = useInventory(businessId);
  const { data: waste = [] } = useWaste(businessId);
  const { data: attendance = [] } = useAttendanceToday(businessId);

  /* ---------- revenue ---------- */
  const revenue = reports.reduce((s, r) => s + (Number(r.total_sales) || 0), 0);
  const prevRevenue = prevReports.reduce((s, r) => s + (Number(r.total_sales) || 0), 0);
  const revenueTrend = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;
  const tips = reports.reduce((s, r) => s + (Number(r.total_tips) || 0), 0);
  const deliverySales = reports.reduce((s, r) => s + (Number(r.delivery_sales) || 0), 0);
  const deliveryShare = revenue > 0 ? deliverySales / revenue : 0;
  const avgPerShift = reports.length > 0 ? revenue / reports.length : 0;

  // daily series (month-to-date)
  const sameMonthAsNow = true;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const upTo = sameMonthAsNow ? now.getDate() : daysInMonth;
  const dailyRevenue = useMemo(() => {
    const arr = Array.from({ length: upTo }, () => 0);
    reports.forEach((r) => {
      const d = new Date(r.report_date + "T00:00:00").getDate();
      if (d >= 1 && d <= upTo) arr[d - 1] += Number(r.total_sales) || 0;
    });
    return arr;
  }, [reports, upTo]);
  // sales by weekday (average)
  const weekdayBars = useMemo(() => {
    const sum = Array(7).fill(0);
    const cnt = Array(7).fill(0);
    reports.forEach((r) => {
      const day = new Date(r.report_date + "T00:00:00").getDay();
      sum[day] += Number(r.total_sales) || 0;
      cnt[day] += 1;
    });
    const avg = sum.map((s, i) => (cnt[i] ? s / cnt[i] : 0));
    const max = Math.max(...avg);
    return avg.map((v, i) => ({ label: WD_LETTERS[i], value: v, highlight: v > 0 && v === max }));
  }, [reports]);

  // team energy
  const energyVals = reports.map((r) => r.energy_level).filter((e): e is number => e != null && e > 0);
  const avgEnergy = energyVals.length ? energyVals.reduce((s, e) => s + e, 0) / energyVals.length : 0;

  /* ---------- people ---------- */
  const profilesById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const activeEmployees = profiles.filter((p) => p.active && p.role !== "super_admin").length;
  const onShift = attendance.filter((a) => a.clock_in && !a.clock_out);
  const onShiftPeople = onShift.map((a) => profilesById.get(a.employee_id)).filter(Boolean);

  /* ---------- tasks ---------- */
  const taskDone = tasks.filter((t) => t.status === "done").length;
  const taskProg = tasks.filter((t) => t.status === "in_progress").length;
  const taskOpen = tasks.filter((t) => t.status === "open").length;
  const taskTotal = tasks.length;
  const completion = taskTotal ? Math.round((taskDone / taskTotal) * 100) : 0;

  /* ---------- faults ---------- */
  const faultNeeds = faults.filter((f) => f.status === "needs_handling").length;
  const faultProg = faults.filter((f) => f.status === "in_progress").length;
  const faultHandled = faults.filter((f) => f.status === "handled").length;
  const faultOpen = faultNeeds + faultProg;
  const faultTotal = faults.length;

  /* ---------- inventory ---------- */
  const tracked = inventory.filter((i) => i.min_quantity > 0);
  const lowStock = inventory
    .filter((i) => i.min_quantity > 0 && i.current_qty <= i.min_quantity)
    .sort((a, b) => a.current_qty - a.min_quantity - (b.current_qty - b.min_quantity));
  const stockHealth = tracked.length ? (tracked.length - lowStock.length) / tracked.length : 1;
  const wasteThisMonth = waste.filter((w) => monthKey(new Date(w.created_at)) === thisMonth);
  const wasteCount = wasteThisMonth.length;

  /* ---------- KPI list (feature-aware) ---------- */
  const kpis: Kpi[] = [];
  if (on("shift_reports")) {
    kpis.push({
      key: "tips",
      icon: "volunteer_activism",
      label: "טיפים החודש",
      value: tips,
      format: formatCurrency,
      color: "var(--success)",
      tint: "var(--success-bg)",
      sub: <span>ממוצע {compactCurrency(avgPerShift)} למשמרת</span>,
    });
    kpis.push({
      key: "shifts",
      icon: "receipt_long",
      label: "משמרות שדווחו",
      value: reports.length,
      format: (n) => Math.round(n).toString(),
      color: "var(--info)",
      tint: "var(--info-bg)",
      to: "/shift-reports",
      sub: <span>{Math.round(deliveryShare * 100)}% משלוחים</span>,
    });
  }
  kpis.push({
    key: "employees",
    icon: "groups",
    label: "עובדים פעילים",
    value: activeEmployees,
    format: (n) => Math.round(n).toString(),
    color: "var(--accent-2)",
    tint: "var(--violet-bg)",
    to: "/users",
    sub:
      onShiftPeople.length > 0 ? (
        <>
          <span className="dash-live-dot" />
          <span>{onShiftPeople.length} במשמרת כעת</span>
        </>
      ) : (
        <span>אין עובדים במשמרת כעת</span>
      ),
  });
  if (on("tasks")) {
    kpis.push({
      key: "tasks",
      icon: "checklist",
      label: "משימות פתוחות",
      value: taskOpen + taskProg,
      format: (n) => Math.round(n).toString(),
      color: "var(--warning)",
      tint: "var(--warning-bg)",
      to: "/tasks",
      sub: <span>{completion}% הושלמו מתוך {taskTotal}</span>,
    });
  }
  if (on("faults")) {
    kpis.push({
      key: "faults",
      icon: "build",
      label: "תקלות פתוחות",
      value: faultOpen,
      format: (n) => Math.round(n).toString(),
      color: "var(--danger)",
      tint: "var(--danger-bg)",
      to: "/faults",
      sub: faultNeeds > 0 ? <span>{faultNeeds} דורשות טיפול מיידי</span> : <span>הכול תחת שליטה</span>,
    });
  }
  if (on("inventory")) {
    kpis.push({
      key: "stock",
      icon: "inventory_2",
      label: "מוצרים במלאי נמוך",
      value: lowStock.length,
      format: (n) => Math.round(n).toString(),
      color: "var(--accent)",
      tint: "var(--accent-tint)",
      to: "/inventory",
      sub: <span>מתוך {inventory.length} מוצרים</span>,
    });
  }

  const heMonth = now.toLocaleDateString("he-IL", { month: "long" });
  const heToday = now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? "";

  return (
    <div className="w-full space-y-4 xl:space-y-5">
      {/* ---------------- Hero ---------------- */}
      <header className="dash-hero dash-rise p-5 sm:p-6 md:p-7 xl:p-8">
        <div className="dash-hero-glow" />
        <div className="dash-hero-aurora dash-hero-aurora--1" />
        <div className="dash-hero-aurora dash-hero-aurora--2" />
        <div className="dash-hero-grid" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="hidden min-w-0 md:block">
            <div className="flex items-center gap-2 text-[12.5px] font-bold text-white/60">
              <Icon name="calendar_today" size={15} />
              {heToday}
            </div>
            <h1 className="mt-2 text-[26px] font-extrabold tracking-tight text-white md:text-[30px]">
              {greeting()}{firstName ? `, ${firstName}` : ""} 👋
            </h1>
            <p className="mt-1 text-[13.5px] font-medium text-white/65">
              הנה התמונה המלאה של {business?.name ?? "העסק"} — מבט-על על הביצועים ב{heMonth}.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {on("attendance") && (
                <Link to="/attendance" className="dash-hero-chip">
                  <span className="dash-live-dot" />
                  <strong>{onShiftPeople.length}</strong> במשמרת כעת
                </Link>
              )}
              {on("tasks") && taskOpen + taskProg > 0 && (
                <Link to="/tasks" className="dash-hero-chip">
                  <Icon name="checklist" size={15} />
                  <strong>{taskOpen + taskProg}</strong> משימות פתוחות
                </Link>
              )}
              {on("faults") && faultOpen > 0 && (
                <Link to="/faults" className="dash-hero-chip" data-tone="danger">
                  <Icon name="build" size={15} />
                  <strong>{faultOpen}</strong> תקלות
                </Link>
              )}
              {on("inventory") && lowStock.length > 0 && (
                <Link to="/inventory" className="dash-hero-chip" data-tone="warning">
                  <Icon name="inventory_2" size={15} />
                  <strong>{lowStock.length}</strong> במלאי נמוך
                </Link>
              )}
            </div>
          </div>

          {on("shift_reports") && (
            <div className="flex flex-none items-end gap-5">
              <div className="text-right">
                <div className="text-[12px] font-bold uppercase tracking-wide text-white/55">הכנסות החודש</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[34px] font-extrabold leading-none tracking-tight text-white md:text-[40px]">
                    <CountUp value={revenue} format={formatCurrency} />
                  </span>
                  {revenueTrend != null && <Trend pct={revenueTrend} />}
                </div>
                <div className="mt-1.5 text-[12px] font-semibold text-white/55">
                  {revenueTrend != null
                    ? `${revenueTrend >= 0 ? "עלייה" : "ירידה"} לעומת ${compactCurrency(prevRevenue)} בחודש שעבר`
                    : "אין נתוני השוואה לחודש קודם"}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ---------------- KPI row ---------------- */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((kpi, i) => (
            <KpiCard key={kpi.key} kpi={kpi} delay={80 + i * 55} />
          ))}
        </div>
      )}

      {/* ---------------- Main grid ---------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Revenue trend */}
        {on("shift_reports") && (
          <Panel title={`מגמת הכנסות — ${heMonth}`} icon="show_chart" to="/shift-reports" span="lg:col-span-8" delay={140}>
            {revenue > 0 ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div>
                    <div className="text-[11px] font-bold text-text-3">סה״כ מכירות</div>
                    <div className="text-[19px] font-extrabold tabular-nums text-text">{formatCurrency(revenue)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-text-3">ממוצע יומי</div>
                    <div className="text-[19px] font-extrabold tabular-nums text-text">{compactCurrency(revenue / upTo)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-text-3">משלוחים</div>
                    <div className="text-[19px] font-extrabold tabular-nums text-text">{Math.round(deliveryShare * 100)}%</div>
                  </div>
                </div>
                <AreaChart
                  data={dailyRevenue.map((v, i) => ({ label: String(i + 1), value: v }))}
                  formatValue={compactCurrency}
                />
              </>
            ) : (
              <EmptyPanel icon="show_chart" text="אין דוחות משמרת החודש עדיין — ההכנסות יופיעו כאן ברגע שיוזנו." />
            )}
          </Panel>
        )}

        {/* Tasks donut */}
        {on("tasks") && (
          <Panel title="התקדמות משימות" icon="task_alt" to="/tasks" span="lg:col-span-4" delay={180}>
            {taskTotal > 0 ? (
              <div className="flex items-center gap-4">
                <div className="flex-none">
                  <DonutChart
                    segments={[
                      { value: taskDone, color: "var(--success)", label: "הושלמו" },
                      { value: taskProg, color: "var(--warning)", label: "בתהליך" },
                      { value: taskOpen, color: "var(--info)", label: "פתוחות" },
                    ]}
                    centerValue={`${completion}%`}
                    centerLabel="הושלמו"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-2.5">
                  <LegendRow color="var(--success)" label="הושלמו" value={String(taskDone)} />
                  <LegendRow color="var(--warning)" label="בתהליך" value={String(taskProg)} />
                  <LegendRow color="var(--info)" label="פתוחות" value={String(taskOpen)} />
                </div>
              </div>
            ) : (
              <EmptyPanel icon="checklist" text="אין משימות פעילות כרגע." />
            )}
          </Panel>
        )}

        {/* Sales by weekday */}
        {on("shift_reports") && revenue > 0 && (
          <Panel title="מכירות לפי יום בשבוע" icon="bar_chart" span="lg:col-span-5" delay={220}>
            <div className="mb-2 text-[12px] font-semibold text-text-3">ממוצע מכירות לכל יום בשבוע</div>
            <BarChart data={weekdayBars} formatValue={compactCurrency} />
          </Panel>
        )}

        {/* Inventory health */}
        {on("inventory") && (
          <Panel title="בריאות המלאי" icon="inventory_2" to="/inventory" span="lg:col-span-4" delay={260}>
            <div className="flex items-center gap-4">
              <div className="flex-none">
                <RadialGauge
                  value={stockHealth}
                  color={stockHealth > 0.7 ? "var(--success)" : stockHealth > 0.4 ? "var(--warning)" : "var(--danger)"}
                  centerValue={`${Math.round(stockHealth * 100)}%`}
                  centerLabel="במלאי תקין"
                />
              </div>
              <div className="min-w-0 flex-1">
                {lowStock.length > 0 ? (
                  <>
                    <div className="mb-1.5 text-[11.5px] font-bold text-danger">חסרים במלאי</div>
                    <div className="flex flex-col gap-1.5">
                      {lowStock.slice(0, 4).map((it) => (
                        <div key={it.id} className="flex items-center gap-2">
                          <span className="flex-1 truncate text-[12.5px] font-semibold text-text-2">{it.name}</span>
                          <span className="rounded-md bg-danger-bg px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums text-danger">
                            {it.current_qty}/{it.min_quantity}
                          </span>
                        </div>
                      ))}
                      {lowStock.length > 4 && (
                        <div className="text-[11.5px] font-semibold text-text-3">+ עוד {lowStock.length - 4} מוצרים</div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-[12.5px] font-semibold text-text-2">
                    כל המוצרים במלאי תקין 🎉
                    {on("waste") && wasteCount > 0 && <div className="mt-1 text-text-3">{wasteCount} דיווחי בלאי החודש</div>}
                  </div>
                )}
              </div>
            </div>
          </Panel>
        )}

        {/* Faults */}
        {on("faults") && (
          <Panel title="תקלות" icon="build" to="/faults" span="lg:col-span-3" delay={300}>
            {faultTotal > 0 ? (
              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-[28px] font-extrabold leading-none tabular-nums text-text">
                    <CountUp value={faultOpen} format={(n) => Math.round(n).toString()} />
                  </div>
                  <div className="text-[12px] font-bold text-text-3">תקלות פתוחות</div>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
                  {faultNeeds > 0 && <div style={{ flex: faultNeeds, background: "var(--danger)" }} />}
                  {faultProg > 0 && <div style={{ flex: faultProg, background: "var(--warning)" }} />}
                  {faultHandled > 0 && <div style={{ flex: faultHandled, background: "var(--success)" }} />}
                </div>
                <div className="flex flex-col gap-2">
                  <LegendRow color="var(--danger)" label="דורש טיפול" value={String(faultNeeds)} />
                  <LegendRow color="var(--warning)" label="בטיפול" value={String(faultProg)} />
                  <LegendRow color="var(--success)" label="טופלו" value={String(faultHandled)} />
                </div>
              </div>
            ) : (
              <EmptyPanel icon="verified" text="אין תקלות פתוחות." />
            )}
          </Panel>
        )}

        {/* Team on shift */}
        {on("attendance") && (
          <Panel title="הצוות כעת" icon="badge" to="/attendance" span="lg:col-span-8" delay={340}>
            {onShift.length > 0 ? (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="dash-live-dot" />
                  <span className="text-[13px] font-extrabold text-text">{onShift.length} עובדים במשמרת</span>
                  <span className="text-[12px] font-semibold text-text-3">· {attendance.length} החתמות היום</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {onShift.map((a) => {
                    const p = profilesById.get(a.employee_id);
                    const since = a.clock_in
                      ? new Date(a.clock_in).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
                      : "";
                    return (
                      <div
                        key={a.id}
                        className="flex items-center gap-2.5 rounded-full border border-border bg-surface-2 py-1 pe-1.5 ps-3"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[12.5px] font-bold leading-tight text-text">{p?.full_name ?? "—"}</div>
                          {since && <div className="text-[10.5px] font-semibold text-text-3">מאז {since}</div>}
                        </div>
                        <span
                          className="grid h-8 w-8 flex-none place-items-center rounded-full text-[11px] font-extrabold text-white"
                          style={{ background: colorFor(a.employee_id) }}
                          title={p?.full_name ?? ""}
                        >
                          {initialsOf(p?.full_name)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <EmptyPanel icon="nightlight" text={`אין עובדים מוחתמים כרגע · ${attendance.length} החתמות היום`} />
            )}
          </Panel>
        )}

        {/* Team energy */}
        {on("shift_reports") && avgEnergy > 0 && (
          <Panel title="אנרגיית הצוות" icon="bolt" span="lg:col-span-4" delay={380}>
            <div className="flex flex-col items-center">
              <RadialGauge
                value={avgEnergy / 5}
                color="var(--accent)"
                centerValue={avgEnergy.toFixed(1)}
                centerLabel="מתוך 5"
              />
              <div className="mt-1 text-center text-[12px] font-semibold text-text-3">
                ממוצע מתוך {energyVals.length} דיווחי משמרת
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function EmptyPanel({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-text-3">
        <Icon name={icon} size={24} />
      </span>
      <div className="max-w-[28ch] text-[12.5px] font-semibold text-text-2">{text}</div>
    </div>
  );
}
