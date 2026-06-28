import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Badge, Button, Icon, PageLoader, ErrorState } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
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
  const [exitWarn, setExitWarn] = useState(false);
  const [shiftElapsed, setShiftElapsed] = useState("");

  const userById = useMemo(() => {
    const m = new Map<string, { name: string | null; role: string }>();
    (users ?? []).forEach((u) => m.set(u.id, { name: u.full_name, role: u.role }));
    return m;
  }, [users]);

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

  if (isLoading) return <PageLoader />;
  if (isError || !biz) return <ErrorState onRetry={refetch} />;

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
