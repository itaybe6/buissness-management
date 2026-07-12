import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

/* ============================================================
   Dashboard chart primitives — hand-built SVG, no chart lib.

   Design principles that keep the curves clean (not "wonky"):
   • Charts are measured and drawn in REAL pixel coordinates via a
     ResizeObserver, so the viewBox always matches the rendered box.
     No `preserveAspectRatio="none"` → the line shape and its stroke
     width never stretch differently on mobile vs. web.
   • Smoothing uses a MONOTONE cubic spline (Fritsch–Carlson), which
     — unlike Catmull-Rom — never overshoots. Spiky / zero-heavy data
     stays glued to the points instead of looping below the baseline.
   • All motion is transform / opacity / stroke-dashoffset with custom
     easing and full reduced-motion fallbacks (Emil Kowalski rules).
   ============================================================ */

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/* ---------------------------------------------------------------- */
/*  Responsive width measurement                                    */
/* ---------------------------------------------------------------- */
function useMeasureWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    // Fallback: some environments (and viewport overrides) don't always fire
    // the observer — a window resize listener keeps the viewBox in sync.
    window.addEventListener("resize", set);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", set);
    };
  }, []);
  return [ref, width] as const;
}

/* ---------------------------------------------------------------- */
/*  Count-up number                                                 */
/* ---------------------------------------------------------------- */
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
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
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
/*  Monotone cubic smoothing (no overshoot)                         */
/* ---------------------------------------------------------------- */
type Pt = { x: number; y: number };

