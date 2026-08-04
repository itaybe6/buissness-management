import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SalaryIssue, SalaryIssueStatus } from "@/types/database";

export function useSalaryIssues(
  businessId: string | null,
  options?: { poll?: boolean; employeeId?: string | null },
) {
  return useQuery({
    queryKey: ["salary_issues", businessId, options?.employeeId ?? "all"],
    enabled: !!businessId,
    refetchInterval: options?.poll ? 30_000 : false,
    queryFn: async (): Promise<SalaryIssue[]> => {
      let query = supabase
        .from("salary_issues")
        .select(
          `
          *,
          employee:employee_id(full_name, avatar_url),
          status_updater:status_updated_by(full_name)
        `,
        )
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });

      if (options?.employeeId) {
        query = query.eq("employee_id", options.employeeId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SalaryIssue[];
    },
  });
}

export function useCreateSalaryIssue(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { category: string; description: string }) => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId || !businessId) throw new Error("לא מחובר");

      const { data, error } = await supabase
        .from("salary_issues")
        .insert({
          business_id: businessId,
          employee_id: userId,
          category: input.category,
          description: input.description.trim(),
        })
        .select()
        .single();

      if (error) throw error;
      return data as SalaryIssue;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salary_issues", businessId] });
    },
  });
}

export function useUpdateSalaryIssueStatus(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: SalaryIssueStatus }) => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) throw new Error("לא מחובר");

      const { data, error } = await supabase
        .from("salary_issues")
        .update({
          status: input.status,
          status_updated_by: userId,
          status_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .select()
        .single();

      if (error) throw error;
      return data as SalaryIssue;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salary_issues", businessId] });
    },
  });
}
