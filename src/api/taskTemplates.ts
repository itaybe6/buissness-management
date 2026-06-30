import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TaskTemplate } from "@/types/database";

export function useTaskTemplates(businessId: string | null) {
  return useQuery({
    queryKey: ["task_templates", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<TaskTemplate[]> => {
      const { data, error } = await supabase
        .from("task_templates")
        .select("*")
        .eq("business_id", businessId)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as TaskTemplate[];
    },
  });
}

export function useActiveTaskTemplates(businessId: string | null) {
  return useQuery({
    queryKey: ["task_templates", businessId, "active"],
    enabled: !!businessId,
    queryFn: async (): Promise<TaskTemplate[]> => {
      const { data, error } = await supabase
        .from("task_templates")
        .select("*")
        .eq("business_id", businessId)
        .eq("active", true)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as TaskTemplate[];
    },
  });
}

export function useCreateTaskTemplate(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      title: string;
      description?: string | null;
      department_id?: string | null;
      recurrence_weekday?: number | null;
      sort_order?: number;
    }) => {
      const { error } = await supabase.from("task_templates").insert(input);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task_templates", businessId] }),
  });
}

export function useUpdateTaskTemplate(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      title?: string;
      description?: string | null;
      department_id?: string | null;
      recurrence_weekday?: number | null;
      active?: boolean;
      sort_order?: number;
    }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("task_templates").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task_templates", businessId] }),
  });
}

export function useDeleteTaskTemplate(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_templates", businessId] });
      qc.invalidateQueries({ queryKey: ["tasks", businessId] });
    },
  });
}
