import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Form101 } from "@/types/database";

export function useForm101(businessId: string | null, employeeId: string | undefined, taxYear: number) {
  return useQuery({
    queryKey: ["form101", businessId, employeeId, taxYear],
    enabled: !!businessId && !!employeeId,
    queryFn: async (): Promise<Form101 | null> => {
      const { data, error } = await supabase
        .from("form_101")
        .select("*")
        .eq("employee_id", employeeId)
        .eq("tax_year", taxYear)
        .maybeSingle();
      if (error) throw error;
      return (data as Form101) ?? null;
    },
  });
}

export function useSaveForm101(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      employee_id: string;
      tax_year: number;
      data: Record<string, unknown>;
      submitted: boolean;
    }) => {
      const { error } = await supabase.from("form_101").upsert(
        {
          ...input,
          submitted_at: input.submitted ? new Date().toISOString() : null,
        },
        { onConflict: "employee_id,tax_year" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form101", businessId] }),
  });
}
