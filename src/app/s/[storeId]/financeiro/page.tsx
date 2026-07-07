import { requireAccess } from "@/lib/access";
import { listTransactions } from "@/data/finance";
import { listOrders } from "@/data/orders";
import { FinanceiroClient, type MonthBucket } from "./financeiro-client";

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_LABELS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export default async function FinanceiroPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "financeiro");

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [txs, orders] = await Promise.all([
    listTransactions(storeId, { limit: 500 }),
    listOrders(storeId, { since: sixMonthsAgo }),
  ]);

  // Six month buckets, oldest first.
  const buckets = new Map<string, MonthBucket>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.set(monthKey(d), {
      label: MONTH_LABELS[d.getMonth()],
      in: 0,
      out: 0,
      avgTicket: 0,
      activeCustomers: 0,
    });
  }

  // All-time balance + per-month in/out buckets for the trend chart.
  let saldo = 0;
  for (const tx of txs) {
    saldo += tx.direction === "in" ? tx.amount : -tx.amount;
    const key = tx.date ? monthKey(new Date(tx.date)) : null;
    if (key && buckets.has(key)) {
      const bucket = buckets.get(key)!;
      if (tx.direction === "in") bucket.in += tx.amount;
      else bucket.out += tx.amount;
    }
  }

  // Avg ticket + distinct customers per month, from non-cancelled orders.
  // Outstanding (unpaid) orders are bucketed by their competência month so the
  // client can scope "a receber" to the selected month.
  const orderStats = new Map<string, { total: number; count: number; customers: Set<string> }>();
  const receivablesByMonth: Record<string, { total: number; count: number }> = {};
  for (const order of orders) {
    if (order.status === "cancelado") continue;
    const key = monthKey(new Date(order.createdAt));
    if (!order.paid) {
      const r = (receivablesByMonth[key] ??= { total: 0, count: 0 });
      r.total += order.total;
      r.count += 1;
    }
    if (!orderStats.has(key)) {
      orderStats.set(key, { total: 0, count: 0, customers: new Set() });
    }
    const stat = orderStats.get(key)!;
    stat.total += order.total;
    stat.count += 1;
    stat.customers.add(order.customerId ?? order.customerName);
  }
  for (const [key, stat] of orderStats) {
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.avgTicket = stat.count ? Math.round(stat.total / stat.count) : 0;
      bucket.activeCustomers = stat.customers.size;
    }
  }

  return (
    <FinanceiroClient
      storeId={storeId}
      saldo={saldo}
      receivablesByMonth={receivablesByMonth}
      months={[...buckets.values()]}
      transactions={txs}
    />
  );
}
