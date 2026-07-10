import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui";
import { useAttendanceToday } from "@/api/attendance";
import { useDepartments } from "@/api/departments";
import { useProfiles } from "@/api/users";
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

  const todayCount = records?.length ?? 0;

  return (
    <section className="team-on-shift">
      <div className="team-on-shift__head">
        <div className="team-on-shift__title-row">
          <span className="team-on-shift__icon" aria-hidden>
            <Icon name="groups" size={20} />
          </span>
          <div>
            <h2 className="team-on-shift__title">הצוות כעת</h2>
            <p className="team-on-shift__sub">
              {onShift.length > 0
                ? `${onShift.length} במשמרת · ${todayCount} החתמות היום`
                : `אין עובדים במשמרת · ${todayCount} החתמות היום`}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="team-on-shift__link"
          aria-pressed={view === "all"}
          onClick={() => setView((v) => (v === "on_shift" ? "all" : "on_shift"))}
        >
          {view === "on_shift" ? "הכל" : "במשמרת"}
          <Icon name="chevron_left" size={16} />
        </button>
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

                    return (
                      <div key={group.employeeId} className="team-on-shift__row">
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
                            פעיל
                          </span>
                        ) : (
                          <span className="team-on-shift__live team-on-shift__live--out" aria-label="יצא">
                            יצא
                          </span>
                        )}
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
    </section>
  );
}
