import { useState } from "react";
import { AttendancePunchStation } from "@/components/attendance/AttendancePunchStation";
import type { ForceClockOutTarget } from "@/components/attendance/ForceClockOutModal";
import type { AttendanceDepartmentSection, AttendanceShiftFilter, EmployeeAttendanceGroup } from "@/lib/attendanceFeed";
import { AttendanceTodayFeedSection } from "@/components/attendance/AttendanceTodayFeedSection";

const STAT_FILTERS: { filter: AttendanceShiftFilter; label: string; countKey: "onShift" | "completed" | "total" }[] = [
  { filter: "on_shift", label: "במשמרת", countKey: "onShift" },
  { filter: "left", label: "סיימו", countKey: "completed" },
  { filter: "all", label: "סה״כ", countKey: "total" },
];

interface AttendanceMobileViewProps {
  onShiftCount: number;
  completedCount: number;
  totalCount: number;
  timeStr: string;
  onShift: boolean;
  shiftElapsed: string | null;
  status: { ok: boolean; text: string } | null;
  busy: boolean;
  shiftsEnabled: boolean;
  todayFeed: EmployeeAttendanceGroup[];
  feedByDepartment: AttendanceDepartmentSection[];
  userById: Map<string, { name: string | null; role: string; departmentId?: string | null }>;
  onPunch: () => void;
  canForceClockOut?: boolean;
  onRequestClockOut?: (target: ForceClockOutTarget) => void;
}

export function AttendanceMobileView({
  onShiftCount,
  completedCount,
  totalCount,
  timeStr,
  onShift,
  shiftElapsed,
  status,
  busy,
  shiftsEnabled,
  todayFeed,
  feedByDepartment,
  userById,
  onPunch,
  canForceClockOut = false,
  onRequestClockOut,
}: AttendanceMobileViewProps) {
  const [filter, setFilter] = useState<AttendanceShiftFilter>("all");

  const counts = {
    onShift: onShiftCount,
    completed: completedCount,
    total: totalCount,
  };

  return (
    <div className="attendance-mobile">
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

      <AttendancePunchStation
        timeStr={timeStr}
        onShift={onShift}
        shiftElapsed={shiftElapsed}
        status={status}
        busy={busy}
        onPunch={onPunch}
        compact
      />

      <AttendanceTodayFeedSection
        shiftsEnabled={shiftsEnabled}
        todayFeed={todayFeed}
        feedByDepartment={feedByDepartment}
        userById={userById}
        variant="mobile"
        filter={filter}
        canForceClockOut={canForceClockOut}
        onRequestClockOut={onRequestClockOut}
      />
    </div>
  );
}
