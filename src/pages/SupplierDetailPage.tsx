import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, EmptyState, ErrorState, Icon, PageLoader } from "@/components/ui";
import { useBusinessId, formatCurrency } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import {
  useSupplierItems,
  useSupplierOrderBatches,
  useSupplierReceipts,
  useSuppliers,
  supplierSaveError,
  supplierPriceUnitLabel,
  supplierPriceListTotal,
  type SupplierItemPrices,
} from "@/api/suppliers";
import { RECEIPT_TYPE_LABELS } from "@/pages/agreements/types";

type DetailTab = "products" | "orders" | "receipts";

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

  const tabs: { key: DetailTab; label: string; icon: string; count: number }[] = [
    { key: "products", label: "מוצרים", icon: "inventory_2", count: supplier.product_count },
    { key: "orders", label: "הזמנות", icon: "local_shipping", count: batches?.length ?? 0 },
    { key: "receipts", label: "מסמכים", icon: "receipt_long", count: supplier.receipt_count },
  ];

  return (
    <div className="spf-page page-enter">
      <header className="spf-hero">
        <span className="spf-glow spf-glow--1" aria-hidden />
        <span className="spf-grid-lines" aria-hidden />

        <div className="spf-hero-inner">
          <div className="spl-hero-top">
            <div className="min-w-0">
              <Link to="/suppliers" className="spf-back">
                <Icon name="arrow_forward" size={16} />
                חזרה לספקים
              </Link>
              <div className="spl-mhero-id mt-3">
                <span className="spl-mono spl-mono--lg" aria-hidden>
                  {monogram(supplier.name)}
                </span>
                <div className="min-w-0">
                  <h1 className="spl-hero-title">{supplier.name}</h1>
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
            </div>

            <div className="flex flex-wrap gap-2">
              <Link to={`/inventory?supplier=${supplier.id}`}>
                <Button variant="secondary" icon="inventory_2">
                  מוצרים במלאי
                </Button>
              </Link>
              <Button variant="secondary" icon="edit" onClick={() => navigate(`/suppliers/${supplier.id}/edit`)}>
                עריכת ספק
              </Button>
            </div>
          </div>

          <div className="spf-hero-stats spf-hero-stats--4">
            <div className="spf-stat">
              <span className="spf-stat-label">מוצרים משויכים</span>
              <b className="spf-stat-value">{supplier.product_count}</b>
            </div>
            <div className="spf-stat">
              <span className="spf-stat-label">סה״כ מחירון</span>
              <b className="spf-stat-value">{formatCurrency(priceTotal)}</b>
            </div>
            <div className="spf-stat" data-tone={supplier.open_order_lines > 0 ? "warn" : undefined}>
              <span className="spf-stat-label">שורות פתוחות</span>
              <b className="spf-stat-value">{supplier.open_order_lines}</b>
            </div>
            <div className="spf-stat">
              <span className="spf-stat-label">מסמכים</span>
              <b className="spf-stat-value">{supplier.receipt_count}</b>
            </div>
          </div>
        </div>
      </header>

      <div className="spf-body">
        {supplier.notes && (
          <p className="spl-notes mb-4">
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

        <div className="spl-tabpanel mt-4" key={tab}>
          {tab === "products" && (
            <>
              <div className="spf-toolbar mb-4">
                <div className="spf-search">
                  <Icon name="search" size={18} className="spf-search-icon" />
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="חיפוש מוצר..."
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

              {productsLoading ? (
                <SkeletonRows />
              ) : !groupedProducts.length ? (
                <EmptyState
                  icon="inventory_2"
                  title="אין מוצרים משויכים"
                  description="שייכו מוצרים לספק וקבעו מחיר ליחידה בעריכת הספק."
                  action={
                    <Button icon="edit" onClick={() => navigate(`/suppliers/${supplier.id}/edit`)}>
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
                  {filteredProducts.map((p) => {
                    const priceParts = [
                      p.prices.main != null
                        ? `${formatCurrency(p.prices.main)} / ${supplierPriceUnitLabel("main", p.item_unit)}`
                        : null,
                      p.prices.piece != null
                        ? `${formatCurrency(p.prices.piece)} / ${supplierPriceUnitLabel("piece", p.item_unit)}`
                        : null,
                    ].filter(Boolean);
                    return (
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
                          <em>{priceParts.join(" · ") || p.item_unit || "יחידה"}</em>
                        </span>
                        <span className="spl-row-price">{priceParts.join(" · ")}</span>
                      </li>
                    );
                  })}
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
