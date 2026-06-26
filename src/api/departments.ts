import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Department } from "@/types/database";

export function useDepartments(businessId: string | null) {
  return useQuery({
    queryKey: ["departments", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<Department[]> => {
      const { data, error } = await supabase
        .from("departments")
        .select("*")
        .eq("business_id", businessId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Department[];
    },
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { business_id: string; name: string; color?: string; sort_order?: number }) => {
      const { error } = await supabase.from("departments").insert(input);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["departments", v.business_id] }),
  });
}

export function useUpdateDepartment(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Department> & { id: string }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("departments").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments", businessId] }),
  });
}

export function useDeleteDepartment(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments", businessId] }),
  });
}
