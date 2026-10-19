import { requireAccess } from "@/lib/access";
import { listTransactions } from "@/data/finance";
import { listStockItems } from "@/data/stock";
import { currentMonthKey, monthBounds } from "../finance-shared";
import { MovimentacoesClient } from "./movimentacoes-client";

export default async function MovimentacoesPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { storeId } = await params;
  const { mes } = await searchParams;
  await requireAccess(storeId, "financeiro");

  const key = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : currentMonthKey();
  const { start, end } = monthBounds(key);

  const [transactions, stockItems] = await Promise.all([
    listTransactions(storeId, { since: start, until: end }),
    listStockItems(storeId),
  ]);

  const stockItemNames = Object.fromEntries(stockItems.map((i) => [i.id, i.name]));

  return (
    <MovimentacoesClient
      storeId={storeId}
      mes={key}
      transactions={transactions}
      stockItemNames={stockItemNames}
    />
  );
}
