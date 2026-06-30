import { memo, useEffect, useId, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { EASE_OUT } from "@/components/motion/shared-motion";
import type { StatusSlice, WeekPoint } from "@/api/dashboard";

const CHART_PAD = { top: 12, right: 8, bottom: 28, left: 8 };

function useCountUp(target: number, duration = 700) {
  const reduce = useReducedMotion();
  const [val, setVal] = useState(reduce ? target : 0);

  useEffect(() => {
    if (reduce) {
      setVal(target);
      return;
    }
    let start: number | null = null;
    let raf = 0;
    const from = 0;
    const tick = (ts: number) => {
      if (start == null) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduce]);

  return val;
}

export const AnimatedNumber = memo(function AnimatedNumber({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  const n = useCountUp(value);
  return <span className={`font-mono tabular-nums ${className}`}>{n.toLocaleString("he-IL")}</span>;
});

export function SparkLine({
  data,
  color = "var(--accent)",
  height = 36,
  className = "",
}: {
  data: number[];
  color?: string;
  height?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const id = useId();
  const w = 88;
  const pts = useMemo(() => {
    if (data.length === 0) return "";
    const max = Math.max(...data, 1);
    return data
      .map((v, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * w;
        const y = height - (v / max) * (height - 6) - 3;
        return `${x},${y}`;
      })
      .join(" ");
  }, [data, height]);

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className={`overflow-visible ${className}`} aria-hidden>
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {pts && (
        <>
          <polygon points={`0,${height} ${pts} ${w},${height}`} fill={`url(#spark-${id})`} />
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={pts}
            opacity={reduce ? 1 : undefined}
            className={reduce ? undefined : "animate-[fadeIn_0.8s_ease-out]"}
          />
        </>
      )}
    </svg>
  );
}

export function AreaChart({
  data,
  label,
  accent = "var(--accent)",
}: {
  data: WeekPoint[];
  label: string;
  accent?: string;
}) {
  const reduce = useReducedMotion();
  const gradId = useId();
  const w = 400;
  const h = 160;
  const innerW = w - CHART_PAD.left - CHART_PAD.right;
  const innerH = h - CHART_PAD.top - CHART_PAD.bottom;
  const max = Math.max(...data.map((d) => d.value), 1);

  const points = data.map((d, i) => {
    const x = CHART_PAD.left + (i / Math.max(data.length - 1, 1)) * innerW;
    const y = CHART_PAD.top + innerH - (d.value / max) * innerH;
    return { x, y, ...d };
  });

  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `${CHART_PAD.left},${CHART_PAD.top + innerH} ${line} ${CHART_PAD.left + innerW},${CHART_PAD.top + innerH}`;

  return (
    <div className="w-full" role="img" aria-label={label}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={CHART_PAD.left}
            x2={CHART_PAD.left + innerW}
            y1={CHART_PAD.top + innerH * (1 - t)}
            y2={CHART_PAD.top + innerH * (1 - t)}
            stroke="var(--border-2)"
            strokeWidth="1"
            strokeDasharray="4 6"
          />
        ))}
        <motion.polygon
          points={area}
          fill={`url(#${gradId})`}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
        />
        <motion.polyline
          fill="none"
          stroke={accent}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={line}
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: EASE_OUT }}
        />
        {points.map((p, i) => (
          <motion.g key={p.short}>
            <motion.circle
              cx={p.x}
              cy={p.y}
              r="4"
              fill="var(--surface)"
              stroke={accent}
              strokeWidth="2"
              initial={reduce ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.08 * i, duration: 0.25, ease: EASE_OUT }}
            />
            <text
              x={p.x}
              y={h - 6}
              textAnchor="middle"
              className="fill-text-3 text-[11px] font-semibold"
              style={{ fontFamily: "Heebo, sans-serif", fontSize: 11 }}
            >
              {p.short}
            </text>
          </motion.g>
        ))}
      </svg>
    </div>
  );
}

