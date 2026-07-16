import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button, EmptyState, ErrorState, Icon, Input } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId, HE_DAYS } from "@/lib/db";
import {
  useInventory,
  useOrders,
  useCreateOrdersBatch,
  useUpdateOrdersBatch,
  INVENTORY_CATEGORIES,
  inventoryCategoryLabel,
  inventorySaveError,
  canUsePieceInput,
  piecesToMainUnit,
  formatQtyWithPieces,
  isTrackedLowStock,
  type ItemWithQty,
} from "@/api/inventory";

/** Quantity draft per product: whole packages in the item's main unit + loose single pieces. */
type QtyDraft = { packs: number; pieces: number };

const CATEGORY_ICONS: Record<string, string> = {
  dairy: "egg_alt",
  alcohol: "liquor",
  dry: "grain",
  beverages: "local_cafe",
  meat_fish: "set_meal",
  produce: "nutrition",
  frozen: "ac_unit",
  cleaning: "cleaning_services",
  other: "category",
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function isDual(item: ItemWithQty): boolean {
  return canUsePieceInput(item.unit, item.units_per_package);
}

/** Total order quantity in the item's main unit (packs + pieces converted). */
function draftTotal(item: ItemWithQty, draft: QtyDraft): number {
  const fromPieces = isDual(item) && draft.pieces > 0 ? piecesToMainUnit(draft.pieces, item.units_per_package!) : 0;
  return round4(draft.packs + fromPieces);
}

/** Human label, e.g. "2 ארגז + 5 יח׳" or "3 ק״ג". */
function draftLabel(item: ItemWithQty, draft: QtyDraft): string {
  const unit = item.unit ?? "יחידות";
  const parts: string[] = [];
  if (draft.packs > 0) parts.push(`${draft.packs} ${unit}`);
  if (isDual(item) && draft.pieces > 0) parts.push(`${draft.pieces} יח׳`);
  return parts.length ? parts.join(" + ") : `0 ${unit}`;
}

/** Split a stored main-unit quantity back into whole packs + loose pieces for editing. */
function decomposeQty(item: ItemWithQty | undefined, qty: number): QtyDraft {
  if (!item || !isDual(item)) return { packs: qty, pieces: 0 };
  const factor = item.units_per_package!;
  let packs = Math.floor(qty + 1e-9);
  let pieces = Math.round((qty - packs) * factor);
  if (pieces >= factor) {
    packs += 1;
    pieces = 0;
  }
  return { packs, pieces };
}

function formatDeliveryDay(day: number | null | undefined): string {
  if (day == null || day < 0 || day > 6) return "לא הוגדר";
  return `יום ${HE_DAYS[day]}`;
}

type StockStatus = "empty" | "low" | "ok";

function stockStatus(item: ItemWithQty): StockStatus {
  if (item.current_qty === 0) return "empty";
  const threshold = item.min_quantity > 0 ? item.min_quantity : 3;
  if (item.current_qty <= threshold) return "low";
  return "ok";
}

const STOCK_META: Record<StockStatus, { label: string; dot: string }> = {
  empty: { label: "אזל", dot: "var(--danger)" },
  low: { label: "נמוך", dot: "var(--warning)" },
  ok: { label: "במלאי", dot: "var(--success)" },
};

/* ----------------------------- Stepper control ----------------------------- */

function StepControl({
  value,
  onChange,
  integer = false,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  integer?: boolean;
  ariaLabel: string;
}) {
  const [text, setText] = useState(value > 0 ? String(value) : "");

  useEffect(() => {
    setText(value > 0 ? String(value) : "");
  }, [value]);

  function commitText() {
    const n = Number(text.replace(",", "."));
    const v = !Number.isFinite(n) || n <= 0 ? 0 : integer ? Math.round(n) : round4(n);
    if (v !== value) onChange(v);
    else setText(v > 0 ? String(v) : "");
  }

  return (
    <div className="ordc-step">
      <button
        type="button"
        className="ordc-step-btn"
        aria-label={`הפחתת ${ariaLabel}`}
        onClick={() => onChange(Math.max(0, round4(value - 1)))}
      >
        <Icon name="remove" size={16} />
      </button>
      <input
        className="ordc-step-input"
        inputMode={integer ? "numeric" : "decimal"}
        placeholder="0"
        value={text}
        aria-label={ariaLabel}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <button
        type="button"
        className="ordc-step-btn ordc-step-btn--add"
        aria-label={`הוספת ${ariaLabel}`}
        onClick={() => onChange(round4(value + 1))}
      >
        <Icon name="add" size={16} />
      </button>
    </div>
  );
}

/* ----------------------------- Quantity editor ----------------------------- */

function QtyEditor({
  item,
  draft,
  onPatch,
  dense = false,
}: {
  item: ItemWithQty;
  draft: QtyDraft;
  onPatch: (patch: Partial<QtyDraft>) => void;
  dense?: boolean;
}) {
  const dual = isDual(item);
  const unit = item.unit ?? "יחידות";
  const total = draftTotal(item, draft);

  return (
    <div className={`ordc-steppers ${dense ? "ordc-steppers--dense" : ""}`}>
      <div className="ordc-step-row">
        <span className="ordc-step-label">
          <Icon name="package_2" size={14} />
          {unit}
        </span>
        <StepControl value={draft.packs} onChange={(v) => onPatch({ packs: v })} ariaLabel={`כמות ${unit}`} />
      </div>
      {dual && (
        <div className="ordc-step-row">
          <span className="ordc-step-label">
            <Icon name="counter_1" size={14} />
            יחידות בודדות
          </span>
          <StepControl integer value={draft.pieces} onChange={(v) => onPatch({ pieces: v })} ariaLabel="יחידות בודדות" />
        </div>
      )}
      {dual && (
        <p className="ordc-step-total">
          {total > 0 ? (
            <>
              סה״כ להזמנה: <b>{formatQtyWithPieces(total, item.unit, item.units_per_package)}</b>
            </>
          ) : (
            <>
              1 {unit} = {item.units_per_package} יח׳
            </>
          )}
        </p>
      )}
    </div>
  );
}

/* ----------------------------- Product card ----------------------------- */

function ProductCard({
  item,
  index,
  draft,
  flash,
  onAdd,
  onPatch,
  onRemove,
}: {
  item: ItemWithQty;
  index: number;
  draft: QtyDraft | undefined;
  flash: boolean;
  onAdd: () => void;
  onPatch: (patch: Partial<QtyDraft>) => void;
  onRemove: () => void;
}) {
  const meta = STOCK_META[stockStatus(item)];
  const selected = !!draft;
  const category = inventoryCategoryLabel(item.category);

  return (
    <article
      id={`ordc-item-${item.id}`}
      className="ordc-card inventory-item-enter"
      data-selected={selected}
      data-flash={flash || undefined}
      style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
    >
      <div className="ordc-card-img">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} loading="lazy" />
        ) : (
          <span className="ordc-card-img-fallback">
            <Icon name="inventory_2" size={30} />
          </span>
        )}
        <span
          className="ordc-badge-stock"
          style={{ background: `color-mix(in srgb, ${meta.dot} 16%, var(--surface))`, color: meta.dot }}
        >
          <span className="ordc-badge-dot" style={{ background: meta.dot }} />
          {meta.label}
        </span>
        {item.ordered_qty > 0 && (
          <span className="ordc-badge-ordered">
            <Icon name="local_shipping" size={11} />
            +{item.ordered_qty} בהזמנה
          </span>
        )}
        {selected && draft && (
          <span className="ordc-qty-pill" key={draftLabel(item, draft)}>
            <Icon name="check_circle" size={14} />
            {draftLabel(item, draft)}
          </span>
        )}
      </div>

      <div className="ordc-card-body">
        <div>
          <h3 className="ordc-name">{item.name}</h3>
          {category && <span className="ordc-cat">{category}</span>}
        </div>

        <div className="ordc-meta">
          <span className="ordc-meta-line">
            <Icon name="inventory_2" size={13} />
            במלאי {formatQtyWithPieces(item.current_qty, item.unit, item.units_per_package)}
          </span>
          <span className="ordc-meta-line">
            <Icon name="local_shipping" size={13} />
            אספקה: {formatDeliveryDay(item.supplier_delivery_day)}
          </span>
        </div>

        {selected && draft ? (
          <div className="ordc-card-controls">
            <QtyEditor item={item} draft={draft} onPatch={onPatch} />
            <button type="button" className="ordc-remove-btn" onClick={onRemove}>
              <Icon name="delete" size={14} />
              הסרה מההזמנה
            </button>
          </div>
        ) : (
          <button type="button" className="ordc-add-btn" onClick={onAdd}>
            <Icon name="add_shopping_cart" size={17} />
            הוספה להזמנה
          </button>
        )}
      </div>
    </article>
  );
}

