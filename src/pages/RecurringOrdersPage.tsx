import { useMemo, useState, type CSSProperties } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button, EmptyState, ErrorState, Icon, InlineLoader, PageLoader } from "@/components/ui";
import { useBusinessId } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import {
  useDeleteRecurringOrder,
  useRecurringOrders,
  useTouchRecurringOrder,
  type RecurringOrderWithItems,
} from "@/api/recurringOrders";
import { formatItemQty, useInventory, type ItemWithQty } from "@/api/inventory";
import { useSuppliers } from "@/api/suppliers";
import {
  recurringOrderStartPath,
  recurringOrdersForSupplier,
  recurringTemplateSupplierGroups,
  type RecurringOrdersFrom,
  type RecurringSupplierGroup,
} from "@/lib/recurringOrders";
import { recurringOrderMissingCount } from "@/components/inventory/RecurringOrderPicker";

/** Thumbnails shown on a card's product rail before it collapses into "+N". */
const RAIL_MAX = 6;

/** "היום" reads better than a date for the templates people actually use. */
function lastUsedLabel(template: RecurringOrderWithItems): { text: string; fresh: boolean } {
  if (!template.last_used_at) return { text: "עדיין לא הייתה בשימוש", fresh: false };
  const then = new Date(template.last_used_at);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return { text: "בשימוש היום", fresh: true };
  if (days === 1) return { text: "בשימוש אתמול", fresh: true };
  if (days < 7) return { text: `לפני ${days} ימים`, fresh: true };
  if (days < 14) return { text: "לפני שבוע", fresh: false };
  if (days < 60) return { text: `לפני ${Math.floor(days / 7)} שבועות`, fresh: false };
  return {
    text: then.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" }),
    fresh: false,
  };
}

function backTarget(from: RecurringOrdersFrom | null, supplierId: string | null): { to: string; label: string } {
  if (from === "suppliers") return { to: "/suppliers", label: "חזרה לספקים" };
  if (from === "supplier" && supplierId) return { to: `/suppliers/${supplierId}`, label: "חזרה לספק" };
  return { to: "/inventory", label: "חזרה לסחורות" };
}

/** Products of a template, images first — the card rail is a visual index. */
function templateThumbs(template: RecurringOrderWithItems, itemById: Map<string, ItemWithQty>) {
  const rows = template.items.map((line) => {
    const item = itemById.get(line.item_id);
    return { id: line.item_id, url: item?.image_url ?? null, name: item?.name ?? "מוצר שנמחק" };
  });
  return [...rows].sort((a, b) => Number(!!b.url) - Number(!!a.url));
}

