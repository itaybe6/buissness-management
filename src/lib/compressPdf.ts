import { PDFDocument } from "pdf-lib";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.72;
const MAX_PAGES = 40;

/**
 * Rebuild a PDF as JPEG pages so a phone scan is smaller before upload.
 * If compression fails or does not shrink the file, the original is returned.
 */
export async function compressPdf(file: File): Promise<File> {
  try {
    const pdfjs = await import("pdfjs-dist");
    const workerMod = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")) as { default: string };
    pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;

    const data = new Uint8Array(await file.arrayBuffer());
    const task = pdfjs.getDocument({ data, disableFontFace: true });
    const doc = await task.promise;
    if (doc.numPages < 1 || doc.numPages > MAX_PAGES) {
      await doc.destroy();
      return file;
    }

    const out = await PDFDocument.create();
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(MAX_EDGE / Math.max(base.width, 1), MAX_EDGE / Math.max(base.height, 1), 2);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        page.cleanup();
        await doc.destroy();
        return file;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY);
      });
      page.cleanup();
      if (!blob) {
        await doc.destroy();
        return file;
      }
      const jpg = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      const pdfPage = out.addPage([jpg.width, jpg.height]);
      pdfPage.drawImage(jpg, { x: 0, y: 0, width: jpg.width, height: jpg.height });
    }
    await doc.destroy();

    const saved = await out.save();
    if (saved.byteLength >= file.size * 0.98) return file;
    const baseName = file.name.replace(/\.pdf$/i, "") || "document";
    return new File([saved as unknown as BlobPart], `${baseName}.pdf`, {
      type: "application/pdf",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
