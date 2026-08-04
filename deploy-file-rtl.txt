/**
 * Hebrew text for pdf-lib.
 *
 * pdf-lib hands every string to fontkit, and fontkit reverses the glyphs of a
 * string whose dominant script is right-to-left. That is the right thing for a
 * single Hebrew word and the wrong thing for anything mixed: given
 * "קוקה קולה 1.5 ליטר" it flips the number too, and a barcode comes out back to
 * front. fontkit is not a bidi engine — it only knows "this string is Hebrew".
 *
 * So the ordering is resolved here instead, with a reduced version of the bidi
 * algorithm (UAX #9): classify the directional runs, resolve the neutrals
 * between them, and hand back the runs already ordered left-to-right. Each run
 * is then drawn as its own string at its own x, which leaves fontkit with a
 * single-direction string it cannot get wrong.
 */

type Dir = "R" | "L" | "N";

export interface TextRun {
  /** Logical order — fontkit reverses it when the run is RTL. */
  text: string;
  rtl: boolean;
}

/** Bidi_Mirrored characters — a "(" inside an RTL run is drawn as ")". */
const MIRROR: Record<string, string> = {
  "(": ")",
  ")": "(",
  "[": "]",
  "]": "[",
  "{": "}",
  "}": "{",
  "<": ">",
  ">": "<",
  "«": "»",
  "»": "«",
};

function dirOf(cp: number): Dir {
  // Hebrew, Hebrew presentation forms, Arabic — strong RTL
  if (
    (cp >= 0x0590 && cp <= 0x05ff) ||
    (cp >= 0x0600 && cp <= 0x08ff) ||
    (cp >= 0xfb1d && cp <= 0xfdff) ||
    (cp >= 0xfe70 && cp <= 0xfeff)
  ) {
    return "R";
  }
  // Digits, Latin, Greek, Cyrillic — treated as one LTR class. Merging digits
  // into L (rather than the spec's separate EN class) is what keeps "1.5 ליטר"
  // and a 13-digit barcode in one piece, which is all this document needs.
  if (
    (cp >= 0x0030 && cp <= 0x0039) ||
    (cp >= 0x0041 && cp <= 0x005a) ||
    (cp >= 0x0061 && cp <= 0x007a) ||
    (cp >= 0x00c0 && cp <= 0x024f) ||
    (cp >= 0x0370 && cp <= 0x04ff)
  ) {
    return "L";
  }
  return "N";
}

/** Marks that must stay glued to the character in front of them. */
function isCombining(cp: number): boolean {
  return (
    (cp >= 0x0300 && cp <= 0x036f) || // combining diacriticals
    (cp >= 0x0591 && cp <= 0x05bd) || // ta'amim + most nikud
    cp === 0x05bf ||
    cp === 0x05c1 ||
    cp === 0x05c2 ||
    cp === 0x05c4 ||
    cp === 0x05c5 ||
    cp === 0x05c7 ||
    cp === 0x200d ||
    (cp >= 0xfe00 && cp <= 0xfe0f)
  );
}

/**
 * Split into grapheme-ish clusters (base character + its combining marks) so
 * nothing ever separates nikud from the letter it sits under.
 */
export function toClusters(text: string): string[] {
  const clusters: string[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (clusters.length > 0 && isCombining(cp)) clusters[clusters.length - 1] += ch;
    else clusters.push(ch);
  }
  return clusters;
}

/**
 * Split one already-wrapped line into directional runs, ordered left-to-right
 * for a right-to-left paragraph. A pure-LTR string (barcode, phone number,
 * price) comes back as a single untouched run.
 */
export function toRuns(logical: string): TextRun[] {
  const clusters = toClusters(logical);
  if (clusters.length === 0) return [];

  const dirs = clusters.map((c) => dirOf(c.codePointAt(0)!));

  // Neutrals take the direction of their surroundings when both sides agree,
  // and the paragraph direction (RTL) otherwise. A run at either end of the
  // line sees the paragraph direction as its missing neighbour.
  for (let i = 0; i < dirs.length; i++) {
    if (dirs[i] !== "N") continue;
    let j = i;
    while (j < dirs.length && dirs[j] === "N") j++;
    const before: Dir = i > 0 ? dirs[i - 1] : "R";
    const after: Dir = j < dirs.length ? dirs[j] : "R";
    const resolved: Dir = before === after ? before : "R";
    for (let k = i; k < j; k++) dirs[k] = resolved;
    i = j - 1;
  }

  const runs: TextRun[] = [];
  for (let i = 0; i < clusters.length; ) {
    const dir = dirs[i];
    const items: string[] = [];
    while (i < clusters.length && dirs[i] === dir) {
      const cluster = clusters[i++];
      // fontkit reverses positions but never mirrors, so brackets that landed
      // in an RTL run are swapped here instead.
      items.push(dir === "R" ? (MIRROR[cluster] ?? cluster) : cluster);
    }
    runs.push({ text: items.join(""), rtl: dir === "R" });
  }

  // The first logical run sits furthest right, so lay them out back to front.
  return runs.reverse();
}

/**
 * The same reordering, but broken all the way down to single clusters in
 * left-to-right paint order. Used for letter-spaced labels, which are drawn one
 * cluster at a time — a lone cluster is a single glyph fontkit cannot reorder.
 */
export function toVisualClusters(logical: string): string[] {
  const out: string[] = [];
  for (const run of toRuns(logical)) {
    const clusters = toClusters(run.text);
    if (run.rtl) clusters.reverse();
    out.push(...clusters);
  }
  return out;
}

/**
 * Drop anything the embedded font cannot draw. Rubik covers Hebrew, Latin and
 * the punctuation used here but not emoji, arrows or geometric shapes, and an
 * uncovered code point would come out as a hollow .notdef box.
 */
export function sanitize(raw: string | null | undefined): string {
  if (!raw) return "";
  let out = "";
  for (const ch of raw) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x000a || cp === 0x000d) {
      out += "\n";
      continue;
    }
    if (cp === 0x0009) {
      out += " ";
      continue;
    }
    if (cp < 0x20) continue; // other control characters
    if (cp <= 0x007e) {
      out += ch;
      continue;
    }
    const keep =
      (cp >= 0x00a0 && cp <= 0x024f) || // Latin-1 + Latin Extended A/B
      (cp >= 0x0370 && cp <= 0x04ff) || // Greek + Cyrillic
      (cp >= 0x0590 && cp <= 0x05f4) || // Hebrew
      (cp >= 0x2010 && cp <= 0x2027) || // dashes, quotes, bullet, ellipsis
      cp === 0x20aa || // ₪
      cp === 0x20ac; // €
    if (keep) out += ch;
  }
  return out;
}

/** Collapse whitespace and trim — table cells are single-line. */
export function oneLine(raw: string | null | undefined): string {
  return sanitize(raw).replace(/\s+/g, " ").trim();
}
