import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  PageLoader,
} from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useBusinessId, formatCurrency } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import {
  useDeleteSupplier,
  useSupplierItems,
  useSupplierOrderBatches,
  useSupplierReceipts,
  useSuppliers,
  supplierSaveError,
  type SupplierWithStats,
} from "@/api/suppliers";
import { RECEIPT_TYPE_LABELS } from "@/pages/agreements/types";

type StatusFilter = "all" | "active" | "inactive";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "active", label: "פעילים" },
  { key: "inactive", label: "לא פעילים" },
];

function formatWhen(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Suppliers() {
  const businessId = useBusinessId();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canManage = !!(profile && ["manager", "office_manager"].includes(profile.role));

  const { data: suppliers, isLoading, isError, error, refetch } = useSuppliers(businessId);
  const del = useDeleteSupplier(businessId);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [detail, setDetail] = useState<SupplierWithStats | null>(null);
  const [toDelete, setToDelete] = useState<SupplierWithStats | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (suppliers ?? []).filter((s) => {
      if (statusFilter === "active" && !s.active) return false;
      if (statusFilter === "inactive" && s.active) return false;
      if (!q) return true;
      const hay = [s.name, s.phone ?? "", s.tax_id ?? "", s.notes ?? ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [suppliers, search, statusFilter]);

  if (!canManage) return <Navigate to="/inventory" replace />;
  if (!businessId) {
    return <EmptyState icon="store" title="לא משויך לעסק" description="פנו למנהל המערכת לשיוך לעסק." />;
  }
  if (isLoading) return <PageLoader label="טוען ספקים..." />;
  if (isError) {
    return <ErrorState message={supplierSaveError(error)} onRetry={refetch} />;
  }

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

  return (
    <div className="w-full animate-fadeUp">
      <div className="inventory-search mb-4 space-y-2.5">
        <div className="inv-searchrow">
          <div className="relative min-w-0 flex-1">
            <Icon
              name="search"
              size={18}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-3"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם, טלפון, ח.פ..."
              className="!pr-10"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="ניקוי חיפוש"
                className="absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </div>
          <Link to="/suppliers/new" className="shrink-0">
            <Button icon="add" className="!h-11 !bg-ink whitespace-nowrap shadow-sm hover:brightness-110 active:scale-[0.97]">
              ספק חדש
            </Button>
          </Link>
        </div>
        <div className="inventory-search-filters flex gap-1.5 overflow-x-auto pb-0.5">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`inventory-search-filter${statusFilter === key ? " inventory-search-filter--active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[12px] font-medium text-text-3">
          {filtered.length} מתוך {suppliers?.length ?? 0} ספקים
        </p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="local_shipping"
          title={suppliers?.length ? "לא נמצאו ספקים" : "עדיין אין ספקים"}
          description={
            suppliers?.length
              ? "נסו חיפוש אחר או שנו את הסינון."
              : "הוסיפו ספקים קבועים כדי לקשר אליהם הזמנות וחשבוניות."
          }
          action={
            suppliers?.length ? (
              <Button variant="secondary" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
                ניקוי סינון
              </Button>
            ) : (
              <Link to="/suppliers/new">
                <Button icon="add">ספק ראשון</Button>
              </Link>
            )
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s, i) => (
            <Card
              key={s.id}
              className="group cursor-pointer border-border bg-surface p-4 transition hover:border-accent/35 hover:shadow-sm"
              style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
              onClick={() => setDetail(s)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-extrabold text-text">{s.name}</h3>
                  {s.phone && (
                    <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-text-2">
                      <Icon name="call" size={14} />
                      {s.phone}
                    </p>
                  )}
                  {s.tax_id && <p className="mt-0.5 text-[12px] text-text-3">ח.פ / ע.מ {s.tax_id}</p>}
                </div>
                {!s.active && <Badge tone="neutral">לא פעיל</Badge>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11.5px] font-semibold text-text-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1">
                  <Icon name="inventory_2" size={14} />
                  {s.product_count} מוצרים
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1">
                  <Icon name="local_shipping" size={14} />
                  {s.open_order_lines > 0 ? `${s.open_order_lines} שורות פתוחות` : "אין הזמנות פתוחות"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1">
                  <Icon name="receipt_long" size={14} />
                  {s.receipt_count} מסמכים
                </span>
              </div>
              <div className="mt-3 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                <Button
                  variant="ghost"
                  icon="edit"
                  className="!px-2 !py-1.5 text-[12px]"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/suppliers/${s.id}/edit`);
                  }}
                >
                  עריכה
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SupplierDetailModal
        supplier={detail}
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
        <p className="text-[14px] text-text-2">
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

function SupplierDetailModal({
  supplier,
  businessId,
  onClose,
  onEdit,
  onDelete,
}: {
  supplier: SupplierWithStats | null;
  businessId: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data: batches, isLoading: ordersLoading } = useSupplierOrderBatches(businessId, supplier?.id ?? null, !!supplier);
  const { data: receipts, isLoading: receiptsLoading } = useSupplierReceipts(businessId, supplier?.id ?? null, !!supplier);
  const { data: linkedProducts, isLoading: productsLoading } = useSupplierItems(businessId, supplier?.id ?? null, !!supplier);

  if (!supplier) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={supplier.name}
      subtitle={supplier.active ? "ספק פעיל" : "ספק לא פעיל"}
      icon="store"
      maxWidth={560}
    >
      <div className="space-y-5">
        {(supplier.phone || supplier.tax_id || supplier.notes) && (
          <div className="rounded-[12px] border border-border bg-surface-2 p-3 text-[13px] text-text-2">
            {supplier.phone && (
              <p>
                <Icon name="call" size={15} className="ml-1 inline" />
                {supplier.phone}
              </p>
            )}
            {supplier.tax_id && <p className="mt-1">ח.פ / ע.מ {supplier.tax_id}</p>}
            {supplier.notes && <p className="mt-1 text-text-3">{supplier.notes}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon="edit" className="!px-3 !py-2 text-[12px]" onClick={onEdit}>
            עריכה
          </Button>
          <Link to={`/inventory?tab=orders&supplier=${supplier.id}`} className="inline-flex">
            <Button variant="secondary" icon="inventory_2" className="!px-3 !py-2 text-[12px]">
              הזמנות במלאי
            </Button>
          </Link>
          <Button variant="ghost" icon="delete" className="!px-3 !py-2 text-[12px] text-danger" onClick={onDelete}>
            מחיקה
          </Button>
        </div>

        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-extrabold text-text">
            <Icon name="inventory_2" size={16} />
            מוצרים ומחירים
          </h4>
          {productsLoading ? (
            <p className="text-[13px] text-text-3">טוען...</p>
          ) : !linkedProducts?.length ? (
            <p className="text-[13px] text-text-3">לא שויכו מוצרים. ניתן להוסיף בעריכת הספק.</p>
          ) : (
            <ul className="space-y-2">
              {linkedProducts.map((p) => (
                <li
                  key={p.item_id}
                  className="flex items-center gap-2.5 rounded-[11px] border border-border bg-surface px-3 py-2"
                >
                  <div className="sup-product-line-thumb !h-10 !w-10 !rounded-[9px]">
                    {p.item_image_url ? (
                      <img src={p.item_image_url} alt="" />
                    ) : (
                      <Icon name="inventory_2" size={18} className="text-text-3" />
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{p.item_name}</span>
                  <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-text">
                    {formatCurrency(Number(p.unit_price))}
                    {p.item_unit ? ` / ${p.item_unit}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-extrabold text-text">
            <Icon name="local_shipping" size={16} />
            הזמנות אחרונות
          </h4>
          {ordersLoading ? (
            <p className="text-[13px] text-text-3">טוען...</p>
          ) : !batches?.length ? (
            <p className="text-[13px] text-text-3">אין הזמנות מקושרות לספק זה.</p>
          ) : (
            <ul className="space-y-2">
              {batches.slice(0, 8).map((b) => (
                <li key={b.batch_key} className="rounded-[11px] border border-border bg-surface px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-text">
                      {b.preview_item_names.join(", ")}
                      {b.line_count > b.preview_item_names.length ? ` (+${b.line_count - b.preview_item_names.length})` : ""}
                    </span>
                    {b.pending_count > 0 ? (
                      <Badge tone="warning">{b.pending_count} ממתין</Badge>
                    ) : (
                      <Badge tone="success">התקבל</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] text-text-3">{formatWhen(b.created_at)} · {b.line_count} פריטים</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-extrabold text-text">
            <Icon name="receipt_long" size={16} />
            מסמכים פיננסיים
          </h4>
          {receiptsLoading ? (
            <p className="text-[13px] text-text-3">טוען...</p>
          ) : !receipts?.length ? (
            <p className="text-[13px] text-text-3">אין מסמכים מקושרים. ניתן לקשר בעת העלאת חשבונית במסמכים.</p>
          ) : (
            <ul className="space-y-2">
              {receipts.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 rounded-[11px] border border-border bg-surface px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold">{RECEIPT_TYPE_LABELS[r.type as keyof typeof RECEIPT_TYPE_LABELS]}</p>
                    <p className="text-[12px] text-text-3">{formatWhen(r.created_at)}</p>
                  </div>
                  <span className="shrink-0 text-[13px] font-extrabold tabular-nums">{formatCurrency(Number(r.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}
