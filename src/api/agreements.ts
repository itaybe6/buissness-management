import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { AgreementSignature, AgreementTemplate, AgreementType } from "@/types/database";

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
      return (data ?? []) as AgreementTemplate[];
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

export function useCreateAgreement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      type: AgreementType;
      title: string;
      content: string;
      created_by?: string | null;
    }) => {
      const { error } = await supabase.from("agreement_templates").insert(input);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["agreements", v.business_id] }),
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
    }) => {
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
