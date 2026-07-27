import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import { InventoryUnitSelect, inventoryUnitIsBase } from "@/components/inventory/InventoryUnitSelect";
import { useAuth } from "@/lib/auth";
import { useBusinessId, formatCurrency } from "@/lib/db";
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
  canUsePieceInput,
  mainUnitToPieces,
  inventorySaveError,
  BASE_UNIT,
  type ItemWithQty,
} from "@/api/inventory";
import { useWarehouses } from "@/api/warehouses";
import { useDepartments } from "@/api/departments";
import { useInventoryCategories } from "@/api/inventoryCategories";
import { useInventoryUnits } from "@/api/inventoryUnits";
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
  departmentIds: string[];
  imageUrl: string | null;
  file: File | null;
};

/** Quantity held in each warehouse, keyed by warehouse id. Zero = not stocked there. */
type StockDraft = Record<string, number>;

/** One supplier link: a price per main unit and/or per single piece. */
type SupplierLine = { supplierId: string; mainPrice: string; piecePrice: string };

type StepId = "basics" | "unit" | "stock" | "suppliers" | "review";

type StepDef = {
  id: StepId;
  /** Short label for the stepper rail. */
  label: string;
  icon: string;
  title: string;
  sub: string;
};

const EMPTY_FORM: ItemFormState = {
  name: "",
  barcode: "",
  categoryId: "",
  unit: "יחידות",
  unitsPerPackage: "",
  minQty: "0",
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
    departmentIds: [...item.department_ids],
    imageUrl: item.image_url,
    file: null,
  };
}

