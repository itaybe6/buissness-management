import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { SignatureField } from "@/types/database";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Finds the fillable boxes printed on a PDF form so the manager doesn't have to
 * trace ~60 of them by hand.
 *
 * Official Hebrew forms (Form 101 among them) are vector PDFs, not scans, so
 * there is nothing to OCR: the boxes are real line art and the captions are real
 * text. Three shapes cover almost everything on such a form:
 *
 *   comb   — a baseline with evenly spaced tick marks, one cell per character
 *   row    — a captioned strip above a rule, holding free text (name, address)
 *   blank  — a short rule sitting inline in a sentence ("from ____ until ____")
 *
 * Detection is deliberately conservative: a missed box is one the manager draws,
 * while a wrong box lands on printed text and ruins the filled form.
 */

type Pt = [number, number];
type Seg = [Pt, Pt];
type Matrix = [number, number, number, number, number, number];

interface TextBox {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Caption extends TextBox {
  cap: string;
}
interface RawField {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  kind?: "signature" | "text";
}

const median = (a: number[]) => a.slice().sort((x, y) => x - y)[a.length >> 1];

const mul = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

const apply = (m: Matrix, x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Walk the page's drawing operators and flatten every path into line segments. */
async function pageSegments(page: pdfjsLib.PDFPageProxy): Promise<Seg[]> {
  const { OPS } = pdfjsLib;
  const ol = await page.getOperatorList();
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const segs: Seg[] = [];

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i];
    const args = ol.argsArray[i] as unknown;
    if (fn === OPS.save) stack.push([...ctm]);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args as Matrix);
    else if (fn === OPS.constructPath) {
      const [ops, coords] = args as [number[], number[]];
      let c = 0;
      let cur: Pt | null = null;
      for (const op of ops) {
        if (op === OPS.rectangle) {
          const [x, y, w, h] = coords.slice(c, c + 4);
          c += 4;
          const p1 = apply(ctm, x, y);
          const p2 = apply(ctm, x + w, y + h);
          segs.push([
            [Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1])],
            [Math.max(p1[0], p2[0]), Math.max(p1[1], p2[1])],
          ]);
        } else if (op === OPS.moveTo) {
          cur = apply(ctm, coords[c], coords[c + 1]);
          c += 2;
        } else if (op === OPS.lineTo) {
          const next = apply(ctm, coords[c], coords[c + 1]);
          c += 2;
          if (cur) segs.push([cur, next]);
          cur = next;
        } else if (op === OPS.curveTo) c += 6;
        else if (op === OPS.curveTo2 || op === OPS.curveTo3) c += 4;
      }
    }
  }
  return segs;
}

/** Short Hebrew strings read as field captions; sentences and bare numbers do not. */
function caption(s: string): string | null {
  const v = s.trim().replace(/\s+/g, " ").replace(/^[):.\s]+|[(:.\s]+$/g, "");
  if (v.length < 2 || v.length > 22) return null;
  if (!/[֐-׿]/.test(v)) return null;
  return v;
}

