import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument } from "pdf-lib";
import { Button, Icon, InlineLoader } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import type { FormFieldKind, SignatureField } from "@/types/database";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Shared getDocument options. `disableFontFace` makes pdf.js paint glyph
 * outlines directly instead of registering the PDF's embedded fonts as CSS
 * @font-face rules. Official Hebrew forms embed subsetted David/Times fonts,
 * and browsers routinely fail to load those as font-faces and substitute a
 * system font with different metrics — which renders the Hebrew garbled and
 * spaced out. Drawing the outlines is a touch slower but always correct.
 */
export const PDF_DOC_OPTIONS = { disableFontFace: true } as const;

/** Boxes with no explicit kind predate typed fields — they were all signatures. */
export const kindOf = (f: SignatureField): FormFieldKind => f.kind ?? "signature";

/** Signatures block submission; typed and ticked boxes are optional (spouse, children...). */
export const isFieldFilled = (f: SignatureField, values: Record<string, string>) =>
  kindOf(f) === "signature" ? !!values[f.id] : true;

/** Per-kind palette + wording used across the manager editor. */
const KIND_META: Record<FormFieldKind, { border: string; tint: string; text: string; name: string }> = {
  text: { border: "border-info", tint: "bg-info/10", text: "text-info", name: "טקסט" },
  signature: { border: "border-accent-2", tint: "bg-accent-2/10", text: "text-accent-2", name: "חתימה" },
  checkbox: { border: "border-warning", tint: "bg-warning/10", text: "text-warning", name: "סימון" },
};

/** Rendered (CSS pixel) size of a single PDF page. */
export interface PageDims {
  width: number;
  height: number;
}

/** Track the available width of a container element (CSS px). */
function useContainerWidth(ref: React.RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** Renders the first page of a PDF as a compact thumbnail preview. */
export function PdfFirstPagePreview({
  url,
  maxHeight = 192,
  className = "",
}: {
  url: string;
  maxHeight?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let task: pdfjsLib.RenderTask | null = null;
    let doc: pdfjsLib.PDFDocumentProxy | null = null;
    setStatus("loading");

    (async () => {
      try {
        doc = await pdfjsLib.getDocument({ url, ...PDF_DOC_OPTIONS }).promise;
        if (cancelled) return;
        const page = await doc.getPage(1);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(360 / base.width, maxHeight / base.height, 1.75);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no canvas context");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        task = page.render({ canvasContext: ctx, viewport });
        await task.promise;
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
      doc?.destroy().catch(() => {});
    };
  }, [url, maxHeight]);

  if (status === "error") {
    return (
      <div className={`grid place-items-center py-10 text-text-3 ${className}`}>
        <Icon name="picture_as_pdf" size={36} />
      </div>
    );
  }

  return (
    <div className={`relative grid place-items-center bg-surface-2 ${className}`}>
      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center bg-surface-2/90">
          <InlineLoader compact label="טוען תצוגה מקדימה..." />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`w-auto max-w-full object-contain transition-opacity ${
          status === "ready" ? "opacity-100" : "opacity-0"
        }`}
        style={{ maxHeight }}
      />
    </div>
  );
}

/**
 * Renders every page of a PDF stacked vertically. For each page, `renderOverlay`
 * is called with the page index and its rendered size so callers can position
 * signature boxes on top using normalized (0..1) coordinates.
 */
export function PdfDocViewer({
  url,
  renderOverlay,
  maxWidth = 720,
  zoomable,
}: {
  url: string;
  renderOverlay?: (pageIndex: number, dims: PageDims) => ReactNode;
  maxWidth?: number;
  /** show zoom controls — needed when small boxes must be filled on a phone */
  zoomable?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setDoc(null);
    setNumPages(0);
    const task = pdfjsLib.getDocument({ url, ...PDF_DOC_OPTIONS });
    task.promise.then(
      (d) => {
        if (cancelled) return;
        setDoc(d);
        setNumPages(d.numPages);
      },
      () => !cancelled && setError(true)
    );
    return () => {
      cancelled = true;
      task.destroy().catch(() => {});
    };
  }, [url]);

  const width = Math.min(containerWidth || maxWidth, maxWidth) * zoom;

  return (
    // outer div measures the available width; the inner column may grow past it
    // when zoomed in, letting the scroll container pan across the page
    <div ref={containerRef} className="w-full">
      {zoomable && doc && (
        <div className="sticky top-0 z-10 mb-2 ml-auto flex w-fit items-center gap-1 rounded-full border border-border bg-surface/95 px-1.5 py-1 shadow-sm backdrop-blur">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}
            disabled={zoom <= 1}
            className="grid h-7 w-7 place-items-center rounded-full text-text-2 disabled:opacity-40"
            aria-label="הקטנה"
          >
            <Icon name="zoom_out" size={18} />
          </button>
          <span className="min-w-[38px] text-center text-[12px] font-bold text-text-2">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
            disabled={zoom >= 3}
            className="grid h-7 w-7 place-items-center rounded-full text-text-2 disabled:opacity-40"
            aria-label="הגדלה"
          >
            <Icon name="zoom_in" size={18} />
          </button>
        </div>
      )}
      <div className="mx-auto flex w-fit min-w-full flex-col items-center gap-3">
        {error && (
          <div className="flex items-center gap-2 rounded-[11px] bg-danger/10 px-3 py-2.5 text-[13px] font-semibold text-danger">
            <Icon name="error" size={18} /> שגיאה בטעינת ה-PDF
          </div>
        )}
        {!doc && !error && <InlineLoader label="טוען מסמך..." />}
        {doc &&
          width > 0 &&
          Array.from({ length: numPages }).map((_, i) => (
            <PdfPage key={i} doc={doc} pageIndex={i} width={width} renderOverlay={renderOverlay} />
          ))}
      </div>
    </div>
  );
}

