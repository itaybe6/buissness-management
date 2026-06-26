import { useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Icon, Input, PageHeader, PageLoader, ErrorState } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import {
  useInventory,
  useCreateItem,
  useSetCount,
  useOrders,
  useCreateOrder,
  useUpdateOrder,
} from "@/api/inventory";
import type { OrderStatus } from "@/types/database";

const ORDER_META: Record<OrderStatus, { label: string; tone: "warning" | "info" | "success" }> = {
  requested: { label: "ממתין", tone: "warning" },
  ordered: { label: "הוזמן", tone: "info" },
  received: { label: "התקבל", tone: "success" },
};

export function Inventory() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: items, isLoading, isError, refetch } = useInventory(businessId);
  const { data: orders } = useOrders(businessId);
  const createItem = useCreateItem();
  const setCount = useSetCount(businessId);
  const createOrder = useCreateOrder(businessId);
  const updateOrder = useUpdateOrder(businessId);
  const [tab, setTab] = useState<"items" | "orders">("items");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("יח׳");
  const [min, setMin] = useState("0");

  const isManager = profile && ["manager", "department_manager", "shift_manager", "office_manager"].includes(profile.role);

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const lowCount = (items ?? []).filter((i) => i.current_qty <= i.min_quantity).length;

  return (
    <div className="mx-auto max-w-[1000px] animate-fadeUp">
      <PageHeader
        title="ניהול סחורות"
        subtitle={`${items?.length ?? 0} פריטים · ${lowCount} במלאי נמוך`}
        actions={isManager ? <Button icon="add" onClick={() => setOpen(true)}>פריט חדש</Button> : undefined}
      />

      <div className="mb-4 inline-flex gap-1 rounded-[12px] border border-border bg-surface-2 p-1">
        {([["items", "מלאי"], ["orders", "הזמנות"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-[10px] px-4 py-2 text-[14px] font-bold transition ${tab === k ? "text-white [background:var(--ink)]" : "text-text-2"}`}>{label}</button>
        ))}
      </div>

      {tab === "items" ? (
        (items ?? []).length === 0 ? (
          <EmptyState icon="inventory_2" title="אין פריטים" description="הוסיפו פריטי מלאי לניהול." action={isManager ? <Button icon="add" onClick={() => setOpen(true)}>פריט חדש</Button> : undefined} />
        ) : (
          <Card className="overflow-hidden">
            {(items ?? []).map((it) => {
              const low = it.current_qty <= it.min_quantity;
              return (
                <div key={it.id} className="flex flex-wrap items-center gap-3 border-b border-border-2 px-4 py-3 last:border-0">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-[11px]" style={{ background: low ? "var(--danger-bg)" : "var(--surface-2)" }}>
                    <Icon name="inventory_2" size={20} style={{ color: low ? "var(--danger)" : "var(--text-2)" }} />
                  </span>
                  <div className="min-w-[110px] flex-1">
                    <div className="text-[14px] font-bold">{it.name}</div>
                    <div className="text-[12px] text-text-3">מינ׳ {it.min_quantity} {it.unit}</div>
                  </div>
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
                    <span className="text-[12px] text-text-3">{it.unit}</span>
                  </div>
                  {low && <Badge tone="danger">מלאי נמוך</Badge>}
                  {isManager && (
                    <Button variant="ghost" icon="add_shopping_cart" onClick={() => createOrder.mutate({ business_id: businessId!, item_id: it.id, quantity: Math.max(it.min_quantity - it.current_qty, 1), ordered_by: profile?.id })}>
                      הזמנה
                    </Button>
                  )}
                </div>
              );
            })}
          </Card>
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
                  <div className="flex-1"><div className="text-[14px] font-bold">{item?.name ?? "פריט"}</div><div className="text-[12px] text-text-3">{new Date(o.created_at).toLocaleDateString("he-IL")}</div></div>
                  <span className="text-[13px] font-bold">{o.quantity} {item?.unit}</span>
                  <button onClick={() => isManager && updateOrder.mutate({ id: o.id, status: next })}><Badge tone={meta.tone}>{meta.label}</Badge></button>
                </div>
              );
            })}
          </Card>
        )
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="פריט מלאי חדש"
        icon="inventory_2"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>ביטול</Button>
            <Button className="flex-1" loading={createItem.isPending} onClick={async () => { if (!name.trim()) return; await createItem.mutateAsync({ business_id: businessId!, name: name.trim(), unit, min_quantity: Number(min) || 0 }); setOpen(false); setName(""); }}>הוספה</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <Field label="שם הפריט"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: חלב 3%" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="יחידת מידה"><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="יח׳ / ק״ג / ליטר" /></Field>
            <Field label="כמות מינימום"><Input type="number" value={min} onChange={(e) => setMin(e.target.value)} /></Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
