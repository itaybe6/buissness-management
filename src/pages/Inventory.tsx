import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Icon, Input, ErrorState, Select } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import {
  useInventory,
  useCreateItem,
  useUpdateItem,
  useSetCount,
  useOrders,
  useCreateOrder,
  useUpdateOrder,
  uploadItemImage,
  INVENTORY_UNITS,
  type ItemWithQty,
} from "@/api/inventory";
import type { OrderStatus } from "@/types/database";

const ORDER_META: Record<OrderStatus, { label: string; tone: "warning" | "info" | "success" }> = {
  requested: { label: "ממתין", tone: "warning" },
  ordered: { label: "הוזמן", tone: "info" },
  received: { label: "התקבל", tone: "success" },
};

type ItemForm = {
  name: string;
  unit: string;
  qty: string;
  imageUrl: string | null;
  file: File | null;
};

const EMPTY_FORM: ItemForm = { name: "", unit: "יחידות", qty: "0", imageUrl: null, file: null };

type StockStatus = "empty" | "low" | "ok";

function stockStatus(item: ItemWithQty): StockStatus {
  if (item.current_qty === 0) return "empty";
  if (item.current_qty <= 3) return "low";
  return "ok";
}

const STOCK_META: Record<StockStatus, { label: string; dot: string; bar: string }> = {
  empty: { label: "אזל מהמלאי", dot: "var(--danger)", bar: "var(--danger)" },
  low: { label: "מלאי נמוך", dot: "var(--warning)", bar: "var(--warning)" },
  ok: { label: "במלאי", dot: "var(--success)", bar: "var(--success)" },
};

function QtyStepper({
  value,
  unit,
  disabled,
  onCommit,
}: {
  value: number;
  unit: string | null;
  disabled?: boolean;
  onCommit: (qty: number) => void;
}) {
  const [local, setLocal] = useState(value);
  const [bump, setBump] = useState(false);

  useEffect(() => setLocal(value), [value]);

  function commit(next: number) {
    const v = Math.max(0, next);
    setLocal(v);
    setBump(true);
    if (v !== value) onCommit(v);
  }

  const stepBtn =
    "grid h-7 w-7 place-items-center rounded-md text-text-3 transition-[transform,background-color,color] duration-[160ms] [transition-timing-function:var(--ease-out)] hover:bg-surface-2 hover:text-text active:scale-[0.97] disabled:opacity-35";

  return (
    <div className="flex items-center gap-2.5">
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface px-1 py-0.5">
        <button type="button" disabled={disabled} onClick={() => commit(local - 1)} className={stepBtn} aria-label="הפחתה">
          <Icon name="remove" size={16} />
        </button>
        <input
          type="number"
          value={local}
          disabled={disabled}
          onChange={(e) => setLocal(Number(e.target.value))}
          onBlur={() => local !== value && onCommit(Math.max(0, local))}
          onAnimationEnd={() => setBump(false)}
          className={`w-10 bg-transparent text-center text-[15px] font-bold tabular-nums text-text outline-none ${bump ? "inventory-qty-bump" : ""}`}
        />
        <button type="button" disabled={disabled} onClick={() => commit(local + 1)} className={stepBtn} aria-label="הוספה">
          <Icon name="add" size={16} />
        </button>
      </div>
      {unit && <span className="text-[12px] font-medium text-text-3">{unit}</span>}
    </div>
  );
}

function SummaryStrip({
  total,
  inStock,
  outOfStock,
  pending,
}: {
  total: number;
  inStock: number;
  outOfStock: number;
  pending: number;
}) {
  const cells = [
    { value: total, label: "סך פריטים" },
    { value: inStock, label: "במלאי" },
    { value: outOfStock, label: "אזלו מהמלאי" },
    { value: pending, label: "הזמנות פתוחות" },
  ];

  return (
    <div className="inventory-summary mb-6">
      {cells.map((cell) => (
        <div key={cell.label} className="inventory-summary-cell">
          <div className="text-[26px] font-extrabold leading-none tabular-nums tracking-tight">{cell.value}</div>
          <div className="mt-1.5 text-[12px] font-medium text-text-3">{cell.label}</div>
        </div>
      ))}
    </div>
  );
}

