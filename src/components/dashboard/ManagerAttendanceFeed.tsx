import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/ui";
import { AttendanceTodayFeedSection } from "@/components/attendance/AttendanceTodayFeedSection";
import { ForceClockOutModal, type ForceClockOutTarget } from "@/components/attendance/ForceClockOutModal";
import { useAttendanceToday } from "@/api/attendance";
import { useDepartments } from "@/api/departments";
import { useProfiles } from "@/api/users";
import { useActiveShiftTemplates, useShiftAssignments } from "@/api/shifts";
import { useIsMdUp } from "@/hooks/useMediaQuery";
import { useAuth } from "@/lib/auth";
import { canForceEmployeeClockOut } from "@/lib/constants";
import {
  filterAttendanceForTodayShift,
  groupAttendanceByDepartment,
  groupAttendanceByEmployee,
  type AttendanceShiftFilter,
} from "@/lib/attendanceFeed";
import { useBusinessId, todayISO, weekStart, addDays } from "@/lib/db";

const STAT_FILTERS: { filter: AttendanceShiftFilter; label: string; countKey: "onShift" | "completed" | "total" }[] = [
  { filter: "on_shift", label: "במשמרת", countKey: "onShift" },
  { filter: "left", label: "סיימו", countKey: "completed" },
  { filter: "all", label: "סה״כ", countKey: "total" },
];

function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function ManagerAttendanceFeed({
  className = "manager-attendance-feed dash-rise dash-panel",
  showLink = true,
  compact = false,
}: {
  className?: string;
  showLink?: boolean;
  /** Narrow sidebar on worker dashboard — always mobile-style list + stat filters. */
  compact?: boolean;
} = {}) {
  const businessId = useBusinessId();
  const { profile, hasFeature } = useAuth();
  const isMdUp = useIsMdUp();
  const now = useLiveClock();
  const [filter, setFilter] = useState<AttendanceShiftFilter>("on_shift");
  const [clockOutTarget, setClockOutTarget] = useState<ForceClockOutTarget | null>(null);

  const { data: records = [] } = useAttendanceToday(businessId);
  const { data: users = [] } = useProfiles(businessId);
  const { data: departments = [] } = useDepartments(businessId);
  const { data: shiftTemplates = [] } = useActiveShiftTemplates(businessId);
  const today = todayISO();
  const wk = weekStart();
  const { data: assignments = [] } = useShiftAssignments(businessId, wk, addDays(wk, 6));

  const shiftsEnabled = hasFeature("shifts");
  const canForceClockOut = canForceEmployeeClockOut(profile?.role);

  const userById = useMemo(() => {
    const m = new Map<string, { name: string | null; role: string; departmentId: string | null }>();
    users.forEach((u) => m.set(u.id, { name: u.full_name, role: u.role, departmentId: u.department_id }));
    return m;
  }, [users]);

  const todayFeed = useMemo(() => {
    const filtered = filterAttendanceForTodayShift({
      records,
      today,
      assignments,
      templates: shiftTemplates,
      shiftsEnabled,
      now,
    });
    return groupAttendanceByEmployee(filtered);
  }, [records, today, assignments, shiftTemplates, shiftsEnabled, now]);

  const feedByDepartment = useMemo(() => {
    const employeeInfo = new Map<string, { departmentId: string | null | undefined; role: string }>();
    for (const [id, u] of userById) employeeInfo.set(id, { departmentId: u.departmentId, role: u.role });
    return groupAttendanceByDepartment(todayFeed, departments, employeeInfo);
  }, [todayFeed, departments, userById]);

  const onShiftCount = todayFeed.filter((g) => g.onShift).length;
  const completedCount = todayFeed.filter((g) => !g.onShift).length;
  const counts = { onShift: onShiftCount, completed: completedCount, total: todayFeed.length };

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
              {shiftsEnabled ? "לפי מחלקות · משמרת היום" : "לפי מחלקות · נוכחות בזמן אמת"}
            </p>
          </div>
        </div>
        {showLink && (
          <Link
            to="/attendance"
            className="dash-panel-more flex shrink-0 items-center gap-0.5 text-[12px] font-bold text-text-3 transition-colors hover:text-accent-2"
          >
            שעון נוכחות
            <Icon name="chevron_left" size={16} />
          </Link>
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
          onRequestClockOut={setClockOutTarget}
        />
      </div>

      <ForceClockOutModal
        open={!!clockOutTarget}
        target={clockOutTarget}
        businessId={businessId}
        onClose={() => setClockOutTarget(null)}
      />
    </section>
  );
}
