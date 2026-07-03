import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

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

  return createPortal(
    <div onClick={onClose} className="modal-overlay">
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-card"
        style={{ maxWidth }}
      >
        <span className="modal-handle" aria-hidden="true" />
        <div className="flex items-center justify-between border-b border-border px-[22px] py-5">
          <div className="flex items-center gap-3">
            {icon && (
              <span className="avatar-chip h-10 w-10 rounded-[11px]">
                <Icon name={icon} size={23} className="text-white" />
              </span>
            )}
            <div>
              <div className="text-[18px] font-extrabold tracking-tight">{title}</div>
              {subtitle && <div className="text-[12.5px] text-text-3">{subtitle}</div>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="סגירה"
            className="icon-btn !h-[34px] !w-[34px] !rounded-[10px]"
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
      </div>
    </div>,
    document.body
  );
}
