"use client";

import { createContext, useContext, useMemo } from "react";
import type { CategoryMeta } from "@/components/category-meta";
import { buildStockCategoryMeta } from "@/components/category-meta";
import {
  DEFAULT_STOCK_SETTINGS,
  unitKind,
  unitLabelFrom,
  type StockSettings,
  type UnitKind,
} from "@/lib/stock-settings";

const Ctx = createContext<StockSettings>(DEFAULT_STOCK_SETTINGS);

/** Mounted once in the store layout with the store's stock categories/units. */
export function StockSettingsProvider({
  settings,
  children,
}: {
  settings: StockSettings;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={settings}>{children}</Ctx.Provider>;
}

export function useStockSettings(): StockSettings {
  return useContext(Ctx);
}

/** id → meta for the store's stock categories (replaces the old static map). */
export function useStockCategoryMeta(): Record<string, CategoryMeta> {
  const { categories } = useStockSettings();
  return useMemo(() => buildStockCategoryMeta(categories), [categories]);
}

/**
 * Unit helpers bound to the store's units. Names mirror the old static helpers
 * so call sites stay `unitLabel(item.unit, plural)` / `isCountUnit(unit)`.
 */
export function useUnits() {
  const { units } = useStockSettings();
  return useMemo(
    () => ({
      units,
      unitLabel: (id: string, plural = false) => unitLabelFrom(units, id, plural),
      unitKind: (id: string): UnitKind => unitKind(units, id),
      isCountUnit: (id: string) => unitKind(units, id) === "count",
    }),
    [units],
  );
}
