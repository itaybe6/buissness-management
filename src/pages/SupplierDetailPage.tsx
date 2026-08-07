import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, EmptyState, ErrorState, Icon, Input, LoadingOverlay, MultiSelect, PageLoader, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useBusinessId, formatCurrency, HE_DAYS } from "@/lib/db";
import { deliveryDaysLabel, orderDaysLabel } from "@/lib/orderSuppliers";
import { useAuth } from "@/lib/auth";
import {
  useSupplierItems,
  useSupplierReceipts,
  useSuppliers,
  useUpdateSupplier,
  useSupplierItemPriceIndex,
  supplierSaveError,
  supplierPriceUnitLabel,
  effectiveMainUnitPrice,
  type SupplierItemPrices,
  type SupplierWithStats,
} from "@/api/suppliers";
import {
  useInventory,
  useOrders,
  useCreateOrdersBatch,
  useDeleteOrdersBatch,
  formatQtyWithPieces,
  pieceUnitLabel,
  splitPackageQty,
  inventoryLineTotal,
  inventorySaveError,
  type ItemWithQty,
} from "@/api/inventory";
import { useInventoryCategories } from "@/api/inventoryCategories";
import { useOrderPdfDownload } from "@/api/orderPdf";
import { RecurringOrdersEntry } from "@/components/inventory/RecurringOrdersEntry";
import { QtyEditor, draftLabel, draftTotal, type QtyDraft } from "@/components/inventory/orderDraft";
import {
  type OrderBatch,
  batchHasPendingLines,
  batchIsFullyReceived,
  groupOrderBatches,
  OrderBatchListSection,
} from "@/components/inventory/orderBatchUi";
import { usePartialDeliveryOrderCount } from "@/hooks/usePartialDeliveryOrderCount";
import { RECEIPT_TYPE_LABELS } from "@/pages/agreements/types";

type DetailTab = "products" | "orders" | "receipts";
/** Which field the details sheet lands on when it opens. */
type EditField = "name" | "phone" | "taxId" | "notes";

/** How the price list is laid out — cards mirror the inventory catalog. */
type ProductView = "grid" | "rows";
/** null = all categories · __none__ = products without a category */
type CategoryFilter = string | null;
const CAT_FILTER_NONE = "__none__" as const;

/** One product of the price list, joined with its catalog row when it is still active. */
type SupplierProduct = {
  item_id: string;
  item_name: string;
  item_unit: string | null;
  item_units_per_package: number | null;
  item_image_url: string | null;
  prices: SupplierItemPrices;
  item: ItemWithQty | null;
  category_name: string | null;
};

type StockTone = "empty" | "low" | "ok";

/** Same thresholds the inventory catalog uses, so both pages agree on "low". */
function stockToneOf(item: ItemWithQty | null): { tone: StockTone; label: string } | null {
  if (!item) return null;
  if (item.current_qty <= 0) return { tone: "empty", label: "אזל" };
  const threshold = item.min_quantity > 0 ? item.min_quantity : 3;
  if (item.current_qty <= threshold) return { tone: "low", label: "מלאי נמוך" };
  return { tone: "ok", label: "במלאי" };
}

