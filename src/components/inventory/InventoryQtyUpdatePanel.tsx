import { useEffect, useState } from "react";
import { Button, Field, Icon, Input } from "@/components/ui";
import { DualUnitQtyInput } from "@/components/inventory/DualUnitQtyInput";
import {
  BASE_UNIT,
  formatQtyWithPieces,
  piecesToMainUnit,
  supportsPieceInput,
  type ItemWithQty,
} from "@/api/inventory";

type InventoryQtyUpdatePanelProps = {
  item: ItemWithQty;
  isManager: boolean;
  onSetQty: (qty: number) => void;
  onSaveUnitsPerPackage?: (value: number) => void;
  savingFactor?: boolean;
};

function PieceDeltaAdjust({
  currentQty,
  factor,
  disabled,
  onApply,
}: {
  currentQty: number;
  factor: number;
  disabled?: boolean;
  onApply: (qty: number) => void;
}) {
  function adjustPieces(pieces: number) {
    const delta = piecesToMainUnit(pieces, factor);
    const next = Math.max(0, Math.round((currentQty + delta) * 10000) / 10000);
    if (next !== currentQty) onApply(next);
  }

  return (
    <div className="rounded-[10px] border border-border bg-surface-2 p-3">
      <div className="mb-2 text-[11px] font-semibold text-text-3">הוסף / הורד יחידות בודדות</div>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => adjustPieces(-1)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-text-3 transition-colors hover:bg-surface hover:text-text active:scale-[0.97] disabled:opacity-35"
          aria-label="הורדת יחידה אחת"
        >
          <Icon name="remove" size={18} />
        </button>
        <span className="min-w-[72px] text-center text-[13px] font-bold text-text">1 {BASE_UNIT}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => adjustPieces(1)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-text-3 transition-colors hover:bg-surface hover:text-text active:scale-[0.97] disabled:opacity-35"
          aria-label="הוספת יחידה אחת"
        >
          <Icon name="add" size={18} />
        </button>
      </div>
      <p className="mt-2 text-center text-[10px] leading-relaxed text-text-3">
        מתאים כשמשתמשים בבקבוקים בודדים ולא סופרים ארגז שלם
      </p>
    </div>
  );
}

export function InventoryQtyUpdatePanel({
  item,
  isManager,
  onSetQty,
  onSaveUnitsPerPackage,
  savingFactor,
}: InventoryQtyUpdatePanelProps) {
  const pieceUnit = supportsPieceInput(item.unit);
  const [factorDraft, setFactorDraft] = useState(
    item.units_per_package != null ? String(item.units_per_package) : "",
  );

  useEffect(() => {
    setFactorDraft(item.units_per_package != null ? String(item.units_per_package) : "");
  }, [item.id, item.units_per_package]);

  const effectiveFactor = item.units_per_package ?? (Math.max(0, Number(factorDraft)) || 0);
  const dualReady = pieceUnit && effectiveFactor > 0;
  const needsFactorSetup = pieceUnit && !item.units_per_package;

  return (
    <div className="flex flex-col gap-3">
      {needsFactorSetup && (
        <Field label={`כמה ${BASE_UNIT} ב${item.unit}?`}>
          <Input
            type="number"
            min={1}
            value={factorDraft}
            placeholder="לדוגמה: 12"
            onChange={(e) => setFactorDraft(e.target.value)}
          />
          {effectiveFactor > 0 ? (
            <p className="mt-1.5 text-[11px] text-text-3">
              1 {item.unit} = {effectiveFactor} {BASE_UNIT}
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] text-text-3">
              הגדירו כמה יחידות בודדות יש ב{item.unit} כדי לאפשר עדכון ביחידות
            </p>
          )}
          {isManager && effectiveFactor > 0 && onSaveUnitsPerPackage && (
            <Button
              variant="secondary"
              className="mt-2 w-full !py-2.5 text-[12px] active:scale-[0.97]"
              loading={savingFactor}
              onClick={() => onSaveUnitsPerPackage(effectiveFactor)}
            >
              שמור לפריט
            </Button>
          )}
        </Field>
      )}

      {dualReady ? (
        <>
          <div>
            <div className="mb-1.5 text-[11px] font-semibold text-text-3">כמות כוללת</div>
            <DualUnitQtyInput
              value={item.current_qty}
              mainUnit={item.unit}
              unitsPerPackage={effectiveFactor}
              onCommit={onSetQty}
              variant="input"
              defaultMode="pieces"
            />
            <p className="mt-2 text-[12px] leading-relaxed text-text-3">
              ניתן לעדכן ב{item.unit} או ב{BASE_UNIT} — למשל 27 בקבוקים במקום 1 ארגז ו-3 בקבוקים.
              כרגע: {formatQtyWithPieces(item.current_qty, item.unit, effectiveFactor)}.
            </p>
          </div>
          <PieceDeltaAdjust
            currentQty={item.current_qty}
            factor={effectiveFactor}
            onApply={onSetQty}
          />
        </>
      ) : (
        <>
          <DualUnitQtyInput
            value={item.current_qty}
            mainUnit={item.unit}
            unitsPerPackage={item.units_per_package}
            onCommit={onSetQty}
            variant="input"
          />
          {pieceUnit && effectiveFactor === 0 && (
            <p className="text-[12px] leading-relaxed text-text-3">
              הזינו למעלה כמה יחידות ב{item.unit} כדי לעדכן גם ב{BASE_UNIT} בודדות.
            </p>
          )}
        </>
      )}
    </div>
  );
}
