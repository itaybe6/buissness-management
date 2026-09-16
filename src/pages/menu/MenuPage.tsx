import { useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button, EmptyState, ErrorState, Icon, Input, PageHeader, PageLoader, Select } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { canManageMenu } from "@/lib/constants";
import { useDeleteDish, useDuplicateDish, useMenuSales } from "@/api/menu";
import {
  economicsAtPrice,
  formatMoney,
  formatPct,
  marginStatus,
  menuSaveError,
  summarizeMenu,
  type MarginStatus,
} from "@/lib/menuCosting";
import { datesInRange, formatMonthLabel, indexSales, monthEnd, monthStart, platesProfit, todayIso } from "@/lib/menuDates";
import { EngineeringTab } from "./EngineeringTab";
import { IngredientsTab } from "./IngredientsTab";
import { MenuSalesSheet } from "./MenuSalesSheet";
import { MenuSettingsModal } from "./MenuSettingsModal";
import { FoodCostRing, Monogram, SplitBar, StatusPill, statusTone } from "./menuShared";
import { useMenuCosting, type CostedDish, type MenuCostingData } from "./useMenuCosting";

type Tab = "dishes" | "ingredients" | "engineering";
type Filter = "all" | MarginStatus | "incomplete";
type Sort = "name" | "food_cost_desc" | "profit_desc" | "price_desc" | "cost_desc" | "contribution_desc";
type View = "grid" | "list";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "dishes", label: "מנות", icon: "restaurant" },
  { id: "ingredients", label: "מרכיבים", icon: "grocery" },
  { id: "engineering", label: "הנדסת תפריט", icon: "scatter_plot" },
];

const SORT_LABELS: Record<Sort, string> = {
  name: "לפי שם",
  food_cost_desc: "Food Cost — מהגבוה",
  profit_desc: "רווח למנה — מהגבוה",
  price_desc: "מחיר — מהגבוה",
  cost_desc: "עלות — מהגבוה",
  contribution_desc: "רווח החודש — מהגבוה",
};

const SORTERS: Record<Sort, (a: CostedDish, b: CostedDish) => number> = {
  name: (a, b) => a.dish.name.localeCompare(b.dish.name, "he"),
  food_cost_desc: (a, b) => (b.economics.foodCostPct ?? -1) - (a.economics.foodCostPct ?? -1),
  profit_desc: (a, b) => (b.economics.profit ?? -Infinity) - (a.economics.profit ?? -Infinity),
  price_desc: (a, b) => (b.dish.selling_price ?? -1) - (a.dish.selling_price ?? -1),
  cost_desc: (a, b) => b.economics.portionCost - a.economics.portionCost,
  contribution_desc: (a, b) => (b.economics.monthlyContribution ?? -Infinity) - (a.economics.monthlyContribution ?? -Infinity),
};

const VIEW_KEY = "menu:view";

