"use server";

import { requireAccess } from "@/lib/access";
import { loadPeriods } from "@/app/painel/[storeId]/dashboard-data";
import type { MonthPoint, PeriodUnit } from "@/lib/dashboard-core";

export type PeriodsResult = { ok: true; points: MonthPoint[] } | { ok: false; error: string };

/** Weekly / daily series for the Visão geral "Semanal" / "Diário" toggle (Pedidos access). */
export async function loadPeriodsAction(storeId: string, unit: PeriodUnit): Promise<PeriodsResult> {
  try {
    await requireAccess(storeId, "pedidos");
    return { ok: true, points: await loadPeriods(storeId, unit, new Date()) };
  } catch {
    return { ok: false, error: "Não foi possível carregar o período." };
  }
}
