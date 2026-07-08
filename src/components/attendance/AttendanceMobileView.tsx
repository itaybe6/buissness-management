import { Icon } from "@/components/ui";
import { formatPunchTime } from "@/lib/attendanceFeed";
import { initialsOf, colorFor } from "@/lib/db";
import type { EmployeeAttendanceGroup } from "@/lib/attendanceFeed";

interface AttendanceMobileViewProps {
  onShiftCount: number;
  completedCount: number;
  totalCount: number;
  timeStr: string;
  dateStr: string;
  onShift: boolean;
  shiftElapsed: string | null;
  status: { ok: boolean; text: string } | null;
  busy: boolean;
  geofenceExempt: boolean;
  geofenceEnabled: boolean;
  locationReady: boolean;
  radiusM: number;
  shiftsEnabled: boolean;
  todayFeed: EmployeeAttendanceGroup[];
  userById: Map<string, { name: string | null; role: string }>;
  onPunch: () => void;
}

export function AttendanceMobileView({
  onShiftCount,
  completedCount,
  totalCount,
  timeStr,
  dateStr,
  onShift,
  shiftElapsed,
  status,
  busy,
  geofenceExempt,
  geofenceEnabled,
  locationReady,
  radiusM,
  shiftsEnabled,
  todayFeed,
  userById,
  onPunch,
}: AttendanceMobileViewProps) {
  const locationLabel = geofenceExempt
    ? "פטור/ה מבדיקת מיקום"
    : geofenceEnabled
      ? locationReady
        ? `רדיוס מאושר: ${radiusM} מ׳`
        : "מיקום העסק חסר"
      : "בדיקת מיקום כבויה";

  return (
    <div className="attendance-mobile">
      <div className="attendance-mobile-stats" aria-label="סיכום נוכחות">
        <div className="attendance-mobile-stat" data-accent="success">
          <span className="attendance-mobile-stat-val">{onShiftCount}</span>
          <span className="attendance-mobile-stat-lbl">במשמרת</span>
        </div>
        <div className="attendance-mobile-stat">
          <span className="attendance-mobile-stat-val">{completedCount}</span>
          <span className="attendance-mobile-stat-lbl">סיימו</span>
        </div>
        <div className="attendance-mobile-stat">
          <span className="attendance-mobile-stat-val">{totalCount}</span>
          <span className="attendance-mobile-stat-lbl">סה״כ</span>
        </div>
      </div>

      <section className="attendance-station attendance-station--mobile" data-on-shift={onShift}>
        <div className="attendance-station-glow" aria-hidden />
        <div className="attendance-station-grid" aria-hidden />

        <div className="attendance-station-body attendance-station-body--mobile">
          <div className="attendance-orbit-wrap attendance-orbit-wrap--compact">
            <span className="attendance-orbit-ring" aria-hidden />
            <span className="attendance-orbit-ring attendance-orbit-ring--inner" aria-hidden />
            <div className="attendance-orbit-core">
              <div>
                <div className="attendance-live-time">{timeStr}</div>
                <div className="attendance-live-date">{dateStr}</div>
              </div>
            </div>
          </div>

          <div className="attendance-status-pill" data-on-shift={onShift}>
            <span className="attendance-status-dot" aria-hidden />
            {onShift && shiftElapsed ? `במשמרת · ${shiftElapsed}` : "לא במשמרת"}
          </div>

          {status && (
            <div className="attendance-feedback" data-ok={status.ok}>
              <Icon name={status.ok ? "check_circle" : "error"} size={16} />
              {status.text}
            </div>
          )}

          <button
            type="button"
            className="attendance-action"
            data-mode={onShift ? "out" : "in"}
            disabled={busy}
            onClick={onPunch}
          >
            <Icon name={onShift ? "logout" : "login"} size={20} />
            {busy ? "מאתר מיקום…" : onShift ? "החתמת יציאה" : "החתמת כניסה"}
          </button>

          <p className="attendance-mobile-meta">
            <Icon
              name={
                geofenceExempt
                  ? "travel_explore"
                  : geofenceEnabled
                    ? locationReady
                      ? "location_on"
                      : "location_off"
                    : "location_disabled"
              }
              size={14}
            />
            {locationLabel}
          </p>
        </div>
      </section>

      <section className="attendance-feed attendance-feed--mobile">
        <div className="attendance-feed-head">
          <div>
            <h2 className="attendance-feed-title">נוכחות היום</h2>
            <p className="attendance-feed-sub">
              {shiftsEnabled ? "משמרת היום" : "החתמות בזמן אמת"}
            </p>
          </div>
          <span className="attendance-feed-count">{totalCount}</span>
        </div>

        {todayFeed.length === 0 ? (
          <div className="attendance-feed-empty">
            <Icon name="schedule" size={26} className="text-text-3" />
            <p>עדיין אין החתמות היום</p>
          </div>
        ) : (
          <div className="attendance-feed-list">
            {todayFeed.map((group) => {
              const u = userById.get(group.employeeId);
              return (
                <article
                  key={group.employeeId}
                  className="attendance-row"
                  data-open={group.onShift}
                >
                  <span
                    className="attendance-row-avatar"
                    style={{ background: colorFor(group.employeeId) }}
                  >
                    {initialsOf(u?.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-extrabold tracking-tight text-text">
                      {u?.name ?? "עובד/ת"}
                    </div>
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
                    {group.onShift ? "במשמרת" : "יצא/ה"}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
