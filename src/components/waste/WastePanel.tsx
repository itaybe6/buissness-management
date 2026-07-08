import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, EmptyState, Field, Icon, Input, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import type { ItemWithQty } from "@/api/inventory";
import { mainUnitToPieces, supportsPieceInput } from "@/api/inventory";
import { DualUnitQtyInput } from "@/components/inventory/DualUnitQtyInput";
import { useWaste, useCreateWaste } from "@/api/waste";
import { useProfiles } from "@/api/users";
import type { InventoryWaste } from "@/types/database";

type WasteForm = { itemId: string; qty: number; note: string };
const EMPTY_FORM: WasteForm = { itemId: "", qty: 1, note: "" };

type StockStatus = "empty" | "low" | "ok";

function stockStatus(item: ItemWithQty): StockStatus {
  if (item.current_qty === 0) return "empty";
  const threshold = item.min_quantity > 0 ? item.min_quantity : 3;
  if (item.current_qty <= threshold) return "low";
  return "ok";
}

const STOCK_BADGE: Record<StockStatus, { tone: "danger" | "warning" | "success"; label: string; dot: string }> = {
  empty: { tone: "danger", label: "אזל מהמלאי", dot: "var(--danger)" },
  low: { tone: "warning", label: "מלאי נמוך", dot: "var(--warning)" },
  ok: { tone: "success", label: "במלאי", dot: "var(--success)" },
};

function StockBadge({ item }: { item: ItemWithQty }) {
  const status = stockStatus(item);
  const meta = STOCK_BADGE[status];
  return (
    <Badge tone={meta.tone} className="flex-none tabular-nums">
      <Icon name="inventory_2" size={13} />
      {item.current_qty}
      {item.unit ? ` ${item.unit}` : ""}
    </Badge>
  );
}

