import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { AttendancePunchStation } from "@/components/attendance/AttendancePunchStation";
import { DailyTasksChecklist, useDailyTaskActions } from "@/components/tasks/DailyTasksChecklist";
import { PageEnter } from "@/components/motion/shared-motion";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/constants";
import { useShiftPunch } from "@/hooks/useShiftPunch";
import { useIsMdUp } from "@/hooks/useMediaQuery";
import { useAttendanceToday } from "@/api/attendance";
import { ManagerAttendanceFeed } from "@/components/dashboard/ManagerAttendanceFeed";

type WorkerPanel = "tasks" | "team";

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
  const isMdUp = useIsMdUp();
  const [activePanel, setActivePanel] = useState<WorkerPanel>("tasks");

  const showBothPanels = showTasks && showAttendance && !!businessId;
  const splitLayout = showBothPanels && isMdUp;
  const tabLayout = showBothPanels && !isMdUp;

  const pendingTasks = useMemo(
    () => todayTasks.filter((t) => t.status !== "done").length,
    [todayTasks],
  );

  const { data: attendanceRecords = [] } = useAttendanceToday(showBothPanels ? businessId : null);
  const onShiftCount = useMemo(
    () => attendanceRecords.filter((r) => !r.clock_out).length,
    [attendanceRecords],
  );

  return (
    <PageEnter className="worker-home w-full">
      <div className="worker-home__shell w-full max-w-lg mx-auto md:max-w-2xl lg:max-w-5xl">
      <section className="worker-hero" aria-label="כותרת דשבורד">
        <div className="worker-hero-fx" aria-hidden>
          <span className="worker-hero-aurora worker-hero-aurora--1" />
          <span className="worker-hero-aurora worker-hero-aurora--2" />
          <span className="worker-hero-grid" />
          <span className="worker-hero-grain" />
        </div>
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

      {(showTasks || showAttendance) && (
        <div className="worker-home__workspace">
          {tabLayout && (
            <div className="worker-home__tabs" role="tablist" aria-label="תצוגת דשבורד">
              <button
                type="button"
                role="tab"
                id="worker-tab-tasks"
                aria-selected={activePanel === "tasks"}
                aria-controls="worker-panel-tasks"
                data-active={activePanel === "tasks"}
                className="worker-home__tab seg-btn"
                onClick={() => setActivePanel("tasks")}
              >
                <Icon name="checklist" size={17} className="flex-none" />
                <span>משימות</span>
                {pendingTasks > 0 && (
                  <span className="worker-home__tab-badge" data-tone="accent">
                    {pendingTasks}
                  </span>
                )}
              </button>
              <button
                type="button"
                role="tab"
                id="worker-tab-team"
                aria-selected={activePanel === "team"}
                aria-controls="worker-panel-team"
                data-active={activePanel === "team"}
                className="worker-home__tab seg-btn"
                onClick={() => setActivePanel("team")}
              >
                <Icon name="groups" size={17} className="flex-none" />
                <span>הצוות</span>
                {onShiftCount > 0 && (
                  <span className="worker-home__tab-badge" data-tone="live">
                    {onShiftCount}
                  </span>
                )}
              </button>
            </div>
          )}

          <div
            className="worker-home__panels"
            data-mode={splitLayout ? "split" : tabLayout ? "tabs" : "stack"}
          >
            {showTasks && businessId && profile && (
              <div
                id="worker-panel-tasks"
                role={tabLayout ? "tabpanel" : undefined}
                aria-labelledby={tabLayout ? "worker-tab-tasks" : undefined}
                className="worker-home__panel worker-home__panel--tasks"
                data-active={!tabLayout || activePanel === "tasks"}
                hidden={tabLayout && activePanel !== "tasks"}
              >
                <div className="worker-home__panel-scroll">
                  <DailyTasksChecklist
                    tasks={todayTasks}
                    businessId={businessId}
                    onStatus={setStatus}
                    onMedia={setMedia}
                    variant={variant === "shift_manager" ? "dashboard" : "employee"}
                  />
                </div>
              </div>
            )}

            {showAttendance && (
              <div
                id="worker-panel-team"
                role={tabLayout ? "tabpanel" : undefined}
                aria-labelledby={tabLayout ? "worker-tab-team" : undefined}
                className="worker-home__panel worker-home__panel--team"
                data-active={!tabLayout || activePanel === "team"}
                hidden={tabLayout && activePanel !== "team"}
              >
                <div className="worker-home__panel-scroll">
                  <ManagerAttendanceFeed
                    compact={splitLayout}
                    className="manager-attendance-feed manager-attendance-feed--worker"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {children}
      </div>
    </PageEnter>
  );
}
