import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, Spinner } from "@/components/ui";
import { formatCurrency, HE_DAYS } from "@/lib/db";
import { orderBatchTotal } from "@/api/inventory";
import type { InventoryOrderWithUser, ItemWithQty } from "@/api/inventory";
import type { SupplierItemPriceIndex } from "@/api/suppliers";
import { supplierPricesFor } from "@/api/suppliers";
import type { PartialBatchUiState } from "@/hooks/usePartialDeliveryOrderCount";
import type { Supplier } from "@/types/database";

export type OrderLine = InventoryOrderWithUser & { item?: ItemWithQty };

export type OrderBatch = {
  id: string;
  batch_id: string | null;
  created_at: string;
  ordered_by: string | null;
  ordered_by_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  lines: OrderLine[];
};

function formatDeliveryDays(days: number[] | null | undefined): string {
  if (!days?.length) return "לא הוגדר";
  const valid = [...new Set(days.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (valid.length === 0) return "לא הוגדר";
  return valid.map((d) => `יום ${HE_DAYS[d]}`).join(", ");
}

export function groupOrderBatches(orders: InventoryOrderWithUser[], items: ItemWithQty[]): OrderBatch[] {
  const map = new Map<string, OrderBatch>();
  for (const o of orders) {
    const key = o.batch_id ?? o.id;
    const line: OrderLine = { ...o, item: items.find((i) => i.id === o.item_id) };
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        batch_id: o.batch_id,
        created_at: o.created_at,
        ordered_by: o.ordered_by,
        ordered_by_name: o.ordered_by_name,
        supplier_id: o.supplier_id,
        supplier_name: o.supplier_name,
        lines: [],
      });
    }
    map.get(key)!.lines.push(line);
  }
  return [...map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function batchHasPendingLines(batch: OrderBatch): boolean {
  return batch.lines.some((l) => l.status !== "received");
}

export function batchIsFullyReceived(batch: OrderBatch): boolean {
  return batch.lines.length > 0 && batch.lines.every((l) => l.status === "received");
}

export function batchReceivedUnits(batch: OrderBatch): number {
  return batch.lines.reduce(
    (sum, l) => sum + Number(l.status === "received" ? (l.received_quantity ?? l.quantity) : 0),
    0,
  );
}

export function batchOrderedByLabel(batch: OrderBatch): string {
  return batch.ordered_by_name ?? "לא ידוע";
}

export function batchSupplierLabel(batch: OrderBatch, suppliers: Supplier[]): string {
  if (batch.supplier_name?.trim()) return batch.supplier_name.trim();
  if (batch.supplier_id) {
    const name = suppliers.find((s) => s.id === batch.supplier_id)?.name?.trim();
    if (name) return name;
  }
  const fromLines = [
    ...new Set(
      batch.lines
        .map((l) => {
          if (!l.supplier_id) return l.supplier_name?.trim() ?? null;
          return suppliers.find((s) => s.id === l.supplier_id)?.name ?? l.supplier_name ?? null;
        })
        .filter((n): n is string => !!n?.trim())
        .map((n) => n.trim()),
    ),
  ];
  if (fromLines.length === 1) return fromLines[0];
  if (fromLines.length > 1) return fromLines.join(", ");
  return "ספק לא הוגדר";
}

export function formatOrderDate(iso: string) {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString("he-IL", { day: "numeric" }),
    month: d.toLocaleDateString("he-IL", { month: "short" }),
    time: d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
    full: d.toLocaleDateString("he-IL", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

/** Short, human day label for the card: "היום" / "אתמול" / "3 אוג׳". */
export function orderDayLabel(iso: string): string {
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (diff === 0) return "היום";
  if (diff === 1) return "אתמול";
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

export function orderPreviewLabel(lines: OrderLine[]): string {
  const names = lines.map((l) => l.item?.name ?? "פריט");
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} ועוד ${names.length - 2}`;
}

export function lineDeliveryDays(line: OrderLine, suppliers: Supplier[]): number[] {
  if (!line.supplier_id) return [];
  const days = suppliers.find((s) => s.id === line.supplier_id)?.delivery_days;
  if (!days?.length) return [];
  return [...new Set(days.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
}

export function orderDeliveryDaysLabel(lines: OrderLine[], suppliers: Supplier[]): string {
  const days = [
    ...new Set(lines.flatMap((l) => lineDeliveryDays(l, suppliers))),
  ].sort((a, b) => a - b);

  if (days.length === 0) return "לא הוגדר";
  return days.map((d) => formatDeliveryDays([d])).join(", ");
}

/** True when at least one line's supplier delivers on the given weekday (0=Sun … 6=Sat). */
export function orderDeliversToday(
  lines: OrderLine[],
  suppliers: Supplier[],
  now: Date = new Date(),
): boolean {
  const today = now.getDay();
  return lines.some((l) => lineDeliveryDays(l, suppliers).includes(today));
}

export function ArrivingTodayChip({
  className,
  label = "אמור להגיע היום",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={`inventory-order-arriving-today-chip${className ? ` ${className}` : ""}`}
      title="יום האספקה של הספק הוא היום"
    >
      <span className="inventory-order-arriving-today-pulse" aria-hidden />
      <Icon name="local_shipping" size={13} />
      {label}
    </span>
  );
}

/** Leading visual: one product image, or a mosaic of up to 4 (last cell becomes "+N"). */
export function OrderThumbMosaic({ lines }: { lines: OrderLine[] }) {
  const shown = lines.slice(0, 4);
  const extra = lines.length - 4;
  const cells = extra > 0 ? shown.slice(0, 3) : shown;

  return (
    <span
      className={`inventory-order-thumbs inventory-order-thumbs--${Math.min(lines.length, 4)}`}
      aria-hidden
    >
      {cells.map((line) => (
        <span key={line.id} className="inventory-order-thumb-cell">
          {line.item?.image_url ? (
            <img src={line.item.image_url} alt="" loading="lazy" />
          ) : (
            <Icon name="inventory_2" size={lines.length === 1 ? 20 : 13} />
          )}
        </span>
      ))}
      {extra > 0 && (
        <span className="inventory-order-thumb-cell inventory-order-thumb-cell--more">
          +{extra + 1}
        </span>
      )}
    </span>
  );
}

export interface OrderCardAction {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/** Mobile action sheet behind the card's ⋯ button — keeps the row itself uncluttered. */
function OrderCardMenu({ title, actions }: { title: string; actions: OrderCardAction[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <button
        type="button"
        className="inventory-order-kebab"
        onClick={() => setOpen(true)}
        aria-label="פעולות על ההזמנה"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="more_vert" size={19} />
      </button>

      {open &&
        createPortal(
          <div className="inventory-order-sheet-overlay" onClick={() => setOpen(false)}>
            <div
              className="inventory-order-sheet"
              role="menu"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="inventory-order-sheet-handle" aria-hidden />
              <p className="inventory-order-sheet-title">{title}</p>
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  role="menuitem"
                  className={`inventory-order-sheet-item${action.danger ? " inventory-order-sheet-item--danger" : ""}`}
                  onClick={run(action.onClick)}
                >
                  <Icon name={action.icon} size={20} />
                  {action.label}
                </button>
              ))}
              <button
                type="button"
                className="inventory-order-sheet-cancel"
                onClick={() => setOpen(false)}
              >
                ביטול
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function OrderBatchCard({
  batch,
  index,
  canManageOrders,
  canSeePrices,
  supplierPriceIndex,
  suppliers,
  received,
  onDetails,
  onEdit,
  onDelete,
  onPdf,
  pdfBusy,
  partialUiState = "none",
  footChipLabel,
  footChipIcon = "store",
}: {
  batch: OrderBatch;
  index: number;
  canManageOrders: boolean;
  canSeePrices: boolean;
  supplierPriceIndex?: SupplierItemPriceIndex;
  suppliers: Supplier[];
  received?: boolean;
  onDetails: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Offered only where prices may be shown — the document lists them. */
  onPdf?: () => void;
  pdfBusy?: boolean;
  partialUiState?: PartialBatchUiState;
  /** When set, replaces the supplier name in the card's meta line. */
  footChipLabel?: string;
  footChipIcon?: string;
}) {
  const isReceived = received ?? batchIsFullyReceived(batch);
  const date = formatOrderDate(batch.created_at);
  const title = orderPreviewLabel(batch.lines);
  const supplierLabel = footChipLabel ?? batchSupplierLabel(batch, suppliers);
  const supplierPrices = supplierPricesFor(supplierPriceIndex, batch.supplier_id);
  const batchTotal = canSeePrices ? orderBatchTotal(batch.lines, supplierPrices) : 0;
  const showBatchTotal = canSeePrices && batchTotal > 0;
  const statusLabel = isReceived ? "התקבל" : partialUiState === "handled" ? "טופל" : "בהזמנה";
  const statusModifier = isReceived
    ? " inventory-order-status--received"
    : partialUiState === "handled"
      ? " inventory-order-status--handled"
      : "";
  const needsPartialAttention = partialUiState === "needs_attention";
  const deliversToday = !isReceived && orderDeliversToday(batch.lines, suppliers);
  const canEditThis = canManageOrders && !isReceived;

  return (
    <article
      className={`inventory-order-card inventory-item-enter${needsPartialAttention ? " inventory-order-card--partial-attention" : deliversToday ? " inventory-order-card--arriving-today" : ""}`}
      style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
    >
      <button
        type="button"
        className="inventory-order-card-main"
        onClick={onDetails}
        aria-label={`${title} — ${statusLabel}, ${batch.lines.length} פריטים`}
      >
        <OrderThumbMosaic lines={batch.lines} />

        <span className="inventory-order-heading">
          <span className="inventory-order-title">{title}</span>

          <span className="inventory-order-sub">
            <span className="inventory-order-sub-main" title={footChipLabel ? undefined : supplierLabel}>
              <Icon name={footChipIcon} size={13} />
              {supplierLabel}
            </span>
            <span className="inventory-order-sub-dot" aria-hidden />
            <span>{batch.lines.length} פריטים</span>
            {showBatchTotal ? (
              <>
                <span className="inventory-order-sub-dot" aria-hidden />
                <b>{formatCurrency(batchTotal)}</b>
              </>
            ) : null}
          </span>

          <span className="inventory-order-chips">
            {needsPartialAttention ? (
              <span className="inventory-order-partial-chip" title="הגיעה כמות חלקית — נדרשת התייחסות">
                <Icon name="priority_high" size={13} />
                לא הגיע במלואו
              </span>
            ) : (
              <span className={`inventory-order-status${statusModifier}`}>
                <span className="inventory-order-status-dot" aria-hidden />
                {statusLabel}
              </span>
            )}
            {deliversToday ? <ArrivingTodayChip label="מגיע היום" /> : null}
            <span className="inventory-order-chips-tail">
              {orderDayLabel(batch.created_at)} {date.time}
            </span>
          </span>
        </span>
      </button>

      <div className="inventory-order-actions-inline">
        {onPdf && (
          <button
            type="button"
            className="inventory-order-icon-btn inventory-order-icon-btn-pdf"
            onClick={onPdf}
            disabled={pdfBusy}
            aria-label="הורדת מסמך הזמנה PDF"
            title="מסמך הזמנה (PDF)"
          >
            {pdfBusy ? <Spinner size={16} /> : <Icon name="picture_as_pdf" size={17} />}
          </button>
        )}
        <button
          type="button"
          className="inventory-order-icon-btn"
          onClick={onDetails}
          aria-label="פרטי הזמנה"
          title="פרטים"
        >
          <Icon name="visibility" size={17} />
        </button>
        {canEditThis && (
          <>
            <button
              type="button"
              className="inventory-order-icon-btn"
              onClick={onEdit}
              aria-label="עריכת הזמנה"
              title="עריכה"
            >
              <Icon name="edit" size={17} />
            </button>
            <button
              type="button"
              className="inventory-order-icon-btn inventory-order-icon-btn-danger"
              onClick={onDelete}
              aria-label="מחיקת הזמנה"
              title="מחיקה"
            >
              <Icon name="delete" size={17} />
            </button>
          </>
        )}
      </div>

      {/* Nothing to offer beyond "details" when the order is closed and carries
          no document — the card tap already does that */}
      {(canEditThis || onPdf) && (
        <OrderCardMenu
          title={title}
          actions={[
            { icon: "visibility", label: "פרטי ההזמנה", onClick: onDetails },
            ...(onPdf ? [{ icon: "picture_as_pdf", label: "הורדת מסמך PDF", onClick: onPdf }] : []),
            ...(canEditThis
              ? [
                  { icon: "edit", label: "עריכת ההזמנה", onClick: onEdit },
                  { icon: "delete", label: "מחיקת ההזמנה", onClick: onDelete, danger: true },
                ]
              : []),
          ]}
        />
      )}
    </article>
  );
}

export function OrderBatchListSection({
  title,
  icon,
  batches,
  canManageOrders,
  canSeePrices,
  supplierPriceIndex,
  suppliers,
  received,
  onDetails,
  onEdit,
  onDelete,
  onPdf,
  pdfBusyBatchId,
  getBatchPartialUiState,
  footChipLabel,
  footChipIcon,
}: {
  title: string;
  icon: string;
  batches: OrderBatch[];
  canManageOrders: boolean;
  canSeePrices: boolean;
  supplierPriceIndex?: SupplierItemPriceIndex;
  suppliers: Supplier[];
  received?: boolean;
  onDetails: (batch: OrderBatch) => void;
  onEdit: (batch: OrderBatch) => void;
  onDelete: (batch: OrderBatch) => void;
  onPdf?: (batch: OrderBatch) => void;
  pdfBusyBatchId?: string | null;
  getBatchPartialUiState?: (batch: OrderBatch) => PartialBatchUiState;
  footChipLabel?: string;
  footChipIcon?: string;
}) {
  if (batches.length === 0) return null;
  return (
    <div className="inventory-orders-list">
      <div className="inventory-orders-list-head">
        <div className="inventory-orders-list-title">
          <Icon name={icon} size={18} />
          {title}
        </div>
        <span className="inventory-orders-panel-count">{batches.length}</span>
      </div>
      <div className="inventory-orders-cards">
        {batches.map((batch, idx) => (
          <OrderBatchCard
            key={batch.id}
            batch={batch}
            index={idx}
            canManageOrders={canManageOrders}
            canSeePrices={canSeePrices}
            supplierPriceIndex={supplierPriceIndex}
            suppliers={suppliers}
            received={received}
            onDetails={() => onDetails(batch)}
            onEdit={() => onEdit(batch)}
            onDelete={() => onDelete(batch)}
            onPdf={onPdf ? () => onPdf(batch) : undefined}
            pdfBusy={pdfBusyBatchId === batch.id}
            partialUiState={getBatchPartialUiState?.(batch) ?? "none"}
            footChipLabel={footChipLabel}
            footChipIcon={footChipIcon}
          />
        ))}
      </div>
    </div>
  );
}
