import { useEffect, useMemo, useState } from "react";
<<<<<<< HEAD
import { Icon, PageLoader, ErrorState } from "@/components/ui";
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
=======
import { motion, useReducedMotion } from "motion/react";
import { Badge, Button, Icon, PageLoader, ErrorState } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
>>>>>>> a037aa1474cf6694a900794a50193c5055ceb385
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

<<<<<<< HEAD
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
=======
function formatDuration(ms: number) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")} שעות`;
  return `${m} דקות`;
}

function LiveClock({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={className}>
      <div className="attendance-live-time">
        {now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
      </div>
      <div className="attendance-live-date">
        {now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
      </div>
    </div>
  );
>>>>>>> a037aa1474cf6694a900794a50193c5055ceb385
}

export function Attendance() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const reduceMotion = useReducedMotion();
  const { data: biz, isLoading, isError, refetch } = useBusiness(businessId);
  const { data: records } = useAttendanceToday(businessId);
  const { data: users } = useProfiles(businessId);
  const { data: tasks } = useTasks(businessId);
  const { data: templates } = useTaskTemplates(businessId);
  const clockIn = useClockIn(businessId);
  const clockOut = useClockOut(businessId);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
<<<<<<< HEAD
  const now = useLiveClock();
=======
  const [exitWarn, setExitWarn] = useState(false);
  const [shiftElapsed, setShiftElapsed] = useState("");
>>>>>>> a037aa1474cf6694a900794a50193c5055ceb385

  const userById = useMemo(() => {
    const m = new Map<string, { name: string | null; role: string }>();
    (users ?? []).forEach((u) => m.set(u.id, { name: u.full_name, role: u.role }));
    return m;
  }, [users]);

<<<<<<< HEAD
  const list = records ?? [];
  const onShiftCount = list.filter((r) => r.clock_in && !r.clock_out).length;
  const completedCount = list.filter((r) => r.clock_out).length;
=======
  const myOpen = (records ?? []).find((r) => r.employee_id === profile?.id && r.clock_in && !r.clock_out);

  useEffect(() => {
    if (!myOpen?.clock_in) {
      setShiftElapsed("");
      return;
    }
    const start = new Date(myOpen.clock_in).getTime();
    const tick = () => setShiftElapsed(formatDuration(Date.now() - start));
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [myOpen?.clock_in, myOpen?.id]);
>>>>>>> a037aa1474cf6694a900794a50193c5055ceb385

  if (isLoading) return <PageLoader />;
  if (isError || !biz) return <ErrorState onRetry={refetch} />;

<<<<<<< HEAD
  const myOpen = list.find((r) => r.employee_id === profile?.id && r.clock_in && !r.clock_out);
  const onShift = Boolean(myOpen);
  const shiftElapsed = myOpen?.clock_in ? formatElapsed(now.getTime() - new Date(myOpen.clock_in).getTime()) : null;
  const locationReady = biz.location_lat != null && biz.location_lng != null;
  const timeStr = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
=======
  const onShiftCount = (records ?? []).filter((r) => r.clock_in && !r.clock_out).length;
  const totalToday = (records ?? []).length;

  const pending = profile
    ? pendingTasksForEmployee(tasks ?? [], templates ?? [], profile.id, profile.department_id ?? null, new Date().getDay())
    : [];

  async function doClockOut() {
    if (!myOpen) return;
    setExitWarn(false);
    await clockOut.mutateAsync(myOpen.id);
    setStatus({ ok: true, text: "הוחתמה יציאה ממשמרת" });
  }
>>>>>>> a037aa1474cf6694a900794a50193c5055ceb385

  async function handleClock() {
    setStatus(null);
    if (!biz) return;
    if (myOpen) {
<<<<<<< HEAD
      await clockOut.mutateAsync(myOpen.id);
      setStatus({ ok: true, text: "הוחתמה יציאה · יום עבודה נעים" });
=======
      if (pending.length > 0) {
        setExitWarn(true);
        return;
      }
      await doClockOut();
>>>>>>> a037aa1474cf6694a900794a50193c5055ceb385
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
        const radius = ATTENDANCE_RADIUS_M;
        const within = d <= radius;
        if (!within) {
          setStatus({ ok: false, text: `אתם במרחק ${Math.round(d)} מ׳ מחוץ לרדיוס (${radius} מ׳)` });
          setBusy(false);
          return;
        }
        await clockIn.mutateAsync({
          business_id: businessId!,
          employee_id: profile!.id,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          within_radius: within,
        });
        setStatus({ ok: true, text: `כניסה הוחתמה · ${Math.round(d)} מ׳ מהעסק` });
        setBusy(false);
      },
      () => {
        setStatus({ ok: false, text: "לא ניתן לקבל מיקום מהדפדפן" });
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

<<<<<<< HEAD
  return (
    <div className="mx-auto max-w-[1200px] animate-fadeUp px-1">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-3">נוכחות · היום</p>
          <h1 className="mt-1 text-[clamp(1.75rem,4vw,2.35rem)] font-extrabold tracking-tight leading-none text-text">
            שעון נוכחות
          </h1>
          <p className="mt-2 max-w-[52ch] text-[14.5px] leading-relaxed text-text-2">
            החתמה מותנית במיקום GPS בתוך רדיוס של {ATTENDANCE_RADIUS_M} מטרים ממקום העבודה.
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
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="radar" size={16} />
                    רדיוס מאושר: {ATTENDANCE_RADIUS_M} מ׳
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name={locationReady ? "location_on" : "location_off"} size={16} />
                    {locationReady ? "מיקום העסק מוגדר" : "מיקום העסק חסר"}
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
=======
  const sortedRecords = [...(records ?? [])].sort((a, b) => {
    const aOpen = a.clock_in && !a.clock_out;
    const bOpen = b.clock_in && !b.clock_out;
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return (b.clock_in ?? "").localeCompare(a.clock_in ?? "");
  });

  return (
    <div className="mx-auto max-w-[1180px] animate-fadeUp">
      <header className="page-hero">
        <div className="page-hero-inner">
          <div>
            <h1 className="page-hero-title">שעון נוכחות</h1>
            <p className="page-hero-sub">
              החתמה מותנית במיקום ליד {biz.location_address ? biz.location_address : "מקום העבודה"} · רדיוס {ATTENDANCE_RADIUS_M} מ׳
            </p>
          </div>
          <div className="page-hero-stats">
            <div className="page-hero-stat">
              <Icon name="groups" size={18} style={{ color: "var(--accent-2)" }} />
              <span><strong>{onShiftCount}</strong> במשמרת</span>
            </div>
            <div className="page-hero-stat">
              <Icon name="history" size={18} style={{ color: "var(--info)" }} />
              <span><strong>{totalToday}</strong> החתמות היום</span>
            </div>
            {myOpen && shiftElapsed && (
              <div className="page-hero-stat">
                <Icon name="timer" size={18} style={{ color: "var(--success)" }} />
                <span>משמרתך <strong>{shiftElapsed}</strong></span>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="attendance-layout">
        <section className="attendance-station" data-on-shift={myOpen ? "true" : "false"}>
          <div className="attendance-station-glow" />
          <div className="attendance-station-grid" />
          <div className="attendance-station-body">
            <div className="attendance-orbit-wrap">
              <div className="attendance-orbit-ring" />
              <div className="attendance-orbit-ring attendance-orbit-ring--inner" />
              <div className="attendance-orbit-core">
                <LiveClock />
              </div>
            </div>

            <div className="attendance-status-pill" data-on-shift={myOpen ? "true" : "false"}>
              <span className="attendance-status-dot" />
              {myOpen ? "אתה במשמרת" : "לא במשמרת"}
            </div>

            {status && (
              <div className="attendance-feedback" data-ok={status.ok}>
                <Icon name={status.ok ? "check_circle" : "error"} size={17} />
                {status.text}
              </div>
            )}

            <button
              type="button"
              onClick={handleClock}
              disabled={busy || clockIn.isPending || clockOut.isPending}
              className="attendance-action"
              data-mode={myOpen ? "out" : "in"}
            >
              {busy || clockIn.isPending || clockOut.isPending ? (
                <Icon name="sync" size={22} className="animate-spin" />
              ) : (
                <Icon name={myOpen ? "logout" : "login"} size={22} />
              )}
              {myOpen ? "החתמת יציאה" : "החתמת כניסה"}
            </button>
          </div>
        </section>

        <section className="attendance-feed">
          <div className="attendance-feed-head">
            <div className="attendance-feed-title">נוכחות היום</div>
            <Badge tone="neutral">{totalToday} רשומות</Badge>
          </div>
          <div className="attendance-feed-list">
            {sortedRecords.length === 0 && (
              <div className="py-10 text-center text-[13px] text-text-3">אין החתמות היום.</div>
            )}
            {sortedRecords.map((r, i) => {
              const u = userById.get(r.employee_id);
              const open = Boolean(r.clock_in && !r.clock_out);
              return (
                <motion.div
                  key={r.id}
                  className="attendance-row"
                  data-open={open}
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.04, ease: [0.23, 1, 0.32, 1] }}
                >
                  <span className="attendance-row-avatar" style={{ background: colorFor(r.employee_id) }}>
                    {initialsOf(u?.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold truncate">{u?.name}</div>
                  </div>
                  <div>
                    <div className="attendance-row-times">
                      {r.clock_in
                        ? new Date(r.clock_in).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
                        : "-"}
                      <span>
                        {" "}
                        →{" "}
                        {r.clock_out
                          ? new Date(r.clock_out).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
                          : "…"}
                      </span>
                    </div>
                    <div className="attendance-row-badge" data-open={open}>
                      {open ? "במשמרת" : "יצא/ה"}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
>>>>>>> a037aa1474cf6694a900794a50193c5055ceb385
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
