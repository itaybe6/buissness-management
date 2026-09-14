import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Icon } from "@/components/ui";
import { EASE_OUT } from "@/components/motion/shared-motion";

/**
 * Floating confirmation pill for an action that just completed (e.g. a modal
 * that closed after saving). Rendered into `document.body` so it outlives the
 * modal that triggered it and sits above the mobile bottom nav.
 */
export function ActionToast({
  text,
  ok = true,
}: {
  /** Message to show; `null` hides the toast (animated). */
  text: string | null;
  ok?: boolean;
}) {
  const reduce = useReducedMotion();

  return createPortal(
    <AnimatePresence>
      {text && (
        <motion.div
          key={text}
          role="status"
          aria-live="polite"
          initial={reduce ? false : { opacity: 0, transform: "translateY(10px) scale(0.96)" }}
          animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
          exit={reduce ? undefined : { opacity: 0, transform: "translateY(6px)" }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
          className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+84px)] z-[300] flex justify-center px-4 md:bottom-6"
        >
          <div
            className={`inline-flex max-w-full items-center gap-2.5 rounded-full px-4 py-2.5 text-[13.5px] font-bold shadow-[0_8px_24px_rgb(0_0_0/0.14)] ${
              ok ? "text-success [background:var(--success-bg)]" : "text-danger [background:var(--danger-bg)]"
            }`}
          >
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-white ${ok ? "bg-success" : "bg-danger"}`}
            >
              <Icon name={ok ? "check" : "priority_high"} size={13} />
            </span>
            <span className="text-right leading-snug">{text}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
