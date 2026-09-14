import { useMemo } from "react";
import { useInventory, type ItemWithQty } from "@/api/inventory";
import { useMenuCategories, useMenuSettings, useMenuTree } from "@/api/menu";
import { useSupplierItemPriceIndex, useSuppliers } from "@/api/suppliers";
import {
  costAllDishes,
  dishEconomics,
  itemUsageIndex,
  type CostingContext,
  type DishCost,
  type DishEconomics,
} from "@/lib/menuCosting";
import type { InventoryItem, MenuCategory, MenuDish, MenuDishComponent, MenuItemConversion, MenuSettings } from "@/types/database";

export interface CostedDish {
  dish: MenuDish;
  cost: DishCost;
  economics: DishEconomics;
}

export interface MenuCostingData {
  ctx: CostingContext;
  settings: MenuSettings;
  categories: MenuCategory[];
  items: ItemWithQty[];
  itemsById: Map<string, InventoryItem>;
  suppliersById: Map<string, string>;
  dishes: CostedDish[];
  costs: Map<string, DishCost>;
  componentsByDish: Map<string, MenuDishComponent[]>;
  conversions: Map<string, MenuItemConversion>;
  /** item_id → dishes that consume it. */
  itemUsage: Map<string, MenuDish[]>;
}

/**
 * Everything the menu screens need, costed once and shared.
 * Prices come straight from the supplier price lists so the numbers are always live.
 */
export function useMenuCosting(businessId: string | null) {
  const tree = useMenuTree(businessId);
  const settings = useMenuSettings(businessId);
  const categories = useMenuCategories(businessId);
  const inventory = useInventory(businessId);
  const priceIndex = useSupplierItemPriceIndex(businessId);
  const suppliers = useSuppliers(businessId);

  const isLoading =
    tree.isLoading || settings.isLoading || categories.isLoading || inventory.isLoading || priceIndex.isLoading;
  const error = tree.error ?? settings.error ?? categories.error ?? inventory.error ?? priceIndex.error ?? null;

  const data = useMemo<MenuCostingData | null>(() => {
    if (!tree.data || !settings.data || !inventory.data) return null;

    const itemsById = new Map<string, InventoryItem>(inventory.data.map((i) => [i.id, i]));
    const dishesById = new Map(tree.data.dishes.map((d) => [d.id, d]));
    const componentsByDish = new Map<string, MenuDishComponent[]>();
    for (const c of tree.data.components) {
      const list = componentsByDish.get(c.dish_id);
      if (list) list.push(c);
      else componentsByDish.set(c.dish_id, [c]);
    }
    const conversions = new Map(tree.data.conversions.map((c) => [c.item_id, c]));

    const ctx: CostingContext = {
      items: itemsById,
      dishes: dishesById,
      componentsByDish,
      conversions,
      priceIndex: priceIndex.data,
    };

    const costs = costAllDishes(ctx);
    const costed: CostedDish[] = tree.data.dishes.map((dish) => {
      const cost = costs.get(dish.id)!;
      return { dish, cost, economics: dishEconomics(dish, cost, settings.data!) };
    });

    return {
      ctx,
      settings: settings.data,
      categories: categories.data ?? [],
      items: inventory.data,
      itemsById,
      suppliersById: new Map((suppliers.data ?? []).map((s) => [s.id, s.name])),
      dishes: costed,
      costs,
      componentsByDish,
      conversions,
      itemUsage: itemUsageIndex(costs, dishesById),
    };
  }, [tree.data, settings.data, categories.data, inventory.data, priceIndex.data, suppliers.data]);

  return {
    data,
    isLoading,
    error,
    refetch: () => {
      tree.refetch();
      settings.refetch();
      categories.refetch();
      inventory.refetch();
      priceIndex.refetch();
    },
  };
}
