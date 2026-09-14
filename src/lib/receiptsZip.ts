import { zip, type Zippable } from "fflate";
import { PDFDocument } from "pdf-lib";
import { compressImage } from "@/lib/compressImage";
import { supabase } from "@/lib/supabase";
import type { OfficeReceipt, ReceiptType } from "@/types/database";

const BUCKET = "invoices";

const TYPE_FILE_LABEL: Record<ReceiptType, string> = {
  tax_invoice: "חשבונית-מס",
  tax_invoice_receipt: "חשבונית-מס-קבלה",
  receipt: "קבלה",
};

/** Extract the object path from a Supabase public storage URL, or null if it's foreign. */
function storagePathFromUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const rest = url.slice(idx + marker.length).split("?")[0];
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

const KNOWN_EXTS = new Set(["pdf", "jpg", "jpeg", "png", "webp", "gif", "heic", "heif"]);

function extFromUrl(url: string): string | null {
  const clean = url.split("?")[0];
  const m = /\.([a-z0-9]{2,5})$/i.exec(clean);
  const ext = m?.[1].toLowerCase();
  return ext && KNOWN_EXTS.has(ext) ? (ext === "jpeg" ? "jpg" : ext) : null;
}

const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

function extFromMime(mime: string | null | undefined): string | null {
  if (!mime) return null;
  const clean = mime.split(";")[0].trim().toLowerCase();
  return MIME_EXT[clean] ?? null;
}

/** Detect the real file type from its leading bytes (magic numbers). */
function extFromBytes(b: Uint8Array): string | null {
  if (b.length < 12) return null;
  // %PDF
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf";
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  // GIF8
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "gif";
  // RIFF....WEBP
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return "webp";
  // ISO BMFF "ftyp" with heic/heif brands
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
    if (brand.startsWith("hei") || brand.startsWith("mif")) return "heic";
  }
  return null;
}

/** Best-effort extension: real bytes first, then server MIME, then URL, then PDF (receipts default). */
function resolveExt(bytes: Uint8Array, mime: string | null, url: string): string {
  return extFromBytes(bytes) ?? extFromMime(mime) ?? extFromUrl(url) ?? "pdf";
}

/** Wrap a single image into a one-page PDF sized to the image. */
async function imageToPdf(bytes: Uint8Array, ext: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  let embedded;
  if (ext === "jpg") {
    embedded = await pdf.embedJpg(bytes);
  } else if (ext === "png") {
    embedded = await pdf.embedPng(bytes);
  } else {
    // webp / gif / heic etc. — re-encode via canvas to JPEG (no downscale beyond 4000px)
    const file = new File([bytes as unknown as BlobPart], `receipt.${ext}`, { type: MIME_FOR_EXT[ext] ?? "image/*" });
    const jpg = await compressImage(file, { maxWidth: 4000, maxHeight: 4000, quality: 0.9 });
    embedded = await pdf.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
  }
  const page = pdf.addPage([embedded.width, embedded.height]);
  page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  return pdf.save();
}

const MIME_FOR_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_EXT).map(([mime, ext]) => [ext, mime])
);

/**
 * Normalise any receipt file to PDF bytes. PDFs pass through untouched;
 * images become a single-page PDF. Returns null if conversion is impossible.
 */
async function toPdfBytes(bytes: Uint8Array, ext: string): Promise<Uint8Array | null> {
  if (ext === "pdf") return bytes;
  try {
    return await imageToPdf(bytes, ext);
  } catch {
    // e.g. corrupt PNG — try the canvas route as a last resort
    try {
      const file = new File([bytes as unknown as BlobPart], `receipt.${ext}`, { type: MIME_FOR_EXT[ext] ?? "image/*" });
      const jpg = await compressImage(file, { maxWidth: 4000, maxHeight: 4000, quality: 0.9 });
      return await imageToPdf(new Uint8Array(await jpg.arrayBuffer()), "jpg");
    } catch {
      return null;
    }
  }
}

/** Strip characters that are invalid in file names (Windows + POSIX) and collapse whitespace. */
function safeName(s: string): string {
  return s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

interface FetchedFile {
  bytes: Uint8Array;
  mime: string | null;
}

/** Download the raw bytes of a receipt file. Prefers the authenticated storage client. */
async function fetchReceiptBytes(url: string): Promise<FetchedFile> {
  const path = storagePathFromUrl(url);
  if (path) {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (!error && data) return { bytes: new Uint8Array(await data.arrayBuffer()), mime: data.type || null };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime: res.headers.get("content-type") };
}

function fileNameFor(r: OfficeReceipt, ext: string): string {
  const date = r.document_date ?? r.created_at?.slice(0, 10) ?? "ללא-תאריך";
  const amount = Number(r.amount).toFixed(2).replace(/\.00$/, "");
  const base = safeName(`${date} ${TYPE_FILE_LABEL[r.type]} ${r.vendor_name} ${amount}₪`);
  return `${base}.${ext}`;
}

export interface ZipProgress {
  done: number;
  total: number;
}

export interface ZipResult {
  blob: Blob;
  included: number;
  failed: OfficeReceipt[];
}

/**
 * Bundle all files of the given receipts into a single ZIP, every entry as PDF
 * (images are wrapped into a one-page PDF). Files that fail to download or
 * convert are skipped and reported in `failed`.
 */
export async function buildReceiptsZip(
  receipts: OfficeReceipt[],
  onProgress?: (p: ZipProgress) => void
): Promise<ZipResult> {
  const entries: Zippable = {};
  const usedNames = new Set<string>();
  const failed: OfficeReceipt[] = [];
  let done = 0;
  const total = receipts.length;

  onProgress?.({ done, total });

  // Small concurrency pool so a month with many receipts doesn't open dozens of sockets at once.
  const CONCURRENCY = 4;
  const queue = [...receipts];

  async function worker() {
    while (queue.length > 0) {
      const r = queue.shift()!;
      try {
        const { bytes: raw, mime } = await fetchReceiptBytes(r.file_url);
        const bytes = await toPdfBytes(raw, resolveExt(raw, mime, r.file_url));
        if (!bytes) throw new Error("conversion failed");
        let name = fileNameFor(r, "pdf");
        if (usedNames.has(name)) {
          const dot = name.lastIndexOf(".");
          const stem = dot > 0 ? name.slice(0, dot) : name;
          const ext = dot > 0 ? name.slice(dot) : "";
          let n = 2;
          while (usedNames.has(`${stem} (${n})${ext}`)) n++;
          name = `${stem} (${n})${ext}`;
        }
        usedNames.add(name);
        // Level 0: PDFs/JPGs are already compressed; store as-is for speed.
        entries[name] = [bytes, { level: 0 }];
      } catch {
        failed.push(r);
      } finally {
        done++;
        onProgress?.({ done, total });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));

  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    zip(entries, (err, data) => (err ? reject(err) : resolve(data)));
  });

  return {
    blob: new Blob([zipped as unknown as BlobPart], { type: "application/zip" }),
    included: Object.keys(entries).length,
    failed,
  };
}

/** Trigger a browser download for a Blob. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
