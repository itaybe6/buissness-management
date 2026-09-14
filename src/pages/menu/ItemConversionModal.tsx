import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Field, Icon, Input, Select } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useSaveItemConversion } from "@/api/menu";
import { useSaveItemContent } from "@/api/inventory";
import {
  MEASURE_LABELS,
  declaredItemContent,
  formatMoney,
  itemContentPerMainUnit,
  measureFromUnitName,
  menuSaveError,
  pricePerMeasure,
  resolveItemPrice,
} from "@/lib/menuCosting";
import type { SupplierItemPriceIndex } from "@/api/suppliers";
import type { InventoryItem, MenuItemConversion, MenuMeasure } from "@/types/database";

/**
 * "How much is inside one piece?" — bridges purchase units (crate, bottle, sack)
 * to recipe units (grams, ml). The content is saved on the product itself, the
 * same field the product form fills; this modal is the shortcut for products that
 * were created before it became mandatory. Also hosts the manual fallback price.
 */
export function ItemConversionModal({
  open,
  onClose,
  businessId,
  item,
  conversion,
  priceIndex,
  suppliersById,
}: {
  open: boolean;
  onClose: () => void;
  businessId: string;
  item: InventoryItem | null;
  conversion: MenuItemConversion | null | undefined;
  priceIndex: SupplierItemPriceIndex | undefined;
  suppliersById: Map<string, string>;
}) {
  const saveConversion = useSaveItemConversion(businessId);
  const saveContent = useSaveItemContent(businessId);
  const [qty, setQty] = useState("");
  const [measure, setMeasure] = useState<MenuMeasure>("g");
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !item) return;
    // Product's own declaration first; a legacy conversion row as the starting point otherwise.
    const declared = declaredItemContent(item);
    const seed = declared ?? (conversion?.content_qty ? { qty: conversion.content_qty, measure: conversion.content_measure ?? "g" } : null);
    setQty(seed ? String(seed.qty) : "");
    setMeasure(seed?.measure ?? (measureFromUnitName(item.unit)?.measure ?? "g"));
    setManual(conversion?.manual_unit_cost != null ? String(conversion.manual_unit_cost) : "");
    setError(null);
  }, [open, item, conversion]);

  if (!item) return null;

  const builtIn = measureFromUnitName(item.unit);
  const pieces = item.units_per_package && item.units_per_package > 0 ? item.units_per_package : null;
  const pieceName = pieces ? item.piece_unit?.trim() || "פריט" : item.unit?.trim() || "יחידה";
  const price = resolveItemPrice(item, priceIndex, null, conversion);

  const qtyNum = Number(qty);
  const preview = itemContentPerMainUnit(
    { ...item, content_qty: qtyNum > 0 ? qtyNum : null, content_measure: qtyNum > 0 ? measure : null },
    null,
  );
  const measureLine = pricePerMeasure(price.pricePerMain, preview);
  const saving = saveConversion.isPending || saveContent.isPending;

  async function submit() {
    if (!item) return;
    setError(null);
    try {
      if (!builtIn) {
        await saveContent.mutateAsync({
          item_id: item.id,
          content_qty: qtyNum > 0 ? qtyNum : null,
          content_measure: qtyNum > 0 ? measure : null,
        });
      }
      // Content now lives on the product — the conversion row only keeps the manual price.
      await saveConversion.mutateAsync({
        business_id: businessId,
        item_id: item.id,
        content_qty: null,
        content_measure: null,
        manual_unit_cost: Number(manual) > 0 ? Number(manual) : null,
      });
      onClose();
    } catch (e) {
      setError(menuSaveError(e));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={item.name} subtitle="תכולה ומחיר למתכונים" icon="scale" maxWidth={520}>
      <div className="flex flex-col gap-4">
        <div className="mnu-conv-summary">
          <div>
            <span className="mnu-conv-k">יחידת רכש</span>
            <b>{item.unit?.trim() || "יחידה"}</b>
            {pieces && (
              <span className="text-text-3">
                {" "}
                = {pieces} × {item.piece_unit?.trim() || "פריט"}
              </span>
            )}
          </div>
          <div>
            <span className="mnu-conv-k">מחיר ליחידת רכש</span>
            <b>{price.pricePerMain > 0 ? formatMoney(price.pricePerMain) : "—"}</b>
            {price.source === "supplier" && price.supplierId && (
              <span className="text-text-3"> · {suppliersById.get(price.supplierId) ?? "ספק"}</span>
            )}
            {price.source === "manual" && <span className="text-text-3"> · מחיר ידני</span>}
          </div>
        </div>

        {builtIn ? (
          <div className="mnu-note" data-tone="success">
            <Icon name="check_circle" size={17} fill />
            <span>
              היחידה «{item.unit}» היא מידה — המערכת יודעת ש-1 {item.unit} = {builtIn.qty.toLocaleString("he-IL")} {MEASURE_LABELS[builtIn.measure]}. אין צורך בהגדרת תכולה.
            </span>
          </div>
        ) : (
          <>
            <div className="mnu-note">
              <Icon name="info" size={17} fill />
              <span>
                כמה יש בתוך {pieceName} אחד? למשל בקבוק שמן = 750 מ״ל, שק קמח = 25,000 גרם, ביצה = 1 יחידה. נשמר על המוצר עצמו —
                אפשר לערוך גם ב
                <Link to={`/inventory/items/${item.id}/edit`} className="font-bold underline">
                  טופס המוצר
                </Link>
                .
              </span>
            </div>
            <div className="grid grid-cols-[1fr_140px] gap-3">
              <Field label={`תכולת ${pieceName} אחד`}>
                <Input type="number" inputMode="decimal" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="750" />
              </Field>
              <Field label="מידה">
                <Select value={measure} onChange={(e) => setMeasure(e.target.value as MenuMeasure)}>
                  <option value="g">גרם</option>
                  <option value="ml">מ״ל</option>
                  <option value="unit">יחידות</option>
                </Select>
              </Field>
            </div>
          </>
        )}

        <Field label="מחיר ידני ליחידת רכש (₪) — רק אם אין מחירון ספק">
          <Input type="number" inputMode="decimal" min={0} step="0.01" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="0.00" />
        </Field>
        {price.offers.length > 0 && Number(manual) > 0 && (
          <div className="text-[12px] text-text-3">
            למוצר יש מחירון ספק — המחיר הידני ישמש רק כגיבוי אם המחירון יוסר.
          </div>
        )}

        <div className="mnu-conv-preview">
          <span>עלות במתכונים</span>
          <b>{measureLine?.label ?? "—"}</b>
        </div>

        {error && <div className="text-[12.5px] font-semibold text-danger">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            ביטול
          </Button>
          <Button icon="save" loading={saving} onClick={submit}>
            שמירה
          </Button>
        </div>
      </div>
    </Modal>
  );
}
