import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tip } from "@/types/database";

/** Tips within a month (yyyy-mm). */
export function useTips(businessId: string | null, monthISO: string) {
  return useQuery({
    queryKey: ["tips", businessId, monthISO],
    enabled: !!businessId,
    queryFn: async (): Promise<Tip[]> => {
      const start = `${monthISO}-01`;
      const d = new Date(start);
      d.setMonth(d.getMonth() + 1);
      const end = d.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("tips")
        .select("*")
        .eq("business_id", businessId)
        .gte("shift_date", start)
        .lt("shift_date", end);
      if (error) throw error;
      return (data ?? []) as Tip[];
    },
  });
}

export function useAddTip(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      employee_id: string;
      shift_date: string;
      shift_template_id?: string | null;
      amount: number;
      hours: number;
    }) => {
      const hourly_from_tips = input.hours ? input.amount / input.hours : 0;
      const { error } = await supabase.from("tips").insert({ ...input, hourly_from_tips });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tips", businessId] }),
  });
}
