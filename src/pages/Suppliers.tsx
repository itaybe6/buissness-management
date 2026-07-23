import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button, EmptyState, ErrorState, Icon, PageLoader } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useBusinessId, formatCurrency } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import {
  useDeleteSupplier,
  useSupplierItemPriceIndex,
  useSupplierItems,
  useSupplierOrderBatches,
  useSupplierReceipts,
  useSuppliers,
  supplierSaveError,
  type SupplierWithStats,
} from "@/api/suppliers";
import { useInventory } from "@/api/inventory";
import { RECEIPT_TYPE_LABELS } from "@/pages/agreements/types";

type StatusFilter = "all" | "active" | "inactive";
type SortKey = "name" | "products" | "orders";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "active", label: "פעילים" },
  { key: "inactive", label: "לא פעילים" },
];

const SORTS: { key: SortKey; label: string; icon: string }[] = [
  { key: "name", label: "א-ת", icon: "sort_by_alpha" },
  { key: "products", label: "הכי הרבה מוצרים", icon: "inventory_2" },
  { key: "orders", label: "הזמנות פתוחות", icon: "local_shipping" },
];

/** Thumbnails shown in a card's price-list strip. */
const STRIP_MAX = 6;

type SupplierMeta = {
  /** Sum of the supplier's own unit prices — the "size" of its price list. */
  total: number;
  thumbs: { id: string; url: string | null; name: string }[];
};

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

