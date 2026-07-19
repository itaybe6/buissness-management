import {
  forwardRef,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export { Icon };
export { Select } from "./Select";
export { TimePicker } from "./TimePicker";
export { MultiSelect, type MultiSelectOption } from "./MultiSelect";
export { GlobalLoadingBar } from "./GlobalLoadingBar";

/* ----------------------------- Button ----------------------------- */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: string;
  loading?: boolean;
}

const buttonBase =
  "ui-btn inline-flex items-center justify-center gap-2 rounded-[11px] font-bold text-[13.5px] cursor-pointer transition-[transform,filter,background-color,border-color] duration-[160ms] [transition-timing-function:var(--ease-out)] disabled:opacity-60 disabled:cursor-not-allowed";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "ui-btn--primary px-4 py-3",
  secondary: "ui-btn--secondary px-4 py-3 text-text-2",
  ghost: "ui-btn--ghost px-3 py-2 text-text-2",
  danger: "ui-btn--danger px-4 py-3",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", icon, loading, children, className = "", disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${buttonBase} ${buttonVariants[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Spinner size={18} /> : icon ? <Icon name={icon} size={19} /> : null}
      {children}
    </button>
  )
);
Button.displayName = "Button";

/* ----------------------------- Spinner ----------------------------- */
export function Spinner({ size = 22 }: { size?: number }) {
  const stroke = Math.max(2, Math.round(size / 8.5));
  return (
    <svg
      className="ui-spinner"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="טוען"
    >
      <circle className="ui-spinner-track" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={stroke} />
      <circle className="ui-spinner-arc" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={stroke} />
    </svg>
  );
}

/* ----------------------------- Field / Input ----------------------------- */
interface FieldProps {
  label?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}
export function Field({ label, error, className = "", children }: FieldProps) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label-text">{label}</span>}
      <div className={label ? "mt-1.5" : ""}>{children}</div>
      {error && <span className="mt-1 block text-[12px] font-semibold text-danger">{error}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...rest }, ref) => (
    <input ref={ref} className={`field ${className}`} {...rest} />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = "", ...rest }, ref) => (
    <textarea ref={ref} className={`field resize-none ${className}`} {...rest} />
  )
);
Textarea.displayName = "Textarea";

/* ----------------------------- Card ----------------------------- */
export function Card({
  children,
  className = "",
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card border border-border/80 bg-surface shadow-sm transition-[box-shadow,border-color] duration-[200ms] [transition-timing-function:var(--ease-out)] ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ----------------------------- Badge ----------------------------- */
type BadgeTone = "success" | "warning" | "danger" | "info" | "violet" | "neutral";
const badgeTones: Record<BadgeTone, string> = {
  success: "text-success [background:var(--success-bg)]",
  warning: "text-warning [background:var(--warning-bg)]",
  danger: "text-danger [background:var(--danger-bg)]",
  info: "text-info [background:var(--info-bg)]",
  violet: "text-accent-2 [background:var(--violet-bg)]",
  neutral: "text-text-2 bg-surface-2",
};
export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${badgeTones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ----------------------------- PageHeader ----------------------------- */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  if (!title && !actions) return null;
  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-3.5 ${
        actions ? "mb-3 md:mb-5" : "mb-0 md:mb-5"
      }`}
    >
      {title && (
        <div className="hidden min-w-0 md:block">
          <div className="text-[clamp(1.25rem,4vw,1.5rem)] font-extrabold tracking-tight">{title}</div>
          {subtitle && <div className="mt-1 text-[13.5px] text-text-2 sm:text-[14.5px]">{subtitle}</div>}
        </div>
      )}
      {actions && (
        <div className={`flex flex-wrap gap-2 sm:gap-2.5 ${title ? "" : "w-full"}`}>{actions}</div>
      )}
    </div>
  );
}

/* ----------------------------- Switch ----------------------------- */
export function Switch({ checked, onChange }: { checked: boolean; onChange?: (v: boolean) => void }) {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
      data-checked={checked}
      className="ui-switch relative inline-block h-6 w-[42px] flex-none cursor-pointer rounded-full"
    >
      <span
        className="ui-switch-knob absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow"
        style={{ right: checked ? 21 : 3 }}
      />
    </span>
  );
}

/* ----------------------------- EmptyState ----------------------------- */
export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
  embedded = false,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  embedded?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-card px-6 py-16 text-center ${
        embedded ? "bg-surface-2 py-12" : "border-0 bg-surface shadow-card"
      }`}
    >
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-surface-2 text-text-3">
        <Icon name={icon} size={32} />
      </span>
      <div className="text-[16px] font-bold">{title}</div>
      {description && <div className="max-w-sm text-[13.5px] text-text-2">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ----------------------------- PageLoader ----------------------------- */
function LoaderCore({ label }: { label: string }) {
  // Trailing dots are rendered as the animated ellipsis instead.
  const text = label.replace(/(\.{2,}|…)\s*$/, "");
  return (
    <>
      <div className="loader-stage">
        <span className="loader-halo" />
        <svg className="loader-orbit loader-orbit--outer" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="48" />
        </svg>
        <svg className="loader-orbit loader-orbit--inner" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="48" />
        </svg>
        <span className="loader-satellite" />
        <div className="loader-mark">
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="flex flex-col items-center gap-3.5">
        <span className="loader-label">
          {text}
          <span className="loader-ellipsis">
            <i />
            <i />
            <i />
          </span>
        </span>
        <span className="loader-track">
          <span />
        </span>
      </div>
    </>
  );
}

export function PageLoader({ label = "טוען..." }: { label?: string }) {
  return (
    <div className="grid min-h-[50dvh] place-items-center px-4 md:min-h-[60vh]" role="status" aria-live="polite">
      <div className="loader-hero loader-float">
        <LoaderCore label={label} />
      </div>
    </div>
  );
}

/* ----------------------------- LoadingOverlay ----------------------------- */
/**
 * Full-screen floating loader for blocking waits (saving, syncing).
 * Fades/scales in over a blurred backdrop and animates out when done.
 */
export function LoadingOverlay({ show, label = "מעדכן..." }: { show: boolean; label?: string }) {
  const [mounted, setMounted] = useState(show);

  useEffect(() => {
    if (show) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), 230);
    return () => clearTimeout(t);
  }, [show]);

  if (!mounted) return null;

  return createPortal(
    <div className="loading-overlay" data-closing={!show} role="status" aria-live="polite">
      <div className="loader-float">
        <LoaderCore label={label} />
      </div>
    </div>,
    document.body
  );
}

/* ----------------------------- ErrorState ----------------------------- */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border-0 bg-surface px-6 py-12 text-center shadow-card">
      <span className="grid h-14 w-14 place-items-center rounded-2xl [background:var(--danger-bg)] text-danger">
        <Icon name="error" size={28} />
      </span>
      <div className="text-[15px] font-bold">משהו השתבש</div>
      <div className="max-w-sm text-[13px] text-text-2">{message ?? "נסו שוב מאוחר יותר"}</div>
      {onRetry && (
        <Button variant="secondary" icon="refresh" onClick={onRetry} className="mt-1">
          נסה שוב
        </Button>
      )}
    </div>
  );
}
