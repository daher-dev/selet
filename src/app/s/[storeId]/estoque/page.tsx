import { requireAccess } from "@/lib/access";
import { listStockItems } from "@/data/stock";
import { EstoqueClient } from "./estoque-client";

export default async function EstoquePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "estoque");
  const items = await listStockItems(storeId);

  return <EstoqueClient storeId={storeId} items={items} />;
}