export function Suppliers() {
  const businessId = useBusinessId();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canManage = !!(profile && ["manager", "office_manager"].includes(profile.role));

  const { data: suppliers, isLoading, isError, error, refetch } = useSuppliers(businessId);
  const { data: priceIndex } = useSupplierItemPriceIndex(businessId);
  const { data: inventory } = useInventory(businessId);
  const del = useDeleteSupplier(businessId);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [sort, setSort] = useState<SortKey>("name");
  const [detail, setDetail] = useState<SupplierWithStats | null>(null);
  const [toDelete, setToDelete] = useState<SupplierWithStats | null>(null);

  const itemMeta = useMemo(() => new Map((inventory ?? []).map((i) => [i.id, i])), [inventory]);

  /** supplier → price-list total + a few product thumbnails (images first). */
  const supplierMeta = useMemo(() => {
    const out = new Map<string, SupplierMeta>();
    if (!priceIndex) return out;
    for (const [sid, lines] of priceIndex) {
      let total = 0;
      const all: { id: string; url: string | null; name: string }[] = [];
      for (const [itemId, price] of lines) {
        total += price;
        const it = itemMeta.get(itemId);
        if (it) all.push({ id: itemId, url: it.image_url, name: it.name });
      }
      all.sort((a, b) => Number(!!b.url) - Number(!!a.url));
      out.set(sid, { total, thumbs: all.slice(0, STRIP_MAX) });
    }
    return out;
  }, [priceIndex, itemMeta]);

  const heroStats = useMemo(() => {
    const list = suppliers ?? [];
    return {
      total: list.length,
      active: list.filter((s) => s.active).length,
      products: list.reduce((a, s) => a + s.product_count, 0),
      openLines: list.reduce((a, s) => a + s.open_order_lines, 0),
    };
  }, [suppliers]);

  const statusCounts = useMemo(() => {
    const list = suppliers ?? [];
    return {
      all: list.length,
      active: list.filter((s) => s.active).length,
      inactive: list.filter((s) => !s.active).length,
    };
  }, [suppliers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (suppliers ?? []).filter((s) => {
      if (statusFilter === "active" && !s.active) return false;
      if (statusFilter === "inactive" && s.active) return false;
      if (!q) return true;
      const hay = [s.name, s.phone ?? "", s.tax_id ?? "", s.notes ?? ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
    const sorted = [...rows];
    if (sort === "products") sorted.sort((a, b) => b.product_count - a.product_count || a.name.localeCompare(b.name, "he"));
    else if (sort === "orders") sorted.sort((a, b) => b.open_order_lines - a.open_order_lines || a.name.localeCompare(b.name, "he"));
    else sorted.sort((a, b) => a.name.localeCompare(b.name, "he"));
    return sorted;
  }, [suppliers, search, statusFilter, sort]);

  if (!canManage) return <Navigate to="/inventory" replace />;
  if (!businessId) {
    return <EmptyState icon="store" title="לא משויך לעסק" description="פנו למנהל המערכת לשיוך לעסק." />;
  }
  if (isLoading) return <PageLoader label="טוען ספקים..." />;
  if (isError) return <ErrorState message={supplierSaveError(error)} onRetry={refetch} />;

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      setToDelete(null);
      if (detail?.id === toDelete.id) setDetail(null);
    } catch (e) {
      window.alert(supplierSaveError(e));
    }
  }

  const noSuppliers = (suppliers?.length ?? 0) === 0;

  return (
    <div className="spf-page page-enter">
      {/* ── Ink hero ── */}
      <header className="spf-hero">
        <span className="spf-glow spf-glow--1" aria-hidden />
        <span className="spf-glow spf-glow--2" aria-hidden />
        <span className="spf-grid-lines" aria-hidden />

        <div className="spf-hero-inner">
          <div className="spl-hero-top">
            <div className="min-w-0">
              <span className="spf-hero-tag">
                <Icon name="local_shipping" size={14} />
                ניהול ספקים
              </span>
              <h1 className="spl-hero-title">ספקים</h1>
              <p className="spl-hero-sub">
                כל מי שמספק לעסק — עם המחירון שלו, ההזמנות הפתוחות והמסמכים הפיננסיים.
              </p>
            </div>
            <Link to="/suppliers/new" className="spl-cta">
              <Icon name="add" size={19} />
              ספק חדש
            </Link>
          </div>

          <div className="spf-hero-stats spf-hero-stats--4">
            <div className="spf-stat">
              <span className="spf-stat-label">סה״כ ספקים</span>
              <b className="spf-stat-value" key={`t${heroStats.total}`}>
                {heroStats.total}
              </b>
            </div>
            <div className="spf-stat">
              <span className="spf-stat-label">פעילים</span>
              <b className="spf-stat-value" key={`a${heroStats.active}`}>
                {heroStats.active}
              </b>
            </div>
            <div className="spf-stat">
              <span className="spf-stat-label">מוצרים במחירונים</span>
              <b className="spf-stat-value" key={`p${heroStats.products}`}>
                {heroStats.products}
              </b>
            </div>
            <div className="spf-stat" data-tone={heroStats.openLines > 0 ? "warn" : undefined}>
              <span className="spf-stat-label">שורות פתוחות</span>
              <b className="spf-stat-value" key={`o${heroStats.openLines}`}>
                {heroStats.openLines}
              </b>
            </div>
          </div>
        </div>
      </header>

      <div className="spf-body">
        {/* ── Sticky filters ── */}
        <div className="spf-toolbar">
          <div className="spf-toolbar-top">
            <div className="spf-search">
              <Icon name="search" size={18} className="spf-search-icon" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש לפי שם, טלפון, ח.פ..."
                className="spf-search-input"
                aria-label="חיפוש ספק"
              />
              {search && (
                <button type="button" className="spf-search-x" onClick={() => setSearch("")} aria-label="ניקוי חיפוש">
                  <Icon name="close" size={15} />
                </button>
              )}
            </div>
            <span className="spl-result">
              <b>{filtered.length}</b>
              <span>מתוך {statusCounts.all}</span>
            </span>
          </div>

          <div className="spf-chips">
            {STATUS_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className="spf-chip"
                data-active={statusFilter === key}
                onClick={() => setStatusFilter(key)}
              >
                {label}
                <span className="spf-chip-count">{statusCounts[key]}</span>
              </button>
            ))}
            <span className="spl-chip-sep" aria-hidden />
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                className="spf-chip"
                data-active={sort === s.key}
                onClick={() => setSort(s.key)}
              >
                <Icon name={s.icon} size={14} />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Cards ── */}
        {filtered.length === 0 ? (
          <EmptyState
            icon="local_shipping"
            title={noSuppliers ? "עדיין אין ספקים" : "לא נמצאו ספקים"}
            description={
              noSuppliers
                ? "הוסיפו ספקים קבועים כדי לקשר אליהם מחירונים, הזמנות וחשבוניות."
                : "נסו חיפוש אחר או שנו את הסינון."
            }
            action={
              noSuppliers ? (
                <Link to="/suppliers/new">
                  <Button icon="add">ספק ראשון</Button>
                </Link>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                  }}
                >
                  ניקוי סינון
                </Button>
              )
            }
          />
        ) : (
          <div className="spl-grid">
            {filtered.map((s, i) => (
              <SupplierCard
                key={s.id}
                supplier={s}
                meta={supplierMeta.get(s.id)}
                index={i}
                onOpen={() => setDetail(s)}
                onEdit={() => navigate(`/suppliers/${s.id}/edit`)}
                onDelete={() => setToDelete(s)}
              />
            ))}
          </div>
        )}
      </div>

      <SupplierDetailModal
        supplier={detail}
        meta={detail ? supplierMeta.get(detail.id) : undefined}
        businessId={businessId}
        onClose={() => setDetail(null)}
        onEdit={() => {
          if (!detail) return;
          const id = detail.id;
          setDetail(null);
          navigate(`/suppliers/${id}/edit`);
        }}
        onDelete={() => detail && setToDelete(detail)}
      />

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="מחיקת ספק" icon="delete" maxWidth={400}>
        <p className="text-[14px] leading-relaxed text-text-2">
          למחוק את «{toDelete?.name}»? קישורים קיימים להזמנות ולמסמכים יישארו ללא ספק משויך.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setToDelete(null)}>
            ביטול
          </Button>
          <Button variant="danger" loading={del.isPending} onClick={confirmDelete}>
            מחיקה
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Card                                                              */
/* ---------------------------------------------------------------- */
function SupplierCard({
  supplier: s,
  meta,
  index,
  onOpen,
  onEdit,
  onDelete,
}: {
  supplier: SupplierWithStats;
  meta: SupplierMeta | undefined;
  index: number;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const thumbs = meta?.thumbs ?? [];
  const rest = Math.max(0, s.product_count - thumbs.length);

  return (
    <article
      className="spl-card"
      data-inactive={!s.active}
      style={{ animationDelay: `${Math.min(index, 14) * 35}ms` }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        // Only the card itself — never a key press bubbling up from an action button.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span className="spl-card-edge" aria-hidden />

      <div className="spl-card-head">
        <span className="spl-mono" aria-hidden>
          {monogram(s.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="spl-card-name">{s.name}</h3>
          <p className="spl-card-meta">
            {s.phone ? (
              <span>
                <Icon name="call" size={13} />
                {s.phone}
              </span>
            ) : null}
            {s.tax_id ? (
              <span>
                <Icon name="badge" size={13} />
                {s.tax_id}
              </span>
            ) : null}
            {!s.phone && !s.tax_id && <span className="spl-card-meta-empty">לא הוזנו פרטי קשר</span>}
          </p>
        </div>

        <div className="spl-card-flags">
          {!s.active && <span className="spl-flag">לא פעיל</span>}
          {s.open_order_lines > 0 && (
            <span className="spl-flag spl-flag--live">
              <i aria-hidden />
              {s.open_order_lines} פתוחות
            </span>
          )}
        </div>
      </div>

      {/* Price-list preview */}
      <div className="spl-strip" data-empty={thumbs.length === 0}>
        {thumbs.length === 0 ? (
          <span className="spl-strip-empty">
            <Icon name="sell" size={15} />
            עדיין אין מחירון לספק הזה
          </span>
        ) : (
          <>
            <span className="spl-strip-thumbs">
              {thumbs.map((t) => (
                <span key={t.id} className="spl-thumb" title={t.name}>
                  {t.url ? <img src={t.url} alt="" loading="lazy" /> : <Icon name="inventory_2" size={14} />}
                </span>
              ))}
              {rest > 0 && <span className="spl-thumb spl-thumb--more">+{rest}</span>}
            </span>
            {meta && meta.total > 0 && <span className="spl-strip-sum">{formatCurrency(meta.total)}</span>}
          </>
        )}
      </div>

      <div className="spl-card-foot">
        <div className="spl-facts">
          <span>
            <b>{s.product_count}</b>
            מוצרים
          </span>
          <span>
            <b>{s.open_order_lines}</b>
            שורות פתוחות
          </span>
          <span>
            <b>{s.receipt_count}</b>
            מסמכים
          </span>
        </div>

        <div className="spl-card-actions">
          {s.phone && (
            <a
              href={`tel:${s.phone}`}
              className="spl-act"
              onClick={(e) => e.stopPropagation()}
              aria-label={`חיוג ל${s.name}`}
              title="חיוג"
            >
              <Icon name="call" size={16} />
            </a>
          )}
          <button
            type="button"
            className="spl-act"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label={`עריכת ${s.name}`}
            title="עריכה"
          >
            <Icon name="edit" size={16} />
          </button>
          <button
            type="button"
            className="spl-act spl-act--danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={`מחיקת ${s.name}`}
            title="מחיקה"
          >
            <Icon name="delete" size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------- */
/* Detail modal                                                      */
/* ---------------------------------------------------------------- */
type DetailTab = "products" | "orders" | "receipts";

function SupplierDetailModal({
  supplier,
  meta,
  businessId,
  onClose,
  onEdit,
  onDelete,
}: {
  supplier: SupplierWithStats | null;
  meta: SupplierMeta | undefined;
  businessId: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>("products");
  const { data: batches, isLoading: ordersLoading } = useSupplierOrderBatches(businessId, supplier?.id ?? null, !!supplier);
  const { data: receipts, isLoading: receiptsLoading } = useSupplierReceipts(businessId, supplier?.id ?? null, !!supplier);
  const { data: linkedProducts, isLoading: productsLoading } = useSupplierItems(businessId, supplier?.id ?? null, !!supplier);

  if (!supplier) return null;

  const tabs: { key: DetailTab; label: string; icon: string; count: number }[] = [
    { key: "products", label: "מחירון", icon: "sell", count: supplier.product_count },
    { key: "orders", label: "הזמנות", icon: "local_shipping", count: batches?.length ?? 0 },
    { key: "receipts", label: "מסמכים", icon: "receipt_long", count: supplier.receipt_count },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      maxWidth={620}
      hero={
        <div className="spl-mhero">
          <span className="spf-glow spf-glow--1" aria-hidden />
          <span className="spf-grid-lines" aria-hidden />
          <div className="spl-mhero-id">
            <span className="spl-mono spl-mono--lg" aria-hidden>
              {monogram(supplier.name)}
            </span>
            <div className="min-w-0">
              <h3 className="spl-mhero-name">{supplier.name}</h3>
              <p className="spl-mhero-facts">
                <span className="spl-mhero-state" data-active={supplier.active}>
                  <i aria-hidden />
                  {supplier.active ? "פעיל" : "לא פעיל"}
                </span>
                {supplier.phone && (
                  <a href={`tel:${supplier.phone}`} className="spf-hero-fact">
                    <Icon name="call" size={13} />
                    {supplier.phone}
                  </a>
                )}
                {supplier.tax_id && (
                  <span className="spf-hero-fact">
                    <Icon name="badge" size={13} />
                    {supplier.tax_id}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="spf-hero-stats">
            <div className="spf-stat">
              <span className="spf-stat-label">מוצרים</span>
              <b className="spf-stat-value">{supplier.product_count}</b>
            </div>
            <div className="spf-stat">
              <span className="spf-stat-label">סה״כ מחירון</span>
              <b className="spf-stat-value">{formatCurrency(meta?.total ?? 0)}</b>
            </div>
            <div className="spf-stat" data-tone={supplier.open_order_lines > 0 ? "warn" : undefined}>
              <span className="spf-stat-label">שורות פתוחות</span>
              <b className="spf-stat-value">{supplier.open_order_lines}</b>
            </div>
          </div>
        </div>
      }
      footer={
        <>
          <Button variant="secondary" icon="edit" onClick={onEdit}>
            עריכת ספק
          </Button>
          <Link to={`/inventory?tab=orders&supplier=${supplier.id}`} className="inline-flex">
            <Button variant="secondary" icon="inventory_2">
              הזמנות במלאי
            </Button>
          </Link>
          <Button variant="ghost" icon="delete" className="!text-danger" onClick={onDelete}>
            מחיקה
          </Button>
        </>
      }
    >
      {supplier.notes && (
        <p className="spl-notes">
          <Icon name="sticky_note_2" size={16} />
          {supplier.notes}
        </p>
      )}

      <div className="spl-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className="spl-tab"
            data-active={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            <Icon name={t.icon} size={16} />
            {t.label}
            <span className="spl-tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="spl-tabpanel" key={tab}>
        {tab === "products" &&
          (productsLoading ? (
            <SkeletonRows />
          ) : !linkedProducts?.length ? (
            <EmptyLine text="לא שויכו מוצרים. ניתן להוסיף בעריכת הספק." />
          ) : (
            <ul className="spl-list">
              {linkedProducts.map((p) => (
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
                  <span className="spl-row-price">{formatCurrency(Number(p.unit_price))}</span>
                </li>
              ))}
            </ul>
          ))}

        {tab === "orders" &&
          (ordersLoading ? (
            <SkeletonRows />
          ) : !batches?.length ? (
            <EmptyLine text="אין הזמנות מקושרות לספק זה." />
          ) : (
            <ul className="spl-list">
              {batches.slice(0, 10).map((b) => (
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
            <EmptyLine text="אין מסמכים מקושרים. ניתן לקשר בעת העלאת חשבונית במסמכים." />
          ) : (
            <ul className="spl-list">
              {receipts.slice(0, 10).map((r) => (
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
    </Modal>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="spl-empty-line">
      <Icon name="info" size={16} />
      {text}
    </p>
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
