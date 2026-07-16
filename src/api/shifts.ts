import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { addDays } from "@/lib/db";
import {
  WEEKLY_DAY_OFF_ERROR,
  canAssignEmployeeOnDate,
  weekStartFromDateISO,
} from "@/lib/shift-assignment-limits";
import { ensureDefaultShiftTemplates, sortShiftTemplates } from "@/lib/shiftTemplates";
import type { Availability, ShiftAssignment, ShiftPreference, ShiftTemplate } from "@/types/database";

async function fetchShiftTemplates(businessId: string, activeOnly: boolean): Promise<ShiftTemplate[]> {
  await ensureDefaultShiftTemplates(businessId);
  let q = supabase.from("shift_templates").select("*").eq("business_id", businessId);
  if (activeOnly) q = q.eq("active", true);
  const { data, error } = await q.order("sort_order", { ascending: true });
  if (error) throw error;
  return sortShiftTemplates((data ?? []) as ShiftTemplate[]);
}

/* ----------------------------- shift templates ----------------------------- */
export function useShiftTemplates(businessId: string | null) {
  return useQuery({
    queryKey: ["shift_templates", businessId],
    enabled: !!businessId,
    queryFn: () => fetchShiftTemplates(businessId!, false),
  });
}

export function useActiveShiftTemplates(businessId: string | null) {
  return useQuery({
    queryKey: ["shift_templates", businessId, "active"],
    enabled: !!businessId,
    queryFn: () => fetchShiftTemplates(businessId!, true),
  });
}

export function useUpdateShiftTemplate(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ShiftTemplate> & { id: string }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("shift_templates").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift_templates", businessId] });
    },
  });
}

export function useCreateShiftTemplate(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      name: string;
      start_time: string;
      end_time: string;
      color?: string;
      sort_order?: number;
    }) => {
      const { error } = await supabase.from("shift_templates").insert({
        ...input,
        shift_key: null,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shift_templates", businessId] }),
  });
}

export function useDeleteShiftTemplate(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shift_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shift_templates", businessId] }),
  });
}

/* ----------------------------- preferences ----------------------------- */
export function useShiftPreferences(businessId: string | null, weekStartISO: string, employeeId?: string) {
  return useQuery({
    queryKey: ["shift_preferences", businessId, weekStartISO, employeeId ?? "all"],
    enabled: !!businessId,
    queryFn: async (): Promise<ShiftPreference[]> => {
      let q = supabase
        .from("shift_preferences")
        .select("*")
        .eq("business_id", businessId)
        .eq("week_start", weekStartISO);
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ShiftPreference[];
    },
  });
}

export function useSetPreference(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      employee_id: string;
      week_start: string;
      shift_date: string;
      shift_template_id: string;
      preference: Availability;
      note?: string;
    }) => {
      const { error } = await supabase
        .from("shift_preferences")
        .upsert(input, { onConflict: "employee_id,shift_date,shift_template_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shift_preferences", businessId] }),
  });
}

export function useClearPreference(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employee_id: string; shift_date: string; shift_template_id: string }) => {
      const { error } = await supabase
        .from("shift_preferences")
        .delete()
        .eq("employee_id", input.employee_id)
        .eq("shift_date", input.shift_date)
        .eq("shift_template_id", input.shift_template_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shift_preferences", businessId] }),
  });
}

/* ----------------------------- assignments ----------------------------- */
export function useShiftAssignments(
  businessId: string | null,
  weekStartISO: string,
  weekEndISO: string,
  employeeId?: string
) {
  return useQuery({
    queryKey: ["shift_assignments", businessId, weekStartISO, employeeId ?? "all"],
    enabled: !!businessId,
    queryFn: async (): Promise<ShiftAssignment[]> => {
      let q = supabase
        .from("shift_assignments")
        .select("*")
        .eq("business_id", businessId)
        .gte("shift_date", weekStartISO)
        .lte("shift_date", weekEndISO);
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ShiftAssignment[];
    },
  });
}

export function useAddAssignment(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      department_id: string | null;
      employee_id: string;
      shift_date: string;
      shift_template_id: string;
      assigned_by?: string | null;
    }) => {
      const wk = weekStartFromDateISO(input.shift_date);
      const weekEnd = addDays(wk, 6);
      const { data: weekRows, error: weekError } = await supabase
        .from("shift_assignments")
        .select("employee_id, shift_date")
        .eq("employee_id", input.employee_id)
        .gte("shift_date", wk)
        .lte("shift_date", weekEnd);
      if (weekError) throw weekError;

      if (
        !canAssignEmployeeOnDate(
          (weekRows ?? []) as { employee_id: string; shift_date: string }[],
          input.employee_id,
          input.shift_date,
        )
      ) {
        throw new Error(WEEKLY_DAY_OFF_ERROR);
      }

      const { error } = await supabase
        .from("shift_assignments")
        .upsert(input, { onConflict: "employee_id,shift_date,shift_template_id" });
      if (error) {
        if (error.message?.includes("WEEKLY_DAY_OFF_REQUIRED")) {
          throw new Error(WEEKLY_DAY_OFF_ERROR);
        }
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shift_assignments", businessId] }),
  });
}

export function useRemoveAssignment(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shift_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shift_assignments", businessId] }),
  });
}
