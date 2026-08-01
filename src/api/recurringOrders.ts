import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { RecurringOrder, RecurringOrderItem } from "@/types/database";

export interface RecurringOrderWithItems extends RecurringOrder {
  items: RecurringOrderItem[];
}

/** One product inside a saved template. */
export interface RecurringOrderLineInput {
  item_id: string;
  supplier_id: string | null;
  quantity: number;
}

export function useRecurringOrders(businessId: string | null) {
  return useQuery({
    queryKey: ["recurring_orders", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<RecurringOrderWithItems[]> => {
      const { data, error } = await supabase
        .from("recurring_orders")
        .select("*, items:recurring_order_items(*)")
        .eq("business_id", businessId)
        .order("last_used_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({ ...row, items: row.items ?? [] })) as RecurringOrderWithItems[];
    },
  });
}

async function replaceLines(
  businessId: string,
  recurringOrderId: string,
  lines: RecurringOrderLineInput[],
) {
  const { error: delError } = await supabase
    .from("recurring_order_items")
    .delete()
    .eq("recurring_order_id", recurringOrderId);
  if (delError) throw delError;

  if (!lines.length) return;
  const { error } = await supabase.from("recurring_order_items").insert(
    lines.map((l) => ({
      business_id: businessId,
      recurring_order_id: recurringOrderId,
      item_id: l.item_id,
      supplier_id: l.supplier_id,
      quantity: l.quantity,
    })),
  );
  if (error) throw error;
}

export function useSaveRecurringOrder(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      /** Set to overwrite an existing template instead of creating a new one. */
      id?: string;
      business_id: string;
      name: string;
      notes?: string | null;
      created_by?: string | null;
      lines: RecurringOrderLineInput[];
    }) => {
      let id = input.id;
      if (id) {
        const { error } = await supabase
          .from("recurring_orders")
          .update({ name: input.name, notes: input.notes ?? null })
          .eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("recurring_orders")
          .insert({
            business_id: input.business_id,
            name: input.name,
            notes: input.notes ?? null,
            created_by: input.created_by ?? null,
          })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id as string;
      }
      await replaceLines(input.business_id, id, input.lines);
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring_orders", businessId] }),
  });
}

export function useDeleteRecurringOrder(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recurring_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring_orders", businessId] }),
  });
}

/** Records that an order was started from a template, so the list stays ordered by real use. */
export function useTouchRecurringOrder(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("recurring_orders")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring_orders", businessId] }),
  });
}

/** A duplicate name is the one failure worth explaining in the form itself. */
export function recurringOrderSaveError(e: unknown): string {
  const code = (e as { code?: string } | null)?.code;
  if (code === "23505") return "כבר קיימת הזמנה קבועה בשם הזה";
  const message = (e as { message?: string } | null)?.message;
  return message ? `שמירת ההזמנה הקבועה נכשלה: ${message}` : "שמירת ההזמנה הקבועה נכשלה";
}
