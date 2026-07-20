import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compressImage } from "@/lib/compressImage";
import { compressVideo } from "@/lib/compressVideo";
import { isVideoFile } from "@/lib/media";
import { supabase } from "@/lib/supabase";
import type { Fault, FaultStatus } from "@/types/database";

export function useFaults(businessId: string | null, options?: { poll?: boolean }) {
  return useQuery({
    queryKey: ["faults", businessId],
    enabled: !!businessId,
    refetchInterval: options?.poll ? 30_000 : false,
    queryFn: async (): Promise<Fault[]> => {
      const { data, error } = await supabase
        .from("faults")
        .select(
          `
          *,
          reporter:reported_by(full_name),
          status_updater:status_updated_by(full_name)
        `,
        )
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Fault[];
    },
  });
}

/** Upload fault media (images compressed to JPEG; videos re-encoded when possible). */
export async function uploadFaultMedia(businessId: string, file: File): Promise<string> {
  const isVideo = isVideoFile(file);
  let body: File;
  let ext: string;
  let contentType: string;

  if (isVideo) {
    body = await compressVideo(file);
    ext = (body.name.match(/\.([a-z0-9]+)$/i)?.[1] || "webm").toLowerCase();
    contentType = body.type || "video/webm";
  } else {
    body = await compressImage(file);
    ext = "jpg";
    contentType = "image/jpeg";
  }

  const path = `${businessId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("faults").upload(path, body, {
    upsert: false,
    contentType,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("faults").getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadFaultPhotos(businessId: string, files: File[]): Promise<string[]> {
  return Promise.all(files.map((file) => uploadFaultMedia(businessId, file)));
}

/**
 * Best-effort "new fault" email to maintenance users (via send-fault-email).
 * Never throws — a failed notification must not break fault creation.
 */
export async function notifyFaultCreated(faultId: string): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke("send-fault-email", {
      body: { fault_id: faultId },
    });
    if (error) {
      console.warn("[notifyFaultCreated] invoke failed", error.message, data);
      return;
    }
    if (data && typeof data === "object" && "error" in data) {
      console.warn("[notifyFaultCreated] function error", data);
    }
  } catch (e) {
    console.warn("[notifyFaultCreated] unexpected", e);
  }
}

export function useCreateFault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      description: string;
      photo_urls?: string[];
      reported_by?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("faults")
        .insert({
          ...input,
          photo_urls: input.photo_urls ?? [],
        })
        .select("id")
        .single();
      if (error) throw error;
      // Await so the request isn't cancelled if the modal closes immediately.
      if (data?.id) await notifyFaultCreated(data.id);
      return data;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["faults", v.business_id] }),
  });
}

export function useUpdateFault(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status?: FaultStatus;
      statusUpdatedBy?: string | null;
      assigned_to?: string | null;
      description?: string;
      photo_urls?: string[];
    }) => {
      const { id, statusUpdatedBy, ...rest } = input;
      const patch: {
        status?: FaultStatus;
        assigned_to?: string | null;
        description?: string;
        photo_urls?: string[];
        status_updated_by?: string | null;
        status_updated_at?: string;
      } = { ...rest };
      if (rest.status !== undefined) {
        patch.status_updated_by = statusUpdatedBy ?? null;
        patch.status_updated_at = new Date().toISOString();
      }
      const { error } = await supabase.from("faults").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faults", businessId] }),
  });
}

export function useDeleteFault(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("faults").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faults", businessId] }),
  });
}
