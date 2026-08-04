import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button, EmptyState, ErrorState, Icon, PageLoader } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useBusinessId, formatCurrency } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import {
  useDeleteSupplier,
  useSupplierItemPriceIndex,
  useSuppliers,
  supplierSaveError,
  supplierPriceListTotal,
  type SupplierWithStats,
} from "@/api/suppliers";
import { useInventory } from "@/api/inventory";
import { RecurringOrdersEntry } from "@/components/inventory/RecurringOrdersEntry";

/** Thumbnails shown in a card's price-list strip. */
const STRIP_MAX = 6;

type SupplierMeta = {
  /** Sum of the supplier's own unit prices — the "size" of its price list. */
  total: number;
  thumbs: { id: string; url: string | null; name: string }[];
};


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
  const [toDelete, setToDelete] = useState<SupplierWithStats | null>(null);

  const itemMeta = useMemo(() => new Map((inventory ?? []).map((i) => [i.id, i])), [inventory]);

  /** supplier → price-list total + a few product thumbnails (images first). */
  const supplierMeta = useMemo(() => {
    const out = new Map<string, SupplierMeta>();
    if (!priceIndex) return out;
    for (const [sid, lines] of priceIndex) {
      let total = 0;
      const all: { id: string; url: string | null; name: string }[] = [];
      for (const [itemId, prices] of lines) {
        total += supplierPriceListTotal(prices);
        const it = itemMeta.get(itemId);
        if (it) all.push({ id: itemId, url: it.image_url, name: it.name });
      }
      all.sort((a, b) => Number(!!b.url) - Number(!!a.url));
      out.set(sid, { total, thumbs: all.slice(0, STRIP_MAX) });
    }
    return out;
  }, [priceIndex, itemMeta]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (suppliers ?? []).filter((s) => {
      if (!q) return true;
      const hay = [s.name, s.phone ?? "", s.tax_id ?? "", s.notes ?? ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
    return [...rows].sort((a, b) => a.name.localeCompare(b.name, "he"));
  }, [suppliers, search]);

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
    } catch (e) {
      window.alert(supplierSaveError(e));
    }
  }

  const noSuppliers = (suppliers?.length ?? 0) === 0;

  return (
    <div className="spf-page page-enter">
      <header className="spf-hero">
        <span className="spf-glow spf-glow--1" aria-hidden />
        <span className="spf-glow spf-glow--2" aria-hidden />
        <span className="spf-grid-lines" aria-hidden />

        <div className="spf-hero-inner">
          <div className="spl-hero-bar">
            <div className="spf-search spl-hero-search">
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
            <Link to="/suppliers/new" className="spl-cta spl-cta--compact" aria-label="ספק חדש">
              <Icon name="add" size={22} />
              <span className="spl-cta-label">ספק חדש</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="spf-body">
        <div
          className="inventory-summary spl-summary mb-4 md:mb-5"
          style={{ gridTemplateColumns: "repeat(2, 1fr)" }}
        >
          <div className="inventory-summary-cell">
            <div className="text-[18px] font-extrabold leading-none tabular-nums tracking-tight md:text-[26px]">
              {filtered.length}
            </div>
            <div className="inventory-tab-cell-label mt-1 text-[10px] font-medium text-text-3 md:mt-1.5 md:text-[12px]">
              ספקים
            </div>
          </div>
          <RecurringOrdersEntry businessId={businessId} variant="summary-cell" from="suppliers" />
        </div>

        {/* ── Cards ── */}
        {filtered.length === 0 ? (
          <EmptyState
            icon="local_shipping"
            title={noSuppliers ? "עדיין אין ספקים" : "לא נמצאו ספקים"}
            description={
              noSuppliers
                ? "הוסיפו ספקים קבועים כדי לקשר אליהם מחירונים, הזמנות וחשבוניות."
                : "נסו חיפוש אחר."
            }
            action={
              noSuppliers ? (
                <Link to="/suppliers/new">
                  <Button icon="add">ספק ראשון</Button>
                </Link>
              ) : (
                <Button variant="secondary" onClick={() => setSearch("")}>
                  ניקוי חיפוש
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
                onOpen={() => navigate(`/suppliers/${s.id}`)}
                onEdit={() => navigate(`/suppliers/${s.id}/edit`)}
                onDelete={() => setToDelete(s)}
              />
            ))}
          </div>
        )}
      </div>

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
