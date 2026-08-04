import { Icon } from "./Icon";

const monthButtonBase =
  "ui-btn ui-btn-month inline-flex items-center justify-center gap-2 rounded-[11px] px-4 py-3 text-[13.5px] font-bold cursor-pointer transition-[transform,filter,background-color,border-color] duration-[160ms] [transition-timing-function:var(--ease-out)]";

const monthButtonVariants = {
  primary: "ui-btn--primary",
  secondary: "ui-btn--secondary text-text-2",
} as const;

function defaultMonthLabel(value: string): string {
  const [y, mo] = value.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}

interface MonthPickerButtonProps {
  value: string;
  onChange: (value: string) => void;
  formatLabel?: (value: string) => string;
  variant?: keyof typeof monthButtonVariants;
  className?: string;
  "aria-label"?: string;
}

export function MonthPickerButton({
  value,
  onChange,
  formatLabel = defaultMonthLabel,
  variant = "secondary",
  className = "",
  "aria-label": ariaLabel = "בחירת חודש",
}: MonthPickerButtonProps) {
  return (
    <label className={`${monthButtonBase} ${monthButtonVariants[variant]} ${className}`.trim()}>
      <Icon name="calendar_month" size={19} />
      <span className="whitespace-nowrap">{formatLabel(value)}</span>
      <input
        type="month"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="ui-btn-month-input"
        aria-label={ariaLabel}
      />
    </label>
  );
}
