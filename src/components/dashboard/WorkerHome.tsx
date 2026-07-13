import { useEffect, useState, type ReactNode } from "react";
import { Button, Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { AttendancePunchStation } from "@/components/attendance/AttendancePunchStation";
import { DailyTasksChecklist, useDailyTaskActions } from "@/components/tasks/DailyTasksChecklist";
import { PageEnter } from "@/components/motion/shared-motion";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/constants";
import { useShiftPunch } from "@/hooks/useShiftPunch";
import { ManagerAttendanceFeed } from "@/components/dashboard/ManagerAttendanceFeed";

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

function WorkerClockStation({ time }: { time: string }) {
  const {
    showAttendance,
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

  return (
    <>
      <div className="worker-hero-punch">
        <AttendancePunchStation
          timeStr={time}
          onShift={onShift}
          shiftElapsed={shiftElapsed}
          status={clockStatus}
          busy={busy || (!onShift && !punchReady)}
          onPunch={handleClock}
          compact
          bare
        />
      </div>

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
  const now = useLiveClock();

  const { todayTasks, setStatus, setMedia } = useDailyTaskActions(
    businessId ?? "",
    profile?.id ?? "",
    profile?.department_id ?? null,
    profile?.role,
  );

  const timeStr = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const clockStr = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
  const firstName = (profile?.full_name ?? "").split(/\s+/)[0];
  const role = profile?.role ?? "employee";
  const showTasks = hasFeature("tasks");
  const showAttendance = hasFeature("attendance");
  const slot = timeOfDay(now.getHours());

  return (
    <PageEnter className="worker-home w-full max-w-lg mx-auto md:max-w-2xl lg:max-w-3xl">
      <section className="worker-hero" aria-label="כותרת דשבורד">
        <div className="worker-hero-head">
          <div className="worker-hero-copy">
            <p className="worker-hero-kicker">
              <Icon name={greetingIcon(slot)} size={15} />
              {greeting()}
            </p>
            <h1 className="worker-hero-title">{firstName || "שלום"}</h1>
          </div>
          <time className="worker-hero-clock" dateTime={now.toISOString()}>
            <span className="worker-hero-clock-dot" aria-hidden />
            {clockStr}
          </time>
        </div>

        <div className="worker-hero-meta">
          <span className="worker-hero-date">
            <Icon name="calendar_today" size={15} />
            {dateStr}
          </span>
          <span className="worker-hero-role">
            <Icon
              name={variant === "shift_manager" ? "shield_person" : "badge"}
              size={14}
            />
            {ROLE_LABELS[role]}
          </span>
        </div>

        <WorkerClockStation time={timeStr} />
      </section>

      {showTasks && businessId && profile && (
        <DailyTasksChecklist
          tasks={todayTasks}
          businessId={businessId}
          onStatus={setStatus}
          onMedia={setMedia}
          variant={variant === "shift_manager" ? "dashboard" : "employee"}
        />
      )}

      {showAttendance && (
        <ManagerAttendanceFeed className="manager-attendance-feed manager-attendance-feed--worker" />
      )}

      {children}
    </PageEnter>
  );
}
