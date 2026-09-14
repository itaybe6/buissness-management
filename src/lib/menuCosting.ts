/**
 * מנוע התמחור של עץ המנה.
 *
 * הכל כאן טהור (ללא React / Supabase) כדי שיהיה ניתן לבדוק ולהרכיב:
 *
 *   מנה ─┬─ מוצר מלאי  × כמות × יחידה × פחת  → מחיר ספק ליחידת רכש ÷ תכולה
 *        ├─ הכנה (prep) × כמות                 → עלות ההכנה ÷ התפוקה שלה (רקורסיבי)
 *        └─ ...
 *
 * שלוש שכבות של המרה מחברות בין "ארגז של 24 בקבוקים ב-₪96" ל"30 מ״ל במנה":
 *   1. מחיר ליחידת רכש ראשית — מהספק הזול ביותר (או ספק נעוץ / מחיר ידני).
 *   2. תכולה ליחידת רכש — כמה גרם/מ״ל/יחידות יש בה (מהמוצר עצמו: בקבוק = 750 מ״ל,
 *      ארגז = 24 × 330 מ״ל; או מהשם: ק״ג = 1000 גרם).
 *   3. כמות במתכון → אותו בסיס מידה, מנופחת בפחת.
 *
 * מעל זה: מע״מ, רווח גולמי, אחוז Food Cost, מכפיל, מחיר מוצע ליעד.
 */
import type {
  InventoryItem,
  MenuComponentUnit,
  MenuDish,
  MenuDishComponent,
  MenuItemConversion,
  MenuMeasure,
  MenuSettings,
} from "@/types/database";
import { effectiveMainUnitPrice, type SupplierItemPriceIndex } from "@/api/suppliers";

/* ------------------------------------------------------------------ */
/* Labels & option lists                                               */
/* ------------------------------------------------------------------ */

export const MEASURE_LABELS: Record<MenuMeasure, string> = {
  g: "גרם",
  ml: "מ״ל",
  unit: "יח׳",
};

export interface ComponentUnitOption {
  value: MenuComponentUnit;
  label: string;
  short: string;
  /** Base measure this unit resolves to; null for item-relative units (main/piece). */
  measure: MenuMeasure | null;
  /** Multiplier into the base measure. */
  factor: number;
}

export const COMPONENT_UNIT_OPTIONS: ComponentUnitOption[] = [
  { value: "g", label: "גרם", short: "גר׳", measure: "g", factor: 1 },
  { value: "kg", label: "קילוגרם", short: "ק״ג", measure: "g", factor: 1000 },
  { value: "ml", label: "מיליליטר", short: "מ״ל", measure: "ml", factor: 1 },
  { value: "l", label: "ליטר", short: "ל׳", measure: "ml", factor: 1000 },
  { value: "unit", label: "יחידה", short: "יח׳", measure: "unit", factor: 1 },
  { value: "main", label: "יחידת רכש שלמה", short: "יח׳ רכש", measure: null, factor: 1 },
  { value: "piece", label: "פריט בודד מהמארז", short: "פריט", measure: null, factor: 1 },
];

export const COMPONENT_UNIT_BY_VALUE = new Map(COMPONENT_UNIT_OPTIONS.map((o) => [o.value, o]));

export function componentUnitLabel(unit: MenuComponentUnit, item?: Pick<InventoryItem, "unit" | "piece_unit"> | null): string {
  if (unit === "main") return item?.unit?.trim() || "יח׳ רכש";
  if (unit === "piece") return item?.piece_unit?.trim() || "פריט";
  return COMPONENT_UNIT_BY_VALUE.get(unit)?.short ?? unit;
}

/** Units that make sense for a given base measure (plus the item-relative ones). */
export function unitOptionsForMeasure(measure: MenuMeasure | null, allowRelative: boolean): ComponentUnitOption[] {
  return COMPONENT_UNIT_OPTIONS.filter((o) => {
    if (o.measure === null) return allowRelative;
    if (!measure) return true;
    return o.measure === measure;
  });
}

export const DEFAULT_MENU_SETTINGS: Omit<MenuSettings, "business_id" | "updated_at"> = {
  vat_pct: 18,
  prices_include_vat: true,
  costs_include_vat: false,
  target_food_cost_pct: 30,
};

/* ------------------------------------------------------------------ */
/* Unit inference                                                      */
/* ------------------------------------------------------------------ */

