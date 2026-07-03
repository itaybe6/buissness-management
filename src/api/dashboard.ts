import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { addDays, toISODate } from "@/lib/db";
import type { FeatureKey } from "@/types/database";

export interface WeekPoint {
  label: string;
  short: string;
  value: number;
}

export interface StatusSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface ActivityItem {
  id: string;
  type: "attendance" | "task" | "fault" | "order";
  title: string;
  subtitle: string;
  at: string;
  icon: string;
  tone: "success" | "warning" | "danger" | "info" | "neutral";
}

export interface DashboardStats {
  employees: number;
  onShiftNow: number;
  attendanceToday: number;
  attendanceYesterday: number;
  tasksOpen: number;
  tasksDoneWeek: number;
  faultsOpen: number;
  inventoryLow: number;
  pendingOrders: number;
  inventoryTotal: number;
  attendanceWeek: WeekPoint[];
  tasksByStatus: StatusSlice[];
  faultsByStatus: StatusSlice[];
  recentActivity: ActivityItem[];
}

const TASK_STATUS: Record<string, { label: string; color: string }> = {
  open: { label: "פתוחות", color: "var(--info)" },
  in_progress: { label: "בטיפול", color: "var(--warning)" },
  done: { label: "הושלמו", color: "var(--success)" },
};

const FAULT_STATUS: Record<string, { label: string; color: string }> = {
  needs_handling: { label: "ממתינות", color: "var(--danger)" },
  in_progress: { label: "בטיפול", color: "var(--warning)" },
  handled: { label: "טופלו", color: "var(--success)" },
};

const HE_SHORT = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

function weekLabels(): WeekPoint[] {
  const pts: WeekPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    pts.push({
      label: d.toLocaleDateString("he-IL", { weekday: "short" }),
      short: HE_SHORT[d.getDay()],
      value: 0,
    });
  }
  return pts;
}

function isYesterday(iso: string) {
  const d = new Date(iso);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return d.toDateString() === y.toDateString();
}

function isThisWeek(iso: string) {
  const d = new Date(iso);
  const start = new Date();
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);
  return d >= start;
}

