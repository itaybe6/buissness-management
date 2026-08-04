import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  InlineLoader,
  PageLoader,
} from "@/components/ui";
import { useBusinessId } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import {
  useDeleteRecurringOrder,
  useRecurringOrders,
  useTouchRecurringOrder,
  type RecurringOrderWithItems,
} from "@/api/recurringOrders";
import { formatItemQty, useInventory } from "@/api/inventory";
import { useSuppliers } from "@/api/suppliers";
import {
  recurringOrderStartPath,
  recurringOrderSupplierCount,
  recurringOrdersForSupplier,
  recurringTemplateSupplierGroups,
  type RecurringOrdersFrom,
  type RecurringSupplierGroup,
} from "@/lib/recurringOrders";
import { recurringOrderMissingCount } from "@/components/inventory/RecurringOrderPicker";

function lastUsedLabel(template: RecurringOrderWithItems): string {
  if (!template.last_used_at) return "עדיין לא הייתה בשימוש";
  const date = new Date(template.last_used_at);
  return `שימוש אחרון: ${date.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" })}`;
}

function backTarget(from: RecurringOrdersFrom | null, supplierId: string | null): { to: string; label: string } {
  if (from === "suppliers") return { to: "/suppliers", label: "חזרה לספקים" };
  if (from === "supplier" && supplierId) {
    return { to: `/suppliers/${supplierId}`, label: "חזרה לספק" };
  }
  return { to: "/inventory", label: "חזרה לסחורות" };
}