/* ---------------------------------------------------------------- */
/* Card                                                              */
/* ---------------------------------------------------------------- */
function SupplierGroupBlock({
  group,
  highlight,
}: {
  group: RecurringSupplierGroup;
  highlight: boolean;
}) {
  return (
    <section className="rcr-group" data-highlight={highlight}>
      <header className="rcr-group-head">
        <Icon name="storefront" size={14} />
        {group.supplier_id ? (
          <Link to={`/suppliers/${group.supplier_id}`} className="rcr-group-name">
            {group.supplier_name}
          </Link>
        ) : (
          <span className="rcr-group-name">{group.supplier_name}</span>
        )}
        <span className="rcr-group-count">{group.lines.length} מוצרים</span>
      </header>
      <ul className="rcr-lines">
        {group.lines.map((line) => (
          <li key={`${group.supplier_id ?? "none"}-${line.item_id}`} className="rcr-line">
            <span className="rcr-line-thumb">
              {line.image_url ? <img src={line.image_url} alt="" loading="lazy" /> : <Icon name="inventory_2" size={15} />}
            </span>
            <span className="rcr-line-body">
              <span className={`rcr-line-name${line.missing ? " rcr-line-name--missing" : ""}`}>
                {line.item_name}
              </span>
              {line.missing && <span className="rcr-line-gone">כבר לא במלאי</span>}
            </span>
            <span className="rcr-line-qty">{line.qty_label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecurringOrderCard({
  template,
  index,
  supplierGroups,
  thumbs,
  missing,
  usable,
  scopedSupplierId,
  scopedSupplierName,
  scopedCount,
  busy,
  confirming,
  open,
  onToggle,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  onStart,
}: {
  template: RecurringOrderWithItems;
  index: number;
  supplierGroups: RecurringSupplierGroup[];
  thumbs: { id: string; url: string | null; name: string }[];
  missing: number;
  usable: number;
  scopedSupplierId: string | null;
  scopedSupplierName: string | null;
  scopedCount: number;
  busy: boolean;
  confirming: boolean;
  open: boolean;
  onToggle: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onStart: () => void;
}) {
  const used = lastUsedLabel(template);
  const shown = thumbs.slice(0, RAIL_MAX);
  const rest = thumbs.length - shown.length;

  return (
    <article
      className="rcr-card"
      data-open={open}
      data-confirming={confirming}
      style={{ "--i": Math.min(index, 12) } as CSSProperties}
    >
      <span className="rcr-card-edge" aria-hidden />

      <header className="rcr-card-head">
        <span className="rcr-card-icon" aria-hidden>
          <Icon name="event_repeat" size={19} />
        </span>
        <div className="rcr-card-id">
          <h2 className="rcr-card-name">{template.name}</h2>
          <p className="rcr-card-meta">
            <span>
              <Icon name="inventory_2" size={12} />
              {template.items.length} מוצרים
            </span>
            <span>
              <Icon name="storefront" size={12} />
              {supplierGroups.length} {supplierGroups.length === 1 ? "ספק" : "ספקים"}
            </span>
            <span className="rcr-used" data-fresh={used.fresh}>
              <Icon name="history" size={12} />
              {used.text}
            </span>
          </p>
        </div>
        <button
          type="button"
          className="rcr-card-x"
          aria-label={confirming ? "ביטול מחיקה" : `מחיקת ${template.name}`}
          title={confirming ? "ביטול" : "מחיקת התבנית"}
          onClick={() => (confirming ? onCancelDelete() : onConfirmDelete())}
        >
          <Icon name={confirming ? "close" : "delete"} size={16} />
        </button>
      </header>

      <div className="rcr-rail" data-empty={shown.length === 0}>
        {shown.map((t) => (
          <span key={t.id} className="rcr-thumb" title={t.name}>
            {t.url ? <img src={t.url} alt="" loading="lazy" /> : <Icon name="inventory_2" size={14} />}
          </span>
        ))}
        {rest > 0 && <span className="rcr-thumb rcr-thumb--more">+{rest}</span>}
      </div>

      <div className="rcr-sups">
        {supplierGroups.map((group) => (
          <span
            key={group.supplier_id ?? "__none__"}
            className="rcr-sup"
            data-active={!!scopedSupplierId && group.supplier_id === scopedSupplierId}
          >
            <Icon name="storefront" size={12} />
            {group.supplier_name}
            <b>{group.lines.length}</b>
          </span>
        ))}
      </div>

      {missing > 0 && (
        <p className="rcr-warn">
          <Icon name="warning" size={14} />
          {missing} מוצרים כבר לא קיימים במלאי ולא ייכנסו להזמנה
        </p>
      )}

      {/* Toggle + fold share a wrapper so the collapsed fold cannot double the card's gap. */}
      <div className="rcr-detail">
        <button type="button" className="rcr-more" onClick={onToggle} aria-expanded={open}>
          <Icon name="expand_more" size={17} className="rcr-more-caret" />
          {open ? "הסתרת הפריטים" : `הצגת ${template.items.length} הפריטים`}
        </button>

        <div className="rcr-fold" data-open={open}>
          <div className="rcr-fold-in">
            {supplierGroups.map((group) => (
              <SupplierGroupBlock
                key={group.supplier_id ?? "__none__"}
                group={group}
                highlight={!!scopedSupplierId && group.supplier_id === scopedSupplierId}
              />
            ))}
          </div>
        </div>
      </div>

      <footer className="rcr-card-foot">
        {confirming ? (
          <div className="rcr-confirm">
            <p className="rcr-confirm-text">
              <Icon name="error" size={15} />
              למחוק את «{template.name}» לצמיתות?
            </p>
            <div className="rcr-confirm-acts">
              <Button variant="secondary" className="flex-1" onClick={onCancelDelete}>
                ביטול
              </Button>
              <Button variant="danger" className="flex-1" icon="delete" loading={busy} onClick={onDelete}>
                מחיקה
              </Button>
            </div>
          </div>
        ) : (
          <button type="button" className="rcr-go" disabled={usable === 0 || busy} onClick={onStart}>
            <Icon name="play_arrow" size={19} />
            <span className="rcr-go-label">
              {usable === 0
                ? "אין מוצרים זמינים"
                : scopedSupplierName
                  ? `הזמנה מ${scopedSupplierName} · ${scopedCount} מוצרים`
                  : "התחלת הזמנה מהתבנית"}
            </span>
            <Icon name="arrow_back" size={17} className="rcr-go-arrow" />
          </button>
        )}
      </footer>
    </article>
  );
}

/* ---------------------------------------------------------------- */
/* Page                                                              */
/* ---------------------------------------------------------------- */
export function RecurringOrdersPage() {
  const businessId = useBusinessId();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const canManage = !!(profile && ["manager", "office_manager"].includes(profile.role));

  const supplierFilter = searchParams.get("supplier");
  const fromParam = searchParams.get("from") as RecurringOrdersFrom | null;
  const back = backTarget(fromParam, supplierFilter);

  const { data: templates, isLoading, isError, error, refetch } = useRecurringOrders(businessId);
  const { data: inventory } = useInventory(businessId);
  const { data: suppliers } = useSuppliers(businessId, { activeOnly: false });
  const deleteRecurring = useDeleteRecurringOrder(businessId);
  const touchRecurring = useTouchRecurringOrder(businessId);

  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const itemById = useMemo(() => new Map((inventory ?? []).map((item) => [item.id, item])), [inventory]);
  const supplierById = useMemo(
    () => new Map((suppliers ?? []).map((supplier) => [supplier.id, supplier])),
    [suppliers],
  );
  const supplierName = supplierFilter ? supplierById.get(supplierFilter)?.name ?? null : null;

  const all = useMemo(() => templates ?? [], [templates]);

  /** Every supplier that appears in at least one template, with its template count. */
  const supplierTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const template of all) {
      for (const id of new Set(template.items.map((l) => l.supplier_id).filter(Boolean) as string[])) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ id, name: supplierById.get(id)?.name ?? "ספק לא ידוע", count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "he"));
  }, [all, supplierById]);

  const filtered = useMemo(() => {
    const rows = recurringOrdersForSupplier(all, supplierFilter);
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((template) => {
      if (template.name.toLowerCase().includes(q)) return true;
      return template.items.some((line) => (itemById.get(line.item_id)?.name ?? "").toLowerCase().includes(q));
    });
  }, [all, supplierFilter, search, itemById]);

  /** Hero stats always describe what the list is currently showing. */
  const stats = useMemo(() => {
    const products = new Set<string>();
    const sups = new Set<string>();
    for (const template of filtered) {
      for (const line of template.items) {
        products.add(line.item_id);
        sups.add(line.supplier_id ?? "__none__");
      }
    }
    return { templates: filtered.length, products: products.size, suppliers: sups.size };
  }, [filtered]);

  function setSupplierFilter(id: string | null) {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("supplier", id);
    else next.delete("supplier");
    setSearchParams(next, { replace: true });
  }

  async function handleDelete(template: RecurringOrderWithItems) {
    setBusyId(template.id);
    try {
      await deleteRecurring.mutateAsync(template.id);
      setConfirmDeleteId(null);
    } finally {
      setBusyId(null);
    }
  }

  function handleStart(template: RecurringOrderWithItems) {
    const missing = recurringOrderMissingCount(template, itemById);
    if (template.items.length - missing === 0) return;
    touchRecurring.mutate(template.id);
    navigate(recurringOrderStartPath(template.id, supplierFilter));
  }

  if (!canManage) return <Navigate to="/inventory" replace />;
  if (!businessId) {
    return <EmptyState icon="store" title="לא משויך לעסק" description="פנו למנהל המערכת לשיוך לעסק." />;
  }
  if (isLoading) return <PageLoader label="טוען הזמנות קבועות..." />;
  if (isError) {
    return <ErrorState message={(error as Error)?.message ?? "טעינת ההזמנות הקבועות נכשלה"} onRetry={refetch} />;
  }

  const noneAtAll = all.length === 0;
  const hiddenBySupplier = !!supplierName && filtered.length === 0 && all.length > 0 && !search.trim();

  return (
    <div className="rcr-page spf-page page-enter">
      <header className="spf-hero rcr-hero">
        <span className="spf-glow spf-glow--1" aria-hidden />
        <span className="spf-glow spf-glow--2" aria-hidden />
        <span className="spf-grid-lines" aria-hidden />

        <div className="spf-hero-inner rcr-hero-inner">
          <div className="spf-hero-bar">
            <Link to={back.to} className="spf-back">
              <Icon name="arrow_forward" size={16} />
              {back.label}
            </Link>
            <button type="button" className="spl-cta spl-cta--compact" onClick={() => navigate("/inventory/order")}>
              <Icon name="add_shopping_cart" size={20} />
              <span className="spl-cta-label">הזמנה חדשה</span>
            </button>
          </div>

          <div className="rcr-id">
            <span className="rcr-mark" aria-hidden>
              <i className="rcr-mark-ring" />
              <Icon name="event_repeat" size={26} />
            </span>
            <div className="min-w-0">
              <h1 className="rcr-title">הזמנות קבועות</h1>
              <p className="rcr-sub">
                {supplierName
                  ? `תבניות שמורות שכוללות מוצרים מ${supplierName}`
                  : "תבניות הזמנה שמורות — מוצרים, כמויות וספק לכל פריט, בלחיצה אחת"}
              </p>
            </div>
          </div>

          {supplierName && (
            <div className="rcr-scope">
              <span className="rcr-scope-ico" aria-hidden>
                <Icon name="filter_alt" size={15} />
              </span>
              <span className="rcr-scope-body">
                <b>מסונן לפי ספק</b>
                <span>{supplierName} · ההזמנה תיפתח עם המוצרים של הספק הזה בלבד</span>
              </span>
              <button
                type="button"
                className="rcr-scope-x"
                onClick={() => setSupplierFilter(null)}
                aria-label="הצגת כל ההזמנות הקבועות"
              >
                <Icon name="close" size={15} />
                <span className="rcr-scope-x-label">כל הספקים</span>
              </button>
            </div>
          )}

          <div className="spf-hero-stats">
            <div className="spf-stat">
              <span className="spf-stat-label">תבניות</span>
              <span className="spf-stat-value" key={stats.templates}>
                {stats.templates}
              </span>
            </div>
            <div className="spf-stat">
              <span className="spf-stat-label">מוצרים</span>
              <span className="spf-stat-value" key={stats.products}>
                {stats.products}
              </span>
            </div>
            <div className="spf-stat">
              <span className="spf-stat-label">ספקים</span>
              <span className="spf-stat-value" key={stats.suppliers}>
                {stats.suppliers}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="spf-body rcr-body">
        {!noneAtAll && (
          <div className="rcr-toolbar">
            <div className="spf-search rcr-search">
              <Icon name="search" size={18} className="spf-search-icon" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש תבנית או מוצר..."
                className="spf-search-input"
                aria-label="חיפוש הזמנה קבועה"
              />
              {search && (
                <button type="button" className="spf-search-x" onClick={() => setSearch("")} aria-label="ניקוי חיפוש">
                  <Icon name="close" size={15} />
                </button>
              )}
            </div>

            {supplierTabs.length > 0 && (
              <div className="rcr-chips" role="group" aria-label="סינון לפי ספק">
                <button
                  type="button"
                  className="rcr-chip"
                  data-active={!supplierFilter}
                  onClick={() => setSupplierFilter(null)}
                >
                  <Icon name="apps" size={14} />
                  כל הספקים
                  <span className="rcr-chip-count">{all.length}</span>
                </button>
                {supplierTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className="rcr-chip"
                    data-active={supplierFilter === tab.id}
                    onClick={() => setSupplierFilter(supplierFilter === tab.id ? null : tab.id)}
                  >
                    <Icon name="storefront" size={14} />
                    {tab.name}
                    <span className="rcr-chip-count">{tab.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {noneAtAll ? (
          <div className="rcr-empty">
            <span className="rcr-empty-mark" aria-hidden>
              <Icon name="event_repeat" size={30} />
            </span>
            <h2 className="rcr-empty-title">אין עדיין הזמנות קבועות</h2>
            <p className="rcr-empty-sub">
              בנו הזמנה חדשה, בחרו מוצרים וכמויות, ולחצו «שמירה כהזמנה קבועה» — בפעם הבאה תתחילו מכאן בלחיצה אחת.
            </p>
            <div className="rcr-empty-steps">
              <span>
                <b>1</b>הזמנה חדשה
              </span>
              <span>
                <b>2</b>בחירת מוצרים
              </span>
              <span>
                <b>3</b>שמירה כתבנית
              </span>
            </div>
            <Button icon="add_shopping_cart" onClick={() => navigate("/inventory/order")}>
              הזמנה חדשה
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rcr-empty rcr-empty--slim">
            <span className="rcr-empty-mark" aria-hidden>
              <Icon name={hiddenBySupplier ? "filter_alt_off" : "search_off"} size={28} />
            </span>
            <h2 className="rcr-empty-title">
              {hiddenBySupplier ? `אין הזמנות קבועות ל${supplierName}` : "לא נמצאו תבניות"}
            </h2>
            <p className="rcr-empty-sub">
              {hiddenBySupplier
                ? "יש תבניות שמורות לספקים אחרים. בנו הזמנה מהמחירון של הספק ושמרו אותה כהזמנה קבועה."
                : "נסו מילת חיפוש אחרת או ספק אחר."}
            </p>
            <Button
              variant="secondary"
              icon="filter_alt_off"
              onClick={() => {
                setSearch("");
                setSupplierFilter(null);
              }}
            >
              ניקוי סינון
            </Button>
          </div>
        ) : !inventory ? (
          <InlineLoader label="טוען פרטי מוצרים..." />
        ) : (
          <div className="rcr-grid">
            {filtered.map((template, index) => {
              const missing = recurringOrderMissingCount(template, itemById);
              const supplierGroups = recurringTemplateSupplierGroups(
                template,
                itemById,
                supplierById,
                formatItemQty,
              );
              const scopedCount = supplierFilter
                ? template.items.filter((line) => line.supplier_id === supplierFilter).length
                : 0;

              return (
                <RecurringOrderCard
                  key={template.id}
                  template={template}
                  index={index}
                  supplierGroups={supplierGroups}
                  thumbs={templateThumbs(template, itemById)}
                  missing={missing}
                  usable={template.items.length - missing}
                  scopedSupplierId={supplierFilter}
                  scopedSupplierName={supplierName}
                  scopedCount={scopedCount}
                  busy={busyId === template.id}
                  confirming={confirmDeleteId === template.id}
                  open={openId === template.id}
                  onToggle={() => setOpenId(openId === template.id ? null : template.id)}
                  onConfirmDelete={() => setConfirmDeleteId(template.id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  onDelete={() => void handleDelete(template)}
                  onStart={() => handleStart(template)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
