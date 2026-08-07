/**
 * The purchase-order document.
 *
 * pdf-lib is handed in rather than imported so the exact same layout code runs
 * under Deno (the edge function) and under Node (the render smoke test).
 *
 * Everything here works in top-down coordinates — `top` is the distance from
 * the top of the page — and the few helpers at the bottom of this file convert
 * to PDF's bottom-left origin at the last moment.
 */

import { oneLine, sanitize, toClusters, toRuns, toVisualClusters } from "./rtl.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Page = any;
type Font = any;
type Color = any;

export interface PdfLib {
  PDFDocument: any;
  rgb: (r: number, g: number, b: number) => Color;
  fontkit: any;
}

export interface OrderPdfLine {
  name: string;
  /** Category · pack size · barcode — the quiet second line under the name. */
  meta: string;
  /** "2 ארגז + 3 בקבוק" */
  qty: string;
  /** Total pieces, when the product is packaged. */
  qtySub: string;
  /** "₪120" or "" when the supplier has no price for this product. */
  price: string;
  /** "לארגז" */
  priceUnit: string;
  /** Line total in shekels; 0 when unpriced. */
  total: number;
  /** Set when the delivered quantity differed from what was ordered. */
  receivedNote: string;
}

export interface OrderPdfData {
  businessName: string;
  supplier: {
    name: string;
    phone: string;
    taxId: string;
    deliveryDays: string;
    notes: string;
  };
  order: {
    number: string;
    date: string;
    time: string;
    orderedBy: string;
    statusLabel: string;
    statusTone: "open" | "received" | "partial";
  };
  lines: OrderPdfLine[];
  totals: {
    unitsLabel: string;
    sum: string;
    /** How many lines the supplier has no price for — surfaced, never hidden. */
    unpriced: number;
  };
  generatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Page geometry                                                       */
/* ------------------------------------------------------------------ */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 42;
const CONTENT_W = PAGE_W - MARGIN * 2;
const RIGHT = PAGE_W - MARGIN;

const HERO_H = 176;
const RIBBON_H = 58;
const ROW_H = 36;
const HEAD_H = 30;
const CELL_PAD = 10;
/** Rows may not cross this line; the footer lives below it. */
const BODY_BOTTOM = PAGE_H - 74;
/** Baseline sits this fraction of the font size below the top of a line box. */
const BASELINE = 0.78;

const COLUMNS = [
  { key: "idx", w: 28 },
  { key: "name", w: 217 },
  { key: "qty", w: 88 },
  { key: "price", w: 88 },
  { key: "total", w: 90 },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];

/** Right edge of every column, walking inwards from the right page margin. */
const COL_RIGHT: Record<ColKey, number> = (() => {
  const map = {} as Record<ColKey, number>;
  let edge = RIGHT;
  for (const col of COLUMNS) {
    map[col.key] = edge;
    edge -= col.w;
  }
  return map;
})();

const COL_W: Record<ColKey, number> = Object.fromEntries(
  COLUMNS.map((c) => [c.key, c.w]),
) as Record<ColKey, number>;

/* ------------------------------------------------------------------ */
/* Palette — the app's tokens, nudged for print contrast               */
/* ------------------------------------------------------------------ */

function hex(rgb: PdfLib["rgb"], value: string): Color {
  const n = parseInt(value.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function palette(rgb: PdfLib["rgb"]) {
  return {
    ink: hex(rgb, "#121a24"),
    inkDeep: hex(rgb, "#0b0e16"),
    white: hex(rgb, "#ffffff"),
    text: hex(rgb, "#121a24"),
    text2: hex(rgb, "#5a636e"),
    text3: hex(rgb, "#949ca6"),
    text4: hex(rgb, "#b3b9c1"),
    border: hex(rgb, "#e4e6eb"),
    hair: hex(rgb, "#eef0f2"),
    zebra: hex(rgb, "#fafbfc"),
    band: hex(rgb, "#f4f5f7"),
    panel: hex(rgb, "#f7f8fa"),
    card: hex(rgb, "#fcfcfd"),
    success: hex(rgb, "#00a05e"),
    successBg: hex(rgb, "#e4f6ee"),
    warning: hex(rgb, "#a56a06"),
    warningBg: hex(rgb, "#fdf0d9"),
    info: hex(rgb, "#2f6fd0"),
    infoBg: hex(rgb, "#e6eefb"),
  };
}

type Palette = ReturnType<typeof palette>;
type Fonts = { reg: Font; med: Font; bold: Font };

/* ------------------------------------------------------------------ */
/* Drawing primitives (top-down coordinates)                           */
/* ------------------------------------------------------------------ */

const K = 0.5522847498307936;

/** Rounded-rectangle path in SVG space, with per-corner radii. */
function roundedPath(w: number, h: number, r: number | [number, number, number, number]): string {
  const [tl, tr, br, bl] = typeof r === "number" ? [r, r, r, r] : r;
  const lim = Math.min(w, h) / 2;
  const a = Math.min(tl, lim);
  const b = Math.min(tr, lim);
  const c = Math.min(br, lim);
  const d = Math.min(bl, lim);
  return [
    `M ${a} 0`,
    `H ${w - b}`,
    `C ${w - b + b * K} 0 ${w} ${b - b * K} ${w} ${b}`,
    `V ${h - c}`,
    `C ${w} ${h - c + c * K} ${w - c + c * K} ${h} ${w - c} ${h}`,
    `H ${d}`,
    `C ${d - d * K} ${h} 0 ${h - d + d * K} 0 ${h - d}`,
    `V ${a}`,
    `C 0 ${a - a * K} ${a - a * K} 0 ${a} 0`,
    "Z",
  ].join(" ");
}

interface BoxOpts {
  left: number;
  top: number;
  w: number;
  h: number;
  radius?: number | [number, number, number, number];
  fill?: Color;
  stroke?: Color;
  strokeWidth?: number;
  opacity?: number;
}

function box(page: Page, o: BoxOpts) {
  if (o.radius === undefined || o.radius === 0) {
    page.drawRectangle({
      x: o.left,
      y: PAGE_H - o.top - o.h,
      width: o.w,
      height: o.h,
      color: o.fill,
      borderColor: o.stroke,
      borderWidth: o.stroke ? (o.strokeWidth ?? 1) : undefined,
      opacity: o.opacity,
      borderOpacity: o.opacity,
    });
    return;
  }
  page.drawSvgPath(roundedPath(o.w, o.h, o.radius), {
    x: o.left,
    y: PAGE_H - o.top,
    color: o.fill,
    borderColor: o.stroke,
    borderWidth: o.stroke ? (o.strokeWidth ?? 1) : 0,
    opacity: o.opacity,
    borderOpacity: o.opacity,
  });
}

function hairline(page: Page, left: number, top: number, w: number, color: Color, opacity?: number) {
  page.drawRectangle({
    x: left,
    y: PAGE_H - top,
    width: w,
    height: 0.7,
    color,
    opacity,
  });
}

interface TextOpts {
  size: number;
  font: Font;
  color: Color;
  /** "right" anchors the string's right edge at `x` — the RTL default. */
  align?: "right" | "left" | "center";
  opacity?: number;
  maxWidth?: number;
  tracking?: number;
}

/**
 * The pieces a line is painted from, left to right. Without letter spacing that
 * is one string per directional run; with it, one string per cluster, because
 * the gap has to be opened between every pair of glyphs.
 */
function segmentsOf(logical: string, tracking?: number): string[] {
  if (tracking) return toVisualClusters(logical);
  return toRuns(logical).map((run) => run.text);
}

function measure(segments: string[], o: Pick<TextOpts, "size" | "font" | "tracking">): number {
  let w = 0;
  for (const segment of segments) w += o.font.widthOfTextAtSize(segment, o.size);
  if (o.tracking) w += o.tracking * Math.max(0, segments.length - 1);
  return w;
}

/**
 * Shorten a *logical* string until it fits, keeping the ellipsis on the reading
 * end (visually the left, in Hebrew).
 */
function fit(logical: string, o: Pick<TextOpts, "size" | "font" | "tracking" | "maxWidth">): string[] {
  const full = segmentsOf(logical, o.tracking);
  if (o.maxWidth === undefined || measure(full, o) <= o.maxWidth) return full;
  const parts = toClusters(logical);
  while (parts.length > 0) {
    parts.pop();
    const candidate = segmentsOf(parts.join("").trimEnd() + "…", o.tracking);
    if (measure(candidate, o) <= o.maxWidth) return candidate;
  }
  return [];
}

/** Draw one line of Hebrew/mixed text. Returns the width actually painted. */
function text(page: Page, raw: string, x: number, top: number, o: TextOpts): number {
  const logical = oneLine(raw);
  if (!logical) return 0;
  const segments = fit(logical, o);
  if (segments.length === 0) return 0;

  const w = measure(segments, o);
  const y = PAGE_H - top - o.size * BASELINE;
  let cursor = o.align === "left" ? x : o.align === "center" ? x - w / 2 : x - w;

  for (const segment of segments) {
    page.drawText(segment, { x: cursor, y, size: o.size, font: o.font, color: o.color, opacity: o.opacity });
    cursor += o.font.widthOfTextAtSize(segment, o.size) + (o.tracking ?? 0);
  }
  return w;
}

/** Small filled pill with a leading dot — the status chip. */
function pill(
  page: Page,
  label: string,
  right: number,
  top: number,
  fonts: Fonts,
  fill: Color,
  fg: Color,
  opts: { size?: number; dot?: Color } = {},
) {
  const size = opts.size ?? 8.5;
  const o = { size, font: fonts.bold, color: fg };
  const w = measure(segmentsOf(oneLine(label)), o);
  const dotW = opts.dot ? 11 : 0;
  const boxW = w + dotW + 22;
  const boxH = size + 12;
  box(page, { left: right - boxW, top, w: boxW, h: boxH, radius: boxH / 2, fill });
  if (opts.dot) {
    page.drawCircle({ x: right - 11, y: PAGE_H - top - boxH / 2, size: 2.6, color: opts.dot });
  }
  text(page, label, right - 11 - dotW, top + 6, o);
  return boxH;
}

/* ------------------------------------------------------------------ */
/* Document                                                            */
/* ------------------------------------------------------------------ */

export async function renderOrderPdf(
  lib: PdfLib,
  fontBytes: { regular: Uint8Array; medium: Uint8Array; bold: Uint8Array },
  data: OrderPdfData,
): Promise<Uint8Array> {
  const pdf = await lib.PDFDocument.create();
  pdf.registerFontkit(lib.fontkit);

  const fonts: Fonts = {
    reg: await pdf.embedFont(fontBytes.regular, { subset: true }),
    med: await pdf.embedFont(fontBytes.medium, { subset: true }),
    bold: await pdf.embedFont(fontBytes.bold, { subset: true }),
  };
  const c = palette(lib.rgb);

  pdf.setTitle(`הזמנה — ${data.supplier.name}`);
  pdf.setAuthor(data.businessName);
  pdf.setSubject(`הזמנת רכש מהספק ${data.supplier.name}`);
  pdf.setCreator(data.businessName);
  pdf.setProducer("Business Management");
  pdf.setLanguage("he-IL");
  pdf.setCreationDate(new Date());

  const pages: Page[] = [];
  const newPage = (): Page => {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    return page;
  };

  let page = newPage();
  drawHero(page, fonts, c, data);
  drawFactCards(page, fonts, c, data, 202);

  let top = 296;
  top = drawTableHead(page, fonts, c, top);

  data.lines.forEach((line, i) => {
    if (top + ROW_H > BODY_BOTTOM) {
      page = newPage();
      drawRibbon(page, fonts, c, data);
      top = drawTableHead(page, fonts, c, RIBBON_H + 26);
    }
    drawRow(page, fonts, c, line, i, top);
    top += ROW_H;
  });

  hairline(page, MARGIN, top, CONTENT_W, c.border);
  top += 26;

  if (top + SUMMARY_H > BODY_BOTTOM) {
    page = newPage();
    drawRibbon(page, fonts, c, data);
    top = RIBBON_H + 30;
  }
  drawSummary(page, fonts, c, data, top);

  pages.forEach((p, i) => drawFooter(p, fonts, c, data, i + 1, pages.length));

  return await pdf.save();
}

/* ---- page 1 hero ------------------------------------------------- */

function drawHero(page: Page, fonts: Fonts, c: Palette, data: OrderPdfData) {
  box(page, { left: 0, top: 0, w: PAGE_W, h: HERO_H, fill: c.ink });

  // Depth: two oversized, barely-there discs bleeding off the left edge.
  page.drawCircle({ x: 22, y: PAGE_H - 24, size: 132, color: c.white, opacity: 0.04 });
  page.drawCircle({ x: 150, y: PAGE_H - 196, size: 116, color: c.white, opacity: 0.028 });
  page.drawCircle({ x: PAGE_W - 40, y: PAGE_H - 178, size: 92, color: c.white, opacity: 0.022 });

  // A hand-built gradient rule along the bottom edge: bright under the title,
  // fading out towards the left (a real PDF gradient needs a shading
  // dictionary). Every band ends at the right edge and they stack, so the alpha
  // builds up smoothly instead of leaving a seam between neighbouring steps.
  const steps = 26;
  for (let i = 0; i < steps; i++) {
    const w = PAGE_W * Math.pow((i + 1) / steps, 2.1);
    box(page, {
      left: PAGE_W - w,
      top: HERO_H - 2.6,
      w,
      h: 2.6,
      fill: c.white,
      opacity: 0.022,
    });
  }

  text(page, "הזמנת רכש", RIGHT, 40, {
    size: 8,
    font: fonts.med,
    color: c.white,
    opacity: 0.55,
    tracking: 2.1,
  });
  text(page, data.businessName, RIGHT, 56, {
    size: 25,
    font: fonts.bold,
    color: c.white,
    maxWidth: 300,
  });
  text(page, `הזמנה לספק · ${data.supplier.name}`, RIGHT, 94, {
    size: 11,
    font: fonts.reg,
    color: c.white,
    opacity: 0.72,
    maxWidth: 300,
  });

  const tone =
    data.order.statusTone === "received"
      ? { fill: c.success, fg: c.white }
      : data.order.statusTone === "partial"
        ? { fill: c.warning, fg: c.white }
        : { fill: c.white, fg: c.ink };
  pill(page, data.order.statusLabel, RIGHT, 118, fonts, tone.fill, tone.fg, { dot: tone.fg });

  // Order card, left column.
  const cardW = 208;
  const cardH = 56;
  const cardL = MARGIN;
  const cardTop = 60;
  box(page, {
    left: cardL,
    top: cardTop,
    w: cardW,
    h: cardH,
    radius: 14,
    fill: c.white,
    opacity: 0.075,
  });
  box(page, {
    left: cardL,
    top: cardTop,
    w: cardW,
    h: cardH,
    radius: 14,
    stroke: c.white,
    strokeWidth: 0.8,
    opacity: 0.17,
  });

  const cardRight = cardL + cardW - 16;
  text(page, "תאריך ההזמנה", cardRight, cardTop + 14, {
    size: 7.2,
    font: fonts.med,
    color: c.white,
    opacity: 0.5,
    tracking: 1.1,
  });
  text(page, `${data.order.date} · ${data.order.time}`, cardRight, cardTop + 28, {
    size: 10.5,
    font: fonts.med,
    color: c.white,
    opacity: 0.92,
    maxWidth: cardW - 32,
  });
}

/* ---- continuation pages ------------------------------------------ */

function drawRibbon(page: Page, fonts: Fonts, c: Palette, data: OrderPdfData) {
  box(page, { left: 0, top: 0, w: PAGE_W, h: RIBBON_H, fill: c.ink });
  text(page, `${data.businessName} · הזמנה`, RIGHT, 20, {
    size: 11,
    font: fonts.bold,
    color: c.white,
    maxWidth: 330,
  });
  text(page, `המשך · ${data.supplier.name}`, MARGIN, 22, {
    size: 9,
    font: fonts.reg,
    color: c.white,
    opacity: 0.6,
    align: "left",
    maxWidth: 150,
  });
}

/* ---- fact cards --------------------------------------------------- */

function drawFactCards(page: Page, fonts: Fonts, c: Palette, data: OrderPdfData, top: number) {
  const gap = 12;
  const w = (CONTENT_W - gap * 2) / 3;
  const h = 76;

  const cards: { label: string; value: string; sub: string }[] = [
    {
      label: "ספק",
      value: data.supplier.name,
      sub: data.supplier.phone || "לא הוזן טלפון",
    },
    {
      label: "ימי אספקה",
      value: data.supplier.deliveryDays,
      sub: data.supplier.taxId ? `ח.פ / עוסק ${data.supplier.taxId}` : "לא הוזן ח.פ / עוסק",
    },
    {
      label: "הוזמן על ידי",
      value: data.order.orderedBy,
      sub: `${data.lines.length} שורות בהזמנה`,
    },
  ];

  cards.forEach((card, i) => {
    const left = RIGHT - w - i * (w + gap);
    box(page, { left, top, w, h, radius: 13, fill: c.card });
    box(page, { left, top, w, h, radius: 13, stroke: c.border, strokeWidth: 0.8 });
    // A short accent tick in the card's top-right corner keeps the row from
    // reading as three empty boxes.
    box(page, { left: left + w - 14 - 18, top: top + 14, w: 18, h: 2.2, radius: 1.1, fill: c.ink, opacity: 0.85 });

    const right = left + w - 14;
    text(page, card.label, right, top + 24, {
      size: 7.2,
      font: fonts.med,
      color: c.text3,
      tracking: 1,
    });
    text(page, card.value, right, top + 36, {
      size: 12,
      font: fonts.bold,
      color: c.text,
      maxWidth: w - 28,
    });
    text(page, card.sub, right, top + 54, {
      size: 8.6,
      font: fonts.reg,
      color: c.text2,
      maxWidth: w - 28,
    });
  });
}

/* ---- table -------------------------------------------------------- */

function drawTableHead(page: Page, fonts: Fonts, c: Palette, top: number): number {
  box(page, {
    left: MARGIN,
    top,
    w: CONTENT_W,
    h: HEAD_H,
    radius: [10, 10, 0, 0],
    fill: c.band,
  });
  hairline(page, MARGIN, top + HEAD_H, CONTENT_W, c.border);

  const labels: Record<ColKey, string> = {
    idx: "#",
    name: "מוצר",
    qty: "כמות",
    price: "מחיר ליחידה",
    total: "סה״כ",
  };
  const opts: TextOpts = { size: 7.8, font: fonts.bold, color: c.text2, tracking: 0.7 };
  for (const col of COLUMNS) {
    if (col.key === "idx") {
      text(page, labels.idx, COL_RIGHT.idx - COL_W.idx / 2, top + 11, { ...opts, align: "center" });
      continue;
    }
    text(page, labels[col.key], COL_RIGHT[col.key] - CELL_PAD, top + 11, {
      ...opts,
      maxWidth: col.w - CELL_PAD * 2,
    });
  }
  return top + HEAD_H;
}

function drawRow(page: Page, fonts: Fonts, c: Palette, line: OrderPdfLine, index: number, top: number) {
  if (index % 2 === 1) {
    box(page, { left: MARGIN, top, w: CONTENT_W, h: ROW_H, fill: c.zebra });
  }
  hairline(page, MARGIN, top + ROW_H, CONTENT_W, c.hair);

  text(page, String(index + 1), COL_RIGHT.idx - COL_W.idx / 2, top + 13, {
    size: 8.5,
    font: fonts.med,
    color: c.text4,
    align: "center",
  });

  const twoLine = !!line.meta;
  text(page, line.name, COL_RIGHT.name - CELL_PAD, top + (twoLine ? 8 : 13), {
    size: 10.5,
    font: fonts.bold,
    color: c.text,
    maxWidth: COL_W.name - CELL_PAD * 2,
  });
  if (twoLine) {
    text(page, line.meta, COL_RIGHT.name - CELL_PAD, top + 22, {
      size: 7.8,
      font: fonts.reg,
      color: c.text3,
      maxWidth: COL_W.name - CELL_PAD * 2,
    });
  }

  text(page, line.qty, COL_RIGHT.qty - CELL_PAD, top + (line.qtySub ? 8 : 13), {
    size: 10.5,
    font: fonts.med,
    color: c.text,
    maxWidth: COL_W.qty - CELL_PAD * 2,
  });
  if (line.qtySub) {
    text(page, line.qtySub, COL_RIGHT.qty - CELL_PAD, top + 22, {
      size: 7.8,
      font: fonts.reg,
      color: c.text3,
      maxWidth: COL_W.qty - CELL_PAD * 2,
    });
  }

  if (line.price) {
    text(page, line.price, COL_RIGHT.price - CELL_PAD, top + 8, {
      size: 10.5,
      font: fonts.med,
      color: c.text,
      maxWidth: COL_W.price - CELL_PAD * 2,
    });
    text(page, line.priceUnit, COL_RIGHT.price - CELL_PAD, top + 22, {
      size: 7.8,
      font: fonts.reg,
      color: c.text3,
      maxWidth: COL_W.price - CELL_PAD * 2,
    });
  } else {
    text(page, "ללא מחיר", COL_RIGHT.price - CELL_PAD, top + 13, {
      size: 9,
      font: fonts.reg,
      color: c.warning,
      maxWidth: COL_W.price - CELL_PAD * 2,
    });
  }

  text(page, line.total > 0 ? formatShekel(line.total) : "—", COL_RIGHT.total - CELL_PAD, top + (line.receivedNote ? 8 : 13), {
    size: 11,
    font: fonts.bold,
    color: line.total > 0 ? c.text : c.text4,
    maxWidth: COL_W.total - CELL_PAD * 2,
  });
  if (line.receivedNote) {
    text(page, line.receivedNote, COL_RIGHT.total - CELL_PAD, top + 22, {
      size: 7.6,
      font: fonts.reg,
      color: c.warning,
      maxWidth: COL_W.total - CELL_PAD * 2,
    });
  }
}

/* ---- summary ------------------------------------------------------ */

/** Totals card only — notes/terms are intentionally omitted from the PDF. */
const SUMMARY_H = 132;

function drawSummary(page: Page, fonts: Fonts, c: Palette, data: OrderPdfData, top: number) {
  const totalsW = 224;

  /* — totals card (right, primary RTL column) — */
  const tl = RIGHT - totalsW;
  box(page, { left: tl, top, w: totalsW, h: SUMMARY_H, radius: 14, fill: c.white });
  box(page, { left: tl, top, w: totalsW, h: SUMMARY_H, radius: 14, stroke: c.border, strokeWidth: 0.9 });

  const padded = tl + 16;
  const tr = tl + totalsW - 16;
  const rows: { label: string; value: string; tone?: Color }[] = [
    { label: "שורות בהזמנה", value: String(data.lines.length) },
    { label: "מוצרים מתומחרים", value: String(data.lines.length - data.totals.unpriced) },
  ];
  if (data.totals.unpriced > 0) {
    rows.push({ label: "ללא מחיר במחירון", value: String(data.totals.unpriced), tone: c.warning });
  }

  let y = top + 18;
  for (const row of rows) {
    text(page, row.label, tr, y, { size: 9, font: fonts.reg, color: row.tone ?? c.text2, maxWidth: 120 });
    text(page, row.value, padded, y, {
      size: 9.6,
      font: fonts.bold,
      color: row.tone ?? c.text,
      align: "left",
      maxWidth: 90,
    });
    y += 19;
  }

  const bandTop = top + SUMMARY_H - 16 - 52;
  hairline(page, padded, bandTop - 12, totalsW - 32, c.hair);
  box(page, { left: padded, top: bandTop, w: totalsW - 32, h: 52, radius: 12, fill: c.ink });
  text(page, "סה״כ ההזמנה", tr - 6, bandTop + 11, {
    size: 8.4,
    font: fonts.med,
    color: c.white,
    opacity: 0.62,
    tracking: 0.9,
  });
  text(page, data.totals.sum, tr - 6, bandTop + 25, {
    size: 19,
    font: fonts.bold,
    color: c.white,
    maxWidth: totalsW - 48,
  });
}

/* ---- footer ------------------------------------------------------- */

function drawFooter(page: Page, fonts: Fonts, c: Palette, data: OrderPdfData, index: number, count: number) {
  const top = PAGE_H - 46;
  hairline(page, MARGIN, top, CONTENT_W, c.hair);
  text(page, `${data.businessName} · הופק ב־${data.generatedAt}`, RIGHT, top + 12, {
    size: 7.6,
    font: fonts.reg,
    color: c.text3,
    maxWidth: 340,
  });
  text(page, `עמוד ${index} מתוך ${count}`, MARGIN, top + 12, {
    size: 7.6,
    font: fonts.med,
    color: c.text3,
    align: "left",
  });
}

/* ------------------------------------------------------------------ */

/** ₪1,240.50 — decimals only when they carry information. */
export function formatShekel(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const body = Number.isInteger(rounded)
    ? rounded.toLocaleString("en-US")
    : rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `₪${body}`;
}
