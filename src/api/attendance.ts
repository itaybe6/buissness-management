import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { Attendance } from "@/types/database";

export function useAttendanceToday(businessId: string | null) {
  return useQuery({
    queryKey: ["attendance", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<Attendance[]> => {
      const since = new Date();
      since.setDate(since.getDate() - 1);
      since.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("business_id", businessId)
        .gte("clock_in", since.toISOString())
        .order("clock_in", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Attendance[];
    },
  });
}

/** All attendance rows within a month (yyyy-mm) for payroll. */
export function useAttendanceMonth(businessId: string | null, monthISO: string) {
  return useQuery({
    queryKey: ["attendance_month", businessId, monthISO],
    enabled: !!businessId,
    queryFn: async (): Promise<Attendance[]> => {
      const start = `${monthISO}-01T00:00:00`;
      const d = new Date(`${monthISO}-01`);
      d.setMonth(d.getMonth() + 1);
      const end = d.toISOString();
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("business_id", businessId)
        .gte("clock_in", start)
        .lt("clock_in", end);
      if (error) throw error;
      return (data ?? []) as Attendance[];
    },
  });
}

/** Attendance around a report date — includes prior/next day for overnight shifts. */
export function useAttendanceAroundDate(businessId: string | null, reportDateISO: string | null) {
  return useQuery({
    queryKey: ["attendance_around", businessId, reportDateISO],
    enabled: !!businessId && !!reportDateISO,
    queryFn: async (): Promise<Attendance[]> => {
      const start = `${addDays(reportDateISO!, -1)}T00:00:00`;
      const end = `${addDays(reportDateISO!, 2)}T00:00:00`;
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("business_id", businessId)
        .gte("clock_in", start)
        .lt("clock_in", end)
        .order("clock_in", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Attendance[];
    },
  });
}

/** A single employee's attendance rows within a month (yyyy-mm), newest first. */
export function useEmployeeAttendanceMonth(
  businessId: string | null,
  employeeId: string | null | undefined,
  monthISO: string,
) {
  return useQuery({
    queryKey: ["attendance_month", businessId, employeeId, monthISO],
    enabled: !!businessId && !!employeeId,
    queryFn: async (): Promise<Attendance[]> => {
      const start = `${monthISO}-01T00:00:00`;
      const d = new Date(`${monthISO}-01`);
      d.setMonth(d.getMonth() + 1);
      const end = d.toISOString();
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("business_id", businessId)
        .eq("employee_id", employeeId)
        .gte("clock_in", start)
        .lt("clock_in", end)
        .order("clock_in", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Attendance[];
    },
  });
}

export function useClockIn(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      employee_id: string;
      lat: number | null;
      lng: number | null;
      within_radius: boolean;
    }) => {
      const { error } = await supabase.from("attendance").insert({
        business_id: input.business_id,
        employee_id: input.employee_id,
        clock_in: new Date().toISOString(),
        clock_in_lat: input.lat,
        clock_in_lng: input.lng,
        within_radius: input.within_radius,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance", businessId] }),
  });
}

export function useClockOut(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("attendance").update({ clock_out: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance", businessId] }),
  });
}

/** Close or correct a punch with explicit clock-in / clock-out timestamps. */
export function useUpdateAttendanceSession(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; clock_in: string; clock_out?: string | null }) => {
      const patch: { clock_in: string; clock_out?: string | null } = { clock_in: input.clock_in };
      if (input.clock_out !== undefined) {
        patch.clock_out = input.clock_out;
      }
      const { error } = await supabase.from("attendance").update(patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance", businessId] });
      qc.invalidateQueries({ queryKey: ["attendance_month"] });
      qc.invalidateQueries({ queryKey: ["attendance_around"] });
    },
  });
}

/** Remove a punch entirely (as if the employee was never on that shift). */
export function useDeleteAttendance(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("attendance").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance", businessId] });
      qc.invalidateQueries({ queryKey: ["attendance_month"] });
      qc.invalidateQueries({ queryKey: ["attendance_around"] });
    },
  });
}
