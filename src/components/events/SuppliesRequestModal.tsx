import { useMemo, useState } from "react";
import { Button, Field, Icon, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useInventoryCategories } from "@/api/inventoryCategories";
import {
  notifyEventRequestCreated,
  useCatalogItems,
  useCreateEventRequest,
  type CatalogItem,
} from "@/api/eventRequests";
import { formatQty } from "@/lib/eventRequests";
import type { EventRecord, EventSupplyLine } from "@/types/database";

const MAX_QTY = 999;
/** Catalog rows rendered before the search asks the user to narrow down. */
const LIST_LIMIT = 60;

type Draft = Record<string, EventSupplyLine>;

function draftKey(line: Pick<EventSupplyLine, "item_id" | "name">) {
  return line.item_id ?? `free:${line.name.trim().toLocaleLowerCase("he")}`;
}

function QtyStepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <span className="evrq-stepper" data-active={value > 0 || undefined}>
      <button
        type="button"
        className="evrq-stepper-btn"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        aria-label={`פחות ${label}`}
      >
        <Icon name={value <= 1 ? "delete" : "remove"} size={18} />
      </button>
      <span className="evrq-stepper-val">{formatQty(value)}</span>
      <button
        type="button"
        className="evrq-stepper-btn"
        onClick={() => onChange(Math.min(MAX_QTY, value + 1))}
        disabled={value >= MAX_QTY}
        aria-label={`עוד ${label}`}
      >
        <Icon name="add" size={18} />
      </button>
    </span>
  );
}

/**
 * Shopping list for the event: pick products from the business catalog
 * (with quantities) and/or type in anything that is not in the catalog.
 * One search box does both — type, tap a product, or add what you typed
 * as a free item. The manager ticks items off as they are bought.
 */
