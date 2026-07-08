import { requireSessionUser, canAccessSection } from "@/lib/access";
import { listOrders } from "@/data/orders";
import { listCustomers, listUpcomingBirthdays } from "@/data/customers";
import { listStockItems, listLowStock } from "@/data/stock";
import { readSummary, type SummaryData } from "@/data/summary";
import type { Customer, StockItem } from "@/lib/types";
import { DashboardClient, type KpiCard } from "./dashboard-client";

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The four widgets DashboardClient renders — same shape from either path. */
interface DashboardView {
  kpis: KpiCard[];
  byChannel: { instagram: number; whatsapp: number; loja: number };
  topSellers: { name: string; qty: number }[];
  lowStock: { id: string; name: string; qty: number; unit: string }[];
}

const NO_CHANNELS = { instagram: 0, whatsapp: 0, loja: 0 };

/** Active customers whose next birthday lands within the next 30 days. */
function countUpcomingBirthdays(customers: Customer[], now: Date): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return customers.filter((c) => {
    if (c.archived || !c.birthday) return false;
    const b = c.birthday;
    let next = new Date(now.getFullYear(), b.month - 1, b.day);
    if (next < today) next = new Date(now.getFullYear() + 1, b.month - 1, b.day);
    const inDays = Math.round((next.getTime() - today.getTime()) / 86_400_000);
    return inDays <= 30;
  }).length;
}

function lowStockChips(items: StockItem[]) {
  return items
    .filter((i) => i.lowStock)
    .map((i) => ({ id: i.id, name: i.name, qty: i.qty, unit: i.unit }))
    .slice(0, 6);
}

function pctDelta(thisMonth: number, lastMonth: number): number {
  if (lastMonth > 0) {
    return Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
  }
  return thisMonth > 0 ? 100 : 0;
}

/** Assemble the four KPI cards from already-resolved numbers (path-agnostic). */
function buildKpis(input: {
  storeId: string;
  activeCustomers: number;
  newThisMonth: number;
  newLastMonth: number;
  orderCount: number;
  orderDelta: number;
  upcomingBirthdays: number;
}): KpiCard[] {
  return [
    {
      label: "Clientes ativos",
      value: String(input.activeCustomers),
      sub: "vs. período anterior",
      trend: trendPill(input.newThisMonth, "green"),
    },
    {
      label: "Novos clientes",
      value: String(input.newThisMonth),
      sub: "últimos 30 dias",
      trend: trendPill(input.newThisMonth - input.newLastMonth, "blue"),
    },
    {
      label: "Pedidos no período",
      value: String(input.orderCount),
      sub: "este mês",
      trend: trendPill(input.orderDelta, "green", true),
    },
    {
      label: "Aniversários próximos",
      value: String(input.upcomingBirthdays),
      sub: "próximos 30 dias · ver clientes",
      href: `/s/${input.storeId}/clientes?seg=aniversarios`,
    },
  ];
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const user = await requireSessionUser();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thisKey = monthKey(startOfMonth);
  const lastKey = monthKey(startOfLastMonth);

  const canPedidos = canAccessSection(user, "pedidos");
  const canClientes = canAccessSection(user, "clientes");
  const canEstoque = canAccessSection(user, "estoque");

  // PREFER the pre-computed summary (one small read). It serves the pedidos and
  // clientes aggregates, so read it whenever either section is visible. When it's
  // present the dashboard does NO growing full-collection scan — every KPI, the
  // channel donut and the top-sellers come from the summary, and only two tiny
  // bounded queries (low-stock strip + upcoming birthdays) hit collections.
  // Absent/older summary → fall back to the old scan-and-compute path below so the
  // dashboard never breaks.
  const summary =
    canPedidos || canClientes ? await readSummary(storeId) : null;

  const view = summary
    ? await fastPath({
        storeId,
        summary,
        now,
        thisKey,
        lastKey,
        canPedidos,
        canClientes,
        canEstoque,
      })
    : await slowPath({
        storeId,
        now,
        startOfMonth,
        startOfLastMonth,
        canPedidos,
        canClientes,
        canEstoque,
      });

  return (
    <DashboardClient
      storeId={storeId}
      kpis={view.kpis}
      byChannel={view.byChannel}
      topSellers={view.topSellers}
      lowStock={view.lowStock}
    />
  );
}

/**
 * Summary-backed path: KPIs / donut / sellers straight from the materialized
 * doc; the low-stock strip and birthday count from two bounded queries. No
 * whole-collection scan.
 */
