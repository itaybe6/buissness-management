import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compressImage } from "@/lib/compressImage";
import { compressVideo } from "@/lib/compressVideo";
import { isVideoFile } from "@/lib/media";
import { supabase } from "@/lib/supabase";
import type { EventRecord } from "@/types/database";

export function useEvents(businessId: string | null) {
  return useQuery({
    queryKey: ["events", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<EventRecord[]> => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("business_id", businessId)
        .order("event_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EventRecord[];
    },
  });
}

export function useEvent(businessId: string | null, eventId: string | undefined) {
  return useQuery({
    queryKey: ["events", businessId, eventId],
    enabled: !!businessId && !!eventId,
    queryFn: async (): Promise<EventRecord | null> => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("business_id", businessId!)
        .eq("id", eventId!)
        .maybeSingle();
      if (error) throw error;
      return (data as EventRecord | null) ?? null;
    },
  });
}

/** Upload event media (images compressed to JPEG; videos re-encoded when possible). */
export async function uploadEventMedia(businessId: string, file: File): Promise<string> {
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
  const { error } = await supabase.storage.from("events").upload(path, body, {
    upsert: false,
    contentType,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("events").getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadEventMediaFiles(businessId: string, files: File[]): Promise<string[]> {
  return Promise.all(files.map((file) => uploadEventMedia(businessId, file)));
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      title: string;
      description?: string | null;
      event_date: string;
      media_urls?: string[];
      created_by?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("events")
        .insert({
          ...input,
          media_urls: input.media_urls ?? [],
        })
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["events", v.business_id] }),
  });
}

export function useUpdateEvent(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      title?: string;
      description?: string | null;
      event_date?: string;
      media_urls?: string[];
    }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("events").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["events", businessId] });
      qc.invalidateQueries({ queryKey: ["events", businessId, v.id] });
    },
  });
}

export function useDeleteEvent(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", businessId] }),
  });
}