function TabBar({
  tab,
  pending,
  onChange,
}: {
  tab: "items" | "orders";
  pending: number;
  onChange: (tab: "items" | "orders") => void;
}) {
  const tabs = [
    { key: "items" as const, label: "מלאי", icon: "grid_view" },
    { key: "orders" as const, label: "הזמנות", icon: "local_shipping", count: pending },
  ];

  return (
    <div className="mb-6 flex items-center gap-5 border-b border-border-2">
      {tabs.map(({ key, label, icon, count }) => (
        <button
          key={key}
          type="button"
          data-active={tab === key}
          onClick={() => onChange(key)}
          className="inventory-tab inline-flex items-center gap-1.5 pb-3"
        >
          <Icon name={icon} size={17} />
          {label}
          {count != null && count > 0 && (
            <span
              className={`grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-extrabold tabular-nums ${
                tab === key ? "bg-ink text-white" : "bg-surface-2 text-text-2"
              }`}
            >
              {count}
            </span>
          )}
          <span className="inventory-tab-indicator" aria-hidden />
        </button>
      ))}
    </div>
  );
}

function StockBar({ item }: { item: ItemWithQty }) {
  const status = stockStatus(item);
  const meta = STOCK_META[status];
  const cap = Math.max(item.current_qty, 10);
  const pct = Math.min(100, (item.current_qty / cap) * 100);

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
        <span className="text-[11.5px] font-semibold text-text-3">{meta.label}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-[width] duration-[220ms] [transition-timing-function:var(--ease-out)]"
          style={{ width: `${pct}%`, background: meta.bar }}
        />
      </div>
    </div>
  );
}

