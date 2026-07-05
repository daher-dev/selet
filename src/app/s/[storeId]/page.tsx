import { requireSessionUser } from "@/lib/access";
import { canAccessSection } from "@/lib/access";
import { listOrders } from "@/data/orders";
import { listCustomers } from "@/data/customers";
import { listStockItems } from "@/data/stock";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const user = await requireSessionUser();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

  const [orders, customers, stockItems] = await Promise.all([
    canAccessSection(user, "pedidos")
      ? listOrders(storeId, { since: startOfMonth })
      : Promise.resolve([]),
    canAccessSection(user, "clientes")
      ? listCustomers(storeId)
      : Promise.resolve([]),
    canAccessSection(user, "estoque")
      ? listStockItems(storeId)
      : Promise.resolve([]),
  ]);

  const active = customers.filter((c) => !c.archived);
  const validOrders = orders.filter((o) => o.status !== "cancelado");

  // KPIs
  const newCustomers30d = active.filter(
    (c) => c.since && new Date(c.since) >= thirtyDaysAgo,
  ).length;

  // Upcoming birthdays (next 30 days), sorted by how soon.
  const upcomingBirthdays = active
    .filter((c) => c.birthday)
    .map((c) => {
      const b = c.birthday!;
      let next = new Date(now.getFullYear(), b.month - 1, b.day);
      if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        next = new Date(now.getFullYear() + 1, b.month - 1, b.day);
      }
      const inDays = Math.round((next.getTime() - now.getTime()) / 86_400_000);
      return { customer: c, inDays };
    })
    .filter((b) => b.inDays <= 30)
    .sort((a, b) => a.inDays - b.inDays)
    .slice(0, 5);

  // Reorder-due: past their usual reorder interval (or within 2 days of it).
  const reorderDue = active
    .filter((c) => c.avgReorderDays !== null && c.lastOrderAt)
    .map((c) => {
      const dueAt =
        new Date(c.lastOrderAt!).getTime() + c.avgReorderDays! * 86_400_000;
      const inDays = Math.round((dueAt - now.getTime()) / 86_400_000);
      return { customer: c, inDays };
    })
    .filter((r) => r.inDays <= 2)
    .sort((a, b) => a.inDays - b.inDays)
    .slice(0, 5);

  // Channel split + top sellers from this month's orders.
  const byChannel = { instagram: 0, whatsapp: 0, loja: 0 };
  const sellers = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const order of validOrders) {
    byChannel[order.channel] += 1;
    for (const item of order.items) {
      const s = sellers.get(item.productId) ?? {
        name: item.name,
        qty: 0,
        revenue: 0,
      };
      s.qty += item.qty;
      s.revenue += item.qty * item.unitPrice;
      sellers.set(item.productId, s);
    }
  }
  const topSellers = [...sellers.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const lowStock = stockItems.filter((i) => i.lowStock).slice(0, 5);

  return (
    <DashboardClient
      storeId={storeId}
      kpis={{
        activeCustomers: active.length,
        newCustomers30d,
        monthOrders: validOrders.length,
        monthRevenue: validOrders.reduce((s, o) => s + o.total, 0),
        birthdays: upcomingBirthdays.length,
      }}
      byChannel={byChannel}
      topSellers={topSellers}
      lowStock={lowStock}
      recentOrders={orders.slice(0, 5)}
      upcomingBirthdays={upcomingBirthdays.map((b) => ({
        id: b.customer.id,
        name: b.customer.name,
        inDays: b.inDays,
      }))}
      reorderDue={reorderDue.map((r) => ({
        id: r.customer.id,
        name: r.customer.name,
        inDays: r.inDays,
      }))}
    />
  );
}
