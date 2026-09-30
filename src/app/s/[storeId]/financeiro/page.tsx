import { requireAccess } from "@/lib/access";
import { listTransactions } from "@/data/finance";
import { listOrders } from "@/data/orders";
import { readSummary } from "@/data/summary";
import { monthlySeries, trailingMonthKeys } from "@/lib/dashboard-core";
import { computeSummaryFrom, monthKey } from "@/lib/summary-core";
import { addZonedMonths } from "@/lib/timezone";
import { FinanceiroClient } from "./financeiro-client";

/** Months shown in "Evolução" (the Vendas chart; the others show the last 6). */
const EVOLUTION_MONTHS = 12;

export default async function FinanceiroPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "financeiro");

  const now = new Date();

  // The transaction list (and the client-side selected-month totals + splits)
  // always needs the raw txs. The per-month figures + receivables PREFER the
  // summary doc; when it's absent they're recomputed from a bounded 12-month
  // orders scan plus the txs already loaded, with the exact same math.
  const [txs, stored] = await Promise.all([
    listTransactions(storeId, { limit: 500 }),
    readSummary(storeId),
  ]);

  let summary = stored;
  if (!summary) {
    const orders = await listOrders(storeId, {
      since: addZonedMonths(now, -EVOLUTION_MONTHS),
    });
    summary = computeSummaryFrom({
      orders: orders.map((o) => ({ ...o, createdAt: new Date(o.createdAt) })),
      finance: txs
        .filter((t) => t.date)
        .map((t) => ({ direction: t.direction, amount: t.amount, date: new Date(t.date) })),
      stock: [],
      customers: [],
    });
  }

  const currentKey = monthKey(now);
  const months = monthlySeries(
    summary,
    trailingMonthKeys(currentKey, EVOLUTION_MONTHS),
    currentKey,
  );

  const receivablesByMonth: Record<string, { total: number; count: number }> = {};
  for (const [key, b] of Object.entries(summary.months)) {
    if (b.unpaidCount > 0) {
      receivablesByMonth[key] = { total: b.unpaidTotal, count: b.unpaidCount };
    }
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