async function fastPath(ctx: {
  storeId: string;
  summary: SummaryData;
  now: Date;
  thisKey: string;
  lastKey: string;
  canPedidos: boolean;
  canClientes: boolean;
  canEstoque: boolean;
}): Promise<DashboardView> {
  const { storeId, summary, now, thisKey, lastKey } = ctx;

  const [lowItems, birthdayCustomers] = await Promise.all([
    ctx.canEstoque ? listLowStock(storeId) : Promise.resolve([]),
    ctx.canClientes ? listUpcomingBirthdays(storeId) : Promise.resolve([]),
  ]);

  const thisM = summary.months[thisKey];
  const lastM = summary.months[lastKey];

  const orderCount = ctx.canPedidos ? (thisM?.orderCount ?? 0) : 0;
  const lastCount = ctx.canPedidos ? (lastM?.orderCount ?? 0) : 0;

  const byChannel = ctx.canPedidos
    ? {
        instagram: thisM?.channels.instagram ?? 0,
        whatsapp: thisM?.channels.whatsapp ?? 0,
        loja: thisM?.channels.loja ?? 0,
      }
    : NO_CHANNELS;

  const topSellers = ctx.canPedidos
    ? Object.values(thisM?.sellers ?? {})
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 4)
        .map((s) => ({ name: s.name, qty: s.qty }))
    : [];

  const kpis = buildKpis({
    storeId,
    activeCustomers: ctx.canClientes ? summary.activeCustomers : 0,
    newThisMonth: ctx.canClientes ? (thisM?.newCustomers ?? 0) : 0,
    newLastMonth: ctx.canClientes ? (lastM?.newCustomers ?? 0) : 0,
    orderCount,
    orderDelta: pctDelta(orderCount, lastCount),
    upcomingBirthdays: countUpcomingBirthdays(birthdayCustomers, now),
  });

  return { kpis, byChannel, topSellers, lowStock: lowStockChips(lowItems) };
}

/**
 * Fallback path (missing/older summary): the original scan-and-compute, so the
 * dashboard is always correct even before the summary is backfilled.
 */
async function slowPath(ctx: {
  storeId: string;
  now: Date;
  startOfMonth: Date;
  startOfLastMonth: Date;
  canPedidos: boolean;
  canClientes: boolean;
  canEstoque: boolean;
}): Promise<DashboardView> {
  const { storeId, now, startOfMonth, startOfLastMonth } = ctx;

  const [orders, customers, stockItems] = await Promise.all([
    ctx.canPedidos
      ? listOrders(storeId, { since: startOfLastMonth })
      : Promise.resolve([]),
    ctx.canClientes ? listCustomers(storeId) : Promise.resolve([]),
    ctx.canEstoque ? listStockItems(storeId) : Promise.resolve([]),
  ]);

  const active = customers.filter((c) => !c.archived);

  const thisMonthOrders = orders.filter(
    (o) => new Date(o.createdAt) >= startOfMonth && o.status !== "cancelado",
  );
  const lastMonthOrders = orders.filter(
    (o) => new Date(o.createdAt) < startOfMonth && o.status !== "cancelado",
  );

  const newThisMonth = active.filter(
    (c) => c.since && new Date(c.since) >= startOfMonth,
  ).length;
  const newLastMonth = active.filter((c) => {
    if (!c.since) return false;
    const d = new Date(c.since);
    return d >= startOfLastMonth && d < startOfMonth;
  }).length;

  const byChannel = { instagram: 0, whatsapp: 0, loja: 0 };
  const sellers = new Map<string, { name: string; qty: number }>();
  for (const order of thisMonthOrders) {
    byChannel[order.channel] += 1;
    for (const item of order.items) {
      const s = sellers.get(item.productId) ?? { name: item.name, qty: 0 };
      s.qty += item.qty;
      sellers.set(item.productId, s);
    }
  }
  const topSellers = [...sellers.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 4);

  const kpis = buildKpis({
    storeId,
    activeCustomers: active.length,
    newThisMonth,
    newLastMonth,
    orderCount: thisMonthOrders.length,
    orderDelta: pctDelta(thisMonthOrders.length, lastMonthOrders.length),
    upcomingBirthdays: countUpcomingBirthdays(active, now),
  });

  return { kpis, byChannel, topSellers, lowStock: lowStockChips(stockItems) };
}

/** Build a KPI trend pill from a delta; null when there's nothing to show. */
function trendPill(
  delta: number,
  tone: "green" | "blue",
  percent = false,
): KpiCard["trend"] {
  if (delta === 0) return null;
  const sign = delta > 0 ? "+" : "−";
  const text = `${sign}${Math.abs(delta)}${percent ? "%" : ""}`;
  return { text, tone: delta > 0 ? tone : "red" };
}
