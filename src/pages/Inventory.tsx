import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Button, EmptyState, Field, Icon, Input, ErrorState, Select, Spinner } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { WastePanel } from "@/components/waste/WastePanel";
import { DualUnitQtyInput } from "@/components/inventory/DualUnitQtyInput";
import { useAuth } from "@/lib/auth";
import { useBusinessId, HE_DAYS } from "@/lib/db";
import {
  useInventory,
  useCreateItem,
  useUpdateItem,
  useSetCount,
  useOrders,
  useCreateOrdersBatch,
  useUpdateOrdersBatch,
  useDeleteOrdersBatch,
  useReceiveOrder,
  type InventoryOrderWithUser,
  useItemLogs,
  uploadItemImage,
  INVENTORY_UNITS,
  INVENTORY_CATEGORIES,
  inventoryCategoryLabel,
  inventorySaveError,
  supportsPieceInput,
  mainUnitToPieces,
  type ItemWithQty,
  type ItemLog,
} from "@/api/inventory";
import { useWaste } from "@/api/waste";
import type { InventoryAction, InventoryWaste } from "@/types/database";

type InventoryTab = "items" | "orders" | "waste";

type OrderLine = InventoryOrderWithUser & { item?: ItemWithQty };

type OrderBatch = {
  id: string;
  batch_id: string | null;
  created_at: string;
  ordered_by: string | null;
  ordered_by_name: string | null;
  lines: OrderLine[];
};

