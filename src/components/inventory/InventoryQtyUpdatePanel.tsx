import { useEffect, useState } from "react";
import { Icon, Input } from "@/components/ui";
import {
  BASE_UNIT,
  piecesToMainUnit,
  splitPackageQty,
  supportsPieceInput,
  type ItemWithQty,
} from "@/api/inventory";

type InventoryQtyUpdatePanelProps = {
  item: ItemWithQty;
  onSetQty: (qty: number) => void;
  disabled?: boolean;
  /**
   * When false, quantity changes stay local until the parent calls onSetQty
   * (e.g. via a Save button). Defaults to true for immediate commit.
   */
  autoCommit?: boolean;
  /** Fires whenever the draft quantity changes (useful with autoCommit=false). */
  onDraftChange?: (qty: number) => void;
};

/** Soft default when product unit is a package but units_per_package was never set. */
const DEFAULT_UNITS_PER_PACKAGE = 12;

function splitQty(qty: number, factor: number) {
  const { packages, pieces } = splitPackageQty(qty, factor);
  return { packages, pieces };
}

function combineQty(packages: number, pieces: number, factor: number) {
  const pkg = Math.max(0, packages);
  const pcs = Math.max(0, pieces);
  return Math.round((pkg + piecesToMainUnit(pcs, factor)) * 10000) / 10000;
}

function StepperField({
  label,
  value,
  onChange,
  onCommit,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  onCommit: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-text-3">{label}</span>
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface px-1 py-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const next = Math.max(0, value - 1);
            onChange(next);
            onCommit(next);
          }}
          className="grid h-8 w-8 place-items-center rounded-md text-text-3 transition-colors hover:bg-surface-2 hover:text-text active:scale-[0.97] disabled:opacity-35"
          aria-label={`הפחתת ${label}`}
        >
          <Icon name="remove" size={16} />
        </button>
        <input
          type="number"
          min={0}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          onBlur={() => onCommit(value)}
          className="w-12 bg-transparent text-center text-[15px] font-bold tabular-nums text-text outline-none disabled:opacity-60"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const next = value + 1;
            onChange(next);
            onCommit(next);
          }}
          className="grid h-8 w-8 place-items-center rounded-md text-text-3 transition-colors hover:bg-surface-2 hover:text-text active:scale-[0.97] disabled:opacity-35"
          aria-label={`הוספת ${label}`}
        >
          <Icon name="add" size={16} />
        </button>
      </div>
    </div>
  );
}

export function InventoryQtyUpdatePanel({
  item,
  onSetQty,
  disabled,
  autoCommit = true,
  onDraftChange,
}: InventoryQtyUpdatePanelProps) {
  const dual = supportsPieceInput(item.unit);
  const factor =
    dual && (item.units_per_package ?? 0) > 0
      ? item.units_per_package!
      : dual
        ? DEFAULT_UNITS_PER_PACKAGE
        : 1;

  const split = dual ? splitQty(item.current_qty, factor) : { packages: item.current_qty, pieces: 0 };
  const [packages, setPackages] = useState(split.packages);
  const [pieces, setPieces] = useState(split.pieces);
  const [simpleQty, setSimpleQty] = useState(item.current_qty);

  useEffect(() => {
    if (dual) {
      const next = splitQty(item.current_qty, factor);
      setPackages(next.packages);
      setPieces(next.pieces);
      onDraftChange?.(item.current_qty);
    } else {
      setSimpleQty(item.current_qty);
      onDraftChange?.(item.current_qty);
    }
    // Only re-sync when the stored qty / item identity changes — not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDraftChange is a stable notifier from parent
  }, [item.id, item.current_qty, dual, factor]);

  function applyQty(next: number) {
    onDraftChange?.(next);
    if (autoCommit && next !== item.current_qty) onSetQty(next);
  }

  if (!dual) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold text-text-3">כמות ({item.unit ?? BASE_UNIT})</span>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            disabled={disabled}
            value={simpleQty === 0 && !item.current_qty ? "" : simpleQty}
            onChange={(e) => {
              const next = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value) || 0);
              setSimpleQty(next);
              if (!autoCommit) onDraftChange?.(next);
            }}
            onBlur={() => {
              const next = Math.max(0, simpleQty);
              applyQty(next);
            }}
            className="flex-1"
          />
          {item.unit && <span className="flex-none text-[12px] font-medium text-text-3">{item.unit}</span>}
        </div>
      </div>
    );
  }

  function commit(nextPackages: number, nextPieces: number) {
    applyQty(combineQty(nextPackages, nextPieces, factor));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <StepperField
          label={item.unit ?? "ארגז"}
          value={packages}
          disabled={disabled}
          onChange={setPackages}
          onCommit={(n) => commit(n, pieces)}
        />
        <StepperField
          label={BASE_UNIT}
          value={pieces}
          disabled={disabled}
          onChange={(n) => {
            // Allow loose pieces to roll into packages (e.g. 12 units → +1 package)
            if (n >= factor) {
              const addPkg = Math.floor(n / factor);
              const rem = n % factor;
              const nextPkg = packages + addPkg;
              setPackages(nextPkg);
              setPieces(rem);
              commit(nextPkg, rem);
            } else {
              setPieces(n);
              if (!autoCommit) onDraftChange?.(combineQty(packages, n, factor));
            }
          }}
          onCommit={(n) => {
            if (n >= factor) {
              const addPkg = Math.floor(n / factor);
              const rem = n % factor;
              const nextPkg = packages + addPkg;
              setPackages(nextPkg);
              setPieces(rem);
              commit(nextPkg, rem);
            } else {
              commit(packages, n);
            }
          }}
        />
      </div>
      <p className="text-[12px] leading-relaxed text-text-3">
        עדכנו ארגזים ויחידות בנפרד — למשל 1 ארגז + 3 יחידות.
      </p>
    </div>
  );
}
