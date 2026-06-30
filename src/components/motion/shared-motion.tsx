import { type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

export const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
export const SPRING = { type: "spring" as const, stiffness: 380, damping: 32 };

export function PageEnter({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      initial={{ opacity: 0, transform: "translateY(12px)" }}
      animate={{ opacity: 1, transform: "translateY(0)" }}
      transition={{ duration: 0.32, ease: EASE_OUT }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerGrid({
  children,
  className = "",
  stagger = 0.05,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, transform: "translateY(10px)" },
        visible: { opacity: 1, transform: "translateY(0)", transition: { duration: 0.26, ease: EASE_OUT } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function PressableCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      whileHover={reduce ? undefined : { transform: "translateY(-2px)" }}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      transition={SPRING}
      className={className}
    >
      {children}
    </motion.div>
  );
}
