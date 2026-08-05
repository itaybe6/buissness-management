import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PDFDocument } from "pdf-lib";
import { compressImage } from "@/lib/compressImage";
import { supabase } from "@/lib/supabase";
import { receiptMonth } from "@/lib/supplierSpend";
import type { OfficeReceipt, ReceiptType } from "@/types/database";

/** Merge several photos into one multi-page PDF (one page per image). */
export async function imagesToPdfFile(files: File[]): Promise<File> {
  const pdf = await PDFDocument.create();
  for (const file of files) {
    const compressed = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.85 });
    const bytes = new Uint8Array(await compressed.arrayBuffer());
    const jpg = await pdf.embedJpg(bytes);
    const page = pdf.addPage([jpg.width, jpg.height]);
    page.drawImage(jpg, { x: 0, y: 0, width: jpg.width, height: jpg.height });
  }
  const out = await pdf.save();
  return new File([out], `receipt-${Date.now()}.pdf`, { type: "application/pdf", lastModified: Date.now() });
}

/**
 * All office receipts of the business, newest first.
 *
 * One shared fetch backs both the month list and the supplier trend analysis,
 * so switching months or suppliers never triggers another round-trip.
 */
function receiptsQuery(businessId: string | null) {
  return {
    queryKey: ["office_receipts", businessId, "all"] as const,
    enabled: !!businessId,
    queryFn: async (): Promise<OfficeReceipt[]> => {
      const { data, error } = await supabase
        .from("office_receipts")
        .select("*")
        .eq("business_id", businessId!)
        .order("created_at", { ascending: false })
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as OfficeReceipt[];
    },
  };
}

/** Every receipt the business has — used for the per-supplier monthly trends. */
export function useAllOfficeReceipts(businessId: string | null) {
  return useQuery(receiptsQuery(businessId));
}

/** Office receipts within a month (yyyy-mm), newest first. */
export function useOfficeReceipts(businessId: string | null, monthISO: string) {
  return useQuery({
    ...receiptsQuery(businessId),
    select: (rows: OfficeReceipt[]) => rows.filter((r) => receiptMonth(r) === monthISO),
  });
}

/** Upload receipt file (image compressed, PDF kept as-is). Reuses the invoices bucket. */
export async function uploadReceiptFile(businessId: string, file: File): Promise<string> {
  const isImage = file.type.startsWith("image/");
  const payload = isImage ? await compressImage(file) : file;
  const ext = isImage ? "jpg" : (file.name.split(".").pop() || "bin");
  const path = `${businessId}/receipts/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("invoices").upload(path, payload, {
    upsert: false,
    contentType: payload.type || "application/octet-stream",
  });
  if (error) throw error;
  const { data } = supabase.storage.from("invoices").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Upload one or more receipt files. Multiple images are merged into a single PDF
 * so the receipt row still stores one `file_url`.
 */
export async function uploadReceiptFiles(businessId: string, files: File[]): Promise<string> {
  if (files.length === 0) throw new Error("אין קובץ להעלאה");
  if (files.length === 1) return uploadReceiptFile(businessId, files[0]);
  if (!files.every((f) => f.type.startsWith("image/"))) {
    throw new Error("ניתן לשלב רק תמונות למסמך אחד");
  }
  const pdf = await imagesToPdfFile(files);
  return uploadReceiptFile(businessId, pdf);
}

export interface CreateOfficeReceiptInput {
  business_id: string;
  type: ReceiptType;
  amount: number;
  vendor_name: string;
  vendor_details?: string | null;
  supplier_id?: string | null;
  document_date?: string | null;
  file_url: string;
  notes?: string | null;
  created_by: string;
}

export function useCreateOfficeReceipt(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOfficeReceiptInput) => {
      const { data, error } = await supabase.from("office_receipts").insert(input).select().single();
      if (error) throw error;
      return data as OfficeReceipt;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["office_receipts", businessId] }),
  });
}

export function useDeleteOfficeReceipt(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("office_receipts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["office_receipts", businessId] }),
  });
}
