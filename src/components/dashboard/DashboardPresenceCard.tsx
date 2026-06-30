import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import {
  AttendanceStatusToast,
  PunchButton,
  ShiftPulse,
  StatusBanner,
} from "@/components/attendance/attendance-motion";
import { useAuth } from "@/lib/auth";
import { ATTENDANCE_RADIUS_M } from "@/lib/constants";
import { useBusinessId, todayISO, weekStart, addDays } from "@/lib/db";
import { pendingTasksForEmployee } from "@/lib/pendingTasks";
import { useBusiness } from "@/api/businesses";
import { useTasks } from "@/api/tasks";
import { useTaskTemplates } from "@/api/taskTemplates";
import { useAttendanceToday, useClockIn, useClockOut } from "@/api/attendance";
import { useActiveShiftTemplates, useShiftAssignments } from "@/api/shifts";
import { DailyTasksChecklist, useDailyTaskActions } from "@/components/tasks/DailyTasksChecklist";
import type { ShiftTemplate } from "@/types/database";

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatElapsed(ms: number) {
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
  const { todayTasks, setStatus: setTaskStatus, setMedia: setTaskMedia } = useDailyTaskActions(
    businessId ?? "",
    profile?.id ?? "",
    profile?.department_id ?? null,
  );

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
  const shiftElapsed = myOpen?.clock_in ? formatElapsed(now.getTime() - new Date(myOpen.clock_in).getTime()) : null;

  const pending = profile
    ? pendingTasksForEmployee(tasks ?? [], templates ?? [], profile.id, profile.department_id ?? null, new Date().getDay())
    : [];

  if (!biz || !profile) return null;

  const business = biz;
  const geofenceEnabled = business.attendance_geofence_enabled;
  const radiusM = business.location_radius_m ?? ATTENDANCE_RADIUS_M;

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

    if (business.location_lat == null || business.location_lng == null) {
      setClockStatus({ ok: false, text: "מיקום העסק לא הוגדר. פנו למנהל." });
      return;
    }

    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const d = distanceM(pos.coords.latitude, pos.coords.longitude, business.location_lat!, business.location_lng!);
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
            <Button variant="danger" icon="logout" loading={clockOut.isPending} onClick={doClockOut} className="flex-1">
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