function SupplierGroupBlock({ group }: { group: RecurringSupplierGroup }) {
  return (
    <section className="rord-page-group">
      <header className="rord-page-group-head">
        <Icon name="storefront" size={15} />
        <span className="rord-page-group-name">{group.supplier_name}</span>
        <span className="rord-page-group-count">{group.lines.length} מוצרים</span>
      </header>
      <ul className="rord-page-lines">
        {group.lines.map((line) => (
          <li key={`${group.supplier_id ?? "none"}-${line.item_id}`} className="rord-page-line">
            <span className="rord-page-line-thumb">
              {line.image_url ? (
                <img src={line.image_url} alt="" />
              ) : (
                <Icon name="inventory_2" size={16} />
              )}
            </span>
            <span className="rord-page-line-body">
              <span className={`rord-page-line-name${line.missing ? " rord-page-line-name--missing" : ""}`}>
                {line.item_name}
              </span>
              <span className="rord-page-line-qty">{line.qty_label}</span>
            </span>
            {line.missing ? (
              <span className="rord-page-line-badge" title="המוצר כבר לא קיים במלאי">
                <Icon name="warning" size={14} />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecurringOrderCard({
  template,
  supplierGroups,
  missing,
  usable,
  busy,
  confirming,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  onStart,
}: {
  template: RecurringOrderWithItems;
  supplierGroups: RecurringSupplierGroup[];
  missing: number;
  usable: number;
  busy: boolean;
  confirming: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onStart: () => void;
}) {
  const supplierCount = recurringOrderSupplierCount(template);

  return (
    <article className="rord-page-card">
      <header className="rord-page-card-head">
        <span className="rord-page-card-icon">
          <Icon name="event_repeat" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="rord-page-card-name">{template.name}</h2>
          <p className="rord-page-card-meta">
            {template.items.length} מוצרים · {supplierCount}{" "}
            {supplierCount === 1 ? "ספק" : "ספקים"} · {lastUsedLabel(template)}
          </p>
        </div>
        <button
          type="button"
          className="rord-card-del"
          aria-label={`מחיקת ${template.name}`}
          onClick={() => (confirming ? onCancelDelete() : onConfirmDelete())}
        >
          <Icon name={confirming ? "close" : "delete"} size={16} />
        </button>
      </header>

      <div className="rord-page-groups">
        {supplierGroups.map((group) => (
          <SupplierGroupBlock key={group.supplier_id ?? "__none__"} group={group} />
        ))}
      </div>

      {missing > 0 ? (
        <p className="rord-card-warn">
          <Icon name="warning" size={13} />
          {missing} מוצרים כבר לא קיימים במלאי ולא ייכנסו להזמנה
        </p>
      ) : null}

      <footer className="rord-page-card-foot">
        {confirming ? (
          <div className="rord-card-actions">
            <Button variant="secondary" className="flex-1" onClick={onCancelDelete}>
              ביטול
            </Button>
            <Button variant="danger" className="flex-1" icon="delete" loading={busy} onClick={onDelete}>
              מחיקה לצמיתות
            </Button>
          </div>
        ) : (
          <Button
            className="w-full !bg-ink"
            icon="play_arrow"
            disabled={usable === 0}
            loading={busy}
            onClick={onStart}
          >
            {usable === 0 ? "אין מוצרים זמינים" : "התחלת הזמנה מהתבנית"}
          </Button>
        )}
      </footer>
    </article>
  );
}

export function RecurringOrdersPage() {
  const businessId = useBusinessId();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const itemById = useMemo(() => new Map((inventory ?? []).map((item) => [item.id, item])), [inventory]);
  const supplierById = useMemo(
    () => new Map((suppliers ?? []).map((supplier) => [supplier.id, supplier])),
    [suppliers],
  );
  const supplierName = supplierFilter ? supplierById.get(supplierFilter)?.name : null;

  const filtered = useMemo(
    () => recurringOrdersForSupplier(templates ?? [], supplierFilter),
    [templates, supplierFilter],
  );
  const totalCount = templates?.length ?? 0;

  if (!canManage) return <Navigate to="/inventory" replace />;
  if (!businessId) {
    return (
      <EmptyState icon="store" title="לא משויך לעסק" description="פנו למנהל המערכת לשיוך לעסק." />
    );
  }
  if (isLoading) return <PageLoader label="טוען הזמנות קבועות..." />;
  if (isError) {
    return (
      <ErrorState
        message={(error as Error)?.message ?? "טעינת ההזמנות הקבועות נכשלה"}
        onRetry={refetch}
      />
    );
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
    const usable = template.items.length - missing;
    if (usable === 0) return;
    touchRecurring.mutate(template.id);
    navigate(recurringOrderStartPath(template.id, supplierFilter));
  }

  const filteredEmpty = !!supplierName && filtered.length === 0 && totalCount > 0;

  return (
    <div className="rord-page page-enter w-full">
      <header className="rord-page-head">
        <Link to={back.to} className="rord-page-back">
          <Icon name="arrow_forward" size={16} />
          {back.label}
        </Link>
        <div className="rord-page-title-row">
          <span className="rord-page-title-icon">
            <Icon name="event_repeat" size={22} />
          </span>
          <div>
            <h1 className="rord-page-title">הזמנות קבועות</h1>
            <p className="rord-page-sub">
              {supplierName
                ? `תבניות שמורות עם מוצרים מ${supplierName}`
                : "תבניות הזמנה שמורות — מוצרים, כמויות וספק לכל פריט"}
            </p>
          </div>
        </div>
        {filtered.length > 0 ? (
          <div className="rord-page-stats">
            <span className="rord-page-stat">
              <b>{filtered.length}</b> {filtered.length === 1 ? "הזמנה" : "הזמנות"}
            </span>
            <span className="rord-page-stat">
              <b>{filtered.reduce((sum, row) => sum + row.items.length, 0)}</b> מוצרים בסך הכל
            </span>
          </div>
        ) : null}
      </header>

      {filtered.length === 0 ? (
        <EmptyState
          icon="event_repeat"
          title={filteredEmpty ? `אין הזמנות קבועות ל${supplierName}` : "אין עדיין הזמנות קבועות"}
          description={
            filteredEmpty
              ? "יש תבניות שמורות לספקים אחרים. בנו הזמנה מהמחירון של הספק ושמרו אותה כהזמנה קבועה."
              : 'בנו הזמנה חדשה, בחרו מוצרים וכמויות, ולחצו «שמירה כהזמנה קבועה» — בפעם הבאה תוכלו להתחיל מכאן.'
          }
          action={
            <Button icon="add_shopping_cart" onClick={() => navigate("/inventory/order")}>
              הזמנה חדשה
            </Button>
          }
        />
      ) : !inventory ? (
        <InlineLoader label="טוען פרטי מוצרים..." />
      ) : (
        <div className="rord-page-list">
          {filtered.map((template) => {
            const missing = recurringOrderMissingCount(template, itemById);
            const usable = template.items.length - missing;
            const supplierGroups = recurringTemplateSupplierGroups(
              template,
              itemById,
              supplierById,
              formatItemQty,
            );

            return (
              <RecurringOrderCard
                key={template.id}
                template={template}
                supplierGroups={supplierGroups}
                missing={missing}
                usable={usable}
                busy={busyId === template.id}
                confirming={confirmDeleteId === template.id}
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
  );
}
