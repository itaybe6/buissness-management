let bootstrapInjected = false;
let placesPromise: Promise<void> | null = null;

export function getGoogleMapsApiKey(): string | undefined {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || undefined;
}

function injectGoogleMapsBootstrap(apiKey: string): void {
  const win = window as Window & { google?: { maps?: { importLibrary?: unknown } } };
  if (bootstrapInjected || win.google?.maps?.importLibrary) return;
  bootstrapInjected = true;

  const params = {
    key: apiKey,
    v: "weekly",
    language: "he",
    region: "IL",
    authReferrerPolicy: "origin",
  };

  // Official Google Maps dynamic import bootstrap loader.
  ((g: Record<string, string>) => {
    let a: HTMLScriptElement;
    let k: string;
    const p = "The Google Maps JavaScript API";
    const c = "google";
    const l = "importLibrary";
    const q = "__ib__";
    const m = document;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = window as any;
    b.google = b.google || {};
    const d: Record<string, unknown> = b.google.maps || (b.google.maps = {});
    const r = new Set<string>();
    const e = new URLSearchParams();
    let scriptPromise: Promise<void> | undefined;
    const u = () =>
      scriptPromise ||
      (scriptPromise = new Promise<void>((resolve, reject) => {
        void (async () => {
          a = m.createElement("script");
          e.set("libraries", [...r].join(""));
          for (k in g) {
            e.set(k.replace(/[A-Z]/g, (t) => `_${t[0].toLowerCase()}`), g[k]);
          }
          e.set("callback", `${c}.maps.${q}`);
          a.src = `https://maps.${c}apis.com/maps/api/js?${e}`;
          d[q] = resolve;
          a.onerror = () => reject(new Error(p + " could not load."));
          const nonceScript = m.querySelector("script[nonce]");
          a.nonce = nonceScript instanceof HTMLScriptElement ? nonceScript.nonce : "";
          m.head.append(a);
        })();
      }));
    if (d[l]) {
      console.warn(p + " only loads once. Ignoring:", g);
      return;
    }
    d[l] = (f: string, ...n: unknown[]) =>
      r.add(f) && u().then(() => (d[l] as (...args: unknown[]) => unknown)(f, ...n));
  })(params);
}

export function loadGoogleMapsPlaces(): Promise<void> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return Promise.reject(new Error("missing_api_key"));

  if (placesPromise) return placesPromise;

  placesPromise = Promise.resolve()
    .then(() => {
      injectGoogleMapsBootstrap(apiKey);
      return google.maps.importLibrary("places");
    })
    .then(() => undefined)
    .catch((error) => {
      placesPromise = null;
      throw error;
    });

  return placesPromise;
}
