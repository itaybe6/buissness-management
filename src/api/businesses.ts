import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Business, BusinessFeature, FeatureKey } from "@/types/database";

export interface BusinessWithStats extends Business {
  employee_count: number;
  feature_count: number;
}

export function useBusinesses() {
  return useQuery({
    queryKey: ["businesses"],
    queryFn: async (): Promise<BusinessWithStats[]> => {
      const [{ data: bizs, error }, { data: profiles }, { data: feats }] = await Promise.all([
        supabase.from("businesses").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, business_id"),
        supabase.from("business_features").select("business_id, enabled"),
      ]);
      if (error) throw error;
      return (bizs ?? []).map((b) => ({
        ...(b as Business),
        employee_count: (profiles ?? []).filter((p) => p.business_id === b.id).length,
        feature_count: (feats ?? []).filter((f) => f.business_id === b.id && f.enabled).length,
      }));
    },
  });
}

export function useBusiness(businessId: string | null) {
  return useQuery({
    queryKey: ["business", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<Business> => {
      const { data, error } = await supabase.from("businesses").select("*").eq("id", businessId).single();
      if (error) throw error;
      return data as Business;
    },
  });
}

export function useBusinessFeatures(businessId: string | null) {
  return useQuery({
    queryKey: ["business_features", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<BusinessFeature[]> => {
      const { data, error } = await supabase.from("business_features").select("*").eq("business_id", businessId);
      if (error) throw error;
      return (data ?? []) as BusinessFeature[];
    },
  });
}

export function useCreateBusiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; features: Record<FeatureKey, boolean> }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: biz, error } = await supabase
        .from("businesses")
        .insert({ name: input.name, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      const rows = Object.entries(input.features).map(([feature_key, enabled]) => ({
        business_id: biz.id,
        feature_key,
        enabled,
      }));
      const { error: fErr } = await supabase.from("business_features").insert(rows);
      if (fErr) throw fErr;
      return biz as Business;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["businesses"] }),
  });
}

export function useUpdateBusiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Business> & { id: string }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("businesses").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["businesses"] });
      qc.invalidateQueries({ queryKey: ["business", v.id] });
    },
  });
}

export function useSetFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { businessId: string; feature: FeatureKey; enabled: boolean }) => {
      const { error } = await supabase
        .from("business_features")
        .upsert(
          { business_id: input.businessId, feature_key: input.feature, enabled: input.enabled },
          { onConflict: "business_id,feature_key" }
        );
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["business_features", v.businessId] }),
  });
}
