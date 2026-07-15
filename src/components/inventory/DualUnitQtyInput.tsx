import { useEffect, useState } from "react";
import { Icon, Input } from "@/components/ui";
import {
  BASE_UNIT,
  canUsePieceInput,
  mainUnitToPieces,
  piecesToMainUnit,
} from "@/api/inventory";

type InputMode = "main" | "pieces";

type DualUnitQtyInputProps = {
  value: number;
  mainUnit: string | null;
  unitsPerPackage: number | null;
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
  disabled,
  onCommit,
  variant = "input",
  min = 0,
  className = "",
  placeholder = "0",
  compact = false,
  defaultMode = "main",
}: DualUnitQtyInputProps) {
  const dualEnabled = canUsePieceInput(mainUnit, unitsPerPackage);
  const factor = unitsPerPackage ?? 1;
  const initialMode: InputMode = dualEnabled && defaultMode === "pieces" ? "pieces" : "main";
  const [mode, setMode] = useState<InputMode>(initialMode);
  const [local, setLocal] = useState(value);
  const [bump, setBump] = useState(false);

  useEffect(() => {
    setLocal(mode === "pieces" && dualEnabled ? mainUnitToPieces(value, factor) : value);
  }, [value, mode, dualEnabled, factor]);

  function commitFromDisplay(displayQty: number) {
    const v = Math.max(min, displayQty);
    const mainQty = mode === "pieces" && dualEnabled ? piecesToMainUnit(v, factor) : v;
    setLocal(v);
    setBump(true);
    if (mainQty !== value) onCommit(mainQty);
  }

  function switchMode(next: InputMode) {
    if (next === mode) return;
    setMode(next);
    if (next === "pieces" && dualEnabled) {
      setLocal(mainUnitToPieces(value, factor));
    } else {
      setLocal(value);
    }
  }

  const unitLabel = mode === "pieces" ? BASE_UNIT : (mainUnit ?? "");
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
        {BASE_UNIT}
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
              onClick={() => commitFromDisplay(local - 1)}
              className={stepBtn}
              aria-label="הפחתה"
            >
              <Icon name="remove" size={14} />
            </button>
            <input
              type="number"
              value={local}
              disabled={disabled}
              onChange={(e) => setLocal(Number(e.target.value))}
              onBlur={() => commitFromDisplay(local)}
              onAnimationEnd={() => setBump(false)}
              className={`w-8 bg-transparent text-center text-[13px] font-bold tabular-nums text-text outline-none ${bump ? "inventory-qty-bump" : ""}`}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => commitFromDisplay(local + 1)}
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
              onClick={() => commitFromDisplay(local - 1)}
              className={stepBtn}
              aria-label="הפחתה"
            >
              <Icon name="remove" size={16} />
            </button>
            <input
              type="number"
              value={local}
              disabled={disabled}
              onChange={(e) => setLocal(Number(e.target.value))}
              onBlur={() => commitFromDisplay(local)}
              onAnimationEnd={() => setBump(false)}
              className={`w-10 bg-transparent text-center text-[15px] font-bold tabular-nums text-text outline-none ${bump ? "inventory-qty-bump" : ""}`}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => commitFromDisplay(local + 1)}
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
          value={local === 0 && !value ? "" : local}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setLocal(e.target.value === "" ? 0 : Number(e.target.value))}
          onBlur={() => commitFromDisplay(local)}
          className="flex-1"
        />
        {unitLabel && <span className="flex-none text-[12px] font-medium text-text-3">{unitLabel}</span>}
      </div>
      {dualEnabled && (
        <p className="text-[11px] text-text-3">
          1 {mainUnit} = {factor} {BASE_UNIT}
        </p>
      )}
    </div>
  );
}
