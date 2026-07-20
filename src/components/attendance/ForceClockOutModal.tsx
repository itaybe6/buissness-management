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

export type OpenForceClockOutOptions = {
  startInEditMode?: boolean;
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

function resetFieldsFromTarget(
  target: ForceClockOutTarget,
  setters: {
    setWorkStart: (v: string) => void;
    setWorkEnd: (v: string) => void;
    setHours: (v: string) => void;
    setError: (v: string | null) => void;
  },
) {
  const start = toTimeInputValue(target.clockIn);
  const end = target.clockOut ? toTimeInputValue(target.clockOut) : toTimeInputValue(new Date().toISOString());
  setters.setWorkStart(start);
  setters.setWorkEnd(end);
  setters.setError(null);
  const startDate = new Date(target.clockIn);
  const endDate = target.clockOut
    ? new Date(target.clockOut)
    : combineDateAndTime(target.clockIn, end, startDate) ?? new Date();
  const h = hoursBetween(startDate, endDate);
  setters.setHours(h > 0 ? (Math.round(h * 100) / 100).toString() : "");
}

export function ForceClockOutModal({
  open,
  target,
  businessId,
  onClose,
  initialEditing = false,
}: {
  open: boolean;
  target: ForceClockOutTarget | null;
  businessId: string | null;
  onClose: () => void;
  /** Open directly in edit mode (e.g. from «עריכה» on a completed shift). */
  initialEditing?: boolean;
}) {
  const updateSession = useUpdateAttendanceSession(businessId);
  const deleteAttendance = useDeleteAttendance(businessId);
  const now = useLiveClock(open && !!target && !target.clockOut);
  const [workStart, setWorkStart] = useState("");
  const [workEnd, setWorkEnd] = useState("");
  const [hours, setHours] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const isOpenShift = Boolean(target && !target.clockOut);
  const pending = updateSession.isPending || deleteAttendance.isPending;

  useEffect(() => {
    if (!open || !target) return;
    resetFieldsFromTarget(target, { setWorkStart, setWorkEnd, setHours, setError });
    setDeleteConfirmOpen(false);
    setIsEditing(initialEditing);
  }, [open, target, initialEditing]);

  const viewSummary = useMemo(() => {
    if (!target) return null;
    const startDate = combineDateAndTime(target.clockIn, workStart);
    if (!startDate) return null;
    const endDate =
      isOpenShift && !isEditing
        ? now
        : combineDateAndTime(target.clockIn, workEnd, startDate);
    if (!endDate) return null;
    const h = hoursBetween(startDate, endDate);
    return {
      startLabel: startDate.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
      endLabel: isOpenShift && !isEditing
        ? "עכשיו"
        : endDate.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
      hours: h > 0 ? (Math.round(h * 100) / 100).toString() : "0",
    };
  }, [target, workStart, workEnd, isOpenShift, isEditing, now]);

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

  function cancelEditing() {
    if (!target) return;
    resetFieldsFromTarget(target, { setWorkStart, setWorkEnd, setHours, setError });
    setIsEditing(false);
  }

  function resolveEndDate(forClockOut: boolean): Date | null {
    if (!target) return null;
    const startDate = combineDateAndTime(target.clockIn, workStart);
    if (!startDate) return null;
    if (forClockOut && isOpenShift) {
      if (isEditing) {
        return combineDateAndTime(target.clockIn, workEnd, startDate);
      }
      return now;
    }
    return combineDateAndTime(target.clockIn, workEnd, startDate);
  }

  async function handleSaveEdits() {
    if (!target) return;
    const startDate = combineDateAndTime(target.clockIn, workStart);
    if (!startDate) {
      setError("יש למלא שעת כניסה תקינה.");
      return;
    }
    if (!isOpenShift) {
      const endDate = combineDateAndTime(target.clockIn, workEnd, startDate);
      if (!endDate) {
        setError("יש למלא שעת יציאה תקינה.");
        return;
      }
      if (endDate.getTime() <= startDate.getTime()) {
        setError("שעת היציאה חייבת להיות אחרי שעת הכניסה.");
        return;
      }
      setError(null);
      try {
        await updateSession.mutateAsync({
          id: target.attendanceId,
          clock_in: startDate.toISOString(),
          clock_out: endDate.toISOString(),
        });
        onClose();
      } catch {
        setError("לא הצלחנו לשמור את השעות. נסו שוב.");
      }
      return;
    }

    setError(null);
    try {
      await updateSession.mutateAsync({
        id: target.attendanceId,
        clock_in: startDate.toISOString(),
      });
      onClose();
    } catch {
      setError("לא הצלחנו לשמור את השעות. נסו שוב.");
    }
  }

  async function handleClockOut() {
    if (!target) return;
    const startDate = combineDateAndTime(target.clockIn, workStart);
    const endDate = resolveEndDate(true);
    if (!startDate || !endDate) {
      setError("יש למלא שעת כניסה ויציאה תקינות.");
      return;
    }
    if (endDate.getTime() <= startDate.getTime()) {
      setError("שעת היציאה חייבת להיות אחרי שעת הכניסה.");
      return;
    }
    setError(null);
    try {
      await updateSession.mutateAsync({
        id: target.attendanceId,
        clock_in: startDate.toISOString(),
        clock_out: endDate.toISOString(),
      });
      onClose();
    } catch {
      setError("לא הצלחנו לשמור את השעות. נסו שוב.");
    }
  }

  async function handleDeleteConfirmed() {
    if (!target) return;
    setError(null);
    try {
      await deleteAttendance.mutateAsync(target.attendanceId);
      setDeleteConfirmOpen(false);
      onClose();
    } catch {
      setError("לא הצלחנו למחוק את ההחתמה. נסו שוב.");
      setDeleteConfirmOpen(false);
    }
  }

  return (
    <>
    <Modal
      open={open && !!target}
      onClose={onClose}
      icon="logout"
      title={isOpenShift ? "הוצאה ממשמרת" : "עריכת נוכחות"}
      subtitle={target?.employeeName}
      footer={
        isEditing ? (
          isOpenShift ? (
            <>
              <Button variant="secondary" onClick={cancelEditing} className="flex-1" disabled={pending}>
                ביטול
              </Button>
              <Button
                variant="secondary"
                icon="check"
                loading={updateSession.isPending}
                onClick={handleSaveEdits}
                className="flex-1"
                disabled={pending}
              >
                שמור
              </Button>
              <Button
                variant="primary"
                icon="logout"
                loading={updateSession.isPending}
                onClick={handleClockOut}
                className="flex-[1.15]"
                disabled={pending}
              >
                הוצא
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={cancelEditing} className="flex-1" disabled={pending}>
                ביטול
              </Button>
              <Button
                variant="primary"
                icon="check"
                loading={updateSession.isPending}
                onClick={handleSaveEdits}
                className="flex-1"
                disabled={pending}
              >
                שמור
              </Button>
            </>
          )
        ) : isOpenShift ? (
          <>
            <Button variant="secondary" onClick={onClose} className="flex-1" disabled={pending}>
              ביטול
            </Button>
            <Button
              variant="primary"
              icon="logout"
              loading={updateSession.isPending}
              onClick={handleClockOut}
              className="flex-1"
              disabled={pending}
            >
              הוצא ממשמרת
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose} className="w-full" disabled={pending}>
            סגור
          </Button>
        )
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
            <div className="force-clock-out__edit-head">
              <span className="force-clock-out__edit-title">שעות עבודה</span>
              {!isEditing && (
                <Button
                  type="button"
                  variant="ghost"
                  icon="edit"
                  className="force-clock-out__edit-btn"
                  onClick={() => setIsEditing(true)}
                  disabled={pending}
                >
                  עריכה
                </Button>
              )}
            </div>

            {isEditing ? (
              <>
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
              </>
            ) : (
              viewSummary && (
                <div className="force-clock-out__view">
                  <div className="force-clock-out__view-times">
                    <div className="force-clock-out__view-cell">
                      <span className="force-clock-out__view-label">כניסה</span>
                      <span className="force-clock-out__view-value">{viewSummary.startLabel}</span>
                    </div>
                    <span className="force-clock-out__dash" aria-hidden>
                      –
                    </span>
                    <div className="force-clock-out__view-cell">
                      <span className="force-clock-out__view-label">יציאה</span>
                      <span className="force-clock-out__view-value" data-live={isOpenShift}>
                        {viewSummary.endLabel}
                      </span>
                    </div>
                  </div>
                  <div className="force-clock-out__view-hours">
                    <span className="force-clock-out__view-label">סה״כ</span>
                    <span className="force-clock-out__view-value">{viewSummary.hours}</span>
                    <span className="force-clock-out__hours-unit">שע׳</span>
                  </div>
                </div>
              )
            )}
          </div>

          {error && <p className="force-clock-out__error">{error}</p>}

          <p className="force-clock-out__note">
            {isEditing
              ? isOpenShift
                ? "«שמור» מעדכן את שעת הכניסה. שעת היציאה תישמר בלחיצה על «הוצא ממשמרת»."
                : "עדכנו כניסה ויציאה ולחצו «שמור»."
              : isOpenShift
                ? "לחצו «עריכה» לתיקון שעות, «הוצא ממשמרת» לסיום, או מחקו את ההחתמה אם העובד/ת לא היה/ה במשמרת."
                : "לחצו «עריכה» לתיקון שעות הכניסה והיציאה."}
          </p>

          <button
            type="button"
            className="force-clock-out__delete"
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={pending}
          >
            מחק מהמשמרת לגמרי
          </button>
        </div>
      )}
    </Modal>

    <Modal
      open={deleteConfirmOpen}
      onClose={() => setDeleteConfirmOpen(false)}
      title="האם אתה בטוח?"
      icon="delete"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => setDeleteConfirmOpen(false)}
            className="flex-1"
            disabled={deleteAttendance.isPending}
          >
            ביטול
          </Button>
          <Button
            variant="danger"
            icon="delete"
            loading={deleteAttendance.isPending}
            onClick={handleDeleteConfirmed}
            className="flex-1"
            disabled={deleteAttendance.isPending}
          >
            מחק מהמשמרת
          </Button>
        </>
      }
    >
      <p className="text-[14px] leading-relaxed text-text-2">
        למחוק את ההחתמה של <strong>{target?.employeeName}</strong> מהמשמרת? פעולה זו אינה ניתנת לביטול.
      </p>
    </Modal>
    </>
  );
}