function PdfPage({
  doc,
  pageIndex,
  width,
  renderOverlay,
}: {
  doc: pdfjsLib.PDFDocumentProxy;
  pageIndex: number;
  width: number;
  renderOverlay?: (pageIndex: number, dims: PageDims) => ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = useState<PageDims | null>(null);

  useEffect(() => {
    let cancelled = false;
    let task: pdfjsLib.RenderTask | null = null;
    doc.getPage(pageIndex + 1).then((page) => {
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      task = page.render({ canvasContext: ctx, viewport });
      task.promise.then(
        () => !cancelled && setDims({ width: viewport.width, height: viewport.height }),
        () => {}
      );
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageIndex, width]);

  return (
    <div className="relative shadow-sm" style={{ width: dims?.width }}>
      <canvas
        ref={canvasRef}
        className="block rounded-[6px] border border-border bg-white"
        style={{ width: dims?.width, height: dims?.height }}
      />
      {dims && renderOverlay && <div className="absolute inset-0">{renderOverlay(pageIndex, dims)}</div>}
    </div>
  );
}

/**
 * Manager overlay: drag on empty space to draw a new box of the active `tool`;
 * drag an existing box to move it; click × to remove. Coordinates handed to
 * callbacks are normalized (0..1) to the page size.
 */
export function FieldEditorOverlay({
  pageIndex,
  fields,
  tool = "signature",
  onAdd,
  onRemove,
  onMove,
}: {
  pageIndex: number;
  fields: SignatureField[];
  /** which kind of box a new drag creates */
  tool?: FormFieldKind;
  onAdd: (f: Omit<SignatureField, "id">) => void;
  onRemove: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const local = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1),
      y: Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1),
    };
  };

  function down(e: React.PointerEvent) {
    const t = e.target as HTMLElement;
    if (t.dataset.handle) return; // delete button handles itself
    ref.current!.setPointerCapture(e.pointerId);
    const fieldId = t.dataset.field;
    if (fieldId && onMove) {
      const f = fields.find((x) => x.id === fieldId);
      if (f) {
        const p = local(e);
        dragging.current = { id: fieldId, dx: p.x - f.x, dy: p.y - f.y };
        return;
      }
    }
    start.current = local(e);
    setDraft({ ...start.current, w: 0, h: 0 });
  }
  function move(e: React.PointerEvent) {
    if (dragging.current) {
      const f = fields.find((x) => x.id === dragging.current!.id);
      if (!f) return;
      const p = local(e);
      const x = Math.min(Math.max(p.x - dragging.current.dx, 0), 1 - f.w);
      const y = Math.min(Math.max(p.y - dragging.current.dy, 0), 1 - f.h);
      onMove?.(dragging.current.id, x, y);
      return;
    }
    if (!start.current) return;
    const p = local(e);
    setDraft({
      x: Math.min(start.current.x, p.x),
      y: Math.min(start.current.y, p.y),
      w: Math.abs(p.x - start.current.x),
      h: Math.abs(p.y - start.current.y),
    });
  }
  function up() {
    if (dragging.current) {
      dragging.current = null;
      return;
    }
    // text boxes trace thin printed lines and checkboxes are tiny squares, so
    // both need a lower size floor than a signature box
    const minW = tool === "signature" ? 0.03 : tool === "checkbox" ? 0.008 : 0.015;
    const minH = tool === "signature" ? 0.015 : tool === "checkbox" ? 0.004 : 0.007;
    if (draft && draft.w > minW && draft.h > minH) {
      onAdd({ page: pageIndex, x: draft.x, y: draft.y, w: draft.w, h: draft.h, kind: tool });
    }
    start.current = null;
    setDraft(null);
  }

  return (
    <div
      ref={ref}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className="absolute inset-0 cursor-crosshair touch-none"
    >
      {fields.map((f) => {
        const kind = kindOf(f);
        const m = KIND_META[kind];
        return (
          <div
            key={f.id}
            data-field={f.id}
            className={`absolute cursor-move rounded-[4px] border-2 border-dashed ${m.border} ${m.tint}`}
            style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
          >
            <button
              type="button"
              data-handle="1"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onRemove(f.id)}
              className="absolute -right-2 -top-2 grid h-[18px] w-[18px] place-items-center rounded-full bg-danger text-white shadow"
              aria-label={`הסר תיבת ${m.name}`}
            >
              <Icon name="close" size={12} />
            </button>
            {kind !== "checkbox" && (
              <span className={`pointer-events-none absolute inset-0 grid place-items-center overflow-hidden text-[10px] font-bold ${m.text}`}>
                {kind === "text" ? f.label || "טקסט" : "חתימה"}
              </span>
            )}
          </div>
        );
      })}
      {draft && (
        <div
          className={`absolute rounded-[4px] border-2 ${KIND_META[tool].border} ${KIND_META[tool].tint}`}
          style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }}
        />
      )}
    </div>
  );
}

