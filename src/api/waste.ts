import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { logInventory } from "@/api/inventory";
import type { InventoryWaste } from "@/types/database";

export function useWaste(businessId: string | null) {
  return useQuery({
    queryKey: ["inventory_waste", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<InventoryWaste[]> => {
      const { data, error } = await supabase
        .from("inventory_waste")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InventoryWaste[];
    },
  });
}

export function useCreateWaste(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      item_id: string;
      employee_id?: string | null;
      quantity: number;
      note?: string | null;
      /** When true, deduct the waste quantity from the latest inventory count. */
      deductFromInventory?: boolean;
      /** Current quantity in stock (used to compute the new count). */
      currentQty?: number;
      warehouse_id?: string | null;
    }) => {
      const { deductFromInventory, currentQty, warehouse_id: inputWarehouseId, ...wasteInput } = input;
      const { error } = await supabase.from("inventory_waste").insert({
        business_id: wasteInput.business_id,
        item_id: wasteInput.item_id,
        employee_id: wasteInput.employee_id ?? null,
        quantity: wasteInput.quantity,
        note: wasteInput.note ?? null,
        deducted: !!deductFromInventory,
      });
      if (error) throw error;

      let resolvedWarehouseId: string | null = null;
      if (deductFromInventory) {
        resolvedWarehouseId = inputWarehouseId ?? null;
        if (!resolvedWarehouseId) {
          const { data: wh } = await supabase
            .from("warehouses")
            .select("id")
            .eq("business_id", wasteInput.business_id)
            .eq("is_default", true)
            .maybeSingle();
          resolvedWarehouseId = wh?.id ?? null;
        }
        if (!resolvedWarehouseId) throw new Error("לא נמצא מחסן להפחתת בלאי");

        const { data: latestCount } = await supabase
          .from("inventory_counts")
          .select("quantity")
          .eq("business_id", wasteInput.business_id)
          .eq("item_id", wasteInput.item_id)
          .eq("warehouse_id", resolvedWarehouseId)
          .order("counted_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const warehouseCurrent = Number(latestCount?.quantity ?? 0);
        const warehouseNext = Math.max(0, warehouseCurrent - wasteInput.quantity);

        const { error: countError } = await supabase.from("inventory_counts").insert({
          business_id: wasteInput.business_id,
          item_id: wasteInput.item_id,
          warehouse_id: resolvedWarehouseId,
          employee_id: wasteInput.employee_id ?? null,
          quantity: warehouseNext,
        });
        if (countError) throw countError;
      }

      await logInventory({
        business_id: wasteInput.business_id,
        item_id: wasteInput.item_id,
        warehouse_id: resolvedWarehouseId,
        employee_id: wasteInput.employee_id ?? null,
        action: "waste",
        previous_qty: deductFromInventory ? currentQty ?? null : null,
        new_qty: wasteInput.quantity,
        note: [wasteInput.note, deductFromInventory ? "(הופחת מהמלאי)" : null].filter(Boolean).join(" ") || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_waste", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory_logs"] });
    },
  });
}
