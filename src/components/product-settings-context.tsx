"use client";

import { createContext, useContext, useMemo } from "react";
import { buildProductCategoryMeta, type CategoryMeta } from "@/components/category-meta";
import { DEFAULT_PRODUCT_SETTINGS, type ProductSettings } from "@/lib/stock-settings";

const Ctx = createContext<ProductSettings>(DEFAULT_PRODUCT_SETTINGS);

/** Mounted once in the store layout with the store's Cardápio categories. */
export function ProductSettingsProvider({
  settings,
  children,
}: {
  settings: ProductSettings;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={settings}>{children}</Ctx.Provider>;
}

/** The store's Cardápio categories, in the order set in Configurações. */
export function useProductCategories() {
  return useContext(Ctx).categories;
}

/** id → meta for the store's Cardápio categories (unknown ids: caller falls back to a neutral tile). */
export function useProductCategoryMeta(): Record<string, CategoryMeta> {
  const categories = useProductCategories();
  return useMemo(() => buildProductCategoryMeta(categories), [categories]);
}
