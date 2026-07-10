import { Link } from "react-router-dom";
import { memo, useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { useBusiness } from "@/api/businesses";
import { useDashboardStats, usePlatformDashboardStats, type ActivityItem } from "@/api/dashboard";
import {
  AnimatedNumber,
  AreaChart,
  BarChart,
  DonutChart,
  HorizontalBars,
  RadialGauge,
  SparkLine,
} from "@/components/dashboard/dashboard-charts";
import { ManagerDashboard } from "@/components/dashboard/ManagerDashboard";
import { WorkerHome } from "@/components/dashboard/WorkerHome";
import { Icon, PageLoader, ErrorState } from "@/components/ui";
import { PageEnter, PressableCard, StaggerGrid, StaggerItem } from "@/components/motion/shared-motion";
import { EASE_OUT } from "@/components/motion/shared-motion";
import { NAV_ITEMS, ROLE_LABELS } from "@/lib/constants";
import type { FeatureKey } from "@/types/database";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  if (h < 21) return "ערב טוב";
  return "לילה טוב";
}

function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function DeltaBadge({ current, previous, suffix = "" }: { current: number; previous: number; suffix?: string }) {
  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  const pct = previous > 0 ? Math.round((diff / previous) * 100) : current > 0 ? 100 : 0;
  const up = diff >= 0;

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
        up ? "bg-success-bg text-success" : "bg-danger-bg text-danger"
      }`}
    >
      <Icon name={up ? "trending_up" : "trending_down"} size={13} />
      {up ? "+" : ""}
      {pct}%{suffix}
    </span>
  );
}

const MetricCard = memo(function MetricCard({
  icon,
  label,
  value,
  spark,
  delta,
  accent,
  index,
}: {
  icon: string;
  label: string;
  value: number;
  spark?: number[];
  delta?: { current: number; previous: number };
  accent?: string;
  index: number;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, transform: "translateY(10px)" }}
      animate={{ opacity: 1, transform: "translateY(0)" }}
      transition={{ delay: index * 0.05, duration: 0.28, ease: EASE_OUT }}
      className="dashboard-metric group relative overflow-hidden rounded-[20px] border border-border/70 bg-surface p-4 shadow-[0_12px_32px_-12px_rgba(15,23,20,0.08)] sm:p-5"
    >
      <div
        className="pointer-events-none absolute -left-6 -top-6 h-24 w-24 rounded-full opacity-40 blur-2xl transition-opacity group-hover:opacity-60"
        style={{ background: accent ?? "var(--accent)", opacity: 0.12 }}
      />
      <div className="relative flex items-start justify-between gap-2">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
          style={{ background: accent ?? "var(--accent)" }}
        >
          <Icon name={icon} size={20} className="text-white" />
        </span>
        {spark && spark.length > 0 && (
          <SparkLine data={spark} color={accent ?? "var(--accent)"} className="opacity-80" />
        )}
      </div>
      <div className="relative mt-4">
        <div className="text-[clamp(1.6rem,4vw,1.85rem)] font-extrabold leading-none tracking-tight text-text">
          <AnimatedNumber value={value} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-text-2">{label}</span>
          {delta && <DeltaBadge current={delta.current} previous={delta.previous} />}
        </div>
      </div>
    </motion.div>
  );
});

function ChartPanel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[24px] border border-border/70 bg-surface shadow-[0_20px_40px_-15px_rgba(15,23,20,0.06)] ${className}`}
    >
      <div className="border-b border-border-2 px-5 py-4 sm:px-6">
        <h2 className="text-[15px] font-extrabold tracking-tight text-text">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-text-3">{subtitle}</p>}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  );
}

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const reduce = useReducedMotion();
  const toneClass = {
    success: "bg-success-bg text-success",
    warning: "bg-warning-bg text-warning",
    danger: "bg-danger-bg text-danger",
    info: "bg-info-bg text-info",
    neutral: "bg-surface-2 text-text-2",
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-[14px] bg-surface-2 text-text-3">
          <Icon name="history" size={24} />
        </div>
        <div className="text-[14px] font-bold text-text">אין פעילות אחרונה</div>
        <div className="mt-1 text-[12px] text-text-3">ברגע שיתחילו החתמות ומשימות — זה יופיע כאן</div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border-2">
      {items.map((item, i) => (
        <motion.div
          key={item.id}
          initial={reduce ? false : { opacity: 0, transform: "translateX(8px)" }}
          animate={{ opacity: 1, transform: "translateX(0)" }}
          transition={{ delay: i * 0.04, duration: 0.22, ease: EASE_OUT }}
          className="flex items-center gap-3 px-5 py-3.5 sm:px-6"
        >
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${toneClass[item.tone]}`}>
            <Icon name={item.icon} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-bold text-text">{item.title}</div>
            <div className="text-[11.5px] text-text-3">{item.subtitle}</div>
          </div>
          <time className="shrink-0 font-mono text-[10.5px] tabular-nums text-text-3">
            {new Date(item.at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
          </time>
        </motion.div>
      ))}
    </div>
  );
}

function QuickLinks({ role, hasFeature }: { role: string; hasFeature: (k: FeatureKey) => boolean }) {
  const links = NAV_ITEMS.filter(
    (i) =>
      i.roles.includes(role as never) &&
      !["dashboard", "platform"].includes(i.key) &&
      (!i.feature || hasFeature(i.feature))
  ).filter((i, idx, arr) => arr.findIndex((x) => x.key === i.key) === idx);

  if (links.length === 0) return null;

  return (
    <section className="mt-6 md:mt-8">
      <div className="mb-3 text-[12px] font-bold uppercase tracking-wide text-text-3">גישה מהירה</div>
      <StaggerGrid className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 lg:gap-3">
        {links.map((item) => (
          <StaggerItem key={item.key}>
            <Link to={`/${item.key}`} className="block">
              <PressableCard>
                <div className="flex items-center gap-2.5 rounded-[14px] border border-border/70 bg-surface px-3 py-3 transition-[border-color,box-shadow] hover:border-accent/35 hover:shadow-sm sm:px-3.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] [background:var(--accent-tint)]">
                    <Icon name={item.icon} size={19} className="text-accent-2" />
                  </span>
                  <span className="text-[12.5px] font-bold leading-snug text-text">{item.label}</span>
                </div>
              </PressableCard>
            </Link>
          </StaggerItem>
        ))}
      </StaggerGrid>
    </section>
  );
}

function SuperAdminDashboard() {
  const { data, isLoading, isError, refetch } = usePlatformDashboardStats();
  const now = useLiveClock();

  if (isLoading) return <PageLoader label="טוען סקירת פלטפורמה..." />;
  if (isError || !data) return <ErrorState onRetry={refetch} />;

  const timeStr = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  return (
    <PageEnter className="w-full">
      <header className="dashboard-hero mb-6 overflow-hidden rounded-[28px] border border-border/60 p-5 sm:p-8 md:mb-8">
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="hidden md:block">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-2">סקירת פלטפורמה</p>
            <h1 className="mt-1 text-[clamp(1.5rem,5vw,2.1rem)] font-extrabold tracking-tight">מרכז הבקרה</h1>
            <p className="mt-2 max-w-md text-[14px] text-text-2">כל העסקים, המשתמשים והצמיחה — בזמן אמת</p>
          </div>
          <div className="font-mono text-[clamp(2rem,6vw,2.75rem)] font-bold tabular-nums leading-none tracking-tighter text-text">
            {timeStr}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <MetricCard icon="store" label="עסקים פעילים" value={data.activeBusinesses} index={0} accent="var(--accent)" />
        <MetricCard icon="storefront" label="סה״כ עסקים" value={data.businesses} index={1} accent="var(--ink)" />
        <MetricCard icon="group" label="משתמשים" value={data.users} index={2} accent="var(--info)" spark={data.businessesWeek.map((d) => d.value)} />
        <MetricCard icon="badge" label="מנהלים" value={data.managers} index={3} accent="var(--warning)" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-5 lg:grid-cols-[1.4fr_1fr] lg:gap-5">
        <ChartPanel title="עסקים חדשים · 7 ימים" subtitle="צמיחת הפלטפורמה">
          <AreaChart data={data.businessesWeek} label="עסקים חדשים" accent="var(--accent)" />
        </ChartPanel>
        <ChartPanel title="עסקים מובילים" subtitle="לפי מספר עובדים">
          <HorizontalBars
            label="עסקים מובילים"
            items={data.topBusinesses.map((b) => ({
              name: b.name,
              value: b.employees,
              sub: `${b.features} מודולים`,
              active: b.active,
            }))}
          />
        </ChartPanel>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 lg:mt-5">
        <Link
          to="/platform"
          className="btn-press inline-flex items-center gap-2 rounded-[12px] border border-border bg-surface px-4 py-2.5 text-[13px] font-bold hover:bg-surface-2"
        >
          <Icon name="space_dashboard" size={18} /> סקירה מלאה
        </Link>
        <Link
          to="/businesses"
          className="btn-press inline-flex items-center gap-2 rounded-[12px] [background:var(--primary-bg)] px-4 py-2.5 text-[13px] font-bold text-white"
        >
          <Icon name="add_business" size={18} /> ניהול עסקים
        </Link>
      </div>
    </PageEnter>
  );
}

function BusinessDashboard() {
  const { profile, hasFeature, features } = useAuth();
  const businessId = useBusinessId();
  const { data: business } = useBusiness(businessId);
  const { data: stats, isLoading, isError, refetch } = useDashboardStats(businessId, features);
  const now = useLiveClock();
  const reduce = useReducedMotion();

  const role = profile?.role ?? "employee";
  const firstName = (profile?.full_name ?? "").split(/\s+/)[0];
  const today = now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
  const timeStr = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  if (isLoading) return <PageLoader label="טוען נתוני דשבורד..." />;
  if (isError || !stats) return <ErrorState onRetry={refetch} />;

  const attendanceSpark = stats.attendanceWeek.map((d) => d.value);
  const showTasks = hasFeature("tasks");
  const showFaults = hasFeature("faults");
  const showInventory = hasFeature("inventory");
  const showAttendance = hasFeature("attendance");

  return (
    <PageEnter className="w-full">
      {/* Hero */}
      <header className="dashboard-hero relative mb-5 overflow-hidden rounded-[28px] border border-border/60 p-5 sm:p-7 md:mb-6">
        <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden>
          <div className="absolute -left-20 -top-24 h-48 w-48 rounded-full blur-3xl" style={{ background: "rgba(124,58,237,0.15)" }} />
          <div className="absolute -bottom-16 -right-10 h-40 w-40 rounded-full blur-3xl" style={{ background: "rgba(109,40,217,0.1)" }} />
        </div>
        <div className="relative grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="hidden md:block">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-3">{business?.name ?? "העסק שלך"}</p>
            <h1 className="mt-1 text-[clamp(1.45rem,4.5vw,2rem)] font-extrabold tracking-tight">
              {greeting()}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-1.5 text-[13.5px] text-text-2">
              {today} · {ROLE_LABELS[role]}
            </p>
          </div>
          <motion.div
            initial={reduce ? false : { opacity: 0, transform: "scale(0.97)" }}
            animate={{ opacity: 1, transform: "scale(1)" }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            className="flex items-center gap-4 rounded-[18px] border border-border/60 bg-surface/80 px-4 py-3 backdrop-blur-sm sm:px-5"
          >
            <div className="text-right">
              <div className="font-mono text-[clamp(1.75rem,5vw,2.25rem)] font-extrabold tabular-nums leading-none tracking-tighter">
                {timeStr}
              </div>
              <div className="mt-1 text-[11px] font-semibold text-text-3">שעון חי</div>
            </div>
            {showAttendance && (
              <RadialGauge value={stats.onShiftNow} max={Math.max(stats.employees, 1)} label="במשמרת" />
            )}
          </motion.div>
        </div>
      </header>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {showAttendance && (
          <MetricCard
            icon="schedule"
            label="החתמות היום"
            value={stats.attendanceToday}
            spark={attendanceSpark}
            delta={{ current: stats.attendanceToday, previous: stats.attendanceYesterday }}
            index={0}
          />
        )}
        <MetricCard icon="group" label="עובדים פעילים" value={stats.employees} index={1} accent="var(--ink)" />
        {showTasks && (
          <MetricCard icon="checklist" label="משימות פתוחות" value={stats.tasksOpen} index={2} accent="var(--info)" />
        )}
        {showFaults && (
          <MetricCard icon="build" label="תקלות פתוחות" value={stats.faultsOpen} index={3} accent="var(--danger)" />
        )}
        {showInventory && (
          <>
            <MetricCard
              icon="inventory_2"
              label="פריטים במלאי"
              value={stats.inventoryTotal}
              index={4}
              accent="var(--accent)"
            />
            <MetricCard
              icon="warning"
              label="מלאי נמוך"
              value={stats.inventoryLow}
              index={5}
              accent="var(--warning)"
            />
            <MetricCard icon="shopping_cart" label="הזמנות פתוחות" value={stats.pendingOrders} index={6} />
          </>
        )}
        {showTasks && (
          <MetricCard icon="task_alt" label="הושלמו השבוע" value={stats.tasksDoneWeek} index={7} accent="var(--success)" />
        )}
      </div>

      {/* Charts Bento */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-5 lg:grid-cols-12 lg:gap-5">
        {showAttendance && (
          <ChartPanel
            className="lg:col-span-7"
            title="נוכחות · 7 ימים"
            subtitle="מספר החתמות כניסה ליום"
          >
            <AreaChart data={stats.attendanceWeek} label="נוכחות שבועית" />
          </ChartPanel>
        )}

        {showTasks && (
          <ChartPanel
            className={showAttendance ? "lg:col-span-5" : "lg:col-span-6"}
            title="משימות לפי סטטוס"
            subtitle={`${stats.tasksOpen} פתוחות · ${stats.tasksDoneWeek} הושלמו השבוע`}
          >
            <BarChart data={stats.tasksByStatus} label="משימות" />
          </ChartPanel>
        )}

        {showFaults && (
          <ChartPanel
            className="lg:col-span-5"
            title="תקלות"
            subtitle="התפלגות לפי סטטוס טיפול"
          >
            <DonutChart data={stats.faultsByStatus} label="תקלות" centerLabel="סה״כ" />
          </ChartPanel>
        )}

        <div className={`overflow-hidden rounded-[24px] border border-border/70 bg-surface shadow-[0_20px_40px_-15px_rgba(15,23,20,0.06)] ${showFaults ? "lg:col-span-7" : "lg:col-span-12"}`}>
          <div className="flex items-center justify-between border-b border-border-2 px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-[15px] font-extrabold tracking-tight">פעילות אחרונה</h2>
              <p className="mt-0.5 text-[12px] text-text-3">עדכון בזמן אמת · מתרענן כל דקה</p>
            </div>
            <motion.span
              className="flex h-2 w-2 rounded-full bg-success"
              animate={reduce ? undefined : { opacity: [1, 0.35, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          <ActivityFeed items={stats.recentActivity} />
        </div>
      </div>

      <QuickLinks role={role} hasFeature={hasFeature} />

      {profile?.business_id && features.size === 0 && role !== "manager" && (
        <p className="mt-4 text-[12px] text-text-3">* התפריט נבנה דינמית לפי המודולים שהופעלו לעסק.</p>
      )}
    </PageEnter>
  );
}

function ShiftManagerDashboard() {
  return <WorkerHome variant="shift_manager" />;
}

export function Dashboard() {
  const { profile } = useAuth();
  const role = profile?.role ?? "employee";

  if (role === "manager" && profile?.business_id) {
    return <ManagerDashboard />;
  }
  if (role === "super_admin") return <SuperAdminDashboard />;
  if (role === "shift_manager") return <ShiftManagerDashboard />;
  if (role === "employee") return <WorkerHome variant="employee" />;
  return <BusinessDashboard />;
}