function detectOnPage(segs: Seg[], texts: TextBox[]): RawField[] {
  const ticks: { x: number; y: number }[] = [];
  const rules: { x0: number; x1: number; y: number }[] = [];
  for (const [a, b] of segs) {
    const dx = Math.abs(a[0] - b[0]);
    const dy = Math.abs(a[1] - b[1]);
    if (dx < 1.6 && dy >= 2 && dy <= 14) ticks.push({ x: (a[0] + b[0]) / 2, y: Math.min(a[1], b[1]) });
    else if (dy < 1.6 && dx >= 25) rules.push({ x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y: (a[1] + b[1]) / 2 });
  }
  if (rules.length === 0) return [];

  const captions: Caption[] = texts
    .map((t) => ({ ...t, cap: caption(t.str) }))
    .filter((t): t is Caption => t.cap !== null);

  /** True when printed text already occupies the box — then it is not writable space. */
  const inked = (x: number, y: number, w: number, h: number, min = 0.22) =>
    texts.some((t) => {
      const ox = Math.min(x + w, t.x + t.w) - Math.max(x, t.x);
      const oy = Math.min(y + h, t.y + t.h) - Math.max(y, t.y);
      return ox > 0 && oy > 0 && (ox * oy) / (w * h) > min;
    });

  const labelFor = (x: number, y: number, w: number, h: number): string | undefined => {
    let best: string | undefined;
    let bestScore = Infinity;
    for (const t of captions) {
      const ox = Math.min(x + w, t.x + t.w) - Math.max(x, t.x);
      if (ox < Math.min(w, t.w) * 0.3) continue;
      const above = t.y - (y + h);
      if (above < -3 || above > 14) continue;
      const score = above + Math.abs(x + w / 2 - (t.x + t.w / 2)) * 0.04;
      if (score < bestScore) {
        bestScore = score;
        best = t.cap;
      }
    }
    return best;
  };

  // --- combs: runs of evenly spaced ticks standing on one baseline ---
  const combs: { x: number; y: number; w: number }[] = [];
  const rows = new Map<number, { x: number; y: number }[]>();
  for (const t of ticks) {
    const key = Math.round(t.y / 2) * 2;
    const row = rows.get(key);
    if (row) row.push(t);
    else rows.set(key, [t]);
  }
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x);
    const uniq = row.filter((t, i) => i === 0 || t.x - row[i - 1].x > 1.5);
    if (uniq.length < 3) continue;
    let run = [uniq[0]];
    const flush = () => {
      if (run.length < 3) return;
      const gaps = run.slice(1).map((t, i) => t.x - run[i].x);
      const cell = median(gaps);
      if (cell < 5 || cell > 32) return;
      combs.push({ x: run[0].x, y: median(run.map((t) => t.y)), w: run[run.length - 1].x - run[0].x });
    };
    for (let i = 1; i < uniq.length; i++) {
      const gap = uniq[i].x - uniq[i - 1].x;
      const gaps = run.slice(1).map((t, k) => t.x - run[k].x);
      const ref = gaps.length ? median(gaps) : gap;
      if (gap >= 5 && gap <= 32 && Math.abs(gap - ref) <= Math.max(1.5, ref * 0.35)) run.push(uniq[i]);
      else {
        flush();
        run = [uniq[i]];
      }
    }
    flush();
  }

  const fields: RawField[] = [];
  const claimed: { y: number; x0: number; x1: number }[] = [];
  const widest = Math.max(...rules.map((r) => r.x1 - r.x0));
  // one value never spans two thirds of the sheet — that shape is a section rule
  const maxFieldW = widest * 0.62;

  // --- rows: a rule with captions above it is a fill row; combs sit inside it ---
  for (const r of rules) {
    const heads = captions
      .filter((t) => t.y > r.y + 1 && t.y < r.y + 26 && t.x + t.w > r.x0 && t.x < r.x1)
      .sort((a, b) => a.x - b.x);
    if (heads.length === 0) continue;
    const h = Math.min(Math.max(Math.min(...heads.map((t) => t.y)) - 2 - r.y, 8), 20);
    const mine = combs.filter((c) => Math.abs(c.y - r.y) < 3.5 && c.x + c.w > r.x0 - 2 && c.x < r.x1 + 2);

    const taken = new Set<string>(); // captions already spent on this row
    for (const c of mine) {
      const label = labelFor(c.x, r.y, c.w, h);
      if (label) taken.add(label);
      fields.push({ x: c.x, y: r.y, w: c.w, h, label });
      claimed.push({ y: r.y, x0: c.x, x1: c.x + c.w });
    }

    // gaps left between the combs hold the free-text cells of the same row
    const cuts = [r.x0, ...mine.flatMap((c) => [c.x, c.x + c.w]), r.x1].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i += 2) {
      const x = cuts[i];
      const w = cuts[i + 1] - x;
      if (w < 32 || w > maxFieldW) continue;
      if (inked(x, r.y, w, h)) continue;
      const over = heads.filter((t) => t.x + t.w > x && t.x < x + w);
      if (over.length === 0) continue;
      // several captions over one gap = several cells; split at the midpoints
      const edges = [x, ...over.slice(1).map((t, k) => (over[k].x + over[k].w + t.x) / 2), x + w];
      for (let k = 0; k < over.length; k++) {
        const sx = edges[k];
        const sw = edges[k + 1] - sx;
        if (sw < 32 || inked(sx, r.y, sw, h)) continue;
        // a caption already used by a comb here means this is leftover slack
        if (taken.has(over[k].cap)) continue;
        fields.push({ x: sx, y: r.y, w: sw, h, label: over[k].cap });
        claimed.push({ y: r.y, x0: sx, x1: sx + sw });
      }
    }
  }

  // --- combs inside tables, which have no captioned rule of their own ---
  for (const c of combs) {
    if (claimed.some((k) => Math.abs(k.y - c.y) < 3.5 && c.x < k.x1 + 2 && c.x + c.w > k.x0 - 2)) continue;
    fields.push({ x: c.x, y: c.y, w: c.w, h: 11, label: labelFor(c.x, c.y, c.w, 11) });
    claimed.push({ y: c.y, x0: c.x, x1: c.x + c.w });
  }

  // --- blanks: short rules sitting inline in the declaration text ---
  for (const r of rules) {
    const w = r.x1 - r.x0;
    if (w < 28 || w > maxFieldW) continue;
    if (claimed.some((c) => Math.abs(c.y - r.y) < 4 && r.x0 < c.x1 + 4 && r.x1 > c.x0 - 4)) continue;
    if (inked(r.x0, r.y, w, 11, 0.3)) continue;
    fields.push({ x: r.x0, y: r.y, w, h: 11, label: labelFor(r.x0, r.y, w, 11) });
  }

  // --- forms are often drawn twice with a slight offset; keep one box per spot ---
  const out: RawField[] = [];
  for (const f of fields) {
    const dup = out.some((g) => {
      const ox = Math.min(g.x + g.w, f.x + f.w) - Math.max(g.x, f.x);
      const oy = Math.min(g.y + g.h, f.y + f.h) - Math.max(g.y, f.y);
      return ox > 0 && oy > 0 && (ox * oy) / (f.w * f.h) > 0.5;
    });
    if (!dup) out.push(f);
  }

  for (const f of out) if (f.label && /חתימ/.test(f.label)) f.kind = "signature";
  return out;
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

