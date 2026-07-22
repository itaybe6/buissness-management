import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { ALL_FEATURE_KEYS, enabledKeysOf, type FeatureState } from "@/lib/features";
import type { Business, BusinessFeature, FeatureKey, UserRole } from "@/types/database";

export interface BusinessWithStats extends Business {
  employee_count: number;
  feature_count: number;
  /** Users with the `manager` role — the business's own system admins. */
  manager_count: number;
  /** null when the business has no seat cap. */
  seats_left: number | null;
}

export function useBusinesses() {
  return useQuery({
    queryKey: ["businesses"],
    queryFn: async (): Promise<BusinessWithStats[]> => {
      const [{ data: bizs, error }, { data: profiles }, { data: feats }] = await Promise.all([
        supabase.from("businesses").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, business_id, role"),
        supabase.from("business_features").select("business_id, enabled"),
      ]);
      if (error) throw error;
      return (bizs ?? []).map((b) => {
        const biz = b as Business;
        const members = (profiles ?? []).filter((p) => p.business_id === biz.id);
        const managers = members.filter((p) => p.role === "manager").length;
        return {
          ...biz,
          employee_count: members.length,
          manager_count: managers,
          feature_count: (feats ?? []).filter((f) => f.business_id === biz.id && f.enabled).length,
          seats_left: biz.max_users == null ? null : Math.max(0, biz.max_users - members.length),
        };
      });
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

export interface CreateBusinessInput {
  name: string;
  features: FeatureState;
  plan: Business["plan"];
  max_users: number | null;
  admin_notes?: string | null;
  /** Optional: create the business's first system manager in the same flow. */
  manager?: {
    full_name: string;
    email: string;
    password: string;
    phone?: string;
  };
}

export function useCreateBusiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBusinessInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: biz, error } = await supabase
        .from("businesses")
        .insert({
          name: input.name,
          plan: input.plan,
          max_users: input.max_users,
          admin_notes: input.admin_notes ?? null,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      // Write a row per module so the business always has an explicit answer for
      // every feature key — `hasFeature` treats a missing row as disabled.
      const rows = ALL_FEATURE_KEYS.map((feature_key) => ({
        business_id: biz.id,
        feature_key,
        enabled: !!input.features[feature_key],
      }));
      const { error: fErr } = await supabase.from("business_features").insert(rows);
      if (fErr) throw fErr;

      if (input.manager) {
        const { data, error: uErr } = await supabase.functions.invoke("create-user", {
          body: {
            email: input.manager.email.trim(),
            password: input.manager.password,
            full_name: input.manager.full_name.trim(),
            phone: input.manager.phone || undefined,
            role: "manager" satisfies UserRole,
            business_id: biz.id,
          },
        });
        const fnError = (data as { error?: string } | null)?.error;
        if (uErr || fnError) {
          // The business exists but has no admin — surface it rather than
          // silently leaving a business nobody can log into.
          throw new Error(
            `העסק "${biz.name}" נוצר, אך יצירת מנהל המערכת נכשלה: ${fnError || uErr?.message}. אפשר להוסיף אותו מעמוד העסק.`,
          );
        }
      }

      return biz as Business;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["businesses"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
    },
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
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["business_features", v.businessId] });
      qc.invalidateQueries({ queryKey: ["businesses"] });
    },
  });
}

/**
 * Write a whole module set at once — used when the super admin applies a plan.
 * Also stores the resulting plan on the business so the two never drift.
 */
export function useApplyFeatureState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { businessId: string; state: FeatureState; plan: Business["plan"] }) => {
      const rows = ALL_FEATURE_KEYS.map((feature_key) => ({
        business_id: input.businessId,
        feature_key,
        enabled: !!input.state[feature_key],
      }));
      const { error } = await supabase
        .from("business_features")
        .upsert(rows, { onConflict: "business_id,feature_key" });
      if (error) throw error;

      const { error: bErr } = await supabase
        .from("businesses")
        .update({ plan: input.plan })
        .eq("id", input.businessId);
      if (bErr) throw bErr;

      return enabledKeysOf(input.state);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["business_features", v.businessId] });
      qc.invalidateQueries({ queryKey: ["business", v.businessId] });
      qc.invalidateQueries({ queryKey: ["businesses"] });
    },
  });
}
