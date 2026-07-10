import { useEffect, useId, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

/* ============================================================
   Dashboard chart primitives — hand-built SVG, no chart lib.
   All animation is transform/opacity or stroke-dashoffset, with
   custom easing and reduced-motion fallbacks (Emil Kowalski rules).
   ============================================================ */

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

/** Animate a number from 0 → value with rAF. Respects reduced motion. */
export function CountUp({
  value,
  duration = 750,
  format = (n: number) => Math.round(n).toLocaleString("he-IL"),
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduce]);

  return <span className={className}>{format(display)}</span>;
}

/* ---------------------------------------------------------------- */
/*  Catmull-Rom → cubic-bezier smoothing                            */
/* ---------------------------------------------------------------- */
type Pt = { x: number; y: number };
function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/* ---------------------------------------------------------------- */
/*  Area chart with interactive hover                               */
/* ---------------------------------------------------------------- */
export interface AreaPoint {
  label: string;
  value: number;
}

export function AreaChart({
  data,
  height = 220,
  color = "var(--accent)",
  formatValue = (n) => Math.round(n).toLocaleString("he-IL"),
}: {
  data: AreaPoint[];
  height?: number;
  color?: string;
  formatValue?: (n: number) => string;
}) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/[:]/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = 640;
  const H = height;
  const padL = 14;
  const padR = 14;
  const padT = 18;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const stepX = n > 1 ? innerW / (n - 1) : 0;
  const xAt = (i: number) => padL + (n > 1 ? i * stepX : innerW / 2);
  const yAt = (v: number) => padT + innerH - (v / max) * innerH;

  const pts: Pt[] = data.map((d, i) => ({ x: xAt(i), y: yAt(d.value) }));
  const line = smoothPath(pts);
  const baseY = padT + innerH;
  const area =
    pts.length > 0
      ? `${line} L ${pts[pts.length - 1].x.toFixed(2)} ${baseY} L ${pts[0].x.toFixed(2)} ${baseY} Z`
      : "";

  // gridlines at 0 / 50% / 100%
  const grid = [0, 0.5, 1].map((f) => ({ y: padT + innerH - f * innerH, v: max * f }));

  // x labels: ~5 evenly spaced
  const labelIdx = new Set<number>();
  if (n > 0) {
    const count = Math.min(6, n);
    for (let k = 0; k < count; k++) labelIdx.add(Math.round((k / (count - 1 || 1)) * (n - 1)));
  }

  function onMove(e: React.PointerEvent) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round((relX - padL) / (stepX || 1))));
    setHover(i);
  }

  const hi = hover != null ? data[hover] : null;
  const hiX = hover != null ? xAt(hover) : 0;
  const hiY = hover != null ? yAt(data[hover].value) : 0;

  return (
    <div ref={wrapRef} className="relative w-full select-none" dir="ltr">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        style={{ display: "block", touchAction: "none" }}
      >
        <defs>
          <linearGradient id={`area-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* gridlines */}
        {grid.map((g, i) => (
          <line
            key={i}
            x1={padL}
            x2={W - padR}
            y1={g.y}
            y2={g.y}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray={i === 0 ? undefined : "3 5"}
            opacity={i === 0 ? 0.9 : 0.5}
          />
        ))}
        {grid.map((g, i) => (
          <text key={`t${i}`} x={padL} y={g.y - 4} fontSize="10" fill="var(--text-3)" fontWeight={600}>
            {formatValue(g.v)}
          </text>
        ))}

        {/* area fill */}
        {area && (
          <path
            d={area}
            fill={`url(#area-${uid})`}
            style={{
              opacity: reduce ? 1 : 0,
              animation: reduce ? undefined : `dashFade 600ms ${EASE} 250ms forwards`,
            }}
          />
        )}

        {/* soft glow under the line */}
        {line && !reduce && (
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.16"
            style={{ filter: "blur(5px)" }}
          />
        )}

        {/* line */}
        {line && (
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            style={
              reduce
                ? undefined
                : {
                    strokeDasharray: 1,
                    strokeDashoffset: 1,
                    animation: `drawLine 900ms ${EASE} forwards`,
                  }
            }
          />
        )}

        {/* peak marker — pulses on the best day */}
        {(() => {
          if (n === 0) return null;
          let peak = 0;
          data.forEach((d, i) => {
            if (d.value > data[peak].value) peak = i;
          });
          if (data[peak].value <= 0) return null;
          const px = xAt(peak);
          const py = yAt(data[peak].value);
          return (
            <g>
              <circle className="chart-peak-pulse" cx={px} cy={py} r="7" fill={color} opacity="0.4" />
              <circle cx={px} cy={py} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" />
            </g>
          );
        })()}

        {/* hover guide */}
        {hi && (
          <g>
            <line x1={hiX} x2={hiX} y1={padT} y2={baseY} stroke={color} strokeWidth="1" opacity="0.35" />
            <circle cx={hiX} cy={hiY} r="5.5" fill="var(--surface)" stroke={color} strokeWidth="2.5" />
          </g>
        )}

        {/* x labels */}
        {data.map((d, i) =>
          labelIdx.has(i) ? (
            <text
              key={i}
              x={xAt(i)}
              y={H - 8}
              fontSize="10"
              fill="var(--text-3)"
              fontWeight={600}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            >
              {d.label}
            </text>
          ) : null
        )}
      </svg>

      {/* tooltip */}
      {hi && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-[10px] border border-border bg-surface px-2.5 py-1.5 shadow-lg"
          style={{ left: `${(hiX / W) * 100}%`, top: 4 }}
        >
          <div className="text-[10px] font-bold text-text-3">{hi.label}</div>
          <div className="text-[13px] font-extrabold tabular-nums text-text">{formatValue(hi.value)}</div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Donut chart                                                     */
/* ---------------------------------------------------------------- */
export interface DonutSegment {
  value: number;
  color: string;
  label: string;
}

export function DonutChart({
  segments,
  size = 168,
  thickness = 18,
  centerValue,
  centerLabel,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerValue: string;
  centerLabel: string;
}) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);
  let acc = 0;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {/* ring — rotated so segments start at 12 o'clock (text stays upright) */}
      <g style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        {total > 0 &&
          segments.map((seg, i) => {
            const frac = seg.value / total;
            const len = frac * c;
            const offset = acc;
            acc += len;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={thickness}
                strokeLinecap={frac > 0.02 ? "round" : "butt"}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={reduce || mounted ? -offset : -offset + len}
                style={{ transition: reduce ? undefined : `stroke-dashoffset 800ms ${EASE} ${i * 90}ms` }}
              />
            );
          })}
      </g>
      {/* center text */}
      <text
        x="50%"
        y="47%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={size * 0.2}
        fontWeight={800}
        fill="var(--text)"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {centerValue}
      </text>
      <text x="50%" y="63%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.085} fontWeight={700} fill="var(--text-3)">
        {centerLabel}
      </text>
    </svg>
  );
}

