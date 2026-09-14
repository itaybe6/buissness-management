import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { DEFAULT_HOURLY_RATE } from "@/lib/constants";
import type { PositionDraft } from "@/lib/employeePositions";
import type { EmployeePosition } from "@/types/database";

/** All positions of all employees in the business (small table — one query). */
export function useEmployeePositions(businessId: string | null | undefined) {
  return useQuery({
    queryKey: ["employee_positions", businessId ?? "none"],
    enabled: !!businessId,
    queryFn: async (): Promise<EmployeePosition[]> => {
      const { data, error } = await supabase
        .from("employee_positions")
        .select("*")
        .eq("business_id", businessId!)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EmployeePosition[];
    },
  });
}

export interface ReplacePositionsInput {
  business_id: string;
  employee_id: string;
  positions: PositionDraft[];
}

function draftToRow(d: PositionDraft, input: ReplacePositionsInput, index: number) {
  const rate = d.hourly_rate.trim() ? Number(d.hourly_rate) : DEFAULT_HOURLY_RATE;
  return {
    business_id: input.business_id,
    employee_id: input.employee_id,
    role: d.role,
    department_id: d.role === "employee" ? d.department_id || null : null,
    wage_type: d.wage_type,
    hourly_rate: Number.isFinite(rate) ? rate : DEFAULT_HOURLY_RATE,
    bonus_pct: Number(d.bonus_pct) || 0,
    sort_order: index,
  };
}

/**
 * Persist the full position list for one employee. Existing rows are updated
 * in place (so attendance/tips that point at them keep their link); rows the
 * manager removed are deleted; new ones are inserted. The DB trigger then
 * mirrors the primary position onto the profile.
 */
export function useReplaceEmployeePositions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReplacePositionsInput) => {
      if (input.positions.length === 0) throw new Error("יש להגדיר לפחות תפקיד אחד");

      const { data: existing, error: loadError } = await supabase
        .from("employee_positions")
        .select("id")
        .eq("employee_id", input.employee_id);
      if (loadError) throw loadError;
      const existingIds = new Set((existing ?? []).map((r: { id: string }) => r.id));

      const keepIds = new Set<string>();
      const inserts: ReturnType<typeof draftToRow>[] = [];
      for (const [index, d] of input.positions.entries()) {
        const row = draftToRow(d, input, index);
        if (existingIds.has(d.key)) {
          keepIds.add(d.key);
          const { error } = await supabase.from("employee_positions").update(row).eq("id", d.key);
          if (error) throw error;
        } else {
          inserts.push(row);
        }
      }

      const toDelete = [...existingIds].filter((id) => !keepIds.has(id));
      if (toDelete.length > 0) {
        const { error } = await supabase.from("employee_positions").delete().in("id", toDelete);
        if (error) throw error;
      }
      if (inserts.length > 0) {
        const { error } = await supabase.from("employee_positions").insert(inserts);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee_positions"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}
