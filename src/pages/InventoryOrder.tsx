import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button, EmptyState, ErrorState, Icon, Input, LoadingOverlay, PageLoader } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import {
  useInventory,
  useOrders,
  useCreateOrdersBatch,
  useUpdateOrdersBatch,
  inventorySaveError,
  inventoryLineTotal,
  formatQtyWithPieces,
  isTrackedLowStock,
  inventoryItemMatchesQuery,
  type ItemWithQty,
} from "@/api/inventory";
import { useInventoryCategories } from "@/api/inventoryCategories";
import { useSuppliers, useSupplierItemPriceIndex, effectiveMainUnitPrice } from "@/api/suppliers";
import {
  decomposeQty,
  draftLabel,
  draftTotal,
  type QtyDraft,
} from "@/components/inventory/orderDraft";
import {
  ProductSupplierModal,
  type ProductPick,
} from "@/components/inventory/ProductSupplierModal";
import { OrderReviewModal } from "@/components/inventory/OrderReviewModal";
import {
  deliveryDayLabel,
  draftLinesTotal,
  formatPrice,
  groupDraftLinesBySupplier,
  orderCalcLabel,
  type DraftOrderLine,
} from "@/lib/orderSuppliers";

/** A product in the cart: how much, and which supplier it was priced against. */
type CartLine = QtyDraft & { supplier_id: string };

/** How many active suppliers carry a product, and the best price among them. */
interface ItemSupplierMeta {
  count: number;
  min_price: number;
}

type StockStatus = "empty" | "low" | "ok";

function stockStatus(item: ItemWithQty): StockStatus {
  if (item.current_qty === 0) return "empty";
  const threshold = item.min_quantity > 0 ? item.min_quantity : 3;
  if (item.current_qty <= threshold) return "low";
  return "ok";
}

const STOCK_META: Record<StockStatus, { label: string; dot: string }> = {
  empty: { label: "אזל", dot: "var(--danger)" },
  low: { label: "נמוך", dot: "var(--warning)" },
  ok: { label: "במלאי", dot: "var(--success)" },
};

const NO_SUPPLIER_META: ItemSupplierMeta = { count: 0, min_price: 0 };

/* ----------------------------- Product card ----------------------------- */

function ProductCard({
  item,
  index,
  line,
  flash,
  supplierMeta,
  supplierName,
  deliveryLabel,
  lineTotal,
  categoryName,
  onOpen,
  onRemove,
}: {
  item: ItemWithQty;
  index: number;
  line: CartLine | undefined;
  flash: boolean;
  supplierMeta: ItemSupplierMeta;
  supplierName: string | null;
  deliveryLabel: string | null;
  lineTotal: number;
  categoryName: string | null;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const meta = STOCK_META[stockStatus(item)];
  const selected = !!line;

  return (
    <article
      id={`ordc-item-${item.id}`}
      className="ordc-card inventory-item-enter"
      data-selected={selected}
      data-flash={flash || undefined}
      style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
    >
      <div className="ordc-card-img">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} loading="lazy" />
        ) : (
          <span className="ordc-card-img-fallback">
            <Icon name="inventory_2" size={30} />
          </span>
        )}
        <span
          className="ordc-badge-stock"
          style={{ background: `color-mix(in srgb, ${meta.dot} 16%, var(--surface))`, color: meta.dot }}
        >
          <span className="ordc-badge-dot" style={{ background: meta.dot }} />
          {meta.label}
        </span>
        {item.ordered_qty > 0 && (
          <span className="ordc-badge-ordered">
            <Icon name="local_shipping" size={11} />
            +{item.ordered_qty} בהזמנה
          </span>
        )}
        {selected && line && (
          <span className="ordc-qty-pill" key={draftLabel(item, line)}>
            <Icon name="check_circle" size={14} />
            {draftLabel(item, line)}
          </span>
        )}
      </div>

      <div className="ordc-card-body">
        <div>
          <h3 className="ordc-name">{item.name}</h3>
          {item.barcode && (
            <span className="ordc-cat font-mono tabular-nums" dir="ltr">
              {item.barcode}
            </span>
          )}
          {categoryName && <span className="ordc-cat">{categoryName}</span>}
        </div>

        <div className="ordc-meta">
          <span className="ordc-meta-line">
            <Icon name="inventory_2" size={13} />
            במלאי {formatQtyWithPieces(item.current_qty, item.unit, item.units_per_package)}
          </span>
          <span className="ordc-meta-line">
            <Icon name="storefront" size={13} />
            {supplierMeta.count > 0
              ? `${supplierMeta.count} ${supplierMeta.count === 1 ? "ספק" : "ספקים"}`
              : "אין ספק משויך"}
            {supplierMeta.min_price > 0 && ` · מ־${formatPrice(supplierMeta.min_price)}`}
          </span>
        </div>

        {selected && line ? (
          <div className="ordc-card-controls">
            <button type="button" className="ordc-picked" onClick={onOpen}>
              <span className="ordc-picked-body">
                <span className="ordc-picked-sup">
                  <Icon name="storefront" size={12} />
                  {supplierName ?? "ספק"}
                </span>
                <span className="ordc-picked-qty tabular-nums">
                  {draftLabel(item, line)}
                  {lineTotal > 0 && <b> · {formatPrice(lineTotal)}</b>}
                </span>
                {deliveryLabel && (
                  <span className="ordc-picked-delivery">
                    <Icon name="local_shipping" size={11} />
                    {deliveryLabel}
                  </span>
                )}
              </span>
              <span className="ordc-picked-edit">
                <Icon name="tune" size={16} />
              </span>
            </button>
            <button type="button" className="ordc-remove-btn" onClick={onRemove}>
              <Icon name="delete" size={14} />
              הסרה מההזמנה
            </button>
          </div>
        ) : (
          <button type="button" className="ordc-add-btn" onClick={onOpen}>
            <Icon name="add_shopping_cart" size={17} />
            הוספה להזמנה
          </button>
        )}
      </div>
    </article>
  );
}

