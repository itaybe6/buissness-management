import { useEffect, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Icon } from "./Icon";
import { EASE_OUT } from "@/components/motion/shared-motion";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
}

export function Modal({ open, onClose, title, subtitle, icon, children, footer, maxWidth = 480 }: ModalProps) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/50 p-0 backdrop-blur-[3px] sm:items-center sm:p-5"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? false : { opacity: 0, transform: "translateY(100%)" }}
        animate={{ opacity: 1, transform: "translateY(0)" }}
        exit={reduce ? undefined : { opacity: 0, transform: "translateY(100%)" }}
        transition={{ duration: 0.28, ease: EASE_OUT }}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[22px] border border-border bg-surface shadow-lg sm:max-h-[90vh] sm:animate-pop sm:rounded-[18px]"
        style={{ maxWidth: maxWidth }}
      >
        <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-border sm:hidden" aria-hidden />
        <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-[22px] sm:py-5">
          <div className="flex min-w-0 items-center gap-3">
            {icon && (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] [background:var(--accent)]">
                <Icon name={icon} size={23} className="text-white" />
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate text-[17px] font-extrabold sm:text-[18px]">{title}</div>
              {subtitle && <div className="truncate text-[12.5px] text-text-3">{subtitle}</div>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-press grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] bg-surface-2 text-text-2 hover:bg-border"
            aria-label="סגור"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5 sm:p-[22px]">{children}</div>
        {footer && (
          <div className="flex flex-wrap gap-2.5 border-t border-border px-5 py-4 sm:px-[22px] sm:py-[18px]">
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  );
}
