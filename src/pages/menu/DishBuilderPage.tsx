import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, EmptyState, ErrorState, Field, Icon, Input, LoadingOverlay, PageLoader, Select, Textarea } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { canManageMenu } from "@/lib/constants";
import { inventoryItemMatchesQuery } from "@/api/inventory";
import { uploadDishImage, useCreateDish, useUpdateDish, type ComponentInput, type DishInput } from "@/api/menu";
import {
  MEASURE_LABELS,
  componentUnitLabel,
  costDish,
  dishEconomics,
  economicsAtPrice,
  formatMoney,
  formatPct,
  formatQty,
  itemContentPerMainUnit,
  menuSaveError,
  resolveItemPrice,
  unitOptionsForMeasure,
  type CostingContext,
  type DishCost,
  type LineCost,
} from "@/lib/menuCosting";
import type { InventoryItem, MenuComponentUnit, MenuDish, MenuDishComponent } from "@/types/database";
import { ItemConversionModal } from "./ItemConversionModal";
import { FoodCostRing, IssueList, Monogram, ShareBar, SplitBar, StatusPill } from "./menuShared";
import { useMenuCosting, type MenuCostingData } from "./useMenuCosting";

/* ------------------------------------------------------------------ */
/* Draft model                                                         */
/* ------------------------------------------------------------------ */

interface DraftLine {
  key: string;
  item_id: string;
  quantity: string;
  unit: MenuComponentUnit;
  supplier_id: string | null;
  notes: string | null;
}

interface Draft {
  name: string;
  category_id: string | null;
  description: string;
  image_url: string | null;
  selling_price: string;
  target_food_cost_pct: string;
  monthly_sales: string;
  notes: string;
  lines: DraftLine[];
}

