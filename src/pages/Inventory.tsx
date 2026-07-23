import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Badge, Button, EmptyState, Field, Icon, Input, ErrorState, InlineLoader, LoadingOverlay, PageLoader, SectionLoader, Select, MultiSelect } from "@/components/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { WastePanel } from "@/components/waste/WastePanel";
import { DualUnitQtyInput } from "@/components/inventory/DualUnitQtyInput";
import { InventoryQtyUpdatePanel } from "@/components/inventory/InventoryQtyUpdatePanel";
import { formatOrderReceivedLabel, OrderReceiveControls } from "@/components/inventory/OrderReceiveControls";
import { useAuth } from "@/lib/auth";
import { useBusinessId, HE_DAYS, formatCurrency } from "@/lib/db";
import { canSeeInventoryPrices } from "@/lib/constants";
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
  inventorySaveError,
  supportsPieceInput,
  mainUnitToPieces,
  splitPackageQty,
  type ItemWithQty,
  type ItemLog,
  isTrackedLowStock,
  inventoryLineTotal,
  orderLineBillableQty,
  orderBatchTotal,
  batchHasActivePartialDelivery,
} from "@/api/inventory";
import { usePartialDeliveryOrderCount, type PartialBatchUiState } from "@/hooks/usePartialDeliveryOrderCount";
import { useDepartments } from "@/api/departments";
import {
  useInventoryCategories,
  inventoryCategoryById,
} from "@/api/inventoryCategories";
import { useSuppliers, useSupplierItemPriceIndex, supplierPricesFor, type SupplierItemPriceIndex } from "@/api/suppliers";
import { useWaste } from "@/api/waste";
import type { Department, InventoryAction, InventoryCategory, InventoryWaste } from "@/types/database";

type InventoryTab = "items" | "orders" | "waste";

type OrderLine = InventoryOrderWithUser & { item?: ItemWithQty };

type OrderBatch = {
  id: string;
  batch_id: string | null;
  created_at: string;
  ordered_by: string | null;
  ordered_by_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  lines: OrderLine[];
};