export function useDashboardStats(businessId: string | null, enabledFeatures: Set<FeatureKey>) {
  return useQuery({
    queryKey: ["dashboard_stats", businessId],
    enabled: !!businessId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<DashboardStats> => {
      const weekStartISO = addDays(toISODate(new Date()), -6) + "T00:00:00";
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [
        profilesRes,
        attendanceWeekRes,
        attendanceTodayRes,
        tasksRes,
        faultsRes,
        itemsRes,
        countsRes,
        ordersRes,
      ] = await Promise.all([
        supabase.from("profiles").select("id, full_name, active").eq("business_id", businessId).eq("active", true),
        supabase
          .from("attendance")
          .select("id, clock_in, clock_out, employee_id, created_at")
          .eq("business_id", businessId)
          .gte("clock_in", weekStartISO),
        supabase
          .from("attendance")
          .select("id, clock_in, clock_out, employee_id, created_at")
          .eq("business_id", businessId)
          .gte("created_at", todayStart.toISOString()),
        enabledFeatures.has("tasks")
          ? supabase.from("tasks").select("id, title, status, created_at, completed_at").eq("business_id", businessId)
          : Promise.resolve({ data: [], error: null }),
        enabledFeatures.has("faults")
          ? supabase.from("faults").select("id, description, status, created_at").eq("business_id", businessId)
          : Promise.resolve({ data: [], error: null }),
        enabledFeatures.has("inventory")
          ? supabase.from("inventory_items").select("id, name").eq("business_id", businessId).eq("active", true)
          : Promise.resolve({ data: [], error: null }),
        enabledFeatures.has("inventory")
          ? supabase
              .from("inventory_counts")
              .select("item_id, quantity, counted_at")
              .eq("business_id", businessId)
              .order("counted_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        enabledFeatures.has("inventory")
          ? supabase.from("inventory_orders").select("id, status, created_at, quantity").eq("business_id", businessId)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (attendanceWeekRes.error) throw attendanceWeekRes.error;
      if (attendanceTodayRes.error) throw attendanceTodayRes.error;
      if (tasksRes.error) throw tasksRes.error;
      if (faultsRes.error) throw faultsRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (countsRes.error) throw countsRes.error;
      if (ordersRes.error) throw ordersRes.error;

      const profiles = profilesRes.data ?? [];
      const attendanceWeek = attendanceWeekRes.data ?? [];
      const attendanceToday = attendanceTodayRes.data ?? [];
      const tasks = tasksRes.data ?? [];
      const faults = faultsRes.data ?? [];
      const items = itemsRes.data ?? [];
      const orders = ordersRes.data ?? [];

      const latestQty = new Map<string, number>();
      (countsRes.data ?? []).forEach((c) => {
        if (!latestQty.has(c.item_id)) latestQty.set(c.item_id, Number(c.quantity));
      });

      const weekPts = weekLabels();
      const dayIndex = new Map<string, number>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dayIndex.set(d.toDateString(), 6 - i);
      }
      attendanceWeek.forEach((a) => {
        if (!a.clock_in) return;
        const idx = dayIndex.get(new Date(a.clock_in).toDateString());
        if (idx != null) weekPts[idx].value += 1;
      });

      const tasksByStatus = Object.entries(TASK_STATUS).map(([key, meta]) => ({
        key,
        label: meta.label,
        value: tasks.filter((t) => t.status === key).length,
        color: meta.color,
      }));

      const faultsByStatus = Object.entries(FAULT_STATUS).map(([key, meta]) => ({
        key,
        label: meta.label,
        value: faults.filter((f) => f.status === key).length,
        color: meta.color,
      }));

      const profileMap = new Map(profiles.map((p) => [p.id, p.full_name]));

      const activity: ActivityItem[] = [];

      attendanceToday.slice(0, 8).forEach((a) => {
        const name = profileMap.get(a.employee_id) ?? "עובד/ת";
        const time = a.clock_in
          ? new Date(a.clock_in).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
          : "";
        activity.push({
          id: `att-${a.id}`,
          type: "attendance",
          title: a.clock_out ? `${name} יצא/ה` : `${name} נכנס/ה`,
          subtitle: time,
          at: a.clock_in ?? a.created_at,
          icon: a.clock_out ? "logout" : "login",
          tone: a.clock_out ? "neutral" : "success",
        });
      });

      tasks.slice(0, 5).forEach((t) => {
        activity.push({
          id: `task-${t.id}`,
          type: "task",
          title: t.title,
          subtitle: TASK_STATUS[t.status]?.label ?? t.status,
          at: t.completed_at ?? t.created_at,
          icon: "checklist",
          tone: t.status === "done" ? "success" : t.status === "in_progress" ? "warning" : "info",
        });
      });

      faults.slice(0, 5).forEach((f) => {
        activity.push({
          id: `fault-${f.id}`,
          type: "fault",
          title: f.description.slice(0, 48) + (f.description.length > 48 ? "…" : ""),
          subtitle: FAULT_STATUS[f.status]?.label ?? f.status,
          at: f.created_at,
          icon: "build",
          tone: f.status === "handled" ? "success" : f.status === "in_progress" ? "warning" : "danger",
        });
      });

      orders.slice(0, 4).forEach((o) => {
        activity.push({
          id: `ord-${o.id}`,
          type: "order",
          title: `הזמנה · ${o.quantity} יח׳`,
          subtitle: o.status === "received" ? "התקבלה" : o.status === "ordered" ? "הוזמנה" : "ממתינה",
          at: o.created_at,
          icon: "inventory_2",
          tone: o.status === "received" ? "success" : "warning",
        });
      });

      activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

      let inventoryLow = 0;
      items.forEach((it) => {
        const qty = latestQty.get(it.id) ?? 0;
        if (qty <= 3) inventoryLow += 1;
      });

      const yesterdayCount = attendanceWeek.filter((a) => a.clock_in && isYesterday(a.clock_in)).length;

      return {
        employees: profiles.length,
        onShiftNow: attendanceToday.filter((a) => a.clock_in && !a.clock_out).length,
        attendanceToday: attendanceToday.length,
        attendanceYesterday: yesterdayCount,
        tasksOpen: tasks.filter((t) => t.status === "open" || t.status === "in_progress").length,
        tasksDoneWeek: tasks.filter((t) => t.status === "done" && t.completed_at && isThisWeek(t.completed_at)).length,
        faultsOpen: faults.filter((f) => f.status !== "handled").length,
        inventoryLow,
        pendingOrders: orders.filter((o) => o.status === "requested" || o.status === "ordered").length,
        inventoryTotal: items.length,
        attendanceWeek: weekPts,
        tasksByStatus,
        faultsByStatus,
        recentActivity: activity.slice(0, 12),
      };
    },
  });
}

export interface PlatformDashboardStats {
  businesses: number;
  activeBusinesses: number;
  users: number;
  managers: number;
  businessesWeek: WeekPoint[];
  topBusinesses: { name: string; employees: number; features: number; active: boolean }[];
}

export function usePlatformDashboardStats() {
  return useQuery({
    queryKey: ["platform_dashboard_stats"],
    staleTime: 60_000,
    queryFn: async (): Promise<PlatformDashboardStats> => {
      const [{ data: bizs, error }, { data: profiles, error: pErr }] = await Promise.all([
        supabase.from("businesses").select("id, name, active, created_at").order("created_at", { ascending: true }),
        supabase.from("profiles").select("id, business_id, role"),
      ]);
      if (error) throw error;
      if (pErr) throw pErr;

      const businesses = bizs ?? [];
      const users = profiles ?? [];

      const weekPts = weekLabels();
      const dayIndex = new Map<string, number>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dayIndex.set(toISODate(d), 6 - i);
      }
      businesses.forEach((b) => {
        const idx = dayIndex.get(b.created_at.slice(0, 10));
        if (idx != null) weekPts[idx].value += 1;
      });

      const featCounts = new Map<string, number>();
      const { data: feats } = await supabase.from("business_features").select("business_id, enabled").eq("enabled", true);
      (feats ?? []).forEach((f) => featCounts.set(f.business_id, (featCounts.get(f.business_id) ?? 0) + 1));

      const topBusinesses = businesses
        .map((b) => ({
          name: b.name,
          employees: users.filter((u) => u.business_id === b.id).length,
          features: featCounts.get(b.id) ?? 0,
          active: b.active,
        }))
        .sort((a, b) => b.employees - a.employees)
        .slice(0, 6);

      return {
        businesses: businesses.length,
        activeBusinesses: businesses.filter((b) => b.active).length,
        users: users.length,
        managers: users.filter((u) => u.role === "manager").length,
        businessesWeek: weekPts,
        topBusinesses,
      };
    },
  });
}