/* ---------------------------------------------------------------- */
/*  Vertical bar chart                                              */
/* ---------------------------------------------------------------- */
export interface Bar {
  label: string;
  value: number;
  highlight?: boolean;
}

export function BarChart({
  data,
  height = 168,
  formatValue = (n) => Math.round(n).toLocaleString("he-IL"),
}: {
  data: Bar[];
  height?: number;
  formatValue?: (n: number) => string;
}) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="flex items-end justify-between gap-1.5" style={{ height }} dir="rtl">
      {data.map((d, i) => {
        const h = (d.value / max) * 100;
        const shown = reduce || mounted ? h : 0;
        return (
          <div key={i} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <div className="text-[10px] font-bold tabular-nums text-text-3 opacity-0 transition-opacity group-hover:opacity-100">
              {d.value > 0 ? formatValue(d.value) : ""}
            </div>
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-[6px]"
                style={{
                  height: `${shown}%`,
                  minHeight: d.value > 0 ? 4 : 0,
                  background: d.highlight
                    ? "linear-gradient(180deg, var(--accent), var(--accent-2))"
                    : "var(--surface-2)",
                  boxShadow: d.highlight ? "0 6px 16px -6px color-mix(in srgb, var(--accent) 55%, transparent)" : undefined,
                  transition: reduce ? undefined : `height 700ms ${EASE} ${i * 45}ms`,
                  border: d.highlight ? "none" : "1px solid var(--border-2)",
                  borderBottom: "none",
                }}
              />
            </div>
            <div className={`text-[11px] font-bold ${d.highlight ? "text-accent-2" : "text-text-3"}`}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Radial gauge (semi/full ring with a value 0..1)                 */
/* ---------------------------------------------------------------- */
export function RadialGauge({
  value,
  size = 150,
  thickness = 14,
  color = "var(--success)",
  centerValue,
  centerLabel,
}: {
  value: number; // 0..1
  size?: number;
  thickness?: number;
  color?: string;
  centerValue: string;
  centerLabel: string;
}) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const len = v * c;
  const shown = reduce || mounted ? len : 0;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${shown} ${c}`}
          style={{ transition: reduce ? undefined : `stroke-dasharray 850ms ${EASE} 100ms` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <div className="text-[26px] font-extrabold leading-none tabular-nums text-text">{centerValue}</div>
        <div className="mt-1 text-[11px] font-bold text-text-3">{centerLabel}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Mini sparkline (decorative, in KPI cards)                       */
/* ---------------------------------------------------------------- */
export function Sparkline({
  data,
  width = 96,
  height = 32,
  color = "var(--accent)",
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/[:]/g, "");
  if (data.length === 0) return null;
  const max = Math.max(1, ...data);
  const min = Math.min(0, ...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const pts: Pt[] = data.map((v, i) => ({
    x: data.length > 1 ? i * stepX : width / 2,
    y: height - 3 - ((v - min) / range) * (height - 6),
  }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x} ${height} L ${pts[0].x} ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`spark-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${uid})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        style={reduce ? undefined : { strokeDasharray: 1, strokeDashoffset: 1, animation: `drawLine 900ms ${EASE} forwards` }}
      />
    </svg>
  );
}
