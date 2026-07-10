import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compressImage } from "@/lib/compressImage";
import { supabase } from "@/lib/supabase";
import type { Task, TaskApproval, TaskStatus, TaskType } from "@/types/database";

/** Upload a single task media file (image is compressed to JPEG; video uploaded as-is). */
export async function uploadTaskMedia(businessId: string, file: File): Promise<string> {
  const isVideo = file.type.startsWith("video/");
  let body: File = file;
  let ext = "jpg";
  let contentType = "image/jpeg";

  if (isVideo) {
    ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || "mp4").toLowerCase();
    contentType = file.type || "video/mp4";
  } else {
    body = await compressImage(file);
  }

  const path = `${businessId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("tasks").upload(path, body, {
    upsert: false,
    contentType,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("tasks").getPublicUrl(path);
  return data.publicUrl;
}

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
      approval_status?: TaskApproval | null;
      status?: TaskStatus;
      completed_at?: string | null;
      photo_url?: string | null;
      media_urls?: string[];
    }): Promise<string> => {
      const { data, error } = await supabase.from("tasks").insert(input).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["tasks", v.business_id] }),
  });
}

/**
 * Best-effort "new task" email to the assignee (via the send-task-email edge function).
 * Never throws — a failed notification must not break task creation/approval.
 */
export async function notifyTaskAssigned(taskId: string): Promise<void> {
  try {
    await supabase.functions.invoke("send-task-email", { body: { task_id: taskId } });
  } catch {
    // swallow — notification is non-critical
  }
}

export function useUpdateTask(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status?: TaskStatus; completed_at?: string | null; photo_url?: string | null; media_urls?: string[]; approval_status?: TaskApproval | null }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("tasks").update(rest).eq("id", id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      if (!businessId) return;
      await qc.cancelQueries({ queryKey: ["tasks", businessId] });
      const prev = qc.getQueryData<Task[]>(["tasks", businessId]);
      if (prev) {
        const { id, ...rest } = input;
        qc.setQueryData<Task[]>(
          ["tasks", businessId],
          prev.map((t) => (t.id === id ? { ...t, ...rest, updated_at: new Date().toISOString() } : t)),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (businessId && ctx?.prev) qc.setQueryData(["tasks", businessId], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks", businessId] }),
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
