import { requireAccess } from "@/lib/access";
import { listStockItems } from "@/data/stock";
import { listOrders } from "@/data/orders";
import { listProducts } from "@/data/products";
import { EstoqueClient } from "./estoque-client";

export default async function EstoquePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "estoque");
  const [items, orders, products] = await Promise.all([
    listStockItems(storeId),
    listOrders(storeId, { limit: 20 }),
    listProducts(storeId),
  ]);

  // Reference pickers on a saída: VENDA → recent orders, CONSUMO → menu items.
  const orderRefs = orders.map((o) => ({
    id: o.id,
    code: o.code,
    customerName: o.customerName,
  }));
  const menuProducts = products.filter((p) => p.saleType === "menu");

  return (
    <EstoqueClient
      storeId={storeId}
      items={items}
      orders={orderRefs}
      menuProducts={menuProducts}
    />
  );
}
