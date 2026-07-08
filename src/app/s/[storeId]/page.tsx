import { requireSessionUser } from "@/lib/access";
import { canAccessSection } from "@/lib/access";
import { listOrders } from "@/data/orders";
import { listCustomers } from "@/data/customers";
import { listStockItems } from "@/data/stock";
import { readSummary } from "@/data/summary";
import { DashboardClient, type KpiCard } from "./dashboard-client";

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

  // The "Pedidos no período" KPI + its month-over-month delta PREFER the
  // pre-computed summary doc (one small read). When it's present we only need
  // THIS month's orders (for the channel donut + top sellers), not last month's;
  // the delta baseline comes from the summary. Absent → fall back to fetching
  // both months and counting them, so the dashboard never breaks.
  const summary = canAccessSection(user, "pedidos")
    ? await readSummary(storeId)
    : null;
  const ordersSince = summary ? startOfMonth : startOfLastMonth;

  const [orders, customers, stockItems] = await Promise.all([
    canAccessSection(user, "pedidos")
      ? listOrders(storeId, { since: ordersSince })
      : Promise.resolve([]),
    canAccessSection(user, "clientes")
      ? listCustomers(storeId)
      : Promise.resolve([]),
    canAccessSection(user, "estoque")
      ? listStockItems(storeId)
      : Promise.resolve([]),
  ]);

  const active = customers.filter((c) => !c.archived);

  const thisMonthOrders = orders.filter(
    (o) => new Date(o.createdAt) >= startOfMonth && o.status !== "cancelado",
  );
  const lastMonthOrders = orders.filter(
    (o) => new Date(o.createdAt) < startOfMonth && o.status !== "cancelado",
  );

  const thisMonthCount = summary
    ? (summary.months[thisKey]?.orderCount ?? 0)
    : thisMonthOrders.length;
  const lastMonthCount = summary
    ? (summary.months[lastKey]?.orderCount ?? 0)
    : lastMonthOrders.length;

  // New customers this vs last month (delta feeds the KPI trend pills).
  const newThisMonth = active.filter(
    (c) => c.since && new Date(c.since) >= startOfMonth,
  ).length;
  const newLastMonth = active.filter((c) => {
    if (!c.since) return false;
    const d = new Date(c.since);
    return d >= startOfLastMonth && d < startOfMonth;
  }).length;

  // Upcoming birthdays (next 30 days).
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcomingBirthdays = active.filter((c) => {
    if (!c.birthday) return false;
    const b = c.birthday;
    let next = new Date(now.getFullYear(), b.month - 1, b.day);
    if (next < today) next = new Date(now.getFullYear() + 1, b.month - 1, b.day);
    const inDays = Math.round((next.getTime() - today.getTime()) / 86_400_000);
    return inDays <= 30;
  }).length;

  // Channel split + top sellers from this month's orders.
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

  const lowStock = stockItems
    .filter((i) => i.lowStock)
    .map((i) => ({
      id: i.id,
      name: i.name,
      qty: i.qty,
      unit: i.unit,
    }))
    .slice(0, 6);

  const pctDelta =
    lastMonthCount > 0
      ? Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100)
      : thisMonthCount > 0
        ? 100
        : 0;

  const kpis: KpiCard[] = [
    {
      label: "Clientes ativos",
      value: String(active.length),
      sub: "vs. período anterior",
      trend: trendPill(newThisMonth, "green"),
    },
    {
      label: "Novos clientes",
      value: String(newThisMonth),
      sub: "últimos 30 dias",
      trend: trendPill(newThisMonth - newLastMonth, "blue"),
    },
    {
      label: "Pedidos no período",
      value: String(thisMonthCount),
      sub: "este mês",
      trend: trendPill(pctDelta, "green", true),
    },
    {
      label: "Aniversários próximos",
      value: String(upcomingBirthdays),
      sub: "próximos 30 dias · ver clientes",
      href: `/s/${storeId}/clientes?seg=aniversarios`,
    },
  ];

  return (
    <DashboardClient
      storeId={storeId}
      kpis={kpis}
      byChannel={byChannel}
      topSellers={topSellers}
      lowStock={lowStock}
    />
  );
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
