import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { uploadAgreementBlob, uploadAgreementFile } from "@/api/agreements";
import { compressImage } from "@/lib/compressImage";
import { supabase } from "@/lib/supabase";
import type { EmployeeIdCard } from "@/types/database";

const QUERY_KEY = "employee_id_cards";

export function useEmployeeIdCards(businessId: string | null) {
  return useQuery({
    queryKey: [QUERY_KEY, businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<EmployeeIdCard[]> => {
      const { data, error } = await supabase
        .from("employee_id_cards")
        .select("*")
        .eq("business_id", businessId);
      if (error) throw error;
      return (data ?? []) as EmployeeIdCard[];
    },
  });
}

export function idCardByEmployee(cards: EmployeeIdCard[] | undefined, employeeId: string): EmployeeIdCard | undefined {
  return cards?.find((c) => c.employee_id === employeeId);
}

export function idCardsMap(cards: EmployeeIdCard[] | undefined): Map<string, EmployeeIdCard> {
  const m = new Map<string, EmployeeIdCard>();
  for (const c of cards ?? []) m.set(c.employee_id, c);
  return m;
}

async function uploadIdCardFile(businessId: string, employeeId: string, file: File): Promise<{ url: string; name: string }> {
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  if (!isImage && !isPdf) {
    throw new Error("יש להעלות תמונה (JPG, PNG) או PDF");
  }
  const payload = isImage ? await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.85 }) : file;
  const ext = isImage ? "jpg" : (file.name.split(".").pop()?.toLowerCase() || "pdf");
  const url = isPdf
    ? await uploadAgreementFile(businessId, file)
    : await uploadAgreementBlob(businessId, payload, ext, payload.type || "image/jpeg");
  return { url, name: file.name };
}

export function useUploadEmployeeIdCard(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employee_id: string; file: File }) => {
      if (!businessId) throw new Error("חסר מזהה עסק");
      const { url, name } = await uploadIdCardFile(businessId, input.employee_id, input.file);
      const row = {
        business_id: businessId,
        employee_id: input.employee_id,
        file_url: url,
        file_name: name,
        uploaded_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("employee_id_cards").upsert(row, {
        onConflict: "business_id,employee_id",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, businessId] });
    },
  });
}

export function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url) || url.includes("image/");
}
