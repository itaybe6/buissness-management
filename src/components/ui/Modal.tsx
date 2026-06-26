import { useEffect, type ReactNode } from "react";
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
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] grid animate-fadeIn place-items-center bg-black/55 p-5 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full animate-pop flex-col overflow-hidden rounded-[18px] bg-surface shadow-lg"
        style={{ maxWidth }}
      >
        <div className="flex items-center justify-between border-b border-border px-[22px] py-5">
          <div className="flex items-center gap-3">
            {icon && (
              <span className="grid h-10 w-10 place-items-center rounded-[11px] [background:var(--accent)]">
                <Icon name={icon} size={23} className="text-white" />
              </span>
            )}
            <div>
              <div className="text-[18px] font-extrabold">{title}</div>
              {subtitle && <div className="text-[12.5px] text-text-3">{subtitle}</div>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-surface-2 text-text-2 hover:bg-border"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-[22px]">{children}</div>
        {footer && <div className="flex gap-2.5 border-t border-border px-[22px] py-[18px]">{footer}</div>}
      </div>
    </div>
  );
}
