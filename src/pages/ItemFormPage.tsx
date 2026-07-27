import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Button,
  EmptyState,
  Icon,
  Input,
  MultiSelect,
  PageLoader,
  Select,
} from "@/components/ui";
import { DualUnitQtyInput } from "@/components/inventory/DualUnitQtyInput";
import { useAuth } from "@/lib/auth";
import { useBusinessId, HE_DAYS, formatCurrency } from "@/lib/db";
import { canSeeInventoryPrices } from "@/lib/constants";
import {
  useInventory,
  useCreateItem,
  useUpdateItem,
  useSetCount,
  uploadItemImage,
  itemWarehouseQty,
  formatQtyWithPieces,
  normalizeInventoryBarcode,
  supportsPieceInput,
  canUsePieceInput,
  mainUnitToPieces,
  inventorySaveError,
  INVENTORY_UNITS,
  BASE_UNIT,
  type ItemWithQty,
} from "@/api/inventory";
import { useWarehouses, defaultWarehouse } from "@/api/warehouses";
import { useDepartments } from "@/api/departments";
import { useInventoryCategories } from "@/api/inventoryCategories";
import {
  useItemSuppliers,
  useSaveItemSuppliers,
  useSuppliers,
  effectiveMainUnitPrice,
  supplierPriceUnitLabel,
} from "@/api/suppliers";
import type { Supplier, SupplierPriceUnit, Warehouse } from "@/types/database";

type ItemFormState = {
  name: string;
  barcode: string;
  categoryId: string;
  unit: string;
  unitsPerPackage: string;
  minQty: string;
  deliveryDay: string;
  departmentIds: string[];
  imageUrl: string | null;
  file: File | null;
};

/** One warehouse row of the form. `stocked` = the product is kept in this warehouse. */
type WarehouseDraft = { qty: number; stocked: boolean };

/** One supplier link: a price per main unit and/or per single piece. */
type SupplierLine = { supplierId: string; mainPrice: string; piecePrice: string };

const EMPTY_FORM: ItemFormState = {
  name: "",
  barcode: "",
  categoryId: "",
  unit: "יחידות",
  unitsPerPackage: "",
  minQty: "0",
  deliveryDay: "",
  departmentIds: [],
  imageUrl: null,
  file: null,
};

function formFromItem(item: ItemWithQty): ItemFormState {
  return {
    name: item.name,
    barcode: item.barcode ?? "",
    categoryId: item.category_id ?? "",
    unit: item.unit ?? "יחידות",
    unitsPerPackage: item.units_per_package != null ? String(item.units_per_package) : "",
    minQty: String(item.min_quantity),
    deliveryDay: item.supplier_delivery_day != null ? String(item.supplier_delivery_day) : "",
    departmentIds: [...item.department_ids],
    imageUrl: item.image_url,
    file: null,
  };
}

/** A warehouse holds the product when it carries stock there. */
function draftsFromItem(warehouses: Warehouse[], item: ItemWithQty | null): Record<string, WarehouseDraft> {
  const map: Record<string, WarehouseDraft> = {};
  const fallbackId = defaultWarehouse(warehouses)?.id ?? warehouses[0]?.id ?? null;
  for (const w of warehouses) {
    const qty = item ? itemWarehouseQty(item, w.id) : 0;
    map[w.id] = { qty, stocked: item ? qty > 0 : w.id === fallbackId };
  }
  return map;
}

