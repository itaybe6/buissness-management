import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compressImage } from "@/lib/compressImage";
import { supabase } from "@/lib/supabase";
import { DEFAULT_MENU_SETTINGS } from "@/lib/menuCosting";
import type {
  MenuCategory,
  MenuComponentUnit,
  MenuDish,
  MenuDishComponent,
  MenuDishKind,
  MenuItemConversion,
  MenuMeasure,
  MenuSettings,
} from "@/types/database";

function throwDbError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const MENU_KEY = "menu";

function invalidateMenu(qc: ReturnType<typeof useQueryClient>, businessId: string | null) {
  qc.invalidateQueries({ queryKey: [MENU_KEY, businessId] });
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function useMenuSettings(businessId: string | null) {
  return useQuery({
    queryKey: [MENU_KEY, businessId, "settings"],
    enabled: !!businessId,
    queryFn: async (): Promise<MenuSettings> => {
      const { data, error } = await supabase.from("menu_settings").select("*").eq("business_id", businessId!).maybeSingle();
      throwDbError(error);
      if (data) {
        return {
          ...(data as MenuSettings),
          vat_pct: Number(data.vat_pct),
          target_food_cost_pct: Number(data.target_food_cost_pct),
        };
      }
      return { business_id: businessId!, updated_at: new Date(0).toISOString(), ...DEFAULT_MENU_SETTINGS };
    },
  });
}

export function useSaveMenuSettings(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<MenuSettings, "updated_at">) => {
      const { error } = await supabase.from("menu_settings").upsert(
        {
          business_id: input.business_id,
          vat_pct: input.vat_pct,
          prices_include_vat: input.prices_include_vat,
          costs_include_vat: input.costs_include_vat,
          target_food_cost_pct: input.target_food_cost_pct,
        },
        { onConflict: "business_id" },
      );
      throwDbError(error);
    },
    onSuccess: () => invalidateMenu(qc, businessId),
  });
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export function useMenuCategories(businessId: string | null) {
  return useQuery({
    queryKey: [MENU_KEY, businessId, "categories"],
    enabled: !!businessId,
    queryFn: async (): Promise<MenuCategory[]> => {
      const { data, error } = await supabase
        .from("menu_categories")
        .select("*")
        .eq("business_id", businessId!)
        .eq("active", true)
        .order("sort_order")
        .order("name");
      throwDbError(error);
      return (data ?? []) as MenuCategory[];
    },
  });
}

export function useCreateMenuCategory(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { business_id: string; name: string; color?: string | null }) => {
      const name = input.name.trim();
      if (!name) throw new Error("נא להזין שם קטגוריה");
      const { data: existing } = await supabase
        .from("menu_categories")
        .select("sort_order")
        .eq("business_id", input.business_id)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextSort = ((existing?.[0]?.sort_order as number | undefined) ?? 0) + 1;
      const { data, error } = await supabase
        .from("menu_categories")
        .insert({ business_id: input.business_id, name, color: input.color ?? null, sort_order: nextSort })
        .select()
        .single();
      throwDbError(error);
      return data as MenuCategory;
    },
    onSuccess: () => invalidateMenu(qc, businessId),
  });
}

export function useUpdateMenuCategory(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; color?: string | null; sort_order?: number; active?: boolean }) => {
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.color !== undefined) patch.color = input.color;
      if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
      if (input.active !== undefined) patch.active = input.active;
      const { error } = await supabase.from("menu_categories").update(patch).eq("id", input.id);
      throwDbError(error);
    },
    onSuccess: () => invalidateMenu(qc, businessId),
  });
}

export function useDeleteMenuCategory(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("menu_categories").delete().eq("id", id);
      throwDbError(error);
    },
    onSuccess: () => invalidateMenu(qc, businessId),
  });
}

/* ------------------------------------------------------------------ */
/* Dishes + components                                                 */
/* ------------------------------------------------------------------ */

export interface MenuTree {
  dishes: MenuDish[];
  components: MenuDishComponent[];
  conversions: MenuItemConversion[];
}

function normalizeDish(row: Record<string, unknown>): MenuDish {
  return {
    ...(row as unknown as MenuDish),
    selling_price: row.selling_price == null ? null : Number(row.selling_price),
    yield_qty: Number(row.yield_qty ?? 1),
    yield_measure: ((row.yield_measure as MenuMeasure | null) ?? "unit") as MenuMeasure,
    target_food_cost_pct: row.target_food_cost_pct == null ? null : Number(row.target_food_cost_pct),
    monthly_sales: row.monthly_sales == null ? null : Number(row.monthly_sales),
  };
}