/* ----------------------------- Low-stock strip ----------------------------- */

function RecoStrip({
  items,
  lines,
  onOpen,
}: {
  items: ItemWithQty[];
  lines: Record<string, CartLine>;
  onOpen: (item: ItemWithQty) => void;
}) {
  return (
    <section className="ordc-reco">
      <div className="ordc-reco-head">
        <span className="ordc-reco-icon">
          <Icon name="notifications_active" size={14} />
        </span>
        <span className="ordc-reco-title">כדאי להזמין · מלאי נמוך</span>
        <span className="ordc-reco-count">{items.length}</span>
      </div>
      <div className="ordc-reco-row">
        {items.map((it) => {
          const inCart = !!lines[it.id];
          return (
            <button
              key={it.id}
              type="button"
              className="ordc-reco-card"
              data-selected={inCart}
              onClick={() => onOpen(it)}
              title={inCart ? "עריכת הבחירה" : "בחירת ספק והוספה להזמנה"}
            >
              <span className="ordc-reco-thumb">
                {it.image_url ? <img src={it.image_url} alt="" /> : <Icon name="inventory_2" size={16} />}
              </span>
              <span className="ordc-reco-info">
                <span className="ordc-reco-name">{it.name}</span>
                <span className="ordc-reco-stock">
                  במלאי {it.current_qty}
                  {it.unit ? ` ${it.unit}` : ""}
                </span>
              </span>
              <span className="ordc-reco-add">
                <Icon name={inCart ? "check" : "add"} size={16} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ----------------------------- Cart lines ----------------------------- */

function CartGroups({
  groups,
  onOpenLine,
  onRemoveLine,
}: {
  groups: ReturnType<typeof groupDraftLinesBySupplier>;
  onOpenLine: (itemId: string) => void;
  onRemoveLine: (itemId: string) => void;
}) {
  return (
    <div className="ordc-cart-lines">
      {groups.map((group) => (
        <section key={group.supplier_id} className="ordc-cgroup">
          <header className="ordc-cgroup-head">
            <span className="ordc-cgroup-name">
              <Icon name="storefront" size={13} />
              {group.name}
            </span>
            <span className="ordc-cgroup-total tabular-nums">{formatPrice(group.total)}</span>
          </header>
          <ul className="ordc-cgroup-lines">
            {group.lines.map((line) => (
              <li key={line.item_id} className="ordc-cart-line">
                <button
                  type="button"
                  className="ordc-cart-line-main"
                  onClick={() => onOpenLine(line.item_id)}
                  title="שינוי ספק או כמות"
                >
                  <span className="ordc-cart-thumb">
                    {line.image_url ? <img src={line.image_url} alt="" /> : <Icon name="inventory_2" size={16} />}
                  </span>
                  <span className="ordc-cart-info">
                    <span className="ordc-cart-name">{line.name}</span>
                    <span className="ordc-cart-qty">
                      {line.qty_label}
                      {line.line_total > 0 ? ` · ${formatPrice(line.line_total)}` : " · ללא מחיר"}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="ordc-cart-remove"
                  onClick={() => onRemoveLine(line.item_id)}
                  aria-label={`הסרת ${line.name}`}
                >
                  <Icon name="close" size={15} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ----------------------------- Page ----------------------------- */

export function InventoryOrder() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const batchParam = searchParams.get("batch");
  const isEditing = !!batchParam;
  const canManageOrders = !!(profile && ["manager", "office_manager"].includes(profile.role));

  const { data: items, isLoading, isError, refetch } = useInventory(businessId);
  const { data: inventoryCategories } = useInventoryCategories(businessId);
  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of inventoryCategories ?? []) m.set(c.id, c.name);
    return m;
  }, [inventoryCategories]);
  const { data: orders } = useOrders(businessId, isEditing);
  const { data: suppliers } = useSuppliers(businessId, { activeOnly: true });
  const { data: supplierPriceIndex } = useSupplierItemPriceIndex(businessId);
  const createOrdersBatch = useCreateOrdersBatch(businessId);
  const updateOrdersBatch = useUpdateOrdersBatch(businessId);

  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pickerItemId, setPickerItemId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [batchMissing, setBatchMissing] = useState(false);
  const preferredSupplierId = searchParams.get("supplier");
  const editInitRef = useRef(false);
  const presetRef = useRef(false);
  const flashTimer = useRef<number>();

  const list = useMemo(() => items ?? [], [items]);
  const supplierList = useMemo(() => suppliers ?? [], [suppliers]);
  const itemById = useMemo(() => new Map(list.map((i) => [i.id, i])), [list]);

  /** Open lines of the batch being edited (batch key = batch_id, or line id for legacy single orders). */
  const editLines = useMemo(() => {
    if (!isEditing || !orders) return null;
    return orders.filter((o) => o.status !== "received" && (o.batch_id ?? o.id) === batchParam);
  }, [orders, isEditing, batchParam]);

  useEffect(() => {
    if (!isEditing || editInitRef.current || !editLines || !items) return;
    editInitRef.current = true;
    if (!editLines.length) {
      setBatchMissing(true);
      return;
    }
    const batchSupplierId = editLines[0]?.supplier_id ?? "";
    const next: Record<string, CartLine> = {};
    for (const line of editLines) {
      const qty = decomposeQty(
        items.find((i) => i.id === line.item_id),
        Number(line.quantity),
      );
      next[line.item_id] = { ...qty, supplier_id: line.supplier_id ?? batchSupplierId };
    }
    setCart(next);
  }, [isEditing, editLines, items]);

  // Arriving from a product card ("הזמנה" on a specific item) — open its picker right away.
  useEffect(() => {
    const preset = searchParams.get("item");
    if (!preset || presetRef.current || !items) return;
    presetRef.current = true;
    if (items.some((i) => i.id === preset)) setPickerItemId(preset);
  }, [items, searchParams]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  // Removing the last line from inside the review sends the user back to the catalog.
  useEffect(() => {
    if (reviewOpen && Object.keys(cart).length === 0) setReviewOpen(false);
  }, [reviewOpen, cart]);

  /** Active suppliers per product + the cheapest price among them, for the catalog cards. */
  const supplierMetaByItem = useMemo(() => {
    const map = new Map<string, ItemSupplierMeta>();
    if (!supplierPriceIndex) return map;
    const activeIds = new Set(supplierList.map((s) => s.id));
    for (const [supplierId, itemPrices] of supplierPriceIndex) {
      if (!activeIds.has(supplierId)) continue;
      for (const [itemId, prices] of itemPrices) {
        const price = effectiveMainUnitPrice(prices, itemById.get(itemId)?.units_per_package ?? null);
        const entry = map.get(itemId) ?? { count: 0, min_price: 0 };
        entry.count += 1;
        if (price > 0 && (entry.min_price === 0 || price < entry.min_price)) entry.min_price = price;
        map.set(itemId, entry);
      }
    }
    return map;
  }, [supplierPriceIndex, supplierList, itemById]);

  const supplierById = useMemo(() => new Map(supplierList.map((s) => [s.id, s])), [supplierList]);

  /** Cart contents, priced by whichever supplier was chosen per product. */
  const draftLines = useMemo(() => {
    const result: DraftOrderLine[] = [];
    for (const [itemId, line] of Object.entries(cart)) {
      const item = itemById.get(itemId);
      if (!item) continue;
      const quantity = draftTotal(item, line);
      if (quantity <= 0) continue;
      const prices = supplierPriceIndex?.get(line.supplier_id)?.get(itemId);
      const unitPrice = effectiveMainUnitPrice(prices, item.units_per_package);
      result.push({
        item_id: itemId,
        name: item.name,
        image_url: item.image_url,
        unit: item.unit,
        units_per_package: item.units_per_package,
        supplier_id: line.supplier_id,
        quantity,
        qty_label: draftLabel(item, line),
        calc_label: orderCalcLabel(item, line, prices),
        unit_price: unitPrice,
        line_total: inventoryLineTotal(item, quantity, unitPrice),
      });
    }
    return result;
  }, [cart, itemById, supplierPriceIndex]);

  const supplierGroups = useMemo(
    () => groupDraftLinesBySupplier(draftLines, supplierList),
    [draftLines, supplierList],
  );
  const cartTotal = useMemo(() => draftLinesTotal(draftLines), [draftLines]);
  const lineTotalByItem = useMemo(
    () => new Map(draftLines.map((l) => [l.item_id, l.line_total])),
    [draftLines],
  );

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of list) if (it.category_id) counts.set(it.category_id, (counts.get(it.category_id) ?? 0) + 1);
    return (inventoryCategories ?? [])
      .filter((c) => counts.has(c.id))
      .map((c) => ({ id: c.id, label: c.name, count: counts.get(c.id)! }));
  }, [list, inventoryCategories]);

  const recoItems = useMemo(() => list.filter(isTrackedLowStock).slice(0, 12), [list]);
  const showReco = recoItems.length > 0 && !query.trim() && category === "all";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((it) => {
      if (category === "low") {
        if (!isTrackedLowStock(it)) return false;
      } else if (category !== "all" && it.category_id !== category) {
        return false;
      }
      if (q && !inventoryItemMatchesQuery(it, q)) return false;
      return true;
    });
  }, [list, query, category]);

  const editMeta =
    isEditing && editLines?.length
      ? {
          date: new Date(editLines[0].created_at).toLocaleDateString("he-IL", { day: "numeric", month: "short" }),
          by: editLines[0].ordered_by_name,
        }
      : null;

  /**
   * Adding a product while editing must not silently move the whole batch to a
   * different supplier, so the batch's own supplier is the default there.
   */
  const pickerPreferredSupplierId = isEditing
    ? Object.values(cart)[0]?.supplier_id ?? preferredSupplierId
    : preferredSupplierId;

  const pickerItem = pickerItemId ? itemById.get(pickerItemId) ?? null : null;
  const pickerCurrent: ProductPick | null =
    pickerItemId && cart[pickerItemId]
      ? {
          supplier_id: cart[pickerItemId].supplier_id,
          packs: cart[pickerItemId].packs,
          pieces: cart[pickerItemId].pieces,
        }
      : null;

  function openPicker(item: ItemWithQty) {
    setError(null);
    setSheetOpen(false);
    setPickerItemId(item.id);
  }

  function confirmPick(itemId: string, pick: ProductPick) {
    setError(null);
    setCart((prev) => {
      const next: Record<string, CartLine> = { ...prev };
      next[itemId] = { supplier_id: pick.supplier_id, packs: pick.packs, pieces: pick.pieces };
      // An existing order is one batch for one supplier — keep every line aligned.
      if (isEditing) {
        for (const id of Object.keys(next)) next[id] = { ...next[id], supplier_id: pick.supplier_id };
      }
      return next;
    });
    setPickerItemId(null);
    flashItem(itemId);
  }

  function removeItem(id: string) {
    setCart((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  }

  function clearAll() {
    setCart({});
    setError(null);
  }

  function flashItem(itemId: string) {
    setFlashId(itemId);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashId(null), 1100);
  }

  function goBack() {
    if (location.key !== "default") navigate(-1);
    else navigate("/inventory?tab=orders", { replace: true });
  }

  function openReview() {
    setError(null);
    if (!draftLines.length) {
      setError("נא לבחור לפחות מוצר אחד עם כמות");
      return;
    }
    const missingSupplier = draftLines.some((l) => !l.supplier_id);
    if (missingSupplier) {
      setError("לכל מוצר צריך לבחור ספק");
      return;
    }
    setSheetOpen(false);
    setReviewOpen(true);
  }

  async function submit() {
    setError(null);
    if (!supplierGroups.length) {
      setError("נא לבחור לפחות מוצר אחד עם כמות");
      return;
    }
    setBusy(true);
    try {
      if (isEditing && editLines?.length) {
        await updateOrdersBatch.mutateAsync({
          batch_id: batchParam!,
          business_id: businessId!,
          ordered_by: editLines[0].ordered_by ?? profile?.id ?? null,
          supplier_id: supplierGroups[0].supplier_id,
          line_ids: editLines.map((l) => l.id),
          lines: draftLines.map((l) => ({ item_id: l.item_id, quantity: l.quantity })),
        });
      } else {
        // One batch per supplier — a mixed cart becomes several separate orders.
        for (const group of supplierGroups) {
          await createOrdersBatch.mutateAsync({
            business_id: businessId!,
            ordered_by: profile?.id ?? null,
            supplier_id: group.supplier_id,
            lines: group.lines.map((l) => ({ item_id: l.item_id, quantity: l.quantity })),
          });
        }
      }
      navigate("/inventory?tab=orders", { replace: true });
    } catch (e) {
      setError(inventorySaveError(e));
    } finally {
      setBusy(false);
    }
  }

  if (profile && !canManageOrders) return <Navigate to="/inventory" replace />;

  if (isLoading || (isEditing && !batchMissing && !editInitRef.current)) {
    return <PageLoader label="טוען הזמנה..." />;
  }

  if (isError) return <ErrorState onRetry={refetch} />;

  if (batchMissing) {
    return (
      <div className="w-full animate-fadeUp">
        <EmptyState
          icon="search_off"
          title="ההזמנה לא נמצאה"
          description="ייתכן שההזמנה נמחקה או שכל הפריטים שלה כבר התקבלו במלאי."
          action={
            <Button variant="secondary" icon="arrow_forward" onClick={goBack}>
              חזרה להזמנות
            </Button>
          }
        />
      </div>
    );
  }

  const errorBox = error && (
    <div className="flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
      <Icon name="error" size={18} className="shrink-0" /> {error}
    </div>
  );

  const noSuppliersNote = supplierList.length === 0 && (
    <p className="ordc-cart-hint">
      <Icon name="warning" size={14} />
      אין ספקים פעילים במערכת — כל הזמנה חייבת ספק.{" "}
      <Link to="/suppliers" className="font-semibold text-accent-2 hover:underline">
        הוספת ספק
      </Link>
    </p>
  );

  const cartEmpty = (
    <div className="ordc-cart-empty">
      <span className="ordc-cart-empty-icon">
        <Icon name="add_shopping_cart" size={26} />
      </span>
      <p className="ordc-cart-empty-title">עוד לא נבחרו מוצרים</p>
      <p className="ordc-cart-empty-sub">
        בכל מוצר בוחרים את הספק שממנו מזמינים — אפשר לשלב כמה ספקים בהזמנה אחת.
      </p>
    </div>
  );

  const cartSummary = (
    <>
      <div className="ordc-total">
        <span className="ordc-total-label">
          סה״כ הזמנה
          <small>
            {draftLines.length} מוצרים · {supplierGroups.length}{" "}
            {supplierGroups.length === 1 ? "ספק" : "ספקים"}
          </small>
        </span>
        <b className="ordc-total-value tabular-nums">{formatPrice(cartTotal)}</b>
      </div>
      {noSuppliersNote}
      {errorBox}
    </>
  );

  return (
    <div className={`ordc-page page-enter w-full ${draftLines.length ? "pb-36" : "pb-4"} lg:pb-0`}>
      <header className="mb-4 flex items-center gap-3 md:mb-5">
        <button type="button" className="icon-btn shrink-0" onClick={goBack} aria-label="חזרה">
          <Icon name="arrow_forward" size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-extrabold leading-tight tracking-tight md:text-[23px]">
            {isEditing ? "עריכת הזמנה" : "הזמנה חדשה"}
          </h1>
          <p className="mt-0.5 truncate text-[12px] text-text-3 md:text-[13px]">
            {editMeta
              ? `הזמנה מ־${editMeta.date}${editMeta.by ? ` · ${editMeta.by}` : ""}`
              : "בכל מוצר בוחרים ספק וכמות — אפשר לשלב כמה ספקים בהזמנה אחת"}
          </p>
        </div>
        {draftLines.length > 0 && (
          <span className="ordc-head-chip hidden md:inline-flex lg:hidden" key={draftLines.length}>
            <Icon name="shopping_cart" size={15} />
            {draftLines.length}
          </span>
        )}
      </header>

      <div className="ordc-layout">
        <section className="min-w-0">
          {list.length === 0 ? (
            <EmptyState
              icon="inventory_2"
              title="אין מוצרים במלאי"
              description="כדי ליצור הזמנה צריך קודם להוסיף מוצרים בעמוד המלאי."
              action={
                <Button variant="secondary" icon="arrow_forward" onClick={goBack}>
                  חזרה למלאי
                </Button>
              }
            />
          ) : (
            <>
              <div className="ordc-toolbar">
                <div className="relative">
                  <Icon
                    name="search"
                    size={18}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-3"
                  />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="חיפוש לפי שם או ברקוד..."
                    className="!pr-10"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="ניקוי חיפוש"
                      className="absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>
                <div className="ordc-chips">
                  <button type="button" className="ordc-chip" data-active={category === "all"} onClick={() => setCategory("all")}>
                    הכל
                    <span className="ordc-chip-count">{list.length}</span>
                  </button>
                  {recoItems.length > 0 && (
                    <button type="button" className="ordc-chip" data-active={category === "low"} onClick={() => setCategory("low")}>
                      <Icon name="warning" size={14} />
                      מלאי נמוך
                      <span className="ordc-chip-count">{recoItems.length}</span>
                    </button>
                  )}
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="ordc-chip"
                      data-active={category === c.id}
                      onClick={() => setCategory(c.id)}
                    >
                      <Icon name="category" size={14} />
                      {c.label}
                      <span className="ordc-chip-count">{c.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {showReco && <RecoStrip items={recoItems} lines={cart} onOpen={openPicker} />}

              {filtered.length === 0 ? (
                <EmptyState
                  icon="search_off"
                  title="לא נמצאו מוצרים"
                  description="נסו מילת חיפוש אחרת או קטגוריה אחרת."
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setQuery("");
                        setCategory("all");
                      }}
                    >
                      ניקוי סינון
                    </Button>
                  }
                />
              ) : (
                <div className="ordc-grid">
                  {filtered.map((it, idx) => {
                    const line = cart[it.id];
                    const supplier = line ? supplierById.get(line.supplier_id) ?? null : null;
                    return (
                      <ProductCard
                        key={it.id}
                        item={it}
                        index={idx}
                        line={line}
                        flash={flashId === it.id}
                        supplierMeta={supplierMetaByItem.get(it.id) ?? NO_SUPPLIER_META}
                        supplierName={supplier?.name ?? null}
                        deliveryLabel={supplier ? deliveryDayLabel(supplier.delivery_day) : null}
                        lineTotal={lineTotalByItem.get(it.id) ?? 0}
                        categoryName={it.category_id ? categoryNameById.get(it.category_id) ?? null : null}
                        onOpen={() => openPicker(it)}
                        onRemove={() => removeItem(it.id)}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>

        {/* Desktop cart panel */}
        <aside className="ordc-cart">
          <div className="ordc-cart-head">
            <span className="ordc-cart-title">
              <Icon name="shopping_cart" size={17} />
              ההזמנה שלי
            </span>
            <span className="ordc-cart-count" key={draftLines.length}>
              {draftLines.length}
            </span>
          </div>
          {draftLines.length === 0 ? (
            cartEmpty
          ) : (
            <>
              <CartGroups
                groups={supplierGroups}
                onOpenLine={(itemId) => {
                  const item = itemById.get(itemId);
                  if (item) openPicker(item);
                }}
                onRemoveLine={removeItem}
              />
              <div className="ordc-cart-foot">
                {cartSummary}
                <Button className="w-full !bg-ink" icon="arrow_back" onClick={openReview}>
                  הבא · סיכום ההזמנה
                </Button>
                <button type="button" className="ordc-clear" onClick={clearAll}>
                  ניקוי הבחירה
                </button>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Mobile / tablet — sticky summary bar */}
      {draftLines.length > 0 && (
        <div className="ordc-bar">
          {errorBox}
          <div className="ordc-bar-row">
            <button type="button" className="ordc-bar-summary" onClick={() => setSheetOpen(true)}>
              <span className="ordc-bar-thumbs">
                {draftLines.slice(0, 3).map((line) => (
                  <span key={line.item_id} className="ordc-bar-thumb">
                    {line.image_url ? <img src={line.image_url} alt="" /> : <Icon name="inventory_2" size={14} />}
                  </span>
                ))}
              </span>
              <span className="ordc-bar-meta">
                <b key={draftLines.length}>{formatPrice(cartTotal)}</b>
                <span>
                  {draftLines.length} מוצרים · {supplierGroups.length}{" "}
                  {supplierGroups.length === 1 ? "ספק" : "ספקים"}
                </span>
              </span>
              <Icon name="expand_less" size={18} className="text-text-3" />
            </button>
            <Button className="shrink-0 !bg-ink !px-5" icon="arrow_back" onClick={openReview}>
              הבא
            </Button>
          </div>
        </div>
      )}

      {/* Mobile / tablet — cart bottom sheet */}
      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="ההזמנה שלי"
        subtitle={`${draftLines.length} מוצרים · ${supplierGroups.length} ${
          supplierGroups.length === 1 ? "ספק" : "ספקים"
        }`}
        icon="shopping_cart"
        maxWidth={540}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSheetOpen(false)} className="active:scale-[0.97]">
              המשך בחירה
            </Button>
            <Button
              className="flex-1 !bg-ink active:scale-[0.97]"
              icon="arrow_back"
              disabled={draftLines.length === 0}
              onClick={openReview}
            >
              הבא · {formatPrice(cartTotal)}
            </Button>
          </>
        }
      >
        {draftLines.length === 0 ? (
          cartEmpty
        ) : (
          <div className="ordc-sheet">
            <CartGroups
              groups={supplierGroups}
              onOpenLine={(itemId) => {
                const item = itemById.get(itemId);
                if (item) openPicker(item);
              }}
              onRemoveLine={removeItem}
            />
            {cartSummary}
            <button type="button" className="ordc-clear" onClick={clearAll}>
              ניקוי הבחירה
            </button>
          </div>
        )}
      </Modal>

      <ProductSupplierModal
        item={pickerItem}
        suppliers={supplierList}
        priceIndex={supplierPriceIndex}
        current={pickerCurrent}
        preferredSupplierId={pickerPreferredSupplierId}
        sharedSupplier={isEditing}
        onClose={() => setPickerItemId(null)}
        onConfirm={(pick) => pickerItemId && confirmPick(pickerItemId, pick)}
        onRemove={() => {
          if (pickerItemId) removeItem(pickerItemId);
          setPickerItemId(null);
        }}
      />

      <OrderReviewModal
        open={reviewOpen}
        groups={supplierGroups}
        total={cartTotal}
        busy={busy}
        error={error}
        isEditing={isEditing}
        onClose={() => setReviewOpen(false)}
        onRemoveLine={removeItem}
        onSubmit={submit}
      />

      <LoadingOverlay show={busy} label={isEditing ? "שומר שינויים בהזמנה..." : "שולח הזמנה..."} />
    </div>
  );
}
