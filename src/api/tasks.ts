import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { compressImage } from "@/lib/compressImage";
import { todayISO } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { normalizeRecurrenceWeekdays } from "@/lib/taskRecurrence";
import { oneTimeTaskNeedsDueDateRollover } from "@/lib/todayTasks";
import type { Task, TaskApproval, TaskStatus, TaskType } from "@/types/database";

function normalizeTask(row: Task): Task {
  return {
    ...row,
    recurrence_weekday: normalizeRecurrenceWeekdays(row.recurrence_weekday as number[] | number | null),
  };
}

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
      const rows = ((data ?? []) as Task[]).map(normalizeTask);
      const today = todayISO();
      const rollIds = rows.filter((t) => oneTimeTaskNeedsDueDateRollover(t, today)).map((t) => t.id);
      if (rollIds.length) {
        const { error: rollError } = await supabase.from("tasks").update({ due_date: today }).in("id", rollIds);
        if (rollError) throw rollError;
      }
      return rows.map((t) =>
        rollIds.includes(t.id) ? { ...t, due_date: today } : t,
      );
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
      event_id?: string | null;
      assigned_to?: string | null;
      assigned_by?: string | null;
      due_date?: string | null;
      recurrence_weekday?: number[] | null;
      approval_status?: TaskApproval | null;
      status?: TaskStatus;
      completed_at?: string | null;
      photo_url?: string | null;
      media_urls?: string[];
      last_documented_by?: string | null;
      last_documented_at?: string | null;
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
    mutationFn: async (input: {
      id: string;
      status?: TaskStatus;
      completed_at?: string | null;
      photo_url?: string | null;
      media_urls?: string[];
      approval_status?: TaskApproval | null;
      last_documented_by?: string | null;
      last_documented_at?: string | null;
    }) => {
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

/** Tasks assigned to a specific event. */
export function useEventTasks(businessId: string | null, eventId: string | null | undefined) {
  const { data: tasks = [], ...rest } = useTasks(businessId);
  const eventTasks = eventId ? tasks.filter((t) => t.event_id === eventId) : [];
  return { data: eventTasks, allTasks: tasks, ...rest };
}

/** Status/media updates for tasks assigned to the current user on a specific event. */
export function useAssignedEventTaskActions(
  businessId: string,
  eventId: string,
  profileId: string,
) {
  const { data: tasks = [], isLoading } = useTasks(businessId);
  const update = useUpdateTask(businessId);
  const [overrides, setOverrides] = useState<
    Record<
      string,
      Partial<
        Pick<Task, "status" | "completed_at" | "media_urls" | "last_documented_by" | "last_documented_at">
      >
    >
  >({});

  const assignedEventTasks = useMemo(() => {
    return tasks
      .filter(
        (t) =>
          t.event_id === eventId &&
          t.assigned_to === profileId &&
          t.approval_status !== "pending",
      )
      .map((t) => {
        const patch = overrides[t.id];
        return patch ? { ...t, ...patch } : t;
      })
      .sort((a, b) => {
        if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
        return a.created_at.localeCompare(b.created_at);
      });
  }, [tasks, eventId, profileId, overrides]);

  useEffect(() => {
    setOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(prev)) {
        const server = tasks.find((t) => t.id === id);
        const patch = prev[id];
        if (!server || !patch) continue;
        const statusOk = patch.status == null || server.status === patch.status;
        const mediaOk =
          patch.media_urls == null ||
          JSON.stringify(server.media_urls ?? []) === JSON.stringify(patch.media_urls);
        const docOk =
          patch.last_documented_by == null || server.last_documented_by === patch.last_documented_by;
        if (statusOk && mediaOk && docOk) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tasks]);

  function documentedPatch(): Pick<Task, "last_documented_by" | "last_documented_at"> {
    return {
      last_documented_by: profileId,
      last_documented_at: new Date().toISOString(),
    };
  }

  function setStatus(id: string, status: TaskStatus) {
    const completed_at = status === "done" ? new Date().toISOString() : null;
    const patch = { status, completed_at, ...documentedPatch() };
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    update.mutate({ id, ...patch });
  }

  function setMedia(id: string, media_urls: string[]) {
    const patch = { media_urls, ...documentedPatch() };
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    update.mutate({ id, ...patch });
  }

  return { tasks: assignedEventTasks, setStatus, setMedia, isLoading };
}
