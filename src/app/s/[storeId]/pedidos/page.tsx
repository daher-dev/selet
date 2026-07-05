import { requireAccess } from "@/lib/access";
import { listOrders } from "@/data/orders";
import { listCustomers } from "@/data/customers";
import { listProducts } from "@/data/products";
import { PedidosClient } from "./pedidos-client";

export default async function PedidosPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "pedidos");

  const [orders, customers, products] = await Promise.all([
    listOrders(storeId, { limit: 200 }),
    listCustomers(storeId),
    listProducts(storeId),
  ]);

  return (
    <PedidosClient
      storeId={storeId}
      orders={orders}
      customers={customers.filter((c) => !c.archived)}
      products={products.filter((p) => p.active)}
    />
  );
}
