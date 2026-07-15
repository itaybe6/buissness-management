import { useEffect, useState } from "react";

/** Parse an event date string ("YYYY-MM-DD" or ISO) as local midnight of that day. */
export function parseEventDay(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/** Whole calendar days from today to the event day (0 = today, negative = past). */
export function daysUntilEvent(dateStr: string): number {
  return Math.round((parseEventDay(dateStr).getTime() - startOfToday().getTime()) / 86_400_000);
}

export function daysUntilLabel(days: number): string {
  if (days === 0) return "היום";
  if (days === 1) return "מחר";
  if (days === -1) return "אתמול";
  if (days < 0) return `לפני ${-days} ימים`;
  return `בעוד ${days} ימים`;
}

export type Countdown = { days: number; hours: number; minutes: number; seconds: number; done: boolean };

function computeCountdown(target: number): Countdown {
  const diff = target - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
    done: false,
  };
}

/** Live countdown to local midnight of the event day, ticking every second. */
export function useCountdown(dateStr: string): Countdown {
  const target = parseEventDay(dateStr).getTime();
  const [state, setState] = useState<Countdown>(() => computeCountdown(target));

  useEffect(() => {
    setState(computeCountdown(target));
    if (target <= Date.now()) return;
    const id = setInterval(() => {
      const next = computeCountdown(target);
      setState(next);
      if (next.done) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [target]);

  return state;
}
