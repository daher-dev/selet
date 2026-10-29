"use server";

import { requireAccess } from "@/lib/access";
import { loadWeeks } from "@/app/painel/[storeId]/dashboard-data";
import type { MonthPoint } from "@/lib/dashboard-core";

export type WeeksResult = { ok: true; weeks: MonthPoint[] } | { ok: false; error: string };

/** Weekly series for the Visão geral "Semanal" toggle (Pedidos access). */
export async function loadWeeksAction(storeId: string): Promise<WeeksResult> {
  try {
    await requireAccess(storeId, "pedidos");
    return { ok: true, weeks: await loadWeeks(storeId, new Date()) };
  } catch {
    return { ok: false, error: "Não foi possível carregar as semanas." };
  }
}