function normalizeComponent(row: Record<string, unknown>): MenuDishComponent {
  return {
    ...(row as unknown as MenuDishComponent),
    quantity: Number(row.quantity),
    waste_pct: Number(row.waste_pct ?? 0),
    unit: ((row.unit as MenuComponentUnit | null) ?? "g") as MenuComponentUnit,
  };
}

function normalizeConversion(row: Record<string, unknown>): MenuItemConversion {
  return {
    ...(row as unknown as MenuItemConversion),
    content_qty: row.content_qty == null ? null : Number(row.content_qty),
    manual_unit_cost: row.manual_unit_cost == null ? null : Number(row.manual_unit_cost),
  };
}

/** The whole menu in one shot: dishes, every component line, and item conversions. */
export function useMenuTree(businessId: string | null) {
  return useQuery({
    queryKey: [MENU_KEY, businessId, "tree"],
    enabled: !!businessId,
    queryFn: async (): Promise<MenuTree> => {
      const [dishesRes, componentsRes, conversionsRes] = await Promise.all([
        supabase.from("menu_dishes").select("*").eq("business_id", businessId!).order("sort_order").order("name"),
        supabase.from("menu_dish_components").select("*").eq("business_id", businessId!).order("sort_order"),
        supabase.from("menu_item_conversions").select("*").eq("business_id", businessId!),
      ]);
      throwDbError(dishesRes.error);
      throwDbError(componentsRes.error);
      throwDbError(conversionsRes.error);
      return {
        dishes: (dishesRes.data ?? []).map((r) => normalizeDish(r as Record<string, unknown>)),
        components: (componentsRes.data ?? []).map((r) => normalizeComponent(r as Record<string, unknown>)),
        conversions: (conversionsRes.data ?? []).map((r) => normalizeConversion(r as Record<string, unknown>)),
      };
    },
  });
}

export interface DishInput {
  category_id: string | null;
  kind: MenuDishKind;
  name: string;
  description: string | null;
  image_url: string | null;
  selling_price: number | null;
  yield_qty: number;
  yield_measure: MenuMeasure;
  target_food_cost_pct: number | null;
  monthly_sales: number | null;
  notes: string | null;
  active?: boolean;
}

export interface ComponentInput {
  item_id: string | null;
  sub_dish_id: string | null;
  quantity: number;
  unit: MenuComponentUnit;
  waste_pct: number;
  supplier_id: string | null;
  notes: string | null;
}

function dishRow(input: DishInput) {
  return {
    category_id: input.kind === "dish" ? input.category_id : null,
    kind: input.kind,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    image_url: input.image_url,
    selling_price: input.kind === "dish" ? input.selling_price : null,
    yield_qty: input.yield_qty > 0 ? input.yield_qty : 1,
    yield_measure: input.yield_measure,
    target_food_cost_pct: input.kind === "dish" ? input.target_food_cost_pct : null,
    monthly_sales: input.kind === "dish" ? input.monthly_sales : null,
    notes: input.notes?.trim() || null,
    ...(input.active !== undefined ? { active: input.active } : {}),
  };
}

async function replaceComponents(businessId: string, dishId: string, lines: ComponentInput[]) {
  const { error: delError } = await supabase.from("menu_dish_components").delete().eq("dish_id", dishId);
  throwDbError(delError);
  if (!lines.length) return;
  const rows = lines.map((l, i) => ({
    business_id: businessId,
    dish_id: dishId,
    item_id: l.item_id,
    sub_dish_id: l.sub_dish_id,
    quantity: l.quantity,
    unit: l.unit,
    waste_pct: l.waste_pct,
    supplier_id: l.supplier_id,
    notes: l.notes?.trim() || null,
    sort_order: i,
  }));
  const { error } = await supabase.from("menu_dish_components").insert(rows);
  throwDbError(error);
}

