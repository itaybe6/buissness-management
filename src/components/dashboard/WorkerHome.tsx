import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { AttendancePunchStation } from "@/components/attendance/AttendancePunchStation";
import { DailyTasksChecklist, useDailyTaskActions } from "@/components/tasks/DailyTasksChecklist";
import { PageEnter, PressableCard, StaggerGrid, StaggerItem } from "@/components/motion/shared-motion";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { useBusiness } from "@/api/businesses";
import { NAV_ITEMS, ROLE_LABELS } from "@/lib/constants";
import { useShiftPunch } from "@/hooks/useShiftPunch";
import { TeamOnShiftPanel } from "@/components/dashboard/TeamOnShiftPanel";
import type { FeatureKey, ShiftTemplate } from "@/types/database";

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
        busy={busy || !punchReady}
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

function WorkerQuickLinks({ hasFeature }: { hasFeature: (k: FeatureKey) => boolean }) {
  const { profile } = useAuth();
  const role = profile?.role ?? "employee";

  const links = NAV_ITEMS.filter(
    (i) =>
      i.roles.includes(role as never) &&
      !["dashboard", "platform", "tasks"].includes(i.key) &&
      (!i.feature || hasFeature(i.feature)),
  ).filter((i, idx, arr) => arr.findIndex((x) => x.key === i.key) === idx);

  if (links.length === 0) return null;

  return (
    <section className="worker-quick-section">
      <h3 className="worker-quick-title">גישה מהירה</h3>
      <StaggerGrid className="worker-quick-grid">
        {links.slice(0, 6).map((item) => (
          <StaggerItem key={item.key}>
            <Link to={`/${item.key}`} className="block">
              <PressableCard>
                <div className="worker-quick-item">
                  <span className="worker-quick-icon">
                    <Icon name={item.icon} size={20} className="text-accent-2" />
                  </span>
                  <span className="worker-quick-label">{item.label}</span>
                </div>
              </PressableCard>
            </Link>
          </StaggerItem>
        ))}
      </StaggerGrid>
    </section>
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
  const todayLabel = dateStr;
  const firstName = (profile?.full_name ?? "").split(/\s+/)[0];
  const role = profile?.role ?? "employee";
  const showTasks = hasFeature("tasks");
  const doneCount = todayTasks.filter((t) => t.status === "done").length;
  const totalTasks = todayTasks.length;

  return (
    <PageEnter className="worker-home w-full max-w-lg mx-auto md:max-w-2xl lg:max-w-3xl">
      <header className="worker-greeting">
        <p className="worker-greeting-eyebrow">{business?.name ?? "העסק שלך"}</p>
        <h1 className="worker-greeting-title">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="worker-greeting-sub">
          {todayLabel}
          {variant === "shift_manager" && (
            <span className="worker-role-pill">{ROLE_LABELS[role]}</span>
          )}
        </p>
        {showTasks && totalTasks > 0 && (
          <div className="worker-task-summary">
            <span
              className="worker-task-summary-ring"
              data-done={doneCount === totalTasks ? "true" : "false"}
            >
              {doneCount}/{totalTasks}
            </span>
            <span className="text-[12.5px] font-semibold text-text-2">
              {doneCount === totalTasks
                ? "סיימת את כל משימות היום"
                : `${totalTasks - doneCount} משימות ממתינות לטיפול`}
            </span>
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

      <WorkerQuickLinks hasFeature={hasFeature} />
    </PageEnter>
  );
}
