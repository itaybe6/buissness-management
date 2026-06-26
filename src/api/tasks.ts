import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Task, TaskStatus, TaskType } from "@/types/database";

export function useTasks(businessId: string | null) {
  return useQuery({
    queryKey: ["tasks", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      title: string;
      description?: string | null;
      type: TaskType;
      template_id?: string | null;
      assigned_to?: string | null;
      assigned_by?: string | null;
      due_date?: string | null;
      recurrence_weekday?: number | null;
    }) => {
      const { error } = await supabase.from("tasks").insert(input);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["tasks", v.business_id] }),
  });
}

export function useUpdateTask(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status?: TaskStatus; completed_at?: string | null }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("tasks").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", businessId] }),
  });
}

export function useDeleteTask(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", businessId] }),
  });
}