const DRAFT_ID = "__draft__";

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Math.random().toString(36).slice(2)}`;
}

function emptyDraft(): Draft {
  return {
    name: "",
    category_id: null,
    description: "",
    image_url: null,
    selling_price: "",
    target_food_cost_pct: "",
    monthly_sales: "",
    notes: "",
    lines: [],
  };
}

function draftFromDish(dish: MenuDish, components: MenuDishComponent[]): Draft {
  return {
    name: dish.name,
    category_id: dish.category_id,
    description: dish.description ?? "",
    image_url: dish.image_url,
    selling_price: dish.selling_price != null ? String(dish.selling_price) : "",
    target_food_cost_pct: dish.target_food_cost_pct != null ? String(dish.target_food_cost_pct) : "",
    monthly_sales: dish.monthly_sales != null ? String(dish.monthly_sales) : "",
    notes: dish.notes ?? "",
    lines: [...components]
      .filter((c) => c.item_id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({
        key: c.id,
        item_id: c.item_id!,
        quantity: String(c.quantity),
        unit: c.unit,
        supplier_id: c.supplier_id,
        notes: c.notes,
      })),
  };
}

function num(s: string): number {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function draftToComponents(draft: Draft, businessId: string, dishId: string): MenuDishComponent[] {
  return draft.lines.map((l, i) => ({
    id: l.key,
    business_id: businessId,
    dish_id: dishId,
    item_id: l.item_id,
    sub_dish_id: null,
    quantity: Math.max(0, num(l.quantity)),
    unit: l.unit,
    waste_pct: 0,
    supplier_id: l.supplier_id,
    notes: l.notes,
    sort_order: i,
    created_at: "",
  }));
}

function draftToDish(draft: Draft, businessId: string, dishId: string): MenuDish {
  return {
    id: dishId,
    business_id: businessId,
    category_id: draft.category_id,
    kind: "dish",
    name: draft.name,
    description: draft.description || null,
    image_url: draft.image_url,
    selling_price: num(draft.selling_price) > 0 ? num(draft.selling_price) : null,
    yield_qty: 1,
    yield_measure: "unit",
    target_food_cost_pct: num(draft.target_food_cost_pct) > 0 ? num(draft.target_food_cost_pct) : null,
    monthly_sales: num(draft.monthly_sales) > 0 ? Math.round(num(draft.monthly_sales)) : null,
    notes: draft.notes || null,
    sort_order: 0,
    active: true,
    created_at: "",
    updated_at: "",
  };
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function DishBuilderPage() {
  const { dishId } = useParams<{ dishId: string }>();
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isNew = !dishId;

  const { data, isLoading, error, refetch } = useMenuCosting(businessId);
  const create = useCreateDish(businessId);
  const update = useUpdateDish(businessId);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [conversionItem, setConversionItem] = useState<InventoryItem | null>(null);

  // Hydrate the draft once the tree is loaded (or immediately for a new dish).
  useEffect(() => {
    if (!data) return;
    const target = dishId ?? "new";
    if (loadedFor === target) return;
    if (isNew) {
      setDraft(emptyDraft());
    } else {
      const dish = data.ctx.dishes.get(dishId!);
      setDraft(dish ? draftFromDish(dish, data.componentsByDish.get(dish.id) ?? []) : null);
    }
    setLoadedFor(target);
    setDirty(false);
  }, [data, dishId, isNew, loadedFor]);

  useEffect(() => {
    if (!savedFlash) return;
    const t = setTimeout(() => setSavedFlash(false), 1800);
    return () => clearTimeout(t);
  }, [savedFlash]);

  // Guard against losing unsaved work on refresh / tab close.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (ev: BeforeUnloadEvent) => {
      ev.preventDefault();
      ev.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  const effectiveId = dishId ?? DRAFT_ID;

  /** Live cost of the draft: the shared context with this dish swapped for the unsaved version. */
  const live = useMemo(() => {
    if (!data || !draft || !businessId) return null;
    const dish = draftToDish(draft, businessId, effectiveId);
    const components = draftToComponents(draft, businessId, effectiveId);
    const dishes = new Map(data.ctx.dishes);
    dishes.set(effectiveId, dish);
    const componentsByDish = new Map(data.ctx.componentsByDish);
    componentsByDish.set(effectiveId, components);
    const ctx: CostingContext = { ...data.ctx, dishes, componentsByDish };
    const cost = costDish(effectiveId, ctx);
    const economics = dishEconomics(dish, cost, data.settings);
    return { dish, cost, economics, ctx };
  }, [data, draft, businessId, effectiveId]);

  if (!canManageMenu(profile?.role)) return <Navigate to="/inventory" replace />;
  if (!businessId) return <EmptyState icon="store" title="לא משויך לעסק" />;
  if (error) return <ErrorState message={menuSaveError(error)} onRetry={refetch} />;
  if (isLoading || !data || loadedFor === null) return <PageLoader label="טוען את המנה..." />;
  if (!draft || !live) {
    return (
      <EmptyState
        icon="search_off"
        title="המנה לא נמצאה"
        description="אולי נמחקה. חזרו לתפריט."
        action={
          <Link to="/menu">
            <Button variant="secondary" icon="arrow_forward">
              לתפריט
            </Button>
          </Link>
        }
      />
    );
  }

  function patch(p: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setDirty(true);
  }

  function patchLine(key: string, p: Partial<DraftLine>) {
    setDraft((d) => (d ? { ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...p } : l)) } : d));
    setDirty(true);
  }

  function removeLine(key: string) {
    setDraft((d) => (d ? { ...d, lines: d.lines.filter((l) => l.key !== key) } : d));
    setDirty(true);
  }

  function moveLine(key: string, dir: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const idx = d.lines.findIndex((l) => l.key === key);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= d.lines.length) return d;
      const lines = [...d.lines];
      [lines[idx], lines[j]] = [lines[j], lines[idx]];
      return { ...d, lines };
    });
    setDirty(true);
  }

  function addItem(item: InventoryItem) {
    const content = itemContentPerMainUnit(item, data!.conversions.get(item.id) ?? null);
    const unit: MenuComponentUnit = content.measure === "unit" ? (content.pieces ? "piece" : "unit") : content.measure;
    const line: DraftLine = { key: newKey(), item_id: item.id, quantity: "", unit, supplier_id: null, notes: null };
    setDraft((d) => (d ? { ...d, lines: [...d.lines, line] } : d));
    setDirty(true);
  }

  async function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setSaveError(null);
    try {
      const url = await uploadDishImage(businessId!, file);
      patch({ image_url: url });
    } catch (err) {
      setSaveError(menuSaveError(err));
    } finally {
      setUploading(false);
    }
  }

  function validate(): string | null {
    if (!draft!.name.trim()) return "נא להזין שם למנה";
    if (draft!.lines.some((l) => num(l.quantity) <= 0)) return "לכל מרכיב חייבת להיות כמות גדולה מאפס";
    return null;
  }

  async function save() {
    setSaveError(null);
    const v = validate();
    if (v) return setSaveError(v);
    const dishInput: DishInput = {
      category_id: draft!.category_id,
      kind: "dish",
      name: draft!.name.trim(),
      description: draft!.description || null,
      image_url: draft!.image_url,
      selling_price: num(draft!.selling_price) > 0 ? num(draft!.selling_price) : null,
      yield_qty: 1,
      yield_measure: "unit",
      target_food_cost_pct: num(draft!.target_food_cost_pct) > 0 ? num(draft!.target_food_cost_pct) : null,
      monthly_sales: num(draft!.monthly_sales) > 0 ? Math.round(num(draft!.monthly_sales)) : null,
      notes: draft!.notes || null,
    };
    const components: ComponentInput[] = draft!.lines.map((l) => ({
      item_id: l.item_id,
      sub_dish_id: null,
      quantity: num(l.quantity),
      unit: l.unit,
      waste_pct: 0,
      supplier_id: l.supplier_id,
      notes: l.notes,
    }));
    try {
      if (isNew) {
        const id = await create.mutateAsync({ business_id: businessId!, dish: dishInput, components });
        setDirty(false);
        navigate(`/menu/dishes/${id}`, { replace: true });
      } else {
        await update.mutateAsync({ business_id: businessId!, id: dishId!, dish: dishInput, components });
        setDirty(false);
        setSavedFlash(true);
      }
    } catch (e) {
      setSaveError(menuSaveError(e));
    }
  }

  const saving = create.isPending || update.isPending;
  const { cost, economics: e } = live;
  const category = draft.category_id ? data.categories.find((c) => c.id === draft.category_id) : null;

  return (
    <div className="mnu-page mnu-builder page-enter">
      {/* Top bar */}
      <div className="mnu-builder-bar">
        <Link to="/menu" className="mnu-back">
          <Icon name="arrow_forward" size={18} />
          תפריט
        </Link>
        <span className="mnu-builder-crumb">
          <span className="text-text-3">/</span>
          <span className="truncate">{draft.name.trim() || (isNew ? "מנה חדשה" : "מנה")}</span>
        </span>
        <span className="flex-1" />
        {dirty && !saving && <span className="mnu-dirty">שינויים לא שמורים</span>}
        {savedFlash && (
          <span className="mnu-saved">
            <Icon name="check_circle" size={16} fill /> נשמר
          </span>
        )}
        <Button icon="save" loading={saving} onClick={save}>
          {isNew ? "יצירת מנה" : "שמירה"}
        </Button>
      </div>

      <div className="mnu-builder-grid">
        {/* ───────── Main column ───────── */}
        <div className="mnu-builder-main">
          {/* Identity */}
          <section className="mnu-panel mnu-identity-panel">
            <div className="mnu-identity">
              <label className="mnu-image-pick" data-has={!!draft.image_url} title="תמונת מנה">
                {draft.image_url ? (
                  <img src={draft.image_url} alt="" />
                ) : (
                  <span className="mnu-image-pick-empty">
                    <Icon name="add_a_photo" size={24} />
                    <span>תמונה</span>
                  </span>
                )}
                <input type="file" accept="image/*" onChange={onPickImage} className="sr-only" />
                {uploading && <span className="mnu-image-busy" />}
                {draft.image_url && (
                  <span className="mnu-image-swap">
                    <Icon name="photo_camera" size={15} />
                  </span>
                )}
              </label>

              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="mnu-identity-eyebrow">
                  <Icon name="restaurant_menu" size={14} fill />
                  {category ? category.name : "מנה בתפריט"}
                  {!isNew && (
                    <>
                      <span className="mnu-identity-dot" />
                      <span>
                        {cost.lines.length} מרכיבים
                      </span>
                    </>
                  )}
                </div>
                <input
                  value={draft.name}
                  onChange={(ev) => patch({ name: ev.target.value })}
                  placeholder="שם המנה — פסטה ארביאטה, המבורגר הבית..."
                  className="mnu-name-input"
                  aria-label="שם המנה"
                  autoFocus={isNew}
                />
                <div className="mnu-identity-row">
                  <Field label="קטגוריה" className="min-w-0 flex-1">
                    <Select value={draft.category_id ?? ""} onChange={(ev) => patch({ category_id: ev.target.value || null })}>
                      <option value="">כללי</option>
                      {data.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
            </div>
            <Textarea
              rows={2}
              value={draft.description}
              onChange={(ev) => patch({ description: ev.target.value })}
              placeholder="תיאור קצר כמו בתפריט (אופציונלי)"
              className="mt-3 !text-[13px]"
            />
          </section>

          {/* Tree */}
          <section className="mnu-panel">
            <header className="mnu-panel-head">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3>עץ המנה</h3>
                  <p>
                    {draft.lines.length === 0
                      ? "הוסיפו מרכיבים מהמלאי — המחיר מגיע חי ממחירוני הספקים"
                      : `${draft.lines.length} מרכיבים · עלות מנה ${formatMoney(e.portionCost, { decimals: 2 })}`}
                  </p>
                </div>
                {cost.lines.length > 0 && (
                  <span className="mnu-tree-badge" data-complete={cost.complete}>
                    <Icon name={cost.complete ? "verified" : "warning"} size={15} fill />
                    {cost.complete ? "כל המרכיבים מתומחרים" : `${cost.uncostedLines} ללא מחיר`}
                  </span>
                )}
              </div>
              {cost.lines.length > 0 && <ShareBar parts={cost.lines.map((l) => ({ key: l.component.id, share: l.share, label: l.name }))} />}
            </header>

            <ComponentPicker data={data} onPickItem={addItem} />

            {cost.lines.length === 0 && (
              <div className="mnu-tree-empty">
                <Icon name="account_tree" size={28} />
                <b>המנה עדיין ריקה</b>
                <span>חפשו מוצר בשורה למעלה. לכל מרכיב תגדירו כמות ויחידה — והעלות מתעדכנת מיד.</span>
              </div>
            )}

            {cost.lines.length > 0 && (
              <ol className="mnu-tree">
                {cost.lines.map((line, i) => {
                  const draftLine = draft.lines.find((l) => l.key === line.component.id)!;
                  return (
                    <TreeLine
                      key={line.component.id}
                      line={line}
                      draft={draftLine}
                      data={data}
                      index={i}
                      total={cost.lines.length}
                      onPatch={(p) => patchLine(line.component.id, p)}
                      onRemove={() => removeLine(line.component.id)}
                      onMove={(dir) => moveLine(line.component.id, dir)}
                      onFixItem={() => {
                        const item = data.itemsById.get(line.component.item_id!);
                        if (item) setConversionItem(item);
                      }}
                    />
                  );
                })}
              </ol>
            )}

            {cost.lines.length > 0 && (
              <footer className="mnu-tree-total">
                <span>סה״כ עלות מתכון</span>
                <b>{formatMoney(cost.totalCost, { decimals: 2 })}</b>
              </footer>
            )}
          </section>

          <section className="mnu-panel">
            <Field label="הערות פנימיות">
              <Textarea rows={2} value={draft.notes} onChange={(ev) => patch({ notes: ev.target.value })} placeholder="טיפים להכנה, אלרגנים, ספק מועדף..." />
            </Field>
          </section>
        </div>

        {/* ───────── Aside: live P&L ───────── */}
        <aside className="mnu-builder-aside">
          <DishPanel draft={draft} cost={cost} live={live} data={data} onPatch={patch} />
          {saveError && (
            <div className="mnu-note" data-tone="danger">
              <Icon name="error" size={17} fill />
              <span>{saveError}</span>
            </div>
          )}
        </aside>
      </div>

      <LoadingOverlay show={saving} label="שומר את המנה..." />

      <ItemConversionModal
        open={!!conversionItem}
        onClose={() => setConversionItem(null)}
        businessId={businessId}
        item={conversionItem}
        conversion={conversionItem ? data.conversions.get(conversionItem.id) : null}
        priceIndex={data.ctx.priceIndex}
        suppliersById={data.suppliersById}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Component picker                                                    */
/* ------------------------------------------------------------------ */

function ComponentPicker({ data, onPickItem }: { data: MenuCostingData; onPickItem: (item: InventoryItem) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const query = q.trim();
    return data.items.filter((i) => inventoryItemMatchesQuery(i, query)).slice(0, query ? 14 : 10);
  }, [q, data]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      if (!wrapRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => setActive(0), [q]);

  function pick(idx: number) {
    const item = results[idx];
    if (!item) return;
    onPickItem(item);
    setQ("");
    setOpen(false);
  }

  return (
    <div className="mnu-picker" ref={wrapRef}>
      <div className="mnu-picker-input">
        <Icon name="add_circle" size={20} />
        <input
          value={q}
          onChange={(ev) => {
            setQ(ev.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(ev) => {
            if (ev.key === "ArrowDown") {
              ev.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (ev.key === "ArrowUp") {
              ev.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (ev.key === "Enter") {
              ev.preventDefault();
              pick(active);
            } else if (ev.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="הוספת מרכיב — חיפוש מוצר מהמלאי..."
          aria-label="הוספת מרכיב"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="ניקוי" className="mnu-picker-x">
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {open && (
        <div className="mnu-picker-menu">
          {results.length === 0 ? (
            <div className="mnu-picker-empty">
              לא נמצא «{q}».{" "}
              <Link to="/inventory/items/new" className="underline">
                הוסיפו מוצר למלאי
              </Link>
            </div>
          ) : (
            <>
              <div className="mnu-picker-group">מוצרים מהמלאי</div>
              {results.map((item, i) => {
                const conv = data.conversions.get(item.id) ?? null;
                const price = resolveItemPrice(item, data.ctx.priceIndex, null, conv);
                const content = itemContentPerMainUnit(item, conv);
                return (
                  <button type="button" key={item.id} className="mnu-picker-row" data-active={active === i} onMouseEnter={() => setActive(i)} onClick={() => pick(i)}>
                    <Monogram name={item.name} url={item.image_url} size={34} icon="inventory_2" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{item.name}</span>
                      <span className="block text-[11.5px] text-text-3">
                        {item.unit?.trim() || "יחידה"}
                        {content.source !== "count" ? ` · ${formatQty(content.qty)} ${MEASURE_LABELS[content.measure]}` : content.pieces ? ` · ${content.pieces} ${item.piece_unit ?? "פריטים"}` : ""}
                      </span>
                    </span>
                    {price.pricePerMain > 0 ? (
                      <span className="text-[12.5px] font-extrabold tabular-nums">{formatMoney(price.pricePerMain)}</span>
                    ) : (
                      <span className="mnu-pill" data-tone="danger" data-compact>
                        אין מחיר
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tree line                                                           */
/* ------------------------------------------------------------------ */

function TreeLine({
  line,
  draft,
  data,
  index,
  total,
  onPatch,
  onRemove,
  onMove,
  onFixItem,
}: {
  line: LineCost;
  draft: DraftLine;
  data: MenuCostingData;
  index: number;
  total: number;
  onPatch: (p: Partial<DraftLine>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onFixItem: () => void;
}) {
  const item = data.itemsById.get(draft.item_id) ?? null;
  const blocking = line.unitCost == null && line.issues.length > 0;

  const itemContent = item ? itemContentPerMainUnit(item, data.conversions.get(item.id) ?? null) : null;
  const unitOptions = (() => {
    if (item && itemContent) {
      // A counted item may still be written in grams — the UI then asks for a conversion.
      if (itemContent.source === "count") return unitOptionsForMeasure(null, true).filter((o) => o.value !== "piece" || !!itemContent.pieces);
      return unitOptionsForMeasure(itemContent.measure, true).filter((o) => o.value !== "piece" || !!itemContent.pieces);
    }
    return unitOptionsForMeasure(null, true);
  })();

  const per100 = line.unit === "g" || line.unit === "ml";

  return (
    <li className="mnu-line" data-blocked={blocking} style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}>
      <div className="mnu-line-main">
        <div className="mnu-line-order">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="העלאה">
            <Icon name="expand_less" size={16} />
          </button>
          <span className="mnu-line-num">{index + 1}</span>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="הורדה">
            <Icon name="expand_more" size={16} />
          </button>
        </div>

        <div className="mnu-line-id">
          <Monogram name={line.name} url={line.imageUrl} size={40} icon="inventory_2" />
          <div className="min-w-0">
            <div className="mnu-line-name">{line.name}</div>
            <div className="mnu-line-sub">
              {line.priceSource === "supplier" && line.supplierId && (
                <span>
                  <Icon name="local_shipping" size={12} /> {data.suppliersById.get(line.supplierId) ?? "ספק"}
                </span>
              )}
              {line.priceSource === "manual" && <span>מחיר ידני</span>}
              {line.unitCost != null && (
                <span className="tabular-nums">
                  {formatMoney(line.unitCost * (per100 ? 100 : 1), { decimals: 2 })} / {per100 ? "100 " : ""}
                  {line.unitLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mnu-line-inputs">
          <label className="mnu-mini">
            <span>כמות</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={draft.quantity}
              onChange={(ev) => onPatch({ quantity: ev.target.value })}
              placeholder="0"
              className="field !py-2 !text-[14px] font-bold tabular-nums"
              autoFocus={draft.quantity === ""}
            />
          </label>
          <label className="mnu-mini">
            <span>יחידה</span>
            <Select value={draft.unit} onChange={(ev) => onPatch({ unit: ev.target.value as MenuComponentUnit })}>
              {unitOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value === "main" || o.value === "piece" ? componentUnitLabel(o.value, item) : o.label}
                </option>
              ))}
            </Select>
          </label>
          {line.offers.length > 1 && (
            <label className="mnu-mini mnu-mini--supplier">
              <span>ספק</span>
              <Select value={draft.supplier_id ?? ""} onChange={(ev) => onPatch({ supplier_id: ev.target.value || null })}>
                <option value="">הזול ביותר</option>
                {line.offers.map((o) => (
                  <option key={o.supplierId} value={o.supplierId}>
                    {data.suppliersById.get(o.supplierId) ?? "ספק"} · {formatMoney(o.price)}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>

        <div className="mnu-line-cost">
          {blocking ? (
            <button type="button" className="mnu-row-btn mnu-row-btn--attention" onClick={onFixItem}>
              <Icon name="warning" size={15} fill />
              תיקון
            </button>
          ) : (
            <>
              <b className="tabular-nums">{formatMoney(line.cost, { decimals: 2 })}</b>
              <span className="mnu-line-share">
                <i style={{ width: `${Math.round(line.share * 100)}%` }} />
              </span>
              <small>{formatPct(line.share * 100, 0)} מהעלות</small>
            </>
          )}
        </div>

        <div className="mnu-line-actions">
          <button type="button" className="mnu-act mnu-act--danger" onClick={onRemove} aria-label="הסרת מרכיב">
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>

      {line.issues.length > 0 && (
        <div className="mnu-line-foot">
          <IssueList issues={line.issues} />
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Aside — dish P&L                                                     */
/* ------------------------------------------------------------------ */

function DishPanel({
  draft,
  cost,
  live,
  data,
  onPatch,
}: {
  draft: Draft;
  cost: DishCost;
  live: { dish: MenuDish; economics: ReturnType<typeof dishEconomics> };
  data: MenuCostingData;
  onPatch: (p: Partial<Draft>) => void;
}) {
  const { economics: e, dish } = live;
  const s = data.settings;
  const [whatIf, setWhatIf] = useState<number | null>(null);

  // Reset the what-if handle whenever the real price changes.
  useEffect(() => setWhatIf(null), [draft.selling_price]);

  const sliderMin = Math.max(1, Math.floor(e.portionCost));
  const sliderMax = Math.max(sliderMin + 10, Math.ceil(Math.max(e.portionCost * 5, (e.sellingPrice ?? 0) * 1.5)));
  const whatIfPrice = whatIf ?? e.sellingPrice ?? e.suggestedPrice ?? sliderMin;
  const wi = economicsAtPrice(dish, cost, s, whatIfPrice);

  return (
    <>
      <section className="mnu-panel mnu-pl">
        <div className="mnu-pl-head">
          <FoodCostRing pct={e.foodCostPct} target={e.targetPct} status={e.status} size={96} stroke={9} />
          <div className="min-w-0 flex-1">
            <div className="mnu-pl-title">Food Cost</div>
            <div className="mnu-pl-big">{formatPct(e.foodCostPct, 1)}</div>
            <div className="mnu-pl-sub">
              יעד {formatPct(e.targetPct, 0)}
              {e.deltaToTargetPct != null && (
                <span className={e.deltaToTargetPct > 0 ? "text-danger" : "text-success"}>
                  {" "}
                  · {e.deltaToTargetPct > 0 ? "+" : ""}
                  {formatPct(e.deltaToTargetPct, 1)}
                </span>
              )}
            </div>
            <StatusPill status={e.status} />
          </div>
        </div>

        <Field label={`מחיר מכירה (₪, ${s.prices_include_vat ? "כולל מע״מ" : "לפני מע״מ"})`}>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.5"
            value={draft.selling_price}
            onChange={(ev) => onPatch({ selling_price: ev.target.value })}
            placeholder={e.suggestedPrice != null ? `מוצע ${e.suggestedPrice}` : "0"}
            className="!text-[22px] !font-black tabular-nums"
          />
        </Field>

        {e.sellingNet != null && e.sellingNet > 0 && (
          <SplitBar cost={e.portionCostNet} net={e.sellingNet} target={e.targetPct} status={e.status} />
        )}

        <dl className="mnu-pl-rows">
          <div>
            <dt>מחיר מכירה</dt>
            <dd>{formatMoney(e.sellingPrice, { decimals: 2 })}</dd>
          </div>
          {s.prices_include_vat && (
            <div className="mnu-pl-row--muted">
              <dt>מע״מ {formatPct(s.vat_pct, 0)}</dt>
              <dd>{e.vatAmount == null ? "—" : `− ${formatMoney(e.vatAmount, { decimals: 2 })}`}</dd>
            </div>
          )}
          <div>
            <dt>הכנסה נטו</dt>
            <dd>{formatMoney(e.sellingNet, { decimals: 2 })}</dd>
          </div>
          <div className="mnu-pl-row--muted">
            <dt>עלות חומרים{s.costs_include_vat ? " (נטו)" : ""}</dt>
            <dd>− {formatMoney(e.portionCostNet, { decimals: 2 })}</dd>
          </div>
          <div className="mnu-pl-row--total" data-negative={e.profit != null && e.profit < 0}>
            <dt>רווח גולמי למנה</dt>
            <dd>{formatMoney(e.profit, { decimals: 2 })}</dd>
          </div>
        </dl>

        <div className="mnu-pl-grid">
          <div>
            <span>מרווח</span>
            <b>{formatPct(e.marginPct, 1)}</b>
          </div>
          <div>
            <span>מכפיל</span>
            <b>{e.markup == null ? "—" : `×${e.markup.toLocaleString("he-IL", { maximumFractionDigits: 1 })}`}</b>
          </div>
          <div>
            <span>עלות למנה</span>
            <b>{formatMoney(e.portionCost, { decimals: 2 })}</b>
          </div>
        </div>

        {e.suggestedPrice != null && e.portionCost > 0 && (
          <div className="mnu-suggest" data-hit={e.status === "good"}>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-text-2">כדי לעמוד ביעד {formatPct(e.targetPct, 0)} המחיר צריך להיות לפחות</div>
              <div className="text-[18px] font-extrabold tabular-nums">
                {formatMoney(e.suggestedPrice)} <small className="text-[12px] font-semibold text-text-3">({formatMoney(e.targetPrice, { decimals: 2 })} מדויק)</small>
              </div>
            </div>
            {String(e.suggestedPrice) !== draft.selling_price && (
              <Button variant="secondary" icon="auto_fix_high" onClick={() => onPatch({ selling_price: String(e.suggestedPrice) })}>
                אמצו
              </Button>
            )}
          </div>
        )}
      </section>

      {e.portionCost > 0 && (
        <section className="mnu-panel">
          <header className="mnu-panel-head mnu-panel-head--tight">
            <div>
              <h3>מה אם?</h3>
              <p>גררו כדי לראות איך המחיר משנה את הרווח</p>
            </div>
          </header>
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={0.5}
            value={Math.min(sliderMax, Math.max(sliderMin, whatIfPrice))}
            onChange={(ev) => setWhatIf(Number(ev.target.value))}
            className="mnu-range"
            aria-label="מחיר היפותטי"
            data-tone={wi.status}
          />
          <div className="mnu-whatif">
            <div>
              <span>מחיר</span>
              <b>{formatMoney(whatIfPrice, { decimals: 2 })}</b>
            </div>
            <div>
              <span>Food Cost</span>
              <b data-tone={wi.status}>{formatPct(wi.foodCostPct, 1)}</b>
            </div>
            <div>
              <span>רווח</span>
              <b>{formatMoney(wi.profit, { decimals: 2 })}</b>
            </div>
            <div>
              <span>מרווח</span>
              <b>{formatPct(wi.marginPct, 0)}</b>
            </div>
          </div>
          {whatIf != null && String(whatIf) !== draft.selling_price && (
            <Button variant="ghost" icon="check" className="mt-2 w-full" onClick={() => onPatch({ selling_price: String(whatIf) })}>
              קבעו {formatMoney(whatIf, { decimals: 2 })} כמחיר המנה
            </Button>
          )}
        </section>
      )}

      <section className="mnu-panel">
        <div className="grid grid-cols-2 gap-3">
          <Field label="יעד Food Cost למנה (%)">
            <Input
              type="number"
              inputMode="decimal"
              min={1}
              max={99}
              value={draft.target_food_cost_pct}
              onChange={(ev) => onPatch({ target_food_cost_pct: ev.target.value })}
              placeholder={`${s.target_food_cost_pct} (ברירת מחדל)`}
            />
          </Field>
          <Field label="מכירות בחודש (אופציונלי)">
            <Input type="number" inputMode="numeric" min={0} value={draft.monthly_sales} onChange={(ev) => onPatch({ monthly_sales: ev.target.value })} placeholder="0" />
          </Field>
        </div>
        {e.monthlyContribution != null && (
          <div className="mnu-contrib">
            <Icon name="trending_up" size={18} />
            <span>
              תרומה חודשית לרווח: <b>{formatMoney(e.monthlyContribution)}</b>
              {e.profit != null && dish.monthly_sales ? ` (${formatMoney(e.profit, { decimals: 2 })} × ${dish.monthly_sales.toLocaleString("he-IL")})` : ""}
            </span>
          </div>
        )}
      </section>

      {cost.issues.length > 0 && (
        <section className="mnu-panel" data-tone="warning">
          <header className="mnu-panel-head mnu-panel-head--tight">
            <div>
              <h3>לפני שסומכים על המספר</h3>
              <p>{cost.uncostedLines > 0 ? `${cost.uncostedLines} מרכיבים לא נכללו בעלות` : "אזהרות"}</p>
            </div>
          </header>
          <IssueList issues={cost.issues} />
        </section>
      )}
    </>
  );
}
