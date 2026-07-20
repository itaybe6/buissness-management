import { type KeyboardEvent } from "react";
import { Icon } from "@/components/ui";
import { formatPunchTime } from "@/lib/attendanceFeed";
import { initialsOf, colorFor } from "@/lib/db";
import type { AttendanceDepartmentSection } from "@/lib/attendanceFeed";
import type { ForceClockOutTarget, OpenForceClockOutOptions } from "@/components/attendance/ForceClockOutModal";

interface AttendanceDeptSectionsProps {
  sections: AttendanceDepartmentSection[];
  userById: Map<string, { name: string | null; role: string; departmentId?: string | null }>;
  variant?: "mobile" | "desktop";
  canForceClockOut?: boolean;
  onRequestClockOut?: (target: ForceClockOutTarget, options?: OpenForceClockOutOptions) => void;
}

function AttendanceEmployeeRow({
  group,
  employeeName,
  rowClass,
  canForceClockOut,
  onRequestClockOut,
  index = 0,
}: {
  group: AttendanceDepartmentSection["groups"][number];
  employeeName: string;
  rowClass: string;
  canForceClockOut: boolean;
  onRequestClockOut?: (target: ForceClockOutTarget, options?: OpenForceClockOutOptions) => void;
  index?: number;
}) {
  const rowInteractive = Boolean(canForceClockOut && onRequestClockOut);
  const rowStyle = { ["--row-i" as string]: index } as React.CSSProperties;

  function openManage(startInEditMode = false) {
    if (!onRequestClockOut) return;
    const activeSession =
      group.sessions.find((s) => !s.clockOut) ?? group.sessions[group.sessions.length - 1];
    if (!activeSession) return;
    onRequestClockOut(
      {
        attendanceId: activeSession.id,
        employeeName,
        clockIn: activeSession.clockIn,
        clockOut: activeSession.clockOut,
        avatarColor: colorFor(group.employeeId),
      },
      { startInEditMode: startInEditMode || !group.onShift },
    );
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openManage(false);
    }
  }

  const badge = (
    <div className="attendance-row-badge" data-open={group.onShift}>
      {group.onShift ? (
        <>
          <span className="attendance-row-live" aria-hidden />
          {rowInteractive ? "הוצאה" : "במשמרת"}
        </>
      ) : rowInteractive ? (
        "עריכה"
      ) : (
        "יצא/ה"
      )}
    </div>
  );

  const mainContent = (
    <>
      <span className="attendance-row-avatar" style={{ background: colorFor(group.employeeId) }}>
        {initialsOf(employeeName)}
      </span>
      <div className="attendance-row-main min-w-0 flex-1">
        <div className="attendance-row-name">{employeeName}</div>
        <div className="attendance-row-sessions">
          {group.sessions.map((session) => (
            <span key={session.id} className="attendance-row-session" data-live={!session.clockOut}>
              {formatPunchTime(session.clockIn)}
              <span className="attendance-row-session-arrow">←</span>
              {session.clockOut ? formatPunchTime(session.clockOut) : "…"}
            </span>
          ))}
        </div>
      </div>
      {badge}
    </>
  );

  if (rowInteractive && group.onShift) {
    return (
      <div
        className={`${rowClass} attendance-row--action attendance-row--split`}
        data-open={group.onShift}
        style={rowStyle}
      >
        <button
          type="button"
          className="attendance-row-hit"
          onClick={() => openManage(false)}
          aria-label={`הוצא את ${employeeName} ממשמרת`}
        >
          {mainContent}
        </button>
        <button
          type="button"
          className="attendance-row-edit"
          aria-label={`ערוך נוכחות של ${employeeName}`}
          onClick={() => openManage(true)}
        >
          <Icon name="edit" size={17} />
        </button>
      </div>
    );
  }

  if (rowInteractive) {
    return (
      <button
        type="button"
        className={`${rowClass} attendance-row--action`}
        data-open={group.onShift}
        style={rowStyle}
        onClick={() => openManage(false)}
        onKeyDown={onKeyDown}
        aria-label={`ערוך נוכחות של ${employeeName}`}
      >
        {mainContent}
      </button>
    );
  }

  return (
    <article className={rowClass} data-open={group.onShift} style={rowStyle}>
      {mainContent}
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
      {sections.map((section, sectionIndex) => {
        const onShiftInSection = section.groups.filter((g) => g.onShift).length;
        const livePct = section.groups.length > 0 ? (onShiftInSection / section.groups.length) * 100 : 0;

        return (
          <section
            key={section.key}
            className="attendance-dept-card"
            style={{ ["--dept-i" as string]: sectionIndex } as React.CSSProperties}
          >
            <header className="attendance-dept-header">
              <div className="attendance-dept-title-wrap">
                <span className="attendance-dept-name">{section.name}</span>
                <span className="attendance-dept-meta">
                  {onShiftInSection > 0
                    ? `${onShiftInSection} במשמרת`
                    : `${section.groups.length} עובדים`}
                </span>
              </div>
              <span className="attendance-dept-count" data-live={onShiftInSection > 0}>
                {onShiftInSection}/{section.groups.length}
              </span>
            </header>

            <div className="attendance-dept-pulse" aria-hidden>
              <span className="attendance-dept-pulse-fill" style={{ width: `${livePct}%` }} />
            </div>

            <div className="attendance-dept-rows">
              {section.groups.map((group, rowIndex) => {
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
                    index={rowIndex}
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
