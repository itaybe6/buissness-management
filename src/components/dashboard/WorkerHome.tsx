import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { AttendancePunchStation } from "@/components/attendance/AttendancePunchStation";
import { DailyTasksChecklist, useDailyTaskActions } from "@/components/tasks/DailyTasksChecklist";
import { PageEnter } from "@/components/motion/shared-motion";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { useBusiness } from "@/api/businesses";
import { ROLE_LABELS } from "@/lib/constants";
import { useShiftPunch } from "@/hooks/useShiftPunch";
import { TeamOnShiftPanel } from "@/components/dashboard/TeamOnShiftPanel";
import type { ShiftTemplate } from "@/types/database";

type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

function timeOfDay(h = new Date().getHours()): TimeOfDay {
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}

function greeting() {
  const slot = timeOfDay();
  if (slot === "morning") return "בוקר טוב";
  if (slot === "afternoon") return "צהריים טובים";
  if (slot === "evening") return "ערב טוב";
  return "לילה טוב";
}

function greetingIcon(slot: TimeOfDay) {
  if (slot === "morning") return "wb_sunny";
  if (slot === "afternoon") return "light_mode";
  if (slot === "evening") return "nights_stay";
  return "bedtime";
}

function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function TodayShiftRow({ template }: { template: ShiftTemplate }) {
  return (
    <div className="worker-shift-row">
      <span
        className="worker-shift-icon"
        style={{ background: template.color ?? "var(--accent)" }}
      >
        <Icon name="schedule" size={20} className="text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-extrabold tracking-tight text-text">{template.name}</div>
        <div className="mt-0.5 font-mono text-[13px] tabular-nums text-text-2">
          {template.start_time?.slice(0, 5)}–{template.end_time?.slice(0, 5)}
        </div>
      </div>
    </div>
  );
}

