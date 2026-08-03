import { Icon } from "@/components/ui";
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

export function ArrivingTodayChip({ className }: { className?: string }) {
  return (
    <span
      className={`inventory-order-arriving-today-chip${className ? ` ${className}` : ""}`}
      title="יום האספקה של הספק הוא היום"
    >
      <span className="inventory-order-arriving-today-pulse" aria-hidden />
      <Icon name="local_shipping" size={13} />
      אמור להגיע היום
    </span>
  );
}

export function OrderPreviewStack({ lines }: { lines: OrderLine[] }) {
  const shown = lines.slice(0, 3);
  const extra = lines.length - shown.length;

  return (
    <div className="inventory-order-avatars">
      {shown.map((line, i) => (
        <div key={line.id} className="inventory-order-avatar" style={{ zIndex: shown.length - i }}>
          {line.item?.image_url ? (
            <img src={line.item.image_url} alt={line.item.name} />
          ) : (
            <span className="inventory-order-avatar-fallback">
              <Icon name="inventory_2" size={14} />
            </span>
          )}
        </div>
      ))}
      {extra > 0 && <span className="inventory-order-avatar-more">+{extra}</span>}
    </div>
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
  partialUiState?: PartialBatchUiState;
  /** When set, replaces the default supplier chip in the card footer. */
  footChipLabel?: string;
  footChipIcon?: string;
}) {
  const isReceived = received ?? batchIsFullyReceived(batch);
  const pendingQty = batch.lines
    .filter((l) => l.status !== "received")
    .reduce((sum, l) => sum + Number(l.quantity), 0);
  const totalQty = isReceived
    ? batchReceivedUnits(batch)
    : batch.lines.reduce((sum, l) => sum + Number(l.quantity), 0);
  const date = formatOrderDate(batch.created_at);
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

  return (
    <article
      className={`inventory-order-card inventory-item-enter${needsPartialAttention ? " inventory-order-card--partial-attention" : deliversToday ? " inventory-order-card--arriving-today" : ""}`}
      style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
    >
      <button type="button" className="inventory-order-card-main" onClick={onDetails}>
        <div className={`inventory-order-date${deliversToday ? " inventory-order-date--arriving-today" : ""}`}>
          <span className="inventory-order-date-day">{date.day}</span>
          <span className="inventory-order-date-month">{date.month}</span>
        </div>
        <div className="inventory-order-heading">
          <div className="inventory-order-title-row">
            <h3 className="inventory-order-title">{orderPreviewLabel(batch.lines)}</h3>
            {deliversToday ? <ArrivingTodayChip /> : null}
            <span className={`inventory-order-status${statusModifier}`}>
              <span className="inventory-order-status-dot" aria-hidden />
              {statusLabel}
            </span>
            {needsPartialAttention ? (
              <span className="inventory-order-partial-chip" title="הגיעה כמות חלקית — נדרשת התייחסות">
                <Icon name="priority_high" size={13} />
                לא הגיע במלואו
              </span>
            ) : null}
          </div>
          <p className="inventory-order-sub">
            <b>{batch.lines.length}</b> פריטים · <b>{totalQty}</b> בסך הכול
            {isReceived ? " התקבלו" : pendingQty < totalQty ? ` · ${pendingQty} ממתין` : ""} · הוזמן{" "}
            {date.time} · {batchOrderedByLabel(batch)}
            {showBatchTotal ? ` · ${formatCurrency(batchTotal)}` : ""}
          </p>
        </div>
      </button>

      <div className="inventory-order-card-foot">
        <OrderPreviewStack lines={batch.lines} />
        <span className="inventory-order-delivery-chip" title={footChipLabel ? undefined : supplierLabel}>
          <Icon name={footChipIcon} size={13} />
          {supplierLabel}
        </span>
        {showBatchTotal && (
          <span className="inventory-order-delivery-chip" title="סה״כ הזמנה">
            <Icon name="payments" size={13} />
            {formatCurrency(batchTotal)}
          </span>
        )}
        <span className="inventory-order-foot-spacer" />
        <button
          type="button"
          className="inventory-order-icon-btn"
          onClick={onDetails}
          aria-label="פרטי הזמנה"
          title="פרטים"
        >
          <Icon name="visibility" size={17} />
        </button>
        {canManageOrders && !isReceived && (
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
            partialUiState={getBatchPartialUiState?.(batch) ?? "none"}
            footChipLabel={footChipLabel}
            footChipIcon={footChipIcon}
          />
        ))}
      </div>
    </div>
  );
}
