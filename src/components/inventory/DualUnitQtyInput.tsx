import { useEffect, useState } from "react";
import { Icon, Input } from "@/components/ui";
import {
  hasPieceBreakdown,
  mainUnitToPieces,
  pieceUnitLabel,
  piecesToMainUnit,
  splitPackageQty,
} from "@/api/inventory";

type InputMode = "main" | "pieces";

function toDisplayQty(
  value: number,
  mode: InputMode,
  dualEnabled: boolean,
  factor: number,
  allowFractions: boolean,
): number {
  if (mode === "pieces" && dualEnabled) {
    return Math.round(mainUnitToPieces(value, factor));
  }
  if (dualEnabled) {
    return splitPackageQty(value, factor).packages;
  }
  return allowFractions ? value : Math.round(value);
}

function parseQtyInput(raw: string, allowFractions: boolean): number {
  const n = allowFractions ? parseFloat(raw) : parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

type DualUnitQtyInputProps = {
  value: number;
  mainUnit: string | null;
  unitsPerPackage: number | null;
  /** Name of the single piece inside the package; falls back to «יחידות». */
  pieceUnit?: string | null;
  /** Continuous measures (ק״ג, ליטר) accept decimals; countable units do not. */
  allowFractions?: boolean;
  disabled?: boolean;
  onCommit: (mainUnitQty: number) => void;
  variant?: "stepper" | "input";
  min?: number;
  className?: string;
  placeholder?: string;
  compact?: boolean;
  /** Initial input mode when dual-unit entry is available */
  defaultMode?: InputMode;
};

export function DualUnitQtyInput({
  value,
  mainUnit,
  unitsPerPackage,
  pieceUnit,
  allowFractions = false,
  disabled,
  onCommit,
  variant = "input",
  min = 0,
  className = "",
  placeholder = "0",
  compact = false,
  defaultMode = "main",
}: DualUnitQtyInputProps) {
  const dualEnabled = hasPieceBreakdown(unitsPerPackage);
  const factor = unitsPerPackage ?? 1;
  const fractional = allowFractions && !dualEnabled;
  const step = fractional ? 0.1 : 1;
  const initialMode: InputMode = dualEnabled && defaultMode === "pieces" ? "pieces" : "main";
  const [mode, setMode] = useState<InputMode>(initialMode);
  const [local, setLocal] = useState(value);
  const [bump, setBump] = useState(false);

  useEffect(() => {
    setLocal(toDisplayQty(value, mode, dualEnabled, factor, fractional));
  }, [value, mode, dualEnabled, factor, fractional]);

  function commitFromDisplay(displayQty: number) {
    const rounded = fractional ? Math.round(displayQty * 100) / 100 : Math.round(displayQty);
    const v = Math.max(min, rounded);
    const mainQty = mode === "pieces" && dualEnabled ? piecesToMainUnit(v, factor) : v;
    setLocal(v);
    setBump(true);
    if (mainQty !== value) onCommit(mainQty);
  }

  function switchMode(next: InputMode) {
    if (next === mode) return;
    setMode(next);
    setLocal(toDisplayQty(value, next, dualEnabled, factor, fractional));
  }

  const pieceLabel = pieceUnitLabel(pieceUnit);
  const unitLabel = mode === "pieces" ? pieceLabel : (mainUnit ?? "");
  const stepBtn = compact
    ? "grid h-6 w-6 place-items-center rounded-md text-text-3 transition-[transform,background-color,color] duration-[160ms] [transition-timing-function:var(--ease-out)] hover:bg-surface-2 hover:text-text active:scale-[0.97] disabled:opacity-35"
    : "grid h-7 w-7 place-items-center rounded-md text-text-3 transition-[transform,background-color,color] duration-[160ms] [transition-timing-function:var(--ease-out)] hover:bg-surface-2 hover:text-text active:scale-[0.97] disabled:opacity-35";

  const toggle = dualEnabled ? (
    <div className={`inline-flex rounded-md border border-border bg-surface-2 p-0.5 font-semibold ${compact ? "w-full justify-center text-[9px]" : "text-[11px]"}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => switchMode("main")}
        className={`rounded px-2 py-0.5 transition-colors ${mode === "main" ? "bg-surface text-text shadow-sm" : "text-text-3"}`}
      >
        {mainUnit}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => switchMode("pieces")}
        className={`rounded px-2 py-0.5 transition-colors ${mode === "pieces" ? "bg-surface text-text shadow-sm" : "text-text-3"}`}
      >
        {pieceLabel}
      </button>
    </div>
  ) : null;

  if (variant === "stepper") {
    if (compact) {
      return (
        <div className="flex w-full flex-col gap-1">
          {dualEnabled && <div className="flex justify-center">{toggle}</div>}
          <div className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-border bg-surface px-1 py-0.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => commitFromDisplay(local - step)}
              className={stepBtn}
              aria-label="הפחתה"
            >
              <Icon name="remove" size={14} />
            </button>
            <input
              type="number"
              min={min}
              step={step}
              inputMode={fractional ? "decimal" : "numeric"}
              dir="ltr"
              value={local}
              disabled={disabled}
              onChange={(e) => setLocal(parseQtyInput(e.target.value, fractional))}
              onBlur={() => commitFromDisplay(local)}
              onAnimationEnd={() => setBump(false)}
              className={`min-w-[2.25rem] w-10 shrink-0 bg-transparent px-0.5 text-center text-[13px] font-bold tabular-nums text-text outline-none ${bump ? "inventory-qty-bump" : ""}`}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => commitFromDisplay(local + step)}
              className={stepBtn}
              aria-label="הוספה"
            >
              <Icon name="add" size={14} />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-end gap-1.5">
        {toggle}
        <div className="flex items-center gap-2.5">
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface px-1 py-0.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => commitFromDisplay(local - step)}
              className={stepBtn}
              aria-label="הפחתה"
            >
              <Icon name="remove" size={16} />
            </button>
            <input
              type="number"
              min={min}
              step={step}
              inputMode={fractional ? "decimal" : "numeric"}
              dir="ltr"
              value={local}
              disabled={disabled}
              onChange={(e) => setLocal(parseQtyInput(e.target.value, fractional))}
              onBlur={() => commitFromDisplay(local)}
              onAnimationEnd={() => setBump(false)}
              className={`min-w-[2.5rem] w-12 shrink-0 bg-transparent px-0.5 text-center text-[15px] font-bold tabular-nums text-text outline-none ${bump ? "inventory-qty-bump" : ""}`}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => commitFromDisplay(local + step)}
              className={stepBtn}
              aria-label="הוספה"
            >
              <Icon name="add" size={16} />
            </button>
          </div>
          {unitLabel && <span className="text-[12px] font-medium text-text-3">{unitLabel}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {toggle}
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={min}
          step={step}
          inputMode={fractional ? "decimal" : "numeric"}
          dir="ltr"
          value={local === 0 && !value ? "" : local}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setLocal(e.target.value === "" ? 0 : parseQtyInput(e.target.value, fractional))}
          onBlur={() => commitFromDisplay(local)}
          className="flex-1"
        />
        {unitLabel && <span className="flex-none text-[12px] font-medium text-text-3">{unitLabel}</span>}
      </div>
      {dualEnabled && (
        <p className="text-[11px] text-text-3">
          1 {mainUnit} = {factor} {pieceLabel}
        </p>
      )}
    </div>
  );
}