function WorkerClockStation({ time }: { time: string }) {
  const {
    showAttendance,
    showShifts,
    todayShifts,
    onShift,
    shiftElapsed,
    pending,
    clockStatus,
    busy,
    exitWarn,
    setExitWarn,
    handleClock,
    doClockOut,
    clockOutPending,
    biz,
    profile,
  } = useShiftPunch();

  if (!showAttendance || !profile) {
    return null;
  }

  const punchReady = Boolean(biz);

  const shiftFooter = showShifts ? (
    <div className="worker-shift-block worker-shift-block--station">
      <div className="worker-shift-block-label">המשמרת של היום</div>
      {todayShifts.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {todayShifts.map((t) => (
            <TodayShiftRow key={t.id} template={t} />
          ))}
        </div>
      ) : (
        <div className="worker-shift-empty">
          <Icon name="event_busy" size={22} className="text-text-3" />
          <div className="mt-2 text-[13px] font-bold text-text-2">אין משמרת משובצת להיום</div>
          <Link to="/shifts" className="mt-1 inline-block text-[12.5px] font-semibold text-accent-2 hover:underline">
            צפייה בלוח משמרות
          </Link>
        </div>
      )}
    </div>
  ) : undefined;

  return (
    <>
      <AttendancePunchStation
        timeStr={time}
        onShift={onShift}
        shiftElapsed={shiftElapsed}
        status={clockStatus}
        busy={busy || (!onShift && !punchReady)}
        onPunch={handleClock}
        compact
        footer={shiftFooter}
      />

      <Modal
        open={exitWarn}
        onClose={() => setExitWarn(false)}
        icon="warning"
        title="יש לך משימות פתוחות"
        subtitle={`${pending.length} משימות עדיין לא הושלמו`}
        footer={
          <>
            <Button variant="secondary" icon="arrow_forward" onClick={() => setExitWarn(false)} className="flex-1">
              חזרה למשימות
            </Button>
            <Button variant="danger" icon="logout" loading={clockOutPending} onClick={doClockOut} className="flex-1">
              צא בכל זאת
            </Button>
          </>
        }
      >
        <p className="mb-3.5 text-[13.5px] leading-relaxed text-text-2">
          לפני שתצא מהמשמרת, שים לב שיש משימות שעדיין מחכות לטיפול. אפשר לצאת בכל זאת, זו רק תזכורת.
        </p>
        <div className="flex flex-col gap-2">
          {pending.map((t, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-[11px] border border-border bg-surface-2 px-3 py-2.5"
            >
              <Icon
                name={t.type === "recurring" ? "event_repeat" : "edit_note"}
                size={18}
                className="flex-none"
                style={{ color: "var(--warning)" }}
              />
              <span className="text-[13px] font-semibold text-text">{t.title}</span>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}

export function WorkerHome({
  variant = "employee",
  children,
}: {
  variant?: "employee" | "shift_manager";
  children?: ReactNode;
}) {
  const businessId = useBusinessId();
  const { profile, hasFeature } = useAuth();
  const { data: business } = useBusiness(businessId);
  const now = useLiveClock();

  const { todayTasks, setStatus, setMedia } = useDailyTaskActions(
    businessId ?? "",
    profile?.id ?? "",
    profile?.department_id ?? null,
    profile?.role,
  );

  const timeStr = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
  const firstName = (profile?.full_name ?? "").split(/\s+/)[0];
  const role = profile?.role ?? "employee";
  const showTasks = hasFeature("tasks");
  const doneCount = todayTasks.filter((t) => t.status === "done").length;
  const totalTasks = todayTasks.length;
  const slot = timeOfDay(now.getHours());
  const businessName = business?.name ?? "העסק שלך";
  const businessInitial = businessName.trim().charAt(0) || "ע";
  const userInitial = (profile?.full_name ?? firstName ?? "ע").trim().charAt(0) || "ע";
  const taskProgress = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;
  const allTasksDone = totalTasks > 0 && doneCount === totalTasks;

  return (
    <PageEnter className="worker-home w-full max-w-lg mx-auto md:max-w-2xl lg:max-w-3xl">
      <header
        className="worker-hero"
        data-time={slot}
        data-variant={variant}
        aria-label="כותרת דשבורד"
      >
        <div className="worker-hero-top">
          <div className="worker-hero-brand">
            <span className="worker-hero-brand-mark" aria-hidden>
              {businessInitial}
            </span>
            <span className="worker-hero-brand-name">{businessName}</span>
          </div>
          <time className="worker-hero-clock" dateTime={now.toISOString()}>
            {timeStr}
          </time>
        </div>

        <div className="worker-hero-main">
          <div className="worker-hero-avatar" aria-hidden>
            <span className="worker-hero-avatar-inner">{userInitial}</span>
            <span className="worker-hero-avatar-badge">
              <Icon name={greetingIcon(slot)} size={13} />
            </span>
          </div>
          <div className="worker-hero-copy">
            <p className="worker-hero-kicker">{greeting()}</p>
            <h1 className="worker-hero-title">{firstName || "שלום"}</h1>
          </div>
        </div>

        <div className="worker-hero-meta">
          <span className="worker-hero-date">
            <Icon name="calendar_today" size={15} />
            {dateStr}
          </span>
          <span
            className="worker-hero-role"
            data-role={variant === "shift_manager" ? "manager" : "employee"}
          >
            <Icon
              name={variant === "shift_manager" ? "shield_person" : "badge"}
              size={14}
            />
            {ROLE_LABELS[role]}
          </span>
        </div>

        {showTasks && totalTasks > 0 && (
          <div className="worker-hero-tasks" data-done={allTasksDone ? "true" : "false"}>
            <div className="worker-hero-tasks-head">
              <span className="worker-hero-tasks-count">
                {doneCount}
                <span className="worker-hero-tasks-total">/{totalTasks}</span>
              </span>
              <span className="worker-hero-tasks-label">
                {allTasksDone ? "כל המשימות הושלמו" : "משימות היום"}
              </span>
              <span className="worker-hero-tasks-pct">{taskProgress}%</span>
            </div>
            <div className="worker-hero-tasks-track" role="progressbar" aria-valuenow={taskProgress} aria-valuemin={0} aria-valuemax={100}>
              <span className="worker-hero-tasks-fill" style={{ width: `${taskProgress}%` }} />
            </div>
            <p className="worker-hero-tasks-hint">
              {allTasksDone
                ? "עבודה מצוינת — אפשר לסגור את היום בראש שקט"
                : `${totalTasks - doneCount} משימות ממתינות לטיפול`}
            </p>
          </div>
        )}
      </header>

      <WorkerClockStation time={timeStr} />

      {variant === "shift_manager" && <TeamOnShiftPanel />}

      {showTasks && businessId && profile && (
        <DailyTasksChecklist
          tasks={todayTasks}
          businessId={businessId}
          onStatus={setStatus}
          onMedia={setMedia}
          variant={variant === "shift_manager" ? "dashboard" : "employee"}
        />
      )}

      {children}
    </PageEnter>
  );
}
