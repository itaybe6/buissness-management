/**
 * Rubik — the Hebrew typeface the document is set in.
 *
 * The static TTFs ship inside the @expo-google-fonts packages, which are the
 * only widely mirrored copies of Google's *non-variable* Rubik files (fontkit
 * embeds those far more predictably than a variable font). They are pulled once
 * per isolate and kept in module scope, so only a cold start pays for it.
 */

export type FontWeight = "regular" | "medium" | "bold";

const SOURCES: Record<FontWeight, string[]> = {
  regular: [
    "https://cdn.jsdelivr.net/npm/@expo-google-fonts/rubik@0.2.3/Rubik_400Regular.ttf",
    "https://unpkg.com/@expo-google-fonts/rubik@0.2.3/Rubik_400Regular.ttf",
  ],
  medium: [
    "https://cdn.jsdelivr.net/npm/@expo-google-fonts/rubik@0.2.3/Rubik_500Medium.ttf",
    "https://unpkg.com/@expo-google-fonts/rubik@0.2.3/Rubik_500Medium.ttf",
  ],
  bold: [
    "https://cdn.jsdelivr.net/npm/@expo-google-fonts/rubik@0.2.3/Rubik_700Bold.ttf",
    "https://unpkg.com/@expo-google-fonts/rubik@0.2.3/Rubik_700Bold.ttf",
  ],
};

const cache = new Map<FontWeight, Uint8Array>();

async function download(weight: FontWeight): Promise<Uint8Array> {
  let lastError: unknown = null;
  for (const url of SOURCES[weight]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) {
        lastError = new Error(`${url} → HTTP ${res.status}`);
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      // A truncated body still parses far enough to produce garbage glyphs, so
      // insist on something that is at least plausibly the whole file.
      if (bytes.byteLength < 20_000) {
        lastError = new Error(`${url} → ${bytes.byteLength} bytes, too small for a TTF`);
        continue;
      }
      return bytes;
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`could not load the Hebrew font (${weight}): ${String(lastError)}`);
}

/** All three weights, fetched in parallel on the first call of an isolate. */
export async function loadFonts(): Promise<Record<FontWeight, Uint8Array>> {
  const weights: FontWeight[] = ["regular", "medium", "bold"];
  const missing = weights.filter((w) => !cache.has(w));
  if (missing.length > 0) {
    const fetched = await Promise.all(missing.map(download));
    missing.forEach((w, i) => cache.set(w, fetched[i]));
  }
  return {
    regular: cache.get("regular")!,
    medium: cache.get("medium")!,
    bold: cache.get("bold")!,
  };
}
