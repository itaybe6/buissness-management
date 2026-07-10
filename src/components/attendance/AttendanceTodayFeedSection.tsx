import { useMemo } from "react";
import { Icon } from "@/components/ui";
import { AttendanceFeedEmpty } from "@/components/attendance/attendance-motion";
import { AttendanceDeptSections } from "@/components/attendance/AttendanceDeptSections";
import {
  filterAttendanceDepartmentSections,
  filterEmployeeAttendanceGroups,
  type AttendanceDepartmentSection,
  type AttendanceShiftFilter,
  type EmployeeAttendanceGroup,
} from "@/lib/attendanceFeed";

interface AttendanceTodayFeedSectionProps {
  shiftsEnabled: boolean;
  todayFeed: EmployeeAttendanceGroup[];
  feedByDepartment: AttendanceDepartmentSection[];
  userById: Map<string, { name: string | null; role: string; departmentId?: string | null }>;
  variant: "mobile" | "desktop";
  filter: AttendanceShiftFilter;
  showFilterBar?: boolean;
  onFilterChange?: (filter: AttendanceShiftFilter) => void;
}

function emptyMessage(filter: AttendanceShiftFilter): string {
  if (filter === "on_shift") return "אין עובדים במשמרת כרגע";
  if (filter === "left") return "אין עובדים שיצאו עדיין";
  return "עדיין אין החתמות היום";
}

const FILTER_BAR_OPTIONS: { id: AttendanceShiftFilter; label: string; icon: string }[] = [
  { id: "all", label: "הכל", icon: "groups" },
  { id: "on_shift", label: "במשמרת", icon: "schedule" },
  { id: "left", label: "יצאו", icon: "logout" },
];

export function AttendanceTodayFeedSection({
  shiftsEnabled,
  todayFeed,
  feedByDepartment,
  userById,
  variant,
  filter,
  showFilterBar = false,
  onFilterChange,
}: AttendanceTodayFeedSectionProps) {
  const filteredFeed = useMemo(
    () => filterEmployeeAttendanceGroups(todayFeed, filter),
    [todayFeed, filter],
  );
  const filteredSections = useMemo(
    () => filterAttendanceDepartmentSections(feedByDepartment, filter),
    [feedByDepartment, filter],
  );

  const isMobile = variant === "mobile";
  const hasAny = todayFeed.length > 0;

  return (
    <section
      className={isMobile ? "attendance-feed attendance-feed--mobile" : undefined}
      aria-label={isMobile ? "נוכחות היום לפי מחלקות" : undefined}
    >
      {!isMobile && (
        <div className="border-b border-border-2 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-bold text-text">נוכחות היום</h2>
              <p className="mt-0.5 text-[12.5px] text-text-3">
                {shiftsEnabled ? "לפי מחלקות · משמרת היום" : "לפי מחלקות · החתמות בזמן אמת"}
              </p>
            </div>
            <span className="rounded-full bg-surface-2 px-3 py-1 font-mono text-[12px] font-bold tabular-nums text-text-2">
              {filteredFeed.length}
            </span>
          </div>

          {showFilterBar && hasAny && onFilterChange && (
            <div
              className="attendance-shift-filter"
              role="group"
              aria-label="סינון נוכחות"
              style={{ marginTop: "0.75rem" }}
            >
              {FILTER_BAR_OPTIONS.map((opt) => {
                const active = filter === opt.id;
                const count =
                  opt.id === "all"
                    ? todayFeed.length
                    : opt.id === "on_shift"
                      ? todayFeed.filter((g) => g.onShift).length
                      : todayFeed.filter((g) => !g.onShift).length;

                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    data-active={active}
                    data-filter={opt.id}
                    className="attendance-shift-filter-btn seg-btn"
                    onClick={() => onFilterChange(opt.id)}
                  >
                    <Icon name={opt.icon} size={15} className="flex-none" />
                    <span>{opt.label}</span>
                    <span className="attendance-shift-filter-count">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className={isMobile ? undefined : "max-h-[min(520px,58vh)] overflow-y-auto"}>
        {!hasAny ? (
          isMobile ? (
            <div className="attendance-feed-empty">
              <Icon name="schedule" size={26} className="text-text-3" />
              <p>{emptyMessage("all")}</p>
            </div>
          ) : (
            <AttendanceFeedEmpty />
          )
        ) : filteredFeed.length === 0 ? (
          <div className={isMobile ? "attendance-feed-empty" : "flex flex-col items-center gap-2 px-6 py-12 text-center"}>
            <Icon name="filter_alt_off" size={isMobile ? 26 : 22} className="text-text-3" />
            <p className={isMobile ? undefined : "text-[13.5px] font-semibold text-text-2"}>
              {emptyMessage(filter)}
            </p>
          </div>
        ) : (
          <div
            className={
              isMobile
                ? "attendance-feed-sections attendance-feed-sections--mobile"
                : "attendance-feed-sections"
            }
          >
            <AttendanceDeptSections
              sections={filteredSections}
              userById={userById}
              variant={variant}
            />
          </div>
        )}
      </div>
    </section>
  );
}
