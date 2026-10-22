import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { addDays } from "@/lib/db";
import {
  WEEKLY_DAY_OFF_ERROR,
  canAssignEmployeeOnDate,
  weekStartFromDateISO,
} from "@/lib/shift-assignment-limits";
import { ensureDefaultShiftTemplates, sortShiftTemplates } from "@/lib/shiftTemplates";
import type { Availability, ShiftAssignment, ShiftPreference, ShiftTemplate, ShiftTemplateDay } from "@/types/database";

async function fetchShiftTemplates(businessId: string, activeOnly: boolean): Promise<ShiftTemplate[]> {
  const load = async (): Promise<ShiftTemplate[]> => {
    const { data, error } = await supabase
      .from("shift_templates")
      .select("*, days:shift_template_days(day_of_week, start_time, end_time)")
      .eq("business_id", businessId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as ShiftTemplate[]).map((row) => ({
      ...row,
      days: [...(row.days ?? [])].sort((a, b) => a.day_of_week - b.day_of_week),
    }));
  };

  let rows = await load();
  if (await ensureDefaultShiftTemplates(businessId, rows)) rows = await load();
  return sortShiftTemplates(activeOnly ? rows.filter((t) => t.active) : rows);
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
      const { id, days, ...rest } = input;
      void days;
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
      /** null = general shift (not tied to a department). */
      department_id: string | null;
      name: string;
      start_time: string;
      end_time: string;
      color?: string;
      sort_order?: number;
    }) => {
      const { data, error } = await supabase
        .from("shift_templates")
        .insert({
          ...input,
          shift_key: null,
          active: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      // A new shift runs all week at these hours; days are turned off afterwards.
      const { error: dayErr } = await supabase.from("shift_template_days").insert(
        [0, 1, 2, 3, 4, 5, 6].map((day_of_week) => ({
          shift_template_id: data.id,
          day_of_week,
          start_time: input.start_time,
          end_time: input.end_time,
        })),
      );
      if (dayErr) throw dayErr;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shift_templates", businessId] }),
  });
}

/** Replace the weekdays a shift runs (and keep the headline hours in sync). */
export function useReplaceShiftTemplateDays(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; days: ShiftTemplateDay[] }) => {
      const days = [...input.days].sort((a, b) => a.day_of_week - b.day_of_week);
      if (days.length === 0) {
        const { error } = await supabase.from("shift_template_days").delete().eq("shift_template_id", input.id);
        if (error) throw error;
        return;
      }
      const keep = `(${days.map((d) => d.day_of_week).join(",")})`;
      const { error: delErr } = await supabase
        .from("shift_template_days")
        .delete()
        .eq("shift_template_id", input.id)
        .not("day_of_week", "in", keep);
      if (delErr) throw delErr;
      const { error: upErr } = await supabase.from("shift_template_days").upsert(
        days.map((d) => ({
          shift_template_id: input.id,
          day_of_week: d.day_of_week,
          start_time: d.start_time,
          end_time: d.end_time,
        })),
        { onConflict: "shift_template_id,day_of_week" },
      );
      if (upErr) throw upErr;
      const { error: headErr } = await supabase
        .from("shift_templates")
        .update({ start_time: days[0].start_time, end_time: days[0].end_time })
        .eq("id", input.id);
      if (headErr) throw headErr;
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
    // Keep showing the previous week's rows while the next week loads.
    placeholderData: keepPreviousData,
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
    placeholderData: keepPreviousData,
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

type AssignmentInput = {
  business_id: string;
  department_id: string | null;
  employee_id: string;
  shift_date: string;
  shift_template_id: string;
  assigned_by?: string | null;
};

async function assertCanAssignOnDate(employeeId: string, shiftDate: string) {
  const wk = weekStartFromDateISO(shiftDate);
  const weekEnd = addDays(wk, 6);
  const { data: weekRows, error: weekError } = await supabase
    .from("shift_assignments")
    .select("employee_id, shift_date")
    .eq("employee_id", employeeId)
    .gte("shift_date", wk)
    .lte("shift_date", weekEnd);
  if (weekError) throw weekError;

  if (
    !canAssignEmployeeOnDate(
      (weekRows ?? []) as { employee_id: string; shift_date: string }[],
      employeeId,
      shiftDate,
    )
  ) {
    throw new Error(WEEKLY_DAY_OFF_ERROR);
  }
}

export function useAddAssignment(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AssignmentInput) => {
      await assertCanAssignOnDate(input.employee_id, input.shift_date);

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

export function useAddAssignments(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inputs: AssignmentInput[]) => {
      if (inputs.length === 0) return;
      for (const input of inputs) {
        await assertCanAssignOnDate(input.employee_id, input.shift_date);
      }

      const { error } = await supabase
        .from("shift_assignments")
        .upsert(inputs, { onConflict: "employee_id,shift_date,shift_template_id" });
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
