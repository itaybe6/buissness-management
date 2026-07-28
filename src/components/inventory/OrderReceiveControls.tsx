import { useEffect, useState } from "react";
import { Button, Input, SectionLoader } from "@/components/ui";
import { DualUnitQtyInput } from "@/components/inventory/DualUnitQtyInput";
import { supportsPieceInput } from "@/api/inventory";

type OrderReceiveControlsProps = {
  orderedQty: number;
  unit: string | null;
  unitsPerPackage: number | null;
  busy?: boolean;
  compact?: boolean;
  mode?: "receive" | "correct";
  initialReceivedQty?: number;
  onConfirmArrived: (receivedQty: number) => void;
  onNotArrived?: () => void;
};

export function OrderReceiveControls({
  orderedQty,
  unit,
  unitsPerPackage,
  busy,
  compact,
  mode = "receive",
  initialReceivedQty,
  onConfirmArrived,
  onNotArrived,
}: OrderReceiveControlsProps) {
  const [receivedQty, setReceivedQty] = useState(initialReceivedQty ?? orderedQty);

  useEffect(() => {
    setReceivedQty(initialReceivedQty ?? orderedQty);
  }, [initialReceivedQty, orderedQty]);

  const pieceUnit = supportsPieceInput(unit);
  const invalid =
    !Number.isFinite(receivedQty) || receivedQty <= 0 || receivedQty > orderedQty;
  const isCorrect = mode === "correct";

  function handleArrived() {
    if (invalid || busy) return;
    onConfirmArrived(receivedQty);
  }

  return (
    <div className={`relative ${compact ? "flex flex-col gap-2" : "flex flex-col gap-2.5"}`}>
      <SectionLoader show={!!busy} label={isCorrect ? "מעדכן כמות..." : "מעדכן הזמנה..."} />
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold text-text-3">
          {isCorrect ? "עדכון כמות שהגיעה בפועל" : "כמה הגיע בפועל?"}
        </label>
        {pieceUnit ? (
          <DualUnitQtyInput
            value={receivedQty}
            mainUnit={unit}
            unitsPerPackage={unitsPerPackage}
            disabled={busy}
            onCommit={setReceivedQty}
            min={0}
            compact
          />
        ) : (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={orderedQty}
              step="any"
              disabled={busy}
              value={String(receivedQty)}
              onChange={(e) => setReceivedQty(Number(e.target.value))}
              className="flex-1"
            />
            {unit ? <span className="shrink-0 text-[12px] font-medium text-text-3">{unit}</span> : null}
          </div>
        )}
        {receivedQty < orderedQty && receivedQty > 0 && (
          <p className="mt-1.5 text-[11px] text-text-3">
            נותרו {orderedQty - receivedQty}
            {unit ? ` ${unit}` : ""} בהזמנה
          </p>
        )}
        {invalid && receivedQty > orderedQty && (
          <p className="mt-1 text-[11px] font-medium text-[var(--danger)]">לא ניתן לקבל יותר מהכמות שהוזמנה</p>
        )}
      </div>
      <div className="flex gap-2">
        {!isCorrect && onNotArrived ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={onNotArrived}
            className="flex-1 !py-2.5 active:scale-[0.97]"
          >
            לא הגיע
          </Button>
        ) : null}
        <Button
          icon={isCorrect ? "save" : "check_circle"}
          disabled={busy || invalid}
          onClick={handleArrived}
          className={`${isCorrect || !onNotArrived ? "w-full" : "flex-1"} !bg-ink !py-2.5 active:scale-[0.97]`}
        >
          {isCorrect ? "שמור" : "הגיע"}
        </Button>
      </div>
    </div>
  );
}

export function formatOrderReceivedLabel(line: {
  quantity: number;
  received_quantity: number | null;
  status: string;
}): string | null {
  if (line.status !== "received") return null;
  const received = line.received_quantity ?? line.quantity;
  if (received === line.quantity) return `${received}`;
  return `${received} מתוך ${line.quantity}`;
}