/* ----------------------------- Low-stock strip ----------------------------- */

function RecoStrip({
  items,
  drafts,
  onQuickAdd,
}: {
  items: ItemWithQty[];
  drafts: Record<string, QtyDraft>;
  onQuickAdd: (item: ItemWithQty) => void;
}) {
  return (
    <section className="ordc-reco">
      <div className="ordc-reco-head">
        <span className="ordc-reco-icon">
          <Icon name="notifications_active" size={14} />
        </span>
        <span className="ordc-reco-title">כדאי להזמין · מלאי נמוך</span>
        <span className="ordc-reco-count">{items.length}</span>
      </div>
      <div className="ordc-reco-row">
        {items.map((it) => {
          const d = drafts[it.id];
          return (
            <button
              key={it.id}
              type="button"
              className="ordc-reco-card"
              data-selected={!!d}
              onClick={() => onQuickAdd(it)}
              title={d ? "הוספת עוד אחד" : "הוספה להזמנה"}
            >
              <span className="ordc-reco-thumb">
                {it.image_url ? <img src={it.image_url} alt="" /> : <Icon name="inventory_2" size={16} />}
              </span>
              <span className="ordc-reco-info">
                <span className="ordc-reco-name">{it.name}</span>
                <span className="ordc-reco-stock">
                  במלאי {it.current_qty}
                  {it.unit ? ` ${it.unit}` : ""}
                </span>
              </span>
              <span className="ordc-reco-add">
                {d ? <b className="ordc-reco-qty" key={d.packs}>{d.packs}</b> : <Icon name="add" size={16} />}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ----------------------------- Page ----------------------------- */

export function InventoryOrder() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const batchParam = searchParams.get("batch");
  const isEditing = !!batchParam;
  const canManageOrders = !!(profile && ["manager", "office_manager"].includes(profile.role));

  const { data: items, isLoading, isError, refetch } = useInventory(businessId);
  const { data: orders } = useOrders(businessId, isEditing);
  const createOrdersBatch = useCreateOrdersBatch(businessId);
  const updateOrdersBatch = useUpdateOrdersBatch(businessId);

  const [drafts, setDrafts] = useState<Record<string, QtyDraft>>(() => {
    const preset = searchParams.get("item");
    return preset ? { [preset]: { packs: 1, pieces: 0 } } : {};
  });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [batchMissing, setBatchMissing] = useState(false);
  const editInitRef = useRef(false);
  const presetJumpRef = useRef(false);
  const flashTimer = useRef<number>();

  const list = items ?? [];

  /** Open lines of the batch being edited (batch key = batch_id, or line id for legacy single orders). */
  const editLines = useMemo(() => {
    if (!isEditing || !orders) return null;
    return orders.filter((o) => o.status !== "received" && (o.batch_id ?? o.id) === batchParam);
  }, [orders, isEditing, batchParam]);

  useEffect(() => {
    if (!isEditing || editInitRef.current || !editLines || !items) return;
    editInitRef.current = true;
    if (!editLines.length) {
      setBatchMissing(true);
      return;
    }
    const next: Record<string, QtyDraft> = {};
    for (const line of editLines) {
      next[line.item_id] = decomposeQty(items.find((i) => i.id === line.item_id), Number(line.quantity));
    }
    setDrafts(next);
  }, [isEditing, editLines, items]);

  // When arriving from a product card ("הזמנה" on a specific item) — scroll to it and flash.
  useEffect(() => {
    const preset = searchParams.get("item");
    if (!preset || presetJumpRef.current || !items) return;
    presetJumpRef.current = true;
    window.setTimeout(() => {
      document.getElementById(`ordc-item-${preset}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashId(preset);
      flashTimer.current = window.setTimeout(() => setFlashId(null), 1100);
    }, 350);
  }, [items, searchParams]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const selectedItems = useMemo(
    () =>
      Object.keys(drafts)
        .map((id) => list.find((i) => i.id === id))
        .filter((i): i is ItemWithQty => !!i),
    [drafts, list],
  );

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of list) if (it.category) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
    return INVENTORY_CATEGORIES.filter((c) => counts.has(c.value)).map((c) => ({
      ...c,
      count: counts.get(c.value)!,
    }));
  }, [list]);

  const recoItems = useMemo(() => list.filter(isTrackedLowStock).slice(0, 12), [list]);
  const showReco = recoItems.length > 0 && !query.trim() && category === "all";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((it) => {
      if (category === "low") {
        if (!isTrackedLowStock(it)) return false;
      } else if (category !== "all" && it.category !== category) {
        return false;
      }
      if (q && !it.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [list, query, category]);

  const orderLines = useMemo(
    () =>
      selectedItems
        .map((item) => ({ item_id: item.id, quantity: draftTotal(item, drafts[item.id]!) }))
        .filter((l) => l.quantity > 0),
    [selectedItems, drafts],
  );

  const deliveryLabel = useMemo(() => {
    const days = [
      ...new Set(
        selectedItems
          .map((i) => i.supplier_delivery_day)
          .filter((d): d is number => d != null && d >= 0 && d <= 6),
      ),
    ].sort((a, b) => a - b);
    if (!days.length) return null;
    return days.map((d) => `יום ${HE_DAYS[d]}`).join(" · ");
  }, [selectedItems]);

  const editMeta =
    isEditing && editLines?.length
      ? {
          date: new Date(editLines[0].created_at).toLocaleDateString("he-IL", { day: "numeric", month: "short" }),
          by: editLines[0].ordered_by_name,
        }
      : null;

  function patchDraft(item: ItemWithQty, patch: Partial<QtyDraft>) {
    setError(null);
    setDrafts((prev) => {
      const cur = prev[item.id] ?? { packs: 0, pieces: 0 };
      const next = {
        packs: Math.max(0, patch.packs ?? cur.packs),
        pieces: Math.max(0, patch.pieces ?? cur.pieces),
      };
      if (next.packs <= 0 && next.pieces <= 0) {
        const { [item.id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [item.id]: next };
    });
  }

  function addItem(item: ItemWithQty) {
    patchDraft(item, { packs: (drafts[item.id]?.packs ?? 0) + 1 });
  }

  function removeItem(id: string) {
    setDrafts((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  }

  function clearAll() {
    setDrafts({});
    setError(null);
  }

  /** Scroll the catalog to a selected product (clearing filters if they hide it) and flash it. */
  function jumpToItem(item: ItemWithQty) {
    setSheetOpen(false);
    const visible = filtered.some((i) => i.id === item.id);
    if (!visible) {
      setQuery("");
      setCategory("all");
    }
    window.setTimeout(() => {
      document.getElementById(`ordc-item-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashId(item.id);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlashId(null), 1100);
    }, visible ? 0 : 80);
  }

  function goBack() {
    if (location.key !== "default") navigate(-1);
    else navigate("/inventory?tab=orders", { replace: true });
  }

  async function submit() {
    setError(null);
    if (!orderLines.length) {
      setError("נא לבחור לפחות מוצר אחד עם כמות");
      return;
    }
    setBusy(true);
    try {
      if (isEditing && editLines?.length) {
        await updateOrdersBatch.mutateAsync({
          batch_id: batchParam!,
          business_id: businessId!,
          ordered_by: editLines[0].ordered_by ?? profile?.id ?? null,
          line_ids: editLines.map((l) => l.id),
          lines: orderLines,
        });
      } else {
        await createOrdersBatch.mutateAsync({
          business_id: businessId!,
          ordered_by: profile?.id ?? null,
          lines: orderLines,
        });
      }
      navigate("/inventory?tab=orders", { replace: true });
    } catch (e) {
      setError(inventorySaveError(e));
    } finally {
      setBusy(false);
    }
  }

  if (profile && !canManageOrders) return <Navigate to="/inventory" replace />;

  if (isLoading || (isEditing && !batchMissing && !editInitRef.current)) {
    return (
      <div className="w-full">
        <div className="mb-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-[12px] bg-surface-2" />
          <div>
            <div className="h-6 w-36 rounded-md bg-surface-2" />
            <div className="mt-2 h-3.5 w-52 rounded-md bg-surface-2" />
          </div>
        </div>
        <div className="mb-4 h-11 rounded-[12px] bg-surface-2" />
        <div className="ordc-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-[14px] bg-surface shadow-sm">
              <div className="aspect-[5/3] animate-pulse bg-surface-2" />
              <div className="flex flex-col gap-2 p-3">
                <div className="h-3.5 w-3/4 rounded bg-surface-2" />
                <div className="h-3 w-1/2 rounded bg-surface-2" />
                <div className="h-8 w-full rounded-[10px] bg-surface-2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) return <ErrorState onRetry={refetch} />;

  if (batchMissing) {
    return (
      <div className="w-full animate-fadeUp">
        <EmptyState
          icon="search_off"
          title="ההזמנה לא נמצאה"
          description="ייתכן שההזמנה נמחקה או שכל הפריטים שלה כבר התקבלו במלאי."
          action={
            <Button variant="secondary" icon="arrow_forward" onClick={goBack}>
              חזרה להזמנות
            </Button>
          }
        />
      </div>
    );
  }

  const submitLabel = isEditing ? "שמירת שינויים" : "שליחת הזמנה";

  const errorBox = error && (
    <div className="flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
      <Icon name="error" size={18} className="shrink-0" /> {error}
    </div>
  );

  const cartEmpty = (
    <div className="ordc-cart-empty">
      <span className="ordc-cart-empty-icon">
        <Icon name="add_shopping_cart" size={26} />
      </span>
      <p className="ordc-cart-empty-title">עוד לא נבחרו מוצרים</p>
      <p className="ordc-cart-empty-sub">הוסיפו מוצרים מהרשימה — הם יופיעו כאן לסיכום מהיר לפני השליחה.</p>
    </div>
  );

  return (
    <div className={`ordc-page page-enter w-full ${selectedItems.length ? "pb-36" : "pb-4"} lg:pb-0`}>
      <header className="mb-4 flex items-center gap-3 md:mb-5">
        <button type="button" className="icon-btn shrink-0" onClick={goBack} aria-label="חזרה">
          <Icon name="arrow_forward" size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-extrabold leading-tight tracking-tight md:text-[23px]">
            {isEditing ? "עריכת הזמנה" : "הזמנה חדשה"}
          </h1>
          <p className="mt-0.5 truncate text-[12px] text-text-3 md:text-[13px]">
            {editMeta
              ? `הזמנה מ־${editMeta.date}${editMeta.by ? ` · ${editMeta.by}` : ""}`
              : "בוחרים מוצרים וכמויות — אפשר גם יחידות בודדות מכל מוצר"}
          </p>
        </div>
        {selectedItems.length > 0 && (
          <span className="ordc-head-chip hidden md:inline-flex lg:hidden" key={selectedItems.length}>
            <Icon name="shopping_cart" size={15} />
            {selectedItems.length}
          </span>
        )}
      </header>

      <div className="ordc-layout">
        <section className="min-w-0">
          {list.length === 0 ? (
            <EmptyState
              icon="inventory_2"
              title="אין מוצרים במלאי"
              description="כדי ליצור הזמנה צריך קודם להוסיף מוצרים בעמוד המלאי."
              action={
                <Button variant="secondary" icon="arrow_forward" onClick={goBack}>
                  חזרה למלאי
                </Button>
              }
            />
          ) : (
            <>
              <div className="ordc-toolbar">
                <div className="relative">
                  <Icon
                    name="search"
                    size={18}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-3"
                  />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="חיפוש מוצר..."
                    className="!pr-10"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="ניקוי חיפוש"
                      className="absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>
                <div className="ordc-chips">
                  <button type="button" className="ordc-chip" data-active={category === "all"} onClick={() => setCategory("all")}>
                    הכל
                    <span className="ordc-chip-count">{list.length}</span>
                  </button>
                  {recoItems.length > 0 && (
                    <button type="button" className="ordc-chip" data-active={category === "low"} onClick={() => setCategory("low")}>
                      <Icon name="warning" size={14} />
                      מלאי נמוך
                      <span className="ordc-chip-count">{recoItems.length}</span>
                    </button>
                  )}
                  {categories.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      className="ordc-chip"
                      data-active={category === c.value}
                      onClick={() => setCategory(c.value)}
                    >
                      <Icon name={CATEGORY_ICONS[c.value] ?? "category"} size={14} />
                      {c.label}
                      <span className="ordc-chip-count">{c.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {showReco && <RecoStrip items={recoItems} drafts={drafts} onQuickAdd={addItem} />}

              {filtered.length === 0 ? (
                <EmptyState
                  icon="search_off"
                  title="לא נמצאו מוצרים"
                  description="נסו מילת חיפוש אחרת או קטגוריה אחרת."
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setQuery("");
                        setCategory("all");
                      }}
                    >
                      ניקוי סינון
                    </Button>
                  }
                />
              ) : (
                <div className="ordc-grid">
                  {filtered.map((it, idx) => (
                    <ProductCard
                      key={it.id}
                      item={it}
                      index={idx}
                      draft={drafts[it.id]}
                      flash={flashId === it.id}
                      onAdd={() => addItem(it)}
                      onPatch={(patch) => patchDraft(it, patch)}
                      onRemove={() => removeItem(it.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* Desktop cart panel */}
        <aside className="ordc-cart">
          <div className="ordc-cart-head">
            <span className="ordc-cart-title">
              <Icon name="shopping_cart" size={17} />
              ההזמנה שלי
            </span>
            <span className="ordc-cart-count" key={selectedItems.length}>
              {selectedItems.length}
            </span>
          </div>
          {selectedItems.length === 0 ? (
            cartEmpty
          ) : (
            <>
              <ul className="ordc-cart-lines">
                {selectedItems.map((item) => (
                  <li key={item.id} className="ordc-cart-line">
                    <button
                      type="button"
                      className="ordc-cart-line-main"
                      onClick={() => jumpToItem(item)}
                      title="מעבר למוצר ברשימה"
                    >
                      <span className="ordc-cart-thumb">
                        {item.image_url ? <img src={item.image_url} alt="" /> : <Icon name="inventory_2" size={16} />}
                      </span>
                      <span className="ordc-cart-info">
                        <span className="ordc-cart-name">{item.name}</span>
                        <span className="ordc-cart-qty">{draftLabel(item, drafts[item.id]!)}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="ordc-cart-remove"
                      onClick={() => removeItem(item.id)}
                      aria-label={`הסרת ${item.name}`}
                    >
                      <Icon name="close" size={15} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="ordc-cart-foot">
                {deliveryLabel && (
                  <p className="ordc-cart-delivery">
                    <Icon name="local_shipping" size={14} />
                    אספקה צפויה: {deliveryLabel}
                  </p>
                )}
                {errorBox}
                <Button className="w-full !bg-ink" icon="send" loading={busy} onClick={submit}>
                  {submitLabel} ({selectedItems.length})
                </Button>
                <button type="button" className="ordc-clear" onClick={clearAll}>
                  ניקוי הבחירה
                </button>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Mobile / tablet — sticky summary bar */}
      {selectedItems.length > 0 && (
        <div className="ordc-bar">
          {errorBox}
          <div className="ordc-bar-row">
            <button type="button" className="ordc-bar-summary" onClick={() => setSheetOpen(true)}>
              <span className="ordc-bar-thumbs">
                {selectedItems.slice(0, 3).map((item) => (
                  <span key={item.id} className="ordc-bar-thumb">
                    {item.image_url ? <img src={item.image_url} alt="" /> : <Icon name="inventory_2" size={14} />}
                  </span>
                ))}
              </span>
              <span className="ordc-bar-meta">
                <b key={selectedItems.length}>{selectedItems.length} מוצרים</b>
                <span>לצפייה ועריכה</span>
              </span>
              <Icon name="expand_less" size={18} className="text-text-3" />
            </button>
            <Button className="shrink-0 !bg-ink !px-5" icon="send" loading={busy} onClick={submit}>
              {isEditing ? "שמירה" : "שליחה"}
            </Button>
          </div>
        </div>
      )}

      {/* Mobile / tablet — cart bottom sheet */}
      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="ההזמנה שלי"
        subtitle={`${selectedItems.length} מוצרים נבחרו`}
        icon="shopping_cart"
        maxWidth={520}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSheetOpen(false)} className="active:scale-[0.97]">
              המשך בחירה
            </Button>
            <Button
              className="flex-1 !bg-ink active:scale-[0.97]"
              icon="send"
              loading={busy}
              disabled={selectedItems.length === 0}
              onClick={submit}
            >
              {submitLabel} ({selectedItems.length})
            </Button>
          </>
        }
      >
        {selectedItems.length === 0 ? (
          cartEmpty
        ) : (
          <div className="flex flex-col gap-2.5">
            {deliveryLabel && (
              <p className="ordc-cart-delivery">
                <Icon name="local_shipping" size={14} />
                אספקה צפויה: {deliveryLabel}
              </p>
            )}
            {selectedItems.map((item) => (
              <div key={item.id} className="rounded-[13px] border border-border-2 bg-surface p-3">
                <div className="flex items-center gap-2.5">
                  <span className="ordc-cart-thumb">
                    {item.image_url ? <img src={item.image_url} alt="" /> : <Icon name="inventory_2" size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">{item.name}</span>
                    <span className="mt-0.5 block text-[11px] font-medium text-text-3">
                      במלאי {item.current_qty}
                      {item.unit ? ` ${item.unit}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="ordc-cart-remove"
                    onClick={() => removeItem(item.id)}
                    aria-label={`הסרת ${item.name}`}
                  >
                    <Icon name="delete" size={16} />
                  </button>
                </div>
                <div className="mt-2.5">
                  <QtyEditor dense item={item} draft={drafts[item.id]!} onPatch={(patch) => patchDraft(item, patch)} />
                </div>
              </div>
            ))}
            {errorBox}
          </div>
        )}
      </Modal>
    </div>
  );
}
