import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, EmptyState, ErrorState, Icon, Input, PageLoader, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useBusinessId, formatCurrency } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import {
  useSupplierItems,
  useSupplierOrderBatches,
  useSupplierReceipts,
  useSuppliers,
  useUpdateSupplier,
  supplierSaveError,
  supplierPriceUnitLabel,
  supplierPriceListTotal,
  type SupplierItemPrices,
  type SupplierWithStats,
} from "@/api/suppliers";
import { RECEIPT_TYPE_LABELS } from "@/pages/agreements/types";

type DetailTab = "products" | "orders" | "receipts";
/** Which field the details sheet lands on when it opens. */
type EditField = "name" | "phone" | "taxId" | "notes";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function monogram(name: string) {
  const t = name.trim();
  return t ? t[0] : "?";
}

/** 050-1234567 → https://wa.me/972501234567 */
function waHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? `972${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
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
type DetailsDraft = { name: string; phone: string; taxId: string; notes: string; active: boolean };

function draftOf(s: SupplierWithStats): DetailsDraft {
  return {
    name: s.name,
    phone: s.phone ?? "",
    taxId: s.tax_id ?? "",
    notes: s.notes ?? "",
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

        <SheetField icon="sticky_note_2" label="הערות">
          <Textarea
            ref={notesRef}
            className="spf-input spf-textarea"
            rows={3}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="ימי אספקה, איש קשר, תנאי תשלום..."
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

  const [editField, setEditField] = useState<EditField | null>(null);
  const [copied, setCopied] = useState<"phone" | "tax" | null>(null);
  const [flash, setFlash] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const update = useUpdateSupplier(businessId);

  const { data: linkedProducts, isLoading: productsLoading } = useSupplierItems(
    businessId,
    supplier?.id ?? null,
    !!supplier,
  );
  const { data: batches, isLoading: ordersLoading } = useSupplierOrderBatches(
    businessId,
    supplier?.id ?? null,
    !!supplier,
  );
  const { data: receipts, isLoading: receiptsLoading } = useSupplierReceipts(
    businessId,
    supplier?.id ?? null,
    !!supplier,
  );

  /** supplier_items holds one row per price unit — fold them back into products. */
  const groupedProducts = useMemo(() => {
    const map = new Map<
      string,
      {
        item_id: string;
        item_name: string;
        item_unit: string | null;
        item_image_url: string | null;
        prices: SupplierItemPrices;
      }
    >();
    for (const p of linkedProducts ?? []) {
      let row = map.get(p.item_id);
      if (!row) {
        row = {
          item_id: p.item_id,
          item_name: p.item_name,
          item_unit: p.item_unit,
          item_image_url: p.item_image_url,
          prices: {},
        };
        map.set(p.item_id, row);
      }
      if (p.price_unit === "piece") row.prices.piece = Number(p.unit_price);
      else row.prices.main = Number(p.unit_price);
    }
    return [...map.values()];
  }, [linkedProducts]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const rows = groupedProducts;
    if (!q) return rows;
    return rows.filter((p) => p.item_name.toLowerCase().includes(q));
  }, [groupedProducts, productSearch]);

  const priceTotal = useMemo(
    () => groupedProducts.reduce((sum, p) => sum + supplierPriceListTotal(p.prices), 0),
    [groupedProducts],
  );

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function flashSaved() {
    setFlash(true);
    later(() => setFlash(false), 2200);
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
    { key: "orders", label: "הזמנות", icon: "local_shipping", count: batches?.length ?? 0 },
    { key: "receipts", label: "מסמכים", icon: "receipt_long", count: supplier.receipt_count },
  ];

  const stats: { key: string; icon: string; label: string; value: string; tone?: "warn" }[] = [
    { key: "products", icon: "sell", label: "מוצרים במחירון", value: String(productCount) },
    { key: "total", icon: "payments", label: "שווי מחירון", value: formatCurrency(priceTotal) },
    {
      key: "open",
      icon: "local_shipping",
      label: "שורות פתוחות",
      value: String(supplier.open_order_lines),
      tone: supplier.open_order_lines > 0 ? "warn" : undefined,
    },
    { key: "docs", icon: "receipt_long", label: "מסמכים", value: String(supplier.receipt_count) },
  ];

  return (
    <div className="spf-page spd-page page-enter">
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

            <button
              type="button"
              className="spd-state"
              data-active={supplier.active}
              onClick={() => void toggleActive()}
              disabled={update.isPending}
              title="לחצו כדי לשנות סטטוס"
            >
              <i aria-hidden />
              {supplier.active ? "ספק פעיל" : "לא פעיל"}
              <Icon name="cached" size={14} className="spd-state-swap" />
            </button>
          </div>

          {/* ── identity ── */}
          <div className="spd-id">
            <span className="spd-mono" aria-hidden>
              {monogram(supplier.name)}
            </span>
            <div className="spd-id-text">
              <h1 className="spd-name">{supplier.name}</h1>

              <div className="spd-facts">
                {supplier.phone ? (
                  <button
                    type="button"
                    className="spd-fact"
                    data-copied={copied === "phone"}
                    onClick={() => copyFact("phone", supplier.phone!)}
                    title="העתקת מספר הטלפון"
                  >
                    <Icon name="call" size={14} />
                    <span className="spd-fact-val">{supplier.phone}</span>
                    <span className="spd-fact-hint">{copied === "phone" ? "הועתק" : "העתקה"}</span>
                  </button>
                ) : (
                  <button type="button" className="spd-fact spd-fact--add" onClick={() => setEditField("phone")}>
                    <Icon name="add" size={14} />
                    הוספת טלפון
                  </button>
                )}

                {supplier.tax_id ? (
                  <button
                    type="button"
                    className="spd-fact"
                    data-copied={copied === "tax"}
                    onClick={() => copyFact("tax", supplier.tax_id!)}
                    title="העתקת ח.פ"
                  >
                    <Icon name="badge" size={14} />
                    <span className="spd-fact-val">{supplier.tax_id}</span>
                    <span className="spd-fact-hint">{copied === "tax" ? "הועתק" : "העתקה"}</span>
                  </button>
                ) : (
                  <button type="button" className="spd-fact spd-fact--add" onClick={() => setEditField("taxId")}>
                    <Icon name="add" size={14} />
                    הוספת ח.פ
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── actions ── */}
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
            {supplier.phone && (
              <>
                <a
                  className="spd-act spd-act--icon"
                  href={`tel:${supplier.phone}`}
                  title="חיוג לספק"
                  aria-label="חיוג לספק"
                >
                  <Icon name="call" size={18} />
                </a>
                <a
                  className="spd-act spd-act--icon"
                  href={waHref(supplier.phone)}
                  target="_blank"
                  rel="noreferrer"
                  title="וואטסאפ"
                  aria-label="פתיחת וואטסאפ"
                >
                  <Icon name="chat" size={18} />
                </a>
              </>
            )}
          </div>

          {statusError && (
            <p className="spd-hero-alert" role="alert">
              <Icon name="error" size={15} />
              {statusError}
            </p>
          )}

          {/* ── stats ── */}
          <div className="spd-stats">
            {stats.map((s) => (
              <div key={s.key} className="spd-stat" data-tone={s.tone}>
                <Icon name={s.icon} size={16} className="spd-stat-ico" />
                <b className="spd-stat-value">{s.value}</b>
                <span className="spd-stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="spf-body spd-body">
        {/* Notes double as a shortcut into the details sheet */}
        <button
          type="button"
          className={`spd-note${supplier.notes ? "" : " spd-note--empty"}`}
          onClick={() => setEditField("notes")}
        >
          <span className="spd-note-ico" aria-hidden>
            <Icon name="sticky_note_2" size={16} />
          </span>
          <span className="spd-note-body">
            <b>הערות לספק</b>
            <span>{supplier.notes || "ימי אספקה, איש קשר, תנאי תשלום — לחצו להוספה"}</span>
          </span>
          <Icon name={supplier.notes ? "edit" : "add"} size={16} className="spd-note-edit" />
        </button>

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
                      placeholder="חיפוש מוצר במחירון..."
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
              </div>

              {productsLoading ? (
                <SkeletonRows />
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
                  description="נסו מילת חיפוש אחרת."
                  action={
                    <Button variant="secondary" onClick={() => setProductSearch("")}>
                      ניקוי חיפוש
                    </Button>
                  }
                />
              ) : (
                <ul className="spl-list">
                  {filteredProducts.map((p) => (
                    <li key={p.item_id} className="spl-row">
                      <span className="spl-row-thumb">
                        {p.item_image_url ? (
                          <img src={p.item_image_url} alt="" loading="lazy" />
                        ) : (
                          <Icon name="inventory_2" size={17} className="text-text-3" />
                        )}
                      </span>
                      <span className="spl-row-main">
                        <b>{p.item_name}</b>
                        <em>{p.item_unit || "יחידה"}</em>
                      </span>
                      <span className="spd-prices">
                        {p.prices.main != null && (
                          <span className="spd-price">
                            <b>{formatCurrency(p.prices.main)}</b>
                            <em>ל{supplierPriceUnitLabel("main", p.item_unit)}</em>
                          </span>
                        )}
                        {p.prices.piece != null && (
                          <span className="spd-price">
                            <b>{formatCurrency(p.prices.piece)}</b>
                            <em>ל{supplierPriceUnitLabel("piece", p.item_unit)}</em>
                          </span>
                        )}
                        {p.prices.main == null && p.prices.piece == null && (
                          <span className="spd-price spd-price--none">ללא מחיר</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {tab === "orders" &&
            (ordersLoading ? (
              <SkeletonRows />
            ) : !batches?.length ? (
              <EmptyState
                icon="local_shipping"
                title="אין הזמנות"
                description="עדיין לא נוצרו הזמנות מקושרות לספק זה."
                action={
                  <Link to={`/inventory?tab=orders&supplier=${supplier.id}`}>
                    <Button variant="secondary">הזמנות במלאי</Button>
                  </Link>
                }
              />
            ) : (
              <ul className="spl-list">
                {batches.map((b) => (
                  <li key={b.batch_key} className="spl-row spl-row--stack">
                    <span className="spl-row-main">
                      <b>
                        {b.preview_item_names.join(", ")}
                        {b.line_count > b.preview_item_names.length
                          ? ` +${b.line_count - b.preview_item_names.length}`
                          : ""}
                      </b>
                      <em>
                        {formatWhen(b.created_at)} · {b.line_count} פריטים
                      </em>
                    </span>
                    <span className={`spl-pill${b.pending_count > 0 ? " spl-pill--warn" : " spl-pill--ok"}`}>
                      {b.pending_count > 0 ? `${b.pending_count} ממתין` : "התקבל"}
                    </span>
                  </li>
                ))}
              </ul>
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

      <SupplierDetailsSheet
        supplier={supplier}
        open={editField !== null}
        field={editField ?? "name"}
        onClose={() => setEditField(null)}
        onSaved={flashSaved}
      />
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
