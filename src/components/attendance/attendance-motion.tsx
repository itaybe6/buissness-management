import { memo, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Icon } from "@/components/ui";
import { EASE_OUT, SPRING } from "@/components/motion/shared-motion";

export function AttendanceStatusToast({
  ok,
  text,
}: {
  ok: boolean;
  text: string;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, transform: "translateY(8px) scale(0.97)" }}
      animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
      exit={reduce ? undefined : { opacity: 0, transform: "translateY(-4px)" }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
      className={`inline-flex max-w-full items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold ${
        ok ? "text-success [background:var(--success-bg)]" : "text-danger [background:var(--danger-bg)]"
      }`}
    >
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
          ok ? "bg-success text-white" : "bg-danger text-white"
        }`}
      >
        <Icon name={ok ? "check" : "priority_high"} size={13} />
      </span>
      <span className="text-right leading-snug">{text}</span>
    </motion.div>
  );
}

export const GeofenceRadar = memo(function GeofenceRadar({
  active,
  compact = false,
}: {
  active: boolean;
  compact?: boolean;
}) {
  const reduce = useReducedMotion();
  const size = compact ? 168 : 220;
  const core = compact ? 64 : 92;
  const iconSize = compact ? 28 : 38;

  return (
    <div
      className="relative mx-auto grid place-items-center"
      style={{ width: size, height: size }}
      data-active={active}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="pointer-events-none absolute inset-0 rounded-full border"
          style={{
            borderColor: active
              ? "color-mix(in srgb, var(--success) 40%, transparent)"
              : "color-mix(in srgb, var(--border) 90%, var(--text-3))",
          }}
          animate={
            reduce
              ? undefined
              : {
                  scale: [0.55 + i * 0.12, 1.05 + i * 0.04],
                  opacity: [0.55, 0],
                }
          }
          transition={
            reduce
              ? undefined
              : {
                  duration: 2.8 + i * 0.4,
                  repeat: Infinity,
                  ease: "easeOut",
                  delay: i * 0.55,
                }
          }
        />
      ))}
      <div
        className="relative grid place-items-center rounded-full border"
        style={{
          width: core,
          height: core,
          borderColor: active
            ? "color-mix(in srgb, var(--success) 35%, var(--border))"
            : "var(--border)",
          background: active ? "var(--ink)" : "var(--surface-2)",
          color: active ? "var(--success)" : "var(--text-2)",
          boxShadow: active
            ? "inset 0 1px 0 rgba(255,255,255,0.08), var(--shadow)"
            : "var(--shadow-sm)",
        }}
      >
        <motion.span
          animate={reduce || !active ? undefined : { scale: [1, 1.06, 1] }}
          transition={reduce ? undefined : { duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          className="grid place-items-center"
        >
          <Icon name={active ? "verified_user" : "schedule"} size={iconSize} />
        </motion.span>
      </div>
    </div>
  );
});

export function LiveClockDigits({ time, compact }: { time: string; compact?: boolean }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      key={time.slice(-2)}
      initial={reduce ? false : { opacity: 0.4, transform: "translateY(6px)" }}
      animate={{ opacity: 1, transform: "translateY(0)" }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
      className={`font-mono font-bold tabular-nums leading-none tracking-tighter text-text ${
        compact ? "text-[clamp(2rem,7vw,2.75rem)]" : "text-[clamp(2.75rem,8vw,4.25rem)]"
      }`}
    >
      {time}
    </motion.div>
  );
}

export function ShiftPulse({ label }: { label: string }) {
  const reduce = useReducedMotion();

  return (
    <span className="attendance-shift-pulse">
      <motion.span
        className="attendance-shift-pulse-dot"
        animate={reduce ? undefined : { opacity: [1, 0.35, 1], scale: [1, 1.25, 1] }}
        transition={reduce ? undefined : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
      {label}
    </span>
  );
}

export function PunchButton({
  onShift,
  busy,
  onClick,
}: {
  onShift: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={busy}
      whileHover={reduce ? undefined : { scale: 1.01 }}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={SPRING}
      className={`attendance-punch-btn group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-[16px] px-5 py-[17px] text-[16px] font-extrabold text-white transition-[filter,box-shadow] duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
        onShift ? "attendance-punch-btn--out" : "attendance-punch-btn--in"
      }`}
    >
      <Icon name={onShift ? "logout" : "login"} size={22} />
      {busy ? "מאתר מיקום…" : onShift ? "החתמת יציאה" : "החתמת כניסה"}
    </motion.button>
  );
}

export function AttendanceSummaryCell({
  value,
  label,
  accent,
  tone = "muted",
  index,
}: {
  value: number | string;
  label: string;
  accent?: string;
  tone?: "live" | "muted" | "total";
  index: number;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, transform: "translateY(8px)" }}
      animate={{ opacity: 1, transform: "translateY(0)" }}
      transition={{ duration: 0.24, delay: reduce ? 0 : index * 0.05, ease: EASE_OUT }}
      className="attendance-summary-cell page-hero-stat"
      data-tone={tone}
    >
      <strong
        className="font-mono tabular-nums leading-none"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </strong>
      <span>{label}</span>
    </motion.div>
  );
}

export function AttendanceFeedRow({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, transform: "translateX(-8px)" }}
      animate={{ opacity: 1, transform: "translateX(0)" }}
      transition={{
        layout: SPRING,
        opacity: { duration: 0.22, delay: reduce ? 0 : Math.min(index, 8) * 0.04, ease: EASE_OUT },
        transform: { duration: 0.22, delay: reduce ? 0 : Math.min(index, 8) * 0.04, ease: EASE_OUT },
      }}
      className="attendance-feed-row"
    >
      {children}
    </motion.div>
  );
}

export function AttendanceFeedEmpty() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, transform: "translateY(10px)" }}
      animate={{ opacity: 1, transform: "translateY(0)" }}
      transition={{ duration: 0.28, ease: EASE_OUT }}
      className="flex flex-col items-center justify-center px-6 py-14 text-center"
    >
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-[18px] border border-border bg-surface-2">
        <Icon name="schedule" size={28} className="text-text-3" />
      </div>
      <div className="text-[15px] font-bold text-text">עדיין אין החתמות היום</div>
      <div className="mt-1 max-w-[28ch] text-[13px] leading-relaxed text-text-3">
        ברגע שמישהו יחתים כניסה, הרשומה תופיע כאן בזמן אמת.
      </div>
    </motion.div>
  );
}

export function AttendancePanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`attendance-panel ${className}`.trim()}>
      {children}
    </div>
  );
}

export function StatusBanner({ children }: { children: ReactNode }) {
  return (
    <AnimatePresence mode="wait">{children}</AnimatePresence>
  );
}
