/**
 * ניתוח הוצאות לפי ספק — חשבוניות מס וקבלות.
 *
 * מודל הכסף:
 *  • «חשבונית מס» היא דרישת תשלום  → מוסיפה לחיוב.
 *  • «קבלה» היא הוכחת תשלום        → מוסיפה לתשלום.
 *  • «חשבונית מס קבלה» היא שתיהן   → מוסיפה לשניהם (חוב סגור).
 * ולכן היתרה הפתוחה מול ספק = סך החשבוניות פחות סך הקבלות.
 *
 * כל הפונקציות כאן טהורות — בלי React ובלי רשת — כדי שיהיה אפשר לבדוק אותן.
 */
import type { OfficeReceipt, ReceiptType } from "@/types/database";

/** כמה חודשים אחורה מוצגים בגרף המגמה. */
export const SPEND_WINDOW_MONTHS = 12;

/** מעל כמה סטייה מהרגיל כבר נחשב "מעל הרגיל". */
const NORMAL_BAND = 0.15;
/** מעל כמה סטייה כבר נחשב חריגה של ממש. */
const SPIKE_BAND = 0.4;

/* ------------------------------------------------------------------ */
/*  תאריכים                                                            */
/* ------------------------------------------------------------------ */

type DatedReceipt = Pick<OfficeReceipt, "document_date" | "created_at">;

/** התאריך שאליו המסמך שייך — תאריך המסמך, ובהיעדרו מועד ההעלאה. */
export function receiptDate(r: DatedReceipt): string {
  return r.document_date ?? r.created_at.slice(0, 10);
}

/** החודש (yyyy-mm) שאליו המסמך שייך. */
export function receiptMonth(r: DatedReceipt): string {
  return receiptDate(r).slice(0, 7);
}

/** הזזת חודש קדימה/אחורה בלי תלות באזור זמן. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const year = Math.floor(total / 12);
  const mon = total % 12;
  return `${year}-${String(mon + 1).padStart(2, "0")}`;
}

/** רשימת החודשים שמסתיימת ב-endMonth, מהישן לחדש. */
export function monthsUpTo(endMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(endMonth, i - (count - 1)));
}

/** "אוג׳" לגרף, "אוגוסט 2026" לכותרות. */
export function monthLabel(month: string, style: "short" | "long" = "short"): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return style === "long"
    ? d.toLocaleDateString("he-IL", { month: "long", year: "numeric" })
    : d.toLocaleDateString("he-IL", { month: "short" }).replace(/^ב/, "");
}

/* ------------------------------------------------------------------ */
/*  קיבוץ לפי ספק                                                      */
/* ------------------------------------------------------------------ */

export function normalizeVendorName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * מפתח הקיבוץ של מסמך. מסמכים שקושרו לספק במערכת מתקבצים לפי מזהה הספק,
 * וכל השאר מתקבצים לפי שם הספק שהוקלד — כדי שגם ספק שלא הוזן למערכת
 * יקבל ניתוח משלו.
 */
export function vendorKeyOf(r: Pick<OfficeReceipt, "supplier_id" | "vendor_name">): string {
  return r.supplier_id ? `sup:${r.supplier_id}` : `name:${normalizeVendorName(r.vendor_name)}`;
}

export interface SpendTotals {
  /** סך מה שהספק חייב לנו לשלם לו (חשבוניות מס + חשבונית מס קבלה). */
  billed: number;
  /** סך מה ששולם בפועל (קבלות + חשבונית מס קבלה). */
  paid: number;
  /** כמה עוד חייבים לו. */
  balance: number;
  /** מספר המסמכים. */
  count: number;
  byType: Record<ReceiptType, number>;
}

const EMPTY_BY_TYPE: Record<ReceiptType, number> = { tax_invoice: 0, tax_invoice_receipt: 0, receipt: 0 };

export function emptyTotals(): SpendTotals {
  return { billed: 0, paid: 0, balance: 0, count: 0, byType: { ...EMPTY_BY_TYPE } };
}

export function totalsOf(rows: OfficeReceipt[]): SpendTotals {
  const t = emptyTotals();
  for (const r of rows) {
    const amount = Number(r.amount) || 0;
    if (r.type === "tax_invoice" || r.type === "tax_invoice_receipt") t.billed += amount;
    if (r.type === "receipt" || r.type === "tax_invoice_receipt") t.paid += amount;
    t.count += 1;
    t.byType[r.type] += 1;
  }
  t.balance = t.billed - t.paid;
  return t;
}

export interface MonthSpend extends SpendTotals {
  month: string;
}

export interface VendorSpend {
  key: string;
  name: string;
  supplierId: string | null;
  /** ח.פ / פרטים שהוזנו על הספק (הראשון שנמצא). */
  details: string | null;
  receipts: OfficeReceipt[];
  /** סיכום כל התקופה שנטענה. */
  totals: SpendTotals;
  /** רק חודשים שבהם באמת היו מסמכים, מהישן לחדש. */
  months: MonthSpend[];
  firstMonth: string;
  lastMonth: string;
  lastDate: string;
}