function WasteItemPicker({
  items,
  value,
  onChange,
}: {
  items: ItemWithQty[];
  value: string;
  onChange: (id: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.name.toLowerCase().includes(q));
  }, [items, query]);

  const selected = items.find((it) => it.id === value);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setQuery("");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function selectItem(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div
      ref={rootRef}
      className={`overflow-hidden rounded-[11px] border bg-surface transition-shadow ${
        open ? "border-[var(--accent-2)] shadow-[0_0_0_3px_var(--focus-ring)]" : "border-border"
      }`}
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="listbox"
          aria-expanded={false}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-right transition-colors hover:bg-surface-2/60"
        >
          {selected ? (
            <>
              <div className="h-10 w-10 flex-none overflow-hidden rounded-[8px] bg-surface-2">
                {selected.image_url ? (
                  <img src={selected.image_url} alt={selected.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full place-items-center text-text-3">
                    <Icon name="inventory_2" size={18} />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold text-text">{selected.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: STOCK_BADGE[stockStatus(selected)].dot }}
                  />
                  <span className="text-[11px] font-medium text-text-3">
                    {STOCK_BADGE[stockStatus(selected)].label}
                  </span>
                </div>
              </div>
              <StockBadge item={selected} />
            </>
          ) : (
            <span className="flex-1 text-[13px] font-semibold text-text-3">בחר מוצר...</span>
          )}
          <Icon name="expand_more" size={20} className="flex-none text-text-3" />
        </button>
      ) : (
        <>
          <div className="relative border-b border-border-2">
            <Icon
              name="search"
              size={18}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-3"
            />
            <Input
              ref={searchRef}
              className="!rounded-none !border-0 !shadow-none focus:!border-0 focus:!shadow-none pr-10"
              placeholder="חיפוש מוצר..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="max-h-[min(240px,40vh)] overflow-y-auto" role="listbox">
            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-text-3">לא נמצאו מוצרים</p>
            ) : (
              filtered.map((it) => {
                const active = it.id === value;
                const status = stockStatus(it);
                const meta = STOCK_BADGE[status];
                return (
                  <button
                    key={it.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => selectItem(it.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-right transition-colors ${
                      active ? "bg-[var(--accent-tint)]" : "hover:bg-surface-2"
                    }`}
                  >
                    <div className="h-10 w-10 flex-none overflow-hidden rounded-[8px] bg-surface-2">
                      {it.image_url ? (
                        <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="grid h-full place-items-center text-text-3">
                          <Icon name="inventory_2" size={18} />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-[13px] font-bold ${active ? "text-[var(--accent-2)]" : "text-text"}`}>
                        {it.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
                        <span className="text-[11px] font-medium text-text-3">{meta.label}</span>
                      </div>
                    </div>
                    <div className="flex flex-none items-center gap-2">
                      <StockBadge item={it} />
                      {active && <Icon name="check" size={18} className="text-[var(--accent-2)]" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

function WasteCard({
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
  const date = new Date(record.created_at).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <article
      className="inventory-card inventory-item-enter flex flex-col overflow-hidden rounded-card border-0 bg-surface"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className="inventory-card-image relative aspect-[5/4] overflow-hidden bg-surface-2">
        {item?.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="h-full w-full object-cover transition-transform duration-[400ms] [transition-timing-function:var(--ease-out)]"
          />
        ) : (
          <div className="grid h-full place-items-center text-text-3/70">
            <Icon name="delete_sweep" size={36} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 pb-3 pt-8">
          <div className="text-[22px] font-extrabold tabular-nums leading-none text-white">
            −{record.quantity}
            {item?.unit ? <span className="mr-1 text-[13px] font-semibold opacity-90">{item.unit}</span> : null}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-[15px] font-bold leading-snug tracking-tight">{item?.name ?? "פריט"}</h3>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 text-[12px] text-text-3">
          <span className="inline-flex items-center gap-1">
            <Icon name="event" size={14} />
            {date}
          </span>
          {reporter && (
            <span className="inline-flex items-center gap-1">
              <Icon name="person" size={14} />
              {reporter}
            </span>
          )}
        </div>

        {record.note && (
          <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-text-2">{record.note}</p>
        )}

        <div className="mt-auto pt-4">
          <Badge tone={record.deducted ? "info" : "neutral"} className="w-full justify-center">
            {record.deducted ? "הופחת מהמלאי" : "דווח בלבד"}
          </Badge>
        </div>
      </div>
    </article>
  );
}

function WasteEmptyState({ onReport }: { onReport: () => void }) {
  return (
    <div className="inventory-orders-empty inventory-item-enter">
      <div className="inventory-orders-empty-icon">
        <Icon name="delete_sweep" size={32} />
      </div>
      <h3 className="mt-5 text-[17px] font-extrabold tracking-tight text-text">אין דיווחי בלאי</h3>
      <p className="mt-2 max-w-[34ch] text-[13px] leading-relaxed text-text-3">
        דווחו על מוצרים שנפסלו או התבזבזו, ובחרו אם להפחית אותם מהמלאי.
      </p>
      <Button icon="add" onClick={onReport} className="mt-5 !bg-ink shadow-sm hover:brightness-110 active:scale-[0.97]">
        דיווח בלאי
      </Button>
    </div>
  );
}

export function WastePanel({
  items,
  reportOpen,
  onReportOpenChange,
}: {
  items: ItemWithQty[];
  reportOpen: boolean;
  onReportOpenChange: (open: boolean) => void;
}) {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: waste } = useWaste(businessId);
  const { data: profiles } = useProfiles(businessId);
  const createWaste = useCreateWaste(businessId);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [form, setForm] = useState<WasteForm>(EMPTY_FORM);
  const [pending, setPending] = useState<{ item: ItemWithQty; qty: number; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasteList = waste ?? [];

  const reporterById = useMemo(() => {
    const map = new Map<string, string>();
    (profiles ?? []).forEach((p) => map.set(p.id, p.full_name ?? "משתמש"));
    return map;
  }, [profiles]);

  useEffect(() => {
    if (reportOpen) {
      setForm({ ...EMPTY_FORM, itemId: items[0]?.id ?? "" });
      setError(null);
    }
  }, [reportOpen, items]);

  function submitReport() {
    setError(null);
    const item = items.find((i) => i.id === form.itemId);
    if (!item) return setError("נא לבחור מוצר");
    if (!form.qty || form.qty <= 0) return setError("נא להזין כמות גדולה מ-0");
    setPending({ item, qty: form.qty, note: form.note.trim() });
    onReportOpenChange(false);
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

  if (items.length === 0) {
    return (
      <EmptyState
        icon="inventory_2"
        title="אין מוצרים במלאי"
        description="כדי לדווח על בלאי יש להוסיף תחילה פריטים בלשונית המלאי."
      />
    );
  }

  return (
    <>
      {wasteList.length === 0 ? (
        <WasteEmptyState onReport={() => onReportOpenChange(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {wasteList.map((w, idx) => (
            <WasteCard
              key={w.id}
              record={w}
              item={items.find((i) => i.id === w.item_id)}
              reporter={w.employee_id ? reporterById.get(w.employee_id) : undefined}
              index={idx}
            />
          ))}
        </div>
      )}

      <Modal
        open={reportOpen}
        onClose={() => onReportOpenChange(false)}
        title="דיווח בלאי"
        icon="delete_sweep"
        footer={
          <>
            <Button variant="secondary" onClick={() => onReportOpenChange(false)} className="active:scale-[0.97]">
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
            <WasteItemPicker
              key={reportOpen ? "open" : "closed"}
              items={items}
              value={form.itemId}
              onChange={(id) => setForm((f) => ({ ...f, itemId: id, qty: 1 }))}
            />
          </Field>

          <Field label="כמות בלאי">
            {(() => {
              const item = items.find((i) => i.id === form.itemId);
              return (
                <DualUnitQtyInput
                  value={form.qty}
                  mainUnit={item?.unit ?? null}
                  unitsPerPackage={item?.units_per_package ?? null}
                  onCommit={(q) => setForm((f) => ({ ...f, qty: q }))}
                  variant="input"
                  min={0.01}
                />
              );
            })()}
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
              דווח בלאי של{" "}
              <span className="font-bold text-text">
                {pending.qty}
                {pending.item.unit ? ` ${pending.item.unit}` : ""} {pending.item.name}
                {supportsPieceInput(pending.item.unit) && pending.item.units_per_package
                  ? ` (${mainUnitToPieces(pending.qty, pending.item.units_per_package)} יח׳)`
                  : ""}
              </span>
              . האם להפחית את הכמות הזו מהמלאי?
            </p>
            <div className="flex items-center justify-between rounded-[12px] border border-border bg-surface-2 px-4 py-3">
              <span className="text-[13px] font-semibold text-text-3">מלאי לאחר הפחתה</span>
              <span className="text-[15px] font-extrabold tabular-nums">
                {pending.item.current_qty}{" "}
                <Icon name="arrow_back" size={15} className="mx-1 inline align-middle text-text-3" />{" "}
                {Math.max(0, pending.item.current_qty - pending.qty)}
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
    </>
  );
}
