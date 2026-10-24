import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Odometer-style number: every digit is a 0–9 column that rolls to its value
 * (pure CSS transform transition — no per-frame JS). Non-digits (₪ , . % −)
 * render as static glyphs. On first mount it rolls up from zero.
 *
 * The string is laid out LTR so "₪12,480" never reorders inside RTL text.
 */
export function RollingNumber({
  value,
  format = (v: number) => Math.round(v).toLocaleString("he-IL"),
  className = "",
}: {
  value: number;
  format?: (v: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const target = format(value);
  /* Start at all-zero digits, then roll to the real value on the next frame. */
  const [shown, setShown] = useState(() => (reduce ? target : target.replace(/\d/g, "0")));

  useEffect(() => {
    if (reduce) {
      setShown(target);
      return;
    }
    const id = requestAnimationFrame(() => setShown(target));
    return () => cancelAnimationFrame(id);
  }, [target, reduce]);

  const chars = Array.from(shown);
  return (
    <span className={`rb-roll ${className}`} aria-label={target}>
      {chars.map((ch, i) => {
        /* Key from the right so the ones column keeps its identity when the
           number grows a digit — the new digit appears on the left. */
        const key = chars.length - i;
        if (!/\d/.test(ch)) {
          return (
            <span key={`s${key}`} className="rb-roll-sym" aria-hidden>
              {ch}
            </span>
          );
        }
        return (
          <span key={`d${key}`} className="rb-roll-col" aria-hidden>
            <span className="rb-roll-strip" style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
              {"0123456789".split("").map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
