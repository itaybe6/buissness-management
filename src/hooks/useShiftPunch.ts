import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ATTENDANCE_RADIUS_M } from "@/lib/constants";
import { useBusinessId, todayISO, weekStart, addDays } from "@/lib/db";
import { pendingTasksForEmployee } from "@/lib/pendingTasks";
import { useBusiness } from "@/api/businesses";
import { useTasks } from "@/api/tasks";
import { useTaskTemplates } from "@/api/taskTemplates";
import { useAttendanceToday, useClockIn, useClockOut } from "@/api/attendance";
import { useActiveShiftTemplates, useShiftAssignments } from "@/api/shifts";
import type { ShiftTemplate } from "@/types/database";

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  const clockIn = useClockIn(businessId);
  const clockOut = useClockOut(businessId);
  const [clockStatus, setClockStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [exitWarn, setExitWarn] = useState(false);
  const now = useLiveClock();

  const showShifts = hasFeature("shifts");
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

  const pending = profile
    ? pendingTasksForEmployee(tasks ?? [], templates ?? [], profile.id, profile.department_id ?? null, new Date().getDay())
    : [];

  const geofenceEnabled = biz?.attendance_geofence_enabled ?? false;
  const radiusM = biz?.location_radius_m ?? ATTENDANCE_RADIUS_M;

  async function clockInRecord(lat: number | null, lng: number | null, within: boolean) {
    await clockIn.mutateAsync({
      business_id: businessId!,
      employee_id: profile!.id,
      lat,
      lng,
      within_radius: within,
    });
  }

  async function doClockOut() {
    if (!myOpen) return;
    setExitWarn(false);
    await clockOut.mutateAsync(myOpen.id);
    setClockStatus({ ok: true, text: "הוחתמה יציאה ממשמרת" });
  }

  async function handleClock() {
    if (!biz || !profile) return;
    setClockStatus(null);

    if (myOpen) {
      if (pending.length > 0) {
        setExitWarn(true);
        return;
      }
      await doClockOut();
      return;
    }

    if (!geofenceEnabled) {
      setBusy(true);
      try {
        await clockInRecord(null, null, false);
        setClockStatus({ ok: true, text: "כניסה הוחתמה" });
      } catch {
        setClockStatus({ ok: false, text: "החתמה נכשלה" });
      } finally {
        setBusy(false);
      }
      return;
    }

    if (biz.location_lat == null || biz.location_lng == null) {
      setClockStatus({ ok: false, text: "מיקום העסק לא הוגדר. פנו למנהל." });
      return;
    }

    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const d = distanceM(pos.coords.latitude, pos.coords.longitude, biz.location_lat!, biz.location_lng!);
        const within = d <= radiusM;
        if (!within) {
          setClockStatus({ ok: false, text: `אתם במרחק ${Math.round(d)} מ׳ מחוץ לרדיוס (${radiusM} מ׳)` });
          setBusy(false);
          return;
        }
        try {
          await clockInRecord(pos.coords.latitude, pos.coords.longitude, within);
          setClockStatus({ ok: true, text: `כניסה הוחתמה · ${Math.round(d)} מ׳ מהעסק` });
        } catch {
          setClockStatus({ ok: false, text: "החתמה נכשלה" });
        } finally {
          setBusy(false);
        }
      },
      () => {
        setClockStatus({ ok: false, text: "לא ניתן לקבל מיקום מהדפדפן" });
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return {
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
    clockOutPending: clockOut.isPending,
    now,
  };
}
