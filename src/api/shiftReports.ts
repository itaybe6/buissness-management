import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compressImage } from "@/lib/compressImage";
import { supabase } from "@/lib/supabase";
import { computeBonusPayouts } from "@/lib/shiftReportBonuses";
import { computeTipsHourly, distributeTips } from "@/lib/shiftReportTips";
import type { ShiftReport, ShiftReportExtra } from "@/types/database";

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

/** Single shift report by id (for editor deep links). */
export function useShiftReport(businessId: string | null, reportId: string | null) {
  return useQuery({
    queryKey: ["shift_report", businessId, reportId],
    enabled: !!businessId && !!reportId,
    queryFn: async (): Promise<ShiftReport> => {
      const { data, error } = await supabase
        .from("shift_reports")
        .select("*")
        .eq("business_id", businessId!)
        .eq("id", reportId!)
        .single();
      if (error) throw error;
      return data as ShiftReport;
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
      const bonusRows = computeBonusPayouts(
        Number(input.total_sales) || 0,
        input.extra.bonus_participants ?? [],
      );
      const extra: ShiftReportExtra = {
        ...input.extra,
        bonus_participants: bonusRows.map(({ employee_id, bonus_pct }) => ({
          employee_id,
          bonus_pct,
        })),
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

      await supabase.from("tips").delete().eq("shift_report_id", reportId);
      const tipRows = distributeTips(Number(input.total_tips) || 0, participants).map((t) => {
        const row: Record<string, unknown> = {
          business_id: input.business_id,
          employee_id: t.employee_id,
          shift_date: input.report_date,
          shift_report_id: reportId,
          amount: t.amount,
          hours: t.hours,
          hourly_from_tips: t.hourly_from_tips,
        };
        if (input.shift_template_id) row.shift_template_id = input.shift_template_id;
        return row;
      });
      if (tipRows.length) {
        const { error } = await supabase.from("tips").insert(tipRows);
        if (error) throw error;
      }

      await supabase.from("shift_bonuses").delete().eq("shift_report_id", reportId);
      if (bonusRows.length > 0) {
        const salesBase = Number(input.total_sales) || 0;
        const insertRows = bonusRows.map((b) => ({
          business_id: input.business_id,
          employee_id: b.employee_id,
          shift_report_id: reportId,
          shift_date: input.report_date,
          shift_template_id: input.shift_template_id,
          amount: b.amount,
          bonus_pct: b.bonus_pct,
          sales_base: salesBase,
        }));
        const { error } = await supabase.from("shift_bonuses").insert(insertRows);
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
