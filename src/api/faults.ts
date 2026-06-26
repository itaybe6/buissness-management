import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export async function uploadFaultPhoto(businessId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${businessId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("faults").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("faults").getPublicUrl(path);
  return data.publicUrl;
}

export function useCreateFault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      description: string;
      photo_url?: string | null;
      reported_by?: string | null;
    }) => {
      const { error } = await supabase.from("faults").insert(input);
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
