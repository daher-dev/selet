import { requireAccess } from "@/lib/access";
import { listTransactions } from "@/data/finance";
import { listOrders } from "@/data/orders";
import { activeCustomerCount, readSummary } from "@/data/summary";
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

  // The transaction list (and the client-side selected-month totals) always
  // needs the raw txs. The per-month figures + receivables PREFER the summary
  // doc — which lets us skip the 6-month orders scan entirely — with a safe
  // fallback that recomputes from orders when the summary is absent.
  const [txs, summary] = await Promise.all([
    listTransactions(storeId, { limit: 500 }),
    readSummary(storeId),
  ]);

  const monthKeys: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push({ key: monthKey(d), label: MONTH_LABELS[d.getMonth()] });
  }

  let months: MonthBucket[];
  let receivablesByMonth: Record<string, { total: number; count: number }>;

  if (summary) {
    months = monthKeys.map(({ key, label }) => {
      const b = summary.months[key];
      return {
        label,
        in: b?.in ?? 0,
        out: b?.out ?? 0,
        avgTicket: b && b.orderCount ? Math.round(b.ticketSum / b.orderCount) : 0,
        activeCustomers: activeCustomerCount(b),
      };
    });
    receivablesByMonth = {};
    for (const [key, b] of Object.entries(summary.months)) {
      if (b.unpaidCount > 0) {
        receivablesByMonth[key] = { total: b.unpaidTotal, count: b.unpaidCount };
      }
    }
  } else {
    // Fallback: recompute the monthly figures + receivables from the orders.
    const orders = await listOrders(storeId, { since: sixMonthsAgo });
    const buckets = new Map<string, MonthBucket>();
    for (const { key, label } of monthKeys) {
      buckets.set(key, { label, in: 0, out: 0, avgTicket: 0, activeCustomers: 0 });
    }
    for (const tx of txs) {
      const key = tx.date ? monthKey(new Date(tx.date)) : null;
      if (key && buckets.has(key)) {
        const bucket = buckets.get(key)!;
        if (tx.direction === "in") bucket.in += tx.amount;
        else bucket.out += tx.amount;
      }
    }
    const orderStats = new Map<
      string,
      { total: number; count: number; customers: Set<string> }
    >();
    receivablesByMonth = {};
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
    months = [...buckets.values()];
  }

  return (
    <FinanceiroClient
      storeId={storeId}
      receivablesByMonth={receivablesByMonth}
      months={months}
      transactions={txs}
    />
  );
}
