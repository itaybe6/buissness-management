import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compressImage } from "@/lib/compressImage";
import { compressVideo } from "@/lib/compressVideo";
import { isVideoFile } from "@/lib/media";
import { supabase } from "@/lib/supabase";
import type { Fault, FaultStatus } from "@/types/database";

export function useFaults(businessId: string | null) {
  return useQuery({
    queryKey: ["faults", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<Fault[]> => {
      const { data, error } = await supabase
        .from("faults")
        .select("*")
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

export function useCreateFault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      description: string;
      photo_urls?: string[];
      reported_by?: string | null;
    }) => {
      const { error } = await supabase.from("faults").insert({
        ...input,
        photo_urls: input.photo_urls ?? [],
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["faults", v.business_id] }),
  });
}

export function useUpdateFault(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status?: FaultStatus; assigned_to?: string | null }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("faults").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faults", businessId] }),
  });
}
