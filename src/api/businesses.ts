import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { enabledKeysOf, effectiveEnabledKeysFromRows, type FeatureState } from "@/lib/features";
import {
  businessInsertRow,
  featureRowsFor,
  managerFailureMessage,
  managerPayload,
} from "@/lib/businessSetup";
import { purgePlanFor, type FeatureDataReport } from "@/lib/featureData";
import type { Business, BusinessFeature, FeatureKey } from "@/types/database";

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
        supabase.from("business_features").select("business_id, feature_key, enabled"),
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
          feature_count: effectiveEnabledKeysFromRows(
            (feats ?? []).filter((f) => f.business_id === biz.id),
          ).length,
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
        .insert(
          businessInsertRow({
            name: input.name,
            state: input.features,
            seats: input.max_users == null ? "" : String(input.max_users),
            notes: input.admin_notes ?? undefined,
            createdBy: user?.id ?? null,
            plan: input.plan,
          }),
        )
        .select()
        .single();
      if (error) throw new Error(error.message || "שגיאה ביצירת העסק");

      const { error: fErr } = await supabase
        .from("business_features")
        .insert(featureRowsFor(biz.id, input.features));
      if (fErr) throw new Error(fErr.message || "שגיאה בשמירת המודולים");

      if (input.manager) {
        const { data, error: uErr } = await supabase.functions.invoke("create-user", {
          body: managerPayload(biz.id, input.manager),
        });
        const fnError = (data as { error?: string } | null)?.error;
        if (uErr || fnError) {
          // The business exists but has no admin — surface it rather than
          // silently leaving a business nobody can log into.
          throw new Error(managerFailureMessage(biz.name, fnError || uErr?.message || "שגיאה לא ידועה"));
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

/**
 * How many rows each module currently holds for this business — the numbers the
 * purge dialog shows before anything is deleted. Read-only RPC; refetched every
 * time the dialog opens so the count can't be stale by the time it's confirmed.
 */
export function useFeatureDataReport(businessId: string | null, features: FeatureKey[], enabled = true) {
  const keys = [...features].sort();
  return useQuery({
    queryKey: ["feature_data_report", businessId, keys],
    enabled: enabled && !!businessId && keys.length > 0,
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<FeatureDataReport> => {
      const { data, error } = await supabase.rpc("feature_data_report", {
        p_business_id: businessId,
        p_features: keys,
      });
      if (error) throw error;
      return (data ?? {}) as FeatureDataReport;
    },
  });
}

export interface ApplyFeaturesResult {
  /** Rows deleted per table, from the RPC. */
  deleted: Record<string, number>;
  rows_total: number;
  /** Storage buckets swept afterwards, with the number of files removed. */
  files: Record<string, number>;
}

/**
 * Delete the storage files that belong to the purged modules.
 *
 * Not part of the RPC on purpose: deleting from `storage.objects` in SQL drops
 * the row but leaves the blob in the bucket. Best-effort — a bucket that
 * doesn't exist or a permissions hiccup must not fail a purge that already
 * committed in the database.
 */
async function purgeFeatureStorage(businessId: string, features: FeatureKey[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const { storage } = purgePlanFor(features);

  for (const { bucket } of storage) {
    try {
      const { data: files, error } = await supabase.storage.from(bucket).list(businessId, { limit: 1000 });
      if (error || !files?.length) continue;

      const paths = files.map((f) => `${businessId}/${f.name}`);
      const { error: rmErr } = await supabase.storage.from(bucket).remove(paths);
      if (!rmErr) out[bucket] = paths.length;
    } catch {
      // Ignore: the rows are already gone, orphaned files are not worth a failure.
    }
  }

  return out;
}

/**
 * Write the whole module set in one transaction, and delete the data of every
 * module in `purge`.
 *
 * Flags and deletion live in the same RPC so a failed delete rolls the flags
 * back too — otherwise a business could end up with a module switched off and
 * its data half-deleted.
 */
export function useApplyFeatureState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      businessId: string;
      state: FeatureState;
      plan: Business["plan"];
      /** Modules being switched off whose data the super admin confirmed deleting. */
      purge?: FeatureKey[];
    }): Promise<ApplyFeaturesResult> => {
      const purge = input.purge ?? [];
      const { data, error } = await supabase.rpc("super_admin_apply_features", {
        p_business_id: input.businessId,
        p_enabled: enabledKeysOf(input.state),
        p_plan: input.plan,
        p_purge: purge,
      });
      if (error) throw error;

      const result = (data ?? {}) as { deleted?: Record<string, number>; rows_total?: number };
      const files = purge.length ? await purgeFeatureStorage(input.businessId, purge) : {};

      return {
        deleted: result.deleted ?? {},
        rows_total: result.rows_total ?? 0,
        files,
      };
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["business_features", v.businessId] });
      qc.invalidateQueries({ queryKey: ["business", v.businessId] });
      qc.invalidateQueries({ queryKey: ["businesses"] });
      qc.invalidateQueries({ queryKey: ["feature_data_report", v.businessId] });
      // Everything the purge touched: drop the caches rather than guess which.
      if (v.purge?.length) qc.invalidateQueries();
    },
  });
}
