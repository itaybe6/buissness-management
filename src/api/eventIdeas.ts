import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { EventIdea } from "@/types/database";

export function useEventIdeas(businessId: string | null) {
  return useQuery({
    queryKey: ["event_ideas", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<EventIdea[]> => {
      const { data, error } = await supabase
        .from("event_ideas")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventIdea[];
    },
  });
}

export function useCreateEventIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      created_by: string;
      title: string;
      body?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("event_ideas")
        .insert(input)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["event_ideas", v.business_id] }),
  });
}

export function useUpdateEventIdea(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; title?: string; body?: string | null }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("event_ideas").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event_ideas", businessId] }),
  });
}

export function useDeleteEventIdea(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_ideas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event_ideas", businessId] }),
  });
}