/** Per-piece prices are often a few agorot — keep the decimals formatCurrency drops. */
function formatPrice(n: number): string {
  return "₪" + (Math.round(n * 100) / 100).toLocaleString("he-IL", { maximumFractionDigits: 2 });
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 050-1234567 → https://wa.me/972501234567 */
const DAY_OPTIONS = HE_DAYS.map((d, i) => ({ value: String(i), label: `יום ${d}` }));

function daysFromSupplier(days: number[] | null | undefined): string[] {
  if (!days?.length) return [];
  return [...new Set(days.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b).map(String);
}

function daysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}


/* ---------------------------------------------------------------- */
/* Field shell — icon + tiny label + borderless input (module look)   */
/* ---------------------------------------------------------------- */
function SheetField({
  icon,
  label,
  hint,
  children,
}: {
  icon: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="spf-field">
      <span className="spf-field-icon" aria-hidden>
        <Icon name={icon} size={18} />
      </span>
      <span className="spf-field-body">
        <span className="spf-field-label">
          {label}
          {hint && <em className="spf-field-hint">{hint}</em>}
        </span>
        {children}
      </span>
    </label>
  );
}

/* ---------------------------------------------------------------- */
/* Details sheet — edits the supplier identity in place, so fixing a  */
/* phone number never means opening the heavy price-list form.        */
/* ---------------------------------------------------------------- */
type DetailsDraft = {
  name: string;
  phone: string;
  taxId: string;
  notes: string;
  deliveryDays: string[];
  orderDays: string[];
  active: boolean;
};

function draftOf(s: SupplierWithStats): DetailsDraft {
  return {
    name: s.name,
    phone: s.phone ?? "",
    taxId: s.tax_id ?? "",
    notes: s.notes ?? "",
    deliveryDays: daysFromSupplier(s.delivery_days),
    orderDays: daysFromSupplier(s.order_days),
    active: s.active,
  };
}

function SupplierDetailsSheet({
  supplier,
  open,
  field,
  onClose,
  onSaved,
}: {
  supplier: SupplierWithStats;
  open: boolean;
  field: EditField;
  onClose: () => void;
  onSaved: () => void;
}) {
  const businessId = useBusinessId();
  const update = useUpdateSupplier(businessId);

  const [draft, setDraft] = useState<DetailsDraft>(() => draftOf(supplier));
  const [error, setError] = useState<string | null>(null);
  const [askDiscard, setAskDiscard] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const taxRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(draftOf(supplier));
    setError(null);
    setAskDiscard(false);
    // Focus the tapped field only once the sheet finished sliding in — pulling
    // focus mid-animation makes mobile browsers jump the card around.
    const t = window.setTimeout(() => {
      const el =
        field === "phone"
          ? phoneRef.current
          : field === "taxId"
            ? taxRef.current
            : field === "notes"
              ? notesRef.current
              : nameRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }, 190);
    return () => window.clearTimeout(t);
  }, [open, field, supplier.id]);

  const dirty =
    draft.name.trim() !== supplier.name ||
    draft.phone.trim() !== (supplier.phone ?? "") ||
    draft.taxId.trim() !== (supplier.tax_id ?? "") ||
    draft.notes.trim() !== (supplier.notes ?? "") ||
    !daysEqual(draft.deliveryDays, daysFromSupplier(supplier.delivery_days)) ||
    !daysEqual(draft.orderDays, daysFromSupplier(supplier.order_days)) ||
    draft.active !== supplier.active;

  function requestClose() {
    if (update.isPending) return;
    if (dirty) {
      setAskDiscard(true);
      return;
    }
    onClose();
  }

  async function save() {
    if (!draft.name.trim()) {
      setError("נא להזין שם ספק");
      nameRef.current?.focus();
      return;
    }
    setError(null);
    try {
      await update.mutateAsync({
        id: supplier.id,
        name: draft.name,
        phone: draft.phone,
        tax_id: draft.taxId,
        notes: draft.notes,
        delivery_days: draft.deliveryDays.length
          ? draft.deliveryDays.map(Number).sort((a, b) => a - b)
          : null,
        order_days: draft.orderDays.length
          ? draft.orderDays.map(Number).sort((a, b) => a - b)
          : null,
        active: draft.active,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(supplierSaveError(e));
    }
  }

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title="עריכת פרטי ספק"
      subtitle={supplier.name}
      icon="edit"
      maxWidth={520}
      footer={
        askDiscard ? (
          <>
            <p className="spd-ask" role="alert">
              <Icon name="error" size={16} />
              יש שינויים שעדיין לא נשמרו
            </p>
            <Button variant="secondary" className="flex-1" onClick={() => setAskDiscard(false)}>
              המשך עריכה
            </Button>
            <Button variant="danger" className="flex-1" onClick={onClose}>
              ביטול השינויים
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" className="flex-1" onClick={requestClose} disabled={update.isPending}>
              סגירה
            </Button>
            <Button
              className="flex-[2]"
              icon="check"
              loading={update.isPending}
              disabled={!dirty}
              onClick={() => void save()}
            >
              {dirty ? "שמירת שינויים" : "הכול שמור"}
            </Button>
          </>
        )
      }
    >
      <div
        className="spd-edit"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void save();
          }
        }}
      >
        <SheetField icon="badge" label="שם הספק" hint="חובה">
          <Input
            ref={nameRef}
            className="spf-input"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="לדוגמה: טמפו משקאות"
            autoComplete="off"
            enterKeyHint="next"
          />
        </SheetField>

        <div className="spf-fields-row">
          <SheetField icon="call" label="טלפון">
            <Input
              ref={phoneRef}
              className="spf-input"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder="050-0000000"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
            />
          </SheetField>
          <SheetField icon="receipt_long" label="ח.פ / עוסק">
            <Input
              ref={taxRef}
              className="spf-input"
              value={draft.taxId}
              onChange={(e) => setDraft({ ...draft, taxId: e.target.value })}
              placeholder="000000000"
              inputMode="numeric"
              autoComplete="off"
            />
          </SheetField>
        </div>

        <SheetField icon="local_shipping" label="ימי אספקה" hint="בימים אלה הסחורה אמורה להגיע">
          <MultiSelect
            className="spf-input spf-select"
            values={draft.deliveryDays}
            onChange={(deliveryDays) => setDraft({ ...draft, deliveryDays: [...deliveryDays].sort() })}
            options={DAY_OPTIONS}
            placeholder="לא הוגדר"
          />
        </SheetField>

        <SheetField icon="event" label="ימי הזמנה" hint="בימים אלה בדרך כלל יוצאת הזמנה">
          <MultiSelect
            className="spf-input spf-select"
            values={draft.orderDays}
            onChange={(orderDays) => setDraft({ ...draft, orderDays: [...orderDays].sort() })}
            options={DAY_OPTIONS}
            placeholder="לא הוגדר"
          />
        </SheetField>

        <SheetField icon="sticky_note_2" label="הערות">
          <Textarea
            ref={notesRef}
            className="spf-input spf-textarea"
            rows={3}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="איש קשר, תנאי תשלום..."
          />
        </SheetField>

        <div className="spf-status">
          <span className="spf-field-label">סטטוס ספק</span>
          <div className="spf-seg" role="group" aria-label="סטטוס ספק">
            <button type="button" data-active={draft.active} onClick={() => setDraft({ ...draft, active: true })}>
              <Icon name="check_circle" size={15} />
              פעיל
            </button>
            <button type="button" data-active={!draft.active} onClick={() => setDraft({ ...draft, active: false })}>
              <Icon name="pause_circle" size={15} />
              לא פעיל
            </button>
          </div>
          <p className="spd-edit-hint">
            ספק לא פעיל שומר את כל ההיסטוריה שלו, אבל לא יוצע בהזמנות חדשות ובמסמכי הנהלת חשבונות.
          </p>
        </div>

        {error && (
          <p className="spf-alert" role="alert">
            <Icon name="error" size={17} />
            {error}
          </p>
        )}

        <p className="spd-edit-tip">
          <Icon name="keyboard" size={14} />
          <span>
            <b>Ctrl + Enter</b> שומר · <b>Esc</b> סוגר · את המחירון עורכים בכפתור «עריכת מחירון» שבכותרת
          </span>
        </p>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- */
/* Price list product card — the inventory catalog tile, priced       */
/* ---------------------------------------------------------------- */
function ProductPrices({ product }: { product: SupplierProduct }) {
  const { prices } = product;
  const pack = product.item_units_per_package ?? 0;
  // Only worth deriving when the supplier quotes the package alone.
  const derivedPiece = prices.piece == null && prices.main != null && pack > 0 ? prices.main / pack : null;

  if (prices.main == null && prices.piece == null) return null;

  return (
    <>
      {prices.main != null && (
        <span className="spd-pcard-price">
          <b>{formatPrice(prices.main)}</b>
          <em>ל{supplierPriceUnitLabel("main", product.item_unit)}</em>
        </span>
      )}
      {prices.piece != null && (
        <span className="spd-pcard-price spd-pcard-price--alt">
          <b>{formatPrice(prices.piece)}</b>
          <em>ל{supplierPriceUnitLabel("piece", product.item_unit)}</em>
        </span>
      )}
      {derivedPiece != null && <span className="spd-pcard-derived">≈ {formatPrice(derivedPiece)} ליחידה</span>}
    </>
  );
}

