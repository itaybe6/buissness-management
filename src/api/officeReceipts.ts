import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compressImage } from "@/lib/compressImage";
import { supabase } from "@/lib/supabase";
import type { OfficeReceipt, ReceiptType } from "@/types/database";

/** Office receipts within a month (yyyy-mm), newest first. */
export function useOfficeReceipts(businessId: string | null, monthISO: string) {
  return useQuery({
    queryKey: ["office_receipts", businessId, monthISO],
    enabled: !!businessId,
    queryFn: async (): Promise<OfficeReceipt[]> => {
      const start = `${monthISO}-01`;
      const d = new Date(start);
      d.setMonth(d.getMonth() + 1);
      const end = d.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("office_receipts")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as OfficeReceipt[]).filter((r) => {
        const effective = r.document_date ?? r.created_at.slice(0, 10);
        return effective >= start && effective < end;
      });
    },
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

export interface CreateOfficeReceiptInput {
  business_id: string;
  type: ReceiptType;
  amount: number;
  vendor_name: string;
  vendor_details?: string | null;
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
