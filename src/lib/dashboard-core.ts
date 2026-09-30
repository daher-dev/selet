/**
 * Pure aggregation for Visão geral + Financeiro "evolução" widgets — no I/O,
 * so both pages and the unit tests share the exact same math.
 *
 *  - summarizeRecent: the "últimos 30 dias" block, from a bounded orders list.
 *  - monthlySeries:   the 12-month evolution rows, from the summary doc.
 */
import type { Order } from "./types";
import {
  activeCustomerCount,
  customerKey,
  monthCustomerSplit,
  type SummaryData,
} from "./summary-core";

export interface RankedItem {
  name: string;
  qty: number;
}

export interface RecentSummary {
  orderCount: number;
  /** distinct customers with at least one order in the window */
  activeCustomers: number;
  topProducts: RankedItem[];
  topFlavors: RankedItem[];
}

function topN(map: Map<string, RankedItem>, n: number): RankedItem[] {
  return [...map.values()]
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, n);
}

/**
 * Aggregates the non-cancelled orders of a window. Top produtos ranks by line
 * qty (cartela SALE lines are not products and are skipped). Top sabores
 * ranks shake + pudim flavors, each selected flavor weighted by its line qty;
 * `flavorNames` resolves ids (shake and pudim ids never collide — both are
 * Firestore auto ids); unknown ids are skipped.
 */
export function summarizeRecent(
  orders: Order[],
  flavorNames: Map<string, string>,
  n = 5,
): RecentSummary {
  const active = orders.filter((o) => o.status !== "cancelado");
  const customers = new Set<string>();
  const products = new Map<string, RankedItem>();
  const flavors = new Map<string, RankedItem>();
  for (const o of active) {
    customers.add(customerKey(o.customerId, o.customerName));
    for (const item of o.items) {
      if (item.cartelaSale) continue;
      const p = products.get(item.productId) ?? { name: item.name, qty: 0 };
      p.qty += item.qty;
      products.set(item.productId, p);
      const ids = [...(item.shake?.flavorIds ?? []), ...(item.pudim?.flavorIds ?? [])];
      for (const id of ids) {
        const name = flavorNames.get(id);
        if (!name) continue;
        const f = flavors.get(id) ?? { name, qty: 0 };
        f.qty += item.qty;
        flavors.set(id, f);
      }
    }
  }
  return {
    orderCount: active.length,
    activeCustomers: customers.size,
    topProducts: topN(products, n),
    topFlavors: topN(flavors, n),
  };
}

const MONTH_SHORT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

/** "2026-07" → "Jul". */
export function monthShort(key: string): string {
  return MONTH_SHORT[Number(key.split("-")[1]) - 1] ?? key;
}

/** The `count` month keys ending at `lastKey` (inclusive), oldest first. */
export function trailingMonthKeys(lastKey: string, count: number): string[] {
  const [y, m] = lastKey.split("-").map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const total = y * 12 + (m - 1) - i;
    const yy = Math.floor(total / 12);
    const mm = (total % 12) + 1;
    out.push(`${yy}-${String(mm).padStart(2, "0")}`);
  }
  return out;
}

export interface MonthPoint {
  key: string;
  label: string;
  /** faturamento: Σ order totals opened that month (centavos) */
  sales: number;
  /** % change vs the previous month's sales; null when there's no base */
  mom: number | null;
  /** the current, still-open month */
  partial: boolean;
  orderCount: number;
  channels: { instagram: number; whatsapp: number; loja: number };
  novos: number;
  recorrentes: number;
  /** finance in/out (centavos) */
  in: number;
  out: number;
  avgTicket: number;
  activeCustomers: number;
}

/** One row per month in `keys`, read from the summary (absent → zeros). */
export function monthlySeries(
  summary: SummaryData,
  keys: string[],
  currentKey: string,
): MonthPoint[] {
  let prevSales: number | null = null;
  // Seed the MoM base with the month just before the window, when present.
  const before = trailingMonthKeys(keys[0], 2)[0];
  if (summary.months[before]) prevSales = summary.months[before].ticketSum;
  return keys.map((key) => {
    const b = summary.months[key];
    const sales = b?.ticketSum ?? 0;
    const mom =
      prevSales && prevSales > 0
        ? Math.round(((sales - prevSales) / prevSales) * 1000) / 10
        : null;
    prevSales = sales;
    const split = monthCustomerSplit(summary, key);
    return {
      key,
      label: monthShort(key),
      sales,
      mom,
      partial: key === currentKey,
      orderCount: b?.orderCount ?? 0,
      channels: {
        instagram: b?.channels.instagram ?? 0,
        whatsapp: b?.channels.whatsapp ?? 0,
        loja: b?.channels.loja ?? 0,
      },
      novos: split.novos,
      recorrentes: split.recorrentes,
      in: b?.in ?? 0,
      out: b?.out ?? 0,
      avgTicket: b && b.orderCount ? Math.round(b.ticketSum / b.orderCount) : 0,
      activeCustomers: activeCustomerCount(b),
    };
  });
}