function monotonePath(pts: Pt[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  if (n === 2) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)} L ${pts[1].x.toFixed(2)} ${pts[1].y.toFixed(2)}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x || 1e-6;
    slope[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }

  // Fritsch–Carlson tangents
  const m: number[] = new Array(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      m[i] = 0;
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      m[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
    }
  }

  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const cp1x = p1.x + dx[i] / 3;
    const cp1y = p1.y + (m[i] * dx[i]) / 3;
    const cp2x = p2.x - dx[i] / 3;
    const cp2y = p2.y - (m[i + 1] * dx[i]) / 3;
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
  height = 230,
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
  const [wrapRef, W] = useMeasureWidth<HTMLDivElement>(640);
  const [hover, setHover] = useState<number | null>(null);

  const H = height;
  const padL = 34;
  const padR = 14;
  const padT = 20;
  const padB = 26;
  const innerW = Math.max(1, W - padL - padR);
  const innerH = H - padT - padB;

  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const stepX = n > 1 ? innerW / (n - 1) : 0;
  const xAt = (i: number) => padL + (n > 1 ? i * stepX : innerW / 2);
  const yAt = (v: number) => padT + innerH - (v / max) * innerH;

  const pts: Pt[] = data.map((d, i) => ({ x: xAt(i), y: yAt(d.value) }));
  const line = monotonePath(pts);
  const baseY = padT + innerH;
  const area =
    pts.length > 0
      ? `${line} L ${pts[pts.length - 1].x.toFixed(2)} ${baseY} L ${pts[0].x.toFixed(2)} ${baseY} Z`
      : "";

  // gridlines at 0 / 50% / 100%
  const grid = [0, 0.5, 1].map((f) => ({ y: padT + innerH - f * innerH, v: max * f }));

  // x labels: ~6 evenly spaced
  const labelIdx = new Set<number>();
  if (n > 0) {
    const count = Math.min(6, n);
    for (let k = 0; k < count; k++) labelIdx.add(Math.round((k / (count - 1 || 1)) * (n - 1)));
  }

  function onMove(e: React.PointerEvent) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const relX = e.clientX - rect.left;
    const i = Math.max(0, Math.min(n - 1, Math.round((relX - padL) / (stepX || 1))));
    setHover(i);
  }

  const hi = hover != null ? data[hover] : null;
  const hiX = hover != null ? xAt(hover) : 0;
  const hiY = hover != null ? yAt(data[hover].value) : 0;
  const lastPt = pts[pts.length - 1];

  return (
    <div ref={wrapRef} className="relative w-full select-none" dir="ltr">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        style={{ display: "block", touchAction: "none", overflow: "visible" }}
      >
        <defs>
          <linearGradient id={`area-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.34" />
            <stop offset="55%" stopColor={color} stopOpacity="0.10" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`stroke-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.65" />
            <stop offset="45%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
          <filter id={`glow-${uid}`} x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
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
            strokeDasharray={i === 0 ? undefined : "2 6"}
            opacity={i === 0 ? 0.85 : 0.55}
          />
        ))}
        {grid.map((g, i) => (
          <text key={`t${i}`} x={4} y={g.y + 3} fontSize="10" fill="var(--text-3)" fontWeight={700}>
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
              animation: reduce ? undefined : `dashFade 700ms ${EASE} 250ms forwards`,
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
            stroke={`url(#stroke-${uid})`}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#glow-${uid})`}
            pathLength={1}
            style={
              reduce
                ? undefined
                : {
                    strokeDasharray: 1,
                    strokeDashoffset: 1,
                    animation: `drawLine 1100ms ${EASE} forwards`,
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

        {/* resting end dot */}
        {lastPt && !hi && (
          <circle
            cx={lastPt.x}
            cy={lastPt.y}
            r="4.5"
            fill="var(--surface)"
            stroke={color}
            strokeWidth="2.5"
            style={{ opacity: reduce ? 1 : 0, animation: reduce ? undefined : `dashFade 300ms ${EASE} 1100ms forwards` }}
          />
        )}

        {/* hover guide */}
        {hi && (
          <g>
            <line x1={hiX} x2={hiX} y1={padT - 6} y2={baseY} stroke={color} strokeWidth="1.5" opacity="0.4" strokeDasharray="3 3" />
            <circle cx={hiX} cy={hiY} r="9" fill={color} opacity="0.16" />
            <circle cx={hiX} cy={hiY} r="5" fill="var(--surface)" stroke={color} strokeWidth="2.75" />
          </g>
        )}

        {/* x labels */}
        {data.map((d, i) =>
          labelIdx.has(i) ? (
            <text
              key={i}
              x={xAt(i)}
              y={H - 6}
              fontSize="10"
              fill="var(--text-3)"
              fontWeight={700}
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
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-[11px] border border-border bg-surface px-2.5 py-1.5 shadow-lg"
          style={{ left: `${(hiX / (W || 1)) * 100}%`, top: 0 }}
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

  const gap = 3; // px gap between segments for a modern segmented ring
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);
  let acc = 0;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {/* track */}
      <g style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        {total > 0 &&
          segments.map((seg, i) => {
            const frac = seg.value / total;
            const len = Math.max(0, frac * c - (frac > 0 ? gap : 0));
            const offset = acc;
            acc += frac * c;
            if (seg.value <= 0) return null;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={thickness}
                strokeLinecap="round"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={reduce || mounted ? -offset : -offset + len}
                style={{ transition: reduce ? undefined : `stroke-dashoffset 800ms ${EASE} ${i * 100}ms` }}
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
        fontSize={size * 0.21}
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
  height = 172,
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
  const labelH = 16;
  const dayLabelH = 18;
  const plotH = height - labelH - dayLabelH - 8;

  return (
    <div className="flex gap-2" style={{ height }} dir="rtl">
      <div
        className="flex shrink-0 flex-col justify-between pb-[22px] pt-1 text-[9px] font-bold tabular-nums leading-none text-text-3 sm:text-[10px]"
        style={{ height: plotH + labelH + 8 }}
        aria-hidden
      >
        <span>{formatValue(max)}</span>
        <span>{formatValue(max / 2)}</span>
        <span>₪0</span>
      </div>

      <div className="flex min-w-0 flex-1 items-end justify-between gap-0.5 sm:gap-1.5">
        {data.map((d, i) => {
          const h = (d.value / max) * 100;
          const shown = reduce || mounted ? h : 0;
          return (
            <div key={i} className="group flex h-full min-w-0 flex-1 flex-col items-stretch justify-end gap-1">
              <div className="flex h-4 items-end justify-center">
                <span
                  className={`max-w-full truncate text-[9px] font-extrabold tabular-nums leading-none sm:text-[10px] ${
                    d.highlight ? "text-accent-2" : "text-text-2"
                  }`}
                  title={d.value > 0 ? formatValue(d.value) : undefined}
                >
                  {d.value > 0 ? formatValue(d.value) : "—"}
                </span>
              </div>
              <div className="flex items-end" style={{ height: plotH }}>
                <div
                  className="w-full rounded-t-[7px] transition-transform duration-200 group-hover:-translate-y-0.5"
                  style={{
                    height: `${shown}%`,
                    minHeight: d.value > 0 ? 4 : 0,
                    background: d.highlight
                      ? "linear-gradient(180deg, var(--accent), var(--accent-2))"
                      : "linear-gradient(180deg, color-mix(in srgb, var(--accent) 22%, var(--surface-2)), var(--surface-2))",
                    boxShadow: d.highlight ? "0 8px 20px -8px color-mix(in srgb, var(--accent) 60%, transparent)" : undefined,
                    transition: reduce ? undefined : `height 750ms ${EASE} ${i * 55}ms`,
                    border: d.highlight ? "none" : "1px solid var(--border-2)",
                    borderBottom: "none",
                  }}
                />
              </div>
              <div
                className={`text-center text-[10px] font-bold leading-none sm:text-[11px] ${d.highlight ? "text-accent-2" : "text-text-3"}`}
              >
                {d.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Radial gauge (0..1)                                             */
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
  const uid = useId().replace(/[:]/g, "");
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
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ transform: "rotate(-90deg)", overflow: "visible" }}>
        <defs>
          <filter id={`gauge-glow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
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
          filter={`url(#gauge-glow-${uid})`}
          style={{ transition: reduce ? undefined : `stroke-dasharray 900ms ${EASE} 120ms` }}
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
/*  Mini sparkline (KPI cards + hero)                               */
/* ---------------------------------------------------------------- */
export function Sparkline({
  data,
  width = 220,
  height = 40,
  color = "var(--accent)",
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/[:]/g, "");
  const [wrapRef, W] = useMeasureWidth<HTMLDivElement>(width);

  if (data.length === 0) return <div ref={wrapRef} style={{ height }} />;

  const padY = 5;
  const H = height;
  const max = Math.max(1, ...data);
  const min = Math.min(0, ...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? W / (data.length - 1) : 0;
  const pts: Pt[] = data.map((v, i) => ({
    x: data.length > 1 ? i * stepX : W / 2,
    y: H - padY - ((v - min) / range) * (H - padY * 2),
  }));
  const line = monotonePath(pts);
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(2)} ${H} L ${pts[0].x.toFixed(2)} ${H} Z`;
  const last = pts[pts.length - 1];

  return (
    <div ref={wrapRef} className="w-full" style={{ lineHeight: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={`spark-fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.30" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`spark-stroke-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#spark-fill-${uid})`} />
        <path
          d={line}
          fill="none"
          stroke={`url(#spark-stroke-${uid})`}
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={reduce ? undefined : { strokeDasharray: 1, strokeDashoffset: 1, animation: `drawLine 1000ms ${EASE} forwards` }}
        />
        {/* glowing end-dot (static halo — no perpetual motion) */}
        <circle cx={last.x} cy={last.y} r="5" fill={color} opacity="0.18" />
        <circle
          cx={last.x}
          cy={last.y}
          r="2.75"
          fill={color}
          style={reduce ? undefined : { opacity: 0, animation: `dashFade 400ms ${EASE} 1000ms forwards` }}
        />
      </svg>
    </div>
  );
}
