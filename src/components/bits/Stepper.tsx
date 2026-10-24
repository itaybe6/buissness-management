import { Fragment } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Step indicator after React Bits' "Stepper": numbered discs joined by
 * connectors. The active disc springs up and breathes, finished discs draw a
 * check mark, and each connector fills toward the next step as you pass it.
 * Every disc is a button, so any step can be jumped to.
 *
 * Flows inline-start → inline-end, so in RTL step 1 sits on the right.
 */
export function Stepper({
  steps,
  active,
  onStep,
  className = "",
}: {
  steps: { key: string; label: string }[];
  active: number;
  onStep?: (index: number) => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 380, damping: 26 };

  return (
    <ol className={`rb-stepper ${className}`} aria-label="שלבים">
      {steps.map((st, i) => {
        const state = i < active ? "done" : i === active ? "active" : "todo";
        return (
          <Fragment key={st.key}>
            <li className="rb-step" data-state={state}>
              <button
                type="button"
                className="rb-step-disc"
                onClick={() => onStep?.(i)}
                aria-current={state === "active" ? "step" : undefined}
                aria-label={`${i + 1}. ${st.label}`}
              >
                <motion.span
                  className="rb-step-face"
                  initial={false}
                  animate={{ scale: state === "active" ? 1.12 : 1 }}
                  transition={spring}
                >
                  {state === "done" ? (
                    <svg viewBox="0 0 24 24" className="rb-step-check" aria-hidden>
                      <motion.path
                        d="M5 12.5 10 17.5 19 7"
                        initial={reduce ? false : { pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={reduce ? { duration: 0 } : { duration: 0.35, ease: "easeOut", delay: 0.1 }}
                      />
                    </svg>
                  ) : (
                    <span className="rb-step-num">{i + 1}</span>
                  )}
                </motion.span>
              </button>
              <span className="rb-step-label">{st.label}</span>
            </li>
            {i < steps.length - 1 && (
              <li className="rb-step-link" aria-hidden>
                <motion.i
                  initial={false}
                  animate={{ scaleX: i < active ? 1 : 0 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
                />
              </li>
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}