/** Create a dish and its full component list in one go. */
export function useCreateDish(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { business_id: string; dish: DishInput; components: ComponentInput[] }): Promise<string> => {
      if (!input.dish.name.trim()) throw new Error("נא להזין שם למנה");
      const { data: existing } = await supabase
        .from("menu_dishes")
        .select("sort_order")
        .eq("business_id", input.business_id)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextSort = ((existing?.[0]?.sort_order as number | undefined) ?? 0) + 1;

      const { data, error } = await supabase
        .from("menu_dishes")
        .insert({ business_id: input.business_id, sort_order: nextSort, ...dishRow(input.dish) })
        .select("id")
        .single();
      throwDbError(error);
      const dishId = (data as { id: string }).id;
      await replaceComponents(input.business_id, dishId, input.components);
      return dishId;
    },
    onSuccess: () => invalidateMenu(qc, businessId),
  });
}

export function useUpdateDish(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { business_id: string; id: string; dish: DishInput; components?: ComponentInput[] }) => {
      if (!input.dish.name.trim()) throw new Error("נא להזין שם למנה");
      const { error } = await supabase.from("menu_dishes").update(dishRow(input.dish)).eq("id", input.id);
      throwDbError(error);
      if (input.components) await replaceComponents(input.business_id, input.id, input.components);
    },
    onSuccess: () => invalidateMenu(qc, businessId),
  });
}

/** Quick inline edits from the list (price, sales, category) without touching the tree. */
export function usePatchDish(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<Pick<MenuDish, "selling_price" | "monthly_sales" | "category_id" | "active" | "sort_order" | "target_food_cost_pct">> }) => {
      const { error } = await supabase.from("menu_dishes").update(input.patch).eq("id", input.id);
      throwDbError(error);
    },
    onSuccess: () => invalidateMenu(qc, businessId),
  });
}

export function useDeleteDish(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("menu_dishes").delete().eq("id", id);
      throwDbError(error);
    },
    onSuccess: () => invalidateMenu(qc, businessId),
  });
}

export function useDuplicateDish(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { business_id: string; source: MenuDish; components: MenuDishComponent[] }): Promise<string> => {
      const { source } = input;
      const { data, error } = await supabase
        .from("menu_dishes")
        .insert({
          business_id: input.business_id,
          category_id: source.category_id,
          kind: source.kind,
          name: `${source.name} (עותק)`,
          description: source.description,
          image_url: source.image_url,
          selling_price: source.selling_price,
          yield_qty: source.yield_qty,
          yield_measure: source.yield_measure,
          target_food_cost_pct: source.target_food_cost_pct,
          monthly_sales: null,
          notes: source.notes,
          sort_order: source.sort_order + 1,
        })
        .select("id")
        .single();
      throwDbError(error);
      const dishId = (data as { id: string }).id;
      await replaceComponents(
        input.business_id,
        dishId,
        input.components.map((c) => ({
          item_id: c.item_id,
          sub_dish_id: c.sub_dish_id,
          quantity: c.quantity,
          unit: c.unit,
          waste_pct: c.waste_pct,
          supplier_id: c.supplier_id,
          notes: c.notes,
        })),
      );
      return dishId;
    },
    onSuccess: () => invalidateMenu(qc, businessId),
  });
}

/* ------------------------------------------------------------------ */
/* Item conversions                                                    */
/* ------------------------------------------------------------------ */

export function useSaveItemConversion(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_id: string;
      item_id: string;
      content_qty: number | null;
      content_measure: MenuMeasure | null;
      manual_unit_cost: number | null;
    }) => {
      const hasContent = input.content_qty != null && input.content_qty > 0 && !!input.content_measure;
      const row = {
        business_id: input.business_id,
        item_id: input.item_id,
        content_qty: hasContent ? input.content_qty : null,
        content_measure: hasContent ? input.content_measure : null,
        manual_unit_cost: input.manual_unit_cost != null && input.manual_unit_cost > 0 ? input.manual_unit_cost : null,
      };
      if (row.content_qty == null && row.manual_unit_cost == null) {
        const { error } = await supabase.from("menu_item_conversions").delete().eq("item_id", input.item_id);
        throwDbError(error);
        return;
      }
      const { error } = await supabase.from("menu_item_conversions").upsert(row, { onConflict: "item_id" });
      throwDbError(error);
    },
    onSuccess: () => invalidateMenu(qc, businessId),
  });
}

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

export async function uploadDishImage(businessId: string, file: File): Promise<string> {
  const compressed = await compressImage(file, { maxWidth: 1024, maxHeight: 1024, quality: 0.84 });
  const path = `${businessId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("menu").upload(path, compressed, { upsert: false, contentType: "image/jpeg" });
  throwDbError(error);
  const { data } = supabase.storage.from("menu").getPublicUrl(path);
  return data.publicUrl;
}