/** A price counts only when it parses to a positive number. */
function priceValue(raw: string): number | null {
  const n = parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A linked supplier needs at least one usable price. */
function lineHasValidPrice(line: SupplierLine, dual: boolean): boolean {
  if (priceValue(line.mainPrice) != null) return true;
  if (dual && priceValue(line.piecePrice) != null) return true;
  return false;
}

function relativeWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  const days = Math.round(hours / 24);
  if (days === 1) return "אתמול";
  if (days < 30) return `לפני ${days} ימים`;
  return new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

function supplierMonogram(name: string): string {
  const t = name.trim();
  return t ? t[0] : "?";
}

/* ---------------------------------------------------------------- */
/* Detail field — icon + label + borderless control (shared shell)   */
/* ---------------------------------------------------------------- */
function IpfField({
  icon,
  label,
  hint,
  note,
  children,
}: {
  icon: string;
  label: string;
  hint?: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="spf-field">
      <span className="spf-field-icon" aria-hidden>
        <Icon name={icon} size={18} />
      </span>
      <span className="spf-field-body">
        <span className="spf-field-label">
          {label}
          {hint && <em className="spf-field-hint">{hint}</em>}
        </span>
        {children}
        {note && <span className="ipf-field-note">{note}</span>}
      </span>
    </label>
  );
}

/* ---------------------------------------------------------------- */
/* Warehouse row — presence switch + quantity + share of total       */
/* ---------------------------------------------------------------- */
function WarehouseRow({
  warehouse,
  draft,
  unit,
  unitsPerPackage,
  totalQty,
  lastUpdatedAt,
  lastUpdatedBy,
  onToggle,
  onQty,
}: {
  warehouse: Warehouse;
  draft: WarehouseDraft;
  unit: string;
  unitsPerPackage: number | null;
  totalQty: number;
  lastUpdatedAt: string | null;
  lastUpdatedBy: string | null;
  onToggle: () => void;
  onQty: (qty: number) => void;
}) {
  const share = totalQty > 0 ? Math.round((draft.qty / totalQty) * 100) : 0;
  const when = relativeWhen(lastUpdatedAt);
  const sub = draft.stocked
    ? when
      ? `עודכן ${when}${lastUpdatedBy ? ` · ${lastUpdatedBy}` : ""}`
      : "טרם נספר במחסן הזה"
    : "לא מוחזק במחסן הזה";

  return (
    <article className="ipf-wh" data-on={draft.stocked}>
      <div className="ipf-wh-head">
        <span className="ipf-wh-icon" aria-hidden>
          <Icon name="warehouse" size={17} />
        </span>
        <span className="ipf-wh-id">
          <b className="ipf-wh-name">
            {warehouse.name}
            {warehouse.is_default && <em className="ipf-wh-tag">ראשי</em>}
          </b>
          <span className="ipf-wh-sub">{sub}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={draft.stocked}
          aria-label={`${draft.stocked ? "הסרת המוצר מ" : "שיוך המוצר ל"}${warehouse.name}`}
          className="ipf-switch"
          onClick={onToggle}
        >
          <i aria-hidden />
        </button>
      </div>

      {draft.stocked && (
        <div className="ipf-wh-body">
          <div className="ipf-wh-qty">
            <DualUnitQtyInput
              value={draft.qty}
              mainUnit={unit}
              unitsPerPackage={unitsPerPackage}
              onCommit={onQty}
              variant="stepper"
            />
          </div>
          <div className="ipf-wh-share">
            <span className="ipf-wh-bar" aria-hidden>
              <i style={{ width: `${Math.min(100, share)}%` }} />
            </span>
            <span className="ipf-wh-share-text">
              {draft.qty > 0 ? (
                <>
                  {formatQtyWithPieces(draft.qty, unit, unitsPerPackage)}
                  {totalQty > 0 && <em>{share}% מהמלאי</em>}
                </>
              ) : (
                <em data-empty="true">אזל במחסן הזה</em>
              )}
            </span>
          </div>
        </div>
      )}
    </article>
  );
}

/* ---------------------------------------------------------------- */
/* Price box — ₪ + amount + unit                                     */
/* ---------------------------------------------------------------- */
function PriceBox({
  value,
  unitLabel,
  ariaLabel,
  selected,
  onChange,
  registerPrice,
}: {
  value: string;
  unitLabel: string;
  ariaLabel: string;
  selected: boolean;
  onChange: (v: string) => void;
  registerPrice?: (el: HTMLInputElement | null) => void;
}) {
  return (
    <div className="ipf-price">
      <span className="ipf-price-currency">₪</span>
      <input
        ref={registerPrice}
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        tabIndex={selected ? 0 : -1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ipf-price-input"
        placeholder="0.00"
        aria-label={ariaLabel}
      />
      <span className="ipf-price-per">/ {unitLabel}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Supplier row — link toggle + this product's price at the supplier */
/* ---------------------------------------------------------------- */
function SupplierRow({
  supplier,
  line,
  unit,
  dual,
  cheapest,
  missing,
  onToggle,
  onFocusPrice,
  onMainPrice,
  onPiecePrice,
  registerMainPrice,
}: {
  supplier: Supplier;
  line: SupplierLine | undefined;
  unit: string;
  dual: boolean;
  cheapest: boolean;
  missing: boolean;
  onToggle: () => void;
  onFocusPrice: () => void;
  onMainPrice: (v: string) => void;
  onPiecePrice: (v: string) => void;
  registerMainPrice: (el: HTMLInputElement | null) => void;
}) {
  const selected = !!line;
  const mainUnitLabel = unit.trim() || BASE_UNIT;
  const pieceUnitLabel = supplierPriceUnitLabel("piece", unit);

  return (
    <article className="ipf-sup" data-selected={selected} data-missing={selected && missing}>
      <div className="ipf-sup-head">
        <button
          type="button"
          className="ipf-sup-hit"
          aria-pressed={selected}
          onClick={selected ? onFocusPrice : onToggle}
          aria-label={selected ? `מחיר אצל ${supplier.name}` : `שיוך ל${supplier.name}`}
        >
          <span className="ipf-sup-check" aria-hidden>
            <Icon name="check" size={14} />
          </span>
          <span className="ipf-sup-mono" aria-hidden>
            {supplierMonogram(supplier.name)}
          </span>
          <span className="ipf-sup-id">
            <b>{supplier.name}</b>
            <span className="ipf-sup-sub">
              {!supplier.active && <em className="ipf-sup-off">לא פעיל</em>}
              {cheapest && <em className="ipf-sup-best">הזול ביותר</em>}
              {supplier.active && !cheapest && (supplier.phone || "מחיר רכש למוצר הזה")}
            </span>
          </span>
        </button>

        {selected && (
          <button
            type="button"
            className="ipf-sup-x"
            onClick={onToggle}
            aria-label={`הסרת ${supplier.name}`}
          >
            <Icon name="close" size={15} />
          </button>
        )}
      </div>

      {selected && (
        <div className="ipf-sup-prices">
          <PriceBox
            value={line?.mainPrice ?? ""}
            unitLabel={mainUnitLabel}
            ariaLabel={`מחיר ל${mainUnitLabel} אצל ${supplier.name}`}
            selected={selected}
            onChange={onMainPrice}
            registerPrice={registerMainPrice}
          />
          {dual && (
            <PriceBox
              value={line?.piecePrice ?? ""}
              unitLabel={pieceUnitLabel}
              ariaLabel={`מחיר ל${pieceUnitLabel} אצל ${supplier.name}`}
              selected={selected}
              onChange={onPiecePrice}
            />
          )}
        </div>
      )}
    </article>
  );
}

/* ---------------------------------------------------------------- */
/* Page                                                              */
/* ---------------------------------------------------------------- */
export function ItemFormPage() {
  const { itemId } = useParams<{ itemId?: string }>();
  const isEdit = !!itemId;
  const navigate = useNavigate();
  const location = useLocation();
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const canManage = !!(profile && ["manager", "shift_manager", "office_manager"].includes(profile.role));
  const canEditSuppliers = canSeeInventoryPrices(profile?.role);

  const { data: items, isLoading: itemsLoading } = useInventory(businessId);
  const { data: warehouseList, isLoading: warehousesLoading } = useWarehouses(businessId);
  const { data: departments } = useDepartments(businessId);
  const { data: inventoryCategories } = useInventoryCategories(businessId);
  const { data: supplierList, isLoading: suppliersLoading } = useSuppliers(businessId, { activeOnly: false });
  const { data: itemSuppliers, isLoading: itemSuppliersLoading } = useItemSuppliers(
    businessId,
    itemId ?? null,
    isEdit,
  );

  const createItem = useCreateItem(businessId);
  const updateItem = useUpdateItem(businessId);
  const setCount = useSetCount(businessId);
  const saveItemSuppliers = useSaveItemSuppliers(businessId);

  const warehouses = useMemo(() => warehouseList ?? [], [warehouseList]);
  const editing = useMemo(
    () => (itemId ? items?.find((i) => i.id === itemId) ?? null : null),
    [items, itemId],
  );

  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);
  const [drafts, setDrafts] = useState<Record<string, WarehouseDraft>>({});
  const [supplierLines, setSupplierLines] = useState<SupplierLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferQty, setTransferQty] = useState(0);
  const [transferNote, setTransferNote] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const priceRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const suppliersCardRef = useRef<HTMLElement>(null);

  /* Hydrate once the reference data (and, when editing, the item) is in. */
  useEffect(() => {
    if (hydrated || warehousesLoading) return;
    if (isEdit) {
      if (!editing || itemSuppliersLoading) return;
      const bySupplier = new Map<string, SupplierLine>();
      for (const row of itemSuppliers ?? []) {
        const line =
          bySupplier.get(row.supplier_id) ??
          { supplierId: row.supplier_id, mainPrice: "", piecePrice: "" };
        if (row.price_unit === "piece") line.piecePrice = String(row.unit_price);
        else line.mainPrice = String(row.unit_price);
        bySupplier.set(row.supplier_id, line);
      }
      setForm(formFromItem(editing));
      setDrafts(draftsFromItem(warehouses, editing));
      setSupplierLines([...bySupplier.values()]);
    } else {
      setDrafts(draftsFromItem(warehouses, null));
    }
    setHydrated(true);
  }, [hydrated, isEdit, editing, itemSuppliers, itemSuppliersLoading, warehouses, warehousesLoading]);

  /* Local object URL for a freshly picked image — revoked when replaced. */
  useEffect(() => {
    if (!form.file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(form.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [form.file]);

  const unitsPerPackage = supportsPieceInput(form.unit) ? Number(form.unitsPerPackage) || null : null;
  const dualUnit = canUsePieceInput(form.unit, unitsPerPackage);

  const stockedIds = useMemo(
    () => warehouses.filter((w) => drafts[w.id]?.stocked).map((w) => w.id),
    [warehouses, drafts],
  );
  const totalQty = useMemo(
    () => stockedIds.reduce((sum, id) => sum + (drafts[id]?.qty ?? 0), 0),
    [stockedIds, drafts],
  );
  const stockedCount = useMemo(
    () => stockedIds.filter((id) => (drafts[id]?.qty ?? 0) > 0).length,
    [stockedIds, drafts],
  );

  const lineMap = useMemo(() => new Map(supplierLines.map((l) => [l.supplierId, l])), [supplierLines]);

  /** Effective per-main-unit price of each linked supplier, for the "cheapest" badge. */
  const effectivePrices = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of supplierLines) {
      const price = effectiveMainUnitPrice(
        {
          main: priceValue(l.mainPrice) ?? undefined,
          piece: priceValue(l.piecePrice) ?? undefined,
        },
        unitsPerPackage,
      );
      if (price > 0) map.set(l.supplierId, price);
    }
    return map;
  }, [supplierLines, unitsPerPackage]);

  const cheapest = useMemo(() => {
    let best: { id: string; price: number } | null = null;
    for (const [id, price] of effectivePrices) {
      if (!best || price < best.price) best = { id, price };
    }
    return best;
  }, [effectivePrices]);

  /** Active suppliers, plus inactive ones this product is already linked to. */
  const visibleSuppliers = useMemo(() => {
    const all = (supplierList ?? []).filter((s) => s.active || lineMap.has(s.id));
    const q = supplierQuery.trim().toLowerCase();
    const filtered = q ? all.filter((s) => s.name.toLowerCase().includes(q)) : all;
    return [...filtered].sort((a, b) => {
      const aLinked = lineMap.has(a.id) ? 0 : 1;
      const bLinked = lineMap.has(b.id) ? 0 : 1;
      if (aLinked !== bLinked) return aLinked - bLinked;
      return a.name.localeCompare(b.name, "he");
    });
  }, [supplierList, supplierQuery, lineMap]);

  const departmentOptions = useMemo(
    () => (departments ?? []).map((d) => ({ value: d.id, label: d.name })),
    [departments],
  );

  const transferMax = transferFrom ? drafts[transferFrom]?.qty ?? 0 : 0;

  const loading =
    !businessId ||
    warehousesLoading ||
    suppliersLoading ||
    (isEdit ? itemsLoading || itemSuppliersLoading || !hydrated : !hydrated);

  function goBack() {
    if (location.key !== "default") navigate(-1);
    else navigate("/inventory");
  }

  function toggleWarehouse(id: string) {
    setError(null);
    setDrafts((d) => {
      const current = d[id] ?? { qty: 0, stocked: false };
      return { ...d, [id]: { ...current, stocked: !current.stocked } };
    });
  }

  function setWarehouseQty(id: string, qty: number) {
    setDrafts((d) => ({ ...d, [id]: { qty: Math.max(0, qty), stocked: true } }));
  }

  function openTransfer() {
    setTransferNote(null);
    const nextOpen = !transferOpen;
    setTransferOpen(nextOpen);
    if (nextOpen) {
      const from = stockedIds.find((id) => (drafts[id]?.qty ?? 0) > 0) ?? "";
      setTransferFrom(from);
      setTransferTo(warehouses.find((w) => w.id !== from)?.id ?? "");
      setTransferQty(0);
    }
  }

  function runTransfer() {
    setTransferNote(null);
    if (!transferFrom || !transferTo || transferFrom === transferTo) {
      setTransferNote("בחרו מחסן מקור ומחסן יעד שונים");
      return;
    }
    const amount = Math.min(transferQty, drafts[transferFrom]?.qty ?? 0);
    if (amount <= 0) {
      setTransferNote("אין כמות להעברה מהמחסן שנבחר");
      return;
    }
    const fromName = warehouses.find((w) => w.id === transferFrom)?.name ?? "מחסן";
    const toName = warehouses.find((w) => w.id === transferTo)?.name ?? "מחסן";
    setDrafts((d) => {
      const from = d[transferFrom] ?? { qty: 0, stocked: false };
      const to = d[transferTo] ?? { qty: 0, stocked: false };
      const remaining = Math.round((from.qty - amount) * 10000) / 10000;
      return {
        ...d,
        [transferFrom]: { qty: remaining, stocked: remaining > 0 },
        [transferTo]: { qty: Math.round((to.qty + amount) * 10000) / 10000, stocked: true },
      };
    });
    setTransferQty(0);
    setTransferNote(
      `הועברו ${formatQtyWithPieces(amount, form.unit, unitsPerPackage)} מ${fromName} ל${toName} — יישמר בלחיצה על «שמירה»`,
    );
  }

  function toggleSupplier(id: string) {
    setError(null);
    if (lineMap.has(id)) {
      setSupplierLines((ls) => ls.filter((l) => l.supplierId !== id));
      priceRefs.current.delete(id);
    } else {
      setSupplierLines((ls) => [...ls, { supplierId: id, mainPrice: "", piecePrice: "" }]);
      window.setTimeout(() => priceRefs.current.get(id)?.focus(), 90);
    }
  }

  function setSupplierPrice(id: string, field: "mainPrice" | "piecePrice", price: string) {
    setSupplierLines((ls) => ls.map((l) => (l.supplierId === id ? { ...l, [field]: price } : l)));
  }

  function revealSupplierPrice(id: string) {
    setSupplierQuery("");
    window.setTimeout(() => {
      suppliersCardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      window.setTimeout(() => priceRefs.current.get(id)?.focus(), 240);
    }, 30);
  }

  async function submit() {
    setError(null);
    setAttempted(true);
    if (!form.name.trim()) return setError("נא להזין שם מוצר");

    if (canEditSuppliers) {
      const firstMissing = supplierLines.find((l) => !lineHasValidPrice(l, dualUnit));
      if (firstMissing) {
        revealSupplierPrice(firstMissing.supplierId);
        return setError("לכל ספק משויך יש להזין מחיר תקין");
      }
    }

    setBusy(true);
    try {
      let image_url = form.imageUrl;
      if (form.file) image_url = await uploadItemImage(businessId!, form.file);

      const barcode = normalizeInventoryBarcode(form.barcode);
      const min_quantity = Math.max(0, Number(form.minQty) || 0);
      const supplier_delivery_day = form.deliveryDay === "" ? null : Number(form.deliveryDay);
      const category_id = form.categoryId || null;
      const units_per_package = supportsPieceInput(form.unit)
        ? Math.max(0, Number(form.unitsPerPackage) || 0) || null
        : null;
      const department_ids = form.departmentIds;

      const supplierPayload: { supplier_id: string; unit_price: number; price_unit: SupplierPriceUnit }[] = [];
      for (const line of supplierLines) {
        const main = priceValue(line.mainPrice);
        const piece = dualUnit ? priceValue(line.piecePrice) : null;
        if (main != null) {
          supplierPayload.push({ supplier_id: line.supplierId, unit_price: main, price_unit: "main" });
        }
        if (piece != null) {
          supplierPayload.push({ supplier_id: line.supplierId, unit_price: piece, price_unit: "piece" });
        }
      }

      if (editing) {
        const changed: string[] = [];
        if (form.name.trim() !== editing.name) changed.push("שם");
        if (barcode !== editing.barcode) changed.push("ברקוד");
        if (form.unit !== (editing.unit ?? "יחידות")) changed.push("יחידת מידה");
        if (units_per_package !== editing.units_per_package) changed.push("יחידים ביחידת מידה");
        if (min_quantity !== editing.min_quantity) changed.push("כמות מינימום");
        if (supplier_delivery_day !== editing.supplier_delivery_day) changed.push("יום אספקה");
        if (category_id !== editing.category_id) changed.push("קטגוריה");
        if (image_url !== editing.image_url) changed.push("תמונה");
        const prevDepts = [...editing.department_ids].sort().join(",");
        const nextDepts = [...department_ids].sort().join(",");
        if (prevDepts !== nextDepts) changed.push("מחלקות");

        const prevSuppliers = (itemSuppliers ?? [])
          .map((r) => `${r.supplier_id}:${r.price_unit}:${r.unit_price}`)
          .sort()
          .join(",");
        const nextSuppliers = supplierPayload
          .map((r) => `${r.supplier_id}:${r.price_unit}:${r.unit_price}`)
          .sort()
          .join(",");
        const suppliersChanged = canEditSuppliers && prevSuppliers !== nextSuppliers;
        if (suppliersChanged) changed.push("ספקים");

        await updateItem.mutateAsync({
          id: editing.id,
          business_id: businessId!,
          employee_id: profile?.id ?? null,
          changes: {
            name: form.name.trim(),
            barcode,
            unit: form.unit,
            units_per_package,
            image_url,
            min_quantity,
            supplier_delivery_day,
            category_id,
          },
          department_ids,
          note: changed.length ? `עודכן: ${changed.join(", ")}` : null,
        });

        for (const w of warehouses) {
          const draft = drafts[w.id];
          if (!draft) continue;
          const prevQty = itemWarehouseQty(editing, w.id);
          const nextQty = draft.stocked ? draft.qty : 0;
          if (nextQty === prevQty) continue;
          await setCount.mutateAsync({
            business_id: businessId!,
            item_id: editing.id,
            warehouse_id: w.id,
            employee_id: profile?.id ?? null,
            quantity: nextQty,
            previous_qty: prevQty,
          });
        }

        if (suppliersChanged) {
          await saveItemSuppliers.mutateAsync({
            business_id: businessId!,
            item_id: editing.id,
            lines: supplierPayload,
          });
        }
      } else {
        const newItemId = await createItem.mutateAsync({
          business_id: businessId!,
          name: form.name.trim(),
          barcode,
          unit: form.unit,
          units_per_package,
          image_url,
          min_quantity,
          supplier_delivery_day,
          category_id,
          department_ids,
          warehouse_quantities: warehouses
            .filter((w) => drafts[w.id]?.stocked && (drafts[w.id]?.qty ?? 0) > 0)
            .map((w) => ({ warehouse_id: w.id, quantity: drafts[w.id]!.qty })),
          employee_id: profile?.id ?? null,
        });

        if (canEditSuppliers && supplierPayload.length && newItemId) {
          await saveItemSuppliers.mutateAsync({
            business_id: businessId!,
            item_id: newItemId,
            lines: supplierPayload,
          });
        }
      }

      navigate("/inventory", { replace: true });
    } catch (e) {
      setError(inventorySaveError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) return <Navigate to="/inventory" replace />;
  if (!businessId) {
    return <EmptyState icon="store" title="לא משויך לעסק" description="פנו למנהל המערכת לשיוך לעסק." />;
  }
  if (isEdit && !itemsLoading && !editing) {
    return (
      <EmptyState
        icon="inventory_2"
        title="המוצר לא נמצא"
        description="ייתכן שהמוצר נמחק או שאין לכם הרשאה לצפות בו."
        action={
          <Link to="/inventory">
            <Button variant="secondary">חזרה למלאי</Button>
          </Link>
        }
      />
    );
  }
  if (loading) return <PageLoader label={isEdit ? "טוען מוצר..." : "טוען..."} />;

  const displayName = form.name.trim();
  const imageSrc = preview ?? form.imageUrl;
  const categoryLabel = form.categoryId
    ? (inventoryCategories ?? []).find((c) => c.id === form.categoryId)?.name ?? null
    : null;
  const lowStock = Number(form.minQty) > 0 && totalQty <= Number(form.minQty);
  const saving = busy || createItem.isPending || updateItem.isPending || saveItemSuppliers.isPending;

  return (
    <div className="spf-page page-enter">
      {/* ── Ink hero — the product identity, live ── */}
      <header className="spf-hero">
        <span className="spf-glow spf-glow--1" aria-hidden />
        <span className="spf-glow spf-glow--2" aria-hidden />
        <span className="spf-grid-lines" aria-hidden />

        <div className="spf-hero-inner">
          <div className="spf-hero-bar">
            <button type="button" className="spf-back" onClick={goBack}>
              <Icon name="arrow_forward" size={17} />
              חזרה למלאי
            </button>
            <span className="spf-hero-tag">
              <Icon name={isEdit ? "edit" : "add_box"} size={14} />
              {isEdit ? "עריכת מוצר" : "מוצר חדש"}
            </span>
          </div>

          <div className="spf-hero-id">
            <button
              type="button"
              className="ipf-hero-photo"
              data-empty={!imageSrc}
              onClick={() => fileRef.current?.click()}
              aria-label="החלפת תמונת מוצר"
            >
              {imageSrc ? <img src={imageSrc} alt="" /> : <Icon name="inventory_2" size={26} />}
              <span className="ipf-hero-photo-badge" aria-hidden>
                <Icon name="photo_camera" size={13} />
              </span>
            </button>
            <div className="min-w-0">
              <h1 className="spf-hero-title" data-placeholder={!displayName}>
                {displayName || "מוצר ללא שם"}
              </h1>
              <p className="spf-hero-sub">
                {categoryLabel && (
                  <span className="spf-hero-fact">
                    <Icon name="sell" size={13} />
                    {categoryLabel}
                  </span>
                )}
                <span className="spf-hero-fact">
                  <Icon name="straighten" size={13} />
                  {form.unit}
                  {dualUnit ? ` · ${unitsPerPackage} יח׳` : ""}
                </span>
                {form.barcode.trim() && (
                  <span className="spf-hero-fact" dir="ltr">
                    <Icon name="barcode" size={13} />
                    {form.barcode.trim()}
                  </span>
                )}
                {lowStock && (
                  <span className="spf-hero-fact ipf-hero-warn">
                    <Icon name="warning" size={13} />
                    מתחת למינימום
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="spf-hero-stats">
            <div className="spf-stat">
              <span className="spf-stat-label">סה״כ במלאי</span>
              <b className="spf-stat-value" key={`q${totalQty}`}>
                {formatQtyWithPieces(totalQty, form.unit, unitsPerPackage)}
              </b>
            </div>
            <div className="spf-stat">
              <span className="spf-stat-label">מחסנים</span>
              <b className="spf-stat-value" key={`w${stockedCount}`}>
                {stockedCount}
                {warehouses.length > 0 && <span className="ipf-stat-of">/{warehouses.length}</span>}
              </b>
            </div>
            <div className="spf-stat">
              <span className="spf-stat-label">
                {canEditSuppliers && cheapest ? "המחיר הזול ביותר" : "ספקים"}
              </span>
              <b className="spf-stat-value" key={`s${supplierLines.length}`}>
                {canEditSuppliers && cheapest ? formatCurrency(cheapest.price) : supplierLines.length}
              </b>
            </div>
          </div>
        </div>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))}
      />

      <div className="spf-body">
        <div className="spf-layout">
          {/* ── Product details ── */}
          <aside className="spf-aside">
            <section className="spf-card">
              <h2 className="spf-card-title">
                <span className="spf-card-icon">
                  <Icon name="inventory_2" size={17} />
                </span>
                פרטי המוצר
              </h2>

              <div className="ipf-photo-row">
                <button
                  type="button"
                  className="ipf-photo-thumb"
                  data-empty={!imageSrc}
                  onClick={() => fileRef.current?.click()}
                  aria-label={imageSrc ? "החלפת תמונת מוצר" : "העלאת תמונת מוצר"}
                >
                  {imageSrc ? <img src={imageSrc} alt="" /> : <Icon name="add_a_photo" size={22} />}
                </button>
                <div className="ipf-photo-meta">
                  <span className="spf-field-label">תמונת מוצר</span>
                  <p>עוזרת לזהות את המוצר במלאי, בהזמנות ובדיווחי בלאי.</p>
                  <div className="ipf-photo-actions">
                    <button type="button" onClick={() => fileRef.current?.click()}>
                      <Icon name="upload" size={14} />
                      {imageSrc ? "החלפה" : "העלאה"}
                    </button>
                    {imageSrc && (
                      <button
                        type="button"
                        data-danger="true"
                        onClick={() => setForm((f) => ({ ...f, file: null, imageUrl: null }))}
                      >
                        <Icon name="delete" size={14} />
                        הסרה
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="spf-fields">
                <IpfField icon="label" label="שם המוצר" hint="חובה">
                  <Input
                    className="spf-input"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="לדוגמה: חלב 3%"
                    autoFocus={!isEdit}
                    required
                  />
                </IpfField>

                <IpfField icon="barcode" label="ברקוד" note="ייחודי לעסק — ניתן לחפש לפיו במלאי ובהזמנות">
                  <Input
                    className="spf-input font-mono"
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    placeholder="7290000000000"
                    inputMode="numeric"
                    dir="ltr"
                  />
                </IpfField>

                <IpfField
                  icon="category"
                  label="קטגוריה"
                  note={
                    !(inventoryCategories?.length) ? (
                      <>
                        הוסיפו קטגוריות ב
                        <Link to="/settings" className="ipf-link">
                          הגדרות העסק
                        </Link>
                      </>
                    ) : undefined
                  }
                >
                  <Select
                    className="ipf-select"
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  >
                    <option value="">ללא קטגוריה</option>
                    {(inventoryCategories ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </IpfField>

                <IpfField
                  icon="groups"
                  label="מחלקות"
                  note={
                    departmentOptions.length === 0
                      ? "הוסיפו מחלקות בהגדרות העסק כדי לשייך מוצרים."
                      : "ללא בחירה — המוצר יוצג לכל המחלקות."
                  }
                >
                  <MultiSelect
                    className="ipf-select"
                    values={form.departmentIds}
                    onChange={(departmentIds) => setForm({ ...form, departmentIds })}
                    options={departmentOptions}
                    placeholder="כל המחלקות"
                    disabled={!departmentOptions.length}
                  />
                </IpfField>

                <div className="spf-fields-row">
                  <IpfField icon="straighten" label="יחידת מידה">
                    <Select
                      className="ipf-select"
                      value={form.unit}
                      onChange={(e) => {
                        const unit = e.target.value;
                        setForm((f) => ({
                          ...f,
                          unit,
                          unitsPerPackage: unit === BASE_UNIT ? "" : f.unitsPerPackage,
                        }));
                      }}
                    >
                      {INVENTORY_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </Select>
                  </IpfField>

                  {supportsPieceInput(form.unit) ? (
                    <IpfField
                      icon="widgets"
                      label={`יחידים ב${form.unit}`}
                      note={
                        dualUnit
                          ? `1 ${form.unit} = ${unitsPerPackage} יחידות`
                          : "מאפשר להזין כמויות גם ביחידים בודדים"
                      }
                    >
                      <Input
                        className="spf-input"
                        type="number"
                        min={1}
                        value={form.unitsPerPackage}
                        onChange={(e) => setForm({ ...form, unitsPerPackage: e.target.value })}
                        placeholder="לדוגמה: 24"
                      />
                    </IpfField>
                  ) : (
                    <IpfField icon="low_priority" label="כמות מינימום" note="מתחת לסף — מלאי נמוך">
                      <Input
                        className="spf-input"
                        type="number"
                        min={0}
                        value={form.minQty}
                        onChange={(e) => setForm({ ...form, minQty: e.target.value })}
                        placeholder="0"
                      />
                    </IpfField>
                  )}
                </div>

                {supportsPieceInput(form.unit) && (
                  <IpfField
                    icon="low_priority"
                    label="כמות מינימום"
                    note="מתחת לסף זה הפריט יסומן כמלאי נמוך"
                  >
                    <Input
                      className="spf-input"
                      type="number"
                      min={0}
                      value={form.minQty}
                      onChange={(e) => setForm({ ...form, minQty: e.target.value })}
                      placeholder="0"
                    />
                  </IpfField>
                )}

                <IpfField
                  icon="local_shipping"
                  label="יום אספקה מהספק"
                  note="ביום זה הסחורה אמורה להגיע לאחר הזמנה"
                >
                  <Select
                    className="ipf-select"
                    value={form.deliveryDay}
                    onChange={(e) => setForm({ ...form, deliveryDay: e.target.value })}
                  >
                    <option value="">לא הוגדר</option>
                    {HE_DAYS.map((d, i) => (
                      <option key={i} value={String(i)}>
                        יום {d}
                      </option>
                    ))}
                  </Select>
                </IpfField>
              </div>

              {error && (
                <p className="spf-alert" role="alert">
                  <Icon name="error" size={17} />
                  {error}
                </p>
              )}
            </section>
          </aside>

          {/* ── Warehouses + suppliers ── */}
          <main className="spf-main ipf-stack">
            <section className="spf-card">
              <h2 className="spf-card-title">
                <span className="spf-card-icon">
                  <Icon name="warehouse" size={17} />
                </span>
                מחסנים
                {stockedCount > 0 && <span className="spf-count">{stockedCount}</span>}
              </h2>

              {warehouses.length === 0 ? (
                <div className="ipf-empty">
                  <span className="ipf-empty-icon" aria-hidden>
                    <Icon name="warehouse" size={22} />
                  </span>
                  <p>
                    לא הוגדרו מחסנים לעסק
                    <em>
                      הוסיפו מחסנים ב
                      <Link to="/settings" className="ipf-link">
                        הגדרות העסק
                      </Link>{" "}
                      כדי לנהל כמות נפרדת בכל מחסן.
                    </em>
                  </p>
                </div>
              ) : (
                <>
                  <div className="ipf-wh-list">
                    {warehouses.map((w) => {
                      const stock = editing?.warehouse_stocks.find((s) => s.warehouse_id === w.id);
                      return (
                        <WarehouseRow
                          key={w.id}
                          warehouse={w}
                          draft={drafts[w.id] ?? { qty: 0, stocked: false }}
                          unit={form.unit}
                          unitsPerPackage={unitsPerPackage}
                          totalQty={totalQty}
                          lastUpdatedAt={stock?.last_updated_at ?? null}
                          lastUpdatedBy={stock?.last_updated_by_name ?? null}
                          onToggle={() => toggleWarehouse(w.id)}
                          onQty={(qty) => setWarehouseQty(w.id, qty)}
                        />
                      );
                    })}
                  </div>

                  <p className="ipf-hint">
                    <Icon name="info" size={14} />
                    כיבוי המתג מאפס את הכמות במחסן — המוצר מופיע במחסן כל עוד יש בו כמות.
                  </p>

                  {warehouses.length > 1 && (
                    <div className="ipf-transfer" data-open={transferOpen}>
                      <button
                        type="button"
                        className="ipf-transfer-toggle"
                        aria-expanded={transferOpen}
                        onClick={openTransfer}
                      >
                        <Icon name="swap_horiz" size={16} />
                        העברת כמות בין מחסנים
                        <Icon
                          name={transferOpen ? "expand_less" : "expand_more"}
                          size={16}
                          className="ipf-transfer-caret"
                        />
                      </button>

                      {transferOpen && (
                        <div className="ipf-transfer-body">
                          <div className="ipf-transfer-row">
                            <label className="ipf-transfer-cell">
                              <span>מהמחסן</span>
                              <Select
                                value={transferFrom}
                                onChange={(e) => setTransferFrom(e.target.value)}
                              >
                                <option value="">בחרו מחסן</option>
                                {warehouses.map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.name} · {drafts[w.id]?.qty ?? 0}
                                  </option>
                                ))}
                              </Select>
                            </label>
                            <span className="ipf-transfer-arrow" aria-hidden>
                              <Icon name="arrow_back" size={16} />
                            </span>
                            <label className="ipf-transfer-cell">
                              <span>למחסן</span>
                              <Select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                                <option value="">בחרו מחסן</option>
                                {warehouses
                                  .filter((w) => w.id !== transferFrom)
                                  .map((w) => (
                                    <option key={w.id} value={w.id}>
                                      {w.name}
                                    </option>
                                  ))}
                              </Select>
                            </label>
                          </div>

                          <div className="ipf-transfer-row ipf-transfer-row--end">
                            <label className="ipf-transfer-cell">
                              <span>כמות להעברה</span>
                              <DualUnitQtyInput
                                value={transferQty}
                                mainUnit={form.unit}
                                unitsPerPackage={unitsPerPackage}
                                onCommit={setTransferQty}
                                variant="input"
                              />
                            </label>
                            <Button
                              variant="secondary"
                              icon="swap_horiz"
                              className="!py-2.5"
                              disabled={!transferFrom || !transferTo || transferMax <= 0}
                              onClick={runTransfer}
                            >
                              העברה
                            </Button>
                          </div>

                          {transferFrom && (
                            <p className="ipf-transfer-max">
                              זמין להעברה: {formatQtyWithPieces(transferMax, form.unit, unitsPerPackage)}
                              {dualUnit && transferMax > 0 && (
                                <> ({mainUnitToPieces(transferMax, unitsPerPackage!)} יח׳)</>
                              )}
                            </p>
                          )}
                          {transferNote && <p className="ipf-transfer-note">{transferNote}</p>}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="spf-card" ref={suppliersCardRef}>
              <h2 className="spf-card-title">
                <span className="spf-card-icon">
                  <Icon name="local_shipping" size={17} />
                </span>
                ספקים של המוצר
                {supplierLines.length > 0 && <span className="spf-count">{supplierLines.length}</span>}
              </h2>

              {!canEditSuppliers ? (
                <div className="ipf-empty">
                  <span className="ipf-empty-icon" aria-hidden>
                    <Icon name="lock" size={22} />
                  </span>
                  <p>
                    שיוך ספקים ומחירים
                    <em>רק מנהל עסק או מנהל משרד יכולים לשייך ספקים ולעדכן מחירי רכש.</em>
                  </p>
                </div>
              ) : (supplierList ?? []).length === 0 ? (
                <div className="ipf-empty">
                  <span className="ipf-empty-icon" aria-hidden>
                    <Icon name="local_shipping" size={22} />
                  </span>
                  <p>
                    עדיין אין ספקים בעסק
                    <em>
                      הוסיפו ספקים ב
                      <Link to="/suppliers" className="ipf-link">
                        עמוד הספקים
                      </Link>{" "}
                      ואז שייכו אותם למוצר עם מחיר.
                    </em>
                  </p>
                </div>
              ) : (
                <>
                  {(supplierList ?? []).length > 6 && (
                    <div className="spf-search ipf-sup-search">
                      <Icon name="search" size={18} className="spf-search-icon" />
                      <input
                        value={supplierQuery}
                        onChange={(e) => setSupplierQuery(e.target.value)}
                        placeholder="חיפוש ספק..."
                        className="spf-search-input"
                        aria-label="חיפוש ספק"
                      />
                      {supplierQuery && (
                        <button
                          type="button"
                          className="spf-search-x"
                          onClick={() => setSupplierQuery("")}
                          aria-label="ניקוי חיפוש"
                        >
                          <Icon name="close" size={15} />
                        </button>
                      )}
                    </div>
                  )}

                  <div className="ipf-sup-list">
                    {visibleSuppliers.map((s) => {
                      const line = lineMap.get(s.id);
                      return (
                        <SupplierRow
                          key={s.id}
                          supplier={s}
                          line={line}
                          unit={form.unit}
                          dual={dualUnit}
                          cheapest={!!cheapest && cheapest.id === s.id && effectivePrices.size > 1}
                          missing={attempted && !!line && !lineHasValidPrice(line, dualUnit)}
                          onToggle={() => toggleSupplier(s.id)}
                          onFocusPrice={() => priceRefs.current.get(s.id)?.focus()}
                          onMainPrice={(v) => setSupplierPrice(s.id, "mainPrice", v)}
                          onPiecePrice={(v) => setSupplierPrice(s.id, "piecePrice", v)}
                          registerMainPrice={(el) => {
                            if (el) priceRefs.current.set(s.id, el);
                            else priceRefs.current.delete(s.id);
                          }}
                        />
                      );
                    })}
                    {visibleSuppliers.length === 0 && (
                      <p className="ipf-sup-none">לא נמצא ספק בשם הזה.</p>
                    )}
                  </div>

                  <p className="ipf-hint">
                    <Icon name="info" size={14} />
                    {dualUnit
                      ? `אפשר להזין מחיר ל${form.unit} וגם ליחידה בודדת — המחיר משמש בהזמנות מהספק.`
                      : `המחיר נשמר לספק הזה בלבד, ל${form.unit || "יחידה"} אחת — ומשמש בהזמנות.`}
                  </p>
                </>
              )}
            </section>
          </main>
        </div>
      </div>

      {/* ── Sticky save bar ── */}
      <div className="spf-foot">
        <div className="spf-foot-info">
          <b>{formatQtyWithPieces(totalQty, form.unit, unitsPerPackage)}</b>
          <span>
            ב-{stockedCount} מחסנים
            {canEditSuppliers && supplierLines.length > 0 ? ` · ${supplierLines.length} ספקים` : ""}
          </span>
        </div>
        <div className="spf-foot-actions">
          <Button variant="secondary" onClick={goBack} className="!py-2.5">
            ביטול
          </Button>
          <Button loading={saving} onClick={submit} icon="check" className="!py-2.5">
            {isEdit ? "שמירה" : "הוספת מוצר"}
          </Button>
        </div>
      </div>
    </div>
  );
}
