import { Link } from "react-router-dom";
import { Button, Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import {
  AttendanceStatusToast,
  PunchButton,
  ShiftPulse,
  StatusBanner,
} from "@/components/attendance/attendance-motion";
import { useBusinessId } from "@/lib/db";
import { useShiftPunch } from "@/hooks/useShiftPunch";
import { DailyTasksChecklist, useDailyTaskActions } from "@/components/tasks/DailyTasksChecklist";
import { useAuth } from "@/lib/auth";
import type { ShiftTemplate } from "@/types/database";

function shiftDotStyle(color: string | null | undefined) {
  return { background: color ?? "var(--accent)" };
}

function TodayShiftBadge({ template }: { template: ShiftTemplate }) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-border/70 bg-surface-2/80 px-4 py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px]" style={shiftDotStyle(template.color)}>
        <Icon name="schedule" size={20} className="text-white" />
      </span>
      <div className="min-w-0">
        <div className="text-[15px] font-extrabold tracking-tight text-text">{template.name}</div>
        <div className="mt-0.5 font-mono text-[13px] tabular-nums text-text-2">
          {template.start_time?.slice(0, 5)}–{template.end_time?.slice(0, 5)}
        </div>
      </div>
    </div>
  );
}

export function DashboardPresenceCard() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const {
    biz,
    showShifts,
    todayShifts,
    onShift,
    shiftElapsed,
    pending,
    geofenceEnabled,
    radiusM,
    clockStatus,
    busy,
    exitWarn,
    setExitWarn,
    handleClock,
    doClockOut,
    clockOutPending,
  } = useShiftPunch();

  const { todayTasks, setStatus: setTaskStatus, setMedia: setTaskMedia } = useDailyTaskActions(
    businessId ?? "",
    profile?.id ?? "",
    profile?.department_id ?? null,
  );

  if (!biz || !profile) return null;

  return (
    <>
      <section className="mb-5 overflow-hidden rounded-[24px] border border-border/70 bg-surface shadow-[0_20px_40px_-15px_rgba(15,23,20,0.06)] md:mb-6">
        <div className="border-b border-border-2 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-extrabold tracking-tight text-text">סימון נוכחות</h2>
              <p className="mt-0.5 text-[12px] text-text-3">החתמת כניסה ויציאה מהמשמרת</p>
            </div>
            {onShift && shiftElapsed && <ShiftPulse label={`במשמרת · ${shiftElapsed}`} />}
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div className="mx-auto max-w-md space-y-3">
            <PunchButton onShift={onShift} busy={busy} onClick={handleClock} />
            <div className="text-center text-[11.5px] text-text-3">
              {geofenceEnabled ? `רדיוס מאושר: ${radiusM} מ׳` : "בדיקת מיקום כבויה"}
            </div>
          </div>

          <div className="min-h-[44px]">
            <StatusBanner>
              {clockStatus ? <AttendanceStatusToast key={clockStatus.text} ok={clockStatus.ok} text={clockStatus.text} /> : null}
            </StatusBanner>
          </div>

          {showShifts && (
            <div>
              <div className="mb-2.5 text-[12px] font-bold uppercase tracking-wide text-text-3">המשמרת של היום</div>
              {todayShifts.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {todayShifts.map((t) => (
                    <TodayShiftBadge key={t.id} template={t} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[14px] border border-dashed border-border bg-surface-2/60 px-4 py-4 text-center">
                  <Icon name="event_busy" size={24} className="mx-auto text-text-3" />
                  <div className="mt-2 text-[13px] font-bold text-text-2">אין משמרת משובצת להיום</div>
                  <Link to="/shifts" className="mt-1 inline-block text-[12.5px] font-semibold text-accent-2 hover:underline">
                    צפייה בלוח משמרות
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {businessId && profile && (
        <div className="mb-5 md:mb-6">
          <DailyTasksChecklist
            tasks={todayTasks}
            businessId={businessId}
            onStatus={setTaskStatus}
            onMedia={setTaskMedia}
            variant="dashboard"
          />
        </div>
      )}

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
