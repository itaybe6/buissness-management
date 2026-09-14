import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { resolveGeofenceRules } from "@/lib/attendanceGeofence";
import { attemptClockIn, clockInSuccessText } from "@/lib/attendancePunch";
import { useBusinessId, todayISO, weekStart, addDays } from "@/lib/db";
import { attendancePosition, positionLabel, positionsForEmployee } from "@/lib/employeePositions";
import { pendingTasksForEmployee } from "@/lib/pendingTasks";
import { useBusiness } from "@/api/businesses";
import { useDepartments } from "@/api/departments";
import { useEmployeePositions } from "@/api/employeePositions";
import { useTasks } from "@/api/tasks";
import { useTaskTemplates } from "@/api/taskTemplates";
import { useAttendanceToday, useClockIn, useClockOut } from "@/api/attendance";
import { useActiveShiftTemplates, useShiftAssignments } from "@/api/shifts";
import type { EmployeePosition, ShiftTemplate } from "@/types/database";

export function formatShiftElapsed(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function useShiftPunch() {
  const businessId = useBusinessId();
  const { profile, hasFeature } = useAuth();
  const { data: biz } = useBusiness(businessId);
  const { data: records } = useAttendanceToday(businessId);
  const { data: tasks } = useTasks(businessId);
  const { data: templates } = useTaskTemplates(businessId);
  const { data: shiftTemplates } = useActiveShiftTemplates(businessId);
  const today = todayISO();
  const wk = weekStart();
  const { data: assignments } = useShiftAssignments(businessId, wk, addDays(wk, 6), profile?.id);
  const {
    data: allPositions,
    isPending: positionsPending,
    isError: positionsError,
  } = useEmployeePositions(businessId);
  const { data: departments } = useDepartments(businessId);
  const clockIn = useClockIn(businessId);
  const clockOut = useClockOut(businessId);
  const [clockStatus, setClockStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [exitWarn, setExitWarn] = useState(false);
  const [positionPickerOpen, setPositionPickerOpen] = useState(false);
  const now = useLiveClock();

  /** The positions this employee can enter a shift as (primary first). */
  const myPositions = useMemo(
    () => (profile ? positionsForEmployee(profile, allPositions) : []),
    [profile, allPositions],
  );
  const deptName = useMemo(
    () => (id: string) => (departments ?? []).find((d) => d.id === id)?.name ?? null,
    [departments],
  );

  const showShifts = hasFeature("shifts");
  // No role bypass: when the super admin disables the attendance module the
  // punch clock disappears for everyone in the business.
  const showAttendance = hasFeature("attendance");

  const todayShifts = useMemo(() => {
    if (!showShifts) return [];
    const tplById = new Map((shiftTemplates ?? []).map((t) => [t.id, t]));
    return (assignments ?? [])
      .filter((a) => a.shift_date === today)
      .map((a) => tplById.get(a.shift_template_id))
      .filter((t): t is ShiftTemplate => !!t);
  }, [assignments, shiftTemplates, today, showShifts]);

  const list = records ?? [];
  const myOpen = list.find((r) => r.employee_id === profile?.id && r.clock_in && !r.clock_out);
  const onShift = Boolean(myOpen);
  const shiftElapsed = myOpen?.clock_in ? formatShiftElapsed(now.getTime() - new Date(myOpen.clock_in).getTime()) : null;
  /** Which position the open shift is being worked in — only meaningful for multi-position employees. */
  const onShiftPositionLabel =
    myOpen && myPositions.length > 1 ? positionLabel(attendancePosition(myOpen, myPositions), deptName) : null;

  const pending = profile
    ? pendingTasksForEmployee(
        tasks ?? [],
        templates ?? [],
        profile.id,
        profile.department_id ?? null,
        new Date().getDay(),
        profile.role,
      )
    : [];

  const {
    enabled: geofenceEnabled,
    exempt: geofenceExempt,
    required: geofenceRequired,
    radiusM,
  } = resolveGeofenceRules(biz, profile?.role);

  async function clockInRecord(lat: number | null, lng: number | null, within: boolean, position: EmployeePosition | null) {
    await clockIn.mutateAsync({
      business_id: businessId!,
      employee_id: profile!.id,
      lat,
      lng,
      within_radius: within,
      position_id: position?.id ?? null,
    });
  }

  async function doClockOut() {
    if (!myOpen) return;
    setExitWarn(false);
    try {
      await clockOut.mutateAsync(myOpen.id);
      setClockStatus({ ok: true, text: "הוחתמה יציאה ממשמרת" });
    } catch {
      setClockStatus({ ok: false, text: "החתמת יציאה נכשלה" });
    }
  }

  async function handleClock() {
    if (!profile) return;
    setClockStatus(null);

    if (myOpen) {
      if (pending.length > 0) {
        setExitWarn(true);
        return;
      }
      setBusy(true);
      try {
        await doClockOut();
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!biz) return;

    // Never punch in "blind": until the position list is known we can't tell
    // whether to ask — and a wrong guess files the whole shift on the wrong pay line.
    if (positionsPending) {
      setClockStatus({ ok: false, text: "טוען את התפקידים שלך… נסו שוב בעוד רגע" });
      return;
    }
    if (positionsError) {
      setClockStatus({ ok: false, text: "לא ניתן לטעון את התפקידים — ההחתמה לא בוצעה" });
      return;
    }

    // More than one position: ask which one first; the pick continues the punch.
    if (myPositions.length > 1) {
      setPositionPickerOpen(true);
      return;
    }
    await clockInAs(myPositions[0] ?? null);
  }

  /** Run the geofence check and record the punch under the given position. */
  async function clockInAs(position: EmployeePosition | null) {
    if (!profile || !biz) return;
    setPositionPickerOpen(false);
    setBusy(true);
    try {
      const { decision, position: fix } = await attemptClockIn({ business: biz, role: position?.role ?? profile.role });
      if (!decision.allowed) {
        setClockStatus({ ok: false, text: decision.message });
        return;
      }
      try {
        await clockInRecord(fix?.lat ?? null, fix?.lng ?? null, decision.within, position);
        const label = position && myPositions.length > 1 ? ` · ${positionLabel(position, deptName)}` : "";
        setClockStatus({ ok: true, text: `${clockInSuccessText(decision)}${label}` });
      } catch {
        setClockStatus({ ok: false, text: "החתמה נכשלה" });
      }
    } finally {
      setBusy(false);
    }
  }

  /** Props for `<ShiftPositionPickerModal>` — consumers render it next to the punch button. */
  const positionPicker = {
    open: positionPickerOpen,
    positions: myPositions,
    deptName,
    busy,
    onPick: clockInAs,
    onClose: () => setPositionPickerOpen(false),
  };

  return {
    myPositions,
    onShiftPositionLabel,
    positionPicker,
    biz,
    profile,
    showAttendance,
    showShifts,
    todayShifts,
    onShift,
    shiftElapsed,
    pending,
    geofenceEnabled,
    geofenceExempt,
    geofenceRequired,
    radiusM,
    clockStatus,
    busy,
    exitWarn,
    setExitWarn,
    handleClock,
    doClockOut,
    clockOutPending: clockOut.isPending,
    now,
  };
}
