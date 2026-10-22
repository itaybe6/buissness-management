import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compressImage } from "@/lib/compressImage";
import { compressPdf } from "@/lib/compressPdf";
import { supabase } from "@/lib/supabase";
import type { AgreementSignature, AgreementTemplate, AgreementType, SignatureField } from "@/types/database";

export function useAgreements(businessId: string | null) {
  return useQuery({
    queryKey: ["agreements", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<AgreementTemplate[]> => {
      const { data, error } = await supabase
        .from("agreement_templates")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as AgreementTemplate[];
      return rows.filter((t) => !(t.type === "form_101" && t.employee_id));
    },
  });
}

export function useSignatures(businessId: string | null, employeeId?: string) {
  return useQuery({
    queryKey: ["agreement_signatures", businessId, employeeId ?? "all"],
    enabled: !!businessId,
    queryFn: async (): Promise<AgreementSignature[]> => {
      let q = supabase.from("agreement_signatures").select("*").eq("business_id", businessId);
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AgreementSignature[];
    },
  });
}

/** Upload an agreement file. Photos and PDFs are compressed before they are stored. */
export async function uploadAgreementFile(businessId: string, file: File): Promise<string> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (file.type.startsWith("image/")) {
    const compressed = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.85 });
    return uploadAgreementBlob(businessId, compressed, "jpg", compressed.type || "image/jpeg");
  }
  if (isPdf) {
    const compressed = await compressPdf(file);
    return uploadAgreementBlob(businessId, compressed, "pdf", "application/pdf");
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
  return uploadAgreementBlob(businessId, file, ext, file.type || "application/octet-stream");
}

/** Path inside the agreements bucket, or null when the URL is not one of our uploads. */
export function agreementStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/agreements/";
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = decodeURIComponent(url.slice(i + marker.length).split("?")[0] ?? "");
  return path || null;
}

async function removeStoredAgreementFile(url: string | null | undefined) {
  const path = agreementStoragePath(url);
  if (!path) return;
  await supabase.storage.from("agreements").remove([path]);
}

/** Best-effort delete of a previous upload. Never throws. */
export async function discardAgreementFile(url: string | null | undefined) {
  try {
    await removeStoredAgreementFile(url);
  } catch {
    // A leftover file must not block replacing the document.
  }
}

