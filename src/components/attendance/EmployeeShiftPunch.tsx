import { Link } from "react-router-dom";
import { Button, Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import {
  AttendanceStatusToast,
  LiveClockDigits,
  PunchButton,
  ShiftPulse,
  StatusBanner,
} from "@/components/attendance/attendance-motion";
import { useShiftPunch } from "@/hooks/useShiftPunch";
import type { ShiftTemplate } from "@/types/database";

function ShiftChip({ template }: { template: ShiftTemplate }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[14px] border border-border/70 bg-surface/90 px-3 py-2.5">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
        style={{ background: template.color ?? "var(--accent)" }}
      >
        <Icon name="schedule" size={18} className="text-white" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-bold text-text">{template.name}</div>
        <div className="font-mono text-[11.5px] tabular-nums text-text-3">
          {template.start_time?.slice(0, 5)}–{template.end_time?.slice(0, 5)}
        </div>
      </div>
    </div>
  );
}

export function EmployeeShiftPunch() {
  const {
    biz,
    profile,
    showAttendance,
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
    now,
  } = useShiftPunch();

  if (!showAttendance || !biz || !profile) return null;

  const timeStr = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <section className="employee-shift-card mb-5 overflow-hidden rounded-[22px] border border-border/70 bg-surface shadow-[0_16px_40px_-14px_rgba(15,23,20,0.1)]">
        <div className="relative overflow-hidden px-4 pb-4 pt-5 sm:px-5">
          <div
            className="pointer-events-none absolute -left-16 -top-20 h-40 w-40 rounded-full blur-3xl"
            style={{ background: onShift ? "rgba(34,197,94,0.12)" : "rgba(124,58,237,0.1)" }}
            aria-hidden
          />

          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-3">נוכחות</p>
              <LiveClockDigits time={timeStr} compact />
              <p className="mt-1 text-[12.5px] font-medium capitalize text-text-2">{dateStr}</p>
            </div>
            {onShift && shiftElapsed && <ShiftPulse label={`במשמרת · ${shiftElapsed}`} />}
          </div>

          <div className="relative mt-4 min-h-[40px]">
            <StatusBanner>
              {clockStatus ? <AttendanceStatusToast key={clockStatus.text} ok={clockStatus.ok} text={clockStatus.text} /> : null}
            </StatusBanner>
          </div>

          <div className="relative mt-4">
            <PunchButton onShift={onShift} busy={busy} onClick={handleClock} />
            <p className="mt-2.5 text-center text-[11px] text-text-3">
              {geofenceEnabled ? `רדיוס מאושר: ${radiusM} מ׳ מהעסק` : "בדיקת מיקום כבויה"}
            </p>
          </div>

          {showShifts && (
            <div className="relative mt-4 border-t border-border-2 pt-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-3">משמרת היום</div>
              {todayShifts.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {todayShifts.map((t) => (
                    <ShiftChip key={t.id} template={t} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[12px] border border-dashed border-border bg-surface-2/70 px-3 py-3 text-center">
                  <div className="text-[12.5px] font-semibold text-text-2">אין משמרת משובצת</div>
                  <Link to="/shifts" className="mt-1 inline-block text-[12px] font-bold text-accent-2">
                    לוח משמרות
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

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
          לפני שתצא מהמשמרת, שים לב שיש משימות שעדיין מחכות לטיפול.
        </p>
        <div className="flex flex-col gap-2">
          {pending.map((t, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-[11px] border border-border bg-surface-2 px-3 py-2.5"
            >
              <Icon name={t.type === "recurring" ? "event_repeat" : "edit_note"} size={18} style={{ color: "var(--warning)" }} />
              <span className="text-[13px] font-semibold text-text">{t.title}</span>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
