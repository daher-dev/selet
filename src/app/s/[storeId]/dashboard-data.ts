import "server-only";

import { listOrders } from "@/data/orders";
import { listUpcomingBirthdays } from "@/data/customers";
import { listLowStock } from "@/data/stock";
import { listShakeFlavors } from "@/data/shakes";
import { listPudimFlavors } from "@/data/pudim";
import type { SummaryData } from "@/data/summary";
import {
  monthlySeries,
  summarizeRecent,
  trailingMonthKeys,
  type MonthPoint,
  type RankedItem,
} from "@/lib/dashboard-core";
import { computeSummaryFrom, monthKey } from "@/lib/summary-core";
import { addZonedMonths, zonedParts, zonedTimeToUtc } from "@/lib/timezone";
import type { Customer } from "@/lib/types";

/** Everything DashboardClient renders — same shape with or without a summary. */
export interface DashboardView {
  /** null when the section is hidden for this member */
  kpis: {
    activeCustomers: number | null;
    orders: number | null;
    birthdays: number | null;
    lowStock: number | null;
  };
  topProducts: RankedItem[] | null;
  topFlavors: RankedItem[] | null;
  /** 12 months, oldest first; null without pedidos access */
  months: MonthPoint[] | null;
}

/** Rolling window of the "Resumo" block. */
export const RECENT_DAYS = 30;
/** Months shown in "Evolução mensal". */
export const EVOLUTION_MONTHS = 12;

/** Active customers whose next birthday lands within the next 30 days. */
export function countUpcomingBirthdays(customers: Customer[], now: Date): number {
  const { year, month, day } = zonedParts(now);
  const today = zonedTimeToUtc(year, month, day);
  return customers.filter((c) => {
    if (c.archived || !c.birthday) return false;
    const b = c.birthday;
    let next = zonedTimeToUtc(year, b.month, b.day);
    if (next < today) next = zonedTimeToUtc(year + 1, b.month, b.day);
    const inDays = Math.round((next.getTime() - today.getTime()) / 86_400_000);
    return inDays <= 30;
  }).length;
}

/**
 * Loads the Visão geral widgets.
 *
 * The "últimos 30 dias" block always comes from ONE bounded orders query
 * (createdAt >= now − 30d) — the summary is bucketed by calendar month and
 * can't answer a rolling window. The 12-month evolution PREFERS the
 * materialized summary; when it's absent, it recomputes the same buckets from
 * a bounded 12-month orders scan so the page never breaks.
 */
export async function loadDashboard(ctx: {
  storeId: string;
  summary: SummaryData | null;
  now: Date;
  canPedidos: boolean;
  canClientes: boolean;
  canEstoque: boolean;
}): Promise<DashboardView> {
  const { storeId, summary, now, canPedidos, canClientes, canEstoque } = ctx;
  const since = new Date(now.getTime() - RECENT_DAYS * 86_400_000);
  const currentKey = monthKey(now);
  const keys = trailingMonthKeys(currentKey, EVOLUTION_MONTHS);

  const [recentOrders, shakeFlavors, pudimFlavors, birthdayCustomers, lowItems] =
    await Promise.all([
      canPedidos || canClientes ? listOrders(storeId, { since }) : Promise.resolve([]),
      canPedidos ? listShakeFlavors(storeId) : Promise.resolve([]),
      canPedidos ? listPudimFlavors(storeId) : Promise.resolve([]),
      canClientes ? listUpcomingBirthdays(storeId) : Promise.resolve([]),
      // The summary already counts low-stock items; only scan without it.
      canEstoque && !summary ? listLowStock(storeId, 500) : Promise.resolve([]),
    ]);

  const flavorNames = new Map<string, string>();
  for (const f of [...shakeFlavors, ...pudimFlavors]) flavorNames.set(f.id, f.name);
  const recent = summarizeRecent(recentOrders, flavorNames);

  let months: MonthPoint[] | null = null;
  if (canPedidos) {
    let source = summary;
    if (!source) {
      // Fallback: one month extra so the first bar still gets a MoM base.
      const start = addZonedMonths(now, -EVOLUTION_MONTHS);
      const orders = await listOrders(storeId, { since: start });
      source = computeSummaryFrom({
        orders: orders.map((o) => ({ ...o, createdAt: new Date(o.createdAt) })),
        finance: [],
        stock: [],
        customers: [],
      });
    }
    months = monthlySeries(source, keys, currentKey);
  }

  return {
    kpis: {
      activeCustomers: canClientes ? recent.activeCustomers : null,
      orders: canPedidos ? recent.orderCount : null,
      birthdays: canClientes ? countUpcomingBirthdays(birthdayCustomers, now) : null,
      lowStock: canEstoque ? (summary ? summary.lowStock : lowItems.length) : null,
    },
    topProducts: canPedidos ? recent.topProducts : null,
    topFlavors: canPedidos ? recent.topFlavors : null,
    months,
  };
}
