/**
 * סביבת דפדפן מינימלית לבדיקות שרצות ב-node.
 *
 * חלק מהלוגיקה (התראות תקלות לאיש אחזקה, אישור אספקה חלקית למנהלת המשרד)
 * שומרת מצב ב-localStorage ומשדרת CustomEvent. במקום להעביר את כל חבילת
 * הבדיקות ל-jsdom, מותקן כאן stub קטן ונשלט — כולל אפשרות לדמות
 * localStorage שנכשל (גלישה ממכסה / מצב פרטי), שהקוד אמור לשרוד.
 */

type Listener = (event: { type: string; detail?: unknown }) => void;

export interface FakeBrowserEnv {
  storage: Map<string, string>;
  /** אירועים שנשלחו דרך window.dispatchEvent, לפי סדר. */
  events: { type: string; detail?: unknown }[];
  /** גורם לכל קריאה ל-localStorage לזרוק — לדימוי מצב פרטי / מכסה מלאה. */
  breakStorage: (broken: boolean) => void;
  restore: () => void;
}

/**
 * מתקין localStorage ו-window מזויפים על globalThis ומחזיר ידית שליטה.
 * יש לקרוא ל-restore() ב-afterEach כדי לא לדלוף בין קבצי בדיקה.
 */
export function installFakeBrowser(): FakeBrowserEnv {
  const storage = new Map<string, string>();
  const events: { type: string; detail?: unknown }[] = [];
  const listeners = new Map<string, Set<Listener>>();
  let broken = false;

  const g = globalThis as Record<string, unknown>;
  const prevLocalStorage = g.localStorage;
  const prevWindow = g.window;
  const prevCustomEvent = g.CustomEvent;
  const hadLocalStorage = "localStorage" in g;
  const hadWindow = "window" in g;
  const hadCustomEvent = "CustomEvent" in g;

  function guard() {
    if (broken) throw new Error("QuotaExceededError (simulated)");
  }

  const fakeStorage = {
    getItem(key: string): string | null {
      guard();
      return storage.has(key) ? storage.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      guard();
      storage.set(key, String(value));
    },
    removeItem(key: string): void {
      guard();
      storage.delete(key);
    },
    clear(): void {
      guard();
      storage.clear();
    },
    key(index: number): string | null {
      guard();
      return [...storage.keys()][index] ?? null;
    },
    get length(): number {
      return storage.size;
    },
  };

  class FakeCustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  }

  const fakeWindow = {
    localStorage: fakeStorage,
    dispatchEvent(event: { type: string; detail?: unknown }): boolean {
      events.push({ type: event.type, detail: event.detail });
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
    addEventListener(type: string, listener: Listener): void {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: Listener): void {
      listeners.get(type)?.delete(listener);
    },
  };

  g.localStorage = fakeStorage;
  g.window = fakeWindow;
  g.CustomEvent = FakeCustomEvent;

  return {
    storage,
    events,
    breakStorage(next: boolean) {
      broken = next;
    },
    restore() {
      if (hadLocalStorage) g.localStorage = prevLocalStorage;
      else delete g.localStorage;
      if (hadWindow) g.window = prevWindow;
      else delete g.window;
      if (hadCustomEvent) g.CustomEvent = prevCustomEvent;
      else delete g.CustomEvent;
    },
  };
}
