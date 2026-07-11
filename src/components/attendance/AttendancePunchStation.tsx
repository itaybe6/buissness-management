import type { ReactNode } from "react";
import { Icon } from "@/components/ui";
import { StatusBanner } from "@/components/attendance/attendance-motion";

export function AttendancePunchStation({
  timeStr,
  onShift,
  shiftElapsed,
  status,
  busy,
  onPunch,
  compact = false,
  footer,
}: {
  timeStr: string;
  onShift: boolean;
  shiftElapsed: string | null;
  status: { ok: boolean; text: string } | null;
  busy: boolean;
  onPunch: () => void;
  compact?: boolean;
  footer?: ReactNode;
}) {
  return (
    <section
      className={`attendance-station${compact ? " attendance-station--mobile" : ""}`}
      data-on-shift={onShift}
      aria-label="שעון חי וסימון נוכחות"
    >
      <div className="attendance-station-body attendance-station-body--mobile">
        <div className={`attendance-orbit-wrap${compact ? " attendance-orbit-wrap--compact" : ""}`}>
          <span className="attendance-orbit-ring" aria-hidden />
          <span className="attendance-orbit-ring attendance-orbit-ring--inner" aria-hidden />
          <button
            type="button"
            className="attendance-orbit-core"
            data-mode={onShift ? "out" : "in"}
            disabled={busy}
            onClick={onPunch}
            aria-label={busy ? "מאתר מיקום" : onShift ? "החתמת יציאה" : "החתמת כניסה"}
            aria-busy={busy}
          >
            <div>
              {busy ? (
                <div className="attendance-live-action">{onShift ? "מחתים יציאה…" : "מאתר מיקום…"}</div>
              ) : onShift ? (
                <>
                  <div className="attendance-live-time">
                    {shiftElapsed ?? "00:00:00"}
                  </div>
                  <div className="attendance-live-action">לחץ ליציאה</div>
                </>
              ) : (
                <>
                  <div className="attendance-live-time">{timeStr}</div>
                  <div className="attendance-live-action">לחץ לכניסה</div>
                </>
              )}
            </div>
          </button>
        </div>

        {status ? (
          <div className="attendance-station-status">
            <StatusBanner>
              <div className="attendance-feedback" data-ok={status.ok}>
                <Icon name={status.ok ? "check_circle" : "error"} size={16} />
                {status.text}
              </div>
            </StatusBanner>
          </div>
        ) : null}

        {footer}
      </div>
    </section>
  );
}
