import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument } from "pdf-lib";
import { Button, Icon, InlineLoader } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import type { SignatureField } from "@/types/database";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

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
        doc = await pdfjsLib.getDocument({ url }).promise;
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
}: {
  url: string;
  renderOverlay?: (pageIndex: number, dims: PageDims) => ReactNode;
  maxWidth?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setDoc(null);
    setNumPages(0);
    const task = pdfjsLib.getDocument({ url });
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

  const width = Math.min(containerWidth || maxWidth, maxWidth);

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-3">
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
 * Manager overlay: drag on empty space to draw a new signature box; drag an
 * existing box to move it; click × to remove. Coordinates handed to callbacks
 * are normalized (0..1) to the page size.
 */
export function FieldEditorOverlay({
  pageIndex,
  fields,
  onAdd,
  onRemove,
  onMove,
}: {
  pageIndex: number;
  fields: SignatureField[];
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
    if (draft && draft.w > 0.03 && draft.h > 0.015) {
      onAdd({ page: pageIndex, x: draft.x, y: draft.y, w: draft.w, h: draft.h });
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
      {fields.map((f) => (
        <div
          key={f.id}
          data-field={f.id}
          className="absolute cursor-move rounded-[4px] border-2 border-dashed border-accent-2 bg-accent-2/10"
          style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
        >
          <button
            type="button"
            data-handle="1"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onRemove(f.id)}
            className="absolute -right-2.5 -top-2.5 grid h-5 w-5 place-items-center rounded-full bg-danger text-white shadow"
            aria-label="הסר תיבת חתימה"
          >
            <Icon name="close" size={13} />
          </button>
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-[11px] font-bold text-accent-2">
            חתימה
          </span>
        </div>
      ))}
      {draft && (
        <div
          className="absolute rounded-[4px] border-2 border-accent-2 bg-accent-2/15"
          style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }}
        />
      )}
    </div>
  );
}

/**
 * Employee overlay: each signature box is tappable to open a signature pad;
 * once signed, the captured image is shown inside the box.
 */
export function FieldSignOverlay({
  pageIndex,
  fields,
  signatures,
  onTap,
  readonly,
}: {
  pageIndex: number;
  fields: SignatureField[];
  signatures: Record<string, string>;
  onTap?: (fieldId: string) => void;
  readonly?: boolean;
}) {
  return (
    <div className="absolute inset-0">
      {fields
        .filter((f) => f.page === pageIndex)
        .map((f) => {
          const img = signatures[f.id];
          return (
            <button
              key={f.id}
              type="button"
              disabled={readonly}
              onClick={() => onTap?.(f.id)}
              className={`absolute flex items-center justify-center rounded-[4px] border-2 ${
                img ? "border-success bg-success/5" : "border-dashed border-accent-2 bg-accent-2/10 animate-pulse"
              } ${readonly ? "cursor-default" : "cursor-pointer"}`}
              style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
            >
              {img ? (
                <img src={img} alt="חתימה" className="h-full w-full object-contain p-0.5" />
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

/** Flatten signatures onto the original PDF and return the signed PDF as a Blob. */
export async function buildSignedPdf(
  url: string,
  fields: SignatureField[],
  fieldSignatures: Record<string, string>
): Promise<Blob> {
  const bytes = await fetch(url).then((r) => r.arrayBuffer());
  const pdf = await PDFDocument.load(bytes);
  const pages = pdf.getPages();
  for (const f of fields) {
    const dataUrl = fieldSignatures[f.id];
    if (!dataUrl) continue;
    const page = pages[f.page];
    if (!page) continue;
    const { width: pw, height: ph } = page.getSize();
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
