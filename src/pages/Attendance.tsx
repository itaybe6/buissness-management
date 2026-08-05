import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Badge, Button, Icon, PageLoader, ErrorState } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import {
  AttendancePanel,
  AttendanceStatusToast,
  GeofenceRadar,
  LiveClockDigits,
  PunchButton,
  ShiftPulse,
  StatusBanner,
} from "@/components/attendance/attendance-motion";
import { useAuth } from "@/lib/auth";
import { canForceEmployeeClockOut } from "@/lib/constants";
import { resolveGeofenceRules } from "@/lib/attendanceGeofence";
import { attemptClockIn, clockInSuccessText } from "@/lib/attendancePunch";
import { useBusinessId, todayISO, weekStart, addDays } from "@/lib/db";
import { pendingTasksForEmployee } from "@/lib/pendingTasks";
import {
  filterAttendanceForTodayShift,
  groupAttendanceByDepartment,
  groupAttendanceByEmployee,
  type AttendanceShiftFilter,
} from "@/lib/attendanceFeed";
import { useBusiness } from "@/api/businesses";
import { useProfiles } from "@/api/users";
import { useDepartments } from "@/api/departments";
import { useTasks } from "@/api/tasks";
import { useTaskTemplates } from "@/api/taskTemplates";
import { useAttendanceToday, useClockIn, useClockOut } from "@/api/attendance";
import { useActiveShiftTemplates, useShiftAssignments } from "@/api/shifts";
import { AttendanceMobileView } from "@/components/attendance/AttendanceMobileView";
import { AttendanceTodayFeedSection } from "@/components/attendance/AttendanceTodayFeedSection";
import { ForceClockOutModal, type ForceClockOutTarget, type OpenForceClockOutOptions } from "@/components/attendance/ForceClockOutModal";

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
  const { profile, hasFeature } = useAuth();
  const { data: biz, isLoading: bizLoading, isError, refetch } = useBusiness(businessId);
  const { data: records, isLoading: recordsLoading } = useAttendanceToday(businessId);
  const { data: users, isLoading: usersLoading } = useProfiles(businessId);
  const { data: departments, isLoading: departmentsLoading } = useDepartments(businessId);
  const { data: tasks, isLoading: tasksLoading } = useTasks(businessId);
  const { data: templates, isLoading: templatesLoading } = useTaskTemplates(businessId);
  const { data: shiftTemplates } = useActiveShiftTemplates(businessId);
  const today = todayISO();
  const wk = weekStart();
  const { data: assignments } = useShiftAssignments(businessId, wk, addDays(wk, 6));
  const clockIn = useClockIn(businessId);
  const clockOut = useClockOut(businessId);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [exitWarn, setExitWarn] = useState(false);
  const [feedFilter, setFeedFilter] = useState<AttendanceShiftFilter>("all");
  const [clockOutTarget, setClockOutTarget] = useState<ForceClockOutTarget | null>(null);
  const [clockOutEditMode, setClockOutEditMode] = useState(false);
  const now = useLiveClock();

  function handleRequestClockOut(target: ForceClockOutTarget, options?: OpenForceClockOutOptions) {
    setClockOutEditMode(options?.startInEditMode ?? false);
    setClockOutTarget(target);
  }

  function closeClockOutModal() {
    setClockOutTarget(null);
    setClockOutEditMode(false);
  }

  const canForceClockOut = canForceEmployeeClockOut(profile?.role);

  const userById = useMemo(() => {
    const m = new Map<string, { name: string | null; role: string; departmentId: string | null }>();
    (users ?? []).forEach((u) =>
      m.set(u.id, { name: u.full_name, role: u.role, departmentId: u.department_id }),
    );
    return m;
  }, [users]);

  const list = records ?? [];
  const shiftsEnabled = hasFeature("shifts");
  const todayFeed = useMemo(() => {
    const filtered = filterAttendanceForTodayShift({
      records: list,
      today,
      assignments: assignments ?? [],
      templates: shiftTemplates ?? [],
      shiftsEnabled,
      now,
    });
    return groupAttendanceByEmployee(filtered);
  }, [list, today, assignments, shiftTemplates, shiftsEnabled, now]);

  const feedByDepartment = useMemo(() => {
    const employeeInfo = new Map<string, { departmentId: string | null | undefined; role: string }>();
    for (const [id, u] of userById) employeeInfo.set(id, { departmentId: u.departmentId, role: u.role });
    return groupAttendanceByDepartment(todayFeed, departments ?? [], employeeInfo);
  }, [todayFeed, departments, userById]);

  const onShiftCount = todayFeed.filter((g) => g.onShift).length;
  const completedCount = todayFeed.filter((g) => !g.onShift).length;

  const myOpen = list.find((r) => r.employee_id === profile?.id && r.clock_in && !r.clock_out);

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

  async function doClockOut() {
    if (!myOpen) return;
    setExitWarn(false);
    try {
      await clockOut.mutateAsync(myOpen.id);
      setStatus({ ok: true, text: "הוחתמה יציאה ממשמרת" });
    } catch {
      setStatus({ ok: false, text: "החתמת יציאה נכשלה" });
    }
  }

  // Workers / shift managers punch from the home dashboard, not this page.
  if (profile && (profile.role === "employee" || profile.role === "shift_manager")) {
    return <Navigate to="/dashboard" replace />;
  }

  const pageLoading =
    bizLoading ||
    recordsLoading ||
    usersLoading ||
    departmentsLoading ||
    tasksLoading ||
    templatesLoading;

  if (pageLoading) return <PageLoader label="טוען נוכחות..." />;
  if (isError || !biz) return <ErrorState onRetry={refetch} />;

  const onShift = Boolean(myOpen);
  const shiftElapsed = myOpen?.clock_in ? formatElapsed(now.getTime() - new Date(myOpen.clock_in).getTime()) : null;
  const locationReady = biz.location_lat != null && biz.location_lng != null;
  const {
    enabled: geofenceEnabled,
    exempt: geofenceExempt,
    required: geofenceRequired,
    radiusM,
  } = resolveGeofenceRules(biz, profile?.role);
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

    if (!biz || !profile) return;

    setBusy(true);
    try {
      const { decision, position } = await attemptClockIn({ business: biz, role: profile.role });
      if (!decision.allowed) {
        setStatus({ ok: false, text: decision.message });
        return;
      }
      try {
        await clockInRecord(position?.lat ?? null, position?.lng ?? null, decision.within);
        setStatus({ ok: true, text: clockInSuccessText(decision) });
      } catch {
        setStatus({ ok: false, text: "החתמה נכשלה" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full animate-fadeUp">
      {/* ── Mobile: app-like punch screen ── */}
      <div className="md:hidden">
        <AttendanceMobileView
          onShiftCount={onShiftCount}
          completedCount={completedCount}
          totalCount={todayFeed.length}
          timeStr={timeStr}
          onShift={onShift}
          shiftElapsed={shiftElapsed}
          status={status}
          busy={busy}
          shiftsEnabled={shiftsEnabled}
          todayFeed={todayFeed}
          feedByDepartment={feedByDepartment}
          userById={userById}
          onPunch={handleClock}
          canForceClockOut={canForceClockOut}
          onRequestClockOut={handleRequestClockOut}
        />
      </div>

      {/* ── Desktop ── */}
      <div className="attendance-desk hidden md:block">
        <h1 className="sr-only">שעון נוכחות</h1>

        <div className="attendance-desk-grid">
          <AttendancePanel className="attendance-desk-station">
            <div className="attendance-desk-station-inner">
              <div className="attendance-desk-station-top">
                <div>
                  <div className="attendance-desk-date">תחנת החתמה</div>
                  <p className="attendance-desk-station-hint">
                    {onShift ? "אתם במשמרת פעילה — לחצו ליציאה כשתסיימו" : "לחצו להחתמת כניסה לתחילת המשמרת"}
                  </p>
                </div>
                {onShift && shiftElapsed ? (
                  <ShiftPulse label={`במשמרת · ${shiftElapsed}`} />
                ) : (
                  <span className="attendance-desk-idle-chip">מחוץ למשמרת</span>
                )}
              </div>

              <div className="attendance-desk-clock-block" data-on-shift={onShift}>
                <div className="attendance-desk-clock-ring" aria-hidden>
                  <GeofenceRadar active={onShift} compact />
                </div>
                <div className="attendance-desk-clock-face">
                  <LiveClockDigits time={timeStr} />
                  <div className="attendance-desk-clock-caption">{dateStr}</div>
                </div>
              </div>

              <div className="attendance-desk-status">
                <StatusBanner>
                  {status ? (
                    <AttendanceStatusToast key={status.text} ok={status.ok} text={status.text} />
                  ) : null}
                </StatusBanner>
              </div>

              <div className="attendance-desk-actions">
                <PunchButton onShift={onShift} busy={busy} onClick={handleClock} />
                <div className="attendance-desk-meta">
                  {geofenceRequired && (
                    <span className="attendance-desk-meta-item">
                      <Icon name="radar" size={16} />
                      רדיוס מאושר: {radiusM} מ׳
                    </span>
                  )}
                  <span className="attendance-desk-meta-item">
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
          </AttendancePanel>

          <AttendancePanel className="attendance-desk-feed">
            <AttendanceTodayFeedSection
              shiftsEnabled={shiftsEnabled}
              todayFeed={todayFeed}
              feedByDepartment={feedByDepartment}
              userById={userById}
              variant="desktop"
              filter={feedFilter}
              showFilterBar
              onFilterChange={setFeedFilter}
              canForceClockOut={canForceClockOut}
              onRequestClockOut={handleRequestClockOut}
            />
          </AttendancePanel>
        </div>
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

      <ForceClockOutModal
        open={!!clockOutTarget}
        target={clockOutTarget}
        businessId={businessId}
        initialEditing={clockOutEditMode}
        onClose={closeClockOutModal}
      />
    </div>
  );
}
