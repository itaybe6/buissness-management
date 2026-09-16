import { type KeyboardEvent } from "react";
import { Icon } from "@/components/ui";
import { currentSession, formatPunchTime } from "@/lib/attendanceFeed";
import { initialsOf, colorFor, colorForDepartment } from "@/lib/db";
import type { AttendanceDepartmentSection, AttendanceSession } from "@/lib/attendanceFeed";
import type { ForceClockOutTarget, OpenForceClockOutOptions } from "@/components/attendance/ForceClockOutModal";

interface AttendanceDeptSectionsProps {
  sections: AttendanceDepartmentSection[];
  userById: Map<string, { name: string | null; role: string; departmentId?: string | null }>;
  /** position id → label; only present for employees who hold several positions. */
  positionLabelById?: Map<string, string>;
  /** Live clock for the elapsed label on open punches (defaults to render time). */
  nowMs?: number;
  variant?: "mobile" | "desktop";
  canForceClockOut?: boolean;
  onRequestClockOut?: (target: ForceClockOutTarget, options?: OpenForceClockOutOptions) => void;
}

/** "2:14 שע׳" / "38 דק׳" — coarse on purpose, the feed ticks every 30s. */
function formatElapsed(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} דק׳`;
  return `${h}:${String(m).padStart(2, "0")} שע׳`;
}

function sessionDurationMs(session: AttendanceSession, nowMs: number): number {
  const end = session.clockOut ? new Date(session.clockOut).getTime() : nowMs;
  return end - new Date(session.clockIn).getTime();
}

function AttendanceEmployeeRow({
  group,
  employeeName,
  positionLabel,
  rowClass,
  variant,
  nowMs,
  canForceClockOut,
  onRequestClockOut,
  index = 0,
}: {
  group: AttendanceDepartmentSection["groups"][number];
  employeeName: string;
  positionLabel: string | null;
  rowClass: string;
  variant: "mobile" | "desktop";
  nowMs: number;
  canForceClockOut: boolean;
  onRequestClockOut?: (target: ForceClockOutTarget, options?: OpenForceClockOutOptions) => void;
  index?: number;
}) {
  const rowInteractive = Boolean(canForceClockOut && onRequestClockOut);
  const rowStyle = { ["--row-i" as string]: index } as React.CSSProperties;
  const isMobile = variant === "mobile";
  const active = currentSession(group.sessions);

  function openManage(startInEditMode = false) {
    if (!onRequestClockOut || !active) return;
    onRequestClockOut(
      {
        attendanceId: active.id,
        employeeName,
        clockIn: active.clockIn,
        clockOut: active.clockOut,
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

  const exceedChip = group.exceedingShiftHours ? (
    <span className="attendance-row-exceed" title="המשיך אחרי סיום המשמרת המשובצת">
      חריגה
    </span>
  ) : null;

  const badge = group.onShift ? (
    <div className="attendance-row-badge" data-open={group.onShift} data-exceed={group.exceedingShiftHours || undefined}>
      {rowInteractive ? (
        <>
          <span className="attendance-row-live" aria-hidden />
          הוצאה
        </>
      ) : (
        "במשמרת"
      )}
    </div>
  ) : rowInteractive ? (
    <span className="attendance-row-edit-chip" aria-hidden>
      <Icon name="edit" size={16} />
    </span>
  ) : (
    <div className="attendance-row-badge" data-open={false}>
      יצא/ה
    </div>
  );

  /* Mobile: one clean meta line under the name instead of a chip per punch.
     Live → "מאז 18:57 · 14 דק׳"; done → "18:56 → 18:57 · 1 דק׳"; extra punches fold into "+N". */
  const mobileMeta = active ? (
    <div className="attendance-row-meta">
      {group.onShift ? (
        <>
          <span className="attendance-row-meta-since">מאז {formatPunchTime(active.clockIn)}</span>
          <span className="attendance-row-meta-dot" aria-hidden />
          <span className="attendance-row-meta-elapsed">{formatElapsed(sessionDurationMs(active, nowMs))}</span>
        </>
      ) : (
        <>
          <span className="attendance-row-meta-range">
            {formatPunchTime(active.clockIn)}
            <span className="attendance-row-meta-arrow" aria-hidden>
              →
            </span>
            {active.clockOut ? formatPunchTime(active.clockOut) : "…"}
          </span>
          <span className="attendance-row-meta-dot" aria-hidden />
          <span>{formatElapsed(sessionDurationMs(active, nowMs))}</span>
        </>
      )}
      {group.sessions.length > 1 && (
        <span className="attendance-row-meta-more" title={`${group.sessions.length} החתמות היום`}>
          +{group.sessions.length - 1}
        </span>
      )}
    </div>
  ) : null;

  const desktopSessions = (
    <div className="attendance-row-sessions">
      {group.sessions.map((session) => (
        <span key={session.id} className="attendance-row-session" data-live={!session.clockOut}>
          {formatPunchTime(session.clockIn)}
          <span className="attendance-row-session-arrow">←</span>
          {session.clockOut ? formatPunchTime(session.clockOut) : "…"}
        </span>
      ))}
    </div>
  );

  const mainContent = (
    <>
      <span className="attendance-row-avatar" style={{ background: colorFor(group.employeeId) }}>
        {initialsOf(employeeName)}
      </span>
      <div className="attendance-row-main min-w-0 flex-1">
        <div className="attendance-row-name-row">
          <div className="attendance-row-name">{employeeName}</div>
          {positionLabel && <span className="attendance-row-position">{positionLabel}</span>}
          {exceedChip}
        </div>
        {isMobile ? mobileMeta : desktopSessions}
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
  positionLabelById,
  nowMs,
  variant = "mobile",
  canForceClockOut = false,
  onRequestClockOut,
}: AttendanceDeptSectionsProps) {
  const rowClass = variant === "mobile" ? "attendance-row" : "attendance-row attendance-row--desktop";
  const clock = nowMs ?? Date.now();

  return (
    <>
      {sections.map((section, sectionIndex) => {
        const onShiftInSection = section.groups.filter((g) => g.onShift).length;
        const livePct = section.groups.length > 0 ? (onShiftInSection / section.groups.length) * 100 : 0;
        const deptColor = colorForDepartment(section.departmentId, section.color);

        return (
          <section
            key={section.key}
            className="attendance-dept-card"
            style={{ ["--dept-i" as string]: sectionIndex, ["--dept-color" as string]: deptColor } as React.CSSProperties}
          >
            <header className="attendance-dept-header">
              <span className="attendance-dept-dot" aria-hidden />
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
                const positionId = currentSession(group.sessions)?.positionId;
                const positionLabel = (positionId && positionLabelById?.get(positionId)) || null;

                return (
                  <AttendanceEmployeeRow
                    key={group.employeeId}
                    group={group}
                    employeeName={employeeName}
                    positionLabel={positionLabel}
                    rowClass={rowClass}
                    variant={variant}
                    nowMs={clock}
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
