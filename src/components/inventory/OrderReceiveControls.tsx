import { useEffect, useState } from "react";
import { Button, Icon, Input, SectionLoader } from "@/components/ui";
import { DualUnitQtyInput } from "@/components/inventory/DualUnitQtyInput";
import { supportsPieceInput } from "@/api/inventory";
import type { Warehouse } from "@/types/database";

export type OrderReceiveConfirm = {
  receivedQty: number;
  warehouseId: string;
};

type OrderReceiveControlsProps = {
  orderedQty: number;
  unit: string | null;
  unitsPerPackage: number | null;
  warehouses: Warehouse[];
  defaultWarehouseId: string | null;
  busy?: boolean;
  compact?: boolean;
  mode?: "receive" | "correct";
  initialReceivedQty?: number;
  onConfirmArrived: (payload: OrderReceiveConfirm) => void;
  onNotArrived?: () => void;
  onCancel?: () => void;
};

export function OrderReceiveControls({
  orderedQty,
  unit,
  unitsPerPackage,
  warehouses,
  defaultWarehouseId,
  busy,
  compact,
  mode = "receive",
  initialReceivedQty,
  onConfirmArrived,
  onNotArrived,
  onCancel,
}: OrderReceiveControlsProps) {
  const [receivedQty, setReceivedQty] = useState(initialReceivedQty ?? orderedQty);
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId ?? warehouses[0]?.id ?? "");

  useEffect(() => {
    setReceivedQty(initialReceivedQty ?? orderedQty);
  }, [initialReceivedQty, orderedQty]);

  useEffect(() => {
    setWarehouseId(defaultWarehouseId ?? warehouses[0]?.id ?? "");
  }, [defaultWarehouseId, warehouses]);

  const pieceUnit = supportsPieceInput(unit);
  const invalid =
    !Number.isFinite(receivedQty) || receivedQty <= 0 || receivedQty > orderedQty || !warehouseId;
  const isCorrect = mode === "correct";
  const multiWarehouse = !isCorrect && warehouses.length > 1;
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId) ?? null;

  function handleArrived() {
    if (invalid || busy || !warehouseId) return;
    onConfirmArrived({ receivedQty, warehouseId });
  }

  return (
    <div className={`order-receive-panel${compact ? " order-receive-panel--compact" : ""}`}>
      <SectionLoader show={!!busy} label={isCorrect ? "מעדכן כמות..." : "מעדכן הזמנה..."} />

      {(onCancel || !compact) && (
        <div className="order-receive-panel-head">
          <div>
            <p className="order-receive-panel-title">
              {isCorrect ? "עדכון כמות שהגיעה" : "קבלת סחורה"}
            </p>
            {!isCorrect && (
              <p className="order-receive-panel-sub">הכמות תתווסף למחסן שתבחרו</p>
            )}
          </div>
          {onCancel ? (
            <button
              type="button"
              className="order-receive-panel-close"
              disabled={busy}
              onClick={onCancel}
              aria-label="סגור"
            >
              <Icon name="close" size={18} />
            </button>
          ) : null}
        </div>
      )}

      {!isCorrect && (
        <div className="order-receive-panel-section">
          <span className="order-receive-panel-label">מחסן יעד</span>
          {multiWarehouse ? (
            <div className="order-receive-warehouse-bar" role="radiogroup" aria-label="בחירת מחסן">
              {warehouses.map((w) => {
                const active = w.id === warehouseId;
                return (
                  <button
                    key={w.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={busy}
                    className="order-receive-warehouse-btn"
                    data-active={active ? "true" : undefined}
                    onClick={() => setWarehouseId(w.id)}
                  >
                    <Icon name="warehouse" size={16} className="order-receive-warehouse-btn-icon" />
                    <span className="order-receive-warehouse-btn-label">{w.name}</span>
                    {w.is_default ? <span className="order-receive-warehouse-btn-tag">ראשי</span> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="order-receive-warehouse-single">
              <Icon name="warehouse" size={16} />
              <span>{selectedWarehouse?.name ?? "מחסן ראשי"}</span>
              {selectedWarehouse?.is_default ? <em>ראשי</em> : null}
            </div>
          )}
        </div>
      )}

      <div className="order-receive-panel-section">
        <label className="order-receive-panel-label">
          {isCorrect ? "כמה הגיע בפועל?" : "כמה הגיע?"}
        </label>
        {pieceUnit ? (
          <DualUnitQtyInput
            value={receivedQty}
            mainUnit={unit}
            unitsPerPackage={unitsPerPackage}
            disabled={busy}
            onCommit={setReceivedQty}
            min={0}
            compact={false}
          />
        ) : (
          <div className="order-receive-qty-row">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={orderedQty}
              step="any"
              disabled={busy}
              value={String(receivedQty)}
              onChange={(e) => setReceivedQty(Number(e.target.value))}
              className="order-receive-qty-input"
            />
            {unit ? <span className="order-receive-qty-unit">{unit}</span> : null}
          </div>
        )}
        {receivedQty < orderedQty && receivedQty > 0 && (
          <p className="order-receive-hint">
            נותרו {orderedQty - receivedQty}
            {unit ? ` ${unit}` : ""} בהזמנה
          </p>
        )}
        {invalid && receivedQty > orderedQty && (
          <p className="order-receive-error">לא ניתן לקבל יותר מהכמות שהוזמנה</p>
        )}
      </div>

      <div className="order-receive-actions">
        {!isCorrect && onNotArrived ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={onNotArrived}
            className="order-receive-action-secondary"
          >
            לא הגיע
          </Button>
        ) : null}
        <Button
          icon={isCorrect ? "save" : "check_circle"}
          disabled={busy || invalid}
          loading={busy}
          onClick={handleArrived}
          className="order-receive-action-primary"
        >
          {isCorrect ? "שמור" : "אישור קבלה"}
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
