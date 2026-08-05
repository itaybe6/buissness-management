import { motion, useReducedMotion } from "motion/react";
import { Icon } from "@/components/ui";
import { HE_DAYS, addDays, formatDateShort, todayISO, weekStart } from "@/lib/db";

const HE_DAY_LETTERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function todayIdxInWeek(wk: string): number {
  const t = todayISO();
  for (let i = 0; i < 7; i++) if (addDays(wk, i) === t) return i;
  return 0;
}

export interface WorkerWeekDayStripProps {
  weekStart: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onShiftWeek: (deltaDays: number) => void;
  onGoToday: () => void;
}

export function WorkerWeekDayStrip({
  weekStart: wk,
  selectedDate,
  onSelectDate,
  onShiftWeek,
  onGoToday,
}: WorkerWeekDayStripProps) {
  const reduceMotion = useReducedMotion();
  const today = todayISO();
  const isCurrentWeek = wk === weekStart();
  const weekEnd = addDays(wk, 6);

  return (
    <section className="worker-week-strip" aria-label="בחירת יום בשבוע">
      <div className="worker-week-strip__head">
        <div className="worker-week-strip__range">
          <Icon name="calendar_view_week" size={16} className="flex-none text-accent-2" />
          <span>
            {formatDateShort(wk)} – {formatDateShort(weekEnd)}
          </span>
        </div>
        <div className="worker-week-strip__actions">
          {(!isCurrentWeek || selectedDate !== today) && (
            <button type="button" onClick={onGoToday} className="worker-week-strip__today press">
              היום
            </button>
          )}
        </div>
      </div>

      <div className="worker-week-strip__nav">
        <button
          type="button"
          className="worker-week-strip__chev"
          onClick={() => onShiftWeek(7)}
          aria-label="שבוע קודם"
        >
          <Icon name="chevron_right" size={18} />
        </button>

        <div className="worker-week-strip__days" role="group" aria-label="ימי השבוע">
          {HE_DAY_LETTERS.map((letter, i) => {
            const date = addDays(wk, i);
            const active = date === selectedDate;
            const isToday = date === today;
            const isWeekend = i >= 5;

            return (
              <button
                key={date}
                type="button"
                className="worker-week-strip__day"
                data-active={active}
                data-today={isToday || undefined}
                data-weekend={isWeekend || undefined}
                aria-pressed={active}
                aria-label={`${HE_DAYS[i]} · ${formatDateShort(date)}`}
                onClick={() => onSelectDate(date)}
              >
                {active && (
                  <motion.span
                    layoutId="worker-week-day-pill"
                    className="worker-week-strip__day-bg"
                    transition={
                      reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }
                    }
                  />
                )}
                <span className="worker-week-strip__day-letter">{letter}</span>
                <span className="worker-week-strip__day-num">{date.slice(8, 10)}</span>
                {isToday && <span className="worker-week-strip__day-dot" aria-hidden />}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="worker-week-strip__chev"
          onClick={() => onShiftWeek(-7)}
          aria-label="שבוע הבא"
        >
          <Icon name="chevron_left" size={18} />
        </button>
      </div>
    </section>
  );
}

export { todayIdxInWeek };
