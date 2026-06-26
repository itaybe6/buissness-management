import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Icon } from "./Icon";

export { Icon };

/* ----------------------------- Button ----------------------------- */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: string;
  loading?: boolean;
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-[11px] font-bold text-[13.5px] cursor-pointer transition disabled:opacity-60 disabled:cursor-not-allowed";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "px-4 py-3 text-white shadow-sm hover:brightness-[1.05] [background:var(--primary-bg)]",
  secondary:
    "px-4 py-3 border border-border bg-surface text-text-2 hover:bg-surface-2",
  ghost: "px-3 py-2 bg-transparent text-text-2 hover:bg-surface-2",
  danger: "px-4 py-3 text-white shadow-sm [background:var(--danger)] hover:brightness-[1.05]",
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
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size, opacity: 0.7 }}
      aria-label="טוען"
    />
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

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = "", children, ...rest }, ref) => (
    <select ref={ref} className={`field ${className}`} {...rest}>
      {children}
    </select>
  )
);
Select.displayName = "Select";

/* ----------------------------- Card ----------------------------- */
export function Card({
  children,
  className = "",
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card border border-border bg-surface shadow-sm ${className}`}
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
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3.5">
      <div>
        <div className="text-[24px] font-extrabold tracking-tight">{title}</div>
        {subtitle && <div className="mt-1 text-[14.5px] text-text-2">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
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
      className="relative inline-block h-6 w-[42px] flex-none cursor-pointer rounded-full transition"
      style={{ background: checked ? "var(--accent-2)" : "var(--border)" }}
    >
      <span
        className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all"
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
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border bg-surface px-6 py-16 text-center">
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
export function PageLoader({ label = "טוען..." }: { label?: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center text-text-3">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={32} />
        <span className="text-[13.5px]">{label}</span>
      </div>
    </div>
  );
}

/* ----------------------------- ErrorState ----------------------------- */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-danger/30 bg-surface px-6 py-12 text-center">
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
