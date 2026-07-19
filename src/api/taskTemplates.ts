import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { normalizeRecurrenceWeekdays } from "@/lib/taskRecurrence";
import type { TaskTemplate } from "@/types/database";

function recurrenceDbError(error: { message?: string }): Error {
  const msg = error.message ?? "";
  if (
    msg.includes("recurrence_weekday") ||
    msg.includes("malformed array") ||
    msg.includes("smallint[]") ||
    msg.includes('invalid input syntax for type smallint')
  ) {
    return new Error(
      "לא ניתן לשמור בחירת ימים מרובה — יש לעדכן את מסד הנתונים. פנו למנהל המערכת להריץ את המיגרציה task_recurrence_multi_day.",
    );
  }
  return new Error(msg || "שמירת המשימה נכשלה");
}

function normalizeTemplate(row: TaskTemplate): TaskTemplate {
  return {
    ...row,
    recurrence_weekday: normalizeRecurrenceWeekdays(row.recurrence_weekday as number[] | number | null),
  };
}

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
      return ((data ?? []) as TaskTemplate[]).map(normalizeTemplate);
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
      return ((data ?? []) as TaskTemplate[]).map(normalizeTemplate);
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
      recurrence_weekday?: number[] | null;
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
      recurrence_weekday?: number[] | null;
      active?: boolean;
      sort_order?: number;
    }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("task_templates").update(rest).eq("id", id);
      if (error) throw recurrenceDbError(error);
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
