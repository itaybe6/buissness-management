import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  EventRequest,
  EventRequestKind,
  EventRequestStatus,
  EventStaffingLine,
  EventSupplyLine,
  TaskStatus,
  UserRole,
} from "@/types/database";

const SELECT = `
  *,
  requester:requested_by(full_name, avatar_url),
  status_updater:status_updated_by(full_name),
  event:event_id(title, event_date)
`;

/**
 * Requests of a business (all events) or of a single event.
 * `poll` keeps the manager's badge fresh while the app is open.
 */
export function useEventRequests(
  businessId: string | null,
  options?: { eventId?: string | null; poll?: boolean },
) {
  const eventId = options?.eventId ?? null;
  return useQuery({
    queryKey: ["event_requests", businessId, eventId ?? "all"],
    enabled: !!businessId,
    refetchInterval: options?.poll ? 30_000 : false,
    queryFn: async (): Promise<EventRequest[]> => {
      let query = supabase
        .from("event_requests")
        .select(SELECT)
        .eq("business_id", businessId!)
        .order("created_at", { ascending: false });
      if (eventId) query = query.eq("event_id", eventId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as EventRequest[];
    },
  });
}

export type CreateEventRequestInput =
  | { kind: "staffing"; event_id: string; shift_label: string | null; note: string | null; lines: EventStaffingLine[] }
  | { kind: "supplies"; event_id: string; note: string | null; lines: EventSupplyLine[] };

export function useCreateEventRequest(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateEventRequestInput) => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId || !businessId) throw new Error("לא מחובר");

      const { data, error } = await supabase
        .from("event_requests")
        .insert({
          business_id: businessId,
          event_id: input.event_id,
          requested_by: userId,
          kind: input.kind as EventRequestKind,
          shift_label: input.kind === "staffing" ? input.shift_label?.trim() || null : null,
          note: input.note?.trim() || null,
          lines: input.lines,
        })
        .select(SELECT)
        .single();

      if (error) throw error;
      return data as EventRequest;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event_requests", businessId] });
    },
  });
}

export function useUpdateEventRequestStatus(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: EventRequestStatus }) => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) throw new Error("לא מחובר");

      const now = new Date().toISOString();
      const { error } = await supabase
        .from("event_requests")
        .update({
          status: input.status,
          status_updated_by: userId,
          status_updated_at: now,
          updated_at: now,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      if (!businessId) return;
      await qc.cancelQueries({ queryKey: ["event_requests", businessId] });
      // Optimistic status flip on every cached list (per-event and all-events).
      qc.setQueriesData<EventRequest[]>({ queryKey: ["event_requests", businessId] }, (prev) =>
        prev?.map((r) => (r.id === input.id ? { ...r, status: input.status } : r)),
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["event_requests", businessId] });
    },
  });
}

/**
 * Manager fills staffing slots / ticks supply items. Writes the whole `lines`
 * array back together with the status that follows from it.
 */
export function useUpdateEventRequestLines(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; lines: EventRequest["lines"]; status: EventRequestStatus }) => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) throw new Error("לא מחובר");

      const now = new Date().toISOString();
      const { error } = await supabase
        .from("event_requests")
        .update({
          lines: input.lines,
          status: input.status,
          status_updated_by: userId,
          status_updated_at: now,
          updated_at: now,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      if (!businessId) return;
      await qc.cancelQueries({ queryKey: ["event_requests", businessId] });
      qc.setQueriesData<EventRequest[]>({ queryKey: ["event_requests", businessId] }, (prev) =>
        prev?.map((r) => (r.id === input.id ? { ...r, lines: input.lines, status: input.status } : r)),
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["event_requests", businessId] });
    },
  });
}

export function useDeleteEventRequest(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event_requests", businessId] });
    },
  });
}

/** Email the business managers about a new request. Non-critical — errors are swallowed. */
export async function notifyEventRequestCreated(requestId: string): Promise<void> {
  try {
    await supabase.functions.invoke("send-event-request-email", { body: { request_id: requestId } });
  } catch {
    // notification is best-effort
  }
}

/* ------------------------------------------------------------------ *
 * Event tasks the event manager added — surfaced to the manager next to
 * the requests, so "she added tasks" is also something he gets told about.
 * ------------------------------------------------------------------ */

export interface EventManagerTaskRow {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: TaskStatus;
  created_at: string;
  assigned_by: string | null;
  assigner: { full_name: string | null; role: UserRole } | null;
  assignee: { full_name: string | null } | null;
  department: { name: string } | null;
  event: { title: string; event_date: string } | null;
}

export function useEventManagerTasks(businessId: string | null, options?: { poll?: boolean }) {
  return useQuery({
    queryKey: ["event_manager_tasks", businessId],
    enabled: !!businessId,
    refetchInterval: options?.poll ? 60_000 : false,
    queryFn: async (): Promise<EventManagerTaskRow[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          `
          id, event_id, title, description, due_date, status, created_at, assigned_by,
          assigner:assigned_by(full_name, role),
          assignee:assigned_to(full_name),
          department:department_id(name),
          event:event_id(title, event_date)
        `,
        )
        .eq("business_id", businessId!)
        .not("event_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = (data ?? []) as unknown as EventManagerTaskRow[];
      return rows.filter((t) => t.assigner?.role === "event_manager");
    },
  });
}

/* ------------------------------------------------------------------ *
 * Product catalog for the supplies picker.
 * Deliberately lighter than `useInventory` — the event manager only needs
 * names/units, and has no access to counts, orders or warehouses.
 * ------------------------------------------------------------------ */

export interface CatalogItem {
  id: string;
  name: string;
  unit: string | null;
  category_id: string | null;
  image_url: string | null;
}

export function useCatalogItems(businessId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["catalog_items", businessId],
    enabled: !!businessId && enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CatalogItem[]> => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("id, name, unit, category_id, image_url")
        .eq("business_id", businessId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CatalogItem[];
    },
  });
}
