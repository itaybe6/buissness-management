import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ShiftBonus, Tip, Fault, PayrollMonthAdjustment } from "@/types/database";

/** Tips within a month (yyyy-mm). */
export function useTips(businessId: string | null, monthISO: string) {
  return useQuery({
    queryKey: ["tips", businessId, monthISO],
    enabled: !!businessId,
    queryFn: async (): Promise<Tip[]> => {
      const start = `${monthISO}-01`;
      const d = new Date(start);
      d.setMonth(d.getMonth() + 1);
      const end = d.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("tips")
        .select("*")
        .eq("business_id", businessId)
        .gte("shift_date", start)
        .lt("shift_date", end);
      if (error) throw error;
      return (data ?? []) as Tip[];
    },
  });
}

/** A single employee's tips within a month (yyyy-mm), newest shift first. */
export function useEmployeeTips(
  businessId: string | null,
  employeeId: string | null | undefined,
  monthISO: string,
) {
  return useQuery({
    queryKey: ["tips", businessId, employeeId, monthISO],
    enabled: !!businessId && !!employeeId,
    queryFn: async (): Promise<Tip[]> => {
      const start = `${monthISO}-01`;
      const d = new Date(start);
      d.setMonth(d.getMonth() + 1);
      const end = d.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("tips")
        .select("*")
        .eq("business_id", businessId)
        .eq("employee_id", employeeId)
        .gte("shift_date", start)
        .lt("shift_date", end)
        .order("shift_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tip[];
    },
  });
}

/** Kupah-percentage bonuses within a month (yyyy-mm). */
export function useShiftBonuses(businessId: string | null, monthISO: string) {
  return useQuery({
    queryKey: ["shift_bonuses", businessId, monthISO],
    enabled: !!businessId,
    queryFn: async (): Promise<ShiftBonus[]> => {
      const start = `${monthISO}-01`;
      const d = new Date(start);
      d.setMonth(d.getMonth() + 1);
      const end = d.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("shift_bonuses")
        .select("*")
        .eq("business_id", businessId)
        .gte("shift_date", start)
        .lt("shift_date", end);
      if (error) throw error;
      return (data ?? []) as ShiftBonus[];
    },
  });
}

/** A single employee's kupah bonuses within a month (yyyy-mm), newest shift first. */
export function useEmployeeBonuses(
  businessId: string | null,
  employeeId: string | null | undefined,
  monthISO: string,
) {
  return useQuery({
    queryKey: ["shift_bonuses", businessId, employeeId, monthISO],
    enabled: !!businessId && !!employeeId,
    queryFn: async (): Promise<ShiftBonus[]> => {
      const start = `${monthISO}-01`;
      const d = new Date(start);
      d.setMonth(d.getMonth() + 1);
      const end = d.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("shift_bonuses")
        .select("*")
        .eq("business_id", businessId)
        .eq("employee_id", employeeId)
        .gte("shift_date", start)
        .lt("shift_date", end)
        .order("shift_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ShiftBonus[];
    },
  });
}

/** Approved fault work payments within a month (by pay_approved_at). */
export function useApprovedFaultPays(businessId: string | null, monthISO: string) {
  return useQuery({
    queryKey: ["fault_pays", businessId, monthISO],
    enabled: !!businessId,
    queryFn: async (): Promise<Fault[]> => {
      const start = `${monthISO}-01T00:00:00.000Z`;
      const d = new Date(start);
      d.setMonth(d.getMonth() + 1);
      const end = d.toISOString();
      const { data, error } = await supabase
        .from("faults")
        .select("*")
        .eq("business_id", businessId)
        .eq("pay_approval_status", "approved")
        .gte("pay_approved_at", start)
        .lt("pay_approved_at", end);
      if (error) throw error;
      return (data ?? []) as Fault[];
    },
  });
}

/** One employee's approved fault payments in a month. */
export function useEmployeeFaultPays(
  businessId: string | null,
  employeeId: string | null | undefined,
  monthISO: string,
) {
  return useQuery({
    queryKey: ["fault_pays", businessId, employeeId, monthISO],
    enabled: !!businessId && !!employeeId,
    queryFn: async (): Promise<Fault[]> => {
      const start = `${monthISO}-01T00:00:00.000Z`;
      const d = new Date(start);
      d.setMonth(d.getMonth() + 1);
      const end = d.toISOString();
      const { data, error } = await supabase
        .from("faults")
        .select("*")
        .eq("business_id", businessId)
        .eq("pay_employee_id", employeeId)
        .eq("pay_approval_status", "approved")
        .gte("pay_approved_at", start)
        .lt("pay_approved_at", end)
        .order("pay_approved_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Fault[];
    },
  });
}

export function useAddTip(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      employee_id: string;
      shift_date: string;
      shift_template_id?: string | null;
      amount: number;
      hours: number;
    }) => {
      const hourly_from_tips = input.hours ? input.amount / input.hours : 0;
      const { error } = await supabase.from("tips").insert({ ...input, hourly_from_tips });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tips", businessId] }),
  });
}

function monthPeriodDate(monthISO: string): string {
  return `${monthISO}-01`;
}

/** All manual payroll adjustments for a month (yyyy-mm). */
export function usePayrollMonthAdjustments(businessId: string | null, monthISO: string) {
  return useQuery({
    queryKey: ["payroll_month_adjustments", businessId, monthISO],
    enabled: !!businessId,
    queryFn: async (): Promise<PayrollMonthAdjustment[]> => {
      const { data, error } = await supabase
        .from("payroll_month_adjustments")
        .select("*")
        .eq("business_id", businessId)
        .eq("period_month", monthPeriodDate(monthISO));
      if (error) throw error;
      return (data ?? []) as PayrollMonthAdjustment[];
    },
  });
}

export function useUpsertPayrollMonthAdjustment(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      employee_id: string;
      period_month: string;
      monthly_bonus: number;
      advance: number;
      differences: number;
      updated_by?: string | null;
    }) => {
      if (!businessId) throw new Error("missing business");
      const { error } = await supabase.from("payroll_month_adjustments").upsert(
        {
          business_id: businessId,
          employee_id: input.employee_id,
          period_month: monthPeriodDate(input.period_month),
          monthly_bonus: input.monthly_bonus,
          advance: input.advance,
          differences: input.differences,
          updated_by: input.updated_by ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "business_id,employee_id,period_month" },
      );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["payroll_month_adjustments", businessId, vars.period_month] });
    },
  });
}

export function payrollAdjustmentForEmployee(
  rows: PayrollMonthAdjustment[] | undefined,
  employeeId: string,
): PayrollMonthAdjustment | undefined {
  return (rows ?? []).find((r) => r.employee_id === employeeId);
}
