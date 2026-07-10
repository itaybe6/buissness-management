import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compressImage } from "@/lib/compressImage";
import { supabase } from "@/lib/supabase";
import { computeShiftBonusAmounts, filterBonusParticipantsToWorkedShift } from "@/lib/shiftReportBonuses";
import { computeTipsHourly, distributeTips } from "@/lib/shiftReportTips";
import type { Attendance, ShiftAssignment, ShiftReport, ShiftReportExtra, ShiftTemplate } from "@/types/database";

/** Shift reports within a month (yyyy-mm), newest first. */
export function useShiftReports(businessId: string | null, monthISO: string) {
  return useQuery({
    queryKey: ["shift_reports", businessId, monthISO],
    enabled: !!businessId,
    queryFn: async (): Promise<ShiftReport[]> => {
      const start = `${monthISO}-01`;
      const d = new Date(start);
      d.setMonth(d.getMonth() + 1);
      const end = d.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("shift_reports")
        .select("*")
        .eq("business_id", businessId)
        .gte("report_date", start)
        .lt("report_date", end)
        .order("report_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ShiftReport[];
    },
  });
}

/** Upload an invoice file (image is compressed to jpg, other types kept as-is). */
export async function uploadInvoice(businessId: string, file: File): Promise<string> {
  const isImage = file.type.startsWith("image/");
  const payload = isImage ? await compressImage(file) : file;
  const ext = isImage ? "jpg" : (file.name.split(".").pop() || "bin");
  const path = `${businessId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("invoices").upload(path, payload, {
    upsert: false,
    contentType: payload.type || "application/octet-stream",
  });
  if (error) throw error;
  const { data } = supabase.storage.from("invoices").getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadInvoices(businessId: string, files: File[]): Promise<string[]> {
  return Promise.all(files.map((file) => uploadInvoice(businessId, file)));
}

export interface SaveShiftReportInput {
  id?: string;
  business_id: string;
  report_date: string;
  shift_template_id: string | null;
  manager_names: string | null;
  total_sales: number;
  delivery_sales: number;
  avg_per_diner: number;
  total_tips: number;
  service_pct: number;
  first_release: string | null;
  energy_level: number | null;
  unusual_events: string | null;
  team_talks: string | null;
  team_voice: string | null;
  daily_tasks_done: boolean;
  urgent_inventory: string | null;
  faults_maintenance: string | null;
  extra: ShiftReportExtra;
  invoice_urls: string[];
  created_by: string | null;
}

async function resolveWorkedBonusEmployeeIds(input: SaveShiftReportInput): Promise<string[]> {
  const requested = (input.extra.bonus_participants ?? []).map((p) => p.employee_id).filter(Boolean);
  if (!input.shift_template_id || requested.length === 0) return [];

  const nextDay = new Date(input.report_date + "T12:00:00");
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayISO = nextDay.toISOString().slice(0, 10);

  const [{ data: dayAssignments }, { data: dayAttendance }, { data: templateRow }] = await Promise.all([
    supabase
      .from("shift_assignments")
      .select("*")
      .eq("business_id", input.business_id)
      .eq("shift_date", input.report_date),
    supabase
      .from("attendance")
      .select("*")
      .eq("business_id", input.business_id)
      .gte("clock_in", `${input.report_date}T00:00:00`)
      .lt("clock_in", `${nextDayISO}T00:00:00`),
    supabase.from("shift_templates").select("*").eq("id", input.shift_template_id).maybeSingle(),
  ]);

  return filterBonusParticipantsToWorkedShift(requested, {
    reportDate: input.report_date,
    shiftTemplateId: input.shift_template_id,
    assignments: (dayAssignments ?? []) as ShiftAssignment[],
    attendance: (dayAttendance ?? []) as Attendance[],
    templates: templateRow ? [templateRow as ShiftTemplate] : [],
  });
}

/**
 * Upsert a shift report and sync its per-employee tips into the `tips` table
 * (so they flow into Payroll). Tips are re-generated from the report's
 * participant list on every save.
 */
export function useSaveShiftReport(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveShiftReportInput): Promise<string> => {
      const participants = input.extra.tip_participants ?? [];
      const tipsHourly = computeTipsHourly(Number(input.total_tips) || 0, participants);
      const bonusIds = await resolveWorkedBonusEmployeeIds(input);
      const extra: ShiftReportExtra = {
        ...input.extra,
        bonus_participants: bonusIds.map((employee_id) => ({ employee_id })),
      };

      const row = {
        business_id: input.business_id,
        report_date: input.report_date,
        shift_template_id: input.shift_template_id,
        manager_names: input.manager_names,
        total_sales: input.total_sales,
        delivery_sales: input.delivery_sales,
        avg_per_diner: input.avg_per_diner,
        total_tips: input.total_tips,
        service_pct: input.service_pct,
        tips_hourly: tipsHourly,
        first_release: input.first_release,
        energy_level: input.energy_level,
        unusual_events: input.unusual_events,
        team_talks: input.team_talks,
        team_voice: input.team_voice,
        daily_tasks_done: input.daily_tasks_done,
        urgent_inventory: input.urgent_inventory,
        faults_maintenance: input.faults_maintenance,
        extra,
        invoice_urls: input.invoice_urls,
        created_by: input.created_by,
      };

      let reportId = input.id;
      if (reportId) {
        const { error } = await supabase.from("shift_reports").update(row).eq("id", reportId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("shift_reports").insert(row).select("id").single();
        if (error) throw error;
        reportId = (data as { id: string }).id;
      }

      // Re-sync tips: clear previous ones for this report, then insert fresh.
      await supabase.from("tips").delete().eq("shift_report_id", reportId);
      const tipRows = distributeTips(Number(input.total_tips) || 0, participants).map((t) => ({
        business_id: input.business_id,
        employee_id: t.employee_id,
        shift_date: input.report_date,
        shift_template_id: input.shift_template_id,
        shift_report_id: reportId,
        amount: t.amount,
        hours: t.hours,
        hourly_from_tips: t.hourly_from_tips,
      }));
      if (tipRows.length) {
        const { error } = await supabase.from("tips").insert(tipRows);
        if (error) throw error;
      }

      // Re-sync kupah-percentage bonuses — only employees who worked this shift.
      const { perEmployee } = computeShiftBonusAmounts(
        Number(input.total_sales) || 0,
        Number(input.service_pct) || 0,
        bonusIds,
      );

      await supabase.from("shift_bonuses").delete().eq("shift_report_id", reportId);
      if (bonusIds.length > 0 && perEmployee > 0) {
        const bonusRows = bonusIds.map((employeeId) => ({
          business_id: input.business_id,
          employee_id: employeeId,
          shift_report_id: reportId,
          shift_date: input.report_date,
          shift_template_id: input.shift_template_id,
          amount: perEmployee,
          bonus_pct: Number(input.service_pct) || 0,
          sales_base: Number(input.total_sales) || 0,
        }));
        const { error } = await supabase.from("shift_bonuses").insert(bonusRows);
        if (error) throw error;
      }

      return reportId!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift_reports", businessId] });
      qc.invalidateQueries({ queryKey: ["tips", businessId] });
      qc.invalidateQueries({ queryKey: ["shift_bonuses", businessId] });
    },
  });
}

export function useDeleteShiftReport(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // tips cascade-delete via FK (on delete cascade)
      const { error } = await supabase.from("shift_reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift_reports", businessId] });
      qc.invalidateQueries({ queryKey: ["tips", businessId] });
      qc.invalidateQueries({ queryKey: ["shift_bonuses", businessId] });
    },
  });
}
