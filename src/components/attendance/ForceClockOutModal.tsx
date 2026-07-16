import { useEffect, useMemo, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useDeleteAttendance, useUpdateAttendanceSession } from "@/api/attendance";
import { formatShiftElapsed } from "@/hooks/useShiftPunch";
import { initialsOf } from "@/lib/db";

export type ForceClockOutTarget = {
  attendanceId: string;
  employeeName: string;
  clockIn: string;
  clockOut?: string | null;
  avatarColor?: string;
};

function toTimeInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Combine a date base with HH:mm; if end is before start, roll to the next day. */
function combineDateAndTime(baseIso: string, hhmm: string, rollIfBefore?: Date): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const base = new Date(baseIso);
  if (Number.isNaN(base.getTime())) return null;
  const next = new Date(base);
  next.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (rollIfBefore && next.getTime() <= rollIfBefore.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function hoursBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 3.6e6);
}

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
  const updateSession = useUpdateAttendanceSession(businessId);
  const deleteAttendance = useDeleteAttendance(businessId);
  const now = useLiveClock(open && !!target && !target.clockOut);
  const [workStart, setWorkStart] = useState("");
  const [workEnd, setWorkEnd] = useState("");
  const [hours, setHours] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isOpenShift = Boolean(target && !target.clockOut);
  const pending = updateSession.isPending || deleteAttendance.isPending;

  useEffect(() => {
    if (!open || !target) return;
    const start = toTimeInputValue(target.clockIn);
    const end = target.clockOut ? toTimeInputValue(target.clockOut) : toTimeInputValue(new Date().toISOString());
    setWorkStart(start);
    setWorkEnd(end);
    setError(null);
    setConfirmDelete(false);

    const startDate = new Date(target.clockIn);
    const endDate = target.clockOut
      ? new Date(target.clockOut)
      : combineDateAndTime(target.clockIn, end, startDate) ?? new Date();
    const h = hoursBetween(startDate, endDate);
    setHours(h > 0 ? (Math.round(h * 100) / 100).toString() : "");
  }, [open, target]);

  const resolvedTimes = useMemo(() => {
    if (!target) return null;
    const startDate = combineDateAndTime(target.clockIn, workStart);
    if (!startDate) return null;
    const endDate = combineDateAndTime(target.clockIn, workEnd, startDate);
    if (!endDate) return null;
    return { startDate, endDate, hours: hoursBetween(startDate, endDate) };
  }, [target, workStart, workEnd]);

  const liveElapsed =
    target && isOpenShift
      ? formatShiftElapsed(now.getTime() - new Date(target.clockIn).getTime())
      : null;

  function syncHoursFromTimes(start: string, end: string) {
    if (!target) return;
    const startDate = combineDateAndTime(target.clockIn, start);
    if (!startDate) return;
    const endDate = combineDateAndTime(target.clockIn, end, startDate);
    if (!endDate) return;
    const h = hoursBetween(startDate, endDate);
    setHours(h > 0 ? (Math.round(h * 100) / 100).toString() : "");
  }

  function onStartChange(value: string) {
    setWorkStart(value);
    syncHoursFromTimes(value, workEnd);
  }

  function onEndChange(value: string) {
    setWorkEnd(value);
    syncHoursFromTimes(workStart, value);
  }

  function onHoursChange(value: string) {
    setHours(value);
    if (!target) return;
    const startDate = combineDateAndTime(target.clockIn, workStart);
    if (!startDate) return;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return;
    const endDate = new Date(startDate.getTime() + n * 3.6e6);
    setWorkEnd(
      `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`,
    );
  }

  async function handleSave() {
    if (!target || !resolvedTimes) {
      setError("יש למלא שעת כניסה ויציאה תקינות.");
      return;
    }
    if (resolvedTimes.endDate.getTime() <= resolvedTimes.startDate.getTime()) {
      setError("שעת היציאה חייבת להיות אחרי שעת הכניסה.");
      return;
    }
    setError(null);
    try {
      await updateSession.mutateAsync({
        id: target.attendanceId,
        clock_in: resolvedTimes.startDate.toISOString(),
        clock_out: resolvedTimes.endDate.toISOString(),
      });
      onClose();
    } catch {
      setError("לא הצלחנו לשמור את השעות. נסו שוב.");
    }
  }

  async function handleDelete() {
    if (!target) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setError(null);
    try {
      await deleteAttendance.mutateAsync(target.attendanceId);
      onClose();
    } catch {
      setError("לא הצלחנו למחוק את ההחתמה. נסו שוב.");
    }
  }

  return (
    <Modal
      open={open && !!target}
      onClose={onClose}
      icon="logout"
      title={isOpenShift ? "הוצאה ממשמרת" : "עריכת נוכחות"}
      subtitle={target?.employeeName}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={pending}>
            ביטול
          </Button>
          <Button
            variant="primary"
            icon="check"
            loading={updateSession.isPending}
            onClick={handleSave}
            className="flex-1"
            disabled={pending}
          >
            {isOpenShift ? "הוצא ממשמרת" : "שמור שעות"}
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
              <div className="force-clock-out__status" data-open={isOpenShift}>
                {isOpenShift ? (
                  <>
                    <span className="force-clock-out__live-dot" aria-hidden />
                    במשמרת כרגע
                    {liveElapsed && <span className="force-clock-out__live-elapsed">· {liveElapsed}</span>}
                  </>
                ) : (
                  "סיים/ה משמרת"
                )}
              </div>
            </div>
          </div>

          <div className="force-clock-out__edit">
            <div className="force-clock-out__times">
              <Field label="כניסה">
                <input
                  type="time"
                  value={workStart}
                  onChange={(e) => onStartChange(e.target.value)}
                  className="field force-clock-out__time-field"
                  disabled={pending}
                />
              </Field>
              <span className="force-clock-out__dash" aria-hidden>
                –
              </span>
              <Field label="יציאה">
                <input
                  type="time"
                  value={workEnd}
                  onChange={(e) => onEndChange(e.target.value)}
                  className="field force-clock-out__time-field"
                  disabled={pending}
                />
              </Field>
            </div>

            <Field label='סה״כ שעות'>
              <div className="force-clock-out__hours-wrap">
                <Input
                  type="number"
                  inputMode="decimal"
                  step={0.25}
                  min={0}
                  placeholder="0"
                  value={hours}
                  onChange={(e) => onHoursChange(e.target.value)}
                  className="force-clock-out__hours-field"
                  disabled={pending}
                  aria-describedby="force-clock-out-hours-hint"
                />
                <span className="force-clock-out__hours-unit" id="force-clock-out-hours-hint">
                  שע׳
                </span>
              </div>
            </Field>
          </div>

          {error && <p className="force-clock-out__error">{error}</p>}

          <p className="force-clock-out__note">
            ניתן לתקן את שעות העבודה לפני ההוצאה, או למחוק את ההחתמה לגמרי אם העובד/ת לא היה/ה במשמרת.
          </p>

          <button
            type="button"
            className="force-clock-out__delete"
            data-confirm={confirmDelete}
            onClick={handleDelete}
            disabled={pending}
          >
            {confirmDelete ? "ללחוץ שוב לאישור מחיקה" : "מחק מהמשמרת לגמרי"}
          </button>
        </div>
      )}
    </Modal>
  );
}
