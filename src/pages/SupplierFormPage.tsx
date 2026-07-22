import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { Button, EmptyState, ErrorState, Icon, Input, PageLoader, Textarea } from "@/components/ui";
import { useBusinessId, formatCurrency } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import {
  useCreateSupplier,
  useSaveSupplierItems,
  useSupplierItems,
  useSuppliers,
  useUpdateSupplier,
  supplierSaveError,
} from "@/api/suppliers";
import { useInventory, type ItemWithQty } from "@/api/inventory";
import { useInventoryCategories } from "@/api/inventoryCategories";
import type { Supplier } from "@/types/database";

type ProductLineDraft = { itemId: string; price: string };

type SupplierForm = {
  name: string;
  phone: string;
  taxId: string;
  notes: string;
  active: boolean;
};

const EMPTY_FORM: SupplierForm = {
  name: "",
  phone: "",
  taxId: "",
  notes: "",
  active: true,
};

const NO_CATEGORY = "__none__";

function formFromSupplier(s: Supplier): SupplierForm {
  return {
    name: s.name,
    phone: s.phone ?? "",
    taxId: s.tax_id ?? "",
    notes: s.notes ?? "",
    active: s.active,
  };
}

/** A price is valid only when it parses to a positive number. */
function priceValue(raw: string): number | null {
  const n = parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ---------------------------------------------------------------- */
/* Detail field — icon + label + borderless input inside one shell   */
/* ---------------------------------------------------------------- */
function SpfField({
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
/* Catalog tile                                                      */
/* ---------------------------------------------------------------- */
function ProductTile({
  item,
  line,
  missing,
  onAdd,
  onRemove,
  onFocusPrice,
  onPrice,
  registerPrice,
  registerTile,
}: {
  item: ItemWithQty;
  line: ProductLineDraft | undefined;
  missing: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onFocusPrice: () => void;
  onPrice: (v: string) => void;
  registerPrice: (el: HTMLInputElement | null) => void;
  registerTile: (el: HTMLElement | null) => void;
}) {
  const selected = !!line;
  return (
    <article
      ref={registerTile}
      className="spf-tile"
      data-selected={selected}
      data-missing={selected && missing}
    >
      {/* Body adds the product; once picked it just jumps to the price box,
          so a stray click can never wipe a price that was already typed. */}
      <button
        type="button"
        className="spf-tile-hit"
        onClick={selected ? onFocusPrice : onAdd}
        aria-pressed={selected}
        aria-label={selected ? `מחיר ${item.name}` : `הוספת ${item.name}`}
      >
        <span className="spf-tile-thumb">
          {item.image_url ? (
            <img src={item.image_url} alt="" loading="lazy" />
          ) : (
            <Icon name="inventory_2" size={26} className="text-text-3" />
          )}
        </span>
        <span className="spf-tile-name">{item.name}</span>
        <span className="spf-tile-unit">{item.unit || "יחידה"}</span>
      </button>

      <button
        type="button"
        className="spf-tile-mark"
        tabIndex={selected ? 0 : -1}
        aria-hidden={!selected}
        onClick={selected ? onRemove : undefined}
        aria-label={`הסרת ${item.name}`}
      >
        <Icon name={selected ? "check" : "add"} size={15} className="spf-mark-glyph" />
        {selected && <Icon name="close" size={15} className="spf-mark-glyph-off" />}
      </button>

      <div className="spf-tile-price" aria-hidden={!selected}>
        <span className="spf-tile-currency">₪</span>
        <input
          ref={registerPrice}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          tabIndex={selected ? 0 : -1}
          value={line?.price ?? ""}
          onChange={(e) => onPrice(e.target.value)}
          className="spf-price-input"
          placeholder="0.00"
          aria-label={`מחיר ל${item.unit || "יחידה"} — ${item.name}`}
        />
        <span className="spf-tile-per">/ {item.unit || "יח׳"}</span>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------- */
/* Page                                                              */
/* ---------------------------------------------------------------- */
export function SupplierFormPage() {
  const { supplierId } = useParams<{ supplierId?: string }>();
  const isEdit = !!supplierId;
  const navigate = useNavigate();
  const location = useLocation();
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const canManage = !!(profile && ["manager", "office_manager"].includes(profile.role));

  const { data: suppliers, isLoading: suppliersLoading } = useSuppliers(businessId, { activeOnly: false });
  const { data: inventory, isLoading: inventoryLoading } = useInventory(businessId);
  const { data: categories } = useInventoryCategories(businessId);
  const editing = useMemo(
    () => (supplierId ? suppliers?.find((s) => s.id === supplierId) ?? null : null),
    [suppliers, supplierId],
  );

  const { data: existingItems, isLoading: itemsLoading } = useSupplierItems(
    businessId,
    supplierId ?? null,
    isEdit && !!supplierId,
  );

  const create = useCreateSupplier(businessId);
  const update = useUpdateSupplier(businessId);
  const saveItems = useSaveSupplierItems(businessId);

  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM);
  const [productLines, setProductLines] = useState<ProductLineDraft[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(!isEdit);

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [onlySelected, setOnlySelected] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const priceRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const tileRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    if (!isEdit || !editing) return;
    setForm(formFromSupplier(editing));
    setHydrated(false);
  }, [isEdit, editing?.id]);

  useEffect(() => {
    if (!isEdit || hydrated || !existingItems) return;
    setProductLines(
      existingItems.map((r) => ({
        itemId: r.item_id,
        price: String(r.unit_price),
      })),
    );
    setHydrated(true);
  }, [isEdit, hydrated, existingItems]);

  const inventoryList = useMemo(() => inventory ?? [], [inventory]);

  const lineMap = useMemo(
    () => new Map(productLines.map((l) => [l.itemId, l])),
    [productLines],
  );

  const totals = useMemo(() => {
    let sum = 0;
    let missing = 0;
    for (const l of productLines) {
      const v = priceValue(l.price);
      if (v == null) missing += 1;
      else sum += v;
    }
    return { sum, missing };
  }, [productLines]);

  /** Category chips — only those that actually hold items, with live counts. */
  const categoryChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of inventoryList) {
      const key = it.category_id ?? NO_CATEGORY;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const chips = (categories ?? [])
      .filter((c) => counts.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, color: c.color, count: counts.get(c.id) ?? 0 }));
    const loose = counts.get(NO_CATEGORY) ?? 0;
    if (loose > 0 && chips.length > 0) {
      chips.push({ id: NO_CATEGORY, name: "ללא קטגוריה", color: null, count: loose });
    }
    return chips;
  }, [inventoryList, categories]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventoryList.filter((it) => {
      if (onlySelected && !lineMap.has(it.id)) return false;
      if (categoryId !== "all" && (it.category_id ?? NO_CATEGORY) !== categoryId) return false;
      if (q && !it.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [inventoryList, lineMap, onlySelected, categoryId, query]);

  const selectedItems = useMemo(
    () =>
      productLines
        .map((l) => ({ line: l, item: inventoryList.find((i) => i.id === l.itemId) }))
        .filter((r) => !!r.item) as { line: ProductLineDraft; item: ItemWithQty }[],
    [productLines, inventoryList],
  );

  const loading = !businessId || suppliersLoading || inventoryLoading || (isEdit && (itemsLoading || !hydrated));

  function goBack() {
    if (location.key !== "default") navigate(-1);
    else navigate("/suppliers");
  }

  function toggleItem(id: string) {
    setFormError(null);
    if (lineMap.has(id)) {
      setProductLines((ls) => ls.filter((l) => l.itemId !== id));
      priceRefs.current.delete(id);
    } else {
      setProductLines((ls) => [...ls, { itemId: id, price: "" }]);
      window.setTimeout(() => priceRefs.current.get(id)?.focus(), 90);
    }
  }

  function setPrice(id: string, price: string) {
    setProductLines((ls) => ls.map((l) => (l.itemId === id ? { ...l, price } : l)));
  }

  /** Jump from the basket (or the error banner) straight to a product's price box. */
  function revealPrice(id: string) {
    setQuery("");
    setCategoryId("all");
    window.setTimeout(() => {
      tileRefs.current.get(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
      window.setTimeout(() => priceRefs.current.get(id)?.focus(), 260);
    }, 30);
  }

  function parseProductLines(): { item_id: string; unit_price: number }[] {
    const out: { item_id: string; unit_price: number }[] = [];
    for (const line of productLines) {
      if (!line.itemId) continue;
      const price = priceValue(line.price);
      if (price == null) continue;
      out.push({ item_id: line.itemId, unit_price: price });
    }
    return out;
  }

  async function submitForm() {
    setFormError(null);
    setAttempted(true);
    if (!form.name.trim()) return setFormError("נא להזין שם ספק");
    const firstMissing = productLines.find((l) => priceValue(l.price) == null);
    if (firstMissing) {
      setOnlySelected(true);
      revealPrice(firstMissing.itemId);
      return setFormError("לכל מוצר משויך יש להזין מחיר תקין");
    }
    const itemLines = parseProductLines();
    try {
      let id = editing?.id;
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          name: form.name,
          phone: form.phone,
          tax_id: form.taxId,
          notes: form.notes,
          active: form.active,
        });
      } else {
        const created = await create.mutateAsync({
          business_id: businessId!,
          name: form.name,
          phone: form.phone,
          tax_id: form.taxId,
          notes: form.notes,
        });
        id = created.id;
      }
      if (id) {
        await saveItems.mutateAsync({
          business_id: businessId!,
          supplier_id: id,
          lines: itemLines,
        });
      }
      navigate("/suppliers", { replace: true });
    } catch (e) {
      setFormError(supplierSaveError(e));
    }
  }

  if (!canManage) return <Navigate to="/inventory" replace />;
  if (!businessId) {
    return <EmptyState icon="store" title="לא משויך לעסק" description="פנו למנהל המערכת לשיוך לעסק." />;
  }
  if (isEdit && !suppliersLoading && supplierId && !editing) {
    return <ErrorState message="הספק לא נמצא." onRetry={() => navigate("/suppliers")} />;
  }
  if (loading) return <PageLoader label={isEdit ? "טוען ספק..." : "טוען..."} />;

  const saving = create.isPending || update.isPending || saveItems.isPending;
  const displayName = form.name.trim();
  const monogram = displayName ? displayName[0] : "";

  return (
    <div className="spf-page page-enter">
      {/* ── Ink hero — live identity card ── */}
      <header className="spf-hero">
        <span className="spf-glow spf-glow--1" aria-hidden />
        <span className="spf-glow spf-glow--2" aria-hidden />
        <span className="spf-grid-lines" aria-hidden />

        <div className="spf-hero-inner">
          <div className="spf-hero-bar">
            <button type="button" className="spf-back" onClick={goBack}>
              <Icon name="arrow_forward" size={17} />
              חזרה לספקים
            </button>
            <span className="spf-hero-tag">
              <Icon name={isEdit ? "edit" : "add_business"} size={14} />
              {isEdit ? "עריכת ספק" : "ספק חדש"}
            </span>
          </div>

          <div className="spf-hero-id">
            <div className="spf-mono" data-empty={!monogram}>
              {monogram ? <span>{monogram}</span> : <Icon name="local_shipping" size={28} />}
            </div>
            <div className="min-w-0">
              <h1 className="spf-hero-title" data-placeholder={!displayName}>
                {displayName || "ספק ללא שם"}
              </h1>
              <p className="spf-hero-sub">
                {form.phone || form.taxId ? (
                  <>
                    {form.phone && (
                      <span className="spf-hero-fact">
                        <Icon name="call" size={13} />
                        {form.phone}
                      </span>
                    )}
                    {form.taxId && (
                      <span className="spf-hero-fact">
                        <Icon name="badge" size={13} />
                        {form.taxId}
                      </span>
                    )}
                  </>
                ) : (
                  "פרטי הספק ומחירון המוצרים שהוא מספק"
                )}
              </p>
            </div>
          </div>

          <div className="spf-hero-stats">
            <div className="spf-stat">
              <span className="spf-stat-label">מוצרים במחירון</span>
              <b className="spf-stat-value" key={`c${productLines.length}`}>
                {productLines.length}
              </b>
            </div>
            <div className="spf-stat">
              <span className="spf-stat-label">סה״כ מחירון</span>
              <b className="spf-stat-value" key={`s${totals.sum}`}>
                {formatCurrency(totals.sum)}
              </b>
            </div>
            <div className="spf-stat" data-tone={totals.missing > 0 ? "warn" : undefined}>
              <span className="spf-stat-label">ממתין למחיר</span>
              <b className="spf-stat-value" key={`m${totals.missing}`}>
                {totals.missing}
              </b>
            </div>
          </div>
        </div>
      </header>

      <div className="spf-body">
        <div className="spf-layout">
          {/* ── Details + basket ── */}
          <aside className="spf-aside">
            <section className="spf-card">
              <h2 className="spf-card-title">
                <span className="spf-card-icon">
                  <Icon name="store" size={17} />
                </span>
                פרטים כלליים
              </h2>

              <div className="spf-fields">
                <SpfField icon="badge" label="שם הספק" hint="חובה">
                  <Input
                    className="spf-input"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="לדוגמה: טמפו משקאות"
                    autoFocus={!isEdit}
                    required
                  />
                </SpfField>

                <div className="spf-fields-row">
                  <SpfField icon="call" label="טלפון">
                    <Input
                      className="spf-input"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="050-0000000"
                      inputMode="tel"
                    />
                  </SpfField>
                  <SpfField icon="receipt_long" label="ח.פ / עוסק">
                    <Input
                      className="spf-input"
                      value={form.taxId}
                      onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                      placeholder="000000000"
                      inputMode="numeric"
                    />
                  </SpfField>
                </div>

                <SpfField icon="sticky_note_2" label="הערות">
                  <Textarea
                    className="spf-input spf-textarea"
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="ימי אספקה, איש קשר, תנאי תשלום..."
                  />
                </SpfField>

                {isEdit && (
                  <div className="spf-status">
                    <span className="spf-field-label">סטטוס ספק</span>
                    <div className="spf-seg" role="group" aria-label="סטטוס ספק">
                      <button
                        type="button"
                        data-active={form.active}
                        onClick={() => setForm({ ...form, active: true })}
                      >
                        <Icon name="check_circle" size={15} />
                        פעיל
                      </button>
                      <button
                        type="button"
                        data-active={!form.active}
                        onClick={() => setForm({ ...form, active: false })}
                      >
                        <Icon name="pause_circle" size={15} />
                        לא פעיל
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {formError && (
                <p className="spf-alert" role="alert">
                  <Icon name="error" size={17} />
                  {formError}
                </p>
              )}
            </section>

            <section className="spf-card spf-basket">
              <h2 className="spf-card-title">
                <span className="spf-card-icon">
                  <Icon name="sell" size={17} />
                </span>
                מחירון הספק
                {productLines.length > 0 && <span className="spf-count">{productLines.length}</span>}
              </h2>

              {selectedItems.length === 0 ? (
                <div className="spf-basket-empty">
                  <span className="spf-basket-empty-icon" aria-hidden>
                    <Icon name="add_shopping_cart" size={22} />
                  </span>
                  <p>
                    בחרו מוצרים מהקטלוג
                    <em>המחירים שתזינו נשמרים לספק הזה בלבד, ליחידת המידה הראשית.</em>
                  </p>
                </div>
              ) : (
                <>
                  <ul className="spf-basket-list">
                    {selectedItems.map(({ line, item }) => {
                      const value = priceValue(line.price);
                      return (
                        <li key={line.itemId}>
                          <button type="button" className="spf-basket-row" onClick={() => revealPrice(line.itemId)}>
                            <span className="spf-basket-thumb">
                              {item.image_url ? (
                                <img src={item.image_url} alt="" loading="lazy" />
                              ) : (
                                <Icon name="inventory_2" size={16} className="text-text-3" />
                              )}
                            </span>
                            <span className="spf-basket-name">{item.name}</span>
                            <span className="spf-basket-price" data-empty={value == null}>
                              {value == null ? "הזינו מחיר" : formatCurrency(value)}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="spf-basket-x"
                            onClick={() => toggleItem(line.itemId)}
                            aria-label={`הסרת ${item.name}`}
                          >
                            <Icon name="close" size={14} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="spf-basket-total">
                    <span>סה״כ מחירון</span>
                    <b>{formatCurrency(totals.sum)}</b>
                  </div>
                </>
              )}
            </section>
          </aside>

          {/* ── Catalog ── */}
          <main className="spf-main">
            <div className="spf-toolbar">
              <div className="spf-toolbar-top">
                <div className="spf-search">
                  <Icon name="search" size={18} className="spf-search-icon" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="חיפוש מוצר בקטלוג..."
                    className="spf-search-input"
                    aria-label="חיפוש מוצר"
                  />
                  {query && (
                    <button type="button" className="spf-search-x" onClick={() => setQuery("")} aria-label="ניקוי חיפוש">
                      <Icon name="close" size={15} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="spf-only"
                  data-active={onlySelected}
                  onClick={() => setOnlySelected((v) => !v)}
                  disabled={productLines.length === 0 && !onlySelected}
                >
                  <Icon name={onlySelected ? "filter_alt" : "filter_alt_off"} size={16} />
                  נבחרו
                  <span className="spf-only-count">{productLines.length}</span>
                </button>
              </div>

              {categoryChips.length > 0 && (
                <div className="spf-chips">
                  <button
                    type="button"
                    className="spf-chip"
                    data-active={categoryId === "all"}
                    onClick={() => setCategoryId("all")}
                  >
                    הכל
                    <span className="spf-chip-count">{inventoryList.length}</span>
                  </button>
                  {categoryChips.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="spf-chip"
                      data-active={categoryId === c.id}
                      onClick={() => setCategoryId(c.id)}
                      style={c.color ? ({ ["--chip-tone" as string]: c.color } as React.CSSProperties) : undefined}
                    >
                      <i className="spf-chip-dot" aria-hidden />
                      {c.name}
                      <span className="spf-chip-count">{c.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {inventoryList.length === 0 ? (
              <EmptyState
                icon="inventory_2"
                title="אין מוצרים במלאי"
                description="הוסיפו פריטים בעמוד הסחורות כדי לשייך אותם לספק."
                action={
                  <Link to="/inventory">
                    <Button variant="secondary" icon="arrow_forward">
                      לעמוד הסחורות
                    </Button>
                  </Link>
                }
              />
            ) : visible.length === 0 ? (
              <div className="spf-none">
                <Icon name="search_off" size={28} className="text-text-3" />
                <p>{onlySelected ? "עדיין לא נבחרו מוצרים." : "לא נמצאו מוצרים בסינון הנוכחי."}</p>
                <Button
                  variant="secondary"
                  className="!py-2 !text-[12.5px]"
                  onClick={() => {
                    setQuery("");
                    setCategoryId("all");
                    setOnlySelected(false);
                  }}
                >
                  ניקוי סינון
                </Button>
              </div>
            ) : (
              <div className="spf-grid">
                {visible.map((item, i) => {
                  const line = lineMap.get(item.id);
                  return (
                    <div
                      key={item.id}
                      className="spf-tile-wrap"
                      style={{ animationDelay: `${Math.min(i, 18) * 22}ms` }}
                    >
                      <ProductTile
                        item={item}
                        line={line}
                        missing={attempted && !!line && priceValue(line.price) == null}
                        onAdd={() => toggleItem(item.id)}
                        onRemove={() => toggleItem(item.id)}
                        onFocusPrice={() => priceRefs.current.get(item.id)?.focus()}
                        onPrice={(v) => setPrice(item.id, v)}
                        registerPrice={(el) => {
                          if (el) priceRefs.current.set(item.id, el);
                          else priceRefs.current.delete(item.id);
                        }}
                        registerTile={(el) => {
                          if (el) tileRefs.current.set(item.id, el);
                          else tileRefs.current.delete(item.id);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ── Sticky save bar ── */}
      <div className="spf-foot">
        <div className="spf-foot-info">
          <b>{productLines.length}</b>
          <span>מוצרים · {formatCurrency(totals.sum)}</span>
        </div>
        <div className="spf-foot-actions">
          <Button variant="secondary" onClick={goBack} className="!py-2.5">
            ביטול
          </Button>
          <Button loading={saving} onClick={submitForm} icon="check" className="!py-2.5">
            {isEdit ? "שמירת שינויים" : "יצירת ספק"}
          </Button>
        </div>
      </div>
    </div>
  );
}
