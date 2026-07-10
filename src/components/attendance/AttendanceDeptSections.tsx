import { formatPunchTime } from "@/lib/attendanceFeed";
import { initialsOf, colorFor } from "@/lib/db";
import type { AttendanceDepartmentSection } from "@/lib/attendanceFeed";

interface AttendanceDeptSectionsProps {
  sections: AttendanceDepartmentSection[];
  userById: Map<string, { name: string | null; role: string; departmentId?: string | null }>;
  variant?: "mobile" | "desktop";
}

export function AttendanceDeptSections({
  sections,
  userById,
  variant = "mobile",
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
                return (
                  <article key={group.employeeId} className={rowClass} data-open={group.onShift}>
                    <span
                      className="attendance-row-avatar"
                      style={{ background: colorFor(group.employeeId) }}
                    >
                      {initialsOf(u?.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="attendance-row-name">{u?.name ?? "עובד/ת"}</div>
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
                          במשמרת
                        </>
                      ) : (
                        "יצא/ה"
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
