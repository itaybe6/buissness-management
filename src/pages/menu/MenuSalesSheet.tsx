import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon, Input } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useMenuSales, useSaveDishSale } from "@/api/menu";
import { formatMoney, menuSaveError } from "@/lib/menuCosting";
import {
  addDays,
  formatDayNum,
  formatLongDay,
  formatMonthLabel,
  formatWeekRange,
  indexSales,
  monthEnd,
  monthStart,
  platesProfit,
  todayIso,
  weekDays,
  weekdayShort,
  weekStartSunday,
} from "@/lib/menuDates";
import { Monogram } from "./menuShared";
import type { CostedDish } from "./useMenuCosting";

export function MenuSalesSheet({
  open,
  onClose,
  businessId,
  dishes,
}: {
  open: boolean;
  onClose: () => void;
  businessId: string;
  dishes: CostedDish[];
}) {
  const [selected, setSelected] = useState(todayIso);
  const [query, setQuery] = useState("");
  const [local, setLocal] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<Map<string, number>>(new Map());
  const save = useSaveDishSale(businessId);

  const sunday = weekStartSunday(selected);
  const days = useMemo(() => weekDays(sunday), [sunday]);
  const monthFrom = monthStart(selected);
  const monthTo = monthEnd(selected);
  const fetchFrom = monthFrom < days[0] ? monthFrom : days[0];
  const fetchTo = monthTo > days[6] ? monthTo : days[6];

  const remote = useMenuSales(businessId, fetchFrom, fetchTo);
  const monthDays = useMemo(() => {
    const out: string[] = [];
    let cur = monthFrom;
    while (cur <= monthTo) {
      out.push(cur);
      cur = addDays(cur, 1);
    }
    return out;
  }, [monthFrom, monthTo]);

  useEffect(() => {
    if (!open) return;
    setSelected(todayIso());
    setQuery("");
    setError(null);
  }, [open]);

  const rangeKey = `${fetchFrom}:${fetchTo}`;
  const hydratedRange = useRef<string | null>(null);
  useEffect(() => {
    if (!remote.data) return;
    if (hydratedRange.current === rangeKey) return;
    const next: Record<string, number> = {};
    for (const row of remote.data) next[`${row.dish_id}|${row.sold_on}`] = row.quantity;
    setLocal(next);
    hydratedRange.current = rangeKey;
  }, [remote.data, rangeKey]);

  useEffect(() => {
    hydratedRange.current = null;
  }, [open]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending.values()) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const sales = useMemo(
    () =>
      indexSales(
        Object.entries(local).map(([k, quantity]) => {
          const cut = k.lastIndexOf("|");
          return { dish_id: k.slice(0, cut), sold_on: k.slice(cut + 1), quantity };
        }),
      ),
    [local],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? dishes.filter((d) => d.dish.name.toLowerCase().includes(q)) : dishes;
    return [...list].sort((a, b) => {
      const aq = sales.qty(a.dish.id, selected);
      const bq = sales.qty(b.dish.id, selected);
      if (aq !== bq) return bq - aq;
      return a.dish.name.localeCompare(b.dish.name, "he");
    });
  }, [dishes, query, sales, selected]);

  function queueSave(dishId: string, quantity: number) {
    const key = `${dishId}|${selected}`;
    const prev = timers.current.get(key);
    if (prev) window.clearTimeout(prev);
    timers.current.set(
      key,
      window.setTimeout(async () => {
        timers.current.delete(key);
        try {
          await save.mutateAsync({ business_id: businessId, dish_id: dishId, sold_on: selected, quantity });
          setError(null);
        } catch (e) {
          setError(menuSaveError(e));
        }
      }, 280),
    );
  }

  function setQty(dishId: string, raw: number) {
    const quantity = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
    setLocal((m) => ({ ...m, [`${dishId}|${selected}`]: quantity }));
    queueSave(dishId, quantity);
  }

  const dayProfit = sumProfit(dishes, (d) => sales.qty(d.dish.id, selected));
  const weekProfit = sumProfit(dishes, (d) => sales.sum(d.dish.id, days));
  const monthProfit = sumProfit(dishes, (d) => sales.sum(d.dish.id, monthDays));
  const dayPlates = sales.dayTotal(selected);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="מכירות"
      subtitle="כמה נמכר מכל מנה — לפי יום, עם רווח לשבוע ולחודש"
      icon="point_of_sale"
      maxWidth={840}
      fullScreenMobile
    >
      <div className="mnu-sales">
        <div className="mnu-sales-nav">
          <button type="button" className="mnu-sales-arrow" onClick={() => setSelected(addDays(sunday, -7))} aria-label="שבוע קודם">
            <Icon name="chevron_right" size={20} />
          </button>
          <div className="mnu-sales-nav-mid">
            <b>{formatWeekRange(sunday)}</b>
            <span>{formatMonthLabel(selected)}</span>
          </div>
          <button type="button" className="mnu-sales-arrow" onClick={() => setSelected(addDays(sunday, 7))} aria-label="שבוע הבא">
            <Icon name="chevron_left" size={20} />
          </button>
        </div>

        <div className="mnu-sales-days" role="tablist" aria-label="ימי השבוע">
          {days.map((iso) => {
            const plates = sales.dayTotal(iso);
            return (
              <button
                key={iso}
                type="button"
                role="tab"
                className="mnu-sales-day"
                data-on={iso === selected}
                data-today={iso === todayIso()}
                onClick={() => setSelected(iso)}
              >
                <em>{weekdayShort(iso)}</em>
                <b>{formatDayNum(iso)}</b>
                <span>{plates > 0 ? plates.toLocaleString("he-IL") : "—"}</span>
              </button>
            );
          })}
        </div>

        <div className="mnu-sales-kpis">
          <Kpi label="היום" value={formatMoney(dayProfit)} hint={`${dayPlates.toLocaleString("he-IL")} מנות · ${formatLongDay(selected)}`} />
          <Kpi label="השבוע" value={formatMoney(weekProfit)} hint={formatWeekRange(sunday)} />
          <Kpi label="החודש" value={formatMoney(monthProfit)} hint={formatMonthLabel(selected)} />
        </div>

        <div className="mnu-sales-search">
          <Icon name="search" size={18} />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש מנה..." aria-label="חיפוש מנה" />
        </div>

        <ul className="mnu-sales-list">
          {visible.map((row) => {
            const dayQty = sales.qty(row.dish.id, selected);
            const weekQty = sales.sum(row.dish.id, days);
            const monthQty = sales.sum(row.dish.id, monthDays);
            const profit = row.economics.profit;
            return (
              <li key={row.dish.id} className="mnu-sales-row" data-sold={dayQty > 0}>
                <Monogram name={row.dish.name} url={row.dish.image_url} size={40} />
                <div className="mnu-sales-id">
                  <b>{row.dish.name}</b>
                  <span>
                    {profit == null ? "אין מחיר / עלות" : `${formatMoney(profit, { decimals: 2 })} למנה`}
                  </span>
                </div>
                <div className="mnu-sales-step" onPointerDown={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => setQty(row.dish.id, dayQty - 1)} aria-label="הפחתה" disabled={dayQty <= 0}>
                    <Icon name="remove" size={16} />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={dayQty || ""}
                    placeholder="0"
                    onChange={(e) => setQty(row.dish.id, Number(e.target.value))}
                    aria-label={`כמות נמכרה מ${row.dish.name}`}
                  />
                  <button type="button" onClick={() => setQty(row.dish.id, dayQty + 1)} aria-label="העלה">
                    <Icon name="add" size={16} />
                  </button>
                </div>
                <div className="mnu-sales-earn">
                  <span>
                    יום <b>{formatMoney(platesProfit(dayQty, profit))}</b>
                  </span>
                  <span>
                    שבוע <b>{formatMoney(platesProfit(weekQty, profit))}</b>
                  </span>
                  <span>
                    חודש <b>{formatMoney(platesProfit(monthQty, profit))}</b>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        {error && (
          <div className="mnu-note" data-tone="danger">
            <Icon name="error" size={17} fill />
            <span>{error}</span>
          </div>
        )}

        <div className="mnu-sales-foot">
          <span>{save.isPending ? "שומר..." : "נשמר אוטומטית"}</span>
          <Button variant="secondary" onClick={onClose}>
            סגירה
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function sumProfit(dishes: CostedDish[], qtyOf: (d: CostedDish) => number): number | null {
  let total = 0;
  let any = false;
  for (const d of dishes) {
    const plates = qtyOf(d);
    if (plates <= 0) continue;
    const p = platesProfit(plates, d.economics.profit);
    if (p == null) continue;
    total += p;
    any = true;
  }
  return any ? Math.round(total * 100) / 100 : 0;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="mnu-sales-kpi">
      <span>{label}</span>
      <b>{value}</b>
      <small>{hint}</small>
    </div>
  );
}