export function MenuPage() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab | null) ?? "dishes";

  const { data, isLoading, error, refetch } = useMenuCosting(businessId);
  const del = useDeleteDish(businessId);
  const duplicate = useDuplicateDish(businessId);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [view, setView] = useState<View>(() => (typeof localStorage !== "undefined" && localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [toDelete, setToDelete] = useState<CostedDish | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const monthIso = todayIso();
  const monthFrom = monthStart(monthIso);
  const monthTo = monthEnd(monthIso);
  const monthDays = useMemo(() => datesInRange(monthFrom, monthTo), [monthFrom, monthTo]);
  const monthSales = useMenuSales(businessId, monthFrom, monthTo);
  const salesIdx = useMemo(() => indexSales(monthSales.data ?? []), [monthSales.data]);
  const monthQty = useMemo(() => (dishId: string) => salesIdx.sum(dishId, monthDays), [salesIdx, monthDays]);

  const summary = useMemo(
    () =>
      data
        ? summarizeMenu(data.dishes.map((d) => ({ economics: d.economics, cost: d.cost, sales: monthQty(d.dish.id) || null })))
        : null,
    [data, monthQty],
  );

  const insights = useMemo(() => (data ? buildInsights(data, monthQty) : null), [data, monthQty]);

  const visibleDishes = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const rows = data.dishes.filter((d) => {
      if (q && !d.dish.name.toLowerCase().includes(q) && !(d.dish.description ?? "").toLowerCase().includes(q)) return false;
      if (filter === "incomplete") return !d.cost.complete;
      if (filter !== "all" && d.economics.status !== filter) return false;
      return true;
    });
    const sorted = [...rows];
    if (sort === "contribution_desc") {
      sorted.sort((a, b) => (platesProfit(monthQty(b.dish.id), b.economics.profit) ?? -Infinity) - (platesProfit(monthQty(a.dish.id), a.economics.profit) ?? -Infinity));
    } else {
      sorted.sort(SORTERS[sort]);
    }
    return sorted;
  }, [data, search, filter, sort, monthQty]);

  if (!canManageMenu(profile?.role)) return <Navigate to="/inventory" replace />;
  if (!businessId) return <EmptyState icon="store" title="לא משויך לעסק" description="פנו למנהל המערכת לשיוך לעסק." />;
  if (isLoading || !data || !summary || !insights) {
    if (error) return <ErrorState message={menuSaveError(error)} onRetry={refetch} />;
    return <PageLoader label="מתמחר את התפריט..." />;
  }

  function setTab(next: Tab) {
    const p = new URLSearchParams(params);
    if (next === "dishes") p.delete("tab");
    else p.set("tab", next);
    setParams(p, { replace: true });
  }

  function toggleFilter(next: Filter) {
    setFilter((f) => (f === next ? "all" : next));
  }

  function changeView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* private mode */
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setActionError(null);
    try {
      await del.mutateAsync(toDelete.dish.id);
      setToDelete(null);
    } catch (e) {
      setActionError(menuSaveError(e));
    }
  }

  async function onDuplicate(d: CostedDish) {
    setActionError(null);
    try {
      const id = await duplicate.mutateAsync({
        business_id: businessId!,
        source: d.dish,
        components: data!.componentsByDish.get(d.dish.id) ?? [],
      });
      navigate(`/menu/dishes/${id}`);
    } catch (e) {
      setActionError(menuSaveError(e));
    }
  }

  const s = data.settings;
  const headlinePct = summary.weightedFoodCostPct ?? summary.avgFoodCostPct;
  const headlineStatus = marginStatus(headlinePct, s.target_food_cost_pct);
  const attention = summary.unpriced + summary.incomplete;
  const hasDishes = data.dishes.length > 0;

  return (
    <div className="mnu-page page-enter">
      <PageHeader
        title="תפריט ותמחור"
        subtitle="כל מנה — המרכיבים, העלות החיה מהספקים, מחיר המכירה ואחוז הרווח"
        actions={
          <>
            <Button variant="ghost" icon="point_of_sale" onClick={() => setSalesOpen(true)}>
              מכירות
            </Button>
            <Button variant="ghost" icon="tune" onClick={() => setSettingsOpen(true)}>
              הגדרות
            </Button>
            <Link to="/menu/dishes/new">
              <Button icon="add">מנה חדשה</Button>
            </Link>
          </>
        }
      />

      {!hasDishes ? (
        <Onboarding />
      ) : (
        <>
          {/* ───────── Hero ───────── */}
          <section className="mnu-hero" data-tone={statusTone(headlineStatus)} aria-label="מצב התפריט">
            <div className="mnu-hero-main">
              <FoodCostRing pct={headlinePct} target={s.target_food_cost_pct} status={headlineStatus} size={132} stroke={11} label={<HeroRingLabel pct={headlinePct} />} />
              <div className="min-w-0">
                <div className="mnu-hero-eyebrow">Food Cost של התפריט</div>
                <div className="mnu-hero-big">{formatPct(headlinePct, 1)}</div>
                <div className="mnu-hero-sub">
                  יעד {formatPct(s.target_food_cost_pct, 0)}
                  {summary.weightedFoodCostPct != null && summary.avgFoodCostPct != null && summary.weightedFoodCostPct !== summary.avgFoodCostPct && (
                    <>
                      {" "}
                      · משוקלל מכירות · ממוצע פשוט {formatPct(summary.avgFoodCostPct, 1)}
                    </>
                  )}
                </div>
                <div className="mt-2">
                  <StatusPill status={headlineStatus} />
                </div>
              </div>
            </div>

            <div className="mnu-hero-stats">
              <HeroStat label="מנות בתפריט" value={summary.dishCount} hint={`${summary.pricedCount} עם מחיר`} active={filter === "all"} onClick={() => setFilter("all")} />
              <HeroStat
                label="רווח גולמי ממוצע"
                value={formatPct(summary.avgMarginPct, 1)}
                hint={
                  summary.totalMonthlyContribution != null
                    ? `רווח ${formatMonthLabel(monthIso)} ${formatMoney(summary.totalMonthlyContribution)}`
                    : "אחרי מע״מ וחומרים"
                }
              />
              <HeroStat
                label="ביעד"
                value={summary.onTarget}
                hint={summary.nearTarget > 0 ? `${summary.nearTarget} קרובות ליעד` : "לחיצה לסינון"}
                tone={summary.onTarget > 0 ? "success" : "neutral"}
                active={filter === "good"}
                onClick={() => toggleFilter("good")}
              />
              <HeroStat
                label="מעל היעד"
                value={summary.overTarget}
                hint="לחיצה לסינון"
                tone={summary.overTarget > 0 ? "danger" : "success"}
                active={filter === "over"}
                onClick={() => toggleFilter("over")}
              />
              <HeroStat
                label="דורש טיפול"
                value={attention}
                hint={summary.incomplete > 0 ? `${summary.incomplete} עם מרכיבים ללא מחיר` : summary.unpriced > 0 ? `${summary.unpriced} בלי מחיר מכירה` : "הכל מתומחר"}
                tone={attention > 0 ? "warning" : "success"}
                active={filter === "unknown" || filter === "incomplete"}
                onClick={() => toggleFilter(summary.incomplete > 0 ? "incomplete" : "unknown")}
              />
            </div>
          </section>

          {/* ───────── Insights ───────── */}
          {(insights.opportunity || insights.topProfit || insights.heaviestItem) && (
            <section className="mnu-insights" aria-label="תובנות">
              {insights.opportunity && (
                <InsightCard
                  icon="trending_up"
                  tone="danger"
                  eyebrow="ההזדמנות הגדולה ביותר"
                  title={insights.opportunity.row.dish.name}
                  onClick={() => navigate(`/menu/dishes/${insights.opportunity!.row.dish.id}`)}
                >
                  Food Cost {formatPct(insights.opportunity.row.economics.foodCostPct, 0)} — העלאה ל-<b>{formatMoney(insights.opportunity.row.economics.suggestedPrice)}</b> מחזירה ליעד
                  {insights.opportunity.monthlyGain != null && (
                    <>
                      {" "}
                      ומוסיפה <b>{formatMoney(insights.opportunity.monthlyGain)}</b> בחודש
                    </>
                  )}
                </InsightCard>
              )}
              {insights.topProfit && (
                <InsightCard
                  icon="workspace_premium"
                  tone="success"
                  eyebrow="המנה הרווחית ביותר"
                  title={insights.topProfit.dish.name}
                  onClick={() => navigate(`/menu/dishes/${insights.topProfit!.dish.id}`)}
                >
                  <b>{formatMoney(insights.topProfit.economics.profit, { decimals: 2 })}</b> רווח גולמי למנה · מרווח {formatPct(insights.topProfit.economics.marginPct, 0)}
                  {platesProfit(monthQty(insights.topProfit.dish.id), insights.topProfit.economics.profit) ? (
                    <> · {formatMoney(platesProfit(monthQty(insights.topProfit.dish.id), insights.topProfit.economics.profit))} החודש</>
                  ) : null}
                </InsightCard>
              )}
              {insights.heaviestItem && (
                <InsightCard
                  icon="local_fire_department"
                  tone="neutral"
                  eyebrow="המרכיב שמזיז את התפריט"
                  title={insights.heaviestItem.name}
                  onClick={() => setTab("ingredients")}
                >
                  <b>{formatPct(insights.heaviestItem.share * 100, 0)}</b> מסך עלות החומרים · ב-{insights.heaviestItem.dishCount} מנות
                  {insights.heaviestItem.supplier ? <> · {insights.heaviestItem.supplier}</> : null}
                </InsightCard>
              )}
            </section>
          )}

          {/* ───────── Tabs ───────── */}
          <nav className="mnu-tabs" aria-label="תצוגות">
            {TABS.map((t) => (
              <button key={t.id} type="button" className="mnu-tab" data-active={tab === t.id} onClick={() => setTab(t.id)}>
                <Icon name={t.icon} size={18} fill={tab === t.id} />
                {t.label}
              </button>
            ))}
          </nav>

          {actionError && (
            <div className="mnu-note" data-tone="danger">
              <Icon name="error" size={17} fill />
              <span>{actionError}</span>
            </div>
          )}

          {tab === "ingredients" && <IngredientsTab businessId={businessId} data={data} />}
          {tab === "engineering" && (
            <EngineeringTab data={data} monthQty={monthQty} monthLabel={formatMonthLabel(monthIso)} onOpenSales={() => setSalesOpen(true)} />
          )}

          {tab === "dishes" && (
            <>
              <div className="mnu-toolbar">
                <div className="mnu-search">
                  <Icon name="search" size={18} />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש מנה..." aria-label="חיפוש" />
                </div>
                <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="mnu-sort" aria-label="סידור">
                  {(Object.keys(SORT_LABELS) as Sort[]).map((k) => (
                    <option key={k} value={k}>
                      {SORT_LABELS[k]}
                    </option>
                  ))}
                </Select>
                <div className="mnu-view" role="radiogroup" aria-label="תצוגה">
                  <button type="button" role="radio" aria-checked={view === "grid"} data-active={view === "grid"} onClick={() => changeView("grid")} title="כרטיסים">
                    <Icon name="grid_view" size={18} fill={view === "grid"} />
                  </button>
                  <button type="button" role="radio" aria-checked={view === "list"} data-active={view === "list"} onClick={() => changeView("list")} title="טבלה">
                    <Icon name="view_list" size={18} fill={view === "list"} />
                  </button>
                </div>
                {filter !== "all" && (
                  <button type="button" className="mnu-chip" data-active onClick={() => setFilter("all")}>
                    <Icon name="close" size={14} />
                    ניקוי סינון
                  </button>
                )}
              </div>

              {visibleDishes.length === 0 ? (
                <EmptyState icon="search_off" title="לא נמצאו מנות" description="נסו חיפוש או סינון אחר." embedded />
              ) : view === "list" ? (
                <DishTable rows={visibleDishes} sort={sort} onSort={setSort} monthQty={monthQty} onOpen={(d) => navigate(`/menu/dishes/${d.dish.id}`)} onDuplicate={onDuplicate} onDelete={setToDelete} />
              ) : (
                <div className="mnu-grid">
                  {visibleDishes.map((d, i) => (
                    <DishCard key={d.dish.id} row={d} index={i} onOpen={() => navigate(`/menu/dishes/${d.dish.id}`)} onDuplicate={() => onDuplicate(d)} onDelete={() => setToDelete(d)} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      <MenuSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} businessId={businessId} settings={data.settings} />
      <MenuSalesSheet open={salesOpen} onClose={() => setSalesOpen(false)} businessId={businessId} dishes={data.dishes} />

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="מחיקת מנה" icon="delete" maxWidth={420}>
        <p className="text-[14px] leading-relaxed text-text-2">למחוק את «{toDelete?.dish.name}»? עץ המרכיבים שלה יימחק. המוצרים במלאי לא מושפעים.</p>
        {actionError && <div className="mt-2 text-[12.5px] font-semibold text-danger">{actionError}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setToDelete(null)}>
            ביטול
          </Button>
          <Button variant="danger" loading={del.isPending} onClick={confirmDelete}>
            מחיקה
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Insights                                                            */
/* ------------------------------------------------------------------ */

interface Insights {
  opportunity: { row: CostedDish; monthlyGain: number | null } | null;
  topProfit: CostedDish | null;
  heaviestItem: { name: string; share: number; dishCount: number; supplier: string | null } | null;
}

function buildInsights(data: MenuCostingData, monthQty: (dishId: string) => number): Insights {
  let opportunity: Insights["opportunity"] = null;
  let oppScore = -Infinity;
  let topProfit: CostedDish | null = null;

  for (const row of data.dishes) {
    const e = row.economics;
    if (e.profit != null && (topProfit == null || e.profit > (topProfit.economics.profit ?? -Infinity))) topProfit = row;

    if (e.status === "over" && e.suggestedPrice != null && e.sellingPrice != null && e.profit != null) {
      const at = economicsAtPrice(row.dish, row.cost, data.settings, e.suggestedPrice);
      const gainPerPlate = (at.profit ?? 0) - e.profit;
      const sold = monthQty(row.dish.id);
      const monthlyGain = sold > 0 ? Math.round(gainPerPlate * sold) : null;
      // Sales-backed opportunities outrank pure percentage gaps.
      const score = monthlyGain != null ? 1_000_000 + monthlyGain : e.deltaToTargetPct ?? 0;
      if (score > oppScore) {
        oppScore = score;
        opportunity = { row, monthlyGain };
      }
    }
  }

  // Which single ingredient carries the most cost across the whole menu.
  const byItem = new Map<string, { cost: number; dishes: Set<string>; supplier: string | null }>();
  let totalCost = 0;
  for (const row of data.dishes) {
    for (const l of row.cost.lines) {
      if (!l.component.item_id || l.cost <= 0) continue;
      totalCost += l.cost;
      const cur = byItem.get(l.component.item_id) ?? { cost: 0, dishes: new Set<string>(), supplier: null };
      cur.cost += l.cost;
      cur.dishes.add(row.dish.id);
      if (!cur.supplier && l.supplierId) cur.supplier = data.suppliersById.get(l.supplierId) ?? null;
      byItem.set(l.component.item_id, cur);
    }
  }
  let heaviestItem: Insights["heaviestItem"] = null;
  if (totalCost > 0) {
    let best: [string, { cost: number; dishes: Set<string>; supplier: string | null }] | null = null;
    for (const entry of byItem) if (!best || entry[1].cost > best[1].cost) best = entry;
    if (best) {
      const item = data.itemsById.get(best[0]);
      heaviestItem = { name: item?.name ?? "מוצר", share: best[1].cost / totalCost, dishCount: best[1].dishes.size, supplier: best[1].supplier };
    }
  }

  return { opportunity, topProfit: topProfit && topProfit.economics.profit != null && topProfit.economics.profit > 0 ? topProfit : null, heaviestItem };
}

/* ------------------------------------------------------------------ */
/* Hero bits                                                           */
/* ------------------------------------------------------------------ */

function HeroRingLabel({ pct }: { pct: number | null }) {
  return (
    <span className="mnu-hero-ring-label">
      <b>{pct == null ? "—" : Math.round(pct)}</b>
      <small>%</small>
    </span>
  );
}

function HeroStat({
  label,
  value,
  hint,
  tone = "neutral",
  active,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "success" | "warning" | "danger" | "neutral";
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="mnu-hstat-label">{label}</span>
      <span className="mnu-hstat-value">{value}</span>
      {hint && <span className="mnu-hstat-hint">{hint}</span>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="mnu-hstat" data-tone={tone} data-active={!!active} onClick={onClick}>
        {body}
      </button>
    );
  }
  return (
    <div className="mnu-hstat" data-tone={tone}>
      {body}
    </div>
  );
}

function InsightCard({
  icon,
  tone,
  eyebrow,
  title,
  children,
  onClick,
}: {
  icon: string;
  tone: "success" | "danger" | "neutral";
  eyebrow: string;
  title: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className="mnu-insight" data-tone={tone} onClick={onClick}>
      <span className="mnu-insight-icon">
        <Icon name={icon} size={20} fill />
      </span>
      <span className="min-w-0 flex-1">
        <span className="mnu-insight-eyebrow">{eyebrow}</span>
        <span className="mnu-insight-title">{title}</span>
        <span className="mnu-insight-body">{children}</span>
      </span>
      <Icon name="chevron_left" size={18} className="mnu-insight-chev" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Onboarding (empty menu)                                             */
/* ------------------------------------------------------------------ */

function Onboarding() {
  const steps = [
    { icon: "restaurant", title: "בוחרים מנה", body: "שם ותמונה — כמו שהיא מופיעה בתפריט." },
    { icon: "account_tree", title: "בונים את עץ המנה", body: "מוסיפים מרכיבים מהמלאי עם כמות ויחידה. המחיר מגיע חי ממחירוני הספקים." },
    { icon: "insights", title: "מקבלים את המספרים", body: "עלות מנה, מחיר מכירה, רווח גולמי, Food Cost ומחיר מוצע — בזמן אמת." },
  ];
  return (
    <section className="mnu-onboard">
      <div className="mnu-onboard-head">
        <span className="mnu-onboard-kicker">
          <Icon name="restaurant_menu" size={16} fill /> תפריט ותמחור
        </span>
        <h2>כמה באמת עולה לכם כל מנה?</h2>
        <p>בונים את המנה הראשונה, והמערכת מחשבת עלות, רווח ואחוז Food Cost מהמחירונים של הספקים — ומראה כמה המנה צריכה לעלות כדי לעמוד ביעד.</p>
        <Link to="/menu/dishes/new">
          <Button icon="add">בואו נבנה את המנה הראשונה</Button>
        </Link>
      </div>
      <ol className="mnu-onboard-steps">
        {steps.map((st, i) => (
          <li key={st.title} className="mnu-onboard-step" style={{ animationDelay: `${i * 70}ms` }}>
            <span className="mnu-onboard-num">{i + 1}</span>
            <Icon name={st.icon} size={24} />
            <b>{st.title}</b>
            <span>{st.body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Dish card                                                           */
/* ------------------------------------------------------------------ */

function DishCard({
  row,
  index,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  row: CostedDish;
  index: number;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { dish, cost, economics: e } = row;
  const topLine = [...cost.lines].sort((a, b) => b.share - a.share)[0];

  return (
    <article
      className="mnu-dish"
      data-tone={e.status}
      style={{ animationDelay: `${Math.min(index, 14) * 35}ms` }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => {
        if (ev.target !== ev.currentTarget) return;
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="mnu-dish-media">
        {dish.image_url ? (
          <img src={dish.image_url} alt="" loading="lazy" />
        ) : (
          <span className="mnu-dish-blank" aria-hidden>
            <b>{dish.name.trim()[0] ?? "·"}</b>
          </span>
        )}
        <span className="mnu-dish-price" data-empty={e.sellingPrice == null}>
          {e.sellingPrice == null ? "ללא מחיר" : formatMoney(e.sellingPrice)}
        </span>
        <span className="mnu-dish-ring">
          <FoodCostRing pct={e.foodCostPct} target={e.targetPct} status={e.status} size={54} stroke={5} />
        </span>
        <span className="mnu-dish-actions">
          <button
            type="button"
            className="mnu-act"
            onClick={(ev) => {
              ev.stopPropagation();
              onDuplicate();
            }}
            aria-label={`שכפול ${dish.name}`}
            title="שכפול"
          >
            <Icon name="content_copy" size={15} />
          </button>
          <button
            type="button"
            className="mnu-act mnu-act--danger"
            onClick={(ev) => {
              ev.stopPropagation();
              onDelete();
            }}
            aria-label={`מחיקת ${dish.name}`}
            title="מחיקה"
          >
            <Icon name="delete" size={15} />
          </button>
        </span>
      </div>

      <div className="mnu-dish-body">
        <div className="mnu-dish-head">
          <h3 className="mnu-dish-name">{dish.name}</h3>
          <StatusPill status={e.status} compact />
        </div>
        <div className="mnu-dish-meta">
          <span>{cost.lines.length} מרכיבים</span>
          {!cost.complete && (
            <>
              <span className="mnu-dish-sep" />
              <span className="text-warning">
                <Icon name="warning" size={13} fill /> {cost.uncostedLines} ללא מחיר
              </span>
            </>
          )}
        </div>

        {e.sellingNet != null && e.sellingNet > 0 ? (
          <SplitBar cost={e.portionCostNet} net={e.sellingNet} target={e.targetPct} status={e.status} compact />
        ) : (
          <div className="mnu-split mnu-split--empty" />
        )}

        <div className="mnu-dish-nums">
          <div>
            <span>עלות</span>
            <b>{formatMoney(e.portionCost, { decimals: 2 })}</b>
          </div>
          <div>
            <span>רווח</span>
            <b data-negative={e.profit != null && e.profit < 0}>{e.profit == null ? "—" : formatMoney(e.profit, { decimals: 2 })}</b>
          </div>
          <div>
            <span>מרווח</span>
            <b>{formatPct(e.marginPct, 0)}</b>
          </div>
        </div>

        <div className="mnu-dish-foot">
          {topLine && topLine.share > 0 && (
            <span className="mnu-dish-tag" title="המרכיב היקר ביותר">
              <Icon name="local_fire_department" size={13} fill />
              {topLine.name} · {formatPct(topLine.share * 100, 0)}
            </span>
          )}
          {e.status === "over" && e.suggestedPrice != null && (
            <span className="mnu-dish-tag mnu-dish-tag--suggest" title="מחיר שיביא ליעד">
              <Icon name="arrow_upward" size={13} />
              מוצע {formatMoney(e.suggestedPrice)}
            </span>
          )}
          {e.status === "unknown" && e.suggestedPrice != null && e.portionCost > 0 && (
            <span className="mnu-dish-tag" title="מחיר שיעמוד ביעד">
              <Icon name="lightbulb" size={13} fill />
              מחיר מוצע {formatMoney(e.suggestedPrice)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Dish table (list view)                                              */
/* ------------------------------------------------------------------ */

function DishTable({
  rows,
  sort,
  onSort,
  monthQty,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  rows: CostedDish[];
  sort: Sort;
  onSort: (s: Sort) => void;
  monthQty: (dishId: string) => number;
  onOpen: (d: CostedDish) => void;
  onDuplicate: (d: CostedDish) => void;
  onDelete: (d: CostedDish) => void;
}) {
  const th = (label: string, key: Sort | null, align: "start" | "end" = "start") => (
    <th style={{ textAlign: align }}>
      {key ? (
        <button type="button" className="mnu-th" data-active={sort === key} onClick={() => onSort(key)}>
          {label}
          <Icon name={sort === key ? "arrow_downward" : "unfold_more"} size={14} />
        </button>
      ) : (
        label
      )}
    </th>
  );

  return (
    <div className="mnu-table-wrap">
      <table className="mnu-table mnu-table--dishes">
        <thead>
          <tr>
            {th("מנה", "name")}
            {th("מחיר", "price_desc", "end")}
            {th("עלות", "cost_desc", "end")}
            {th("רווח", "profit_desc", "end")}
            {th("Food Cost", "food_cost_desc", "end")}
            {th("רווח החודש", "contribution_desc", "end")}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const { dish, cost, economics: e } = r;
            return (
              <tr key={dish.id} className="mnu-tr" data-problem={!cost.complete} onClick={() => onOpen(r)}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <Monogram name={dish.name} url={dish.image_url} size={36} />
                    <div className="min-w-0">
                      <div className="truncate font-extrabold">{dish.name}</div>
                      <div className="text-[11.5px] text-text-3">
                        {cost.lines.length} מרכיבים
                        {!cost.complete && <span className="text-warning"> · {cost.uncostedLines} ללא מחיר</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="text-end font-extrabold tabular-nums">{e.sellingPrice == null ? <span className="text-text-3">—</span> : formatMoney(e.sellingPrice)}</td>
                <td className="text-end tabular-nums">{formatMoney(e.portionCost, { decimals: 2 })}</td>
                <td className="text-end font-bold tabular-nums" data-negative={e.profit != null && e.profit < 0}>
                  {e.profit == null ? "—" : formatMoney(e.profit, { decimals: 2 })}
                </td>
                <td className="text-end">
                  <span className="mnu-td-fc">
                    <FoodCostRing pct={e.foodCostPct} target={e.targetPct} status={e.status} size={30} stroke={4} label={<span />} />
                    <b data-tone={statusTone(e.status)}>{formatPct(e.foodCostPct, 0)}</b>
                    <StatusPill status={e.status} compact />
                  </span>
                </td>
                <td className="text-end tabular-nums text-text-2">{formatMoney(platesProfit(monthQty(dish.id), e.profit))}</td>
                <td className="text-end">
                  <span className="mnu-card-actions">
                    <button
                      type="button"
                      className="mnu-act"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onDuplicate(r);
                      }}
                      aria-label={`שכפול ${dish.name}`}
                      title="שכפול"
                    >
                      <Icon name="content_copy" size={15} />
                    </button>
                    <button
                      type="button"
                      className="mnu-act mnu-act--danger"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onDelete(r);
                      }}
                      aria-label={`מחיקת ${dish.name}`}
                      title="מחיקה"
                    >
                      <Icon name="delete" size={15} />
                    </button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
