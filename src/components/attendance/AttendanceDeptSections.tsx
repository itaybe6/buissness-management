import { type KeyboardEvent } from "react";
import { formatPunchTime } from "@/lib/attendanceFeed";
import { initialsOf, colorFor } from "@/lib/db";
import type { AttendanceDepartmentSection } from "@/lib/attendanceFeed";
import type { ForceClockOutTarget } from "@/components/attendance/ForceClockOutModal";

interface AttendanceDeptSectionsProps {
  sections: AttendanceDepartmentSection[];
  userById: Map<string, { name: string | null; role: string; departmentId?: string | null }>;
  variant?: "mobile" | "desktop";
  canForceClockOut?: boolean;
  onRequestClockOut?: (target: ForceClockOutTarget) => void;
}

function AttendanceEmployeeRow({
  group,
  employeeName,
  rowClass,
  canForceClockOut,
  onRequestClockOut,
}: {
  group: AttendanceDepartmentSection["groups"][number];
  employeeName: string;
  rowClass: string;
  canForceClockOut: boolean;
  onRequestClockOut?: (target: ForceClockOutTarget) => void;
}) {
  const rowInteractive = Boolean(canForceClockOut && onRequestClockOut && group.onShift);

  function openClockOut() {
    if (!onRequestClockOut || !group.onShift) return;
    const activeSession = group.sessions.find((s) => !s.clockOut);
    if (!activeSession) return;
    onRequestClockOut({
      attendanceId: activeSession.id,
      employeeName,
      clockIn: activeSession.clockIn,
      avatarColor: colorFor(group.employeeId),
    });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openClockOut();
    }
  }

  const content = (
    <>
      <span className="attendance-row-avatar" style={{ background: colorFor(group.employeeId) }}>
        {initialsOf(employeeName)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="attendance-row-name">{employeeName}</div>
        <div className="attendance-row-sessions">
          {group.sessions.map((session) => (
            <span key={session.id} className="attendance-row-session">
              {formatPunchTime(session.clockIn)}
              <span className="attendance-row-session-arrow">←</span>
              {session.clockOut ? formatPunchTime(session.clockOut) : "…"}
            </span>
          ))}
        </div>
      </div>
      <div className="attendance-row-badge" data-open={group.onShift}>
        {group.onShift ? (
          <>
            <span className="attendance-row-live" aria-hidden />
            {rowInteractive ? "הוצאה" : "במשמרת"}
          </>
        ) : (
          "יצא/ה"
        )}
      </div>
    </>
  );

  if (rowInteractive) {
    return (
      <button
        type="button"
        className={`${rowClass} attendance-row--action`}
        data-open={group.onShift}
        onClick={openClockOut}
        onKeyDown={onKeyDown}
        aria-label={`הוצא את ${employeeName} ממשמרת`}
      >
        {content}
      </button>
    );
  }

  return (
    <article className={rowClass} data-open={group.onShift}>
      {content}
    </article>
  );
}

export function AttendanceDeptSections({
  sections,
  userById,
  variant = "mobile",
  canForceClockOut = false,
  onRequestClockOut,
}: AttendanceDeptSectionsProps) {
  const rowClass = variant === "mobile" ? "attendance-row" : "attendance-row attendance-row--desktop";

  return (
    <>
      {sections.map((section) => {
        const onShiftInSection = section.groups.filter((g) => g.onShift).length;

        return (
          <section key={section.key} className="attendance-dept-card">
            <header className="attendance-dept-header">
              <div className="attendance-dept-title-wrap">
                <span className="attendance-dept-name">{section.name}</span>
                <span className="attendance-dept-meta">
                  {onShiftInSection > 0
                    ? `${onShiftInSection} במשמרת`
                    : `${section.groups.length} עובדים`}
                </span>
              </div>
              <span className="attendance-dept-count">{section.groups.length}</span>
            </header>

            <div className="attendance-dept-rows">
              {section.groups.map((group) => {
                const u = userById.get(group.employeeId);
                const employeeName = u?.name ?? "עובד/ת";

                return (
                  <AttendanceEmployeeRow
                    key={group.employeeId}
                    group={group}
                    employeeName={employeeName}
                    rowClass={rowClass}
                    canForceClockOut={canForceClockOut}
                    onRequestClockOut={onRequestClockOut}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
