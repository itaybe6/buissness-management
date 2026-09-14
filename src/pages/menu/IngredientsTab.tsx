import { useMemo, useState } from "react";
import { EmptyState, Icon, Input } from "@/components/ui";
import {
  MEASURE_LABELS,
  formatMoney,
  formatQty,
  itemContentPerMainUnit,
  resolveItemPrice,
} from "@/lib/menuCosting";
import { inventoryItemMatchesQuery } from "@/api/inventory";
import type { InventoryItem } from "@/types/database";
import { ItemConversionModal } from "./ItemConversionModal";
import { Monogram } from "./menuShared";
import type { MenuCostingData } from "./useMenuCosting";

type Row = {
  item: InventoryItem;
  pricePerMain: number;
  priceSource: "supplier" | "manual" | "none";
  supplierName: string | null;
  offers: number;
  content: ReturnType<typeof itemContentPerMainUnit>;
  costPerBase: number | null;
  usedIn: number;
  problem: "no_price" | "needs_conversion" | null;
};

/**
 * Every inventory item through the lens of the recipe: what it costs per gram /
 * ml / unit, where that price comes from, and what still needs fixing.
 */
export function IngredientsTab({ businessId, data }: { businessId: string; data: MenuCostingData }) {
  const [search, setSearch] = useState("");
  const [onlyUsed, setOnlyUsed] = useState(true);
  const [editing, setEditing] = useState<InventoryItem | null>(null);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const item of data.items) {
      const usedIn = data.itemUsage.get(item.id)?.length ?? 0;
      if (onlyUsed && usedIn === 0) continue;
      if (!inventoryItemMatchesQuery(item, search)) continue;
      const conv = data.conversions.get(item.id) ?? null;
      const price = resolveItemPrice(item, data.ctx.priceIndex, null, conv);
      const content = itemContentPerMainUnit(item, conv);
      const costPerBase = price.pricePerMain > 0 && content.qty > 0 ? price.pricePerMain / content.qty : null;
      const problem: Row["problem"] =
        price.source === "none" ? "no_price" : content.source === "count" && usedIn > 0 && needsGramOrMl(item.id, data) ? "needs_conversion" : null;
      out.push({
        item,
        pricePerMain: price.pricePerMain,
        priceSource: price.source,
        supplierName: price.supplierId ? data.suppliersById.get(price.supplierId) ?? null : null,
        offers: price.offers.length,
        content,
        costPerBase,
        usedIn,
        problem,
      });
    }
    out.sort((a, b) => {
      const pa = a.problem ? 0 : 1;
      const pb = b.problem ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (b.usedIn !== a.usedIn) return b.usedIn - a.usedIn;
      return a.item.name.localeCompare(b.item.name, "he");
    });
    return out;
  }, [data, search, onlyUsed]);

  const problems = rows.filter((r) => r.problem).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="mnu-toolbar">
        <div className="mnu-search">
          <Icon name="search" size={18} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש מוצר או ברקוד..." aria-label="חיפוש מוצר" />
        </div>
        <label className="mnu-check">
          <input type="checkbox" checked={onlyUsed} onChange={(e) => setOnlyUsed(e.target.checked)} />
          רק מוצרים שבשימוש בתפריט
        </label>
        {problems > 0 && (
          <span className="mnu-pill" data-tone="warning">
            <Icon name="warning" size={14} fill />
            {problems} מוצרים דורשים טיפול
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="grocery"
          title={onlyUsed ? "עדיין אין מוצרים בתפריט" : "לא נמצאו מוצרים"}
          description={onlyUsed ? "כשתוסיפו מרכיבים למנות הם יופיעו כאן עם העלות ליחידה ומקור המחיר." : "נסו חיפוש אחר."}
          embedded
        />
      ) : (
        <div className="mnu-table-wrap">
          <table className="mnu-table">
            <thead>
              <tr>
                <th>מוצר</th>
                <th>מחיר ליחידת רכש</th>
                <th>תכולה</th>
                <th>עלות למתכון</th>
                <th>בשימוש</th>
                <th aria-label="פעולות" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item.id} data-problem={!!r.problem}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Monogram name={r.item.name} url={r.item.image_url} size={36} icon="inventory_2" />
                      <div className="min-w-0">
                        <div className="truncate font-bold">{r.item.name}</div>
                        <div className="text-[11.5px] text-text-3">
                          {r.item.unit?.trim() || "יחידה"}
                          {r.content.pieces ? ` · ${r.content.pieces} × ${r.item.piece_unit?.trim() || "פריט"}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {r.pricePerMain > 0 ? (
                      <div>
                        <b className="tabular-nums">{formatMoney(r.pricePerMain)}</b>
                        <div className="text-[11.5px] text-text-3">
                          {r.priceSource === "manual" ? "מחיר ידני" : r.supplierName ?? "ספק"}
                          {r.offers > 1 ? ` · הזול מ-${r.offers}` : ""}
                        </div>
                      </div>
                    ) : (
                      <span className="mnu-pill" data-tone="danger" data-compact>
                        <Icon name="money_off" size={13} />
                        אין מחיר
                      </span>
                    )}
                  </td>
                  <td>
                    {r.content.source === "count" ? (
                      <span className="text-text-3">{formatQty(r.content.qty)} יח׳ (ספירה)</span>
                    ) : (
                      <span className="tabular-nums">
                        {formatQty(r.content.qty)} {MEASURE_LABELS[r.content.measure]}
                        {r.content.source === "conversion" && <Icon name="scale" size={13} className="ms-1 text-text-3" />}
                      </span>
                    )}
                  </td>
                  <td>
                    {r.costPerBase == null ? (
                      "—"
                    ) : (
                      <b className="tabular-nums">
                        {r.content.measure === "unit"
                          ? `${formatMoney(r.costPerBase, { decimals: 2 })} / יח׳`
                          : `${formatMoney(r.costPerBase * 100, { decimals: 2 })} / 100 ${MEASURE_LABELS[r.content.measure]}`}
                      </b>
                    )}
                  </td>
                  <td>
                    {r.usedIn > 0 ? (
                      <span title={(data.itemUsage.get(r.item.id) ?? []).map((d) => d.name).join(", ")}>{r.usedIn} מנות</span>
                    ) : (
                      <span className="text-text-3">—</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`mnu-row-btn${r.problem ? " mnu-row-btn--attention" : ""}`}
                      onClick={() => setEditing(r.item)}
                    >
                      <Icon name={r.problem === "no_price" ? "sell" : "scale"} size={16} />
                      {r.problem === "no_price" ? "הגדרת מחיר" : r.problem === "needs_conversion" ? "הגדרת תכולה" : "תכולה"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ItemConversionModal
        open={!!editing}
        onClose={() => setEditing(null)}
        businessId={businessId}
        item={editing}
        conversion={editing ? data.conversions.get(editing.id) : null}
        priceIndex={data.ctx.priceIndex}
        suppliersById={data.suppliersById}
      />
    </div>
  );
}

/** Does any recipe measure this item in grams / ml (so plain counting is not enough)? */
function needsGramOrMl(itemId: string, data: MenuCostingData): boolean {
  for (const list of data.componentsByDish.values()) {
    for (const c of list) {
      if (c.item_id !== itemId) continue;
      if (c.unit === "g" || c.unit === "kg" || c.unit === "ml" || c.unit === "l") return true;
    }
  }
  return false;
}
