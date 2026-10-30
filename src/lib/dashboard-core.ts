/**
 * Pure aggregation for Visão geral + Financeiro "evolução" widgets — no I/O,
 * so both pages and the unit tests share the exact same math.
 *
 *  - summarizeRecent: the "últimos 30 dias" block, from a bounded orders list.
 *  - monthlySeries:   the 12-month evolution rows, from the summary doc.
 */
import type { Order } from "./types";
import { zonedParts } from "./timezone";
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
  const active = orders.filter((o) => o.status !== "cancelado" && !o.internal);
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
  /** the current, still-open month (or week) */
  partial: boolean;
  /** tooltip title when it isn't the month name (weekly points) */
  title?: string;
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
    const split = monthCustomerSplit(b);
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

/** Finer-than-month views of Evolução. Both cover the same 12 months as the monthly view (the daily chart is just denser, weekdays only). */
export type PeriodUnit = "week" | "day";
export const EVOLUTION_BUCKETS: Record<PeriodUnit, number> = { week: 52, day: 365 };

const DAY_MS = 86_400_000;
const WEEKDAY_ABBR = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTH_ABBR = [
  "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
];

/** Calendar date of an instant in STORE_TIME_ZONE as a day number (days since epoch, UTC-safe). */
function zonedDayNumber(d: Date): number {
  const p = zonedParts(d);
  return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / DAY_MS);
}

/** Day number of the Monday that starts the week containing `day` (weeks start on Monday, pt-BR). */
function mondayOf(day: number): number {
  // 1970-01-01 (day 0) was a Thursday → (day + 3) % 7 is 0 on Mondays.
  return day - ((day + 3) % 7);
}

/** "5 out" for a day number. */
function dayLabel(day: number): string {
  const d = new Date(day * DAY_MS);
  return `${d.getUTCDate()} ${MONTH_ABBR[d.getUTCMonth()]}`;
}

/** Month (0–11) of a day number. */
function monthOf(day: number): number {
  return new Date(day * DAY_MS).getUTCMonth();
}

/** Day number of the first bucket shown (the oldest) for `unit`, given today's day number. */
export function periodStart(unit: PeriodUnit, today: number, count = EVOLUTION_BUCKETS[unit]): number {
  const last = unit === "week" ? mondayOf(today) : today;
  return last - (count - 1) * (unit === "week" ? 7 : 1);
}

/**
 * Last `count` weeks (Monday–Sunday in STORE_TIME_ZONE) or days, the current
 * one last, in the same shape as `monthlySeries` so the same charts render it;
 * `mom` carries the week-over-week / day-over-day change (null for the open
 * bucket, which is partial).
 *
 * Clientes are distinct PER BUCKET (a client who ordered in two weeks counts
 * once in each, so buckets don't sum to a month). Same split as the month:
 * "novo" when the registered customer's `firstOrderAt` falls in that bucket,
 * "recorrente" otherwise (walk-ins without an id are always recorrentes).
 */
export function periodSeries(input: {
  unit: PeriodUnit;
  orders: Pick<Order, "status" | "total" | "channel" | "customerId" | "customerName" | "createdAt">[];
  /** customerId → first non-cancelled order (complete history) */
  firstOrderAt: Map<string, Date>;
  now: Date;
  count?: number;
}): MonthPoint[] {
  const { unit } = input;
  const size = unit === "week" ? 7 : 1;
  const count = input.count ?? EVOLUTION_BUCKETS[unit];
  const today = zonedDayNumber(input.now);
  const firstStart = periodStart(unit, today, count);
  // Daily view skips Saturdays and Sundays ((day + 3) % 7 is 0 on Mondays … 5 Saturday, 6 Sunday).
  const starts = Array.from({ length: count }, (_, i) => firstStart + i * size).filter(
    (d) => unit === "week" || (d + 3) % 7 < 5,
  );
  const slotOf = new Map(starts.map((d, i) => [d, i]));
  /** Index of the bucket holding `date`, or -1 outside the window (or on a skipped weekend). */
  const weekOf = (date: Date): number => {
    const day = zonedDayNumber(date);
    return slotOf.get(unit === "week" ? mondayOf(day) : day) ?? -1;
  };
  const currentStart = unit === "week" ? mondayOf(today) : today;

  const rows = starts.map(() => ({
    sales: 0,
    orderCount: 0,
    channels: { instagram: 0, whatsapp: 0, loja: 0 },
    customers: new Set<string>(),
    registered: new Set<string>(),
  }));
  for (const o of input.orders) {
    if (o.status === "cancelado") continue;
    const w = weekOf(new Date(o.createdAt));
    if (w < 0) continue;
    const r = rows[w];
    r.sales += o.total ?? 0;
    r.orderCount += 1;
    r.channels[o.channel] += 1;
    r.customers.add(customerKey(o.customerId, o.customerName));
    if (o.customerId) r.registered.add(o.customerId);
  }

  return rows.map((r, i) => {
    let novos = 0;
    for (const id of r.registered) {
      const first = input.firstOrderAt.get(id);
      if (first && weekOf(first) === i) novos += 1;
    }
    const start = starts[i];
    const partial = start === currentStart;
    const first = i === 0 || monthOf(starts[i - 1]) !== monthOf(start);
    const prev = rows[i - 1];
    const mom =
      prev && prev.sales > 0 && !partial
        ? Math.round(((r.sales - prev.sales) / prev.sales) * 1000) / 10
        : null;
    const iso = new Date(start * DAY_MS).toISOString().slice(0, 10);
    return {
      key: iso,
      // Daily bars are hairline-thin over 12 months: a month's first bar is labelled by its name ("nov").
      label:
        unit === "day" && first && i > 0
          ? MONTH_ABBR[monthOf(start)]
          : `${new Date(start * DAY_MS).getUTCDate()}/${String(new Date(start * DAY_MS).getUTCMonth() + 1).padStart(2, "0")}`,
      title:
        unit === "week"
          ? `Semana de ${dayLabel(start)} a ${dayLabel(start + 6)}`
          : `${WEEKDAY_ABBR[new Date(start * DAY_MS).getUTCDay()]}, ${dayLabel(start)}`,
      sales: r.sales,
      mom,
      partial,
      orderCount: r.orderCount,
      channels: r.channels,
      novos,
      recorrentes: r.customers.size - novos,
      in: 0,
      out: 0,
      avgTicket: r.orderCount ? Math.round(r.sales / r.orderCount) : 0,
      activeCustomers: r.customers.size,
    };
  });
}
