"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_FINANCE_SETTINGS, type FinanceSettings } from "@/lib/stock-settings";

const Ctx = createContext<FinanceSettings>(DEFAULT_FINANCE_SETTINGS);

/** Mounted by the financeiro layout with the store's lançamento categories. */
export function FinanceSettingsProvider({
  settings,
  isAdmin,
  children,
}: {
  settings: FinanceSettings;
  /** Admins can jump to Configurações → Financeiro from the category menu. */
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ ...settings, isAdmin }), [settings, isAdmin]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFinanceSettings(): FinanceSettings & { isAdmin?: boolean } {
  return useContext(Ctx) as FinanceSettings & { isAdmin?: boolean };
}

/** id → name for the store's lançamento categories (with legacy fallbacks). */
export function useCategoryLabels(): Record<string, string> {
  const { categories } = useFinanceSettings();
  return useMemo(
    () => ({
      vendas: "Vendas",
      compras: "Insumos",
      salarios: "Salários",
      aluguel: "Aluguel",
      ...Object.fromEntries(categories.map((c) => [c.id, c.name])),
    }),
    [categories],
  );
}
