import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { Button, EmptyState, ErrorState, Field, Icon, Input, PageLoader, Select, Textarea } from "@/components/ui";
import { useBusinessId } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import {
  useCreateSupplier,
  useSaveSupplierItems,
  useSupplierItems,
  useSuppliers,
  useUpdateSupplier,
  supplierSaveError,
} from "@/api/suppliers";
import { useInventory, type ItemWithQty } from "@/api/inventory";
import type { Supplier } from "@/types/database";

type ProductLineDraft = { itemId: string; price: string };

type SupplierForm = {
  name: string;
  phone: string;
  taxId: string;
  notes: string;
  active: boolean;
};

const EMPTY_FORM: SupplierForm = {
  name: "",
  phone: "",
  taxId: "",
  notes: "",
  active: true,
};

function formFromSupplier(s: Supplier): SupplierForm {
  return {
    name: s.name,
    phone: s.phone ?? "",
    taxId: s.tax_id ?? "",
    notes: s.notes ?? "",
    active: s.active,
  };
}

function SupplierProductCatalogEditor({
  inventory,
  lines,
  onChange,
}: {
  inventory: ItemWithQty[];
  lines: ProductLineDraft[];
  onChange: (next: ProductLineDraft[]) => void;
}) {
  const [query, setQuery] = useState("");
  const priceRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const usedIds = useMemo(() => new Set(lines.map((l) => l.itemId)), [lines]);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventory.filter((i) => {
      if (usedIds.has(i.id)) return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q);
    });
  }, [inventory, usedIds, query]);

  function addProduct(itemId: string) {
    if (!itemId || usedIds.has(itemId)) return;
    onChange([...lines, { itemId, price: "" }]);
    window.setTimeout(() => priceRefs.current.get(itemId)?.focus(), 80);
  }

  function updatePrice(itemId: string, price: string) {
    onChange(lines.map((l) => (l.itemId === itemId ? { ...l, price } : l)));
  }

  function removeLine(itemId: string) {
    onChange(lines.filter((l) => l.itemId !== itemId));
    priceRefs.current.delete(itemId);
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[14px] font-extrabold text-text">מוצרים ומחירים מהספק</h2>
            <p className="mt-0.5 text-[12px] text-text-3">
              המחירים נשמרים לספק הזה בלבד — ליחידת המידה הראשית (ארגז, ק״ג וכו׳).
            </p>
          </div>
          {lines.length > 0 && (
            <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-text-2">
              {lines.length} משויכים
            </span>
          )}
        </div>

        {lines.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-border bg-surface-2 px-4 py-6 text-center">
            <Icon name="inventory_2" size={28} className="mx-auto text-text-3" />
            <p className="mt-2 text-[13px] font-bold text-text">עדיין לא נבחרו מוצרים</p>
            <p className="mt-1 text-[12px] text-text-3">בחרו מהרשימה למטה והזינו מחיר לכל מוצר.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {lines.map((line) => {
              const item = inventory.find((i) => i.id === line.itemId);
              return (
                <li key={line.itemId} className="sup-product-line">
                  <div className="sup-product-line-thumb">
                    {item?.image_url ? (
                      <img src={item.image_url} alt="" />
                    ) : (
                      <Icon name="inventory_2" size={22} className="text-text-3" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-extrabold text-text">{item?.name ?? "פריט"}</p>
                    <p className="text-[11px] text-text-3">{item?.unit ?? "יחידה"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[12px] font-bold text-text-2">₪</span>
                    <Input
                      ref={(el) => {
                        if (el) priceRefs.current.set(line.itemId, el);
                        else priceRefs.current.delete(line.itemId);
                      }}
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={line.price}
                      onChange={(e) => updatePrice(line.itemId, e.target.value)}
                      className="!w-[96px] !py-2 text-center tabular-nums"
                      placeholder="מחיר"
                      aria-label={`מחיר ${item?.name ?? ""}`}
                    />
                    <button
                      type="button"
                      className="grid h-9 w-9 place-items-center rounded-[10px] border border-border bg-surface text-text-3 transition hover:border-danger/40 hover:text-danger"
                      onClick={() => removeLine(line.itemId)}
                      aria-label="הסרת מוצר"
                    >
                      <Icon name="close" size={17} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-[14px] border border-border bg-surface p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-extrabold text-text">הוספת מוצרים מהמלאי</h3>
          <span className="text-[11px] font-semibold text-text-3">{available.length} זמינים</span>
        </div>
        <div className="relative mb-3">
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
        </div>
        {inventory.length === 0 ? (
          <EmptyState
            icon="inventory_2"
            title="אין מוצרים במלאי"
            description="הוסיפו פריטים בעמוד הסחורות לפני שיוך לספק."
            action={
              <Link to="/inventory">
                <Button variant="secondary" icon="arrow_forward">
                  לעמוד הסחורות
                </Button>
              </Link>
            }
          />
        ) : available.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text-3">
            {query.trim() ? "לא נמצאו מוצרים בחיפוש." : "כל המוצרים כבר משויכים לספק זה."}
          </p>
        ) : (
          <div className="sup-product-pick-grid max-h-[min(52vh,420px)] overflow-y-auto pr-0.5">
            {available.map((item) => (
              <button
                key={item.id}
                type="button"
                className="sup-product-pick-btn"
                onClick={() => addProduct(item.id)}
              >
                <div className="sup-product-pick-thumb">
                  {item.image_url ? (
                    <img src={item.image_url} alt="" />
                  ) : (
                    <Icon name="inventory_2" size={26} className="text-text-3" />
                  )}
                </div>
                <span className="sup-product-pick-name">{item.name}</span>
                {item.unit && <span className="sup-product-pick-unit">{item.unit}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SupplierFormPage() {
  const { supplierId } = useParams<{ supplierId?: string }>();
  const isEdit = !!supplierId;
  const navigate = useNavigate();
  const location = useLocation();
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const canManage = !!(profile && ["manager", "office_manager"].includes(profile.role));

  const { data: suppliers, isLoading: suppliersLoading } = useSuppliers(businessId, { activeOnly: false });
  const { data: inventory, isLoading: inventoryLoading } = useInventory(businessId);
  const editing = useMemo(
    () => (supplierId ? suppliers?.find((s) => s.id === supplierId) ?? null : null),
    [suppliers, supplierId],
  );

  const { data: existingItems, isLoading: itemsLoading } = useSupplierItems(
    businessId,
    supplierId ?? null,
    isEdit && !!supplierId,
  );

  const create = useCreateSupplier(businessId);
  const update = useUpdateSupplier(businessId);
  const saveItems = useSaveSupplierItems(businessId);

  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM);
  const [productLines, setProductLines] = useState<ProductLineDraft[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(!isEdit);

  useEffect(() => {
    if (!isEdit || !editing) return;
    setForm(formFromSupplier(editing));
    setHydrated(false);
  }, [isEdit, editing?.id]);

  useEffect(() => {
    if (!isEdit || hydrated || !existingItems) return;
    setProductLines(
      existingItems.map((r) => ({
        itemId: r.item_id,
        price: String(r.unit_price),
      })),
    );
    setHydrated(true);
  }, [isEdit, hydrated, existingItems]);

  const inventoryList = inventory ?? [];
  const loading = !businessId || suppliersLoading || inventoryLoading || (isEdit && (itemsLoading || !hydrated));

  function goBack() {
    if (location.key !== "default") navigate(-1);
    else navigate("/suppliers");
  }

  function parseProductLines(): { item_id: string; unit_price: number }[] {
    const out: { item_id: string; unit_price: number }[] = [];
    for (const line of productLines) {
      if (!line.itemId) continue;
      const price = parseFloat(line.price.replace(/,/g, ""));
      if (!Number.isFinite(price) || price < 0) continue;
      out.push({ item_id: line.itemId, unit_price: price });
    }
    return out;
  }

  async function submitForm() {
    setFormError(null);
    if (!form.name.trim()) return setFormError("נא להזין שם ספק");
    for (const line of productLines) {
      if (!line.itemId) continue;
      const price = parseFloat(line.price.replace(/,/g, ""));
      if (line.price.trim() === "" || !Number.isFinite(price) || price <= 0) {
        return setFormError("לכל מוצר משויך יש להזין מחיר תקין");
      }
    }
    const itemLines = parseProductLines();
    try {
      let id = editing?.id;
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          name: form.name,
          phone: form.phone,
          tax_id: form.taxId,
          notes: form.notes,
          active: form.active,
        });
      } else {
        const created = await create.mutateAsync({
          business_id: businessId!,
          name: form.name,
          phone: form.phone,
          tax_id: form.taxId,
          notes: form.notes,
        });
        id = created.id;
      }
      if (id) {
        await saveItems.mutateAsync({
          business_id: businessId!,
          supplier_id: id,
          lines: itemLines,
        });
      }
      navigate("/suppliers", { replace: true });
    } catch (e) {
      setFormError(supplierSaveError(e));
    }
  }

  if (!canManage) return <Navigate to="/inventory" replace />;
  if (!businessId) {
    return (
      <EmptyState icon="store" title="לא משויך לעסק" description="פנו למנהל המערכת לשיוך לעסק." />
    );
  }
  if (isEdit && !suppliersLoading && supplierId && !editing) {
    return (
      <ErrorState
        message="הספק לא נמצא."
        onRetry={() => navigate("/suppliers")}
      />
    );
  }
  if (loading) return <PageLoader label={isEdit ? "טוען ספק..." : "טוען..."} />;

  return (
    <div className="supplier-form-page page-enter w-full max-w-2xl pb-8">
      <header className="mb-5 flex items-center gap-3">
        <button type="button" className="icon-btn shrink-0" onClick={goBack} aria-label="חזרה לספקים">
          <Icon name="arrow_forward" size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-extrabold leading-tight tracking-tight md:text-[23px]">
            {isEdit ? "עריכת ספק" : "ספק חדש"}
          </h1>
          <p className="mt-0.5 text-[12px] text-text-3 md:text-[13px]">
            {isEdit ? editing?.name : "פרטי הספק ומחירי המוצרים שאותו הוא מספק"}
          </p>
        </div>
      </header>

      <div className="space-y-6">
        <section className="rounded-[16px] border border-border bg-surface p-4 sm:p-5">
          <h2 className="mb-4 text-[14px] font-extrabold text-text">פרטים כלליים</h2>
          {formError && (
            <p className="mb-4 rounded-[11px] [background:var(--danger-bg)] px-3 py-2 text-[13px] font-semibold text-danger">
              {formError}
            </p>
          )}
          <div className="space-y-4">
            <Field label="שם הספק">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus={!isEdit} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="טלפון">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
              </Field>
              <Field label="ח.פ / מספר עוסק">
                <Input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
              </Field>
            </div>
            <Field label="הערות">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            {isEdit && (
              <Field label="סטטוס">
                <Select
                  value={form.active ? "active" : "inactive"}
                  onChange={(e) => setForm({ ...form, active: e.target.value === "active" })}
                >
                  <option value="active">פעיל</option>
                  <option value="inactive">לא פעיל</option>
                </Select>
              </Field>
            )}
          </div>
        </section>

        <section className="rounded-[16px] border border-border bg-surface p-4 sm:p-5">
          <SupplierProductCatalogEditor
            inventory={inventoryList}
            lines={productLines}
            onChange={setProductLines}
          />
        </section>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={goBack}>
            ביטול
          </Button>
          <Button
            loading={create.isPending || update.isPending || saveItems.isPending}
            onClick={submitForm}
            className="!bg-ink"
            icon="save"
          >
            שמירה
          </Button>
        </div>
      </div>
    </div>
  );
}
