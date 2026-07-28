import { useEffect, useMemo, useState } from "react";
import { Button, Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { formatQtyWithPieces, inventoryLineTotal, type ItemWithQty } from "@/api/inventory";
import type { SupplierItemPriceIndex } from "@/api/suppliers";
import {
  defaultSupplierChoice,
  deliveryDayLabel,
  formatPrice,
  itemSupplierChoices,
  orderCalcLabel,
  supplierUnitPrices,
  type SupplierBasics,
  type SupplierChoice,
} from "@/lib/orderSuppliers";
import { QtyEditor, draftLabel, draftTotal, type QtyDraft } from "@/components/inventory/orderDraft";

export interface ProductPick extends QtyDraft {
  supplier_id: string;
}

interface ProductSupplierModalProps {
  item: ItemWithQty | null;
  suppliers: SupplierBasics[];
  priceIndex: SupplierItemPriceIndex | undefined;
  /** Existing cart line for this product, when the user re-opens it. */
  current: ProductPick | null;
  /** Supplier to preselect for a brand-new pick (e.g. arriving from a supplier page). */
  preferredSupplierId?: string | null;
  /**
   * Editing an existing order — every line shares one supplier, so changing it
   * here changes it for the whole order.
   */
  sharedSupplier?: boolean;
  onClose: () => void;
  onConfirm: (pick: ProductPick) => void;
  onRemove: () => void;
}

function SupplierRow({
  choice,
  item,
  selected,
  onSelect,
}: {
  choice: SupplierChoice;
  item: ItemWithQty;
  selected: boolean;
  onSelect: () => void;
}) {
  const unitPrices = supplierUnitPrices(item, choice.prices);

  return (
    <button
      type="button"
      className="opick-sup"
      data-selected={selected}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="opick-sup-mark">
        <Icon name="check" size={14} />
      </span>
      <span className="opick-sup-body">
        <span className="opick-sup-name">
          {choice.name}
          {choice.cheapest && (
            <span className="opick-tag opick-tag--best">
              <Icon name="savings" size={11} />
              הזול ביותר
            </span>
          )}
          {!choice.listed && <span className="opick-tag">לא במחירון</span>}
        </span>
        <span className="opick-sup-meta">
          <Icon name="local_shipping" size={13} />
          אספקה: {deliveryDayLabel(choice.delivery_day)}
        </span>
      </span>
      <span className="opick-sup-price">
        {unitPrices.length > 0 ? (
          unitPrices.map((unitPrice, i) => (
            <span key={unitPrice.label} className="opick-sup-price-row" data-lead={i === 0}>
              <b className="tabular-nums">
                {unitPrice.derived && <span className="opick-sup-approx">≈</span>}
                {formatPrice(unitPrice.price)}
              </b>
              <small>ל{unitPrice.label}</small>
            </span>
          ))
        ) : (
          <small className="opick-sup-price-none">ללא מחיר</small>
        )}
      </span>
    </button>
  );
}

export function ProductSupplierModal({
  item,
  suppliers,
  priceIndex,
  current,
  preferredSupplierId,
  sharedSupplier = false,
  onClose,
  onConfirm,
  onRemove,
}: ProductSupplierModalProps) {
  const open = !!item;
  const [supplierId, setSupplierId] = useState("");
  const [draft, setDraft] = useState<QtyDraft>({ packs: 1, pieces: 0 });
  const [showAll, setShowAll] = useState(false);

  const choices = useMemo(
    () => (item ? itemSupplierChoices(item, suppliers, priceIndex) : []),
    [item, suppliers, priceIndex],
  );
  const listed = useMemo(() => choices.filter((c) => c.listed), [choices]);
  const unlisted = useMemo(() => choices.filter((c) => !c.listed), [choices]);

  // Re-seed the form every time a product is opened.
  useEffect(() => {
    if (!item) return;
    setDraft(current ? { packs: current.packs, pieces: current.pieces } : { packs: 1, pieces: 0 });
    setSupplierId(current?.supplier_id ?? "");
    setShowAll(false);
    // Only re-seed per opened product — not on every re-render of the cart line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  // Prices load asynchronously, so the default supplier is picked once they arrive.
  useEffect(() => {
    if (!item || supplierId || !choices.length) return;
    setSupplierId(defaultSupplierChoice(choices, preferredSupplierId));
  }, [item, supplierId, choices, preferredSupplierId]);

  if (!item) return null;

  const selected = choices.find((c) => c.supplier_id === supplierId) ?? null;
  const quantity = draftTotal(item, draft);
  const lineTotal = inventoryLineTotal(item, quantity, selected?.unit_price ?? 0);
  const calcLabel = orderCalcLabel(item, draft, selected?.prices);
  const visibleUnlisted = showAll || listed.length === 0 ? unlisted : [];
  const canConfirm = !!supplierId && quantity > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={520}
      hero={
        <div className="opick-hero">
          <div className="opick-hero-media">
            {item.image_url ? (
              <img src={item.image_url} alt={item.name} />
            ) : (
              <span className="opick-hero-fallback">
                <Icon name="inventory_2" size={34} />
              </span>
            )}
          </div>
          <div className="opick-hero-info">
            <h2 className="opick-hero-name">{item.name}</h2>
            <div className="opick-hero-chips">
              <span className="opick-chip">
                <Icon name="inventory_2" size={12} />
                במלאי {formatQtyWithPieces(item.current_qty, item.unit, item.units_per_package)}
              </span>
              {item.ordered_qty > 0 && (
                <span className="opick-chip opick-chip--info">
                  <Icon name="local_shipping" size={12} />
                  {item.ordered_qty} בהזמנה
                </span>
              )}
              {item.barcode && (
                <span className="opick-chip font-mono tabular-nums" dir="ltr">
                  {item.barcode}
                </span>
              )}
            </div>
          </div>
        </div>
      }
      footer={
        <>
          {current && (
            <button type="button" className="opick-drop" onClick={onRemove}>
              <Icon name="delete" size={16} />
              הסרה
            </button>
          )}
          <Button
            className="flex-1 !bg-ink active:scale-[0.98]"
            icon={current ? "check" : "add_shopping_cart"}
            disabled={!canConfirm}
            onClick={() => onConfirm({ supplier_id: supplierId, packs: draft.packs, pieces: draft.pieces })}
          >
            {current ? "עדכון ההזמנה" : "הוספה להזמנה"}
            {lineTotal > 0 && <span className="tabular-nums opacity-80">· {formatPrice(lineTotal)}</span>}
          </Button>
        </>
      }
    >
      <div className="opick-body">
        <section className="opick-sec">
          <div className="opick-sec-head">
            <span className="opick-sec-title">
              <Icon name="storefront" size={15} />
              מאיזה ספק להזמין?
            </span>
            {listed.length > 0 && <span className="opick-sec-count">{listed.length}</span>}
          </div>

          {sharedSupplier && (
            <p className="opick-note">
              <Icon name="info" size={14} />
              בעריכת הזמנה קיימת כל המוצרים משויכים לאותו ספק — שינוי כאן יחול על כל ההזמנה.
            </p>
          )}

          {choices.length === 0 ? (
            <p className="opick-note opick-note--warn">
              <Icon name="warning" size={14} />
              אין ספקים פעילים במערכת. כדי להזמין צריך קודם להוסיף ספק.
            </p>
          ) : (
            <>
              {listed.length === 0 && (
                <p className="opick-note opick-note--warn">
                  <Icon name="warning" size={14} />
                  למוצר הזה אין מחירון אצל אף ספק — אפשר לבחור ספק ידנית, אבל ההזמנה תישלח בלי מחיר.
                </p>
              )}
              <div className="opick-sups">
                {[...listed, ...visibleUnlisted].map((choice) => (
                  <SupplierRow
                    key={choice.supplier_id}
                    choice={choice}
                    item={item}
                    selected={choice.supplier_id === supplierId}
                    onSelect={() => setSupplierId(choice.supplier_id)}
                  />
                ))}
              </div>
              {listed.length > 0 && unlisted.length > 0 && (
                <button type="button" className="opick-more" onClick={() => setShowAll((v) => !v)}>
                  <Icon name={showAll ? "expand_less" : "expand_more"} size={16} />
                  {showAll ? "הסתרת ספקים אחרים" : `ספקים אחרים (${unlisted.length})`}
                </button>
              )}
            </>
          )}
        </section>

        <section className="opick-sec">
          <div className="opick-sec-head">
            <span className="opick-sec-title">
              <Icon name="shopping_basket" size={15} />
              כמה להזמין?
            </span>
          </div>
          <div className="opick-qty">
            <QtyEditor item={item} draft={draft} onPatch={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
          </div>
        </section>

        <div className="opick-sum" data-ready={canConfirm && lineTotal > 0}>
          <div className="opick-sum-line">
            <span className="opick-sum-label">{selected ? selected.name : "לא נבחר ספק"}</span>
            <span className="opick-sum-calc tabular-nums">
              {quantity > 0 ? calcLabel || draftLabel(item, draft) : "בחרו כמות"}
            </span>
          </div>
          <div className="opick-sum-total">
            <span>סה״כ לשורה</span>
            <b className="tabular-nums">{lineTotal > 0 ? formatPrice(lineTotal) : "—"}</b>
          </div>
        </div>
      </div>
    </Modal>
  );
}
