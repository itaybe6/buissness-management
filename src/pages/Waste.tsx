import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Icon, Input, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { useInventory, type ItemWithQty } from "@/api/inventory";
import { useWaste, useCreateWaste } from "@/api/waste";
import { useProfiles } from "@/api/users";
import type { InventoryWaste } from "@/types/database";

type WasteForm = { itemId: string; qty: string; note: string };
const EMPTY_FORM: WasteForm = { itemId: "", qty: "1", note: "" };

function WasteRow({
  record,
  item,
  reporter,
  index,
}: {
  record: InventoryWaste;
  item?: ItemWithQty;
  reporter?: string;
  index: number;
}) {
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
            <Icon name="delete_sweep" size={20} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-bold">{item?.name ?? "פריט"}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-text-3">
          <span>
            {new Date(record.created_at).toLocaleDateString("he-IL", { day: "numeric", month: "short" })}
          </span>
          {reporter && <span>· {reporter}</span>}
          {record.note && <span className="truncate">· {record.note}</span>}
        </div>
      </div>

      <div className="text-left">
        <div className="text-[13px] font-bold tabular-nums text-danger">
          −{record.quantity}
          {item?.unit ? ` ${item.unit}` : ""}
        </div>
        <div className="mt-1">
          <Badge tone={record.deducted ? "info" : "neutral"}>
            {record.deducted ? "הופחת מהמלאי" : "דווח בלבד"}
          </Badge>
        </div>
      </div>
    </div>
  );
}

export function Waste() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: items, isLoading, isError, refetch } = useInventory(businessId);
  const { data: waste } = useWaste(businessId);
  const { data: profiles } = useProfiles(businessId);
  const createWaste = useCreateWaste(businessId);

  const [reportOpen, setReportOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [form, setForm] = useState<WasteForm>(EMPTY_FORM);
  const [pending, setPending] = useState<{ item: ItemWithQty; qty: number; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemList = items ?? [];
  const wasteList = waste ?? [];

  const reporterById = useMemo(() => {
    const map = new Map<string, string>();
    (profiles ?? []).forEach((p) => map.set(p.id, p.full_name ?? "משתמש"));
    return map;
  }, [profiles]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[820px]">
        <header className="mb-6">
          <div className="h-8 w-32 rounded-md bg-surface-2" />
          <div className="mt-2 h-4 w-48 rounded-md bg-surface-2" />
        </header>
        <div className="h-[280px] rounded-card border border-border bg-surface" />
      </div>
    );
  }
  if (isError) return <ErrorState onRetry={refetch} />;

  function openReport() {
    setForm({ ...EMPTY_FORM, itemId: itemList[0]?.id ?? "" });
    setError(null);
    setReportOpen(true);
  }

  function submitReport() {
    setError(null);
    const item = itemList.find((i) => i.id === form.itemId);
    if (!item) return setError("נא לבחור מוצר");
    const qty = Number(form.qty);
    if (!qty || qty <= 0) return setError("נא להזין כמות גדולה מ-0");
    setPending({ item, qty, note: form.note.trim() });
    setReportOpen(false);
    setConfirmOpen(true);
  }

  async function finalize(deduct: boolean) {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await createWaste.mutateAsync({
        business_id: businessId!,
        item_id: pending.item.id,
        employee_id: profile?.id ?? null,
        quantity: pending.qty,
        note: pending.note || null,
        deductFromInventory: deduct,
        currentQty: pending.item.current_qty,
      });
      setConfirmOpen(false);
      setPending(null);
      setForm(EMPTY_FORM);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בשמירת הבלאי");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[820px] animate-fadeUp">
      <header className="mb-6 flex flex-wrap items-center justify-end gap-4">
        <Button
          icon="add"
          onClick={openReport}
          disabled={itemList.length === 0}
          className="!bg-ink shadow-sm hover:brightness-110 active:scale-[0.97]"
        >
          דיווח בלאי
        </Button>
      </header>

      {itemList.length === 0 ? (
        <EmptyState
          icon="inventory_2"
          title="אין מוצרים במלאי"
          description="כדי לדווח על בלאי יש להוסיף תחילה פריטים בעמוד הסחורות."
        />
      ) : wasteList.length === 0 ? (
        <EmptyState
          icon="delete_sweep"
          title="אין דיווחי בלאי"
          description="דווחו על מוצרים שנפסלו או התבזבזו, ובחרו אם להפחית אותם מהמלאי."
          action={<Button icon="add" onClick={openReport}>דיווח בלאי</Button>}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          {wasteList.map((w, idx) => (
            <WasteRow
              key={w.id}
              record={w}
              item={items?.find((i) => i.id === w.item_id)}
              reporter={w.employee_id ? reporterById.get(w.employee_id) : undefined}
              index={idx}
            />
          ))}
        </Card>
      )}

      {/* Report form */}
      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="דיווח בלאי"
        icon="delete_sweep"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReportOpen(false)} className="active:scale-[0.97]">
              ביטול
            </Button>
            <Button className="flex-1 !bg-ink active:scale-[0.97]" onClick={submitReport}>
              המשך
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <Field label="סוג מוצר">
            <Select value={form.itemId} onChange={(e) => setForm((f) => ({ ...f, itemId: e.target.value }))}>
              {itemList.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name} (במלאי: {it.current_qty}{it.unit ? ` ${it.unit}` : ""})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="כמות בלאי">
            <Input
              type="number"
              min={1}
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
            />
          </Field>

          <Field label="סיבה (אופציונלי)">
            <Textarea
              rows={2}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="לדוגמה: פג תוקף, נשבר, נפסל"
            />
          </Field>

          {error && (
            <div className="flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
              <Icon name="error" size={18} /> {error}
            </div>
          )}
        </div>
      </Modal>

      {/* Confirm deduction */}
      <Modal
        open={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        title="להוריד מהמלאי?"
        icon="inventory_2"
        footer={
          <>
            <Button variant="secondary" loading={busy} onClick={() => finalize(false)} className="flex-1 active:scale-[0.97]">
              לא, רק דווח
            </Button>
            <Button className="flex-1 !bg-ink active:scale-[0.97]" loading={busy} onClick={() => finalize(true)}>
              כן, הורד מהמלאי
            </Button>
          </>
        }
      >
        {pending && (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] leading-relaxed text-text-2">
              דווח בלאי של <span className="font-bold text-text">{pending.qty}{pending.item.unit ? ` ${pending.item.unit}` : ""} {pending.item.name}</span>.
              האם להפחית את הכמות הזו מהמלאי?
            </p>
            <div className="flex items-center justify-between rounded-[12px] border border-border bg-surface-2 px-4 py-3">
              <span className="text-[13px] font-semibold text-text-3">מלאי לאחר הפחתה</span>
              <span className="text-[15px] font-extrabold tabular-nums">
                {pending.item.current_qty} <Icon name="arrow_back" size={15} className="mx-1 inline align-middle text-text-3" /> {Math.max(0, pending.item.current_qty - pending.qty)}
                {pending.item.unit ? ` ${pending.item.unit}` : ""}
              </span>
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
                <Icon name="error" size={18} /> {error}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