function draftsFromItem(warehouses: Warehouse[], item: ItemWithQty | null): StockDraft {
  const map: StockDraft = {};
  for (const w of warehouses) map[w.id] = item ? itemWarehouseQty(item, w.id) : 0;
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
/* Warehouse row — quantity is always editable, in every warehouse   */
/* ---------------------------------------------------------------- */
function WarehouseRow({
  warehouse,
  qty,
  unit,
  unitsPerPackage,
  totalQty,
  lastUpdatedAt,
  lastUpdatedBy,
  onQty,
}: {
  warehouse: Warehouse;
  qty: number;
  unit: string;
  unitsPerPackage: number | null;
  totalQty: number;
  lastUpdatedAt: string | null;
  lastUpdatedBy: string | null;
  onQty: (qty: number) => void;
}) {
  const share = totalQty > 0 ? Math.round((qty / totalQty) * 100) : 0;
  const when = relativeWhen(lastUpdatedAt);
  const sub = when ? `עודכן ${when}${lastUpdatedBy ? ` · ${lastUpdatedBy}` : ""}` : "טרם נספר במחסן הזה";

  return (
    <article className="iwz-wh" data-on={qty > 0}>
      <span className="iwz-wh-icon" aria-hidden>
        <Icon name="warehouse" size={17} />
      </span>
      <span className="iwz-wh-id">
        <b className="iwz-wh-name">
          {warehouse.name}
          {warehouse.is_default && <em className="iwz-wh-tag">ראשי</em>}
        </b>
        <span className="iwz-wh-sub">{sub}</span>
      </span>
      <div className="iwz-wh-qty">
        <DualUnitQtyInput
          value={qty}
          mainUnit={unit}
          unitsPerPackage={unitsPerPackage}
          onCommit={onQty}
          variant="stepper"
        />
      </div>
      <div className="iwz-wh-meter">
        <span className="iwz-wh-bar" aria-hidden>
          <i style={{ width: `${Math.min(100, share)}%` }} />
        </span>
        <span className="iwz-wh-meta">
          {qty > 0 ? (
            <>
              {formatQtyWithPieces(qty, unit, unitsPerPackage)}
              {totalQty > 0 && <em>{share}% מהמלאי</em>}
            </>
          ) : (
            <em data-empty="true">אין מלאי במחסן הזה</em>
          )}
        </span>
      </div>
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
/* Review row — one summary line with a jump-back button             */
/* ---------------------------------------------------------------- */
function ReviewFact({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) {
  return (
    <div className="iwz-fact">
      <span className="iwz-fact-icon" aria-hidden>
        <Icon name={icon} size={16} />
      </span>
      <span className="iwz-fact-body">
        <span className="iwz-fact-label">{label}</span>
        <b className="iwz-fact-value">{value}</b>
      </span>
    </div>
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
  const { data: inventoryUnits } = useInventoryUnits(businessId);
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
  const [drafts, setDrafts] = useState<StockDraft>({});
  const [supplierLines, setSupplierLines] = useState<SupplierLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  /* Wizard navigation */
  const [stepIndex, setStepIndex] = useState(0);
  const [maxVisited, setMaxVisited] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferQty, setTransferQty] = useState(0);
  const [transferNote, setTransferNote] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const priceRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const pageRef = useRef<HTMLDivElement>(null);

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

  const unitsPerPackage = !inventoryUnitIsBase(form.unit, inventoryUnits)
    ? Number(form.unitsPerPackage) || null
    : null;
  const dualUnit = canUsePieceInput(form.unit, unitsPerPackage);

  const totalQty = useMemo(
    () => warehouses.reduce((sum, w) => sum + (drafts[w.id] ?? 0), 0),
    [warehouses, drafts],
  );
  const stockedCount = useMemo(
    () => warehouses.filter((w) => (drafts[w.id] ?? 0) > 0).length,
    [warehouses, drafts],
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

  const transferMax = transferFrom ? drafts[transferFrom] ?? 0 : 0;

  /* ── Steps ── */
  const steps = useMemo<StepDef[]>(() => {
    const list: StepDef[] = [
      {
        id: "basics",
        label: "פרטים",
        icon: "label",
        title: "פרטי המוצר",
        sub: "השם, הברקוד והשיוך — כך המוצר יזוהה בכל המערכת.",
      },
      {
        id: "unit",
        label: "מידות",
        icon: "straighten",
        title: "יחידת מידה וסף התראה",
        sub: "איך סופרים את המוצר, ומתי להתריע שהוא עומד להיגמר.",
      },
      {
        id: "stock",
        label: "מלאי",
        icon: "warehouse",
        title: "מלאי במחסנים",
        sub: "הזינו כמות לכל מחסן שבו המוצר מוחזק — אפשר בכמה מחסנים במקביל.",
      },
    ];
    if (canEditSuppliers) {
      list.push({
        id: "suppliers",
        label: "ספקים",
        icon: "local_shipping",
        title: "ספקים ומחירי רכש",
        sub: "שייכו ספקים למוצר והזינו את המחיר אצל כל אחד מהם.",
      });
    }
    if (!isEdit) {
      list.push({
        id: "review",
        label: "סיכום",
        icon: "task_alt",
        title: "סיכום לפני הוספה",
        sub: "עברו על הפרטים — אפשר לחזור ולתקן כל שלב.",
      });
    }
    return list;
  }, [canEditSuppliers, isEdit]);

  const safeIndex = Math.min(stepIndex, steps.length - 1);
  const step = steps[safeIndex];
  const isFirst = safeIndex === 0;
  const isLast = safeIndex === steps.length - 1;

  const loading =
    !businessId ||
    warehousesLoading ||
    suppliersLoading ||
    (isEdit ? itemsLoading || itemSuppliersLoading || !hydrated : !hydrated);

  function goBack() {
    if (location.key !== "default") navigate(-1);
    else navigate("/inventory");
  }

  function setWarehouseQty(id: string, qty: number) {
    setDrafts((d) => ({ ...d, [id]: Math.max(0, qty) }));
  }

  function openTransfer() {
    setTransferNote(null);
    const nextOpen = !transferOpen;
    setTransferOpen(nextOpen);
    if (nextOpen) {
      const from = warehouses.find((w) => (drafts[w.id] ?? 0) > 0)?.id ?? "";
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
    const amount = Math.min(transferQty, drafts[transferFrom] ?? 0);
    if (amount <= 0) {
      setTransferNote("אין כמות להעברה מהמחסן שנבחר");
      return;
    }
    const fromName = warehouses.find((w) => w.id === transferFrom)?.name ?? "מחסן";
    const toName = warehouses.find((w) => w.id === transferTo)?.name ?? "מחסן";
    setDrafts((d) => ({
      ...d,
      [transferFrom]: Math.round(((d[transferFrom] ?? 0) - amount) * 10000) / 10000,
      [transferTo]: Math.round(((d[transferTo] ?? 0) + amount) * 10000) / 10000,
    }));
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

  function focusSupplierPrice(id: string) {
    setSupplierQuery("");
    window.setTimeout(() => priceRefs.current.get(id)?.focus(), 260);
  }

  /* ── Step navigation ── */
  /** Returns the blocking message for a step, or null when it may be left. */
  function validateStep(id: StepId): string | null {
    if (id === "basics" && !form.name.trim()) return "נא להזין שם מוצר";
    if (id === "unit") {
      const raw = form.unitsPerPackage.trim();
      if (!inventoryUnitIsBase(form.unit, inventoryUnits) && raw !== "" && (Number(raw) || 0) < 1) {
        return `נא להזין כמה יחידות יש ב${form.unit} — מספר מ-1 ומעלה`;
      }
      if ((Number(form.minQty) || 0) < 0) return "כמות מינימום לא יכולה להיות שלילית";
    }
    if (id === "suppliers") {
      const firstMissing = supplierLines.find((l) => !lineHasValidPrice(l, dualUnit));
      if (firstMissing) {
        focusSupplierPrice(firstMissing.supplierId);
        return "לכל ספק משויך יש להזין מחיר תקין";
      }
    }
    return null;
  }

  function jumpTo(index: number, direction: "next" | "prev") {
    setDir(direction);
    setStepIndex(index);
    setMaxVisited((m) => Math.max(m, index));
    pageRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function goPrev() {
    if (isFirst) return goBack();
    setError(null);
    setAttempted(false);
    jumpTo(safeIndex - 1, "prev");
  }

  function goNext() {
    setAttempted(true);
    const problem = validateStep(step.id);
    if (problem) return setError(problem);
    setError(null);
    if (isLast) return void submit();
    setAttempted(false);
    jumpTo(safeIndex + 1, "next");
  }

  function goToStep(index: number) {
    if (index === safeIndex) return;
    if (!isEdit && index > maxVisited) return;
    setError(null);
    setAttempted(false);
    jumpTo(index, index > safeIndex ? "next" : "prev");
  }

  async function submit() {
    setAttempted(true);
    for (let i = 0; i < steps.length; i++) {
      const problem = validateStep(steps[i].id);
      if (problem) {
        setError(problem);
        if (i !== safeIndex) jumpTo(i, i > safeIndex ? "next" : "prev");
        return;
      }
    }
    setError(null);

    setBusy(true);
    try {
      let image_url = form.imageUrl;
      if (form.file) image_url = await uploadItemImage(businessId!, form.file);

      const barcode = normalizeInventoryBarcode(form.barcode);
      const min_quantity = Math.max(0, Number(form.minQty) || 0);
      const category_id = form.categoryId || null;
      const units_per_package = !inventoryUnitIsBase(form.unit, inventoryUnits)
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
            category_id,
          },
          department_ids,
          note: changed.length ? `עודכן: ${changed.join(", ")}` : null,
        });

        for (const w of warehouses) {
          const nextQty = drafts[w.id] ?? 0;
          const prevQty = itemWarehouseQty(editing, w.id);
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
          category_id,
          department_ids,
          warehouse_quantities: warehouses
            .filter((w) => (drafts[w.id] ?? 0) > 0)
            .map((w) => ({ warehouse_id: w.id, quantity: drafts[w.id]! })),
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
  const minQtyValue = Math.max(0, Number(form.minQty) || 0);
  const lowStock = minQtyValue > 0 && totalQty <= minQtyValue;
  const saving = busy || createItem.isPending || updateItem.isPending || saveItemSuppliers.isPending;

  /* ── Step bodies ── */

  function renderBasics() {
    return (
      <>
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
              autoFocus={!isEdit && maxVisited === 0}
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
        </div>
      </>
    );
  }

  function renderUnit() {
    const isPackUnit = !inventoryUnitIsBase(form.unit, inventoryUnits);
    const minQtyNum = Math.max(0, Number(form.minQty) || 0);

    return (
      <div className="iwz-unit">
        <div className="iwz-unit-hero">
          <div className="iwz-unit-hero-copy">
            <span className="iwz-unit-hero-kicker">מדידה</span>
            <h3 className="iwz-unit-hero-title">יחידת מידה</h3>
            <p className="iwz-unit-hero-sub">באיזו יחידה סופרים, מזמינים ומנהלים מלאי עבור מוצר זה</p>
          </div>
          <span className="iwz-unit-hero-icon" aria-hidden>
            <Icon name="straighten" size={22} />
          </span>
        </div>

        <div className="iwz-unit-picker">
          <span className="iwz-unit-picker-label">יחידה נבחרת</span>
          <InventoryUnitSelect
            businessId={businessId}
            value={form.unit}
            canManage={canManage}
            className="iwz-unit-select"
            onChange={(unit) => {
              setForm((f) => ({
                ...f,
                unit,
                unitsPerPackage: inventoryUnitIsBase(unit, inventoryUnits) ? "" : f.unitsPerPackage,
              }));
            }}
          />
        </div>

        {isPackUnit && (
          <div className="iwz-unit-pack">
            <div className="iwz-unit-pack-head">
              <Icon name="widgets" size={17} />
              <span>פירוק ליחידים בודדים</span>
            </div>
            <div className="iwz-unit-pack-grid">
              <label className="iwz-unit-pack-field">
                <span className="iwz-unit-pack-label">יחידים ב{form.unit}</span>
                <Input
                  className="spf-input iwz-unit-pack-input"
                  type="number"
                  min={1}
                  value={form.unitsPerPackage}
                  onChange={(e) => setForm({ ...form, unitsPerPackage: e.target.value })}
                  placeholder="לדוגמה: 24"
                />
              </label>

              {dualUnit && (
                <div className="iwz-unit-ratio" aria-live="polite">
                  <span className="iwz-unit-ratio-chip">
                    <b>1</b>
                    <span>{form.unit}</span>
                  </span>
                  <Icon name="sync_alt" size={18} className="iwz-unit-ratio-arrow" />
                  <span className="iwz-unit-ratio-chip iwz-unit-ratio-chip--accent">
                    <b>{unitsPerPackage}</b>
                    <span>{BASE_UNIT}</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="iwz-unit-threshold">
          <div className="iwz-unit-threshold-head">
            <span className="iwz-unit-threshold-icon" aria-hidden>
              <Icon name="low_priority" size={18} />
            </span>
            <div className="min-w-0">
              <h4 className="iwz-unit-threshold-title">סף התראת מלאי נמוך</h4>
              <p className="iwz-unit-threshold-sub">מתחת לכמות זו המוצר יסומן כמלאי נמוך</p>
            </div>
          </div>
          <div className="iwz-unit-threshold-row">
            <Input
              className="spf-input iwz-unit-threshold-input"
              type="number"
              min={0}
              value={form.minQty}
              onChange={(e) => setForm({ ...form, minQty: e.target.value })}
              placeholder="0"
            />
            <span className="iwz-unit-threshold-unit">{form.unit}</span>
          </div>
          {minQtyNum > 0 && (
            <p className="iwz-unit-threshold-preview">
              <Icon name="notifications_active" size={14} />
              התראה כשהמלאי יורד מתחת ל-{minQtyNum} {form.unit}
            </p>
          )}
        </div>
      </div>
    );
  }

  function renderStock() {
    if (warehouses.length === 0) {
      return (
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
      );
    }

    return (
      <>
        <div className="iwz-wh-list">
          {warehouses.map((w) => {
            const stock = editing?.warehouse_stocks.find((s) => s.warehouse_id === w.id);
            return (
              <WarehouseRow
                key={w.id}
                warehouse={w}
                qty={drafts[w.id] ?? 0}
                unit={form.unit}
                unitsPerPackage={unitsPerPackage}
                totalQty={totalQty}
                lastUpdatedAt={stock?.last_updated_at ?? null}
                lastUpdatedBy={stock?.last_updated_by_name ?? null}
                onQty={(qty) => setWarehouseQty(w.id, qty)}
              />
            );
          })}
        </div>

        <div className="iwz-total">
          <span>
            סה״כ {isEdit ? "במלאי" : "מלאי התחלתי"}
            {stockedCount > 0 && <em>ב-{stockedCount} מחסנים</em>}
          </span>
          <b>{formatQtyWithPieces(totalQty, form.unit, unitsPerPackage)}</b>
        </div>

        <p className="ipf-hint">
          <Icon name="info" size={14} />
          אפשר להזין כמות בכל מחסן בנפרד. מחסן שנשאר על 0 פשוט לא יחזיק את המוצר.
        </p>

        {isEdit && warehouses.length > 1 && (
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
                    <Select value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)}>
                      <option value="">בחרו מחסן</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} · {drafts[w.id] ?? 0}
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
                    type="button"
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
    );
  }

  function renderSuppliers() {
    if ((supplierList ?? []).length === 0) {
      return (
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
              ואז שייכו אותם למוצר עם מחיר. אפשר גם לדלג ולהשלים בהמשך.
            </em>
          </p>
        </div>
      );
    }

    return (
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
          {visibleSuppliers.length === 0 && <p className="ipf-sup-none">לא נמצא ספק בשם הזה.</p>}
        </div>

        <p className="ipf-hint">
          <Icon name="info" size={14} />
          {dualUnit
            ? `אפשר להזין מחיר ל${form.unit} וגם ליחידה בודדת — המחיר משמש בהזמנות מהספק.`
            : `המחיר נשמר לספק הזה בלבד, ל${form.unit || "יחידה"} אחת — ומשמש בהזמנות.`}
        </p>
      </>
    );
  }

  function renderReview() {
    const stocked = warehouses.filter((w) => (drafts[w.id] ?? 0) > 0);
    const linked = supplierLines
      .map((l) => ({ line: l, supplier: (supplierList ?? []).find((s) => s.id === l.supplierId) }))
      .filter((x) => x.supplier);
    const stepIndexOf = (id: StepId) => steps.findIndex((s) => s.id === id);

    return (
      <div className="iwz-review">
        <div className="iwz-rev-id">
          <span className="iwz-rev-photo" data-empty={!imageSrc} aria-hidden>
            {imageSrc ? <img src={imageSrc} alt="" /> : <Icon name="inventory_2" size={26} />}
          </span>
          <div className="min-w-0">
            <b className="iwz-rev-name">{displayName || "מוצר ללא שם"}</b>
            <span className="iwz-rev-tags">
              {categoryLabel && <em>{categoryLabel}</em>}
              <em>{form.unit}</em>
              {dualUnit && <em>{unitsPerPackage} יח׳ ליחידה</em>}
              {form.barcode.trim() && (
                <em dir="ltr" className="font-mono">
                  {form.barcode.trim()}
                </em>
              )}
            </span>
          </div>
        </div>

        <div className="iwz-facts">
          <ReviewFact
            icon="inventory"
            label="מלאי התחלתי"
            value={formatQtyWithPieces(totalQty, form.unit, unitsPerPackage)}
          />
          <ReviewFact icon="warehouse" label="מחסנים" value={`${stocked.length} מתוך ${warehouses.length}`} />
          <ReviewFact icon="low_priority" label="סף התראה" value={minQtyValue > 0 ? `${minQtyValue}` : "לא הוגדר"} />
        </div>

        <section className="iwz-rev-block">
          <h3>
            <Icon name="warehouse" size={15} />
            פירוט לפי מחסן
            <button type="button" onClick={() => goToStep(stepIndexOf("stock"))}>
              <Icon name="edit" size={13} />
              עריכה
            </button>
          </h3>
          {stocked.length === 0 ? (
            <p className="iwz-rev-none">המוצר ייווצר ללא מלאי התחלתי.</p>
          ) : (
            <ul className="iwz-rev-list">
              {stocked.map((w) => (
                <li key={w.id}>
                  <span>{w.name}</span>
                  <b>{formatQtyWithPieces(drafts[w.id] ?? 0, form.unit, unitsPerPackage)}</b>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canEditSuppliers && (
          <section className="iwz-rev-block">
            <h3>
              <Icon name="local_shipping" size={15} />
              ספקים
              <button type="button" onClick={() => goToStep(stepIndexOf("suppliers"))}>
                <Icon name="edit" size={13} />
                עריכה
              </button>
            </h3>
            {linked.length === 0 ? (
              <p className="iwz-rev-none">לא שויכו ספקים — אפשר להוסיף בהמשך מדף המוצר.</p>
            ) : (
              <ul className="iwz-rev-list">
                {linked.map(({ line, supplier }) => {
                  const price = effectivePrices.get(line.supplierId);
                  return (
                    <li key={line.supplierId}>
                      <span>
                        {supplier!.name}
                        {cheapest?.id === line.supplierId && effectivePrices.size > 1 && (
                          <em className="ipf-sup-best">הזול ביותר</em>
                        )}
                      </span>
                      <b>{price ? `${formatCurrency(price)} / ${form.unit}` : "—"}</b>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {lowStock && totalQty > 0 && (
          <p className="iwz-rev-warn">
            <Icon name="warning" size={15} />
            המלאי ההתחלתי נמצא מתחת לסף ההתראה שהגדרתם ({minQtyValue}).
          </p>
        )}
      </div>
    );
  }

  function renderStep() {
    switch (step.id) {
      case "basics":
        return renderBasics();
      case "unit":
        return renderUnit();
      case "stock":
        return renderStock();
      case "suppliers":
        return renderSuppliers();
      case "review":
        return renderReview();
    }
  }

  return (
    <div className="spf-page iwz-page page-enter" ref={pageRef}>
      {/* ── Ink hero — identity + step rail ── */}
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
                <span className="spf-hero-fact">
                  <Icon name="inventory" size={13} />
                  {formatQtyWithPieces(totalQty, form.unit, unitsPerPackage)}
                </span>
                {lowStock && totalQty > 0 && (
                  <span className="spf-hero-fact ipf-hero-warn">
                    <Icon name="warning" size={13} />
                    מתחת למינימום
                  </span>
                )}
              </p>
            </div>
          </div>

          <nav className="iwz-rail" aria-label="שלבי הוספת מוצר">
            {steps.map((s, i) => {
              const state = i < safeIndex ? "done" : i === safeIndex ? "active" : "todo";
              const reachable = isEdit || i <= maxVisited;
              return (
                <Fragment key={s.id}>
                  {i > 0 && <span className="iwz-rail-gap" data-done={i <= safeIndex} aria-hidden />}
                  <button
                    type="button"
                    className="iwz-rail-step"
                    data-state={state}
                    disabled={!reachable}
                    aria-current={state === "active" ? "step" : undefined}
                    onClick={() => goToStep(i)}
                  >
                    <span className="iwz-rail-dot" aria-hidden>
                      <Icon name={state === "done" ? "check" : s.icon} size={15} />
                    </span>
                    <span className="iwz-rail-label">{s.label}</span>
                  </button>
                </Fragment>
              );
            })}
          </nav>
        </div>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))}
      />

      <div className="iwz-body">
        <form
          className="iwz-stage"
          key={step.id}
          data-dir={dir}
          onSubmit={(e) => {
            e.preventDefault();
            goNext();
          }}
        >
          <div className="iwz-head">
            <span className="iwz-head-eyebrow">
              שלב {safeIndex + 1} מתוך {steps.length}
            </span>
            <h2 className="iwz-head-title">{step.title}</h2>
            <p className="iwz-head-sub">{step.sub}</p>
          </div>

          <section className={`iwz-card${step.id === "unit" ? " iwz-card--unit" : ""}`}>{renderStep()}</section>

          {error && (
            <p className="spf-alert" role="alert">
              <Icon name="error" size={17} />
              {error}
            </p>
          )}

          <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
        </form>
      </div>

      {/* ── Sticky action bar ── */}
      <div className="spf-foot">
        <div className="spf-foot-info iwz-foot-info">
          <b>
            {safeIndex + 1}
            <span className="iwz-foot-of">/{steps.length}</span>
          </b>
          <span>{step.title}</span>
        </div>
        <div className="spf-foot-actions">
          <Button variant="secondary" icon="arrow_forward" onClick={goPrev} className="!py-2.5">
            {isFirst ? "ביטול" : "הקודם"}
          </Button>
          {isEdit && !isLast && (
            <Button variant="secondary" onClick={goNext} className="!py-2.5">
              הבא
            </Button>
          )}
          {isEdit ? (
            <Button loading={saving} onClick={submit} icon="check" className="!py-2.5">
              שמירה
            </Button>
          ) : isLast ? (
            <Button loading={saving} onClick={submit} icon="check" className="!py-2.5">
              הוספת מוצר
            </Button>
          ) : (
            <Button onClick={goNext} icon="arrow_back" className="!py-2.5">
              המשך
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
