/**
 * כלי מדידה לבדיקות עומס.
 *
 * המטרה אינו benchmark מדויק אלא רשת ביטחון: לתפוס רגרסיה אלגוריתמית
 * (למשל מעבר מ-O(n) ל-O(n²)) לפני שהיא מגיעה לעסק עם 300 עובדים.
 * לכן התקציבים רחבים בכוונה — הם נכשלים רק על סדר גודל, לא על רעש.
 */

export interface Measurement<T> {
  result: T;
  ms: number;
}

export function measure<T>(fn: () => T): Measurement<T> {
  const start = performance.now();
  const result = fn();
  const ms = performance.now() - start;
  return { result, ms };
}

/**
 * מריץ פונקציה מספר פעמים ומחזיר את הריצה המהירה ביותר.
 * החציון/מינימום עמיד יותר מהממוצע מול עצירות GC ורעש מערכת ההפעלה.
 */
export function measureBest<T>(fn: () => T, runs = 3): Measurement<T> {
  let best: Measurement<T> | null = null;
  for (let i = 0; i < runs; i++) {
    const m = measure(fn);
    if (!best || m.ms < best.ms) best = m;
  }
  return best!;
}

/**
 * בודק שהזמן בתוך התקציב, עם הודעת כישלון שמסבירה מה נמדד.
 * זורק שגיאה רגילה כדי שהבדיקה תיכשל בלי לייבא expect לכאן.
 */
export function assertWithinBudget(label: string, ms: number, budgetMs: number): void {
  if (ms > budgetMs) {
    throw new Error(
      `חריגה מתקציב זמן ב-«${label}»: ${ms.toFixed(1)}ms > ${budgetMs}ms. ` +
        "בדקו אם נוספה לולאה מקוננת או חיפוש ליניארי בתוך לולאה.",
    );
  }
}

/**
 * בודק שהזמן גדל בערך ליניארית עם הקלט.
 * `ratio` הוא פי כמה גדל הקלט; `maxGrowthFactor` הוא הגידול המרבי המותר בזמן.
 * מתעלם ממדידות זעירות (< 2ms) שבהן הרעש גדול מהאות.
 */
export function assertScalesLinearly(input: {
  label: string;
  smallMs: number;
  largeMs: number;
  ratio: number;
  maxGrowthFactor?: number;
}): void {
  const { label, smallMs, largeMs, ratio, maxGrowthFactor = ratio * 3 } = input;
  if (smallMs < 2) return; // מדידה קטנה מדי מכדי להסיק ממנה
  const growth = largeMs / smallMs;
  if (growth > maxGrowthFactor) {
    throw new Error(
      `«${label}» לא מתרחב ליניארית: קלט גדל פי ${ratio}, הזמן גדל פי ${growth.toFixed(1)} ` +
        `(מותר עד פי ${maxGrowthFactor}). ${smallMs.toFixed(1)}ms → ${largeMs.toFixed(1)}ms`,
    );
  }
}
