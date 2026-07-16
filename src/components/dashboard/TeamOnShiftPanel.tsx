import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui";
import { useAttendanceToday } from "@/api/attendance";
import { useDepartments } from "@/api/departments";
import { useProfiles } from "@/api/users";
import { ForceClockOutModal, type ForceClockOutTarget } from "@/components/attendance/ForceClockOutModal";
import { groupAttendanceByDepartment, groupAttendanceByEmployee } from "@/lib/attendanceFeed";
import { useBusinessId, colorForDepartment, initialsOf } from "@/lib/db";
import { formatShiftElapsed } from "@/hooks/useShiftPunch";

function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

type TeamView = "on_shift" | "all";

export function TeamOnShiftPanel() {
  const businessId = useBusinessId();
  const { data: records } = useAttendanceToday(businessId);
  const { data: profiles } = useProfiles(businessId);
  const { data: departments } = useDepartments(businessId);
  const now = useLiveClock();
  const [view, setView] = useState<TeamView>("on_shift");
  const [clockOutTarget, setClockOutTarget] = useState<ForceClockOutTarget | null>(null);

  const profilesById = useMemo(
    () => new Map((profiles ?? []).map((p) => [p.id, p])),
    [profiles],
  );

  const onShift = useMemo(
    () => (records ?? []).filter((a) => a.clock_in && !a.clock_out),
    [records],
  );

  const displayRecords = view === "all" ? (records ?? []).filter((a) => a.clock_in) : onShift;

  const sections = useMemo(() => {
    const groups = groupAttendanceByEmployee(displayRecords);
    const employeeInfo = new Map<string, { departmentId: string | null | undefined; role: string }>();
    for (const p of profiles ?? []) {
      employeeInfo.set(p.id, { departmentId: p.department_id, role: p.role });
    }
    return groupAttendanceByDepartment(groups, departments ?? [], employeeInfo);
  }, [displayRecords, profiles, departments]);

  return (
    <section className="team-on-shift">
      <div className="team-on-shift__head">
        <div className="team-on-shift__toggle" role="group" aria-label="תצוגת צוות">
          <button
            type="button"
            className="team-on-shift__toggle-btn"
            data-active={view === "on_shift" ? "true" : "false"}
            aria-pressed={view === "on_shift"}
            onClick={() => setView("on_shift")}
          >
            <span className="team-on-shift__toggle-dot" aria-hidden />
            במשמרת
          </button>
          <button
            type="button"
            className="team-on-shift__toggle-btn"
            data-active={view === "all" ? "true" : "false"}
            aria-pressed={view === "all"}
            onClick={() => setView("all")}
          >
            <Icon name="list_alt" size={14} />
            הכל
          </button>
        </div>
        <span
          className="team-on-shift__stat"
          data-tone={onShift.length > 0 ? "live" : "idle"}
          aria-label={`${onShift.length} עובדים במשמרת`}
        >
          {onShift.length > 0 && <span className="team-on-shift__stat-pulse" aria-hidden />}
          <span className="team-on-shift__stat-value">{onShift.length}</span>
          <span className="team-on-shift__stat-label">במשמרת</span>
        </span>
      </div>

      {displayRecords.length > 0 ? (
        <div className="team-on-shift__sections">
          {sections.map((section) => {
            const deptColor = colorForDepartment(section.departmentId, section.color);

            return (
              <div key={section.key} className="team-on-shift__dept">
                <header className="team-on-shift__dept-head">
                  <span className="team-on-shift__dept-dot" style={{ background: deptColor }} aria-hidden />
                  <span className="team-on-shift__dept-name">{section.name}</span>
                  <span className="team-on-shift__dept-count">{section.groups.length}</span>
                </header>

                <div className="team-on-shift__list">
                  {section.groups.map((group) => {
                    const person = profilesById.get(group.employeeId);
                    const activeSession =
                      group.sessions.find((s) => !s.clockOut) ?? group.sessions[group.sessions.length - 1];
                    const isActive = Boolean(activeSession && !activeSession.clockOut);
                    const since = activeSession
                      ? new Date(activeSession.clockIn).toLocaleTimeString("he-IL", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "";
                    const elapsed =
                      isActive && activeSession
                        ? formatShiftElapsed(now.getTime() - new Date(activeSession.clockIn).getTime())
                        : null;
                    const leftAt =
                      !isActive && activeSession?.clockOut
                        ? new Date(activeSession.clockOut).toLocaleTimeString("he-IL", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : null;

                    const rowInteractive = isActive && activeSession;

                    const rowContent = (
                      <>
                        <span
                          className="team-on-shift__avatar"
                          style={{ background: deptColor }}
                          aria-hidden
                        >
                          {initialsOf(person?.full_name)}
                        </span>
                        <div className="team-on-shift__copy">
                          <div className="team-on-shift__name">{person?.full_name ?? "—"}</div>
                          <div className="team-on-shift__meta">
                            {since && <span>מאז {since}</span>}
                            {elapsed && (
                              <>
                                <span className="team-on-shift__dot" aria-hidden />
                                <span className="team-on-shift__elapsed">{elapsed}</span>
                              </>
                            )}
                            {leftAt && (
                              <>
                                <span className="team-on-shift__dot" aria-hidden />
                                <span>יצא {leftAt}</span>
                              </>
                            )}
                          </div>
                        </div>
                        {isActive ? (
                          <span className="team-on-shift__live" aria-label="במשמרת">
                            <span className="team-on-shift__live-dot" aria-hidden />
                            הוצאה
                          </span>
                        ) : (
                          <span className="team-on-shift__live team-on-shift__live--out" aria-label="יצא">
                            יצא
                          </span>
                        )}
                      </>
                    );

                    if (rowInteractive) {
                      return (
                        <button
                          key={group.employeeId}
                          type="button"
                          className="team-on-shift__row team-on-shift__row--action"
                          onClick={() =>
                            setClockOutTarget({
                              attendanceId: activeSession.id,
                              employeeName: person?.full_name ?? "עובד/ת",
                              clockIn: activeSession.clockIn,
                              clockOut: activeSession.clockOut,
                              avatarColor: deptColor,
                            })
                          }
                          aria-label={`הוצא את ${person?.full_name ?? "העובד"} ממשמרת`}
                        >
                          {rowContent}
                        </button>
                      );
                    }

                    return (
                      <div key={group.employeeId} className="team-on-shift__row">
                        {rowContent}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="team-on-shift__empty">
          <Icon name="nightlight" size={26} className="text-text-3" />
          <p>{view === "all" ? "אין החתמות היום" : "אין עובדים מוחתמים כרגע"}</p>
        </div>
      )}
      <ForceClockOutModal
        open={!!clockOutTarget}
        target={clockOutTarget}
        businessId={businessId}
        onClose={() => setClockOutTarget(null)}
      />
    </section>
  );
}
