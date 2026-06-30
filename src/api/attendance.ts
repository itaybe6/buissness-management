import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Attendance } from "@/types/database";

export function useAttendanceToday(businessId: string | null) {
  return useQuery({
    queryKey: ["attendance", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<Attendance[]> => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("business_id", businessId)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false });
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