function ItemCard({
  item,
  index,
  isManager,
  onEdit,
  onOrder,
  onSetQty,
}: {
  item: ItemWithQty;
  index: number;
  isManager: boolean;
  onEdit: () => void;
  onOrder: () => void;
  onSetQty: (qty: number) => void;
}) {
  return (
    <article
      className="inventory-card inventory-item-enter flex flex-col overflow-hidden rounded-card border border-border bg-surface"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className="inventory-card-image relative aspect-[5/4] overflow-hidden bg-surface-2">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="h-full w-full object-cover transition-transform duration-[400ms] [transition-timing-function:var(--ease-out)]"
          />
        ) : (
          <div className="grid h-full place-items-center text-text-3/70">
            <Icon name="inventory_2" size={36} />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-[15px] font-bold leading-snug tracking-tight">{item.name}</h3>
        <StockBar item={item} />

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-3">כמות</div>
            <div className="mt-1 text-[22px] font-extrabold tabular-nums leading-none">{item.current_qty}</div>
          </div>
          <QtyStepper value={item.current_qty} unit={item.unit} disabled={!isManager} onCommit={onSetQty} />
        </div>

        {isManager && (
          <div className="inventory-card-actions mt-4 flex gap-2 border-t border-border-2 pt-3">
            <Button variant="secondary" icon="edit" className="flex-1 !py-2.5 active:scale-[0.97]" onClick={onEdit}>
              עריכה
            </Button>
            <Button
              variant="ghost"
              icon="add_shopping_cart"
              onClick={onOrder}
              className="!bg-ink !py-2.5 !text-white hover:brightness-110 active:scale-[0.97]"
            >
              הזמנה
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

function OrderRow({
  order,
  item,
  index,
  isManager,
  onStatusChange,
}: {
  order: { id: string; quantity: number; status: OrderStatus; created_at: string };
  item?: ItemWithQty;
  index: number;
  isManager: boolean;
  onStatusChange: () => void;
}) {
  const meta = ORDER_META[order.status];

  return (
    <div
      className="inventory-item-enter flex items-center gap-3.5 border-b border-border-2 px-4 py-3.5 last:border-0"
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
    >
      <div className="h-12 w-12 flex-none overflow-hidden rounded-[10px] bg-surface-2">
        {item?.image_url ? (
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full place-items-center text-text-3">
            <Icon name="inventory_2" size={20} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-bold">{item?.name ?? "פריט"}</div>
        <div className="mt-0.5 text-[12px] text-text-3">
          {new Date(order.created_at).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" })}
        </div>
      </div>

      <div className="text-left">
        <div className="text-[13px] font-bold tabular-nums">
          {order.quantity}
          {item?.unit ? ` ${item.unit}` : ""}
        </div>
      </div>

      <button
        type="button"
        disabled={!isManager}
        onClick={onStatusChange}
        className="transition-transform duration-[160ms] [transition-timing-function:var(--ease-out)] active:scale-[0.97] disabled:cursor-default"
      >
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </button>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="relative aspect-[5/4] overflow-hidden bg-surface-2">
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-black/[0.04] to-transparent" />
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="h-4 w-2/3 rounded-md bg-surface-2" />
        <div className="h-1 w-full rounded-full bg-surface-2" />
        <div className="h-8 w-full rounded-lg bg-surface-2" />
      </div>
    </div>
  );
}

export function Inventory() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: items, isLoading, isError, refetch } = useInventory(businessId);
  const { data: orders } = useOrders(businessId);
  const createItem = useCreateItem(businessId);
  const updateItem = useUpdateItem(businessId);
  const setCount = useSetCount(businessId);
  const createOrder = useCreateOrder(businessId);
  const updateOrder = useUpdateOrder(businessId);
  const [tab, setTab] = useState<"items" | "orders">("items");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ItemWithQty | null>(null);
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isManager = !!(profile && ["manager", "department_manager", "shift_manager", "office_manager"].includes(profile.role));

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1080px]">
        <header className="mb-6">
          <div className="h-8 w-40 rounded-md bg-surface-2" />
          <div className="mt-2 h-4 w-28 rounded-md bg-surface-2" />
        </header>
        <div className="mb-6 h-[76px] rounded-card border border-border bg-surface" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }
  if (isError) return <ErrorState onRetry={refetch} />;

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(item: ItemWithQty) {
    setEditing(item);
    setForm({
      name: item.name,
      unit: item.unit ?? "יחידות",
      qty: String(item.current_qty),
      imageUrl: item.image_url,
      file: null,
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function submitItem() {
    setError(null);
    if (!form.name.trim()) return setError("נא להזין שם מוצר");
    setBusy(true);
    try {
      let image_url = form.imageUrl;
      if (form.file) image_url = await uploadItemImage(businessId!, form.file);
      const quantity = Number(form.qty) || 0;

      if (editing) {
        await updateItem.mutateAsync({
          id: editing.id,
          name: form.name.trim(),
          unit: form.unit,
          image_url,
        });
        if (quantity !== editing.current_qty) {
          await setCount.mutateAsync({
            business_id: businessId!,
            item_id: editing.id,
            employee_id: profile?.id ?? null,
            quantity,
          });
        }
      } else {
        await createItem.mutateAsync({
          business_id: businessId!,
          name: form.name.trim(),
          unit: form.unit,
          image_url,
          quantity,
          employee_id: profile?.id ?? null,
        });
      }
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בשמירה. ודאו שקיים Bucket בשם inventory ב-Storage.");
    } finally {
      setBusy(false);
    }
  }

  const list = items ?? [];
  const orderList = orders ?? [];
  const inStock = list.filter((i) => i.current_qty > 0).length;
  const outOfStock = list.filter((i) => i.current_qty === 0).length;
  const pending = orderList.filter((o) => o.status !== "received").length;

  return (
    <div className="mx-auto max-w-[1080px] animate-fadeUp">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-3">מלאי ורכש</p>
          <h1 className="mt-1 text-[26px] font-extrabold tracking-tight">ניהול סחורות</h1>
          <p className="mt-1.5 text-[13.5px] text-text-2">
            {list.length} פריטים · {inStock} במלאי
            {pending > 0 && ` · ${pending} הזמנות ממתינות`}
          </p>
        </div>
        {isManager && (
          <Button
            icon="add"
            onClick={openCreate}
            className="!bg-ink shadow-sm hover:brightness-110 active:scale-[0.97]"
          >
            פריט חדש
          </Button>
        )}
      </header>

      <SummaryStrip total={list.length} inStock={inStock} outOfStock={outOfStock} pending={pending} />

      <TabBar tab={tab} pending={pending} onChange={setTab} />

      {tab === "items" ? (
        list.length === 0 ? (
          <EmptyState
            icon="inventory_2"
            title="אין פריטים במלאי"
            description="הוסיפו פריט ראשון עם שם, יחידת מידה ותמונה."
            action={isManager ? <Button icon="add" onClick={openCreate}>פריט חדש</Button> : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((it, idx) => (
              <ItemCard
                key={it.id}
                item={it}
                index={idx}
                isManager={isManager}
                onEdit={() => openEdit(it)}
                onOrder={() =>
                  createOrder.mutate({
                    business_id: businessId!,
                    item_id: it.id,
                    quantity: 1,
                    ordered_by: profile?.id,
                  })
                }
                onSetQty={(quantity) =>
                  setCount.mutate({
                    business_id: businessId!,
                    item_id: it.id,
                    employee_id: profile?.id ?? null,
                    quantity,
                  })
                }
              />
            ))}
          </div>
        )
      ) : orderList.length === 0 ? (
        <EmptyState icon="local_shipping" title="אין הזמנות" description="הזמנות שתיצרו מהמלאי יופיעו כאן." />
      ) : (
        <Card className="overflow-hidden p-0">
          {orderList.map((o, idx) => {
            const item = items?.find((i) => i.id === o.item_id);
            const next: OrderStatus = o.status === "requested" ? "ordered" : o.status === "ordered" ? "received" : "requested";
            return (
              <OrderRow
                key={o.id}
                order={o}
                item={item}
                index={idx}
                isManager={isManager}
                onStatusChange={() => isManager && updateOrder.mutate({ id: o.id, status: next })}
              />
            );
          })}
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "עריכת פריט" : "פריט מלאי חדש"}
        icon="inventory_2"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} className="active:scale-[0.97]">
              ביטול
            </Button>
            <Button className="flex-1 !bg-ink active:scale-[0.97]" loading={busy} onClick={submitItem}>
              {editing ? "שמירה" : "הוספה"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative flex aspect-[16/10] flex-col items-center justify-center gap-2 overflow-hidden rounded-[12px] border border-dashed border-border bg-surface-2 text-text-3 transition-[border-color,color] duration-[180ms] [transition-timing-function:var(--ease-out)] hover:border-text-3 hover:text-text active:scale-[0.99]"
          >
            {form.file || form.imageUrl ? (
              <>
                <img
                  src={form.file ? URL.createObjectURL(form.file) : form.imageUrl!}
                  alt="תמונת מוצר"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <span className="relative rounded-full bg-black/60 px-3 py-1 text-[12px] font-semibold text-white backdrop-blur-sm">
                  החלפת תמונה
                </span>
              </>
            ) : (
              <>
                <Icon name="add_a_photo" size={32} />
                <span className="text-[13px] font-semibold">העלאת תמונת מוצר</span>
              </>
            )}
          </button>

          <Field label="שם המוצר">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="לדוגמה: חלב 3%" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="יחידת מידה">
              <Select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}>
                {INVENTORY_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="כמות">
              <Input type="number" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} />
            </Field>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
              <Icon name="error" size={18} /> {error}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
