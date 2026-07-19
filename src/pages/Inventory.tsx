import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, EmptyState, Field, Icon, Input, ErrorState, LoadingOverlay, Select, Spinner } from "@/components/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { WastePanel } from "@/components/waste/WastePanel";
import { DualUnitQtyInput } from "@/components/inventory/DualUnitQtyInput";
import { InventoryQtyUpdatePanel } from "@/components/inventory/InventoryQtyUpdatePanel";
import { useAuth } from "@/lib/auth";
import { useBusinessId, HE_DAYS } from "@/lib/db";
import {
  useInventory,
  useCreateItem,
  useUpdateItem,
  useSetCount,
  useOrders,
  useDeleteOrdersBatch,
  useReceiveOrder,
  useMarkOrderNotArrived,
  type InventoryOrderWithUser,
  useItemLogs,
  uploadItemImage,
  INVENTORY_UNITS,
  INVENTORY_CATEGORIES,
  inventoryCategoryLabel,
  inventorySaveError,
  supportsPieceInput,
  mainUnitToPieces,
  splitPackageQty,
  type ItemWithQty,
  type ItemLog,
  isTrackedLowStock,
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

const HE_DAYS_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

/** Compact delivery-days label for chips, e.g. "ג׳ · ד׳". */
function orderDeliveryDaysShortLabel(lines: OrderLine[]): string | null {
  const days = [
    ...new Set(
      lines
        .map((l) => l.item?.supplier_delivery_day)
        .filter((d): d is number => d != null && d >= 0 && d <= 6),
    ),
  ].sort((a, b) => a - b);

  if (days.length === 0) return null;
  return days.map((d) => HE_DAYS_SHORT[d]).join(" · ");
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
type StockFilter = "all" | "low";

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

const STOCK_FILTERS: { key: StockFilter; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "low", label: "מלאי נמוך" },
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

function formatLastUpdate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

function LastUpdatedLine({ item, compact }: { item: ItemWithQty; compact?: boolean }) {
  if (!item.last_updated_at && !item.last_updated_by_name) return null;
  return (
    <p
      className={`flex items-center gap-1 truncate font-medium text-text-3 ${compact ? "text-[9px]" : "text-[11px]"}`}
      title={
        item.last_updated_at
          ? new Date(item.last_updated_at).toLocaleString("he-IL", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : undefined
      }
    >
      <Icon name="person" size={compact ? 11 : 13} className="shrink-0 opacity-70" />
      <span className="truncate">
        {item.last_updated_by_name ?? "לא ידוע"}
        {item.last_updated_at ? ` · ${formatLastUpdate(item.last_updated_at)}` : ""}
      </span>
    </p>
  );
}

function ItemDetailModal({
  item,
  open,
  canUpdateCount,
  isManager,
  canManageOrders,
  canUpdateOrderArrival,
  pendingOrders,
  orderArrivalBusy,
  onClose,
  onSetQty,
  onEdit,
  onHistory,
  onOrder,
  onMarkArrived,
  onMarkNotArrived,
}: {
  item: ItemWithQty | null;
  open: boolean;
  canUpdateCount: boolean;
  isManager: boolean;
  canManageOrders: boolean;
  canUpdateOrderArrival: boolean;
  pendingOrders: InventoryOrderWithUser[];
  orderArrivalBusy: boolean;
  onClose: () => void;
  onSetQty: (qty: number) => void;
  onEdit: () => void;
  onHistory: () => void;
  onOrder: () => void;
  onMarkArrived: (order: InventoryOrderWithUser) => void;
  onMarkNotArrived: (order: InventoryOrderWithUser) => void;
}) {
  const [editingQty, setEditingQty] = useState(false);
  const [draftQty, setDraftQty] = useState(0);
  const [orderPanelOpen, setOrderPanelOpen] = useState(false);

  useEffect(() => {
    if (!open || !item) {
      setEditingQty(false);
      setOrderPanelOpen(false);
      return;
    }
    setDraftQty(item.current_qty);
    setEditingQty(false);
    setOrderPanelOpen(false);
  }, [open, item?.id]);

  useEffect(() => {
    if (orderPanelOpen && pendingOrders.length === 0) setOrderPanelOpen(false);
  }, [orderPanelOpen, pendingOrders.length]);

  const businessId = useBusinessId();
  const { data: recentLogs, isLoading: recentLogsLoading } = useItemLogs(
    businessId,
    open && item ? item.id : null
  );

  if (!item) return null;

  const status = stockStatus(item);
  const meta = STOCK_META[status];
  const pieceUnit = supportsPieceInput(item.unit);
  const effectiveFactor =
    pieceUnit && (item.units_per_package ?? 0) > 0 ? item.units_per_package! : pieceUnit ? 12 : 0;
  const showPieces = pieceUnit && effectiveFactor > 0;
  const stockSplit = showPieces ? splitPackageQty(item.current_qty, effectiveFactor) : null;
  const draftDirty = draftQty !== item.current_qty;
  const orderCardInteractive = canUpdateOrderArrival && item.ordered_qty > 0;

  function handleSaveQty() {
    if (draftDirty) onSetQty(draftQty);
    setEditingQty(false);
  }

  function handleCancelQty() {
    setDraftQty(item!.current_qty);
    setEditingQty(false);
  }

  const categoryLabel = inventoryCategoryLabel(item.category);

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={520}
      fullScreenMobile
      hero={
        <div className="pd-hero">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} />
          ) : (
            <div className="pd-hero-fallback">
              <Icon name="inventory_2" size={88} />
            </div>
          )}
          <div className="pd-hero-scrim" />
          <div className="pd-hero-content">
            <span className="pd-status-chip" style={{ color: meta.dot }}>
              <span />
              {meta.label}
            </span>
            <h2 className="pd-hero-title">{item.name}</h2>
            {(categoryLabel || item.unit) && (
              <div className="pd-hero-sub">
                {categoryLabel && <span>{categoryLabel}</span>}
                {categoryLabel && item.unit && <span className="opacity-50">·</span>}
                {item.unit && <span>{item.unit}</span>}
              </div>
            )}
          </div>
        </div>
      }
      footer={
        isManager ? (
          <>
            <Button variant="secondary" icon="edit" onClick={onEdit} className="active:scale-[0.97]">
              עריכת פריט
            </Button>
            {canManageOrders && (
              <Button icon="add_shopping_cart" onClick={onOrder} className="flex-1 !bg-ink active:scale-[0.97]">
                הזמנה
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <div className="pd-stats">
          <div className="pd-stat">
            <span className="pd-stat-label">במלאי</span>
            {stockSplit ? (
              <>
                <span key={item.current_qty} className="pd-stat-num pd-num-pop">
                  {stockSplit.packages}
                </span>
                <span className="pd-stat-unit">
                  {item.unit ?? "ארגז"}
                  {stockSplit.pieces > 0 ? ` + ${stockSplit.pieces} יח׳` : ""}
                </span>
              </>
            ) : (
              <>
                <span key={item.current_qty} className="pd-stat-num pd-num-pop">
                  {item.current_qty}
                </span>
                {item.unit && <span className="pd-stat-unit">{item.unit}</span>}
              </>
            )}
          </div>
          <div className="pd-stat">
            <span className="pd-stat-label">מינימום</span>
            <span className="pd-stat-num">{item.min_quantity}</span>
            {item.unit && <span className="pd-stat-unit">{item.unit}</span>}
          </div>
          {orderCardInteractive ? (
            <button
              type="button"
              onClick={() => setOrderPanelOpen((v) => !v)}
              className="pd-stat pd-stat-action"
              aria-expanded={orderPanelOpen}
              aria-label="עדכון סטטוס הזמנה — הגיע או לא הגיע"
            >
              <span className="pd-stat-label text-[var(--info)]">
                בהזמנה
                <Icon name={orderPanelOpen ? "expand_less" : "expand_more"} size={13} />
              </span>
              <span className="pd-stat-num text-[var(--info)]">+{item.ordered_qty}</span>
              <span className="pd-stat-unit text-[var(--info)]">
                {item.unit ? `${item.unit} · ` : ""}
                {orderPanelOpen ? "סגירה" : "הגיע / לא הגיע"}
              </span>
            </button>
          ) : (
            <div className="pd-stat">
              <span className="pd-stat-label">בהזמנה</span>
              <span className={`pd-stat-num ${item.ordered_qty > 0 ? "text-[var(--info)]" : "text-text-3"}`}>
                {item.ordered_qty > 0 ? `+${item.ordered_qty}` : "—"}
              </span>
              {item.unit && item.ordered_qty > 0 && <span className="pd-stat-unit">{item.unit}</span>}
            </div>
          )}
        </div>

        {orderPanelOpen && orderCardInteractive && (
          <div
            className="rounded-[18px] border bg-surface p-4"
            style={{ borderColor: "color-mix(in srgb, var(--info) 28%, var(--border))" }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-[13px] font-bold text-text">עדכון הזמנה</div>
              <button
                type="button"
                onClick={() => setOrderPanelOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-full text-text-3 hover:bg-surface-2"
                aria-label="סגור"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            <p className="mb-3 text-[12px] leading-relaxed text-text-3">
              סמנו אם ההזמנה הגיעה (תתווסף למלאי) או לא הגיעה (תוסר מההזמנות).
            </p>
            <ul className="flex flex-col gap-2.5">
              {pendingOrders.map((order) => (
                <li
                  key={order.id}
                  className="rounded-[14px] border border-border bg-surface-2 px-3 py-2.5"
                >
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[15px] font-extrabold tabular-nums text-[var(--info)]">
                        +{order.quantity}
                        {item.unit ? (
                          <span className="mr-1 text-[12px] font-semibold text-text-3">{item.unit}</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-[11px] text-text-3">
                        {new Date(order.created_at).toLocaleDateString("he-IL", {
                          day: "numeric",
                          month: "short",
                        })}
                        {order.ordered_by_name ? ` · ${order.ordered_by_name}` : ""}
                      </div>
                    </div>
                    <Icon name="local_shipping" size={18} className="text-text-3" />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      disabled={orderArrivalBusy}
                      onClick={() => onMarkNotArrived(order)}
                      className="flex-1 !py-2.5 active:scale-[0.97]"
                    >
                      לא הגיע
                    </Button>
                    <Button
                      icon="check_circle"
                      disabled={orderArrivalBusy}
                      onClick={() => onMarkArrived(order)}
                      className="flex-1 !bg-ink !py-2.5 active:scale-[0.97]"
                    >
                      הגיע
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pd-list">
          <div className="pd-list-row">
            <span className="pd-list-icon">
              <Icon name="local_shipping" size={17} />
            </span>
            <span className="pd-list-label">אספקה מהספק</span>
            <span className="pd-list-value">{formatDeliveryDay(item.supplier_delivery_day)}</span>
          </div>
          {(item.last_updated_at || item.last_updated_by_name) && (
            <div className="pd-list-row">
              <span className="pd-list-icon">
                <Icon name="schedule" size={17} />
              </span>
              <span className="pd-list-label">עדכון אחרון</span>
              <span className="pd-list-value">
                {item.last_updated_by_name ?? "לא ידוע"}
                {item.last_updated_at && <small>{formatLastUpdate(item.last_updated_at)}</small>}
              </span>
            </div>
          )}
        </div>

        <div className="pd-qty-card">
          <div className="mb-3.5 flex items-center justify-between gap-2">
            <span className="pd-section-title">
              <Icon name="edit_square" size={14} />
              עדכון מלאי
            </span>
          </div>

          {canUpdateCount ? (
            <>
              <InventoryQtyUpdatePanel
                key={`${item.id}-${editingQty ? "edit" : "view"}`}
                item={item}
                disabled={!editingQty}
                autoCommit={false}
                onDraftChange={setDraftQty}
                onSetQty={onSetQty}
              />
              <div className="mt-3.5 flex gap-2">
                {editingQty ? (
                  <>
                    <Button
                      variant="secondary"
                      onClick={handleCancelQty}
                      className="flex-1 active:scale-[0.97]"
                    >
                      ביטול
                    </Button>
                    <Button
                      icon="check"
                      onClick={handleSaveQty}
                      disabled={!draftDirty}
                      className="flex-1 !bg-ink active:scale-[0.97]"
                    >
                      שמור
                    </Button>
                  </>
                ) : (
                  <Button
                    icon="edit"
                    onClick={() => {
                      setDraftQty(item.current_qty);
                      setEditingQty(true);
                    }}
                    className="flex-1 !bg-ink active:scale-[0.97]"
                  >
                    עריכה
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="text-[13px] text-text-3">אין הרשאה לעדכן מלאי.</p>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="pd-section-head">
            <span className="pd-section-title">
              <Icon name="history" size={14} />
              היסטוריית עדכונים
            </span>
            {(recentLogs?.length ?? 0) > 0 && (
              <button type="button" className="pd-all-btn" onClick={onHistory}>
                הצג הכל
                <Icon name="chevron_left" size={14} />
              </button>
            )}
          </div>

          {recentLogsLoading ? (
            <div className="pd-mini-log">
              <div className="pd-mini-row">
                <div className="skeleton-shimmer pd-mini-skeleton w-full" />
              </div>
              <div className="pd-mini-row">
                <div className="skeleton-shimmer pd-mini-skeleton w-2/3" />
              </div>
            </div>
          ) : recentLogs && recentLogs.length > 0 ? (
            <div className="pd-mini-log">
              {recentLogs.slice(0, 3).map((log) => {
                const lm = LOG_META[log.action];
                const delta =
                  log.action === "count" && log.previous_qty != null && log.new_qty != null
                    ? log.new_qty - log.previous_qty
                    : null;
                return (
                  <div key={log.id} className="pd-mini-row">
                    <span
                      className="pd-mini-node"
                      style={{
                        background: `color-mix(in srgb, ${lm.color} 12%, var(--surface))`,
                        color: lm.color,
                      }}
                    >
                      <Icon name={lm.icon} size={16} />
                    </span>
                    <div className="pd-mini-main">
                      <div className="pd-mini-title">
                        {lm.label}
                        {delta != null && delta !== 0 && (
                          <span className={`pd-delta ${delta > 0 ? "pd-delta--up" : "pd-delta--down"}`}>
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                        )}
                      </div>
                      <div className="pd-mini-sub">
                        {log.employee_name ?? "לא ידוע"} · {formatLogTime(log.created_at)}
                      </div>
                    </div>
                    {log.action === "count" && log.new_qty != null && (
                      <span className="text-[13.5px] font-extrabold tabular-nums text-text-2">
                        {log.new_qty}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="pd-mini-log">
              <div className="pd-mini-row">
                <span className="pd-mini-node bg-surface-2 text-text-3">
                  <Icon name="history" size={16} />
                </span>
                <div className="pd-mini-main">
                  <div className="pd-mini-sub">אין עדכונים עדיין — כל שינוי יתועד כאן</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ItemCard({
  item,
  index,
  isManager,
  canUpdateCount,
  canManageOrders,
  onOpen,
  onEdit,
  onHistory,
  onOrder,
  onSetQty,
}: {
  item: ItemWithQty;
  index: number;
  isManager: boolean;
  canUpdateCount: boolean;
  canManageOrders: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onHistory: () => void;
  onOrder: () => void;
  onSetQty: (qty: number) => void;
}) {
  const status = stockStatus(item);
  const meta = STOCK_META[status];
  const qtySplit =
    supportsPieceInput(item.unit) && (item.units_per_package ?? 0) > 0
      ? splitPackageQty(item.current_qty, item.units_per_package!)
      : null;

  return (
    <article
      className="inventory-card inventory-product-card inventory-item-enter flex flex-col overflow-hidden rounded-[14px] border border-border/60 bg-surface md:rounded-card md:border-0"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      {/* Mobile — compact product tile */}
      <div className="flex flex-col md:hidden">
        <button
          type="button"
          onClick={onOpen}
          className="flex flex-col text-right transition-opacity active:opacity-80"
        >
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

          <div className="flex flex-1 flex-col gap-1 p-2">
            <div className="flex items-start justify-between gap-1.5">
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-[12px] font-bold leading-snug tracking-tight">{item.name}</h3>
                {inventoryCategoryLabel(item.category) && (
                  <span className="text-[10px] font-semibold text-text-3">{inventoryCategoryLabel(item.category)}</span>
                )}
              </div>
              <div className="shrink-0 text-left leading-none">
                {qtySplit ? (
                  <>
                    <span className="text-[17px] font-extrabold tabular-nums">{qtySplit.packages}</span>
                    <span className="block text-[9px] font-semibold text-text-3">
                      {item.unit}
                      {qtySplit.pieces > 0 ? ` + ${qtySplit.pieces}` : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[17px] font-extrabold tabular-nums">{item.current_qty}</span>
                    {item.unit && <span className="block text-[9px] font-semibold text-text-3">{item.unit}</span>}
                  </>
                )}
              </div>
            </div>
            <LastUpdatedLine item={item} compact />
          </div>
        </button>

        <div className="px-2 pb-2" onClick={(e) => e.stopPropagation()}>
          <QtyStepper
            value={item.current_qty}
            unit={item.unit}
            unitsPerPackage={item.units_per_package}
            disabled={!canUpdateCount}
            onCommit={onSetQty}
            compact
          />

          {isManager && (
            <div className="mt-1.5 flex gap-1 border-t border-border-2 pt-1.5">
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
        <button
          type="button"
          onClick={onOpen}
          className="text-right transition-opacity hover:opacity-90 active:opacity-80"
        >
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
        </button>

        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-2">
            <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-right active:opacity-80">
              <h3 className="text-[15px] font-bold leading-snug tracking-tight">{item.name}</h3>
              {inventoryCategoryLabel(item.category) && (
                <span className="mt-0.5 block text-[11px] font-semibold text-text-3">{inventoryCategoryLabel(item.category)}</span>
              )}
              <div className="mt-1.5">
                <LastUpdatedLine item={item} />
              </div>
            </button>
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
                {qtySplit ? (
                  <>
                    <div className="mt-1 text-[22px] font-extrabold tabular-nums leading-none">{qtySplit.packages}</div>
                    <div className="mt-0.5 text-[11px] font-medium text-text-3">
                      {item.unit ?? "ארגז"}
                      {qtySplit.pieces > 0 ? ` + ${qtySplit.pieces} יח׳` : ""}
                    </div>
                  </>
                ) : (
                  <div className="mt-1 text-[22px] font-extrabold tabular-nums leading-none">{item.current_qty}</div>
                )}
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
              disabled={!canUpdateCount}
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
  const pieces =
    item && supportsPieceInput(item.unit) && item.units_per_package
      ? mainUnitToPieces(Number(line.quantity), item.units_per_package)
      : null;
  const deliveryDay = item?.supplier_delivery_day;

  return (
    <div className="inventory-order-detail-line inventory-item-enter" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
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
          <b>
            {line.quantity}
            {item?.unit ? ` ${item.unit}` : ""}
          </b>
          {pieces != null && <span>({pieces} יח׳)</span>}
          {deliveryDay != null && deliveryDay >= 0 && deliveryDay <= 6 && (
            <span>· אספקה {HE_DAYS_SHORT[deliveryDay]}</span>
          )}
        </div>
      </div>
      {pending ? (
        <button type="button" className="inventory-order-receive-btn" onClick={onReceive}>
          <Icon name="check_circle" size={16} />
          התקבל
        </button>
      ) : (
        <Badge tone="success">במלאי</Badge>
      )}
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
  const deliveryShort = orderDeliveryDaysShortLabel(batch.lines);

  return (
    <article
      className="inventory-order-card inventory-item-enter"
      style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
    >
      <button type="button" className="inventory-order-card-main" onClick={onDetails}>
        <div className="inventory-order-date">
          <span className="inventory-order-date-day">{date.day}</span>
          <span className="inventory-order-date-month">{date.month}</span>
        </div>
        <div className="inventory-order-heading">
          <div className="inventory-order-title-row">
            <h3 className="inventory-order-title">{orderPreviewLabel(batch.lines)}</h3>
            <span className="inventory-order-status">
              <span className="inventory-order-status-dot" aria-hidden />
              בהזמנה
            </span>
          </div>
          <p className="inventory-order-sub">
            <b>{batch.lines.length}</b> פריטים · <b>{totalQty}</b> יח׳ · הוזמן {date.time} · {batchOrderedByLabel(batch)}
          </p>
        </div>
      </button>

      <div className="inventory-order-card-foot">
        <OrderPreviewStack lines={batch.lines} />
        <span
          className="inventory-order-delivery-chip"
          title={`אמורה להגיע: ${orderDeliveryDaysLabel(batch.lines)}`}
        >
          <Icon name="local_shipping" size={13} />
          {deliveryShort ? `אספקה ${deliveryShort}` : "אספקה לא הוגדרה"}
        </span>
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
        {canManageOrders && (
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

  const facts = [
    { icon: "inventory_2", label: "פריטים", value: String(batch.lines.length) },
    { icon: "tag", label: "סה״כ יחידות", value: String(totalQty) },
    {
      icon: "local_shipping",
      label: "אספקה מהספק",
      value: orderDeliveryDaysShortLabel(batch.lines) ?? "לא הוגדר",
      title: orderDeliveryDaysLabel(batch.lines),
    },
    { icon: "person", label: "הוזמן על ידי", value: batchOrderedByLabel(batch) },
  ];

  return (
    <Modal open={open} onClose={onClose} title="פרטי הזמנה" subtitle={date.full} icon="local_shipping" maxWidth={540}>
      <div className="inventory-order-hero">
        {facts.map((fact) => (
          <div key={fact.label} className="inventory-order-hero-fact" title={fact.title}>
            <span className="inventory-order-hero-icon">
              <Icon name={fact.icon} size={16} />
            </span>
            <span className="min-w-0">
              <span className="inventory-order-hero-label">{fact.label}</span>
              <span className="inventory-order-hero-value">{fact.value}</span>
            </span>
          </div>
        ))}
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

function formatLogClock(iso: string) {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

/** "היום" / "אתמול" / formatted date — for the timeline day groups. */
function historyDayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startToday - startThat) / 86_400_000);
  if (diffDays === 0) return "היום";
  if (diffDays === 1) return "אתמול";
  return d.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
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
        return log.note ?? (log.new_qty != null ? `הוזמנו ${log.new_qty}${unit}` : "עדכון הזמנה");
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
        <div className="pd-timeline">
          {logs
            .reduce<{ label: string; items: ItemLog[] }[]>((groups, log) => {
              const label = historyDayLabel(log.created_at);
              const last = groups[groups.length - 1];
              if (last && last.label === label) last.items.push(log);
              else groups.push({ label, items: [log] });
              return groups;
            }, [])
            .map((group) => (
              <Fragment key={group.label}>
                <div className="pd-tl-day">
                  <span>{group.label}</span>
                </div>
                {group.items.map((log) => {
                  const meta = LOG_META[log.action];
                  const isCountFlow =
                    log.action === "count" && log.previous_qty != null && log.new_qty != null;
                  const delta = isCountFlow ? log.new_qty! - log.previous_qty! : 0;
                  return (
                    <div key={log.id} className="pd-tl-row">
                      <span
                        className="pd-tl-node"
                        style={{
                          background: `color-mix(in srgb, ${meta.color} 13%, var(--surface))`,
                          color: meta.color,
                        }}
                      >
                        <Icon name={meta.icon} size={17} />
                      </span>
                      <div className="pd-tl-body">
                        <div className="pd-tl-head">
                          <span className="pd-tl-action">{meta.label}</span>
                          <span className="pd-tl-time">{formatLogClock(log.created_at)}</span>
                        </div>
                        {isCountFlow ? (
                          <span className="pd-qty-flow">
                            <b>{log.previous_qty}</b>
                            <Icon name="west" size={14} className="text-text-3" />
                            <b className="pd-qty-new">{log.new_qty}</b>
                            {delta !== 0 && (
                              <span className={`pd-delta ${delta > 0 ? "pd-delta--up" : "pd-delta--down"}`}>
                                {delta > 0 ? `+${delta}` : delta}
                              </span>
                            )}
                          </span>
                        ) : (
                          <p className="pd-tl-detail">{detail(log)}</p>
                        )}
                        <div className="pd-tl-person">
                          <span>{(log.employee_name ?? "?").trim().charAt(0) || "?"}</span>
                          {log.employee_name ?? "לא ידוע"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            ))}
        </div>
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
  /** Managers / office / shift managers may mark orders as arrived / not arrived from the product card. */
  const canUpdateOrderArrival = !!(
    profile && ["manager", "office_manager", "shift_manager"].includes(profile.role)
  );
  const { data: orders } = useOrders(businessId, canManageOrders || canUpdateOrderArrival);
  const { data: wasteRecords } = useWaste(showWaste ? businessId : null);
  const createItem = useCreateItem(businessId);
  const updateItem = useUpdateItem(businessId);
  const setCount = useSetCount(businessId);
  const qc = useQueryClient();
  const [qtySaving, setQtySaving] = useState(false);
  const deleteOrdersBatch = useDeleteOrdersBatch(businessId);
  const receiveOrder = useReceiveOrder(businessId);
  const markOrderNotArrived = useMarkOrderNotArrived(businessId);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [wasteReportOpen, setWasteReportOpen] = useState(false);

  function resolveTab(param: string | null): InventoryTab {
    if (param === "waste" && showWaste) return "waste";
    if (param === "orders" && canManageOrders) return "orders";
    return "items";
  }

  function resolveStockFilter(param: string | null): StockFilter {
    return param === "low" ? "low" : "all";
  }

  function inventorySearchParams(nextTab: InventoryTab, nextStock: StockFilter) {
    const params: Record<string, string> = {};
    if (nextTab !== "items") params.tab = nextTab;
    if (nextStock === "low") params.stock = "low";
    return params;
  }

  const [tab, setTab] = useState<InventoryTab>(() => resolveTab(searchParams.get("tab")));
  const [modalOpen, setModalOpen] = useState(false);
  const [detailBatchId, setDetailBatchId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ItemWithQty | null>(null);
  const [historyItem, setHistoryItem] = useState<ItemWithQty | null>(null);
  const [detailItem, setDetailItem] = useState<ItemWithQty | null>(null);
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>(() => resolveStockFilter(searchParams.get("stock")));
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
  const [wasteSearchQuery, setWasteSearchQuery] = useState("");
  const [wasteFilter, setWasteFilter] = useState<WasteFilter>("all");
  const fileRef = useRef<HTMLInputElement>(null);

  const isManager = !!(profile && ["manager", "shift_manager", "office_manager"].includes(profile.role));
  const canUpdateCount = !!(profile && ["manager", "shift_manager", "office_manager", "employee"].includes(profile.role));

  function changeTab(next: InventoryTab) {
    setTab(next);
    setSearchParams(inventorySearchParams(next, stockFilter), { replace: true });
  }

  function changeStockFilter(next: StockFilter) {
    setStockFilter(next);
    setSearchParams(inventorySearchParams(tab, next), { replace: true });
  }

  useEffect(() => {
    const next = resolveTab(searchParams.get("tab"));
    if (next !== tab) setTab(next);
    const nextStock = resolveStockFilter(searchParams.get("stock"));
    if (nextStock !== stockFilter) setStockFilter(nextStock);
  }, [searchParams, showWaste, canManageOrders]);

  useEffect(() => {
    if (!canManageOrders && tab === "orders") changeTab("items");
    if (!showWaste && tab === "waste") changeTab("items");
  }, [canManageOrders, showWaste, tab]);

  const list = items ?? [];
  const detailItemLive = detailItem ? list.find((i) => i.id === detailItem.id) ?? detailItem : null;
  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return list.filter((item) => {
      if (stockFilter === "low" && !isTrackedLowStock(item)) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [list, searchQuery, stockFilter]);

  const orderList = orders ?? [];
  const detailPendingOrders = useMemo(() => {
    if (!detailItemLive) return [];
    return orderList.filter((o) => o.item_id === detailItemLive.id && o.status !== "received");
  }, [orderList, detailItemLive]);
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

  function openItemDetail(item: ItemWithQty) {
    setDetailItem(item);
  }

  function closeItemDetail() {
    setDetailItem(null);
  }

  function handleSetQty(item: ItemWithQty, quantity: number) {
    setQtySaving(true);
    setCount.mutate(
      {
        business_id: businessId!,
        item_id: item.id,
        employee_id: profile?.id ?? null,
        quantity,
        previous_qty: item.current_qty,
      },
      {
        // Keep the overlay up until the fresh quantities are actually on screen.
        onSettled: () => {
          qc.invalidateQueries({ queryKey: ["inventory", businessId] })
            .finally(() => setQtySaving(false));
        },
      }
    );
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

  /** Order composing moved to a dedicated page — /inventory/order. */
  function openNewOrder(presetItemId?: string) {
    navigate(presetItemId ? `/inventory/order?item=${presetItemId}` : "/inventory/order");
  }

  function openEditOrder(batch: OrderBatch) {
    navigate(`/inventory/order?batch=${encodeURIComponent(batch.batch_id ?? batch.id)}`);
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

  async function handleReceive(line: OrderLine | InventoryOrderWithUser) {
    if (!canManageOrders && !canUpdateOrderArrival) return;
    const item = list.find((i) => i.id === line.item_id);
    if (!item) return;
    try {
      await receiveOrder.mutateAsync({
        order_id: line.id,
        business_id: businessId!,
        item_id: line.item_id,
        quantity: Number(line.quantity),
        current_qty: item.current_qty,
        employee_id: profile?.id ?? null,
      });
    } catch (e) {
      window.alert(inventorySaveError(e));
    }
  }

  async function handleMarkNotArrived(order: InventoryOrderWithUser) {
    if (!canManageOrders && !canUpdateOrderArrival) return;
    const ok = window.confirm("לסמן שההזמנה לא הגיעה? הכמות תוסר מרשימת «בהזמנה» ולא תתווסף למלאי.");
    if (!ok) return;
    try {
      await markOrderNotArrived.mutateAsync({
        order_id: order.id,
        business_id: businessId!,
        item_id: order.item_id,
        quantity: Number(order.quantity),
        employee_id: profile?.id ?? null,
      });
    } catch (e) {
      window.alert(inventorySaveError(e));
    }
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
              filter={stockFilter}
              onFilterChange={changeStockFilter}
              filters={STOCK_FILTERS}
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
                title={stockFilter === "low" ? "אין מוצרים במלאי נמוך" : "לא נמצאו מוצרים"}
                description={
                  stockFilter === "low"
                    ? "כל המוצרים מעל סף המלאי שהוגדר."
                    : "נסו מילת חיפוש אחרת."
                }
                action={
                  stockFilter === "low" ? (
                    <Button variant="secondary" onClick={() => changeStockFilter("all")}>
                      הצג את כל המוצרים
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => setSearchQuery("")}>
                      ניקוי חיפוש
                    </Button>
                  )
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
                    canUpdateCount={canUpdateCount}
                    canManageOrders={canManageOrders}
                    onOpen={() => openItemDetail(it)}
                    onEdit={() => {
                      closeItemDetail();
                      openEdit(it);
                    }}
                    onHistory={() => {
                      closeItemDetail();
                      setHistoryItem(it);
                    }}
                    onOrder={() => {
                      closeItemDetail();
                      openNewOrder(it.id);
                    }}
                    onSetQty={(quantity) => handleSetQty(it, quantity)}
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

      <ItemDetailModal
        item={detailItemLive}
        open={!!detailItemLive}
        canUpdateCount={canUpdateCount}
        isManager={isManager}
        canManageOrders={canManageOrders}
        canUpdateOrderArrival={canUpdateOrderArrival}
        pendingOrders={detailPendingOrders}
        orderArrivalBusy={receiveOrder.isPending || markOrderNotArrived.isPending}
        onClose={closeItemDetail}
        onSetQty={(quantity) => detailItemLive && handleSetQty(detailItemLive, quantity)}
        onEdit={() => {
          if (!detailItemLive) return;
          closeItemDetail();
          openEdit(detailItemLive);
        }}
        onHistory={() => {
          if (!detailItemLive) return;
          closeItemDetail();
          setHistoryItem(detailItemLive);
        }}
        onOrder={() => {
          if (!detailItemLive) return;
          closeItemDetail();
          openNewOrder(detailItemLive.id);
        }}
        onMarkArrived={handleReceive}
        onMarkNotArrived={handleMarkNotArrived}
      />

      <HistoryModal businessId={businessId} item={historyItem} onClose={() => setHistoryItem(null)} />

      <OrderDetailsModal
        batch={detailBatch}
        open={!!detailBatch}
        onClose={() => setDetailBatchId(null)}
        onReceive={handleReceive}
      />

      <LoadingOverlay show={qtySaving} label="מעדכן מלאי..." />
    </div>
  );
}
