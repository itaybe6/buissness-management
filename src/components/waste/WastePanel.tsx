import { useEffect, useMemo, useRef, useState } from "react";
import { Button, EmptyState, Field, Icon, Input, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId, addDays, todayISO, toISODate } from "@/lib/db";
import type { ItemWithQty } from "@/api/inventory";
import { mainUnitToPieces, supportsPieceInput } from "@/api/inventory";
import { DualUnitQtyInput } from "@/components/inventory/DualUnitQtyInput";
import { useWaste, useCreateWaste } from "@/api/waste";
import { useProfiles } from "@/api/users";
import type { InventoryWaste } from "@/types/database";

type WasteForm = { itemId: string; qty: number; note: string };
const EMPTY_FORM: WasteForm = { itemId: "", qty: 1, note: "" };

type StockStatus = "empty" | "low" | "ok";
type WasteTone = "info" | "warning";

const WASTE_STATUS: Record<"deducted" | "reported", { label: string; tone: WasteTone; icon: string }> = {
  deducted: { label: "הופחת מהמלאי", tone: "info", icon: "inventory_2" },
  reported: { label: "דווח בלבד", tone: "warning", icon: "report" },
};

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

function wasteDay(iso: string) {
  return toISODate(new Date(iso));
}

function formatWasteTimeRelative(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  const time = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (diffMin < 1) return "ממש עכשיו";
  if (diffMin < 60) return `לפני ${diffMin} דק׳`;
  if (d.toDateString() === now.toDateString()) return `היום · ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `אתמול · ${time}`;
  const date = d.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
  return `${date} · ${time}`;
}

function formatWasteExact(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false });
  const date = d.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });
  return `${date} · ${time}`;
}

function wasteDayLabel(day: string) {
  const today = todayISO();
  if (day === today) return "היום";
  if (day === addDays(today, -1)) return "אתמול";
  const d = new Date(`${day}T00:00:00`);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const weekday = d.toLocaleDateString("he-IL", { weekday: "long" });
  const date = d.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "numeric",
    ...(sameYear ? {} : { year: "numeric" as const }),
  });
  return `${weekday} · ${date}`;
}

type WasteDayGroup = { day: string; label: string; items: InventoryWaste[] };

function groupWasteByDay(list: InventoryWaste[]): WasteDayGroup[] {
  const groups: WasteDayGroup[] = [];
  for (const w of list) {
    const day = wasteDay(w.created_at);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(w);
    else groups.push({ day, label: wasteDayLabel(day), items: [w] });
  }
  return groups;
}

function formatWasteQty(record: InventoryWaste, item?: ItemWithQty): string {
  const unit = item?.unit ? ` ${item.unit}` : "";
  const base = `−${record.quantity}${unit}`;
  if (item && supportsPieceInput(item.unit) && item.units_per_package) {
    return `${base} (${mainUnitToPieces(Number(record.quantity), item.units_per_package)} יח׳)`;
  }
  return base;
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
              <span className="flex-none text-[12px] font-bold tabular-nums text-text-3">
                {selected.current_qty}
                {selected.unit ? ` ${selected.unit}` : ""}
              </span>
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
                      <span className="text-[12px] font-bold tabular-nums text-text-3">
                        {it.current_qty}
                        {it.unit ? ` ${it.unit}` : ""}
                      </span>
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

function WasteRow({
  record,
  item,
  reporter,
  index,
  expanded,
  onToggle,
}: {
  record: InventoryWaste;
  item?: ItemWithQty;
  reporter?: string;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusKey = record.deducted ? "deducted" : "reported";
  const meta = WASTE_STATUS[statusKey];
  const title = item?.name ?? "פריט";

  return (
    <article
      className="fault-row"
      data-tone={meta.tone}
      data-expanded={expanded}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <button type="button" className="fault-row__head" onClick={onToggle} aria-expanded={expanded}>
        <span className="fault-row__edge" aria-hidden />

        {item?.image_url ? (
          <span className="fault-row__thumb">
            <img src={item.image_url} alt="" loading="lazy" />
          </span>
        ) : (
          <span className="fault-row__thumb fault-row__thumb--icon">
            <Icon name="delete_sweep" size={22} />
          </span>
        )}

        <span className="fault-row__copy">
          <span className="fault-row__title">{title}</span>
          <span className="fault-row__meta">
            <span className="fault-row__pill">
              <span className="fault-row__pill-dot" aria-hidden />
              {meta.label}
            </span>
            <span className="fault-row__meta-sep" aria-hidden>
              ·
            </span>
            <time dateTime={record.created_at}>{formatWasteTimeRelative(record.created_at)}</time>
            {reporter && (
              <>
                <span className="fault-row__meta-sep" aria-hidden>
                  ·
                </span>
                <span className="fault-row__meta-reporter">{reporter}</span>
              </>
            )}
          </span>
        </span>

        <span className="fault-row__chevron" aria-hidden>
          <Icon name="expand_more" size={19} />
        </span>
      </button>

      <div className="fault-row__panel">
        <div className="fault-row__panel-inner">
          {item?.image_url && (
            <div className="fault-media fault-media--tall">
              <img src={item.image_url} alt={title} className="h-full w-full object-cover" />
            </div>
          )}
          <div className="fault-row__details">
            <div className="waste-row__qty">
              {formatWasteQty(record, item)}
            </div>

            {record.note && <p className="waste-row__note">{record.note}</p>}

            <div className="fault-row__stamp">
              <Icon name="schedule" size={14} />
              <span>{formatWasteExact(record.created_at)}</span>
              {reporter && (
                <>
                  <span className="fault-row__meta-sep" aria-hidden>
                    ·
                  </span>
                  <Icon name="person" size={14} />
                  <span>{reporter}</span>
                </>
              )}
            </div>

            <div className="fault-row__seg">
              <span className="fault-row__seg-label">סטטוס בלאי</span>
              <div
                className="inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[11px] font-extrabold"
                style={{
                  color: `var(--${meta.tone})`,
                  background: `color-mix(in srgb, var(--${meta.tone}) 14%, var(--surface))`,
                }}
              >
                <Icon name={meta.icon} size={14} />
                {meta.label}
              </div>
            </div>
          </div>
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
  records,
  totalRecords,
  reportOpen,
  onReportOpenChange,
  onClearFilters,
}: {
  items: ItemWithQty[];
  records?: InventoryWaste[];
  totalRecords?: number;
  reportOpen: boolean;
  onReportOpenChange: (open: boolean) => void;
  onClearFilters?: () => void;
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const wasteList = records ?? waste ?? [];
  const hasAnyRecords = (totalRecords ?? waste?.length ?? 0) > 0;

  const reporterById = useMemo(() => {
    const map = new Map<string, string>();
    (profiles ?? []).forEach((p) => map.set(p.id, p.full_name ?? "משתמש"));
    return map;
  }, [profiles]);

  const dayGroups = useMemo(() => groupWasteByDay(wasteList), [wasteList]);
  const indexById = useMemo(() => new Map(wasteList.map((w, i) => [w.id, i])), [wasteList]);

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
      {!hasAnyRecords ? (
        <WasteEmptyState onReport={() => onReportOpenChange(true)} />
      ) : wasteList.length === 0 ? (
        <EmptyState
          icon="search_off"
          title="לא נמצאו דיווחי בלאי"
          description="נסו מילת חיפוש אחרת או שנו את הסינון."
          action={
            onClearFilters ? (
              <Button variant="secondary" onClick={onClearFilters}>
                ניקוי סינון
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="faults-feed">
          {dayGroups.map((group) => (
            <section key={group.day} className="faults-day">
              <header className="faults-day__head">
                <span className="faults-day__label">{group.label}</span>
                <span className="faults-day__count">{group.items.length}</span>
                <span className="faults-day__line" aria-hidden />
              </header>
              <div className="faults-day__list">
                {group.items.map((w) => (
                  <WasteRow
                    key={w.id}
                    record={w}
                    item={items.find((i) => i.id === w.item_id)}
                    reporter={w.employee_id ? reporterById.get(w.employee_id) : undefined}
                    index={indexById.get(w.id) ?? 0}
                    expanded={expandedId === w.id}
                    onToggle={() => setExpandedId((prev) => (prev === w.id ? null : w.id))}
                  />
                ))}
              </div>
            </section>
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
