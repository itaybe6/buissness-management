import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Icon, PageLoader, ErrorState } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import {
  AttendanceFeedEmpty,
  AttendanceFeedRow,
  AttendancePanel,
  AttendanceStatusToast,
  AttendanceSummaryCell,
  GeofenceRadar,
  LiveClockDigits,
  PunchButton,
  ShiftPulse,
  StatusBanner,
} from "@/components/attendance/attendance-motion";
import { useAuth } from "@/lib/auth";
import { ATTENDANCE_RADIUS_M } from "@/lib/constants";
import { useBusinessId, initialsOf, colorFor } from "@/lib/db";
import { pendingTasksForEmployee } from "@/lib/pendingTasks";
import { useBusiness } from "@/api/businesses";
import { useProfiles } from "@/api/users";
import { useTasks } from "@/api/tasks";
import { useTaskTemplates } from "@/api/taskTemplates";
import { useAttendanceToday, useClockIn, useClockOut } from "@/api/attendance";

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

export function Attendance() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: biz, isLoading, isError, refetch } = useBusiness(businessId);
  const { data: records } = useAttendanceToday(businessId);
  const { data: users } = useProfiles(businessId);
  const { data: tasks } = useTasks(businessId);
  const { data: templates } = useTaskTemplates(businessId);
  const clockIn = useClockIn(businessId);
  const clockOut = useClockOut(businessId);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [exitWarn, setExitWarn] = useState(false);
  const now = useLiveClock();

  const userById = useMemo(() => {
    const m = new Map<string, { name: string | null; role: string }>();
    (users ?? []).forEach((u) => m.set(u.id, { name: u.full_name, role: u.role }));
    return m;
  }, [users]);

  const list = records ?? [];
  const onShiftCount = list.filter((r) => r.clock_in && !r.clock_out).length;
  const completedCount = list.filter((r) => r.clock_out).length;

  const myOpen = list.find((r) => r.employee_id === profile?.id && r.clock_in && !r.clock_out);

  const pending = profile
    ? pendingTasksForEmployee(tasks ?? [], templates ?? [], profile.id, profile.department_id ?? null, new Date().getDay())
    : [];

  async function doClockOut() {
    if (!myOpen) return;
    setExitWarn(false);
    await clockOut.mutateAsync(myOpen.id);
    setStatus({ ok: true, text: "הוחתמה יציאה ממשמרת" });
  }

  if (isLoading) return <PageLoader />;
  if (isError || !biz) return <ErrorState onRetry={refetch} />;

  const onShift = Boolean(myOpen);
  const shiftElapsed = myOpen?.clock_in ? formatElapsed(now.getTime() - new Date(myOpen.clock_in).getTime()) : null;
  const locationReady = biz.location_lat != null && biz.location_lng != null;
  const geofenceEnabled = biz.attendance_geofence_enabled;
  const geofenceExempt = Boolean(
    profile && biz.attendance_geofence_exempt_roles?.includes(profile.role),
  );
  const geofenceRequired = geofenceEnabled && !geofenceExempt;
  const radiusM = biz.location_radius_m ?? ATTENDANCE_RADIUS_M;
  const timeStr = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });

  async function clockInRecord(lat: number | null, lng: number | null, within: boolean) {
    await clockIn.mutateAsync({
      business_id: businessId!,
      employee_id: profile!.id,
      lat,
      lng,
      within_radius: within,
    });
  }

  async function handleClock() {
    setStatus(null);
    if (!biz) return;
    if (myOpen) {
      if (pending.length > 0) {
        setExitWarn(true);
        return;
      }
      await doClockOut();
      return;
    }

    if (!geofenceRequired) {
      setBusy(true);
      try {
        await clockInRecord(null, null, false);
        setStatus({
          ok: true,
          text: geofenceExempt ? "כניסה הוחתמה · ללא בדיקת מיקום" : "כניסה הוחתמה",
        });
      } catch {
        setStatus({ ok: false, text: "החתמה נכשלה" });
      } finally {
        setBusy(false);
      }
      return;
    }

    if (biz.location_lat == null || biz.location_lng == null) {
      setStatus({ ok: false, text: "מיקום העסק לא הוגדר. פנו למנהל." });
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const d = distanceM(pos.coords.latitude, pos.coords.longitude, biz.location_lat!, biz.location_lng!);
        const within = d <= radiusM;
        if (!within) {
          setStatus({ ok: false, text: `אתם במרחק ${Math.round(d)} מ׳ מחוץ לרדיוס (${radiusM} מ׳)` });
          setBusy(false);
          return;
        }
        try {
          await clockInRecord(pos.coords.latitude, pos.coords.longitude, within);
          setStatus({ ok: true, text: `כניסה הוחתמה · ${Math.round(d)} מ׳ מהעסק` });
        } catch {
          setStatus({ ok: false, text: "החתמה נכשלה" });
        } finally {
          setBusy(false);
        }
      },
      () => {
        setStatus({ ok: false, text: "לא ניתן לקבל מיקום מהדפדפן" });
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="w-full animate-fadeUp px-1">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-3">נוכחות · היום</p>
          <h1 className="mt-1 text-[clamp(1.75rem,4vw,2.35rem)] font-extrabold tracking-tight leading-none text-text">
            שעון נוכחות
          </h1>
          <p className="mt-2 max-w-[52ch] text-[14.5px] leading-relaxed text-text-2">
            {geofenceExempt
              ? "התפקיד שלך פטור מבדיקת מיקום — ניתן להחתים נוכחות מכל מקום."
              : geofenceEnabled
                ? `החתמה מותנית במיקום GPS בתוך רדיוס של ${radiusM} מטרים ממקום העבודה.`
                : "בדיקת מיקום כבויה — ניתן להחתים נוכחות מכל מקום."}
          </p>
        </div>
        <div className="attendance-summary shrink-0">
          <AttendanceSummaryCell value={onShiftCount} label="במשמרת עכשיו" accent="var(--success)" index={0} />
          <AttendanceSummaryCell value={completedCount} label="סיימו היום" index={1} />
          <AttendanceSummaryCell value={list.length} label="סה״כ רשומות" index={2} />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6">
        <AttendancePanel>
          <div className="grid gap-0 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="border-b border-border-2 p-6 lg:border-b-0 lg:border-l lg:pl-8 lg:pr-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <LiveClockDigits time={timeStr} />
                  <div className="mt-2 text-[14px] font-medium capitalize text-text-2">{dateStr}</div>
                </div>
                {onShift && shiftElapsed && <ShiftPulse label={`במשמרת · ${shiftElapsed}`} />}
              </div>

              <div className="mt-5 min-h-[44px]">
                <StatusBanner>
                  {status ? (
                    <AttendanceStatusToast key={status.text} ok={status.ok} text={status.text} />
                  ) : null}
                </StatusBanner>
              </div>

              <div className="mt-6 space-y-3">
                <PunchButton onShift={onShift} busy={busy} onClick={handleClock} />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-text-3">
                  {geofenceRequired && (
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name="radar" size={16} />
                      רדיוס מאושר: {radiusM} מ׳
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <Icon
                      name={
                        geofenceExempt
                          ? "travel_explore"
                          : geofenceEnabled
                            ? locationReady
                              ? "location_on"
                              : "location_off"
                            : "location_disabled"
                      }
                      size={16}
                    />
                    {geofenceExempt
                      ? "פטור/ה מבדיקת מיקום"
                      : geofenceEnabled
                        ? locationReady
                          ? "מיקום העסק מוגדר"
                          : "מיקום העסק חסר"
                        : "בדיקת מיקום כבויה"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center px-6 py-8 lg:py-10">
              <GeofenceRadar active={onShift} />
            </div>
          </div>
        </AttendancePanel>

        <AttendancePanel>
          <div className="border-b border-border-2 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-bold text-text">נוכחות היום</h2>
                <p className="mt-0.5 text-[12.5px] text-text-3">עדכון לפי החתמות בזמן אמת</p>
              </div>
              <span className="rounded-full bg-surface-2 px-3 py-1 font-mono text-[12px] font-bold tabular-nums text-text-2">
                {list.length}
              </span>
            </div>
          </div>

          <div className="max-h-[min(520px,58vh)] overflow-y-auto">
            {list.length === 0 ? (
              <AttendanceFeedEmpty />
            ) : (
              <div>
                {list.map((r, index) => {
                  const u = userById.get(r.employee_id);
                  const open = Boolean(r.clock_in && !r.clock_out);
                  const inTime = r.clock_in
                    ? new Date(r.clock_in).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
                    : "—";
                  const outTime = r.clock_out
                    ? new Date(r.clock_out).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
                    : null;

                  return (
                    <AttendanceFeedRow key={r.id} index={index}>
                      <span
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-[13px] font-bold text-white"
                        style={{ background: colorFor(r.employee_id) }}
                      >
                        {initialsOf(u?.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-bold text-text">{u?.name ?? "עובד/ת"}</div>
                        <div className="mt-0.5 font-mono text-[12px] tabular-nums text-text-3">
                          {inTime}
                          <span className="mx-1 text-text-3">←</span>
                          {outTime ?? "…"}
                        </div>
                      </div>
                      <div className="shrink-0 text-left">
                        {open ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-2.5 py-1 text-[11px] font-bold text-success">
                            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse2" />
                            במשמרת
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-text-3">יצא/ה</span>
                        )}
                      </div>
                    </AttendanceFeedRow>
                  );
                })}
              </div>
            )}
          </div>
        </AttendancePanel>
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
                style={{ color: t.type === "recurring" ? "var(--accent-2)" : "var(--info)" }}
              />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{t.title}</span>
              <Badge tone={t.type === "recurring" ? "violet" : "info"}>
                {t.type === "recurring" ? "קבועה" : "חד-פעמית"}
              </Badge>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
