import { type ReactNode, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export function InventoryTabBar({
  tab,
  pending,
  onChange,
  tabs,
}: {
  tab: "items" | "orders";
  pending: number;
  onChange: (tab: "items" | "orders") => void;
  tabs: { key: "items" | "orders"; label: string; icon: ReactNode; count?: number }[];
}) {
  const reduce = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={listRef} className="relative mb-6 flex items-center gap-5 border-b border-border-2">
      {tabs.map(({ key, label, icon, count }) => {
        const active = tab === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`relative inline-flex items-center gap-1.5 pb-3 text-[14px] font-bold transition-colors duration-[160ms] [transition-timing-function:var(--ease-out)] ${
              active ? "text-text" : "text-text-3 hover:text-text-2"
            }`}
          >
            {icon}
            {label}
            {count != null && count > 0 && (
              <span
                className={`grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 font-mono text-[10px] font-bold tabular-nums ${
                  active ? "bg-ink text-white" : "bg-surface-2 text-text-2"
                }`}
              >
                {count}
              </span>
            )}
            {active && (
              <motion.span
                layoutId={reduce ? undefined : "inventory-tab-line"}
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink"
                transition={{ duration: 0.22, ease: EASE_OUT }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function InventoryPanel({ panelKey, children }: { panelKey: string; children: ReactNode }) {
  const reduce = useReducedMotion();

  if (reduce) return <div>{children}</div>;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={panelKey}
        initial={{ opacity: 0, transform: "translateY(6px)" }}
        animate={{ opacity: 1, transform: "translateY(0)" }}
        exit={{ opacity: 0, transform: "translateY(-4px)", filter: "blur(2px)" }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function InventoryCardShell({
  index,
  accent,
  children,
  className = "",
}: {
  index: number;
  accent: string;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, transform: "translateY(10px)" }}
      animate={{ opacity: 1, transform: "translateY(0)" }}
      transition={{
        duration: 0.26,
        delay: reduce ? 0 : Math.min(index, 8) * 0.045,
        ease: EASE_OUT,
      }}
      className={`inventory-card group flex flex-col overflow-hidden rounded-card border border-border bg-surface ${className}`}
    >
      <div className="h-[3px] w-full shrink-0" style={{ background: accent }} />
      {children}
    </motion.article>
  );
}

export function InventoryOrderRowShell({ index, children }: { index: number; children: ReactNode }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, transform: "translateY(6px)" }}
      animate={{ opacity: 1, transform: "translateY(0)" }}
      transition={{
        duration: 0.22,
        delay: reduce ? 0 : Math.min(index, 10) * 0.04,
        ease: EASE_OUT,
      }}
      className="flex items-center gap-3.5 border-b border-border-2 px-4 py-3.5 last:border-0"
    >
      {children}
    </motion.div>
  );
}

export function InventoryQtyDisplay({ value, bump }: { value: number; bump: boolean }) {
  const reduce = useReducedMotion();

  return (
    <motion.span
      key={value}
      initial={reduce || !bump ? false : { opacity: 0.55, transform: "scale(0.92)" }}
      animate={{ opacity: 1, transform: "scale(1)" }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
      className="mt-1 block font-mono text-[22px] font-bold tabular-nums leading-none"
    >
      {value}
    </motion.span>
  );
}
