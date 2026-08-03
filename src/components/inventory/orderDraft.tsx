import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import {
  formatItemQty,
  hasPieceBreakdown,
  pieceUnitLabel,
  piecesToMainUnit,
  type ItemWithQty,
} from "@/api/inventory";

/** Quantity draft per product: whole packages in the item's main unit + loose single pieces. */
export type QtyDraft = { packs: number; pieces: number };

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function isDualUnit(item: ItemWithQty): boolean {
  return hasPieceBreakdown(item.units_per_package);
}

/** Total order quantity in the item's main unit (packs + pieces converted). */
export function draftTotal(item: ItemWithQty, draft: QtyDraft): number {
  const fromPieces =
    isDualUnit(item) && draft.pieces > 0 ? piecesToMainUnit(draft.pieces, item.units_per_package!) : 0;
  return round4(draft.packs + fromPieces);
}

/** Human label, e.g. "2 ארגז + 5 בקבוק" or "3 ק״ג". */
export function draftLabel(item: ItemWithQty, draft: QtyDraft): string {
  const unit = item.unit ?? "יחידות";
  const parts: string[] = [];
  if (draft.packs > 0) parts.push(`${draft.packs} ${unit}`);
  if (isDualUnit(item) && draft.pieces > 0) {
    parts.push(`${draft.pieces} ${pieceUnitLabel(item.piece_unit)}`);
  }
  return parts.length ? parts.join(" + ") : `0 ${unit}`;
}

/** Split a stored main-unit quantity back into whole packs + loose pieces for editing. */
export function decomposeQty(item: ItemWithQty | undefined, qty: number): QtyDraft {
  if (!item || !isDualUnit(item)) return { packs: qty, pieces: 0 };
  const factor = item.units_per_package!;
  let packs = Math.floor(qty + 1e-9);
  let pieces = Math.round((qty - packs) * factor);
  if (pieces >= factor) {
    packs += 1;
    pieces = 0;
  }
  return { packs, pieces };
}

export function StepControl({
  value,
  onChange,
  integer = false,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  integer?: boolean;
  ariaLabel: string;
}) {
  const [text, setText] = useState(value > 0 ? String(value) : "");

  useEffect(() => {
    setText(value > 0 ? String(value) : "");
  }, [value]);

  function commitText() {
    const n = Number(text.replace(",", "."));
    const v = !Number.isFinite(n) || n <= 0 ? 0 : integer ? Math.round(n) : round4(n);
    if (v !== value) onChange(v);
    else setText(v > 0 ? String(v) : "");
  }

  return (
    <div className="ordc-step">
      <button
        type="button"
        className="ordc-step-btn"
        aria-label={`הפחתת ${ariaLabel}`}
        onClick={() => onChange(Math.max(0, round4(value - 1)))}
      >
        <Icon name="remove" size={16} />
      </button>
      <input
        className="ordc-step-input"
        inputMode={integer ? "numeric" : "decimal"}
        placeholder="0"
        value={text}
        aria-label={ariaLabel}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <button
        type="button"
        className="ordc-step-btn ordc-step-btn--add"
        aria-label={`הוספת ${ariaLabel}`}
        onClick={() => onChange(round4(value + 1))}
      >
        <Icon name="add" size={16} />
      </button>
    </div>
  );
}

export function QtyEditor({
  item,
  draft,
  onPatch,
  dense = false,
}: {
  item: ItemWithQty;
  draft: QtyDraft;
  onPatch: (patch: Partial<QtyDraft>) => void;
  dense?: boolean;
}) {
  const dual = isDualUnit(item);
  const unit = item.unit ?? "יחידות";
  const pieceLabel = pieceUnitLabel(item.piece_unit);
  const total = draftTotal(item, draft);

  return (
    <div className={`ordc-steppers ${dense ? "ordc-steppers--dense" : ""}`}>
      <div className="ordc-step-row">
        <span className="ordc-step-label">
          <Icon name="package_2" size={14} />
          {unit}
        </span>
        <StepControl value={draft.packs} onChange={(v) => onPatch({ packs: v })} ariaLabel={`כמות ${unit}`} />
      </div>
      {dual && (
        <div className="ordc-step-row">
          <span className="ordc-step-label">
            <Icon name="counter_1" size={14} />
            {pieceLabel} בודדים
          </span>
          <StepControl
            integer
            value={draft.pieces}
            onChange={(v) => onPatch({ pieces: v })}
            ariaLabel={`${pieceLabel} בודדים`}
          />
        </div>
      )}
      {dual && (
        <p className="ordc-step-total">
          {total > 0 ? (
            <>
              סה״כ להזמנה: <b>{formatItemQty(item, total)}</b>
            </>
          ) : (
            <>
              1 {unit} = {item.units_per_package} {pieceLabel}
            </>
          )}
        </p>
      )}
    </div>
  );
}
