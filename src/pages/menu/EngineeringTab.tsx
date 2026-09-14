import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState, Icon } from "@/components/ui";
import { QUADRANT_LABELS, formatMoney, formatPct, menuEngineering, type MenuQuadrant } from "@/lib/menuCosting";
import { Monogram } from "./menuShared";
import type { CostedDish, MenuCostingData } from "./useMenuCosting";

const QUADRANT_ORDER: MenuQuadrant[] = ["star", "plowhorse", "puzzle", "dog"];

/**
 * Kasavana–Smith menu engineering: popularity (monthly sales) × profitability
 * (contribution margin per portion). Needs sales numbers on at least two dishes.
 */
export function EngineeringTab({ data }: { data: MenuCostingData }) {
  const navigate = useNavigate();

  const eligible = useMemo(
    () => data.dishes.filter((d) => d.dish.monthly_sales != null && d.dish.monthly_sales > 0 && d.economics.profit != null && d.cost.complete),
    [data.dishes],
  );

  const result = useMemo(
    () => menuEngineering(eligible.map((d) => ({ id: d.dish.id, profit: d.economics.profit ?? 0, sales: d.dish.monthly_sales ?? 0 }))),
    [eligible],
  );

  if (eligible.length < 2) {
    return (
      <EmptyState
        icon="scatter_plot"
        title="הנדסת תפריט צריכה נתוני מכירות"
        description="הזינו «מכירות חודשיות» לפחות בשתי מנות (בעורך המנה) והמערכת תסווג כל מנה לכוכב / סוס עבודה / פאזל / כלב לפי פופולריות ורווחיות."
        embedded
      />
    );
  }

  const maxProfit = Math.max(...eligible.map((d) => d.economics.profit ?? 0), 1);
  const minProfit = Math.min(...eligible.map((d) => d.economics.profit ?? 0), 0);
  const maxShare = Math.max(...eligible.map((d) => (d.dish.monthly_sales ?? 0) / result.totalSales), 0.01);
  const span = Math.max(maxProfit - minProfit, 1);

  const byQuadrant = new Map<MenuQuadrant, CostedDish[]>();
  for (const d of eligible) {
    const q = result.quadrants.get(d.dish.id);
    if (!q) continue;
    const list = byQuadrant.get(q);
    if (list) list.push(d);
    else byQuadrant.set(q, [d]);
  }

  const totalContribution = eligible.reduce((s, d) => s + (d.economics.monthlyContribution ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="mnu-eng-head">
        <div>
          <b>{eligible.length}</b> מנות עם נתוני מכירות · <b>{result.totalSales.toLocaleString("he-IL")}</b> מנות נמכרות בחודש ·{" "}
          תרומה חודשית <b>{formatMoney(totalContribution)}</b>
        </div>
        <div className="text-[12px] text-text-3">
          סף רווחיות: רווח ממוצע משוקלל {formatMoney(result.marginThreshold, { decimals: 2 })} למנה · סף פופולריות: {formatPct(result.popularityThreshold * 100)} מהמכירות
        </div>
      </div>

      <div className="mnu-eng-grid">
        <div className="mnu-scatter" role="img" aria-label="מפת הנדסת תפריט">
          <span className="mnu-scatter-axis mnu-scatter-axis--x">פופולריות (נתח מכירות) ←</span>
          <span className="mnu-scatter-axis mnu-scatter-axis--y">רווח למנה ↑</span>
          <span className="mnu-scatter-quad" data-q="puzzle">פאזל</span>
          <span className="mnu-scatter-quad" data-q="star">כוכב</span>
          <span className="mnu-scatter-quad" data-q="dog">כלב</span>
          <span className="mnu-scatter-quad" data-q="plowhorse">סוס עבודה</span>
          <span
            className="mnu-scatter-line mnu-scatter-line--v"
            style={{ right: `${Math.min(97, (result.popularityThreshold / maxShare) * 100)}%` }}
          />
          <span
            className="mnu-scatter-line mnu-scatter-line--h"
            style={{ bottom: `${Math.min(97, ((result.marginThreshold - minProfit) / span) * 100)}%` }}
          />
          {eligible.map((d) => {
            const share = (d.dish.monthly_sales ?? 0) / result.totalSales;
            const x = Math.min(96, Math.max(3, (share / maxShare) * 92 + 3));
            const y = Math.min(96, Math.max(3, (((d.economics.profit ?? 0) - minProfit) / span) * 92 + 3));
            const q = result.quadrants.get(d.dish.id) ?? "dog";
            return (
              <button
                type="button"
                key={d.dish.id}
                className="mnu-scatter-dot"
                data-q={q}
                style={{ right: `${x}%`, bottom: `${y}%` }}
                title={`${d.dish.name} · ${QUADRANT_LABELS[q].label}`}
                onClick={() => navigate(`/menu/dishes/${d.dish.id}`)}
              >
                <span className="mnu-scatter-dot-name">{d.dish.name}</span>
              </button>
            );
          })}
        </div>

        <div className="mnu-eng-lists">
          {QUADRANT_ORDER.map((q) => {
            const list = byQuadrant.get(q) ?? [];
            const meta = QUADRANT_LABELS[q];
            return (
              <section key={q} className="mnu-eng-quad" data-q={q}>
                <header>
                  <Icon name={meta.icon} size={18} fill />
                  <b>{meta.label}</b>
                  <span>{list.length}</span>
                </header>
                <p>{meta.hint}</p>
                {list.length > 0 && (
                  <ul>
                    {list
                      .sort((a, b) => (b.economics.monthlyContribution ?? 0) - (a.economics.monthlyContribution ?? 0))
                      .map((d) => (
                        <li key={d.dish.id}>
                          <button type="button" onClick={() => navigate(`/menu/dishes/${d.dish.id}`)}>
                            <Monogram name={d.dish.name} url={d.dish.image_url} size={28} />
                            <span className="flex-1 truncate font-bold">{d.dish.name}</span>
                            <span className="text-text-3">{d.dish.monthly_sales?.toLocaleString("he-IL")} / חודש</span>
                            <b className="tabular-nums">{formatMoney(d.economics.profit, { decimals: 2 })}</b>
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