export function SuppliesRequestModal({
  open,
  onClose,
  businessId,
  event,
}: {
  open: boolean;
  onClose: () => void;
  businessId: string;
  event: EventRecord;
}) {
  const { data: items = [], isLoading } = useCatalogItems(businessId, open);
  const { data: categories = [] } = useInventoryCategories(open ? businessId : null);
  const create = useCreateEventRequest(businessId);

  const [draft, setDraft] = useState<Draft>({});
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name] as const)), [categories]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i] as const)), [items]);

  const trimmed = query.trim();
  const normalized = trimmed.toLocaleLowerCase("he");
  const filtered = useMemo(() => {
    let list = items;
    if (categoryId) list = list.filter((i) => i.category_id === categoryId);
    if (normalized) list = list.filter((i) => i.name.toLocaleLowerCase("he").includes(normalized));
    return list;
  }, [items, categoryId, normalized]);
  const visible = filtered.slice(0, LIST_LIMIT);
  const hiddenCount = filtered.length - visible.length;

  const lines = useMemo(() => Object.values(draft).filter((l) => l.quantity > 0), [draft]);
  const totalPieces = lines.reduce((s, l) => s + l.quantity, 0);

  /** The typed text matches a catalog product exactly → no need for a free item. */
  const exactMatch = normalized ? items.some((i) => i.name.toLocaleLowerCase("he") === normalized) : false;
  const freeAlreadyIn = normalized ? !!draft[`free:${normalized}`] : false;

  /** Categories that actually have products — an empty chip is noise. */
  const usedCategories = useMemo(() => {
    const ids = new Set(items.map((i) => i.category_id).filter(Boolean));
    return categories.filter((c) => ids.has(c.id));
  }, [items, categories]);

  function setQty(line: EventSupplyLine, quantity: number) {
    const key = draftKey(line);
    setDraft((prev) => {
      if (quantity <= 0) {
        const rest = { ...prev };
        delete rest[key];
        return rest;
      }
      return { ...prev, [key]: { ...line, quantity } };
    });
  }

  function addCatalogItem(item: CatalogItem) {
    const existing = draft[item.id];
    setQty(
      { item_id: item.id, name: item.name, quantity: 0, unit: item.unit },
      (existing?.quantity ?? 0) + 1,
    );
  }

  function addFreeItem() {
    const name = trimmed;
    if (!name) return;
    const line: EventSupplyLine = { item_id: null, name, quantity: 0, unit: null };
    const existing = draft[draftKey(line)];
    setQty(line, (existing?.quantity ?? 0) + 1);
    setQuery("");
    setError(null);
  }

  function onSearchEnter() {
    // Enter picks the single visible product, otherwise adds the text as a free item.
    if (visible.length === 1 && normalized) return addCatalogItem(visible[0]);
    if (trimmed && !exactMatch) addFreeItem();
  }

  function reset() {
    setDraft({});
    setQuery("");
    setCategoryId(null);
    setNote("");
    setError(null);
  }

  function close() {
    onClose();
    reset();
  }

  async function submit() {
    setError(null);
    if (lines.length === 0) {
      setError("נא לבחור לפחות פריט אחד לרשימה");
      return;
    }
    setSaving(true);
    try {
      const created = await create.mutateAsync({
        kind: "supplies",
        event_id: event.id,
        note,
        lines,
      });
      notifyEventRequestCreated(created.id);
      close();
    } catch {
      setError("שליחת הרשימה נכשלה. נסו שוב.");
    } finally {
      setSaving(false);
    }
  }

  const hasCatalog = items.length > 0;

  return (
    <Modal
      open={open}
      onClose={close}
      title="רשימת מצרכים לאירוע"
      subtitle={`${event.title} · ${lines.length > 0 ? `${lines.length} פריטים ברשימה` : "מה צריך להזמין?"}`}
      icon="shopping_basket"
      maxWidth={600}
      fullScreenMobile
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            ביטול
          </Button>
          <Button className="flex-1" icon="send" loading={saving} onClick={submit} disabled={lines.length === 0}>
            {lines.length > 0 ? `שליחה למנהל · ${lines.length} פריטים` : "שליחה למנהל"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* ---- Basket ---- */}
        <section className="evrq-basket" aria-label="הפריטים שנבחרו" data-empty={lines.length === 0 || undefined}>
          <header className="evrq-basket-head">
            <span className="evrq-basket-icon" aria-hidden>
              <Icon name="shopping_basket" size={16} />
            </span>
            <span className="evrq-basket-title">ברשימה</span>
            {lines.length > 0 ? (
              <>
                <span className="evrq-basket-count">
                  {lines.length} פריטים · {formatQty(totalPieces)} יח׳
                </span>
                <button type="button" className="evrq-basket-clear" onClick={() => setDraft({})}>
                  ניקוי
                </button>
              </>
            ) : (
              <span className="evrq-basket-count">עוד לא נבחר כלום</span>
            )}
          </header>
          {lines.length > 0 && (
            <ul className="evrq-basket-list">
              {lines.map((l) => {
                const item = l.item_id ? itemById.get(l.item_id) : null;
                return (
                  <li key={draftKey(l)} className="evrq-basket-row">
                    <span className="evrq-item-thumb evrq-item-thumb--sm" aria-hidden>
                      {item?.image_url ? (
                        <img src={item.image_url} alt="" loading="lazy" />
                      ) : (
                        <Icon name={l.item_id ? "inventory_2" : "edit"} size={14} />
                      )}
                    </span>
                    <span className="evrq-basket-name">
                      <span className="evrq-basket-name-text">{l.name}</span>
                      <span className="evrq-basket-sub">
                        {l.unit ?? (l.item_id ? "" : "פריט חופשי")}
                      </span>
                    </span>
                    <QtyStepper value={l.quantity} label={l.name} onChange={(v) => setQty(l, v)} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ---- Catalog + free entry ---- */}
        <section className="evrq-block" aria-label="הוספת פריטים">
          <header className="evrq-block-head">
            <h3 className="evrq-block-title">
              <Icon name="add_shopping_cart" size={16} />
              הוספת פריטים
            </h3>
            <span className="evrq-block-sub">
              {hasCatalog ? "חפשו בקטלוג או כתבו כל דבר אחר" : "כתבו מה צריך והקישו Enter"}
            </span>
          </header>

          <div className="evrq-search evrq-search--lg">
            <Icon name="search" size={19} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSearchEnter();
                }
              }}
              placeholder={hasCatalog ? "חיפוש מוצר, או פריט חופשי — קרח, פרחים…" : "קרח, פרחים, בלונים…"}
              aria-label="חיפוש מוצר או פריט חופשי"
              autoComplete="off"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="ניקוי">
                <Icon name="close" size={16} />
              </button>
            )}
          </div>

          {trimmed && !exactMatch && (
            <button type="button" className="evrq-free-add" onClick={addFreeItem} disabled={freeAlreadyIn}>
              <span className="evrq-free-add-icon" aria-hidden>
                <Icon name={freeAlreadyIn ? "check" : "add"} size={16} />
              </span>
              <span className="evrq-free-add-copy">
                <span className="evrq-free-add-title">
                  {freeAlreadyIn ? `״${trimmed}״ כבר ברשימה` : `הוספת ״${trimmed}״ כפריט חופשי`}
                </span>
                <span className="evrq-free-add-sub">
                  {freeAlreadyIn ? "אפשר לשנות כמות למעלה" : "לא חייב להיות בקטלוג — המנהל יראה את זה בדיוק כך"}
                </span>
              </span>
              {!freeAlreadyIn && <span className="evrq-free-add-key">Enter</span>}
            </button>
          )}

          {isLoading ? (
            <p className="evrq-hint">טוען מוצרים…</p>
          ) : hasCatalog ? (
            <div className="evrq-catalog">
              {usedCategories.length > 1 && (
                <div className="evrq-chips" role="tablist" aria-label="קטגוריות">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={categoryId === null}
                    className="evrq-chip"
                    data-active={categoryId === null || undefined}
                    onClick={() => setCategoryId(null)}
                  >
                    הכול
                  </button>
                  {usedCategories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="tab"
                      aria-selected={categoryId === c.id}
                      className="evrq-chip"
                      data-active={categoryId === c.id || undefined}
                      onClick={() => setCategoryId((prev) => (prev === c.id ? null : c.id))}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}

              {visible.length === 0 ? (
                <p className="evrq-hint">
                  {trimmed ? `אין מוצר בקטלוג בשם ״${trimmed}״ — הוסיפו אותו כפריט חופשי למעלה.` : "אין מוצרים בקטגוריה זו."}
                </p>
              ) : (
                <ul className="evrq-catalog-list">
                  {visible.map((item) => {
                    const picked = draft[item.id]?.quantity ?? 0;
                    return (
                      <li key={item.id} className="evrq-item-row" data-active={picked > 0 || undefined}>
                        <button
                          type="button"
                          className="evrq-item-main"
                          onClick={() => addCatalogItem(item)}
                          aria-label={`הוספת ${item.name}`}
                        >
                          <span className="evrq-item-thumb" aria-hidden>
                            {item.image_url ? (
                              <img src={item.image_url} alt="" loading="lazy" />
                            ) : (
                              <Icon name="inventory_2" size={16} />
                            )}
                          </span>
                          <span className="evrq-item-copy">
                            <span className="evrq-item-name">{item.name}</span>
                            <span className="evrq-item-sub">
                              {[item.category_id ? categoryName.get(item.category_id) : null, item.unit]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                        </button>
                        {picked > 0 ? (
                          <QtyStepper
                            value={picked}
                            label={item.name}
                            onChange={(v) =>
                              setQty({ item_id: item.id, name: item.name, quantity: 0, unit: item.unit }, v)
                            }
                          />
                        ) : (
                          <button
                            type="button"
                            className="evrq-item-add"
                            onClick={() => addCatalogItem(item)}
                            aria-label={`הוספת ${item.name}`}
                          >
                            <Icon name="add" size={18} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {hiddenCount > 0 && (
                <p className="evrq-hint">ועוד {hiddenCount} מוצרים — חפשו כדי לצמצם את הרשימה.</p>
              )}
            </div>
          ) : (
            !trimmed && (
              <p className="evrq-hint">
                אין עדיין מוצרים בקטלוג העסק — כתבו למעלה כל פריט שצריך, הוא יישלח למנהל כפריט חופשי.
              </p>
            )
          )}
        </section>

        <Field label="הערה למנהל (אופציונלי)">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="עד מתי צריך, ספק מועדף, כמויות מיוחדות…"
            rows={2}
            className="max-h-[200px] min-h-[64px] resize-y overflow-y-auto leading-relaxed"
          />
        </Field>

        {error && <span className="text-[13px] font-semibold text-danger">{error}</span>}
      </div>
    </Modal>
  );
}
