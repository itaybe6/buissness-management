import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { monthLabel, type DeviationLevel } from "@/lib/supplierSpend";

/* ============================================================
   12-month spend trend for the selected supplier.

   Points stay oldest → newest in data order; dir="rtl" on the flex
   row places the oldest month on the right and the newest on the left,
   matching Hebrew timeline reading.

   Divs rather than SVG on purpose — the bars grow with a plain CSS
   height transition (compositor-friendly, honours reduced motion) and
   the dashed "usual" rule stays crisp at any width.
   ============================================================ */

/** Strip heights in px, shared by JS and inline styles so the dashed
 *  baseline lands exactly on the bars' zero line at any font size. */
const VALUE_H = 17;
const LABEL_H = 22;

export interface TrendPoint {
  month: string;
  value: number;
  /** Documents in that month. */
  count: number;
  level?: DeviationLevel;
}

const BAR_TONE: Record<DeviationLevel, string> = {
  new: "spend-bar--neutral",
  normal: "spend-bar--normal",
  above: "spend-bar--above",
  below: "spend-bar--below",
  spike: "spend-bar--spike",
  drop: "spend-bar--drop",
};

export function shekelShort(n: number): string {
  if (Math.abs(n) >= 1000) return `₪${(n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return `₪${Math.round(n)}`;
}

export function SpendTrendChart({
  points,
  activeMonth,
  baseline,
  onSelect,
  height = 190,
}: {
  points: TrendPoint[];
  activeMonth: string;
  baseline: number;
  onSelect: (month: string) => void;
  height?: number;
}) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const max = Math.max(1, ...points.map((p) => p.value), baseline);
  const barsH = height - LABEL_H - VALUE_H;
  const baselineY = baseline > 0 ? LABEL_H + Math.min(1, baseline / max) * barsH : null;

  return (
    <div className="spend-chart" style={{ height }} dir="rtl">
      <span className="spend-chart__floor" style={{ bottom: LABEL_H }} aria-hidden />

      {baselineY !== null && (
        <div
          className="spend-chart__baseline"
          style={{
            bottom: baselineY,
            opacity: reduce || mounted ? 1 : 0,
            transitionDelay: reduce ? undefined : "620ms",
          }}
        >
          <span className="spend-chart__baseline-tag" dir="rtl">
            הרגיל · {shekelShort(baseline)}
          </span>
        </div>
      )}

      <div className="spend-chart__bars">
        {points.map((p, i) => {
          const active = p.month === activeMonth;
          const pct = (p.value / max) * 100;
          const shown = reduce || mounted ? pct : 0;
          return (
            <button
              key={p.month}
              type="button"
              className="spend-bar-slot"
              data-active={active}
              onClick={() => onSelect(p.month)}
              aria-label={`${monthLabel(p.month, "long")} — ${shekelShort(p.value)}, ${p.count} מסמכים`}
              aria-pressed={active}
            >
              <span className="spend-bar-slot__value" style={{ height: VALUE_H }}>
                {p.value > 0 ? shekelShort(p.value) : ""}
              </span>
              <span className="spend-bar-slot__track">
                <span
                  className={`spend-bar ${BAR_TONE[p.level ?? "normal"]}`}
                  data-active={active}
                  style={{
                    height: `${Math.max(shown, p.value > 0 ? 3 : 0)}%`,
                    transition: reduce ? undefined : `height 720ms var(--ease-spring) ${i * 45}ms`,
                  }}
                />
              </span>
              <span className="spend-bar-slot__label" style={{ height: LABEL_H }}>
                {monthLabel(p.month)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