export function BarChart({
  data,
  label,
}: {
  data: StatusSlice[];
  label: string;
}) {
  const reduce = useReducedMotion();
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div role="img" aria-label={label}>
      <div className="flex h-[140px] items-end gap-2 sm:gap-3">
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          return (
            <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <motion.div
                className="relative w-full max-w-[52px] rounded-t-[10px]"
                style={{ background: d.color }}
                initial={reduce ? { height: `${Math.max(pct, d.value > 0 ? 8 : 4)}%` } : { height: "4%" }}
                animate={{ height: `${Math.max(pct, d.value > 0 ? 8 : 4)}%` }}
                transition={{ delay: i * 0.07, duration: 0.55, ease: EASE_OUT }}
              >
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 font-mono text-[11px] font-bold tabular-nums text-text">
                  {d.value}
                </span>
              </motion.div>
              <span className="text-center text-[10.5px] font-bold leading-tight text-text-3 sm:text-[11px]">
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
      {total > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {data.filter((d) => d.value > 0).map((d) => (
            <span
              key={d.key}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[10.5px] font-bold text-text-2"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
              {Math.round((d.value / total) * 100)}% {d.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function DonutChart({
  data,
  label,
  centerLabel,
}: {
  data: StatusSlice[];
  label: string;
  centerLabel?: string;
}) {
  const reduce = useReducedMotion();
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 54;
  const cx = 70;
  const cy = 70;
  const stroke = 14;
  const circ = 2 * Math.PI * r;

  let offset = 0;
  const slices = data.map((d) => {
    const frac = total > 0 ? d.value / total : 0;
    const dash = frac * circ;
    const slice = { ...d, dash, gap: circ - dash, offset: -offset };
    offset += dash;
    return slice;
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6" role="img" aria-label={label}>
      <div className="relative shrink-0">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-2)" strokeWidth={stroke} />
          {total === 0 ? (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} strokeDasharray="4 8" />
          ) : (
            slices.map((s, i) =>
              s.value > 0 ? (
                <motion.circle
                  key={s.key}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${s.dash} ${s.gap}`}
                  strokeDashoffset={s.offset}
                  transform={`rotate(-90 ${cx} ${cy})`}
                  initial={reduce ? false : { strokeDasharray: `0 ${circ}` }}
                  animate={{ strokeDasharray: `${s.dash} ${s.gap}` }}
                  transition={{ delay: i * 0.1, duration: 0.7, ease: EASE_OUT }}
                />
              ) : null
            )
          )}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div className="font-mono text-[26px] font-extrabold tabular-nums leading-none text-text">{total}</div>
          {centerLabel && <div className="mt-0.5 text-[10px] font-bold text-text-3">{centerLabel}</div>}
        </div>
      </div>
      <div className="flex w-full flex-col gap-2 sm:flex-1">
        {data.map((d, i) => (
          <motion.div
            key={d.key}
            initial={reduce ? false : { opacity: 0, transform: "translateX(-6px)" }}
            animate={{ opacity: 1, transform: "translateX(0)" }}
            transition={{ delay: 0.15 + i * 0.06, duration: 0.22, ease: EASE_OUT }}
            className="flex items-center justify-between gap-3 rounded-[10px] border border-border/60 bg-surface-2/60 px-3 py-2"
          >
            <span className="flex items-center gap-2 text-[12px] font-semibold text-text-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
              {d.label}
            </span>
            <span className="font-mono text-[13px] font-bold tabular-nums">{d.value}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function RadialGauge({
  value,
  max,
  label,
  color = "var(--accent)",
}: {
  value: number;
  max: number;
  label: string;
  color?: string;
}) {
  const reduce = useReducedMotion();
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const r = 42;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;

  return (
    <div className="relative mx-auto grid h-[108px] w-[108px] place-items-center">
      <svg width="108" height="108" viewBox="0 0 108 108" className="-rotate-90">
        <circle cx="54" cy="54" r={r} fill="none" stroke="var(--border-2)" strokeWidth="8" />
        <motion.circle
          cx="54"
          cy="54"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${circ}`}
          initial={reduce ? { strokeDashoffset: circ - dash } : { strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 0.9, ease: EASE_OUT }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-mono text-[22px] font-extrabold tabular-nums leading-none">{Math.round(pct * 100)}%</div>
        <div className="mt-0.5 text-[9px] font-bold text-text-3">{label}</div>
      </div>
    </div>
  );
}

export function HorizontalBars({
  items,
  label,
}: {
  items: { name: string; value: number; sub?: string; active?: boolean }[];
  label: string;
}) {
  const reduce = useReducedMotion();
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="flex flex-col gap-3" role="img" aria-label={label}>
      {items.map((item, i) => (
        <div key={item.name} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="truncate font-bold text-text">{item.name}</span>
            <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-text-2">
              {item.value}
              {item.sub ? ` · ${item.sub}` : ""}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: item.active === false ? "var(--text-3)" : "var(--accent)",
              }}
              initial={reduce ? { width: `${(item.value / max) * 100}%` } : { width: "0%" }}
              animate={{ width: `${(item.value / max) * 100}%` }}
              transition={{ delay: i * 0.08, duration: 0.55, ease: EASE_OUT }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