/** קיבוץ כל המסמכים לספקים, כולל סיכום חודשי לכל ספק. */
export function buildVendorSpend(receipts: OfficeReceipt[]): VendorSpend[] {
  const groups = new Map<string, OfficeReceipt[]>();
  for (const r of receipts) {
    const key = vendorKeyOf(r);
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  const vendors: VendorSpend[] = [];
  for (const [key, rows] of groups) {
    const sorted = [...rows].sort((a, b) => receiptDate(b).localeCompare(receiptDate(a)));
    const byMonth = new Map<string, OfficeReceipt[]>();
    for (const r of sorted) {
      const m = receiptMonth(r);
      const list = byMonth.get(m);
      if (list) list.push(r);
      else byMonth.set(m, [r]);
    }
    const months: MonthSpend[] = [...byMonth.entries()]
      .map(([month, list]) => ({ month, ...totalsOf(list) }))
      .sort((a, b) => a.month.localeCompare(b.month));

    vendors.push({
      key,
      // השם האחרון שהוקלד הוא הרלוונטי (ספק ששינה שם / תוקן איות)
      name: sorted[0].vendor_name,
      supplierId: sorted[0].supplier_id,
      details: sorted.find((r) => r.vendor_details?.trim())?.vendor_details ?? null,
      receipts: sorted,
      totals: totalsOf(sorted),
      months,
      firstMonth: months[0].month,
      lastMonth: months[months.length - 1].month,
      lastDate: receiptDate(sorted[0]),
    });
  }

  return vendors.sort((a, b) => b.totals.billed - a.totals.billed || a.name.localeCompare(b.name, "he"));
}

/** סדרת חודשים רציפה (כולל חודשים ריקים) לגרף המגמה. */
export function vendorSeries(vendor: VendorSpend, endMonth: string, count = SPEND_WINDOW_MONTHS): MonthSpend[] {
  const byMonth = new Map(vendor.months.map((m) => [m.month, m]));
  return monthsUpTo(endMonth, count).map((month) => byMonth.get(month) ?? { month, ...emptyTotals() });
}

/* ------------------------------------------------------------------ */
/*  "האם זה כמו בדרך כלל?"                                             */
/* ------------------------------------------------------------------ */

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type DeviationLevel = "new" | "normal" | "above" | "below" | "spike" | "drop";

export interface Deviation {
  level: DeviationLevel;
  current: number;
  /** החציון של החודשים הפעילים הקודמים — "כמה זה בדרך כלל". */
  baseline: number;
  /** השינוי היחסי מול הרגיל, או null כשאין בסיס להשוואה. */
  pct: number | null;
  /** על כמה חודשים ההשוואה מתבססת. */
  sampleSize: number;
}

type Metric = (m: MonthSpend) => number;

export const METRIC_BILLED: Metric = (m) => m.billed;
export const METRIC_COUNT: Metric = (m) => m.count;

/** ההשוואה עצמה: ערך נוכחי מול חציון הערכים שקדמו לו. */
function classify(current: number, prior: number[]): Deviation {
  const baseline = median(prior);
  if (prior.length === 0 || baseline <= 0) {
    return { level: "new", current, baseline: 0, pct: null, sampleSize: prior.length };
  }

  const pct = (current - baseline) / baseline;
  const confident = prior.length >= 2;

  let level: DeviationLevel = "normal";
  if (pct >= SPIKE_BAND) level = confident ? "spike" : "above";
  else if (pct >= NORMAL_BAND) level = "above";
  else if (pct <= -SPIKE_BAND) level = confident ? "drop" : "below";
  else if (pct <= -NORMAL_BAND) level = "below";

  return { level, current, baseline, pct, sampleSize: prior.length };
}

/**
 * השוואת חודש מסוים לחודשים הפעילים שקדמו לו.
 * הבסיס הוא חציון (ולא ממוצע) כדי שחודש חריג אחד לא יזיז את ה"רגיל".
 */
export function deviationOf(series: MonthSpend[], month: string, metric: Metric): Deviation {
  const idx = series.findIndex((m) => m.month === month);
  const current = idx >= 0 ? metric(series[idx]) : 0;
  const prior = (idx >= 0 ? series.slice(0, idx) : series).filter((m) => m.count > 0).map(metric);
  return classify(current, prior);
}

/** אותה השוואה על סדרת מספרים גולמית — לכל מדד שהגרף מציג. */
export function deviationOfValues(values: number[], index: number): Deviation {
  return classify(values[index] ?? 0, values.slice(0, index).filter((v) => v > 0));
}

/** רמת החריגה של כל נקודה בסדרה — לצביעת העמודות בגרף. */
export function levelsForValues(values: number[]): DeviationLevel[] {
  return values.map((_, i) => deviationOfValues(values, i).level);
}

export const DEVIATION_TONE: Record<DeviationLevel, "success" | "warning" | "danger" | "info" | "neutral"> = {
  new: "info",
  normal: "success",
  above: "warning",
  below: "info",
  spike: "danger",
  drop: "warning",
};

export const DEVIATION_ICON: Record<DeviationLevel, string> = {
  new: "auto_awesome",
  normal: "check_circle",
  above: "trending_up",
  below: "trending_down",
  spike: "priority_high",
  drop: "south_east",
};

/** ניסוח קצר בעברית של רמת הסטייה. */
export function deviationLabel(level: DeviationLevel, subject: "amount" | "count"): string {
  const noun = subject === "amount" ? "הסכום" : "כמות המסמכים";
  switch (level) {
    case "new":
      return `אין עדיין היסטוריה להשוואה`;
    case "normal":
      return `${noun} כרגיל`;
    case "above":
      return `${noun} מעל הרגיל`;
    case "below":
      return `${noun} מתחת לרגיל`;
    case "spike":
      return `חריגה — ${noun} גבוה בהרבה מהרגיל`;
    case "drop":
      return `${noun} נמוך בהרבה מהרגיל`;
  }
}

/** "+38%" / "-12%" / "—" */
export function formatPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  const rounded = Math.round(pct * 100);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

/**
 * כמה חודשים ברצף המדד עלה, כולל החודש הנבחר.
 * מחזיר 0 כשאין רצף עלייה.
 */
export function risingStreak(series: MonthSpend[], month: string, metric: Metric): number {
  const idx = series.findIndex((m) => m.month === month);
  if (idx < 1) return 0;
  let streak = 0;
  for (let i = idx; i > 0; i--) {
    const cur = metric(series[i]);
    const prev = metric(series[i - 1]);
    if (cur > prev && prev > 0) streak += 1;
    else break;
  }
  return streak;
}

/* ------------------------------------------------------------------ */
/*  שורת המסקנה                                                        */
/* ------------------------------------------------------------------ */

export type InsightTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface SpendVerdict {
  tone: InsightTone;
  icon: string;
  /** מה קרה החודש, במילה-שתיים. */
  title: string;
  /** מול מה זה נמדד. */
  detail: string;
}

function shekel(n: number): string {
  return "₪" + Math.round(n).toLocaleString("he-IL");
}

/**
 * משפט אחד שעונה על השאלה "האם החודש הזה כמו בדרך כלל?".
 * במקום לערום תובנות, נבחר הדבר הכי חשוב שיש להגיד על החודש.
 */
export function spendVerdict(series: MonthSpend[], month: string): SpendVerdict {
  const current = series.find((m) => m.month === month) ?? { month, ...emptyTotals() };

  if (current.count === 0) {
    const active = series.filter((m) => m.count > 0);
    return {
      tone: "neutral",
      icon: "event_busy",
      title: "אין מסמכים החודש",
      detail: active.length
        ? `אחרון: ${monthLabel(active[active.length - 1].month, "long")}`
        : "אין היסטוריה מול הספק",
    };
  }

  const dev = deviationOf(series, month, METRIC_BILLED);

  if (dev.level === "new") {
    return { tone: "info", icon: "auto_awesome", title: "חודש ראשון מול הספק", detail: `חויבו ${shekel(current.billed)}` };
  }

  const usual = `בדרך כלל ${shekel(dev.baseline)} בחודש`;

  // עלייה רצופה חשובה יותר מגודל החודש הבודד
  const streak = risingStreak(series, month, METRIC_BILLED);
  if (dev.level === "normal" && streak >= 2) {
    return { tone: "warning", icon: "stacked_line_chart", title: `עלייה ${streak + 1} חודשים ברצף`, detail: usual };
  }

  return {
    tone: DEVIATION_TONE[dev.level],
    icon: DEVIATION_ICON[dev.level],
    title:
      dev.level === "normal"
        ? "כרגיל"
        : dev.level === "spike"
          ? `חריגה · ${formatPct(dev.pct)} מהרגיל`
          : `${formatPct(dev.pct)} מהרגיל`,
    detail: usual,
  };
}

/* ------------------------------------------------------------------ */
/*  סיכום כלל-הספקים לחודש                                             */
/* ------------------------------------------------------------------ */

export interface VendorMonthRow {
  vendor: VendorSpend;
  month: MonthSpend;
  amount: Deviation;
}

/** שורה לכל ספק עבור החודש הנבחר — לרשימת הבחירה ולמיון. */
export function vendorMonthRows(vendors: VendorSpend[], month: string): VendorMonthRow[] {
  return vendors
    .map((vendor) => {
      const series = vendorSeries(vendor, month);
      return {
        vendor,
        month: series.find((m) => m.month === month) ?? { month, ...emptyTotals() },
        amount: deviationOf(series, month, METRIC_BILLED),
      };
    })
    .sort(
      (a, b) =>
        b.month.billed - a.month.billed ||
        b.vendor.totals.billed - a.vendor.totals.billed ||
        a.vendor.name.localeCompare(b.vendor.name, "he")
    );
}