function groupOpenOrders(orders: InventoryOrderWithUser[], items: ItemWithQty[]): OrderBatch[] {
  const map = new Map<string, OrderBatch>();
  for (const o of orders) {
    if (o.status === "received") continue;
    const key = o.batch_id ?? o.id;
    const line: OrderLine = { ...o, item: items.find((i) => i.id === o.item_id) };
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        batch_id: o.batch_id,
        created_at: o.created_at,
        ordered_by: o.ordered_by,
        ordered_by_name: o.ordered_by_name,
        lines: [],
      });
    }
    map.get(key)!.lines.push(line);
  }
  return [...map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function batchOrderedByLabel(batch: OrderBatch): string {
  return batch.ordered_by_name ?? "לא ידוע";
}

type ItemForm = {
  name: string;
  category: string;
  unit: string;
  unitsPerPackage: string;
  qty: string;
  minQty: string;
  deliveryDay: string;
  imageUrl: string | null;
  file: File | null;
};

const EMPTY_FORM: ItemForm = { name: "", category: "", unit: "יחידות", unitsPerPackage: "", qty: "0", minQty: "0", deliveryDay: "", imageUrl: null, file: null };

function formatDeliveryDay(day: number | null | undefined): string {
  if (day == null || day < 0 || day > 6) return "לא הוגדר";
  return `יום ${HE_DAYS[day]}`;
}

function formatOrderDate(iso: string) {
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

function orderPreviewLabel(lines: OrderLine[]): string {
  const names = lines.map((l) => l.item?.name ?? "פריט");
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} ועוד ${names.length - 2}`;
}

/** Unique supplier delivery days across order lines, formatted for display. */
function orderDeliveryDaysLabel(lines: OrderLine[]): string {
  const days = [
    ...new Set(
      lines
        .map((l) => l.item?.supplier_delivery_day)
        .filter((d): d is number => d != null && d >= 0 && d <= 6),
    ),
  ].sort((a, b) => a - b);

  if (days.length === 0) return "לא הוגדר";
  return days.map((d) => formatDeliveryDay(d)).join(", ");
}

type StockStatus = "empty" | "low" | "ok";

function stockStatus(item: ItemWithQty): StockStatus {
  if (item.current_qty === 0) return "empty";
  const threshold = item.min_quantity > 0 ? item.min_quantity : 3;
  if (item.current_qty <= threshold) return "low";
  return "ok";
}

const STOCK_META: Record<StockStatus, { label: string; dot: string; bar: string }> = {
  empty: { label: "אזל מהמלאי", dot: "var(--danger)", bar: "var(--danger)" },
  low: { label: "מלאי נמוך", dot: "var(--warning)", bar: "var(--warning)" },
  ok: { label: "במלאי", dot: "var(--success)", bar: "var(--success)" },
};

function QtyStepper({
  value,
  unit,
  unitsPerPackage,
  disabled,
  onCommit,
  compact,
}: {
  value: number;
  unit: string | null;
  unitsPerPackage: number | null;
  disabled?: boolean;
  onCommit: (qty: number) => void;
  compact?: boolean;
}) {
  return (
    <DualUnitQtyInput
      value={value}
      mainUnit={unit}
      unitsPerPackage={unitsPerPackage}
      disabled={disabled}
      onCommit={onCommit}
      variant="stepper"
      compact={compact}
    />
  );
}

function TabBar({
  tab,
  total,
  pending,
  wasteCount,
  showOrders,
  showWaste,
  onChange,
}: {
  tab: InventoryTab;
  total: number;
  pending: number;
  wasteCount: number;
  showOrders: boolean;
  showWaste: boolean;
  onChange: (tab: InventoryTab) => void;
}) {
  const tabs = [
    { key: "items" as const, label: "מלאי", count: total },
    ...(showOrders
      ? [{ key: "orders" as const, label: "הזמנות", count: pending }]
      : []),
    ...(showWaste
      ? [{ key: "waste" as const, label: "בלאי", count: wasteCount }]
      : []),
  ];

  return (
    <div
      className="inventory-summary mb-4 md:mb-6"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
    >
      {tabs.map(({ key, label, count }) => (
        <button
          key={key}
          type="button"
          data-active={tab === key}
          onClick={() => onChange(key)}
          className="inventory-summary-cell inventory-tab-cell"
        >
          <div className="text-[18px] font-extrabold leading-none tabular-nums tracking-tight md:text-[26px]">{count}</div>
          <div className="inventory-tab-cell-label mt-1 text-[10px] font-medium text-text-3 md:mt-1.5 md:text-[12px]">{label}</div>
        </button>
      ))}
    </div>
  );
}

function TabSearchBar<T extends string>({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  filters,
  placeholder,
  resultCount,
  totalCount,
  resultUnit,
  onAdd,
  showAdd,
  addIcon = "add",
  addAriaLabel = "הוספה",
  addDisabled,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  filter: T;
  onFilterChange: (f: T) => void;
  filters: { key: T; label: string }[];
  placeholder: string;
  resultCount: number;
  totalCount: number;
  resultUnit: string;
  onAdd?: () => void;
  showAdd?: boolean;
  addIcon?: string;
  addAriaLabel?: string;
  addDisabled?: boolean;
}) {
  const hasFilter = query.trim() || (filters.length > 0 && filter !== filters[0]?.key);

  return (
    <div className="inventory-search mb-4 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Icon
            name="search"
            size={18}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-3"
          />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={placeholder}
            className="!pr-10"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="ניקוי חיפוש"
              className="absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        {showAdd && onAdd && (
          <Button
            icon={addIcon}
            onClick={onAdd}
            disabled={addDisabled}
            aria-label={addAriaLabel}
            className="!h-11 !w-11 shrink-0 !p-0 !bg-ink shadow-sm hover:brightness-110 active:scale-[0.97] md:hidden"
          />
        )}
      </div>

      {filters.length > 0 && (
        <div className="inventory-search-filters flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filters.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              data-active={filter === key}
              onClick={() => onFilterChange(key)}
              className="inventory-search-chip shrink-0"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {hasFilter && (
        <p className="text-[11px] font-medium text-text-3">
          {resultCount} מתוך {totalCount} {resultUnit}
        </p>
      )}
    </div>
  );
}

type OrderFilter = "all" | "today" | "week";
type WasteFilter = "all" | "deducted" | "not_deducted";

const ORDER_FILTERS: { key: OrderFilter; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "today", label: "היום" },
  { key: "week", label: "השבוע" },
];

const WASTE_FILTERS: { key: WasteFilter; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "deducted", label: "הופחת מהמלאי" },
  { key: "not_deducted", label: "לא הופחת" },
];

function isWithinDays(iso: string, days: number): boolean {
  const d = new Date(iso);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  return d >= start;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function filterWasteRecords(
  records: InventoryWaste[],
  items: ItemWithQty[],
  query: string,
  filter: WasteFilter,
): InventoryWaste[] {
  const q = query.trim().toLowerCase();
  return records.filter((w) => {
    if (filter === "deducted" && !w.deducted) return false;
    if (filter === "not_deducted" && w.deducted) return false;
    if (q) {
      const item = items.find((i) => i.id === w.item_id);
      const haystack = [item?.name ?? "", w.note ?? ""].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function filterOrderBatches(batches: OrderBatch[], query: string, filter: OrderFilter): OrderBatch[] {
  const q = query.trim().toLowerCase();
  return batches.filter((batch) => {
    if (filter === "today" && !isToday(batch.created_at)) return false;
    if (filter === "week" && !isWithinDays(batch.created_at, 7)) return false;
    if (q) {
      const haystack = [
        orderPreviewLabel(batch.lines),
        batchOrderedByLabel(batch),
        ...batch.lines.map((l) => l.item?.name ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function StockBar({ item }: { item: ItemWithQty }) {
  const status = stockStatus(item);
  const meta = STOCK_META[status];
  const cap = Math.max(item.current_qty, 10);
  const pct = Math.min(100, (item.current_qty / cap) * 100);

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
        <span className="text-[11.5px] font-semibold text-text-3">{meta.label}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-[width] duration-[220ms] [transition-timing-function:var(--ease-out)]"
          style={{ width: `${pct}%`, background: meta.bar }}
        />
      </div>
    </div>
  );
}

function ItemCard({
  item,
  index,
  isManager,
  canManageOrders,
  onEdit,
  onHistory,
  onOrder,
  onSetQty,
}: {
  item: ItemWithQty;
  index: number;
  isManager: boolean;
  canManageOrders: boolean;
  onEdit: () => void;
  onHistory: () => void;
  onOrder: () => void;
  onSetQty: (qty: number) => void;
}) {
  const status = stockStatus(item);
  const meta = STOCK_META[status];

  return (
    <article
      className="inventory-card inventory-product-card inventory-item-enter flex flex-col overflow-hidden rounded-[14px] border border-border/60 bg-surface md:rounded-card md:border-0"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      {/* Mobile — compact product tile */}
      <div className="flex flex-col md:hidden">
        <div className="inventory-product-image relative aspect-[5/4] max-h-[100px] shrink-0 overflow-hidden bg-surface-2">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-text-3/60">
              <Icon name="inventory_2" size={26} />
            </div>
          )}
          <span
            className="inventory-product-badge absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold backdrop-blur-sm"
            style={{ background: `color-mix(in srgb, ${meta.dot} 18%, var(--surface))`, color: meta.dot }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
            {meta.label}
          </span>
          {item.ordered_qty > 0 && (
            <span className="absolute top-1.5 left-1.5 rounded-full bg-[var(--info)] px-1.5 py-0.5 text-[9px] font-extrabold text-white">
              +{item.ordered_qty}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-2">
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-[12px] font-bold leading-snug tracking-tight">{item.name}</h3>
              {inventoryCategoryLabel(item.category) && (
                <span className="text-[10px] font-semibold text-text-3">{inventoryCategoryLabel(item.category)}</span>
              )}
            </div>
            <div className="shrink-0 text-left leading-none">
              <span className="text-[17px] font-extrabold tabular-nums">{item.current_qty}</span>
              {item.unit && <span className="block text-[9px] font-semibold text-text-3">{item.unit}</span>}
            </div>
          </div>

          <QtyStepper
            value={item.current_qty}
            unit={item.unit}
            unitsPerPackage={item.units_per_package}
            disabled={!isManager}
            onCommit={onSetQty}
            compact
          />

          {isManager && (
            <div className="flex gap-1 border-t border-border-2 pt-1.5">
              <button
                type="button"
                onClick={onEdit}
                className="inventory-product-action flex-1"
                aria-label="עריכה"
              >
                <Icon name="edit" size={15} />
              </button>
              <button
                type="button"
                onClick={onHistory}
                className="inventory-product-action flex-1"
                aria-label="היסטוריה"
              >
                <Icon name="history" size={15} />
              </button>
              {canManageOrders && (
                <button
                  type="button"
                  onClick={onOrder}
                  className="inventory-product-action inventory-product-action--primary flex-1"
                  aria-label="הזמנה"
                >
                  <Icon name="add_shopping_cart" size={15} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Desktop — detailed card */}
      <div className="hidden flex-col md:flex">
        <div className="inventory-card-image relative aspect-[5/4] overflow-hidden bg-surface-2">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.name}
              className="h-full w-full object-cover transition-transform duration-[400ms] [transition-timing-function:var(--ease-out)]"
            />
          ) : (
            <div className="grid h-full place-items-center text-text-3/70">
              <Icon name="inventory_2" size={36} />
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold leading-snug tracking-tight">{item.name}</h3>
              {inventoryCategoryLabel(item.category) && (
                <span className="mt-0.5 block text-[11px] font-semibold text-text-3">{inventoryCategoryLabel(item.category)}</span>
              )}
            </div>
            {isManager && (
              <button
                type="button"
                onClick={onHistory}
                aria-label="היסטוריית עדכונים"
                title="היסטוריית עדכונים"
                className="-mt-0.5 -ml-1 grid h-7 w-7 flex-none place-items-center rounded-md text-text-3 transition-[background-color,color] duration-[160ms] [transition-timing-function:var(--ease-out)] hover:bg-surface-2 hover:text-text active:scale-[0.97]"
              >
                <Icon name="history" size={17} />
              </button>
            )}
          </div>
          <StockBar item={item} />

          <div className="mt-3 flex items-center gap-1.5 text-[12px] text-text-3">
            <Icon name="local_shipping" size={15} className="flex-none opacity-80" />
            <span>
              אספקה מהספק:{" "}
              <span className={item.supplier_delivery_day != null ? "font-semibold text-text-2" : ""}>
                {formatDeliveryDay(item.supplier_delivery_day)}
              </span>
            </span>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="flex items-end gap-5">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-text-3">כמות</div>
                <div className="mt-1 text-[22px] font-extrabold tabular-nums leading-none">{item.current_qty}</div>
                {supportsPieceInput(item.unit) && item.units_per_package ? (
                  <div className="mt-0.5 text-[11px] font-medium text-text-3">
                    ({mainUnitToPieces(item.current_qty, item.units_per_package)} יח׳)
                  </div>
                ) : null}
                {item.ordered_qty > 0 && (
                  <div className="mt-1 text-[12px] font-bold tabular-nums text-[var(--info)]">+{item.ordered_qty} בהזמנה</div>
                )}
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-text-3">מינימום</div>
                <div
                  className={`mt-1 text-[22px] font-extrabold tabular-nums leading-none ${item.min_quantity > 0 ? "text-text" : "text-text-3"}`}
                >
                  {item.min_quantity}
                  {item.unit ? <span className="mr-0.5 text-[12px] font-semibold text-text-3">{item.unit}</span> : null}
                </div>
              </div>
            </div>
            <QtyStepper
              value={item.current_qty}
              unit={item.unit}
              unitsPerPackage={item.units_per_package}
              disabled={!isManager}
              onCommit={onSetQty}
            />
          </div>

          {isManager && (
            <div className="inventory-card-actions mt-4 flex gap-2 border-t border-border-2 pt-3">
              <Button variant="secondary" icon="edit" className="flex-1 !py-2.5 active:scale-[0.97]" onClick={onEdit}>
                עריכה
              </Button>
              {canManageOrders && (
                <Button
                  variant="ghost"
                  icon="add_shopping_cart"
                  onClick={onOrder}
                  className="!bg-ink !py-2.5 !text-white hover:brightness-110 active:scale-[0.97]"
                >
                  הזמנה
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function OrderPreviewStack({ lines }: { lines: OrderLine[] }) {
  const shown = lines.slice(0, 4);
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

function OrderDetailLine({
  line,
  index,
  onReceive,
}: {
  line: OrderLine;
  index: number;
  onReceive: () => void;
}) {
  const item = line.item;
  const pending = line.status !== "received";

  return (
    <div className="inventory-order-detail-line inventory-item-enter" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <div className="inventory-order-detail-main">
        <div className="inventory-order-detail-thumb">
          {item?.image_url ? (
            <img src={item.image_url} alt={item.name} />
          ) : (
            <span className="grid h-full place-items-center text-text-3">
              <Icon name="inventory_2" size={20} />
            </span>
          )}
        </div>
        <div className="inventory-order-detail-info">
          <div className="inventory-order-detail-name">{item?.name ?? "פריט"}</div>
          <div className="inventory-order-detail-sub">
            <Icon name="event" size={12} />
            אמורה להגיע: {formatDeliveryDay(item?.supplier_delivery_day)}
          </div>
          <div className="inventory-order-detail-qty-mobile">
            <span className="inventory-order-detail-qty-value">{line.quantity}</span>
            {item?.unit ? <span className="inventory-order-detail-qty-unit">{item.unit}</span> : null}
            {item && supportsPieceInput(item.unit) && item.units_per_package ? (
              <span className="inventory-order-detail-qty-pieces">
                ({mainUnitToPieces(Number(line.quantity), item.units_per_package)} יח׳)
              </span>
            ) : null}
          </div>
        </div>
        <div className="inventory-order-detail-qty inventory-order-detail-qty-desktop">
          {line.quantity}
          {item?.unit ? <span className="mr-0.5 text-[10px] font-semibold text-text-3">{item.unit}</span> : null}
          {item && supportsPieceInput(item.unit) && item.units_per_package ? (
            <span className="block text-[10px] font-medium text-text-3">
              ({mainUnitToPieces(Number(line.quantity), item.units_per_package)} יח׳)
            </span>
          ) : null}
        </div>
      </div>
      <div className="inventory-order-detail-action">
        {pending ? (
          <Button
            variant="secondary"
            icon="check_circle"
            className="inventory-order-receive-btn !w-full !bg-ink !py-2.5 !px-3 !text-[13px] !text-white hover:brightness-110 active:scale-[0.97] md:!w-auto"
            onClick={onReceive}
          >
            סמן כהתקבל
          </Button>
        ) : (
          <Badge tone="success">במלאי</Badge>
        )}
      </div>
    </div>
  );
}

function OrderBatchRow({
  batch,
  index,
  canManageOrders,
  onDetails,
  onEdit,
  onDelete,
}: {
  batch: OrderBatch;
  index: number;
  canManageOrders: boolean;
  onDetails: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const totalQty = batch.lines.reduce((sum, l) => sum + Number(l.quantity), 0);
  const date = formatOrderDate(batch.created_at);
  const deliveryLabel = orderDeliveryDaysLabel(batch.lines);

  return (
    <article
      className="inventory-order-card inventory-item-enter"
      style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
    >
      <div className="inventory-order-card-head">
        <div className="inventory-order-date">
          <span className="inventory-order-date-day">{date.day}</span>
          <span className="inventory-order-date-month">{date.month}</span>
        </div>
        <span className="inventory-order-status">
          <span className="inventory-order-status-dot" aria-hidden />
          בהזמנה
        </span>
      </div>

      <button type="button" className="inventory-order-card-main" onClick={onDetails}>
        <h3 className="inventory-order-title">{orderPreviewLabel(batch.lines)}</h3>
        <OrderPreviewStack lines={batch.lines} />

        <div className="inventory-order-card-stats">
          <div className="inventory-order-stat">
            <span className="inventory-order-stat-value">{batch.lines.length}</span>
            <span className="inventory-order-stat-label">פריטים</span>
          </div>
          <div className="inventory-order-stat">
            <span className="inventory-order-stat-value">{totalQty}</span>
            <span className="inventory-order-stat-label">יחידות</span>
          </div>
          <div className="inventory-order-stat">
            <span className="inventory-order-stat-value">{date.time}</span>
            <span className="inventory-order-stat-label">הוזמן</span>
          </div>
        </div>

        <div className="inventory-order-card-infos">
          <div className="inventory-order-info-row">
            <Icon name="event" size={15} />
            <span>
              אמורה להגיע: <strong>{deliveryLabel}</strong>
            </span>
          </div>
          <div className="inventory-order-info-row">
            <Icon name="person" size={15} />
            <span>
              {batchOrderedByLabel(batch)}
            </span>
          </div>
        </div>
      </button>

      <div className="inventory-order-card-actions">
        <Button
          variant="secondary"
          icon="visibility"
          className="inventory-order-details-btn active:scale-[0.97]"
          onClick={onDetails}
        >
          פרטים
        </Button>
        {canManageOrders && (
          <>
            <button
              type="button"
              className="inventory-order-icon-btn"
              onClick={onEdit}
              aria-label="עריכת הזמנה"
              title="עריכה"
            >
              <Icon name="edit" size={18} />
            </button>
            <button
              type="button"
              className="inventory-order-icon-btn inventory-order-icon-btn-danger"
              onClick={onDelete}
              aria-label="מחיקת הזמנה"
              title="מחיקה"
            >
              <Icon name="delete" size={18} />
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function OrderDetailsModal({
  batch,
  open,
  onClose,
  onReceive,
}: {
  batch: OrderBatch | null;
  open: boolean;
  onClose: () => void;
  onReceive: (line: OrderLine) => void;
}) {
  if (!batch) return null;

  const date = formatOrderDate(batch.created_at);
  const totalQty = batch.lines.reduce((sum, l) => sum + Number(l.quantity), 0);
  const pendingCount = batch.lines.filter((l) => l.status !== "received").length;

  return (
    <Modal open={open} onClose={onClose} title="פרטי הזמנה" subtitle={date.full} icon="local_shipping" maxWidth={540}>
      <div className="inventory-order-detail-summary">
        <div className="inventory-order-detail-stat">
          <div className="inventory-order-detail-stat-label">פריטים</div>
          <div className="inventory-order-detail-stat-value">{batch.lines.length}</div>
        </div>
        <div className="inventory-order-detail-stat">
          <div className="inventory-order-detail-stat-label">סה״כ יחידות</div>
          <div className="inventory-order-detail-stat-value">{totalQty}</div>
        </div>
      </div>
      <div className="inventory-order-delivery-banner">
        <Icon name="event" size={18} />
        <div>
          <div className="text-[11px] font-semibold text-text-3">יום אספקה מהספק</div>
          <div className="text-[14px] font-bold text-text">{orderDeliveryDaysLabel(batch.lines)}</div>
        </div>
      </div>
      <div className="inventory-order-delivery-banner inventory-order-by-banner">
        <Icon name="person" size={18} />
        <div>
          <div className="text-[11px] font-semibold text-text-3">הוזמן על ידי</div>
          <div className="text-[14px] font-bold text-text">{batchOrderedByLabel(batch)}</div>
        </div>
      </div>
      {pendingCount > 0 && (
        <p className="mb-3 text-[12px] font-medium text-text-3">
          {pendingCount} פריטים ממתינים לקבלה במלאי
        </p>
      )}
      <div className="flex flex-col">
        {batch.lines.map((line, idx) => (
          <OrderDetailLine key={line.id} line={line} index={idx} onReceive={() => onReceive(line)} />
        ))}
      </div>
    </Modal>
  );
}

function OrdersEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="inventory-orders-empty inventory-item-enter">
      <div className="inventory-orders-empty-icon">
        <Icon name="local_shipping" size={32} />
      </div>
      <h3 className="mt-5 text-[17px] font-extrabold tracking-tight text-text">אין הזמנות פתוחות</h3>
      <p className="mt-2 max-w-[34ch] text-[13px] leading-relaxed text-text-3">
        צרו הזמנה חדשה, בחרו מוצרים וכמויות. הפריטים יסומנו כ«בהזמנה» עד שיסומנו כהתקבלו במלאי.
      </p>
      <Button icon="add_shopping_cart" onClick={onCreate} className="mt-5 w-full !bg-ink shadow-sm hover:brightness-110 active:scale-[0.97] md:w-auto">
        הזמנה חדשה
      </Button>
    </div>
  );
}

function NewOrderModal({
  open,
  items,
  lines,
  busy,
  error,
  isEditing,
  onClose,
  onChange,
  onSubmit,
}: {
  open: boolean;
  items: ItemWithQty[];
  lines: Record<string, string>;
  busy: boolean;
  error: string | null;
  isEditing: boolean;
  onClose: () => void;
  onChange: (itemId: string, qty: string) => void;
  onSubmit: () => void;
}) {
  const selected = items.filter((it) => (Number(lines[it.id]) || 0) > 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "עריכת הזמנה" : "הזמנה חדשה"}
      subtitle={isEditing ? "עדכנו מוצרים וכמויות" : "בחרו מוצרים וכמויות לשליחה לספק"}
      icon={isEditing ? "edit" : "add_shopping_cart"}
      maxWidth={540}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="active:scale-[0.97]">
            ביטול
          </Button>
          <Button className="flex-1 !bg-ink active:scale-[0.97]" loading={busy} disabled={selected.length === 0} onClick={onSubmit}>
            {isEditing ? `שמירה (${selected.length})` : `שליחת הזמנה (${selected.length})`}
          </Button>
        </>
      }
    >
      {items.length > 0 && (
        <div className="inventory-order-picker-summary">
          <span className="inventory-order-picker-summary-label">נבחרו להזמנה</span>
          <span className="inventory-order-picker-summary-value">{selected.length} פריטים</span>
        </div>
      )}
      <div className="inventory-order-picker-list">
        {items.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-text-3">אין מוצרים במלאי להזמנה</p>
        ) : (
          items.map((it) => {
            const qty = Number(lines[it.id]) || 0;
            return (
              <div key={it.id} className="inventory-order-picker-row" data-selected={qty > 0}>
                <div className="inventory-order-picker-thumb">
                  {it.image_url ? (
                    <img src={it.image_url} alt={it.name} />
                  ) : (
                    <span className="grid h-full place-items-center text-text-3">
                      <Icon name="inventory_2" size={18} />
                    </span>
                  )}
                </div>
                <div className="inventory-order-picker-info">
                  <div className="inventory-order-picker-name">{it.name}</div>
                  <div className="inventory-order-picker-stock">
                    במלאי {it.current_qty}
                    {it.unit ? ` ${it.unit}` : ""}
                    {it.ordered_qty > 0 ? ` · ${it.ordered_qty} בהזמנה` : ""}
                  </div>
                </div>
                <DualUnitQtyInput
                  value={qty}
                  mainUnit={it.unit}
                  unitsPerPackage={it.units_per_package}
                  onCommit={(mainQty) => onChange(it.id, mainQty > 0 ? String(mainQty) : "")}
                  variant="input"
                  className="inventory-order-picker-qty-wrap min-w-[120px]"
                />
              </div>
            );
          })
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
            <Icon name="error" size={18} /> {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-card border-0 bg-surface shadow-card">
      <div className="relative aspect-[5/4] overflow-hidden bg-surface-2">
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-black/[0.04] to-transparent" />
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="h-4 w-2/3 rounded-md bg-surface-2" />
        <div className="h-1 w-full rounded-full bg-surface-2" />
        <div className="h-8 w-full rounded-lg bg-surface-2" />
      </div>
    </div>
  );
}

const LOG_META: Record<InventoryAction, { label: string; icon: string; color: string }> = {
  created: { label: "נוצר פריט", icon: "add_circle", color: "var(--success)" },
  count: { label: "עדכון כמות", icon: "inventory_2", color: "var(--info)" },
  edited: { label: "עריכת פרטים", icon: "edit", color: "var(--accent-2)" },
  waste: { label: "דיווח בלאי", icon: "delete", color: "var(--danger)" },
  order: { label: "הזמנה", icon: "local_shipping", color: "var(--warning)" },
};

function formatLogTime(iso: string) {
  return new Date(iso).toLocaleString("he-IL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HistoryModal({
  businessId,
  item,
  onClose,
}: {
  businessId: string | null;
  item: ItemWithQty | null;
  onClose: () => void;
}) {
  const { data: logs, isLoading, isError } = useItemLogs(businessId, item?.id ?? null);
  const unit = item?.unit ? ` ${item.unit}` : "";

  function detail(log: ItemLog): string {
    switch (log.action) {
      case "count":
        return log.previous_qty != null
          ? `כמות: ${log.previous_qty}${unit} ← ${log.new_qty}${unit}`
          : `הכמות עודכנה ל-${log.new_qty}${unit}`;
      case "created":
        return log.new_qty != null ? `כמות התחלתית: ${log.new_qty}${unit}` : "הפריט נוצר";
      case "edited":
        return log.note ?? "עודכנו פרטי הפריט";
      case "waste":
        return `בלאי: ${log.new_qty}${unit}${log.note ? ` · ${log.note}` : ""}`;
      case "order":
        return `הוזמנו ${log.new_qty}${unit}`;
      default:
        return "";
    }
  }

  return (
    <Modal open={!!item} onClose={onClose} title="היסטוריית עדכונים" subtitle={item?.name} icon="history" maxWidth={520}>
      {isLoading ? (
        <div className="grid place-items-center py-12">
          <Spinner size={28} />
        </div>
      ) : isError ? (
        <p className="py-10 text-center text-[13px] text-text-3">שגיאה בטעינת ההיסטוריה</p>
      ) : !logs || logs.length === 0 ? (
        <EmptyState
          icon="history"
          title="אין עדכונים עדיין"
          description="כל שינוי בכמות, עריכת פרטים או דיווח בלאי יתועד כאן עם שם העובד והשעה."
        />
      ) : (
        <ol className="flex flex-col">
          {logs.map((log) => {
            const meta = LOG_META[log.action];
            return (
              <li key={log.id} className="flex gap-3 border-b border-border-2 py-3 last:border-0">
                <span
                  className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full"
                  style={{ background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}
                >
                  <Icon name={meta.icon} size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] font-bold">{meta.label}</span>
                    <span className="flex-none text-[11.5px] text-text-3">{formatLogTime(log.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-text-2">{detail(log)}</p>
                  <p className="mt-1 flex items-center gap-1 text-[12px] font-medium text-text-3">
                    <Icon name="person" size={13} />
                    {log.employee_name ?? "לא ידוע"}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
}

export function Inventory() {
  const businessId = useBusinessId();
  const { profile, hasFeature } = useAuth();
  const showWaste = hasFeature("waste");
  const { data: items, isLoading, isError, refetch } = useInventory(businessId);
  const canManageOrders = !!(profile && ["manager", "office_manager"].includes(profile.role));
  const { data: orders } = useOrders(businessId, canManageOrders);
  const { data: wasteRecords } = useWaste(showWaste ? businessId : null);
  const createItem = useCreateItem(businessId);
  const updateItem = useUpdateItem(businessId);
  const setCount = useSetCount(businessId);
  const createOrdersBatch = useCreateOrdersBatch(businessId);
  const updateOrdersBatch = useUpdateOrdersBatch(businessId);
  const deleteOrdersBatch = useDeleteOrdersBatch(businessId);
  const receiveOrder = useReceiveOrder(businessId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [wasteReportOpen, setWasteReportOpen] = useState(false);

  function resolveTab(param: string | null): InventoryTab {
    if (param === "waste" && showWaste) return "waste";
    if (param === "orders" && canManageOrders) return "orders";
    return "items";
  }

  const [tab, setTab] = useState<InventoryTab>(() => resolveTab(searchParams.get("tab")));
  const [modalOpen, setModalOpen] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [editingOrderBatch, setEditingOrderBatch] = useState<OrderBatch | null>(null);
  const [orderLines, setOrderLines] = useState<Record<string, string>>({});
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [detailBatchId, setDetailBatchId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ItemWithQty | null>(null);
  const [historyItem, setHistoryItem] = useState<ItemWithQty | null>(null);
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
  const [wasteSearchQuery, setWasteSearchQuery] = useState("");
  const [wasteFilter, setWasteFilter] = useState<WasteFilter>("all");
  const fileRef = useRef<HTMLInputElement>(null);

  const isManager = !!(profile && ["manager", "shift_manager", "office_manager"].includes(profile.role));

  function changeTab(next: InventoryTab) {
    setTab(next);
    setSearchParams(next === "items" ? {} : { tab: next }, { replace: true });
  }

  useEffect(() => {
    const next = resolveTab(searchParams.get("tab"));
    if (next !== tab) setTab(next);
  }, [searchParams, showWaste, canManageOrders]);

  useEffect(() => {
    if (!canManageOrders && tab === "orders") changeTab("items");
    if (!showWaste && tab === "waste") changeTab("items");
  }, [canManageOrders, showWaste, tab]);

  const list = items ?? [];
  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return list.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [list, searchQuery]);

  const orderList = orders ?? [];
  const openBatches = groupOpenOrders(orderList, list);
  const filteredOrderBatches = useMemo(
    () => filterOrderBatches(openBatches, orderSearchQuery, orderFilter),
    [openBatches, orderSearchQuery, orderFilter],
  );
  const detailBatch = detailBatchId ? openBatches.find((b) => b.id === detailBatchId) ?? null : null;
  const pending = orderList.filter((o) => o.status !== "received").length;
  const wasteCount = wasteRecords?.length ?? 0;
  const filteredWasteRecords = useMemo(
    () => filterWasteRecords(wasteRecords ?? [], list, wasteSearchQuery, wasteFilter),
    [wasteRecords, list, wasteSearchQuery, wasteFilter],
  );

  if (isLoading) {
    return (
      <div className="w-full">
        <header className="mb-6">
          <div className="h-8 w-40 rounded-md bg-surface-2" />
          <div className="mt-2 h-4 w-28 rounded-md bg-surface-2" />
        </header>
        <div className="mb-6 h-[76px] rounded-card border-0 bg-surface shadow-card" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }
  if (isError) return <ErrorState onRetry={refetch} />;

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(item: ItemWithQty) {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category ?? "",
      unit: item.unit ?? "יחידות",
      unitsPerPackage: item.units_per_package != null ? String(item.units_per_package) : "",
      qty: String(item.current_qty),
      minQty: String(item.min_quantity),
      deliveryDay: item.supplier_delivery_day != null ? String(item.supplier_delivery_day) : "",
      imageUrl: item.image_url,
      file: null,
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function openNewOrder(presetItemId?: string) {
    const init: Record<string, string> = {};
    if (presetItemId) init[presetItemId] = "1";
    setEditingOrderBatch(null);
    setOrderLines(init);
    setOrderError(null);
    setOrderModalOpen(true);
  }

  function openEditOrder(batch: OrderBatch) {
    const init: Record<string, string> = {};
    batch.lines.forEach((l) => {
      init[l.item_id] = String(l.quantity);
    });
    setEditingOrderBatch(batch);
    setOrderLines(init);
    setOrderError(null);
    setOrderModalOpen(true);
    setDetailBatchId(null);
  }

  function closeOrderModal() {
    setOrderModalOpen(false);
    setEditingOrderBatch(null);
    setOrderLines({});
    setOrderError(null);
  }

  async function submitOrder() {
    setOrderError(null);
    const lines = Object.entries(orderLines)
      .map(([item_id, qty]) => ({ item_id, quantity: Number(qty) || 0 }))
      .filter((l) => l.quantity > 0);
    if (!lines.length) return setOrderError("נא לבחור לפחות מוצר אחד עם כמות");
    setOrderBusy(true);
    try {
      if (editingOrderBatch) {
        const batchId = editingOrderBatch.batch_id ?? editingOrderBatch.id;
        await updateOrdersBatch.mutateAsync({
          batch_id: batchId,
          business_id: businessId!,
          ordered_by: editingOrderBatch.ordered_by ?? profile?.id ?? null,
          line_ids: editingOrderBatch.lines.map((l) => l.id),
          lines,
        });
      } else {
        await createOrdersBatch.mutateAsync({
          business_id: businessId!,
          ordered_by: profile?.id ?? null,
          lines,
        });
      }
      closeOrderModal();
      changeTab("orders");
    } catch (e) {
      setOrderError(inventorySaveError(e));
    } finally {
      setOrderBusy(false);
    }
  }

  async function handleDeleteOrder(batch: OrderBatch) {
    const ok = window.confirm("למחוק את ההזמנה? הפריטים יוסרו מרשימת «בהזמנה».");
    if (!ok) return;
    try {
      await deleteOrdersBatch.mutateAsync({
        business_id: businessId!,
        line_ids: batch.lines.map((l) => l.id),
        employee_id: profile?.id ?? null,
        lines: batch.lines.map((l) => ({ item_id: l.item_id, quantity: Number(l.quantity) })),
      });
      if (detailBatchId === batch.id) setDetailBatchId(null);
    } catch (e) {
      window.alert(inventorySaveError(e));
    }
  }

  async function handleReceive(line: OrderLine) {
    const item = list.find((i) => i.id === line.item_id);
    if (!item) return;
    await receiveOrder.mutateAsync({
      order_id: line.id,
      business_id: businessId!,
      item_id: line.item_id,
      quantity: Number(line.quantity),
      current_qty: item.current_qty,
      employee_id: profile?.id ?? null,
    });
  }

  async function submitItem() {
    setError(null);
    if (!form.name.trim()) return setError("נא להזין שם מוצר");
    setBusy(true);
    try {
      let image_url = form.imageUrl;
      if (form.file) image_url = await uploadItemImage(businessId!, form.file);
      const quantity = Number(form.qty) || 0;
      const min_quantity = Math.max(0, Number(form.minQty) || 0);
      const supplier_delivery_day = form.deliveryDay === "" ? null : Number(form.deliveryDay);
      const category = form.category || null;
      const units_per_package = supportsPieceInput(form.unit)
        ? Math.max(0, Number(form.unitsPerPackage) || 0) || null
        : null;

      if (editing) {
        const changed: string[] = [];
        if (form.name.trim() !== editing.name) changed.push("שם");
        if (form.unit !== (editing.unit ?? "יחידות")) changed.push("יחידת מידה");
        if (units_per_package !== editing.units_per_package) changed.push("יחידים ביחידת מידה");
        if (min_quantity !== editing.min_quantity) changed.push("כמות מינימום");
        if (supplier_delivery_day !== editing.supplier_delivery_day) changed.push("יום אספקה");
        if (category !== editing.category) changed.push("קטגוריה");
        if (image_url !== editing.image_url) changed.push("תמונה");
        await updateItem.mutateAsync({
          id: editing.id,
          business_id: businessId!,
          employee_id: profile?.id ?? null,
          changes: {
            name: form.name.trim(),
            unit: form.unit,
            units_per_package,
            image_url,
            min_quantity,
            supplier_delivery_day,
            category,
          },
          note: changed.length ? `עודכן: ${changed.join(", ")}` : null,
        });
        if (quantity !== editing.current_qty) {
          await setCount.mutateAsync({
            business_id: businessId!,
            item_id: editing.id,
            employee_id: profile?.id ?? null,
            quantity,
            previous_qty: editing.current_qty,
          });
        }
      } else {
        await createItem.mutateAsync({
          business_id: businessId!,
          name: form.name.trim(),
          unit: form.unit,
          units_per_package,
          image_url,
          min_quantity,
          supplier_delivery_day,
          category,
          quantity,
          employee_id: profile?.id ?? null,
        });
      }
      closeModal();
    } catch (e) {
      setError(inventorySaveError(e));
    } finally {
      setBusy(false);
    }
  }

  const showTabActions = (isManager && tab === "items") || (canManageOrders && tab === "orders") || (showWaste && tab === "waste");

  return (
    <div className="w-full animate-fadeUp">
      {showTabActions && (
        <header className="mb-4 hidden w-full flex-wrap items-center justify-end gap-4 md:mb-6 md:flex">
          {tab === "items" && isManager ? (
            <Button icon="add" onClick={openCreate} className="!bg-ink shadow-sm hover:brightness-110 active:scale-[0.97]">
              פריט חדש
            </Button>
          ) : tab === "orders" && canManageOrders ? (
            <Button icon="add_shopping_cart" onClick={() => openNewOrder()} className="!bg-ink shadow-sm hover:brightness-110 active:scale-[0.97]">
              הזמנה חדשה
            </Button>
          ) : tab === "waste" && showWaste ? (
            <Button
              icon="add"
              onClick={() => setWasteReportOpen(true)}
              disabled={list.length === 0}
              className="!bg-ink shadow-sm hover:brightness-110 active:scale-[0.97]"
            >
              דיווח בלאי
            </Button>
          ) : null}
        </header>
      )}

      <TabBar
        tab={tab}
        total={list.length}
        pending={pending}
        wasteCount={wasteCount}
        showOrders={canManageOrders}
        showWaste={showWaste}
        onChange={changeTab}
      />

      {tab === "waste" && showWaste ? (
        <>
          <TabSearchBar
            query={wasteSearchQuery}
            onQueryChange={setWasteSearchQuery}
            filter={wasteFilter}
            onFilterChange={setWasteFilter}
            filters={WASTE_FILTERS}
            placeholder="חיפוש בלאי..."
            resultCount={filteredWasteRecords.length}
            totalCount={wasteCount}
            resultUnit="דיווחים"
            onAdd={() => setWasteReportOpen(true)}
            showAdd
            addIcon="add"
            addAriaLabel="דיווח בלאי"
            addDisabled={list.length === 0}
          />
          <WastePanel
            items={list}
            records={filteredWasteRecords}
            totalRecords={wasteCount}
            reportOpen={wasteReportOpen}
            onReportOpenChange={setWasteReportOpen}
            onClearFilters={() => { setWasteSearchQuery(""); setWasteFilter("all"); }}
          />
        </>
      ) : tab === "orders" && canManageOrders ? (
        <>
          <TabSearchBar
            query={orderSearchQuery}
            onQueryChange={setOrderSearchQuery}
            filter={orderFilter}
            onFilterChange={setOrderFilter}
            filters={ORDER_FILTERS}
            placeholder="חיפוש הזמנה..."
            resultCount={filteredOrderBatches.length}
            totalCount={openBatches.length}
            resultUnit="הזמנות"
            onAdd={() => openNewOrder()}
            showAdd
            addIcon="add_shopping_cart"
            addAriaLabel="הזמנה חדשה"
          />
          {openBatches.length === 0 ? (
            <OrdersEmptyState onCreate={() => openNewOrder()} />
          ) : filteredOrderBatches.length === 0 ? (
            <EmptyState
              icon="search_off"
              title="לא נמצאו הזמנות"
              description="נסו מילת חיפוש אחרת או שנו את הסינון."
              action={
                <Button variant="secondary" onClick={() => { setOrderSearchQuery(""); setOrderFilter("all"); }}>
                  ניקוי סינון
                </Button>
              }
            />
          ) : (
            <div className="inventory-orders-list">
              <div className="inventory-orders-list-head">
                <div className="inventory-orders-list-title">
                  <Icon name="local_shipping" size={18} />
                  הזמנות פתוחות
                </div>
                <span className="inventory-orders-panel-count">{filteredOrderBatches.length}</span>
              </div>
              <div className="inventory-orders-cards">
                {filteredOrderBatches.map((batch, idx) => (
                  <OrderBatchRow
                    key={batch.id}
                    batch={batch}
                    index={idx}
                    canManageOrders={canManageOrders}
                    onDetails={() => setDetailBatchId(batch.id)}
                    onEdit={() => openEditOrder(batch)}
                    onDelete={() => handleDeleteOrder(batch)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : list.length === 0 ? (
          <EmptyState
            icon="inventory_2"
            title="אין פריטים במלאי"
            description="הוסיפו פריט ראשון עם שם, יחידת מידה ותמונה."
            action={isManager ? <Button icon="add" onClick={openCreate}>פריט חדש</Button> : undefined}
          />
        ) : (
          <>
            <TabSearchBar
              query={searchQuery}
              onQueryChange={setSearchQuery}
              filter="all"
              onFilterChange={() => {}}
              filters={[]}
              placeholder="חיפוש מוצר..."
              resultCount={filteredList.length}
              totalCount={list.length}
              resultUnit="פריטים"
              onAdd={openCreate}
              showAdd={isManager}
              addIcon="add"
              addAriaLabel="פריט חדש"
            />
            {filteredList.length === 0 ? (
              <EmptyState
                icon="search_off"
                title="לא נמצאו מוצרים"
                description="נסו מילת חיפוש אחרת."
                action={
                  <Button variant="secondary" onClick={() => setSearchQuery("")}>
                    ניקוי חיפוש
                  </Button>
                }
              />
            ) : (
              <div className="inventory-product-grid grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 lg:gap-4">
                {filteredList.map((it, idx) => (
                  <ItemCard
                    key={it.id}
                    item={it}
                    index={idx}
                    isManager={isManager}
                    canManageOrders={canManageOrders}
                    onEdit={() => openEdit(it)}
                    onHistory={() => setHistoryItem(it)}
                    onOrder={() => openNewOrder(it.id)}
                    onSetQty={(quantity) =>
                      setCount.mutate({
                        business_id: businessId!,
                        item_id: it.id,
                        employee_id: profile?.id ?? null,
                        quantity,
                        previous_qty: it.current_qty,
                      })
                    }
                  />
                ))}
              </div>
            )}
          </>
        )
      }

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "עריכת פריט" : "פריט מלאי חדש"}
        icon="inventory_2"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} className="active:scale-[0.97]">
              ביטול
            </Button>
            <Button className="flex-1 !bg-ink active:scale-[0.97]" loading={busy} onClick={submitItem}>
              {editing ? "שמירה" : "הוספה"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative flex aspect-[16/10] flex-col items-center justify-center gap-2 overflow-hidden rounded-[12px] border border-dashed border-border bg-surface-2 text-text-3 transition-[border-color,color] duration-[180ms] [transition-timing-function:var(--ease-out)] hover:border-text-3 hover:text-text active:scale-[0.99]"
          >
            {form.file || form.imageUrl ? (
              <>
                <img
                  src={form.file ? URL.createObjectURL(form.file) : form.imageUrl!}
                  alt="תמונת מוצר"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <span className="relative rounded-full bg-black/60 px-3 py-1 text-[12px] font-semibold text-white backdrop-blur-sm">
                  החלפת תמונה
                </span>
              </>
            ) : (
              <>
                <Icon name="add_a_photo" size={32} />
                <span className="text-[13px] font-semibold">העלאת תמונת מוצר</span>
              </>
            )}
          </button>

          <Field label="שם המוצר">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="לדוגמה: חלב 3%" />
          </Field>

          <Field label="קטגוריה">
            <Select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              <option value="">ללא קטגוריה</option>
              {INVENTORY_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="יחידת מידה">
              <Select
                value={form.unit}
                onChange={(e) => {
                  const unit = e.target.value;
                  setForm((f) => ({
                    ...f,
                    unit,
                    unitsPerPackage: unit === "יחידות" ? "" : f.unitsPerPackage,
                  }));
                }}
              >
                {INVENTORY_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="כמות נוכחית">
              <DualUnitQtyInput
                value={Number(form.qty) || 0}
                mainUnit={form.unit}
                unitsPerPackage={supportsPieceInput(form.unit) ? Number(form.unitsPerPackage) || null : null}
                onCommit={(q) => setForm((f) => ({ ...f, qty: String(q) }))}
                variant="input"
              />
            </Field>
          </div>

          {supportsPieceInput(form.unit) && (
            <Field label={`כמה ${form.unit === "ארגז" ? "יחידות" : "יחידים"} ב${form.unit}?`}>
              <Input
                type="number"
                min={1}
                value={form.unitsPerPackage}
                onChange={(e) => setForm((f) => ({ ...f, unitsPerPackage: e.target.value }))}
                placeholder="לדוגמה: 24"
              />
              <p className="mt-1 text-[12px] text-text-3">
                מאפשר להזין כמויות גם ב{form.unit} וגם ביחידים בודדים בעדכון מלאי, הזמנות ובלאי
              </p>
            </Field>
          )}

          <Field label="כמות מינימום">
            <Input type="number" min={0} value={form.minQty} onChange={(e) => setForm((f) => ({ ...f, minQty: e.target.value }))} placeholder="0" />
            <p className="mt-1 text-[12px] text-text-3">מתחת לסף זה הפריט יסומן כמלאי נמוך</p>
          </Field>

          <Field label="יום אספקה מהספק">
            <Select value={form.deliveryDay} onChange={(e) => setForm((f) => ({ ...f, deliveryDay: e.target.value }))}>
              <option value="">לא הוגדר</option>
              {HE_DAYS.map((d, i) => (
                <option key={i} value={String(i)}>
                  יום {d}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[12px] text-text-3">ביום זה הסחורה אמורה להגיע מהספק לאחר הזמנה</p>
          </Field>

          {error && (
            <div className="flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
              <Icon name="error" size={18} /> {error}
            </div>
          )}
        </div>
      </Modal>

      <HistoryModal businessId={businessId} item={historyItem} onClose={() => setHistoryItem(null)} />

      <NewOrderModal
        open={orderModalOpen}
        items={list}
        lines={orderLines}
        busy={orderBusy}
        error={orderError}
        isEditing={!!editingOrderBatch}
        onClose={closeOrderModal}
        onChange={(itemId, qty) => setOrderLines((prev) => ({ ...prev, [itemId]: qty }))}
        onSubmit={submitOrder}
      />

      <OrderDetailsModal
        batch={detailBatch}
        open={!!detailBatch}
        onClose={() => setDetailBatchId(null)}
        onReceive={handleReceive}
      />
    </div>
  );
}
