import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui";
import { AddEmployeeToShiftSheet } from "@/components/attendance/AddEmployeeToShiftSheet";
import { AttendanceTodayFeedSection } from "@/components/attendance/AttendanceTodayFeedSection";
import { ForceClockOutModal, type ForceClockOutTarget, type OpenForceClockOutOptions } from "@/components/attendance/ForceClockOutModal";
import { useAttendanceToday } from "@/api/attendance";
import { useDepartments } from "@/api/departments";
import { useActiveShiftTemplates, useShiftAssignments } from "@/api/shifts";
import { useProfiles } from "@/api/users";
import { useIsMdUp } from "@/hooks/useMediaQuery";
import { useAuth } from "@/lib/auth";
import { employeeIdsOnOpenPunch } from "@/lib/addEmployeeToShift";
import { canForceEmployeeClockIn, canForceEmployeeClockOut } from "@/lib/constants";
import {
  annotateExceedingShiftHours,
  attendanceBelongsToTodayFeed,
  groupAttendanceByDepartment,
  groupAttendanceByEmployee,
  type AttendanceShiftFilter,
} from "@/lib/attendanceFeed";
import { addDays, useBusinessId, todayISO, weekStart } from "@/lib/db";

const STAT_FILTERS: { filter: AttendanceShiftFilter; label: string; countKey: "onShift" | "completed" | "total" }[] = [
  { filter: "on_shift", label: "במשמרת", countKey: "onShift" },
  { filter: "left", label: "סיימו", countKey: "completed" },
  { filter: "all", label: "סה״כ", countKey: "total" },
];

export function ManagerAttendanceFeed({
  className = "manager-attendance-feed dash-rise dash-panel",
  compact = false,
}: {
  className?: string;
  /** Narrow sidebar on worker dashboard — always mobile-style list + stat filters. */
  compact?: boolean;
} = {}) {
  const businessId = useBusinessId();
  const { profile, hasFeature } = useAuth();
  const isMdUp = useIsMdUp();
  const [filter, setFilter] = useState<AttendanceShiftFilter>("on_shift");
  const [clockOutTarget, setClockOutTarget] = useState<ForceClockOutTarget | null>(null);
  const [clockOutEditMode, setClockOutEditMode] = useState(false);
  const [addToShiftOpen, setAddToShiftOpen] = useState(false);

  function handleRequestClockOut(target: ForceClockOutTarget, options?: OpenForceClockOutOptions) {
    setClockOutEditMode(options?.startInEditMode ?? false);
    setClockOutTarget(target);
  }

  function closeClockOutModal() {
    setClockOutTarget(null);
    setClockOutEditMode(false);
  }

  const { data: records = [] } = useAttendanceToday(businessId);
  const { data: users = [] } = useProfiles(businessId);
  const { data: departments = [] } = useDepartments(businessId);
  const today = todayISO();
  const wk = weekStart();
  const { data: templates = [] } = useActiveShiftTemplates(businessId);
  const { data: assignments = [] } = useShiftAssignments(businessId, wk, addDays(wk, 6));

  /** Tick so «חריגה» appears once the assigned shift end time has passed. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const shiftsEnabled = hasFeature("shifts");
  const canForceClockOut = canForceEmployeeClockOut(profile?.role);
  const canAddToShift = canForceEmployeeClockIn(profile?.role);

  const userById = useMemo(() => {
    const m = new Map<string, { name: string | null; role: string; departmentId: string | null }>();
    users.forEach((u) => m.set(u.id, { name: u.full_name, role: u.role, departmentId: u.department_id }));
    return m;
  }, [users]);

  /** Live presence only — ignore schedule so force-adds / walk-ins always appear. */
  const todayFeed = useMemo(() => {
    const dayRecords = records.filter((r) => attendanceBelongsToTodayFeed(r, today));
    const groups = groupAttendanceByEmployee(dayRecords);
    if (!shiftsEnabled || assignments.length === 0) return groups;
    return annotateExceedingShiftHours(groups, {
      today,
      assignments,
      templates,
      nowMs,
    });
  }, [records, today, shiftsEnabled, assignments, templates, nowMs]);

  const feedByDepartment = useMemo(() => {
    const employeeInfo = new Map<string, { departmentId: string | null | undefined; role: string }>();
    for (const [id, u] of userById) employeeInfo.set(id, { departmentId: u.departmentId, role: u.role });
    return groupAttendanceByDepartment(todayFeed, departments, employeeInfo);
  }, [todayFeed, departments, userById]);

  const onShiftCount = todayFeed.filter((g) => g.onShift).length;
  const completedCount = todayFeed.filter((g) => !g.onShift).length;
  const counts = { onShift: onShiftCount, completed: completedCount, total: todayFeed.length };
  /** Any open punch — not only the shift-window feed — so already-on-shift staff stay hidden. */
  const onShiftEmployeeIds = useMemo(() => employeeIdsOnOpenPunch(records), [records]);

  return (
    <section
      className={className}
      style={{ ["--rise-delay" as string]: "420ms" } as React.CSSProperties}
      aria-label="נוכחות לפי מחלקות"
    >
      <div className="manager-attendance-feed__head">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="dash-panel-icon">
            <Icon name="badge" size={17} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[14.5px] font-extrabold tracking-tight text-text">הצוות כעת</h3>
            <p className="mt-0.5 truncate text-[12px] font-semibold text-text-3">
              לפי מחלקות · נוכחות בזמן אמת
            </p>
          </div>
        </div>
        {canAddToShift && (
          <button
            type="button"
            className="manager-attendance-feed__add"
            onClick={() => setAddToShiftOpen(true)}
            aria-label="הוסף עובד למשמרת"
          >
            <Icon name="add" size={22} />
          </button>
        )}
      </div>

      {(!isMdUp || compact) && (
        <div className="manager-attendance-feed__stats">
          <div className="attendance-mobile-stats" role="group" aria-label="סינון נוכחות">
            {STAT_FILTERS.map(({ filter: id, label, countKey }) => {
              const active = filter === id;
              return (
                <button
                  key={id}
                  type="button"
                  className="attendance-mobile-stat seg-btn"
                  data-filter={id}
                  data-active={active}
                  aria-pressed={active}
                  onClick={() => setFilter(id)}
                >
                  <span className="attendance-mobile-stat-val">{counts[countKey]}</span>
                  <span className="attendance-mobile-stat-lbl">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="manager-attendance-feed__body">
        <AttendanceTodayFeedSection
          shiftsEnabled={shiftsEnabled}
          todayFeed={todayFeed}
          feedByDepartment={feedByDepartment}
          userById={userById}
          variant={isMdUp && !compact ? "desktop" : "mobile"}
          filter={filter}
          showFilterBar={isMdUp && !compact}
          onFilterChange={setFilter}
          canForceClockOut={canForceClockOut}
          onRequestClockOut={handleRequestClockOut}
        />
      </div>

      <ForceClockOutModal
        open={!!clockOutTarget}
        target={clockOutTarget}
        businessId={businessId}
        initialEditing={clockOutEditMode}
        onClose={closeClockOutModal}
      />

      {canAddToShift && (
        <AddEmployeeToShiftSheet
          open={addToShiftOpen}
          onClose={() => setAddToShiftOpen(false)}
          businessId={businessId}
          users={users}
          departments={departments}
          onShiftEmployeeIds={onShiftEmployeeIds}
        />
      )}
    </section>
  );
}