function SupplierProductCard({
  product,
  index,
  stockKnown,
  draft,
  onOpenItem,
  onEditPrice,
  onStep,
}: {
  product: SupplierProduct;
  index: number;
  stockKnown: boolean;
  draft: QtyDraft | undefined;
  onOpenItem: () => void;
  onEditPrice: () => void;
  onStep: (delta: number) => void;
}) {
  const { item, prices } = product;
  const stock = stockToneOf(item);
  const pack = product.item_units_per_package ?? 0;
  const mainUnit = supplierPriceUnitLabel("main", product.item_unit);
  const hasPrice = prices.main != null || prices.piece != null;
  const orderedSplit = item && item.ordered_qty > 0 && pack > 0 ? splitPackageQty(item.ordered_qty, pack) : null;
  // Fill the rail against twice the minimum — "how far above the reorder point".
  const stockPct = item
    ? Math.min(100, (item.current_qty / Math.max(item.min_quantity * 2, 10)) * 100)
    : 0;

  return (
    <li
      className="spd-pcard"
      data-incart={!!draft}
      style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
    >
      <button type="button" className="spd-pcard-media" onClick={onOpenItem} title="פתיחת המוצר">
        {product.item_image_url ? (
          <img src={product.item_image_url} alt="" loading="lazy" />
        ) : (
          <span className="spd-pcard-ph" aria-hidden>
            <Icon name="inventory_2" size={30} />
          </span>
        )}
        {stock && (
          <span className="spd-pcard-badge" data-tone={stock.tone}>
            <i aria-hidden />
            {stock.label}
          </span>
        )}
        {item && item.ordered_qty > 0 && (
          <span className="spd-pcard-ordered">
            <Icon name="local_shipping" size={12} />
            {orderedSplit
              ? `+${orderedSplit.packages}${orderedSplit.pieces > 0 ? `+${orderedSplit.pieces}` : ""}`
              : `+${item.ordered_qty}`}
          </span>
        )}
        {item && draft && (
          <span className="spd-pcard-incart" key={draftLabel(item, draft)}>
            <Icon name="check_circle" size={12} />
            {draftLabel(item, draft)}
          </span>
        )}
      </button>

      <div className="spd-pcard-body">
        <button type="button" className="spd-pcard-title" onClick={onOpenItem}>
          <span className="spd-pcard-name">{product.item_name}</span>
          <span className="spd-pcard-meta">
            {product.category_name && <span>{product.category_name}</span>}
            {pack > 0 ? (
              <span>
                {pack} {pieceUnitLabel(item?.piece_unit)} ב{mainUnit}
              </span>
            ) : (
              <span>{mainUnit}</span>
            )}
            {item?.barcode && (
              <span className="spd-pcard-bc" dir="ltr">
                {item.barcode}
              </span>
            )}
          </span>
        </button>

        <div className="spd-pcard-pricing">
          {hasPrice ? (
            <ProductPrices product={product} />
          ) : (
            <span className="spd-pcard-noprice">
              <Icon name="error" size={14} />
              ללא מחיר
            </span>
          )}
        </div>

        <div className="spd-pcard-foot">
          <span className="spd-pcard-stockline">
            <span className="spd-pcard-stock" data-tone={stock?.tone ?? "none"}>
              <i aria-hidden />
              {!stockKnown
                ? "—"
                : item
                  ? `במלאי ${formatQtyWithPieces(item.current_qty, item.unit, item.units_per_package)}`
                  : "לא פעיל במלאי"}
            </span>
            {item && item.min_quantity > 0 && <em className="spd-pcard-min">מינ׳ {item.min_quantity}</em>}
          </span>
          {item && (
            <span className="spd-pcard-rail" data-tone={stock?.tone ?? "none"} aria-hidden>
              <i style={{ width: `${stockPct}%` }} />
            </span>
          )}
          <span className="spd-pcard-acts">
            <button
              type="button"
              className="spd-pact spd-pact--icon"
              onClick={onEditPrice}
              title={hasPrice ? "עריכת מחיר" : "קביעת מחיר"}
              aria-label={hasPrice ? "עריכת מחיר" : "קביעת מחיר"}
            >
              <Icon name="sell" size={16} />
            </button>
            {item && draft ? (
              <span className="ordc-step spd-pstep">
                <button
                  type="button"
                  className="ordc-step-btn"
                  onClick={() => onStep(-1)}
                  aria-label={`הפחתת ${product.item_name} מההזמנה`}
                >
                  <Icon name="remove" size={15} />
                </button>
                <b className="spd-pstep-val" key={draft.packs}>
                  {draft.packs}
                </b>
                <button
                  type="button"
                  className="ordc-step-btn ordc-step-btn--add"
                  onClick={() => onStep(1)}
                  aria-label={`הוספת ${product.item_name} להזמנה`}
                >
                  <Icon name="add" size={15} />
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="spd-pact spd-pact--primary"
                onClick={() => onStep(1)}
                disabled={!item}
                title={item ? "הוספה להזמנה מהספק" : "המוצר אינו פעיל במלאי"}
              >
                <Icon name="add_shopping_cart" size={16} />
                הזמנה
              </button>
            )}
          </span>
        </div>
      </div>
    </li>
  );
}

function SupplierProductRow({
  product,
  stockKnown,
  draft,
  onOpenItem,
  onStep,
}: {
  product: SupplierProduct;
  stockKnown: boolean;
  draft: QtyDraft | undefined;
  onOpenItem: () => void;
  onStep: (delta: number) => void;
}) {
  const { item } = product;
  const stock = stockToneOf(item);
  const mainUnit = supplierPriceUnitLabel("main", product.item_unit);

  return (
    <li className="spl-row spd-prow" data-incart={!!draft}>
      <button type="button" className="spd-prow-open" onClick={onOpenItem} title="פתיחת המוצר">
        <span className="spl-row-thumb">
          {product.item_image_url ? (
            <img src={product.item_image_url} alt="" loading="lazy" />
          ) : (
            <Icon name="inventory_2" size={17} className="text-text-3" />
          )}
        </span>
        <span className="spl-row-main">
          <b>{product.item_name}</b>
          <em>
            {[product.category_name, mainUnit, item?.barcode].filter(Boolean).join(" · ")}
          </em>
        </span>
      </button>
      <span className="spd-pcard-stock" data-tone={stock?.tone ?? "none"}>
        <i aria-hidden />
        {!stockKnown
          ? "—"
          : item
            ? formatQtyWithPieces(item.current_qty, item.unit, item.units_per_package)
            : "לא פעיל"}
      </span>
      <span className="spd-prices">
        {product.prices.main == null && product.prices.piece == null ? (
          <span className="spd-price spd-price--none">ללא מחיר</span>
        ) : (
          <>
            {product.prices.main != null && (
              <span className="spd-price">
                <b>{formatPrice(product.prices.main)}</b>
                <em>ל{mainUnit}</em>
              </span>
            )}
            {product.prices.piece != null && (
              <span className="spd-price">
                <b>{formatPrice(product.prices.piece)}</b>
                <em>ל{supplierPriceUnitLabel("piece", product.item_unit)}</em>
              </span>
            )}
          </>
        )}
      </span>
      {item && draft ? (
        <span className="ordc-step spd-pstep">
          <button
            type="button"
            className="ordc-step-btn"
            onClick={() => onStep(-1)}
            aria-label={`הפחתת ${product.item_name} מההזמנה`}
          >
            <Icon name="remove" size={15} />
          </button>
          <b className="spd-pstep-val" key={draft.packs}>
            {draft.packs}
          </b>
          <button
            type="button"
            className="ordc-step-btn ordc-step-btn--add"
            onClick={() => onStep(1)}
            aria-label={`הוספת ${product.item_name} להזמנה`}
          >
            <Icon name="add" size={15} />
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="spd-pact spd-pact--icon"
          onClick={() => onStep(1)}
          disabled={!item}
          title={item ? "הוספה להזמנה מהספק" : "המוצר אינו פעיל במלאי"}
          aria-label="הוספה להזמנה מהספק"
        >
          <Icon name="add_shopping_cart" size={16} />
        </button>
      )}
    </li>
  );
}

