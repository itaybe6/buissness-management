import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useClockOut } from "@/api/attendance";
import { formatShiftElapsed } from "@/hooks/useShiftPunch";
import { initialsOf } from "@/lib/db";

export type ForceClockOutTarget = {
  attendanceId: string;
  employeeName: string;
  clockIn: string;
  avatarColor?: string;
};

function useLiveClock(active: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function ForceClockOutModal({
  open,
  target,
  businessId,
  onClose,
}: {
  open: boolean;
  target: ForceClockOutTarget | null;
  businessId: string | null;
  onClose: () => void;
}) {
  const clockOut = useClockOut(businessId);
  const now = useLiveClock(open && !!target);

  const since = target
    ? new Date(target.clockIn).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
    : "";
  const elapsed = target
    ? formatShiftElapsed(now.getTime() - new Date(target.clockIn).getTime())
    : "";

  async function handleConfirm() {
    if (!target) return;
    await clockOut.mutateAsync(target.attendanceId);
    onClose();
  }

  return (
    <Modal
      open={open && !!target}
      onClose={onClose}
      icon="logout"
      title="הוצאה ממשמרת"
      subtitle={target?.employeeName}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={clockOut.isPending}>
            ביטול
          </Button>
          <Button
            variant="danger"
            icon="logout"
            loading={clockOut.isPending}
            onClick={handleConfirm}
            className="flex-1"
          >
            הוצא ממשמרת
          </Button>
        </>
      }
    >
      {target && (
        <div className="force-clock-out">
          <div className="force-clock-out__hero">
            <span
              className="force-clock-out__avatar"
              style={{ background: target.avatarColor ?? "var(--accent)" }}
              aria-hidden
            >
              {initialsOf(target.employeeName)}
            </span>
            <div className="force-clock-out__hero-copy">
              <div className="force-clock-out__name">{target.employeeName}</div>
              <div className="force-clock-out__status">
                <span className="force-clock-out__live-dot" aria-hidden />
                במשמרת כרגע
              </div>
            </div>
          </div>

          <div className="force-clock-out__stats">
            <div className="force-clock-out__stat">
              <span className="force-clock-out__stat-label">נכנס/ה בשעה</span>
              <span className="force-clock-out__stat-value">{since}</span>
            </div>
            <div className="force-clock-out__stat">
              <span className="force-clock-out__stat-label">זמן במשמרת</span>
              <span className="force-clock-out__stat-value force-clock-out__stat-value--mono">{elapsed}</span>
            </div>
          </div>

          <p className="force-clock-out__note">
            הפעולה תסגור את ההחתמה של העובד/ת כאילו יצא/ה מהמשמרת. ודא/י שזה מתאים לפני האישור.
          </p>
        </div>
      )}
    </Modal>
  );
}