/** Share of the box height a typed value occupies — kept identical on screen and in the PDF. */
const TEXT_FILL_RATIO = 0.68;
const TEXT_COLOR = "#10214a";
const TEXT_FONT = (px: number) => `600 ${px}px "Heebo", system-ui, sans-serif`;

/**
 * Employee overlay: signature boxes are tappable to open a signature pad, and
 * text boxes are typed into directly on top of the document — no printing,
 * no scanning, no handwriting to decipher.
 */
export function FieldSignOverlay({
  pageIndex,
  fields,
  signatures,
  dims,
  onTap,
  onText,
  onToggle,
  readonly,
}: {
  pageIndex: number;
  fields: SignatureField[];
  /** field id -> PNG dataURL (signature), typed string (text), or "1" (checkbox) */
  signatures: Record<string, string>;
  /** rendered page size, used to scale typed text to the document */
  dims?: PageDims;
  onTap?: (fieldId: string) => void;
  onText?: (fieldId: string, value: string) => void;
  onToggle?: (fieldId: string, checked: boolean) => void;
  readonly?: boolean;
}) {
  return (
    <div className="absolute inset-0">
      {fields
        .filter((f) => f.page === pageIndex)
        .map((f) => {
          const value = signatures[f.id] ?? "";
          const box = {
            left: `${f.x * 100}%`,
            top: `${f.y * 100}%`,
            width: `${f.w * 100}%`,
            height: `${f.h * 100}%`,
          };

          if (kindOf(f) === "checkbox") {
            const checked = !!value;
            return (
              <button
                key={f.id}
                type="button"
                role="checkbox"
                aria-checked={checked}
                title={f.label || undefined}
                disabled={readonly}
                onClick={() => onToggle?.(f.id, !checked)}
                className={`absolute grid place-items-center rounded-[2px] border-2 transition-colors ${
                  checked
                    ? "border-success bg-success/15 text-success"
                    : readonly
                      ? "border-transparent"
                      : "border-warning/80 bg-warning/10 hover:bg-warning/20"
                } ${readonly ? "cursor-default" : "cursor-pointer"}`}
                style={box}
              >
                {checked && <Icon name="check" size={Math.max(10, (dims?.height ?? 900) * f.h * 0.9)} className="leading-none" />}
              </button>
            );
          }

          if (kindOf(f) === "text") {
            const fontSize = Math.max(7, (dims?.height ?? 900) * f.h * TEXT_FILL_RATIO);
            return (
              <input
                key={f.id}
                type="text"
                dir="auto"
                value={value}
                readOnly={readonly}
                placeholder={readonly ? "" : f.label || ""}
                onChange={(e) => onText?.(f.id, e.target.value)}
                title={f.label || undefined}
                className={`absolute rounded-[3px] border bg-white/70 px-1 text-center font-semibold outline-none transition-colors placeholder:font-normal placeholder:text-text-3/70 ${
                  readonly
                    ? "border-transparent bg-transparent"
                    : value
                      ? "border-success/60 bg-success/5"
                      : "border-dashed border-info/70 focus:border-info focus:bg-info/5"
                }`}
                style={{ ...box, fontSize, lineHeight: 1, color: TEXT_COLOR }}
              />
            );
          }

          return (
            <button
              key={f.id}
              type="button"
              disabled={readonly}
              onClick={() => onTap?.(f.id)}
              className={`absolute flex items-center justify-center rounded-[4px] border-2 ${
                value ? "border-success bg-success/5" : "border-dashed border-accent-2 bg-accent-2/10 animate-pulse"
              } ${readonly ? "cursor-default" : "cursor-pointer"}`}
              style={box}
            >
              {value ? (
                <img src={value} alt="חתימה" className="h-full w-full object-contain p-0.5" />
              ) : (
                <span className="flex items-center gap-1 px-1 text-[11px] font-bold text-accent-2">
                  <Icon name="draw" size={14} /> לחתימה
                </span>
              )}
            </button>
          );
        })}
    </div>
  );
}