/**
 * Detect the fillable boxes across every page of `url`, as normalized (0..1)
 * top-left coordinates ready to store in `signature_fields`.
 */
export async function detectFormFields(url: string): Promise<SignatureField[]> {
  const doc = await pdfjsLib.getDocument({ url }).promise;
  try {
    const out: SignatureField[] = [];
    for (let p = 0; p < doc.numPages; p++) {
      const page = await doc.getPage(p + 1);
      const [ox, oy, x1, y1] = page.view; // mediaBox — usually but not always at the origin
      const pw = x1 - ox;
      const ph = y1 - oy;
      const content = await page.getTextContent();
      const texts: TextBox[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        texts.push({ str: item.str, x: item.transform[4] - ox, y: item.transform[5] - oy, w: item.width, h: item.height });
      }
      const segs = (await pageSegments(page)).map(
        ([a, b]) => [[a[0] - ox, a[1] - oy], [b[0] - ox, b[1] - oy]] as Seg
      );
      for (const f of detectOnPage(segs, texts)) {
        out.push({
          id: uid(),
          page: p,
          // PDF space is bottom-up; our fields are top-left normalized
          x: f.x / pw,
          y: (ph - (f.y + f.h)) / ph,
          w: f.w / pw,
          h: f.h / ph,
          kind: f.kind ?? "text",
          ...(f.label ? { label: f.label } : {}),
        });
      }
    }
    return out;
  } finally {
    await doc.destroy().catch(() => {});
  }
}