/** Upload an arbitrary blob (e.g. a flattened signed PDF) to the agreements bucket. */
export async function uploadAgreementBlob(
  businessId: string,
  blob: Blob,
  ext = "pdf",
  contentType = "application/pdf"
): Promise<string> {
  const path = `${businessId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("agreements").upload(path, blob, {
    upsert: false,
    contentType,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("agreements").getPublicUrl(path);
  return data.publicUrl;
}

export type CreateAgreementInput = {
  business_id: string;
  type: AgreementType;
  title: string;
  content: string;
  file_url?: string | null;
  signature_fields?: SignatureField[];
  employee_id?: string | null;
  created_by?: string | null;
};

/**
 * Persist a new agreement template. Always an INSERT — an employee may hold
 * several agreements at once, so a new one must never replace an existing row.
 */
export async function createAgreementTemplate(input: CreateAgreementInput): Promise<void> {
  if (input.type === "form_101" && input.employee_id) {
    throw new Error("טופס 101 חייב להיות מסמך גלובלי אחד לכל העסק");
  }
  const { error } = await supabase.from("agreement_templates").insert(input);
  if (error) throw error;
}

export function useCreateAgreement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAgreementTemplate,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["agreements", v.business_id] }),
  });
}

export function useUpdateAgreement(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      title?: string;
      type?: AgreementType;
      content?: string;
      file_url?: string | null;
      signature_fields?: SignatureField[];
      employee_id?: string | null;
    }) => {
      const { id, ...rest } = input;
      if (rest.type === "form_101" && rest.employee_id) {
        throw new Error("טופס 101 חייב להיות מסמך גלובלי אחד לכל העסק");
      }
      const { error } = await supabase.from("agreement_templates").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agreements", businessId] });
    },
  });
}

export function useDeleteAgreement(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agreement_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agreements", businessId] });
      qc.invalidateQueries({ queryKey: ["agreement_signatures", businessId] });
    },
  });
}

export function useSignAgreement(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      agreement_id: string;
      employee_id: string;
      signature_data: string;
      field_signatures?: Record<string, string>;
      signed_file_url?: string | null;
    }) => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user || authData.user.id !== input.employee_id) {
        throw new Error("אין הרשאה לחתום על מסמך של עובד אחר");
      }
      const { error } = await supabase.from("agreement_signatures").upsert(
        {
          ...input,
          agreed: true,
          signed_at: new Date().toISOString(),
        },
        { onConflict: "agreement_id,employee_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agreement_signatures", businessId] }),
  });
}

/** Employee removes their own uploaded signed copy so they can send a different file. */
export function useDeleteSignature(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { agreement_id: string; employee_id: string; signed_file_url?: string | null }) => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user || authData.user.id !== input.employee_id) {
        throw new Error("אין הרשאה למחוק מסמך של עובד אחר");
      }
      const { error } = await supabase
        .from("agreement_signatures")
        .delete()
        .eq("agreement_id", input.agreement_id)
        .eq("employee_id", input.employee_id);
      if (error) throw error;
      try {
        await removeStoredAgreementFile(input.signed_file_url);
      } catch {
        // The signature row is already gone. A leftover file must not block the employee.
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agreement_signatures", businessId] }),
  });
}

/** Global blank Form 101 template (same PDF for all employees). */
export function globalForm101Template(templates: AgreementTemplate[]): AgreementTemplate | undefined {
  return templates.find((t) => t.type === "form_101" && !t.employee_id);
}

/**
 * The employee downloads the file, signs it on paper, and uploads the signed copy.
 * Form 101 always works this way. A global work contract does too when it has a
 * file but no signature boxes placed on it.
 */
export function usesSignedFileUpload(template: AgreementTemplate): boolean {
  if (template.type === "form_101") return true;
  return (
    template.type === "work" &&
    !template.employee_id &&
    !!template.file_url &&
    (template.signature_fields?.length ?? 0) === 0
  );
}

/** Agreements applicable to a specific employee (global + personal). */
export function agreementsForEmployee(
  templates: AgreementTemplate[],
  employeeId: string
): AgreementTemplate[] {
  const global101 = globalForm101Template(templates);
  return templates.filter((t) => {
    // Only one Form 101 per employee — the global template wins over personal
    // copies and over any duplicate global rows created by older versions.
    if (global101 && t.type === "form_101" && t.id !== global101.id) return false;
    return !t.employee_id || t.employee_id === employeeId;
  });
}

/** Fixed (global) templates — same for all employees. */
export function globalAgreements(templates: AgreementTemplate[]): AgreementTemplate[] {
  return templates.filter((t) => !t.employee_id);
}

/** Dynamic per-employee templates. */
export function personalAgreements(templates: AgreementTemplate[]): AgreementTemplate[] {
  return templates.filter((t) => !!t.employee_id);
}

export function isSigned(
  signatures: AgreementSignature[],
  agreementId: string,
  employeeId: string
): boolean {
  return signatures.some(
    (s) => s.agreement_id === agreementId && s.employee_id === employeeId && s.agreed
  );
}

export function signatureOf(
  signatures: AgreementSignature[],
  agreementId: string,
  employeeId: string
): AgreementSignature | undefined {
  return signatures.find(
    (s) => s.agreement_id === agreementId && s.employee_id === employeeId && s.agreed
  );
}

/** Form 101 is always a single global template per business. */
export function form101Template(templates: AgreementTemplate[]): AgreementTemplate | undefined {
  return globalForm101Template(templates);
}

/**
 * Best-effort email to office manager when a Form 101 PDF is signed.
 * Never throws — a failed notification must not break signing.
 */
export async function notifyForm101Signed(agreementId: string, employeeId: string): Promise<void> {
  try {
    await supabase.functions.invoke("send-form101-email", {
      body: { agreement_id: agreementId, employee_id: employeeId },
    });
  } catch {
    // swallow — notification is non-critical
  }
}