/** Modal with a free-draw canvas (finger / mouse) that returns a trimmed PNG dataURL. */
export function SignaturePadModal({ onClose, onSave }: { onClose: () => void; onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.strokeStyle = "#1e1b3a";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const c = canvasRef.current!;
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  function down(e: React.PointerEvent) {
    drawing.current = true;
    const { x, y } = pos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const { x, y } = pos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  }
  const up = () => (drawing.current = false);
  function clear() {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasDrawn(false);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="חתימה דיגיטלית"
      icon="draw"
      maxWidth={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
          <Button
            className="flex-1"
            disabled={!hasDrawn}
            onClick={() => onSave(canvasRef.current!.toDataURL("image/png"))}
          >
            אישור החתימה
          </Button>
        </>
      }
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="label-text">חתמו/י בתיבה</span>
        <button onClick={clear} className="text-[12.5px] font-semibold text-link">ניקוי</button>
      </div>
      <canvas
        ref={canvasRef}
        width={760}
        height={260}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className="w-full touch-none rounded-[12px] border border-dashed border-border bg-surface"
        style={{ height: 200 }}
      />
      <p className="mt-2 text-[11.5px] text-text-3">השתמשו בעכבר במחשב או באצבע בטלפון</p>
    </Modal>
  );
}

/**
 * Rasterize typed text to a transparent PNG sized to the box. Going through
 * canvas rather than pdf-lib's text API keeps Hebrew shaping and RTL ordering
 * correct without embedding a Hebrew font in every generated document.
 */
function textToPng(text: string, boxWidthPt: number, boxHeightPt: number): string {
  const scale = 4; // supersample so the flattened text stays crisp when printed
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(boxWidthPt * scale));
  canvas.height = Math.max(1, Math.round(boxHeightPt * scale));
  const ctx = canvas.getContext("2d")!;
  const maxWidth = canvas.width * 0.94;

  let size = boxHeightPt * TEXT_FILL_RATIO * scale;
  ctx.font = TEXT_FONT(size);
  // shrink long values until they fit the box instead of overflowing the form
  for (let i = 0; i < 8; i++) {
    const w = ctx.measureText(text).width;
    if (w <= maxWidth || size <= 4) break;
    size = Math.max(4, size * Math.max(0.7, maxWidth / w));
    ctx.font = TEXT_FONT(size);
  }

  ctx.fillStyle = TEXT_COLOR;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2, maxWidth);
  return canvas.toDataURL("image/png");
}

/** Draw a check mark (✓) sized to the box as a transparent PNG. */
function checkToPng(boxWidthPt: number, boxHeightPt: number): string {
  const scale = 4;
  const w = Math.max(1, Math.round(boxWidthPt * scale));
  const h = Math.max(1, Math.round(boxHeightPt * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = TEXT_COLOR;
  ctx.lineWidth = Math.max(1.5, Math.min(w, h) * 0.13);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // a check mark inset from the box edges
  ctx.beginPath();
  ctx.moveTo(w * 0.2, h * 0.52);
  ctx.lineTo(w * 0.42, h * 0.75);
  ctx.lineTo(w * 0.82, h * 0.24);
  ctx.stroke();
  return canvas.toDataURL("image/png");
}

/** Flatten signatures, typed text and ticks onto the original PDF and return it as a Blob. */
export async function buildSignedPdf(
  url: string,
  fields: SignatureField[],
  fieldValues: Record<string, string>
): Promise<Blob> {
  const bytes = await fetch(url).then((r) => r.arrayBuffer());
  const pdf = await PDFDocument.load(bytes);
  const pages = pdf.getPages();
  for (const f of fields) {
    const value = fieldValues[f.id];
    if (!value || !value.trim()) continue;
    const page = pages[f.page];
    if (!page) continue;
    const { width: pw, height: ph } = page.getSize();
    const kind = kindOf(f);
    const dataUrl =
      kind === "text"
        ? textToPng(value.trim(), f.w * pw, f.h * ph)
        : kind === "checkbox"
          ? checkToPng(f.w * pw, f.h * ph)
          : value;
    const png = await pdf.embedPng(dataUrl);
    // pdf-lib origin is bottom-left; our coords are top-left normalized.
    page.drawImage(png, {
      x: f.x * pw,
      y: ph - (f.y + f.h) * ph,
      width: f.w * pw,
      height: f.h * ph,
    });
  }
  const out = await pdf.save();
  return new Blob([out as unknown as BlobPart], { type: "application/pdf" });
}