function normalizeUnitName(name: string): string {
  return name.toLowerCase().replace(/["'״׳\s.\-]/g, "");
}

const WEIGHT_KG = new Set(["קג", "קילו", "קילוגרם", "קילוגרמים", "kg", "kilo"].map(normalizeUnitName));
const WEIGHT_G = new Set(["גרם", "גר", "גרמים", "g", "gr", "gram"].map(normalizeUnitName));
const VOLUME_L = new Set(["ליטר", "ליטרים", "ל", "l", "liter", "litre"].map(normalizeUnitName));
const VOLUME_ML = new Set(["מל", "מיליליטר", "סמק", "ml", "cc"].map(normalizeUnitName));

/** Built-in content for units that are themselves a measure (1 ק״ג = 1000 גרם). */
export function measureFromUnitName(name: string | null | undefined): { qty: number; measure: MenuMeasure } | null {
  const n = normalizeUnitName(name?.trim() ?? "");
  if (!n) return null;
  if (WEIGHT_KG.has(n)) return { qty: 1000, measure: "g" };
  if (WEIGHT_G.has(n)) return { qty: 1, measure: "g" };
  if (VOLUME_L.has(n)) return { qty: 1000, measure: "ml" };
  if (VOLUME_ML.has(n)) return { qty: 1, measure: "ml" };
  return null;
}

export type ContentSource = "item" | "conversion" | "unit_name" | "count";

export interface ItemContent {
  /** How much of `measure` one *main* purchase unit holds. */
  qty: number;
  measure: MenuMeasure;
  source: ContentSource;
  /** Pieces per main unit when the item is packaged (crate of 24). */
  pieces: number | null;
}

/** The item fields the content inference reads. `content_*` are optional so legacy rows still type-check. */
export type ItemContentInput = Pick<InventoryItem, "unit" | "units_per_package" | "piece_unit"> &
  Partial<Pick<InventoryItem, "content_qty" | "content_measure">>;

/** Content of one single piece, as declared on the product itself (בקבוק = 750 מ״ל). */
export function declaredItemContent(item: ItemContentInput): { qty: number; measure: MenuMeasure } | null {
  if (item.content_qty != null && item.content_qty > 0 && item.content_measure) {
    return { qty: item.content_qty, measure: item.content_measure };
  }
  return null;
}

/**
 * Content of one main purchase unit of an item.
 * The product's own declaration wins; then a legacy conversion row; then the unit
 * name (ק״ג / ליטר); then plain counting.
 */
export function itemContentPerMainUnit(
  item: ItemContentInput,
  conversion?: Pick<MenuItemConversion, "content_qty" | "content_measure"> | null,
): ItemContent {
  const pieces = item.units_per_package && item.units_per_package > 0 ? item.units_per_package : null;

  const declared = declaredItemContent(item);
  if (declared) {
    return { qty: declared.qty * (pieces ?? 1), measure: declared.measure, source: "item", pieces };
  }

  if (conversion?.content_qty && conversion.content_qty > 0 && conversion.content_measure) {
    return {
      qty: conversion.content_qty * (pieces ?? 1),
      measure: conversion.content_measure,
      source: "conversion",
      pieces,
    };
  }

  const fromName = measureFromUnitName(item.unit);
  if (fromName) return { ...fromName, source: "unit_name", pieces: null };

  // Packaged item whose piece is itself a measure (שק של 25 ק״ג).
  const fromPiece = measureFromUnitName(item.piece_unit);
  if (fromPiece && pieces) return { qty: fromPiece.qty * pieces, measure: fromPiece.measure, source: "unit_name", pieces };

  return { qty: pieces ?? 1, measure: "unit", source: "count", pieces };
}

/** Does this item need a content declaration before gram/ml recipes can be costed? */
export function itemNeedsConversion(
  item: ItemContentInput,
  conversion: Pick<MenuItemConversion, "content_qty" | "content_measure"> | null | undefined,
): boolean {
  return itemContentPerMainUnit(item, conversion).source === "count";
}

/* ------------------------------------------------------------------ */
/* Price per measure — "₪32 לק״ג" next to a supplier price             */
/* ------------------------------------------------------------------ */

export interface MeasurePriceLine {
  /** Price of one base measure unit (gram / ml / piece). */
  perBase: number;
  /** Human line, e.g. "₪0.032 לגרם · ₪32 לק״ג". */
  label: string;
}

const MEASURE_BIG: Record<MenuMeasure, { qty: number; label: string } | null> = {
  g: { qty: 1000, label: "ק״ג" },
  ml: { qty: 1000, label: "ליטר" },
  unit: null,
};

/**
 * Turn a price per main purchase unit into the recipe-facing price.
 * Returns null when the item is only counted (no weight / volume declared).
 */
export function pricePerMeasure(pricePerMain: number, content: ItemContent): MeasurePriceLine | null {
  if (!(pricePerMain > 0) || !(content.qty > 0)) return null;
  const perBase = pricePerMain / content.qty;
  if (content.measure === "unit") {
    if (content.source === "count" && !content.pieces) return null;
    return { perBase, label: `${formatMoney(perBase, { decimals: 2 })} ליחידה` };
  }
  const big = MEASURE_BIG[content.measure]!;
  const per100 = perBase * 100;
  return {
    perBase,
    label: `${formatMoney(per100, { decimals: 2 })} ל-100 ${MEASURE_LABELS[content.measure]} · ${formatMoney(perBase * big.qty, { decimals: 2 })} ל${big.label}`,
  };
}

/* ------------------------------------------------------------------ */
/* Price resolution                                                    */
/* ------------------------------------------------------------------ */

export type PriceSource = "supplier" | "manual" | "none";

export interface SupplierOffer {
  supplierId: string;
  /** Per main purchase unit. */
  price: number;
}

export interface ItemPriceResolution {
  pricePerMain: number;
  source: PriceSource;
  supplierId: string | null;
  offers: SupplierOffer[];
  /** Pinned supplier does not carry this item — fell back to the cheapest. */
  pinnedMissing: boolean;
}

export function resolveItemPrice(
  item: Pick<InventoryItem, "id" | "units_per_package">,
  priceIndex: SupplierItemPriceIndex | undefined,
  pinnedSupplierId: string | null | undefined,
  conversion?: Pick<MenuItemConversion, "manual_unit_cost"> | null,
): ItemPriceResolution {
  const offers: SupplierOffer[] = [];
  if (priceIndex) {
    for (const [supplierId, items] of priceIndex) {
      const price = effectiveMainUnitPrice(items.get(item.id), item.units_per_package);
      if (price > 0) offers.push({ supplierId, price });
    }
  }
  offers.sort((a, b) => a.price - b.price);

  if (pinnedSupplierId) {
    const pinned = offers.find((o) => o.supplierId === pinnedSupplierId);
    if (pinned) return { pricePerMain: pinned.price, source: "supplier", supplierId: pinned.supplierId, offers, pinnedMissing: false };
  }

  if (offers.length) {
    const best = offers[0];
    return { pricePerMain: best.price, source: "supplier", supplierId: best.supplierId, offers, pinnedMissing: !!pinnedSupplierId };
  }

  const manual = conversion?.manual_unit_cost ?? null;
  if (manual != null && manual > 0) {
    return { pricePerMain: manual, source: "manual", supplierId: null, offers, pinnedMissing: !!pinnedSupplierId };
  }

  return { pricePerMain: 0, source: "none", supplierId: null, offers, pinnedMissing: !!pinnedSupplierId };
}

/* ------------------------------------------------------------------ */
/* Recipe costing                                                      */
/* ------------------------------------------------------------------ */

export interface CostingContext {
  items: Map<string, InventoryItem>;
  dishes: Map<string, MenuDish>;
  componentsByDish: Map<string, MenuDishComponent[]>;
  conversions: Map<string, MenuItemConversion>;
  priceIndex: SupplierItemPriceIndex | undefined;
}

export type LineIssue =
  | "no_price"
  | "measure_mismatch"
  | "missing_item"
  | "missing_sub"
  | "cycle"
  | "pinned_supplier_missing"
  | "needs_conversion";

export const LINE_ISSUE_LABELS: Record<LineIssue, string> = {
  no_price: "אין מחיר — אף ספק לא מתמחר את המוצר ואין מחיר ידני",
  measure_mismatch: "היחידה במתכון לא תואמת לתכולת המוצר (גרם מול מ״ל / יחידות)",
  missing_item: "המוצר נמחק מהמלאי",
  missing_sub: "ההכנה נמחקה",
  cycle: "מעגל בעץ — ההכנה מכילה את עצמה",
  pinned_supplier_missing: "הספק שנבחר לא מתמחר את המוצר — חושב לפי הספק הזול",
  needs_conversion: "חסרה תכולה — הגדירו במוצר כמה גרם / מ״ל יש בפריט אחד",
};

/** Issues that leave the line uncosted (as opposed to a soft warning). */
export const BLOCKING_ISSUES: ReadonlySet<LineIssue> = new Set<LineIssue>([
  "no_price",
  "measure_mismatch",
  "missing_item",
  "missing_sub",
  "cycle",
  "needs_conversion",
]);

export interface LineCost {
  component: MenuDishComponent;
  kind: "item" | "sub";
  name: string;
  imageUrl: string | null;
  quantity: number;
  unit: MenuComponentUnit;
  unitLabel: string;
  /** Quantity actually consumed once trim/waste is added back. */
  grossQuantity: number;
  /** Cost of one `unit` (before waste). null when uncosted. */
  unitCost: number | null;
  cost: number;
  /** Share of the parent recipe's total cost, 0..1. */
  share: number;
  issues: LineIssue[];
  priceSource: PriceSource | "sub";
  supplierId: string | null;
  offers: SupplierOffer[];
  /** Nested breakdown for sub-recipes. */
  sub: DishCost | null;
}

export interface DishCost {
  dishId: string;
  /** Cost of the whole recipe as written (one batch / one plate). */
  totalCost: number;
  yieldQty: number;
  yieldMeasure: MenuMeasure;
  /** totalCost ÷ yieldQty — cost per gram / ml / portion produced. */
  costPerYieldUnit: number;
  lines: LineCost[];
  issues: LineIssue[];
  /** False when at least one line could not be costed. */
  complete: boolean;
  /** Number of lines (recursively) that are uncosted. */
  uncostedLines: number;
}

export function componentQtyToBase(qty: number, unit: MenuComponentUnit): { qty: number; measure: MenuMeasure } | null {
  const opt = COMPONENT_UNIT_BY_VALUE.get(unit);
  if (!opt || !opt.measure) return null;
  return { qty: qty * opt.factor, measure: opt.measure };
}

export function grossQuantity(quantity: number, wastePct: number): number {
  const w = Math.min(Math.max(wastePct, 0), 99.99);
  return quantity / (1 - w / 100);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function costItemLine(component: MenuDishComponent, ctx: CostingContext): LineCost {
  const item = component.item_id ? ctx.items.get(component.item_id) : undefined;
  const base: Omit<LineCost, "name" | "imageUrl" | "unitLabel" | "grossQuantity" | "unitCost" | "cost" | "issues" | "priceSource" | "supplierId" | "offers"> = {
    component,
    kind: "item",
    quantity: component.quantity,
    unit: component.unit,
    share: 0,
    sub: null,
  };

  if (!item) {
    return {
      ...base,
      name: "מוצר שנמחק",
      imageUrl: null,
      unitLabel: componentUnitLabel(component.unit),
      grossQuantity: grossQuantity(component.quantity, component.waste_pct),
      unitCost: null,
      cost: 0,
      issues: ["missing_item"],
      priceSource: "none",
      supplierId: null,
      offers: [],
    };
  }

  const conversion = ctx.conversions.get(item.id) ?? null;
  const price = resolveItemPrice(item, ctx.priceIndex, component.supplier_id, conversion);
  const content = itemContentPerMainUnit(item, conversion);
  const gross = grossQuantity(component.quantity, component.waste_pct);
  const issues: LineIssue[] = [];

  if (price.pinnedMissing && price.source === "supplier") issues.push("pinned_supplier_missing");

  let unitCost: number | null = null;

  if (component.unit === "main") {
    unitCost = price.pricePerMain;
  } else if (component.unit === "piece") {
    unitCost = price.pricePerMain / (content.pieces ?? 1);
  } else {
    const inBase = componentQtyToBase(1, component.unit)!;
    if (inBase.measure !== content.measure) {
      // A gram/ml recipe against an item we only know how to count.
      issues.push(content.source === "count" && inBase.measure !== "unit" ? "needs_conversion" : "measure_mismatch");
    } else {
      unitCost = (price.pricePerMain / content.qty) * inBase.qty;
    }
  }

  if (price.source === "none") issues.push("no_price");

  const blocked = issues.some((i) => BLOCKING_ISSUES.has(i));
  const cost = blocked || unitCost == null ? 0 : round4(unitCost * gross);

  return {
    ...base,
    name: item.name,
    imageUrl: item.image_url,
    unitLabel: componentUnitLabel(component.unit, item),
    grossQuantity: gross,
    unitCost: blocked ? null : unitCost,
    cost,
    issues,
    priceSource: price.source,
    supplierId: price.supplierId,
    offers: price.offers,
  };
}

function costSubLine(
  component: MenuDishComponent,
  ctx: CostingContext,
  memo: Map<string, DishCost>,
  stack: Set<string>,
): LineCost {
  const sub = component.sub_dish_id ? ctx.dishes.get(component.sub_dish_id) : undefined;
  const gross = grossQuantity(component.quantity, component.waste_pct);
  const shell = {
    component,
    kind: "sub" as const,
    quantity: component.quantity,
    unit: component.unit,
    share: 0,
    priceSource: "sub" as const,
    supplierId: null,
    offers: [] as SupplierOffer[],
    grossQuantity: gross,
  };

  if (!sub) {
    return { ...shell, name: "הכנה שנמחקה", imageUrl: null, unitLabel: componentUnitLabel(component.unit), unitCost: null, cost: 0, issues: ["missing_sub"], sub: null };
  }

  if (stack.has(sub.id)) {
    return { ...shell, name: sub.name, imageUrl: sub.image_url, unitLabel: componentUnitLabel(component.unit), unitCost: null, cost: 0, issues: ["cycle"], sub: null };
  }

  const subCost = costDishInternal(sub.id, ctx, memo, stack);
  const issues: LineIssue[] = [];
  let unitCost: number | null = null;

  if (component.unit === "main" || component.unit === "piece") {
    // A whole batch of the sub-recipe.
    unitCost = subCost.totalCost;
  } else {
    const inBase = componentQtyToBase(1, component.unit)!;
    if (inBase.measure !== subCost.yieldMeasure) {
      issues.push("measure_mismatch");
    } else {
      unitCost = subCost.costPerYieldUnit * inBase.qty;
    }
  }

  const blocked = issues.length > 0;
  return {
    ...shell,
    name: sub.name,
    imageUrl: sub.image_url,
    unitLabel: component.unit === "main" || component.unit === "piece" ? "אצווה" : componentUnitLabel(component.unit),
    unitCost: blocked ? null : unitCost,
    cost: blocked || unitCost == null ? 0 : round4(unitCost * gross),
    issues,
    sub: subCost,
  };
}

function costDishInternal(dishId: string, ctx: CostingContext, memo: Map<string, DishCost>, stack: Set<string>): DishCost {
  const cached = memo.get(dishId);
  if (cached) return cached;

  const dish = ctx.dishes.get(dishId);
  const yieldQty = dish && dish.yield_qty > 0 ? dish.yield_qty : 1;
  const yieldMeasure: MenuMeasure = dish?.yield_measure ?? "unit";
  const components = [...(ctx.componentsByDish.get(dishId) ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  stack.add(dishId);
  const lines = components.map((c) => (c.sub_dish_id ? costSubLine(c, ctx, memo, stack) : costItemLine(c, ctx)));
  stack.delete(dishId);

  const totalCost = round4(lines.reduce((s, l) => s + l.cost, 0));
  for (const l of lines) l.share = totalCost > 0 ? l.cost / totalCost : 0;

  const issueSet = new Set<LineIssue>();
  let uncosted = 0;
  for (const l of lines) {
    for (const i of l.issues) issueSet.add(i);
    if (l.issues.some((i) => BLOCKING_ISSUES.has(i))) uncosted += 1;
    if (l.sub) {
      for (const i of l.sub.issues) issueSet.add(i);
      uncosted += l.sub.uncostedLines;
    }
  }

  const result: DishCost = {
    dishId,
    totalCost,
    yieldQty,
    yieldMeasure,
    costPerYieldUnit: totalCost / yieldQty,
    lines,
    issues: [...issueSet],
    complete: uncosted === 0,
    uncostedLines: uncosted,
  };
  memo.set(dishId, result);
  return result;
}

/** Cost a dish (or prep) and its whole sub-tree. Safe against cycles. */
export function costDish(dishId: string, ctx: CostingContext, memo: Map<string, DishCost> = new Map()): DishCost {
  return costDishInternal(dishId, ctx, memo, new Set());
}

/** Cost every dish in the context at once, sharing the memo so preps are costed once. */
export function costAllDishes(ctx: CostingContext): Map<string, DishCost> {
  const memo = new Map<string, DishCost>();
  for (const id of ctx.dishes.keys()) costDishInternal(id, ctx, memo, new Set());
  return memo;
}

/** Every inventory item consumed by a dish, including through sub-recipes. */
export function collectItemIds(cost: DishCost, into: Set<string> = new Set()): Set<string> {
  for (const l of cost.lines) {
    if (l.kind === "item" && l.component.item_id) into.add(l.component.item_id);
    if (l.sub) collectItemIds(l.sub, into);
  }
  return into;
}

/** item_id → dishes that consume it (directly or via a prep). */
export function itemUsageIndex(costs: Map<string, DishCost>, dishes: Map<string, MenuDish>): Map<string, MenuDish[]> {
  const out = new Map<string, MenuDish[]>();
  for (const [dishId, cost] of costs) {
    const dish = dishes.get(dishId);
    if (!dish) continue;
    for (const itemId of collectItemIds(cost)) {
      const list = out.get(itemId);
      if (list) list.push(dish);
      else out.set(itemId, [dish]);
    }
  }
  return out;
}

/** Preps that a dish depends on, flattened. */
export function collectSubDishIds(cost: DishCost, into: Set<string> = new Set()): Set<string> {
  for (const l of cost.lines) {
    if (l.sub) {
      into.add(l.sub.dishId);
      collectSubDishIds(l.sub, into);
    }
  }
  return into;
}

/* ------------------------------------------------------------------ */
/* Economics — price, VAT, margin                                      */
/* ------------------------------------------------------------------ */

export type MarginStatus = "good" | "warn" | "over" | "unknown";

export interface DishEconomics {
  /** Cost of one portion, as entered (may include VAT per settings). */
  portionCost: number;
  /** Cost of one portion net of VAT — the number margins are computed on. */
  portionCostNet: number;
  sellingPrice: number | null;
  sellingNet: number | null;
  vatAmount: number | null;
  /** sellingNet − portionCostNet */
  profit: number | null;
  /** profit ÷ sellingNet, 0..100 */
  marginPct: number | null;
  /** portionCostNet ÷ sellingNet, 0..100 — the restaurant "food cost". */
  foodCostPct: number | null;
  /** sellingNet ÷ portionCostNet */
  markup: number | null;
  targetPct: number;
  /** Price (in the same gross/net convention as `sellingPrice`) that hits the target exactly. */
  targetPrice: number | null;
  /** targetPrice rounded up to a menu-friendly whole shekel. */
  suggestedPrice: number | null;
  /** How far the current food-cost % is from the target (positive = over). */
  deltaToTargetPct: number | null;
  status: MarginStatus;
  /** profit × monthly_sales, when sales are known. */
  monthlyContribution: number | null;
}

export function vatFactor(settings: Pick<MenuSettings, "vat_pct">): number {
  return 1 + Math.max(0, settings.vat_pct) / 100;
}

export function netOfVat(gross: number, settings: Pick<MenuSettings, "vat_pct">): number {
  return gross / vatFactor(settings);
}

export function roundMenuPrice(price: number): number {
  return Math.ceil(price - 1e-9);
}

export function marginStatus(foodCostPct: number | null, targetPct: number): MarginStatus {
  if (foodCostPct == null || !Number.isFinite(foodCostPct)) return "unknown";
  if (foodCostPct <= targetPct) return "good";
  if (foodCostPct <= targetPct + 5) return "warn";
  return "over";
}

export const MARGIN_STATUS_LABELS: Record<MarginStatus, string> = {
  good: "ביעד",
  warn: "קרוב ליעד",
  over: "מעל היעד",
  unknown: "ללא מחיר",
};

export function dishEconomics(
  dish: Pick<MenuDish, "selling_price" | "target_food_cost_pct" | "monthly_sales" | "yield_qty">,
  cost: Pick<DishCost, "totalCost" | "costPerYieldUnit">,
  settings: Pick<MenuSettings, "vat_pct" | "prices_include_vat" | "costs_include_vat" | "target_food_cost_pct">,
): DishEconomics {
  const portionCost = cost.costPerYieldUnit;
  const portionCostNet = settings.costs_include_vat ? netOfVat(portionCost, settings) : portionCost;
  const targetPct = dish.target_food_cost_pct ?? settings.target_food_cost_pct;

  const sellingPrice = dish.selling_price != null && dish.selling_price > 0 ? dish.selling_price : null;
  const sellingNet = sellingPrice == null ? null : settings.prices_include_vat ? netOfVat(sellingPrice, settings) : sellingPrice;
  const vatAmount = sellingPrice == null || sellingNet == null ? null : settings.prices_include_vat ? sellingPrice - sellingNet : sellingPrice * (vatFactor(settings) - 1);

  const profit = sellingNet == null ? null : sellingNet - portionCostNet;
  const marginPct = sellingNet == null || sellingNet <= 0 ? null : (profit! / sellingNet) * 100;
  const foodCostPct = sellingNet == null || sellingNet <= 0 ? null : (portionCostNet / sellingNet) * 100;
  const markup = sellingNet == null || portionCostNet <= 0 ? null : sellingNet / portionCostNet;

  let targetPrice: number | null = null;
  if (portionCostNet > 0 && targetPct > 0) {
    const net = portionCostNet / (targetPct / 100);
    targetPrice = settings.prices_include_vat ? net * vatFactor(settings) : net;
  }

  return {
    portionCost,
    portionCostNet,
    sellingPrice,
    sellingNet,
    vatAmount,
    profit: profit == null ? null : round2(profit),
    marginPct,
    foodCostPct,
    markup,
    targetPct,
    targetPrice,
    suggestedPrice: targetPrice == null ? null : roundMenuPrice(targetPrice),
    deltaToTargetPct: foodCostPct == null ? null : foodCostPct - targetPct,
    status: portionCost <= 0 ? "unknown" : marginStatus(foodCostPct, targetPct),
    monthlyContribution: profit != null && dish.monthly_sales != null ? round2(profit * dish.monthly_sales) : null,
  };
}

/** Economics for a hypothetical selling price — powers the what-if slider. */
export function economicsAtPrice(
  dish: Pick<MenuDish, "selling_price" | "target_food_cost_pct" | "monthly_sales" | "yield_qty">,
  cost: Pick<DishCost, "totalCost" | "costPerYieldUnit">,
  settings: Pick<MenuSettings, "vat_pct" | "prices_include_vat" | "costs_include_vat" | "target_food_cost_pct">,
  price: number,
): DishEconomics {
  return dishEconomics({ ...dish, selling_price: price }, cost, settings);
}

/* ------------------------------------------------------------------ */
/* Menu-level analytics                                                */
/* ------------------------------------------------------------------ */

export interface MenuSummary {
  dishCount: number;
  pricedCount: number;
  /** Simple average food-cost % across priced, fully-costed dishes. */
  avgFoodCostPct: number | null;
  /** Sales-weighted food-cost % when sales are known, else same as avg. */
  weightedFoodCostPct: number | null;
  avgMarginPct: number | null;
  overTarget: number;
  nearTarget: number;
  onTarget: number;
  unpriced: number;
  incomplete: number;
  totalMonthlyContribution: number | null;
}

export function summarizeMenu(rows: { economics: DishEconomics; cost: DishCost; sales: number | null }[]): MenuSummary {
  let pricedCount = 0;
  let fcSum = 0;
  let mSum = 0;
  let over = 0;
  let near = 0;
  let on = 0;
  let unpriced = 0;
  let incomplete = 0;
  let wCost = 0;
  let wRev = 0;
  let hasSales = false;
  let contribution = 0;
  let hasContribution = false;

  for (const { economics: e, cost, sales } of rows) {
    if (!cost.complete) incomplete += 1;
    if (e.sellingPrice == null) {
      unpriced += 1;
      continue;
    }
    if (e.foodCostPct != null && e.marginPct != null) {
      pricedCount += 1;
      fcSum += e.foodCostPct;
      mSum += e.marginPct;
    }
    if (e.status === "over") over += 1;
    else if (e.status === "warn") near += 1;
    else if (e.status === "good") on += 1;

    if (e.monthlyContribution != null) {
      hasContribution = true;
      contribution += e.monthlyContribution;
    }
    if (sales != null && sales > 0 && e.sellingNet != null) {
      hasSales = true;
      wCost += e.portionCostNet * sales;
      wRev += e.sellingNet * sales;
    }
  }

  const avgFoodCostPct = pricedCount ? fcSum / pricedCount : null;
  return {
    dishCount: rows.length,
    pricedCount,
    avgFoodCostPct,
    weightedFoodCostPct: hasSales && wRev > 0 ? (wCost / wRev) * 100 : avgFoodCostPct,
    avgMarginPct: pricedCount ? mSum / pricedCount : null,
    overTarget: over,
    nearTarget: near,
    onTarget: on,
    unpriced,
    incomplete,
    totalMonthlyContribution: hasContribution ? round2(contribution) : null,
  };
}

/** Kasavana–Smith menu engineering quadrants. */
export type MenuQuadrant = "star" | "plowhorse" | "puzzle" | "dog";

export const QUADRANT_LABELS: Record<MenuQuadrant, { label: string; hint: string; icon: string }> = {
  star: { label: "כוכב", hint: "פופולרי ורווחי — לשמור בולט בתפריט", icon: "star" },
  plowhorse: { label: "סוס עבודה", hint: "פופולרי אך רווח נמוך — להעלות מחיר או להקטין עלות", icon: "agriculture" },
  puzzle: { label: "פאזל", hint: "רווחי אך לא נמכר — לקדם, למקם טוב יותר, לשנות שם", icon: "extension" },
  dog: { label: "כלב", hint: "לא רווחי ולא נמכר — לשקול להוריד מהתפריט", icon: "pets" },
};

export interface EngineeringRow {
  id: string;
  profit: number;
  sales: number;
}

export interface EngineeringResult {
  quadrants: Map<string, MenuQuadrant>;
  /** Weighted average contribution margin per portion. */
  marginThreshold: number;
  /** 70% of the fair share of sales (1/n). */
  popularityThreshold: number;
  totalSales: number;
}

export function menuEngineering(rows: EngineeringRow[]): EngineeringResult {
  const valid = rows.filter((r) => r.sales > 0 && Number.isFinite(r.profit));
  const quadrants = new Map<string, MenuQuadrant>();
  const totalSales = valid.reduce((s, r) => s + r.sales, 0);
  if (valid.length < 2 || totalSales <= 0) {
    return { quadrants, marginThreshold: 0, popularityThreshold: 0, totalSales };
  }
  const marginThreshold = valid.reduce((s, r) => s + r.profit * r.sales, 0) / totalSales;
  const popularityThreshold = (1 / valid.length) * 0.7;

  for (const r of valid) {
    const popular = r.sales / totalSales >= popularityThreshold;
    const profitable = r.profit >= marginThreshold;
    quadrants.set(r.id, popular ? (profitable ? "star" : "plowhorse") : profitable ? "puzzle" : "dog");
  }
  return { quadrants, marginThreshold, popularityThreshold, totalSales };
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** ₪ with up to two decimals — dish costs are often a few agorot per gram. */
export function formatMoney(n: number | null | undefined, opts?: { decimals?: number; dash?: string }): string {
  if (n == null || !Number.isFinite(n)) return opts?.dash ?? "—";
  const decimals = opts?.decimals ?? (Math.abs(n) >= 100 ? 0 : 2);
  const s = Math.abs(n).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
  return `${n < 0 ? "−" : ""}₪${s}`;
}

export function formatPct(n: number | null | undefined, decimals = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: decimals })}%`;
}

export function formatQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

/** Human error for menu saves (Supabase errors are plain objects, not Error). */
export function menuSaveError(e: unknown): string {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e !== null && "message" in e
        ? String((e as { message: unknown }).message)
        : "";
  if (/MENU_CYCLE/.test(msg)) return "אי אפשר להוסיף את ההכנה הזו — היא כבר מכילה את המנה הנוכחית (מעגל בעץ).";
  if (/menu_components_no_self/.test(msg)) return "מנה לא יכולה להכיל את עצמה.";
  if (/menu_dish_components_sub_dish_id_fkey|violates foreign key constraint/.test(msg) && /sub_dish/.test(msg)) {
    return "ההכנה בשימוש במנות אחרות — הסירו אותה מהן לפני המחיקה.";
  }
  if (/menu_settings|menu_dishes|menu_categories|menu_dish_components|menu_item_conversions/.test(msg) && /does not exist|42P01|Could not find/i.test(msg)) {
    return "טבלאות מודול התפריט חסרות במסד הנתונים. ב-Supabase: SQL Editor → הריצו את supabase/migrations/20260915100000_menu_costing.sql";
  }
  if (/bucket|storage/i.test(msg)) return "שגיאה בהעלאת תמונה. ודאו שקיים Bucket בשם menu ב-Storage.";
  return msg || "שגיאה בשמירה";
}
