import { useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Icon, Input, PageHeader, PageLoader, ErrorState, Select } from "@/components/ui";
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

  const isManager = profile && ["manager", "department_manager", "shift_manager", "office_manager"].includes(profile.role);

  if (isLoading) return <PageLoader />;
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

  return (
    <div className="mx-auto max-w-[1100px] animate-fadeUp">
      <PageHeader
        title="ניהול סחורות"
        subtitle={`${items?.length ?? 0} פריטים`}
        actions={isManager ? <Button icon="add" onClick={openCreate}>פריט חדש</Button> : undefined}
      />

      <div className="mb-4 inline-flex gap-1 rounded-[12px] border border-border bg-surface-2 p-1">
        {([["items", "מלאי"], ["orders", "הזמנות"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-[10px] px-4 py-2 text-[14px] font-bold transition ${tab === k ? "text-white [background:var(--ink)]" : "text-text-2"}`}>{label}</button>
        ))}
      </div>

      {tab === "items" ? (
        (items ?? []).length === 0 ? (
          <EmptyState icon="inventory_2" title="אין פריטים" description="הוסיפו פריטי מלאי עם שם, יחידת מידה ותמונה." action={isManager ? <Button icon="add" onClick={openCreate}>פריט חדש</Button> : undefined} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(items ?? []).map((it) => {
              const empty = it.current_qty === 0;
              return (
                <Card key={it.id} className="flex flex-col overflow-hidden p-0">
                  <div className="relative h-36 bg-surface-2">
                    {it.image_url ? (
                      <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-text-3">
                        <Icon name="inventory_2" size={40} />
                      </div>
                    )}
                    {empty && (
                      <span className="absolute left-3 top-3">
                        <Badge tone="danger">אזל מהמלאי</Badge>
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="text-[15px] font-bold">{it.name}</div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] text-text-3">כמות:</span>
                      <Input
                        type="number"
                        defaultValue={it.current_qty}
                        className="!w-[78px] text-center"
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== it.current_qty) setCount.mutate({ business_id: businessId!, item_id: it.id, employee_id: profile?.id ?? null, quantity: v });
                        }}
                      />
                      <span className="text-[12px] font-semibold text-text-2">{it.unit}</span>
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2">
                      {isManager && (
                        <>
                          <Button variant="secondary" icon="edit" className="flex-1" onClick={() => openEdit(it)}>עריכה</Button>
                          <Button variant="ghost" icon="add_shopping_cart" onClick={() => createOrder.mutate({ business_id: businessId!, item_id: it.id, quantity: 1, ordered_by: profile?.id })}>
                            הזמנה
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        (orders ?? []).length === 0 ? (
          <EmptyState icon="local_shipping" title="אין הזמנות" description="הזמנות שתיצרו יופיעו כאן." />
        ) : (
          <Card className="overflow-hidden">
            {(orders ?? []).map((o) => {
              const item = items?.find((i) => i.id === o.item_id);
              const meta = ORDER_META[o.status];
              const next: OrderStatus = o.status === "requested" ? "ordered" : o.status === "ordered" ? "received" : "requested";
              return (
                <div key={o.id} className="flex items-center gap-3 border-b border-border-2 px-4 py-3 last:border-0">
                  {item?.image_url ? (
                    <img src={item.image_url} alt={item.name} className="h-10 w-10 flex-none rounded-[10px] object-cover" />
                  ) : (
                    <span className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-surface-2 text-text-3">
                      <Icon name="inventory_2" size={20} />
                    </span>
                  )}
                  <div className="flex-1">
                    <div className="text-[14px] font-bold">{item?.name ?? "פריט"}</div>
                    <div className="text-[12px] text-text-3">{new Date(o.created_at).toLocaleDateString("he-IL")}</div>
                  </div>
                  <span className="text-[13px] font-bold">{o.quantity} {item?.unit}</span>
                  <button onClick={() => isManager && updateOrder.mutate({ id: o.id, status: next })}>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </button>
                </div>
              );
            })}
          </Card>
        )
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "עריכת פריט" : "פריט מלאי חדש"}
        icon="inventory_2"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>ביטול</Button>
            <Button className="flex-1" loading={busy} onClick={submitItem}>{editing ? "שמירה" : "הוספה"}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative flex h-36 flex-col items-center justify-center gap-2 overflow-hidden rounded-[13px] border border-dashed border-border bg-surface-2 text-text-3 hover:border-accent-2 hover:text-ink"
          >
            {form.file || form.imageUrl ? (
              <>
                <img
                  src={form.file ? URL.createObjectURL(form.file) : form.imageUrl!}
                  alt="תמונת מוצר"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <span className="relative rounded-full bg-black/50 px-3 py-1 text-[12px] font-semibold text-white">החלפת תמונה</span>
              </>
            ) : (
              <>
                <Icon name="add_a_photo" size={34} />
                <span className="text-[13.5px] font-semibold">העלאת תמונת מוצר</span>
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
                  <option key={u.value} value={u.value}>{u.label}</option>
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
