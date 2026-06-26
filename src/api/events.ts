import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      title: string;
      description?: string | null;
      event_date: string;
      created_by?: string | null;
    }) => {
      const { error } = await supabase.from("events").insert(input);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["events", v.business_id] }),
  });
}