/* ---------------------------------------------------------------- */
/* Page                                                              */
/* ---------------------------------------------------------------- */
export function SupplierDetailPage() {
  const { supplierId } = useParams<{ supplierId: string }>();
  const businessId = useBusinessId();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canManage = !!(profile && ["manager", "office_manager"].includes(profile.role));

  const { data: suppliers, isLoading, isError, error, refetch } = useSuppliers(businessId, { activeOnly: false });
  const supplier = useMemo(
    () => (supplierId ? suppliers?.find((s) => s.id === supplierId) ?? null : null),
    [suppliers, supplierId],
  );

  const [tab, setTab] = useState<DetailTab>("products");
  const [productSearch, setProductSearch] = useState("");
  const [productView, setProductView] = useState<ProductView>("grid");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(null);

  /** Order composed in place — every line belongs to the supplier being viewed. */
  const [cart, setCart] = useState<Record<string, QtyDraft>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSent, setOrderSent] = useState<number | null>(null);

  const [editField, setEditField] = useState<EditField | null>(null);
  const [copied, setCopied] = useState<"phone" | "tax" | null>(null);
  const [flash, setFlash] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const update = useUpdateSupplier(businessId);
  const createOrdersBatch = useCreateOrdersBatch(businessId);
  const deleteOrdersBatch = useDeleteOrdersBatch(businessId);

  const { data: linkedProducts, isLoading: productsLoading } = useSupplierItems(
    businessId,
    supplier?.id ?? null,
    !!supplier,
  );
  const { data: orderList, isLoading: ordersLoading } = useOrders(businessId, !!supplier);
  const { data: receipts, isLoading: receiptsLoading } = useSupplierReceipts(
    businessId,
    supplier?.id ?? null,
    !!supplier,
  );

  const { data: inventoryItems } = useInventory(businessId);
  const { data: inventoryCategories } = useInventoryCategories(businessId);
  const { data: supplierPriceIndex } = useSupplierItemPriceIndex(businessId);
  const { getPartialBatchUiState } = usePartialDeliveryOrderCount();
  const {
    download: downloadOrderPdf,
    busyBatchId: pdfBusyBatchId,
    error: pdfError,
    clearError: clearPdfError,
  } = useOrderPdfDownload(businessId);
  const stockKnown = !!inventoryItems;

  const itemsById = useMemo(() => {
    const m = new Map<string, ItemWithQty>();
    for (const it of inventoryItems ?? []) m.set(it.id, it);
    return m;
  }, [inventoryItems]);

  const categoryNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of inventoryCategories ?? []) m.set(c.id, c.name);
    return m;
  }, [inventoryCategories]);

  /** supplier_items holds one row per price unit — fold them back into products. */
  const groupedProducts = useMemo(() => {
    const map = new Map<string, SupplierProduct>();
    for (const p of linkedProducts ?? []) {
      let row = map.get(p.item_id);
      if (!row) {
        const item = itemsById.get(p.item_id) ?? null;
        row = {
          item_id: p.item_id,
          item_name: p.item_name,
          item_unit: p.item_unit,
          item_units_per_package: p.item_units_per_package,
          item_image_url: p.item_image_url,
          prices: {},
          item,
          category_name: item?.category_id ? categoryNames.get(item.category_id) ?? null : null,
        };
        map.set(p.item_id, row);
      }
      if (p.price_unit === "piece") row.prices.piece = Number(p.unit_price);
      else row.prices.main = Number(p.unit_price);
    }
    return [...map.values()];
  }, [linkedProducts, itemsById, categoryNames]);

  const productCategories = useMemo(() => {
    const counts = new Map<string, number>();
    let noneCount = 0;
    for (const p of groupedProducts) {
      const catId = p.item?.category_id;
      if (!catId) {
        noneCount += 1;
        continue;
      }
      counts.set(catId, (counts.get(catId) ?? 0) + 1);
    }
    const cats = (inventoryCategories ?? [])
      .filter((c) => counts.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, count: counts.get(c.id)! }));
    return { noneCount, cats };
  }, [groupedProducts, inventoryCategories]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const rows = groupedProducts.filter((p) => {
      if (categoryFilter === CAT_FILTER_NONE) {
        if (p.item?.category_id) return false;
      } else if (categoryFilter && p.item?.category_id !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        p.item_name.toLowerCase().includes(q) ||
        (p.item?.barcode ?? "").toLowerCase().includes(q) ||
        (p.category_name ?? "").toLowerCase().includes(q)
      );
    });
    return rows.sort((a, b) => a.item_name.localeCompare(b.item_name, "he"));
  }, [groupedProducts, productSearch, categoryFilter]);

  const productById = useMemo(
    () => new Map(groupedProducts.map((p) => [p.item_id, p])),
    [groupedProducts],
  );

  /** Only products that still exist in the active catalog can be ordered. */
  const cartLines = useMemo(() => {
    const lines: { product: SupplierProduct; item: ItemWithQty; draft: QtyDraft; qty: number; sum: number }[] = [];
    for (const [itemId, draft] of Object.entries(cart)) {
      const product = productById.get(itemId);
      if (!product?.item) continue;
      const qty = draftTotal(product.item, draft);
      if (qty <= 0) continue;
      lines.push({
        product,
        item: product.item,
        draft,
        qty,
        sum: inventoryLineTotal(
          product.item,
          qty,
          effectiveMainUnitPrice(product.prices, product.item_units_per_package),
        ),
      });
    }
    return lines;
  }, [cart, productById]);

  const cartTotal = useMemo(() => cartLines.reduce((sum, l) => sum + l.sum, 0), [cartLines]);

  const supplierOrderBatches = useMemo(() => {
    if (!supplier) return [];
    const rows = (orderList ?? []).filter((o) => o.supplier_id === supplier.id);
    return groupOrderBatches(rows, inventoryItems ?? []);
  }, [orderList, supplier, inventoryItems]);

  const openSupplierOrders = useMemo(
    () => supplierOrderBatches.filter(batchHasPendingLines),
    [supplierOrderBatches],
  );
  const receivedSupplierOrders = useMemo(
    () => supplierOrderBatches.filter(batchIsFullyReceived),
    [supplierOrderBatches],
  );

  const resolveBatchPartialUiState = useCallback(
    (batch: OrderBatch) => getPartialBatchUiState(batch.id, batch.lines),
    [getPartialBatchUiState],
  );

  const handleOrderPdf = useCallback(
    (batch: OrderBatch) => {
      if (!supplier) return;
      void downloadOrderPdf({ batchId: batch.id, supplierName: supplier.name });
    },
    [downloadOrderPdf, supplier],
  );

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // Emptying the cart closes any open order sheet.
  useEffect(() => {
    if (cartOpen && cartLines.length === 0) setCartOpen(false);
    if (reviewOpen && cartLines.length === 0) setReviewOpen(false);
  }, [cartOpen, reviewOpen, cartLines.length]);

  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function flashSaved() {
    setFlash(true);
    later(() => setFlash(false), 2200);
  }

  function patchCart(itemId: string, patch: Partial<QtyDraft>) {
    setOrderError(null);
    setOrderSent(null);
    setCart((prev) => {
      const cur = prev[itemId] ?? { packs: 0, pieces: 0 };
      const next = {
        packs: Math.max(0, patch.packs ?? cur.packs),
        pieces: Math.max(0, patch.pieces ?? cur.pieces),
      };
      if (next.packs <= 0 && next.pieces <= 0) {
        const rest = { ...prev };
        delete rest[itemId];
        return rest;
      }
      return { ...prev, [itemId]: next };
    });
  }

  function stepCart(itemId: string, delta: number) {
    patchCart(itemId, { packs: (cart[itemId]?.packs ?? 0) + delta });
  }

  function dropFromCart(itemId: string) {
    setOrderError(null);
    setCart((prev) => {
      const rest = { ...prev };
      delete rest[itemId];
      return rest;
    });
  }

  function openReview() {
    setOrderError(null);
    setCartOpen(false);
    setReviewOpen(true);
  }

  function openEditOrder(batch: OrderBatch) {
    navigate(`/inventory/order?batch=${encodeURIComponent(batch.batch_id ?? batch.id)}`);
  }

  function openOrderDetails(batch: OrderBatch) {
    if (batchHasPendingLines(batch)) {
      openEditOrder(batch);
      return;
    }
    navigate("/inventory?tab=orders");
  }

  async function handleDeleteOrder(batch: OrderBatch) {
    if (
      !businessId ||
      deleteOrdersBatch.isPending ||
      !window.confirm(`למחוק את ההזמנה (${batch.lines.length} פריטים)?`)
    ) {
      return;
    }
    try {
      await deleteOrdersBatch.mutateAsync({
        business_id: businessId,
        line_ids: batch.lines.map((l) => l.id),
        employee_id: profile?.id ?? null,
        lines: batch.lines.map((l) => ({ item_id: l.item_id, quantity: Number(l.quantity) })),
      });
    } catch (e) {
      window.alert(inventorySaveError(e));
    }
  }

  async function submitOrder() {
    if (!supplier || orderBusy) return;
    setOrderError(null);
    if (!cartLines.length) {
      setOrderError("נא לבחור לפחות מוצר אחד עם כמות");
      return;
    }
    setOrderBusy(true);
    try {
      await createOrdersBatch.mutateAsync({
        business_id: businessId!,
        ordered_by: profile?.id ?? null,
        supplier_id: supplier.id,
        lines: cartLines.map((l) => ({ item_id: l.product.item_id, quantity: l.qty })),
      });
      setOrderSent(cartLines.length);
      setCart({});
      setCartOpen(false);
      setReviewOpen(false);
      setTab("orders");
      later(() => setOrderSent(null), 5000);
    } catch (e) {
      setOrderError(inventorySaveError(e));
    } finally {
      setOrderBusy(false);
    }
  }

  function copyFact(kind: "phone" | "tax", value: string) {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(kind);
        later(() => setCopied((c) => (c === kind ? null : c)), 1600);
      })
      .catch(() => undefined);
  }

  /** One tap on the hero chip flips פעיל ⇄ לא פעיל — the most common edit. */
  async function toggleActive() {
    if (!supplier || update.isPending) return;
    setStatusError(null);
    try {
      await update.mutateAsync({
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        tax_id: supplier.tax_id,
        notes: supplier.notes,
        active: !supplier.active,
      });
      flashSaved();
    } catch (e) {
      setStatusError(supplierSaveError(e));
    }
  }

  if (!canManage) return <Navigate to="/inventory" replace />;
  if (!businessId) {
    return <EmptyState icon="store" title="לא משויך לעסק" description="פנו למנהל המערכת לשיוך לעסק." />;
  }
  if (isLoading) return <PageLoader label="טוען ספק..." />;
  if (isError) return <ErrorState message={supplierSaveError(error)} onRetry={refetch} />;
  if (!supplier) {
    return (
      <EmptyState
        icon="local_shipping"
        title="הספק לא נמצא"
        description="ייתכן שהספק נמחק או שאין לכם הרשאה לצפות בו."
        action={
          <Link to="/suppliers">
            <Button variant="secondary">חזרה לספקים</Button>
          </Link>
        }
      />
    );
  }

  // product_count counts price rows (main + piece), so prefer the folded list.
  const productCount = linkedProducts ? groupedProducts.length : supplier.product_count;

  const tabs: { key: DetailTab; label: string; icon: string; count: number }[] = [
    { key: "products", label: "מחירון", icon: "sell", count: productCount },
    { key: "orders", label: "הזמנות", icon: "local_shipping", count: supplierOrderBatches.length },
    { key: "receipts", label: "מסמכים", icon: "receipt_long", count: supplier.receipt_count },
  ];

  return (
    <div className={`spf-page spd-page page-enter${cartLines.length ? " spd-page--cart" : ""}`}>
      <header className="spf-hero spd-hero">
        <span className="spf-glow spf-glow--1" aria-hidden />
        <span className="spf-glow spf-glow--2" aria-hidden />
        <span className="spf-grid-lines" aria-hidden />

        <div className="spd-hero-inner">
          {/* ── back + live status ── */}
          <div className="spd-topbar">
            <Link to="/suppliers" className="spf-back">
              <Icon name="arrow_forward" size={16} />
              חזרה לספקים
            </Link>

            {flash && (
              <span className="spd-saved" role="status">
                <Icon name="check_circle" size={14} />
                נשמר
              </span>
            )}

            {!supplier.active && (
              <button
                type="button"
                className="spd-state"
                data-active={false}
                onClick={() => void toggleActive()}
                disabled={update.isPending}
                title="לחצו כדי להפעיל את הספק"
              >
                <i aria-hidden />
                לא פעיל
                <Icon name="cached" size={14} className="spd-state-swap" />
              </button>
            )}
          </div>

          {/* ── identity ── */}
          <div className="spd-id">
            <h1 className="spd-name">{supplier.name}</h1>

            <div className="spd-facts">
              {supplier.phone ? (
                <button
                  type="button"
                  className="spd-fact"
                  data-label="טלפון"
                  data-copied={copied === "phone"}
                  onClick={() => copyFact("phone", supplier.phone!)}
                  title="העתקת מספר הטלפון"
                >
                  <Icon name="call" size={15} />
                  <span className="spd-fact-val">{supplier.phone}</span>
                  <span className="spd-fact-hint">{copied === "phone" ? "הועתק" : "העתקה"}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="spd-fact spd-fact--add"
                  data-label="טלפון"
                  onClick={() => setEditField("phone")}
                >
                  <Icon name="add" size={15} />
                  <span className="spd-fact-val">הוספה</span>
                </button>
              )}

              {supplier.tax_id ? (
                <button
                  type="button"
                  className="spd-fact"
                  data-label="ח.פ / עוסק"
                  data-copied={copied === "tax"}
                  onClick={() => copyFact("tax", supplier.tax_id!)}
                  title="העתקת ח.פ"
                >
                  <Icon name="badge" size={15} />
                  <span className="spd-fact-val">{supplier.tax_id}</span>
                  <span className="spd-fact-hint">{copied === "tax" ? "הועתק" : "העתקה"}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="spd-fact spd-fact--add"
                  data-label="ח.פ / עוסק"
                  onClick={() => setEditField("taxId")}
                >
                  <Icon name="add" size={15} />
                  <span className="spd-fact-val">הוספה</span>
                </button>
              )}

              <span className="spd-fact spd-fact--static" data-label="ימי אספקה">
                <Icon name="local_shipping" size={15} />
                <span className="spd-fact-val">{deliveryDaysLabel(supplier.delivery_days)}</span>
              </span>

              <span className="spd-fact spd-fact--static" data-label="ימי הזמנה">
                <Icon name="event" size={15} />
                <span className="spd-fact-val">{orderDaysLabel(supplier.order_days)}</span>
              </span>
            </div>
          </div>

          <button
            type="button"
            className={`spd-note spd-note--hero${supplier.notes ? "" : " spd-note--empty"}`}
            onClick={() => setEditField("notes")}
          >
            <span className="spd-note-ico" aria-hidden>
              <Icon name="sticky_note_2" size={16} />
            </span>
            <span className="spd-note-body">
              <b>הערות לספק</b>
              <span>{supplier.notes || "איש קשר, תנאי תשלום — לחצו להוספה"}</span>
            </span>
            <Icon name={supplier.notes ? "edit" : "add"} size={16} className="spd-note-edit" />
          </button>

          <div className="spd-actions">
            <button type="button" className="spd-act spd-act--main" onClick={() => setEditField("name")}>
              <Icon name="edit" size={18} />
              עריכת פרטים
            </button>
            <button type="button" className="spd-act" onClick={() => navigate(`/suppliers/${supplier.id}/edit`)}>
              <Icon name="sell" size={18} />
              עריכת מחירון
            </button>
            <Link className="spd-act" to={`/inventory?supplier=${supplier.id}`}>
              <Icon name="inventory_2" size={18} />
              מוצרים במלאי
            </Link>
          </div>

          {statusError && (
            <p className="spd-hero-alert" role="alert">
              <Icon name="error" size={15} />
              {statusError}
            </p>
          )}
        </div>
      </header>

      <div className="spf-body spd-body">
        {orderSent != null && (
          <p className="spd-sent" role="status">
            <Icon name="check_circle" size={17} />
            <span>
              ההזמנה נשלחה ל{supplier.name} — <b>{orderSent}</b> מוצרים ממתינים לאספקה
            </span>
          </p>
        )}

        {pdfError && (
          <p className="spd-cart-alert spd-pdf-alert" role="alert">
            <Icon name="error" size={16} />
            <span>{pdfError}</span>
            <button type="button" onClick={clearPdfError} aria-label="סגירת ההודעה">
              <Icon name="close" size={15} />
            </button>
          </p>
        )}

        <div
          className="inventory-summary spd-summary mb-4 md:mb-5"
          style={{ gridTemplateColumns: "1fr" }}
        >
          <RecurringOrdersEntry
            businessId={businessId}
            variant="summary-cell"
            supplierId={supplier.id}
            supplierName={supplier.name}
            from="supplier"
          />
        </div>

        <div className="spd-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className="spd-tab"
              data-active={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              <Icon name={t.icon} size={17} />
              {t.label}
              <span className="spd-tab-count">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="spl-tabpanel mt-4" key={tab}>
          {tab === "products" && (
            <>
              <div className="spf-toolbar mb-4">
                <div className="spd-toolbar-row">
                  <div className="spf-search">
                    <Icon name="search" size={18} className="spf-search-icon" />
                    <input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="חיפוש לפי שם, ברקוד או קטגוריה..."
                      className="spf-search-input"
                      aria-label="חיפוש מוצר בספק"
                    />
                    {productSearch && (
                      <button
                        type="button"
                        className="spf-search-x"
                        onClick={() => setProductSearch("")}
                        aria-label="ניקוי חיפוש"
                      >
                        <Icon name="close" size={15} />
                      </button>
                    )}
                  </div>
                  <span className="spl-result">
                    <b>{filteredProducts.length}</b>
                    <span>מתוך {groupedProducts.length}</span>
                  </span>
                </div>

                {groupedProducts.length > 0 && (
                  <div className="spd-pbar">
                    <div className="spd-sorts" role="group" aria-label="סינון לפי קטגוריה">
                      <button
                        type="button"
                        className="spd-sort"
                        data-active={categoryFilter === null}
                        onClick={() => setCategoryFilter(null)}
                      >
                        <Icon name="apps" size={14} />
                        הכל
                        <span className="spd-sort-count">{groupedProducts.length}</span>
                      </button>
                      {productCategories.noneCount > 0 && (
                        <button
                          type="button"
                          className="spd-sort"
                          data-active={categoryFilter === CAT_FILTER_NONE}
                          onClick={() =>
                            setCategoryFilter(categoryFilter === CAT_FILTER_NONE ? null : CAT_FILTER_NONE)
                          }
                        >
                          <Icon name="label_off" size={14} />
                          ללא קטגוריה
                          <span className="spd-sort-count">{productCategories.noneCount}</span>
                        </button>
                      )}
                      {productCategories.cats.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="spd-sort"
                          data-active={categoryFilter === c.id}
                          onClick={() => setCategoryFilter(categoryFilter === c.id ? null : c.id)}
                        >
                          <Icon name="category" size={14} />
                          {c.name}
                          <span className="spd-sort-count">{c.count}</span>
                        </button>
                      ))}
                    </div>
                    <div className="spd-views" role="group" aria-label="תצוגת המחירון">
                      <button
                        type="button"
                        className="spd-view"
                        data-active={productView === "grid"}
                        onClick={() => setProductView("grid")}
                        title="תצוגת כרטיסים"
                        aria-label="תצוגת כרטיסים"
                      >
                        <Icon name="grid_view" size={16} />
                      </button>
                      <button
                        type="button"
                        className="spd-view"
                        data-active={productView === "rows"}
                        onClick={() => setProductView("rows")}
                        title="תצוגת שורות"
                        aria-label="תצוגת שורות"
                      >
                        <Icon name="view_list" size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {productsLoading ? (
                <SkeletonCards />
              ) : !groupedProducts.length ? (
                <EmptyState
                  icon="sell"
                  title="אין מוצרים במחירון"
                  description="שייכו מוצרים לספק וקבעו מחיר ליחידה — הם יופיעו כאן וגם בהזמנות."
                  action={
                    <Button icon="sell" onClick={() => navigate(`/suppliers/${supplier.id}/edit`)}>
                      עריכת מחירון
                    </Button>
                  }
                />
              ) : filteredProducts.length === 0 ? (
                <EmptyState
                  icon="search_off"
                  title="לא נמצאו מוצרים"
                  description={
                    categoryFilter
                      ? "אין מוצרים בקטגוריה זו — נסו קטגוריה אחרת או נקו את הסינון."
                      : "נסו מילת חיפוש אחרת."
                  }
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setProductSearch("");
                        setCategoryFilter(null);
                      }}
                    >
                      ניקוי סינון
                    </Button>
                  }
                />
              ) : productView === "grid" ? (
                <ul className="spd-pgrid">
                  {filteredProducts.map((p, i) => (
                    <SupplierProductCard
                      key={p.item_id}
                      product={p}
                      index={i}
                      stockKnown={stockKnown}
                      draft={cart[p.item_id]}
                      onOpenItem={() => navigate(`/inventory/items/${p.item_id}/edit`)}
                      onEditPrice={() => navigate(`/suppliers/${supplier.id}/edit`)}
                      onStep={(delta) => stepCart(p.item_id, delta)}
                    />
                  ))}
                </ul>
              ) : (
                <ul className="spl-list">
                  {filteredProducts.map((p) => (
                    <SupplierProductRow
                      key={p.item_id}
                      product={p}
                      stockKnown={stockKnown}
                      draft={cart[p.item_id]}
                      onOpenItem={() => navigate(`/inventory/items/${p.item_id}/edit`)}
                      onStep={(delta) => stepCart(p.item_id, delta)}
                    />
                  ))}
                </ul>
              )}
            </>
          )}

          {tab === "orders" &&
            (ordersLoading ? (
              <SkeletonOrderCards />
            ) : !supplierOrderBatches.length ? (
              <EmptyState
                icon="local_shipping"
                title="אין הזמנות"
                description="בחרו מוצרים בטאב «מחירון» ושלחו הזמנה — היא תופיע כאן וגם במלאי."
                action={
                  <Button icon="sell" onClick={() => setTab("products")}>
                    הזמנה מהמחירון
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col gap-5">
                {openSupplierOrders.length > 0 && (
                  <OrderBatchListSection
                    title="הזמנות פתוחות"
                    icon="local_shipping"
                    batches={openSupplierOrders}
                    canManageOrders
                    canSeePrices
                    supplierPriceIndex={supplierPriceIndex}
                    suppliers={supplier ? [supplier] : []}
                    onDetails={openOrderDetails}
                    onEdit={openEditOrder}
                    onDelete={handleDeleteOrder}
                    onPdf={handleOrderPdf}
                    pdfBusyBatchId={pdfBusyBatchId}
                    getBatchPartialUiState={resolveBatchPartialUiState}
                    footChipLabel={deliveryDaysLabel(supplier.delivery_days)}
                    footChipIcon="local_shipping"
                  />
                )}
                {receivedSupplierOrders.length > 0 && (
                  <OrderBatchListSection
                    title="הזמנות שהתקבלו"
                    icon="check_circle"
                    batches={receivedSupplierOrders}
                    canManageOrders
                    canSeePrices
                    supplierPriceIndex={supplierPriceIndex}
                    suppliers={supplier ? [supplier] : []}
                    received
                    onDetails={openOrderDetails}
                    onEdit={openEditOrder}
                    onDelete={handleDeleteOrder}
                    onPdf={handleOrderPdf}
                    pdfBusyBatchId={pdfBusyBatchId}
                    footChipLabel={deliveryDaysLabel(supplier.delivery_days)}
                    footChipIcon="local_shipping"
                  />
                )}
              </div>
            ))}

          {tab === "receipts" &&
            (receiptsLoading ? (
              <SkeletonRows />
            ) : !receipts?.length ? (
              <EmptyState icon="receipt_long" title="אין מסמכים" description="עדיין לא שויכו מסמכים לספק זה." />
            ) : (
              <ul className="spl-list">
                {receipts.map((r) => (
                  <li key={r.id} className="spl-row">
                    <span className="spl-row-thumb spl-row-thumb--doc">
                      <Icon name="receipt_long" size={17} />
                    </span>
                    <span className="spl-row-main">
                      <b>{RECEIPT_TYPE_LABELS[r.type as keyof typeof RECEIPT_TYPE_LABELS]}</b>
                      <em>{formatWhen(r.created_at)}</em>
                    </span>
                    <span className="spl-row-price">{formatCurrency(Number(r.amount))}</span>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </div>

      {cartLines.length > 0 && (
        <div className="ordc-bar spd-cartbar">
          <div className="ordc-bar-row">
            <button type="button" className="ordc-bar-summary" onClick={() => setCartOpen(true)}>
              <span className="ordc-bar-thumbs">
                {cartLines.slice(0, 3).map((l) => (
                  <span key={l.product.item_id} className="ordc-bar-thumb">
                    {l.product.item_image_url ? (
                      <img src={l.product.item_image_url} alt="" />
                    ) : (
                      <Icon name="inventory_2" size={14} />
                    )}
                  </span>
                ))}
              </span>
              <span className="ordc-bar-meta">
                <b key={cartLines.length}>
                  {cartLines.length} מוצרים{cartTotal > 0 ? ` · ${formatCurrency(cartTotal)}` : ""}
                </b>
                <span>הזמנה מ־{supplier.name} · לעריכת כמויות</span>
              </span>
              <Icon name="expand_less" size={18} className="text-text-3" />
            </button>
            <Button className="shrink-0 !bg-ink !px-5" icon="arrow_back" onClick={openReview}>
              הבא
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title="עריכת ההזמנה"
        subtitle={`${cartLines.length} מוצרים · ${supplier.name}`}
        icon="edit_note"
        maxWidth={520}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCartOpen(false)}>
              המשך בחירה
            </Button>
            <Button className="flex-1 !bg-ink" icon="arrow_back" disabled={!cartLines.length} onClick={openReview}>
              הבא לסיכום ({cartLines.length})
            </Button>
          </>
        }
      >
        <div className="spd-cart">
          <div className="spd-cart-supplier">
            <span className="spd-cart-supplier-ico" aria-hidden>
              <Icon name="local_shipping" size={17} />
            </span>
            <span className="spd-cart-supplier-body">
              <b>{supplier.name}</b>
              <span>אספקה: {deliveryDaysLabel(supplier.delivery_days)}</span>
              <span>הזמנה: {orderDaysLabel(supplier.order_days)}</span>
            </span>
            <span className="spd-cart-supplier-tag">
              <Icon name="lock" size={12} />
              ספק ההזמנה
            </span>
          </div>

          {cartLines.map((l) => (
            <div key={l.product.item_id} className="spd-cart-line">
              <div className="spd-cart-line-head">
                <span className="ordc-cart-thumb">
                  {l.product.item_image_url ? (
                    <img src={l.product.item_image_url} alt="" />
                  ) : (
                    <Icon name="inventory_2" size={16} />
                  )}
                </span>
                <span className="spd-cart-line-info">
                  <b>{l.product.item_name}</b>
                  <span>
                    במלאי {formatQtyWithPieces(l.item.current_qty, l.item.unit, l.item.units_per_package)}
                    {l.product.prices.main != null
                      ? ` · ${formatPrice(l.product.prices.main)} ל${supplierPriceUnitLabel("main", l.product.item_unit)}`
                      : ""}
                  </span>
                </span>
                <button
                  type="button"
                  className="ordc-cart-remove"
                  onClick={() => dropFromCart(l.product.item_id)}
                  aria-label={`הסרת ${l.product.item_name}`}
                >
                  <Icon name="delete" size={16} />
                </button>
              </div>
              <QtyEditor
                dense
                item={l.item}
                draft={l.draft}
                onPatch={(patch) => patchCart(l.product.item_id, patch)}
              />
              {l.sum > 0 && (
                <p className="spd-cart-line-sum">
                  סה״כ שורה: <b>{formatCurrency(l.sum)}</b>
                </p>
              )}
            </div>
          ))}

          {cartTotal > 0 && (
            <div className="spd-cart-total">
              <span>סה״כ משוער</span>
              <b>{formatCurrency(cartTotal)}</b>
            </div>
          )}

          <button type="button" className="ordc-clear" onClick={() => setCart({})}>
            ניקוי ההזמנה
          </button>
        </div>
      </Modal>

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="סיכום הזמנה"
        subtitle={`${cartLines.length} מוצרים לפני שליחה`}
        icon="fact_check"
        maxWidth={560}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setReviewOpen(false);
                setCartOpen(true);
              }}
            >
              חזרה לעריכה
            </Button>
            <Button
              className="flex-1 !bg-ink"
              icon="send"
              loading={orderBusy}
              disabled={!cartLines.length}
              onClick={() => void submitOrder()}
            >
              שליחת הזמנה
            </Button>
          </>
        }
      >
        <div className="spd-review">
          <div className="spd-review-supplier">
            <span className="spd-review-supplier-ico" aria-hidden>
              <Icon name="local_shipping" size={20} />
            </span>
            <span className="spd-review-supplier-body">
              <b>{supplier.name}</b>
              <span>
                אספקה: {deliveryDaysLabel(supplier.delivery_days)}
                {" · "}
                הזמנה: {orderDaysLabel(supplier.order_days)}
                {supplier.phone ? ` · ${supplier.phone}` : ""}
              </span>
            </span>
          </div>

          <ul className="spd-review-lines">
            {cartLines.map((l) => (
              <li key={l.product.item_id} className="spd-review-line">
                <span className="spd-review-thumb">
                  {l.product.item_image_url ? (
                    <img src={l.product.item_image_url} alt="" />
                  ) : (
                    <Icon name="inventory_2" size={18} />
                  )}
                </span>
                <span className="spd-review-main">
                  <b>{l.product.item_name}</b>
                  <span>{draftLabel(l.item, l.draft)}</span>
                  {l.product.prices.main != null && (
                    <em>
                      {formatPrice(l.product.prices.main)} ל{supplierPriceUnitLabel("main", l.product.item_unit)}
                    </em>
                  )}
                </span>
                <span className="spd-review-sum">{l.sum > 0 ? formatCurrency(l.sum) : "—"}</span>
              </li>
            ))}
          </ul>

          <div className="spd-review-stats">
            <div className="spd-review-stat">
              <span>מספר פריטים</span>
              <b>{cartLines.length}</b>
            </div>
            {cartTotal > 0 && (
              <div className="spd-review-stat spd-review-stat--total">
                <span>סה״כ הזמנה</span>
                <b>{formatCurrency(cartTotal)}</b>
              </div>
            )}
          </div>

          <p className="spd-review-note">
            <Icon name="info" size={15} />
            לאחר השליחה ההזמנה תופיע בטאב «הזמנות» של הספק ובמלאי.
          </p>

          {orderError && (
            <p className="spd-cart-alert" role="alert">
              <Icon name="error" size={15} />
              {orderError}
            </p>
          )}
        </div>
      </Modal>

      <SupplierDetailsSheet
        supplier={supplier}
        open={editField !== null}
        field={editField ?? "name"}
        onClose={() => setEditField(null)}
        onSaved={flashSaved}
      />

      <LoadingOverlay
        show={orderBusy || !!pdfBusyBatchId}
        label={orderBusy ? `שולח הזמנה ל${supplier.name}...` : "מכין מסמך הזמנה..."}
      />
    </div>
  );
}

function SkeletonOrderCards() {
  return (
    <div className="inventory-orders-cards">
      {[0, 1].map((i) => (
        <div key={i} className="skeleton inventory-order-card" style={{ minHeight: 120 }} />
      ))}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="spl-list">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton spl-skel" />
      ))}
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="spd-pgrid">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="skeleton spd-pskel" />
      ))}
    </div>
  );
}