function groupOrderBatches(orders: InventoryOrderWithUser[], items: ItemWithQty[]): OrderBatch[] {
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

function batchHasPendingLines(batch: OrderBatch): boolean {
  return batch.lines.some((l) => l.status !== "received");
}

function batchIsFullyReceived(batch: OrderBatch): boolean {
  return batch.lines.length > 0 && batch.lines.every((l) => l.status === "received");
}

function batchReceivedUnits(batch: OrderBatch): number {
  return batch.lines.reduce(
    (sum, l) => sum + Number(l.status === "received" ? (l.received_quantity ?? l.quantity) : 0),
    0,
  );
}

function batchOrderedByLabel(batch: OrderBatch): string {
  return batch.ordered_by_name ?? "לא ידוע";
}

type ItemForm = {
  name: string;
  categoryId: string;
  unit: string;
  unitsPerPackage: string;
  qty: string;
  minQty: string;
  deliveryDay: string;
  departmentIds: string[];
  imageUrl: string | null;
  file: File | null;
};

const EMPTY_FORM: ItemForm = {
  name: "",
  categoryId: "",
  unit: "יחידות",
  unitsPerPackage: "",
  qty: "0",
  minQty: "0",
  deliveryDay: "",
  departmentIds: [],
  imageUrl: null,
  file: null,
};

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
  extraFilterActive,
  filterTrigger,
  filterTokens,
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
  extraFilterActive?: boolean;
  filterTrigger?: ReactNode;
  filterTokens?: ReactNode;
}) {
  const hasFilter =
    query.trim() ||
    extraFilterActive ||
    (filters.length > 0 && filter !== filters[0]?.key);

  return (
    <div className="inventory-search mb-4 space-y-2.5">
      <div className="inv-searchrow">
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
        {filterTrigger}
        {showAdd && onAdd && (
          <Button
            icon={addIcon}
            onClick={onAdd}
            disabled={addDisabled}
            aria-label={addAriaLabel}
            className="!h-11 shrink-0 whitespace-nowrap !bg-ink shadow-sm hover:brightness-110 active:scale-[0.97]"
          >
            {addAriaLabel}
          </Button>
        )}
      </div>

      {filterTokens}

      {filters.length > 0 && (
        <div className="inventory-search-filters flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filters.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              data-active={filter === key}
              onClick={() => onFilterChange(key)}
              className="inv-chip"
            >
              <span>{label}</span>
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

const DEPT_FILTER_GENERAL = "__general__" as const;
const CAT_FILTER_NONE = "__none__" as const;
const FILTER_ALL_KEY = "__all__" as const;

type CategoryFilterValue = string | null;
type DepartmentFilterValue = string | null;

/** How many products each chip would yield, given the other rows' filters. */
type CatalogFilterCounts = {
  stock: Record<string, number>;
  category: Record<string, number>;
  department: Record<string, number>;
};

function FilterChip({
  label,
  active,
  onClick,
  icon,
  dot,
  accent,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: string;
  dot?: "solid" | "hollow";
  accent?: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      data-active={active}
      data-empty={count === 0 && !active}
      onClick={onClick}
      className={accent ? "inv-chip inv-chip--accent" : "inv-chip"}
      style={accent ? ({ ["--chip-accent"]: accent } as CSSProperties) : undefined}
    >
      {dot && <span className="inv-chip-dot" data-hollow={dot === "hollow"} />}
      {icon && <Icon name={icon} size={15} className="inv-chip-icon" />}
      <span>{label}</span>
      {count !== undefined && <span className="inv-chip-count">{count}</span>}
    </button>
  );
}

function InventoryCatalogFilterDeck({
  stockFilter,
  onStockChange,
  categoryFilter,
  onCategoryChange,
  departmentFilter,
  onDepartmentChange,
  departments,
  inventoryCategories,
  onClearAll,
  showClear,
  showGeneralDeptFilter,
  counts,
}: {
  stockFilter: StockFilter;
  onStockChange: (f: StockFilter) => void;
  categoryFilter: CategoryFilterValue;
  onCategoryChange: (f: CategoryFilterValue) => void;
  departmentFilter: DepartmentFilterValue;
  onDepartmentChange: (f: DepartmentFilterValue) => void;
  departments: Department[];
  inventoryCategories: InventoryCategory[];
  onClearAll: () => void;
  showClear: boolean;
  showGeneralDeptFilter: boolean;
  counts: CatalogFilterCounts;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Popover manners: click outside or Escape closes it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const activeCount =
    (stockFilter !== "all" ? 1 : 0) + (categoryFilter ? 1 : 0) + (departmentFilter ? 1 : 0);

  return (
    <div className="inv-filters-anchor">
      <button
        ref={btnRef}
        type="button"
        className="inv-filters-btn"
        data-open={open}
        data-filtered={activeCount > 0}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="inventory-filter-panel"
        aria-label="סינון מוצרים"
      >
        <Icon name="tune" size={19} />
        <span className="inv-filters-btn-label">סינון</span>
        {activeCount > 0 && <span className="inv-filters-badge">{activeCount}</span>}
      </button>

      <div
        ref={popRef}
        id="inventory-filter-panel"
        className="inv-filters-pop"
        data-open={open}
        role="group"
        aria-label="סינון מוצרים"
      >
        <div className="inv-filters-pop-head">
          <span className="inv-filters-pop-title">
            <Icon name="tune" size={15} />
            סינון מוצרים
          </span>
          {showClear && (
            <button type="button" className="inv-filters-clear" onClick={onClearAll}>
              <Icon name="filter_alt_off" size={15} />
              ניקוי
            </button>
          )}
        </div>

        <div className="inv-filters-pop-body">
          <FilterRow label="מלאי">
            {STOCK_FILTERS.map(({ key, label }) => (
              <FilterChip
                key={key}
                label={label}
                icon={key === "low" ? "warning" : undefined}
                active={stockFilter === key}
                count={counts.stock[key]}
                onClick={() => onStockChange(key)}
              />
            ))}
          </FilterRow>

          <FilterRow label="קטגוריה">
            <FilterChip
              label="הכל"
              active={categoryFilter === null}
              count={counts.category[FILTER_ALL_KEY]}
              onClick={() => onCategoryChange(null)}
            />
            <FilterChip
              label="ללא"
              icon="label_off"
              active={categoryFilter === CAT_FILTER_NONE}
              count={counts.category[CAT_FILTER_NONE]}
              onClick={() => onCategoryChange(categoryFilter === CAT_FILTER_NONE ? null : CAT_FILTER_NONE)}
            />
            {inventoryCategories.map((c) => (
              <FilterChip
                key={c.id}
                label={c.name}
                icon="category"
                accent={c.color ?? undefined}
                active={categoryFilter === c.id}
                count={counts.category[c.id]}
                onClick={() => onCategoryChange(categoryFilter === c.id ? null : c.id)}
              />
            ))}
          </FilterRow>

          {departments.length > 0 || showGeneralDeptFilter ? (
            <FilterRow label="מחלקה">
              <FilterChip
                label="הכל"
                active={departmentFilter === null}
                count={counts.department[FILTER_ALL_KEY]}
                onClick={() => onDepartmentChange(null)}
              />
              {showGeneralDeptFilter && (
                <FilterChip
                  label="כללי"
                  dot="hollow"
                  active={departmentFilter === DEPT_FILTER_GENERAL}
                  count={counts.department[DEPT_FILTER_GENERAL]}
                  onClick={() =>
                    onDepartmentChange(departmentFilter === DEPT_FILTER_GENERAL ? null : DEPT_FILTER_GENERAL)
                  }
                />
              )}
              {departments.map((d) => (
                <FilterChip
                  key={d.id}
                  label={d.name}
                  dot="solid"
                  accent={d.color ?? undefined}
                  active={departmentFilter === d.id}
                  count={counts.department[d.id]}
                  onClick={() => onDepartmentChange(departmentFilter === d.id ? null : d.id)}
                />
              ))}
            </FilterRow>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="inv-filter-row">
      <span className="inv-filter-row-label">{label}</span>
      <div className="inv-filter-track">{children}</div>
    </div>
  );
}

/** Active filters as removable pills, so the closed popover still says what is on. */
function InventoryFilterTokens({
  stockFilter,
  onStockChange,
  categoryFilter,
  onCategoryChange,
  departmentFilter,
  onDepartmentChange,
  departments,
  inventoryCategories,
}: {
  stockFilter: StockFilter;
  onStockChange: (f: StockFilter) => void;
  categoryFilter: CategoryFilterValue;
  onCategoryChange: (f: CategoryFilterValue) => void;
  departmentFilter: DepartmentFilterValue;
  onDepartmentChange: (f: DepartmentFilterValue) => void;
  departments: Department[];
  inventoryCategories: InventoryCategory[];
}) {
  const activeDept = departmentFilter ? departments.find((d) => d.id === departmentFilter) : undefined;
  const tokens: { key: string; label: string; accent?: string; onRemove: () => void }[] = [];

  if (stockFilter !== "all") {
    tokens.push({
      key: "stock",
      label: "מלאי נמוך",
      accent: "var(--warning)",
      onRemove: () => onStockChange("all"),
    });
  }
  if (categoryFilter) {
    const cat = inventoryCategoryById(inventoryCategories, categoryFilter);
    tokens.push({
      key: "category",
      label: categoryFilter === CAT_FILTER_NONE ? "ללא קטגוריה" : cat?.name ?? "קטגוריה",
      accent: cat?.color ?? undefined,
      onRemove: () => onCategoryChange(null),
    });
  }
  if (departmentFilter) {
    tokens.push({
      key: "department",
      label: departmentFilter === DEPT_FILTER_GENERAL ? "כללי" : activeDept?.name ?? "מחלקה",
      accent: activeDept?.color ?? undefined,
      onRemove: () => onDepartmentChange(null),
    });
  }

  if (tokens.length === 0) return null;

  return (
    <div className="inv-filters-tokens">
      {tokens.map((t, i) => (
        <button
          key={t.key}
          type="button"
          className="inv-filters-token"
          onClick={t.onRemove}
          aria-label={`הסרת הסינון ${t.label}`}
          style={
            {
              ["--chip-accent"]: t.accent ?? "var(--text-3)",
              animationDelay: `${i * 45}ms`,
            } as CSSProperties
          }
        >
          <span className="inv-chip-dot" />
          {t.label}
          <Icon name="close" size={14} className="inv-filters-token-x" />
        </button>
      ))}
    </div>
  );
}

function matchesCatalogFilters(
  item: ItemWithQty,
  stockFilter: StockFilter,
  categoryFilter: CategoryFilterValue,
  departmentFilter: DepartmentFilterValue,
): boolean {
  if (stockFilter === "low" && !isTrackedLowStock(item)) return false;
  if (categoryFilter === CAT_FILTER_NONE) {
    if (item.category_id) return false;
  } else if (categoryFilter && item.category_id !== categoryFilter) {
    return false;
  }
  if (departmentFilter === DEPT_FILTER_GENERAL) {
    if (item.department_ids.length > 0) return false;
  } else if (departmentFilter && !item.department_ids.includes(departmentFilter)) {
    return false;
  }
  return true;
}

type OrderFilter = "open" | "closed" | "partial";
type WasteFilter = "all" | "deducted" | "not_deducted";
type StockFilter = "all" | "low";

const ORDER_FILTERS: { key: OrderFilter; label: string }[] = [
  { key: "open", label: "פתוחות" },
  { key: "closed", label: "סגורות" },
  { key: "partial", label: "חלקיות" },
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

function batchMatchesOrderStatusFilter(batch: OrderBatch, filter: OrderFilter): boolean {
  if (filter === "open") return batchHasPendingLines(batch);
  if (filter === "closed") return batchIsFullyReceived(batch);
  return batchHasActivePartialDelivery(batch.lines);
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

function filterOrderBatches(
  batches: OrderBatch[],
  query: string,
  filter: OrderFilter,
  supplierId: string | null,
): OrderBatch[] {
  const q = query.trim().toLowerCase();
  return batches.filter((batch) => {
    if (!batchMatchesOrderStatusFilter(batch, filter)) return false;
    if (supplierId === "__none__" && batch.supplier_id) return false;
    if (supplierId && supplierId !== "__none__" && batch.supplier_id !== supplierId) return false;
    if (q) {
      const haystack = [
        orderPreviewLabel(batch.lines),
        batchOrderedByLabel(batch),
        batch.supplier_name ?? "",
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
  qtyUpdateBusy,
  onClose,
  onSetQty,
  onEdit,
  onHistory,
  onOrder,
  onMarkArrived,
  onMarkNotArrived,
  categoryNames,
}: {
  item: ItemWithQty | null;
  open: boolean;
  canUpdateCount: boolean;
  isManager: boolean;
  canManageOrders: boolean;
  canUpdateOrderArrival: boolean;
  pendingOrders: InventoryOrderWithUser[];
  orderArrivalBusy: boolean;
  qtyUpdateBusy?: boolean;
  onClose: () => void;
  onSetQty: (qty: number) => void;
  onEdit: () => void;
  onHistory: () => void;
  onOrder: () => void;
  onMarkArrived: (order: InventoryOrderWithUser, receivedQty: number) => void;
  onMarkNotArrived: (order: InventoryOrderWithUser) => void;
  categoryNames: Record<string, string>;
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

  const categoryLabel = item.category_id ? categoryNames[item.category_id] ?? null : null;

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
              סמנו כמה הגיע בפועל — יתווסף למלאי. אם הגיע פחות מהוזמן, השאר יישאר בהזמנה.
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
                  <OrderReceiveControls
                    orderedQty={Number(order.quantity)}
                    unit={item.unit}
                    unitsPerPackage={item.units_per_package}
                    busy={orderArrivalBusy}
                    compact
                    onConfirmArrived={(receivedQty) => onMarkArrived(order, receivedQty)}
                    onNotArrived={() => onMarkNotArrived(order)}
                  />
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

        <div className="pd-qty-card relative">
          <SectionLoader show={!!qtyUpdateBusy} label="מעדכן מלאי..." />
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
                      loading={!!qtyUpdateBusy}
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
            <InlineLoader compact label="טוען היסטוריה..." />
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
  categoryNames,
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
  categoryNames: Record<string, string>;
}) {
  const status = stockStatus(item);
  const meta = STOCK_META[status];
  const categoryLabel = item.category_id ? categoryNames[item.category_id] ?? null : null;
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
                {categoryLabel && (
                  <span className="text-[10px] font-semibold text-text-3">{categoryLabel}</span>
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
              {categoryLabel && (
                <span className="mt-0.5 block text-[11px] font-semibold text-text-3">{categoryLabel}</span>
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
  busy,
  canSeePrices,
  supplierPrices,
  onReceive,
  onNotArrived,
}: {
  line: OrderLine;
  index: number;
  busy?: boolean;
  canSeePrices?: boolean;
  supplierPrices?: Map<string, number> | null;
  onReceive: (receivedQty: number) => void;
  onNotArrived: () => void;
}) {
  const item = line.item;
  const pending = line.status !== "received";
  const pieces =
    item && supportsPieceInput(item.unit) && item.units_per_package
      ? mainUnitToPieces(Number(line.quantity), item.units_per_package)
      : null;
  const deliveryDay = item?.supplier_delivery_day;
  const receivedLabel = formatOrderReceivedLabel(line);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const lineTotal =
    canSeePrices && item
      ? inventoryLineTotal(item, orderLineBillableQty(line), supplierPrices?.get(line.item_id))
      : null;

  useEffect(() => {
    if (!pending) setReceiveOpen(false);
  }, [pending]);

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
      <div className="inventory-order-detail-info min-w-0 flex-1">
        <div className="inventory-order-detail-name">{item?.name ?? "פריט"}</div>
        <div className="inventory-order-detail-sub">
          <b>
            {pending ? line.quantity : receivedLabel ?? line.quantity}
            {item?.unit ? ` ${item.unit}` : ""}
          </b>
          {!pending && line.received_quantity != null && line.received_quantity < line.quantity && (
            <span> · הוזמן {line.quantity}</span>
          )}
          {pieces != null && <span>({pieces} יח׳)</span>}
          {deliveryDay != null && deliveryDay >= 0 && deliveryDay <= 6 && (
            <span>· אספקה {HE_DAYS_SHORT[deliveryDay]}</span>
          )}
          {lineTotal != null && lineTotal > 0 && (
            <span>· {formatCurrency(lineTotal)}</span>
          )}
        </div>
        {pending && receiveOpen && (
          <div className="mt-3 rounded-[14px] border border-border bg-surface p-3">
            <OrderReceiveControls
              orderedQty={Number(line.quantity)}
              unit={item?.unit ?? null}
              unitsPerPackage={item?.units_per_package ?? null}
              busy={busy}
              compact
              onConfirmArrived={(qty) => {
                onReceive(qty);
                setReceiveOpen(false);
              }}
              onNotArrived={() => {
                onNotArrived();
                setReceiveOpen(false);
              }}
            />
          </div>
        )}
      </div>
      {pending ? (
        receiveOpen ? (
          <button
            type="button"
            className="inventory-order-receive-btn shrink-0 opacity-70"
            onClick={() => setReceiveOpen(false)}
          >
            <Icon name="close" size={16} />
          </button>
        ) : (
          <button type="button" className="inventory-order-receive-btn shrink-0" onClick={() => setReceiveOpen(true)}>
            <Icon name="check_circle" size={16} />
            התקבל
          </button>
        )
      ) : (
        <Badge tone="success">
          {line.received_quantity != null && line.received_quantity < line.quantity
            ? `התקבל ${receivedLabel}`
            : "במלאי"}
        </Badge>
      )}
    </div>
  );
}

function OrderBatchRow({
  batch,
  index,
  canManageOrders,
  canSeePrices,
  supplierPriceIndex,
  received,
  onDetails,
  onEdit,
  onDelete,
  partialUiState = "none",
}: {
  batch: OrderBatch;
  index: number;
  canManageOrders: boolean;
  canSeePrices: boolean;
  supplierPriceIndex?: SupplierItemPriceIndex;
  received?: boolean;
  onDetails: () => void;
  onEdit: () => void;
  onDelete: () => void;
  partialUiState?: PartialBatchUiState;
}) {
  const pendingQty = batch.lines
    .filter((l) => l.status !== "received")
    .reduce((sum, l) => sum + Number(l.quantity), 0);
  const totalQty = received
    ? batchReceivedUnits(batch)
    : batch.lines.reduce((sum, l) => sum + Number(l.quantity), 0);
  const date = formatOrderDate(batch.created_at);
  const deliveryShort = orderDeliveryDaysShortLabel(batch.lines);
  const supplierPrices = supplierPricesFor(supplierPriceIndex, batch.supplier_id);
  const batchTotal = canSeePrices ? orderBatchTotal(batch.lines, supplierPrices) : 0;
  const showBatchTotal = canSeePrices && batchTotal > 0;
  const statusLabel = received ? "התקבל" : partialUiState === "handled" ? "טופל" : "בהזמנה";
  const statusModifier = received
    ? " inventory-order-status--received"
    : partialUiState === "handled"
      ? " inventory-order-status--handled"
      : "";

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
            <span className={`inventory-order-status${statusModifier}`}>
              <span className="inventory-order-status-dot" aria-hidden />
              {statusLabel}
            </span>
            {partialUiState === "needs_attention" ? (
              <span className="inventory-order-partial-chip" title="הגיעה כמות חלקית — נדרשת התייחסות">
                <Icon name="priority_high" size={12} />
                לא במלואה
              </span>
            ) : null}
          </div>
          <p className="inventory-order-sub">
            <b>{batch.lines.length}</b> פריטים · <b>{totalQty}</b> יח׳
            {received ? " התקבלו" : pendingQty < totalQty ? ` · ${pendingQty} ממתין` : ""} · הוזמן{" "}
            {date.time} · {batchOrderedByLabel(batch)}
            {batch.supplier_name ? ` · ${batch.supplier_name}` : ""}
            {showBatchTotal ? ` · ${formatCurrency(batchTotal)}` : ""}
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
        {canManageOrders && !received && (
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

function OrderBatchListSection({
  title,
  icon,
  batches,
  canManageOrders,
  canSeePrices,
  supplierPriceIndex,
  received,
  onDetails,
  onEdit,
  onDelete,
  getBatchPartialUiState,
}: {
  title: string;
  icon: string;
  batches: OrderBatch[];
  canManageOrders: boolean;
  canSeePrices: boolean;
  supplierPriceIndex?: SupplierItemPriceIndex;
  received?: boolean;
  onDetails: (batch: OrderBatch) => void;
  onEdit: (batch: OrderBatch) => void;
  onDelete: (batch: OrderBatch) => void;
  getBatchPartialUiState?: (batch: OrderBatch) => PartialBatchUiState;
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
          <OrderBatchRow
            key={batch.id}
            batch={batch}
            index={idx}
            canManageOrders={canManageOrders}
            canSeePrices={canSeePrices}
            supplierPriceIndex={supplierPriceIndex}
            received={received}
            onDetails={() => onDetails(batch)}
            onEdit={() => onEdit(batch)}
            onDelete={() => onDelete(batch)}
            partialUiState={getBatchPartialUiState?.(batch) ?? "none"}
          />
        ))}
      </div>
    </div>
  );
}

function OrderDetailsModal({
  batch,
  open,
  receiveBusy,
  canSeePrices,
  supplierPriceIndex,
  onClose,
  onReceive,
  onNotArrived,
  partialUiState = "none",
  onAcknowledgePartial,
}: {
  batch: OrderBatch | null;
  open: boolean;
  receiveBusy?: boolean;
  canSeePrices: boolean;
  supplierPriceIndex?: SupplierItemPriceIndex;
  onClose: () => void;
  onReceive: (line: OrderLine, receivedQty: number) => void;
  onNotArrived: (line: OrderLine) => void;
  partialUiState?: PartialBatchUiState;
  onAcknowledgePartial?: () => void;
}) {
  if (!batch) return null;

  const date = formatOrderDate(batch.created_at);
  const totalQty = batch.lines.reduce((sum, l) => sum + Number(l.quantity), 0);
  const pendingCount = batch.lines.filter((l) => l.status !== "received").length;
  const supplierPrices = supplierPricesFor(supplierPriceIndex, batch.supplier_id);
  const batchTotal = canSeePrices ? orderBatchTotal(batch.lines, supplierPrices) : 0;

  const facts = [
    { icon: "inventory_2", label: "פריטים", value: String(batch.lines.length) },
    { icon: "tag", label: "סה״כ יחידות", value: String(totalQty) },
    ...(canSeePrices && batchTotal > 0
      ? [{ icon: "payments", label: "סה״כ הזמנה", value: formatCurrency(batchTotal) }]
      : []),
    {
      icon: "store",
      label: "ספק",
      value: batch.supplier_name ?? "לא נבחר",
    },
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
      {partialUiState === "needs_attention" && batchHasActivePartialDelivery(batch.lines) ? (
        <div className="inventory-order-partial-banner">
          <div className="inventory-order-partial-banner-text">
            <Icon name="local_shipping" size={18} style={{ color: "var(--warning)", flexShrink: 0 }} />
            <span>
              חלק מהפריטים סומנו כ«הגיע חלקית». יתרת ההזמנה עדיין פתוחה — סמנו כטופל כדי להסיר את הסימון
              מהתפריט.
            </span>
          </div>
          <Button
            variant="secondary"
            icon="done_all"
            onClick={onAcknowledgePartial}
            className="shrink-0 !py-2 !px-3 !text-[12px]"
          >
            סמן כטופל
          </Button>
        </div>
      ) : null}
      {partialUiState === "handled" && batchHasActivePartialDelivery(batch.lines) ? (
        <div className="inventory-order-partial-banner inventory-order-partial-banner--handled">
          <div className="inventory-order-partial-banner-text">
            <Icon name="check_circle" size={18} style={{ color: "var(--success)", flexShrink: 0 }} />
            <span>ההזמנה סומנה כ<strong>טופל</strong>. היתרה עדיין פתוחה במלאי עד קבלה מלאה.</span>
          </div>
        </div>
      ) : null}
      {pendingCount > 0 && (
        <p className="mb-3 text-[12px] font-medium text-text-3">
          {pendingCount} פריטים ממתינים לקבלה במלאי
        </p>
      )}
      <div className="flex flex-col">
        {batch.lines.map((line, idx) => (
          <OrderDetailLine
            key={line.id}
            line={line}
            index={idx}
            busy={receiveBusy}
            canSeePrices={canSeePrices}
            supplierPrices={supplierPrices}
            onReceive={(receivedQty) => onReceive(line, receivedQty)}
            onNotArrived={() => onNotArrived(line)}
          />
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
        <InlineLoader label="טוען היסטוריה..." />
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
  const { data: departments } = useDepartments(businessId);
  const { data: inventoryCategories } = useInventoryCategories(businessId);
  const categoryNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of inventoryCategories ?? []) m[c.id] = c.name;
    return m;
  }, [inventoryCategories]);
  const departmentOptions = useMemo(
    () => (departments ?? []).map((d) => ({ value: d.id, label: d.name })),
    [departments],
  );
  const canManageOrders = !!(profile && ["manager", "office_manager"].includes(profile.role));
  const { getPartialBatchUiState, acknowledgeBatch } = usePartialDeliveryOrderCount();
  const resolveBatchPartialUiState = useCallback(
    (batch: OrderBatch) => getPartialBatchUiState(batch.id, batch.lines),
    [getPartialBatchUiState],
  );
  /** Managers / office / shift managers may mark orders as arrived / not arrived from the product card. */
  const canUpdateOrderArrival = !!(
    profile && ["manager", "office_manager", "shift_manager"].includes(profile.role)
  );
  const { data: orders } = useOrders(businessId, canManageOrders || canUpdateOrderArrival);
  const { data: supplierList } = useSuppliers(businessId, { activeOnly: false });
  const { data: supplierPriceIndex } = useSupplierItemPriceIndex(businessId);
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
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterValue>(null);
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilterValue>(null);
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("open");
  const [orderSupplierFilter, setOrderSupplierFilter] = useState<string | null>(
    () => searchParams.get("supplier") || null,
  );
  const [wasteSearchQuery, setWasteSearchQuery] = useState("");
  const [wasteFilter, setWasteFilter] = useState<WasteFilter>("all");
  const fileRef = useRef<HTMLInputElement>(null);

  const isManager = !!(profile && ["manager", "shift_manager", "office_manager"].includes(profile.role));
  const canSeePrices = canSeeInventoryPrices(profile?.role);
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
    const urlSupplier = searchParams.get("supplier");
    const nextSupplier = urlSupplier || null;
    if (nextSupplier !== orderSupplierFilter) setOrderSupplierFilter(nextSupplier);
  }, [searchParams, showWaste, canManageOrders]);

  useEffect(() => {
    if (tab !== "orders") return;
    const params: Record<string, string> = { tab: "orders" };
    if (orderSupplierFilter) params.supplier = orderSupplierFilter;
    setSearchParams(params, { replace: true });
  }, [orderSupplierFilter, tab]);

  useEffect(() => {
    if (!canManageOrders && tab === "orders") changeTab("items");
    if (!showWaste && tab === "waste") changeTab("items");
  }, [canManageOrders, showWaste, tab]);

  const list = items ?? [];
  const departmentsForFilter = useMemo(() => {
    const all = departments ?? [];
    if (isManager) return all;
    const linked = new Set<string>();
    for (const item of list) {
      item.department_ids.forEach((id) => linked.add(id));
    }
    if (linked.size === 0) {
      const mine = profile?.department_id;
      return mine ? all.filter((d) => d.id === mine) : [];
    }
    return all.filter((d) => linked.has(d.id));
  }, [departments, list, isManager, profile?.department_id]);

  const showGeneralDeptFilter = useMemo(
    () => isManager || list.some((item) => item.department_ids.length === 0),
    [isManager, list],
  );

  const detailItemLive = detailItem ? list.find((i) => i.id === detailItem.id) ?? detailItem : null;
  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return list.filter((item) => {
      if (!matchesCatalogFilters(item, stockFilter, categoryFilter, departmentFilter)) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [list, searchQuery, stockFilter, categoryFilter, departmentFilter]);

  /** Live per-chip result counts: each row counts against the *other* rows' filters. */
  const catalogFilterCounts = useMemo<CatalogFilterCounts>(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = q ? list.filter((i) => i.name.toLowerCase().includes(q)) : list;
    const byStock = (i: ItemWithQty, f: StockFilter) => f !== "low" || isTrackedLowStock(i);
    const byCat = (i: ItemWithQty, f: CategoryFilterValue) =>
      f === null || (f === CAT_FILTER_NONE ? !i.category_id : i.category_id === f);
    const byDept = (i: ItemWithQty, f: DepartmentFilterValue) =>
      f === null || (f === DEPT_FILTER_GENERAL ? i.department_ids.length === 0 : i.department_ids.includes(f));

    const stock: Record<string, number> = {};
    for (const { key } of STOCK_FILTERS) {
      stock[key] = base.filter(
        (i) => byStock(i, key) && byCat(i, categoryFilter) && byDept(i, departmentFilter),
      ).length;
    }

    const catPool = base.filter((i) => byStock(i, stockFilter) && byDept(i, departmentFilter));
    const category: Record<string, number> = {
      [FILTER_ALL_KEY]: catPool.length,
      [CAT_FILTER_NONE]: catPool.filter((i) => !i.category_id).length,
    };
    for (const c of inventoryCategories ?? []) {
      category[c.id] = catPool.filter((i) => i.category_id === c.id).length;
    }

    const deptPool = base.filter((i) => byStock(i, stockFilter) && byCat(i, categoryFilter));
    const department: Record<string, number> = {
      [FILTER_ALL_KEY]: deptPool.length,
      [DEPT_FILTER_GENERAL]: deptPool.filter((i) => i.department_ids.length === 0).length,
    };
    for (const d of departmentsForFilter) {
      department[d.id] = deptPool.filter((i) => i.department_ids.includes(d.id)).length;
    }

    return { stock, category, department };
  }, [list, searchQuery, stockFilter, categoryFilter, departmentFilter, departmentsForFilter, inventoryCategories]);

  const catalogFiltersActive =
    stockFilter !== "all" || categoryFilter !== null || departmentFilter !== null;

  function clearCatalogFilters() {
    setSearchQuery("");
    changeStockFilter("all");
    setCategoryFilter(null);
    setDepartmentFilter(null);
  }

  const orderList = orders ?? [];
  const detailPendingOrders = useMemo(() => {
    if (!detailItemLive) return [];
    return orderList.filter((o) => o.item_id === detailItemLive.id && o.status !== "received");
  }, [orderList, detailItemLive]);
  const allOrderBatches = useMemo(() => groupOrderBatches(orderList, list), [orderList, list]);
  const openBatches = useMemo(() => allOrderBatches.filter(batchHasPendingLines), [allOrderBatches]);
  const receivedBatches = useMemo(() => allOrderBatches.filter(batchIsFullyReceived), [allOrderBatches]);
  const partialBatches = useMemo(
    () => allOrderBatches.filter((b) => batchHasActivePartialDelivery(b.lines)),
    [allOrderBatches],
  );
  const filteredOrderBatches = useMemo(
    () => filterOrderBatches(allOrderBatches, orderSearchQuery, orderFilter, orderSupplierFilter),
    [allOrderBatches, orderSearchQuery, orderFilter, orderSupplierFilter],
  );
  const orderListSectionMeta = useMemo(() => {
    if (orderFilter === "closed") {
      return { title: "הזמנות סגורות", icon: "check_circle", received: true as const };
    }
    if (orderFilter === "partial") {
      return { title: "הזמנות חלקיות", icon: "priority_high", received: false as const };
    }
    return { title: "הזמנות פתוחות", icon: "local_shipping", received: false as const };
  }, [orderFilter]);
  const detailBatch = detailBatchId
    ? allOrderBatches.find((b) => b.id === detailBatchId) ?? null
    : null;
  const visibleOrderResultCount = filteredOrderBatches.length;
  const visibleOrderTotalCount = useMemo(() => {
    if (orderFilter === "open") return openBatches.length;
    if (orderFilter === "closed") return receivedBatches.length;
    return partialBatches.length;
  }, [orderFilter, openBatches.length, receivedBatches.length, partialBatches.length]);
  const pending = orderList.filter((o) => o.status !== "received").length;
  const wasteCount = wasteRecords?.length ?? 0;
  const filteredWasteRecords = useMemo(
    () => filterWasteRecords(wasteRecords ?? [], list, wasteSearchQuery, wasteFilter),
    [wasteRecords, list, wasteSearchQuery, wasteFilter],
  );

  if (isLoading) return <PageLoader label="טוען מלאי..." />;
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
      categoryId: item.category_id ?? "",
      unit: item.unit ?? "יחידות",
      unitsPerPackage: item.units_per_package != null ? String(item.units_per_package) : "",
      qty: String(item.current_qty),
      minQty: String(item.min_quantity),
      deliveryDay: item.supplier_delivery_day != null ? String(item.supplier_delivery_day) : "",
      departmentIds: [...item.department_ids],
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

  async function handleReceive(line: OrderLine | InventoryOrderWithUser, receivedQty?: number) {
    if (!canManageOrders && !canUpdateOrderArrival) return;
    const item = list.find((i) => i.id === line.item_id);
    if (!item) return;
    const ordered = Number(line.quantity);
    const received = receivedQty ?? ordered;
    try {
      await receiveOrder.mutateAsync({
        order_id: line.id,
        business_id: businessId!,
        item_id: line.item_id,
        ordered_quantity: ordered,
        received_quantity: received,
        current_qty: item.current_qty,
        employee_id: profile?.id ?? null,
        batch_id: line.batch_id,
        ordered_by: line.ordered_by,
        supplier_id: line.supplier_id,
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
      const category_id = form.categoryId || null;
      const units_per_package = supportsPieceInput(form.unit)
        ? Math.max(0, Number(form.unitsPerPackage) || 0) || null
        : null;
      const department_ids = form.departmentIds;

      if (editing) {
        const changed: string[] = [];
        if (form.name.trim() !== editing.name) changed.push("שם");
        if (form.unit !== (editing.unit ?? "יחידות")) changed.push("יחידת מידה");
        if (units_per_package !== editing.units_per_package) changed.push("יחידים ביחידת מידה");
        if (min_quantity !== editing.min_quantity) changed.push("כמות מינימום");
        if (supplier_delivery_day !== editing.supplier_delivery_day) changed.push("יום אספקה");
        if (category_id !== editing.category_id) changed.push("קטגוריה");
        if (image_url !== editing.image_url) changed.push("תמונה");
        const prevDepts = [...editing.department_ids].sort().join(",");
        const nextDepts = [...department_ids].sort().join(",");
        if (prevDepts !== nextDepts) changed.push("מחלקות");
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
            category_id,
          },
          department_ids,
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
          category_id,
          department_ids,
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

  return (
    <div className="w-full animate-fadeUp">
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
            resultCount={visibleOrderResultCount}
            totalCount={visibleOrderTotalCount}
            resultUnit="הזמנות"
            onAdd={() => openNewOrder()}
            showAdd
            addIcon="add_shopping_cart"
            addAriaLabel="הזמנה חדשה"
            extraFilterActive={!!orderSupplierFilter}
            filterTokens={
              (supplierList?.length ?? 0) > 0 ? (
                <Field label="סינון לפי ספק" className="!mb-0">
                  <Select
                    value={orderSupplierFilter ?? ""}
                    onChange={(e) => setOrderSupplierFilter(e.target.value || null)}
                    searchable
                    searchPlaceholder="חיפוש ספק..."
                  >
                    <option value="">כל הספקים</option>
                    <option value="__none__">ללא ספק</option>
                    {(supplierList ?? [])
                      .filter((s) => s.active)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </Select>
                </Field>
              ) : null
            }
          />
          {allOrderBatches.length === 0 ? (
            <OrdersEmptyState onCreate={() => openNewOrder()} />
          ) : visibleOrderResultCount === 0 ? (
            <EmptyState
              icon="search_off"
              title="לא נמצאו הזמנות"
              description={
                visibleOrderTotalCount === 0
                  ? `אין הזמנות ${orderFilter === "closed" ? "סגורות" : orderFilter === "partial" ? "חלקיות" : "פתוחות"} כרגע.`
                  : "נסו מילת חיפוש אחרת או שנו את הסינון."
              }
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setOrderSearchQuery("");
                    setOrderFilter("open");
                    setOrderSupplierFilter(null);
                  }}
                >
                  ניקוי סינון
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-5 md:gap-0">
              <OrderBatchListSection
                title={orderListSectionMeta.title}
                icon={orderListSectionMeta.icon}
                batches={filteredOrderBatches}
                canManageOrders={canManageOrders}
                canSeePrices={canSeePrices}
                supplierPriceIndex={supplierPriceIndex}
                received={orderListSectionMeta.received}
                onDetails={(batch) => setDetailBatchId(batch.id)}
                onEdit={openEditOrder}
                onDelete={handleDeleteOrder}
                getBatchPartialUiState={orderFilter !== "closed" ? resolveBatchPartialUiState : undefined}
              />
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
              filters={[]}
              placeholder="חיפוש מוצר..."
              resultCount={filteredList.length}
              totalCount={list.length}
              resultUnit="פריטים"
              onAdd={openCreate}
              showAdd={isManager}
              addIcon="add"
              addAriaLabel="פריט חדש"
              extraFilterActive={catalogFiltersActive}
              filterTrigger={
                <InventoryCatalogFilterDeck
                  stockFilter={stockFilter}
                  onStockChange={changeStockFilter}
                  categoryFilter={categoryFilter}
                  onCategoryChange={setCategoryFilter}
                  departmentFilter={departmentFilter}
                  onDepartmentChange={setDepartmentFilter}
                  departments={departmentsForFilter}
                  inventoryCategories={inventoryCategories ?? []}
                  onClearAll={clearCatalogFilters}
                  showClear={catalogFiltersActive || !!searchQuery.trim()}
                  showGeneralDeptFilter={showGeneralDeptFilter}
                  counts={catalogFilterCounts}
                />
              }
              filterTokens={
                <InventoryFilterTokens
                  stockFilter={stockFilter}
                  onStockChange={changeStockFilter}
                  categoryFilter={categoryFilter}
                  onCategoryChange={setCategoryFilter}
                  departmentFilter={departmentFilter}
                  onDepartmentChange={setDepartmentFilter}
                  departments={departmentsForFilter}
                  inventoryCategories={inventoryCategories ?? []}
                />
              }
            />
            {filteredList.length === 0 ? (
              <EmptyState
                icon="search_off"
                title={
                  stockFilter === "low"
                    ? "אין מוצרים במלאי נמוך"
                    : catalogFiltersActive
                      ? "אין מוצרים בסינון הזה"
                      : "לא נמצאו מוצרים"
                }
                description={
                  stockFilter === "low"
                    ? "כל המוצרים מעל סף המלאי שהוגדר."
                    : catalogFiltersActive
                      ? "נסו מחלקה או קטגוריה אחרת, או נקו את הסינון."
                      : "נסו מילת חיפוש אחרת."
                }
                action={
                  stockFilter === "low" ? (
                    <Button variant="secondary" onClick={() => changeStockFilter("all")}>
                      הצג את כל המוצרים
                    </Button>
                  ) : catalogFiltersActive || searchQuery.trim() ? (
                    <Button variant="secondary" onClick={clearCatalogFilters}>
                      ניקוי סינון
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
                    categoryNames={categoryNameMap}
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
            <Select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}>
              <option value="">ללא קטגוריה</option>
              {(inventoryCategories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {isManager && !(inventoryCategories?.length) && (
              <p className="mt-1 text-[12px] text-text-3">
                הוסיפו קטגוריות מוצרים ב{" "}
                <Link to="/settings" className="font-semibold text-accent-2 hover:underline">
                  הגדרות העסק
                </Link>
                .
              </p>
            )}
          </Field>

          <Field label="מחלקות">
            <MultiSelect
              values={form.departmentIds}
              onChange={(departmentIds) => setForm((f) => ({ ...f, departmentIds }))}
              options={departmentOptions}
              placeholder="כל המחלקות"
              disabled={!departmentOptions.length}
            />
            <p className="mt-1 text-[12px] text-text-3">
              {departmentOptions.length === 0
                ? "הוסיפו מחלקות בהגדרות העסק כדי לשייך מוצרים."
                : "ללא בחירה — המוצר יוצג לכל המחלקות. ניתן לבחור כמה מחלקות (למשל מטבח ובר)."}
            </p>
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
            {canSeePrices && (
              <p className="mt-1 text-[12px] text-text-3">
                מחירי רכש מוגדרים לפי ספק ב{" "}
                <Link to="/suppliers" className="font-semibold text-accent-2 hover:underline">
                  עמוד הספקים
                </Link>
                .
              </p>
            )}
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
        qtyUpdateBusy={qtySaving}
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
        categoryNames={categoryNameMap}
      />

      <HistoryModal businessId={businessId} item={historyItem} onClose={() => setHistoryItem(null)} />

      <OrderDetailsModal
        batch={detailBatch}
        open={!!detailBatch}
        receiveBusy={receiveOrder.isPending || markOrderNotArrived.isPending}
        canSeePrices={canSeePrices}
        supplierPriceIndex={supplierPriceIndex}
        onClose={() => setDetailBatchId(null)}
        onReceive={(line, receivedQty) => handleReceive(line, receivedQty)}
        onNotArrived={(line) => handleMarkNotArrived(line)}
        partialUiState={detailBatch ? resolveBatchPartialUiState(detailBatch) : "none"}
        onAcknowledgePartial={() => {
          if (detailBatch) acknowledgeBatch(detailBatch.id);
        }}
      />

      <LoadingOverlay show={qtySaving && !detailItemLive} label="מעדכן מלאי..." />
    </div>
  );
}
