import { useCountdown } from "./eventTime";

/**
 * Live countdown to the event day (ticks every second).
 * Pure structure — sizing/colors come from the parent context
 * (.evt-feature / .evtd-ticket) in the events CSS layer.
 */
export function EventCountdown({ dateStr }: { dateStr: string }) {
  const cd = useCountdown(dateStr);
  if (cd.done) return null;

  const segments = [
    { value: cd.days, label: "ימים" },
    { value: cd.hours, label: "שעות" },
    { value: cd.minutes, label: "דקות" },
    { value: cd.seconds, label: "שניות" },
  ];

  return (
    <div
      className="evt-cd"
      role="timer"
      aria-label={`נותרו ${cd.days} ימים, ${cd.hours} שעות, ${cd.minutes} דקות ו־${cd.seconds} שניות לאירוע`}
    >
      {segments.map((s) => (
        <span key={s.label} className="evt-cd-seg">
          <b className="evt-cd-num">{String(s.value).padStart(2, "0")}</b>
          <i className="evt-cd-label">{s.label}</i>
        </span>
      ))}
    </div>
  );
}
