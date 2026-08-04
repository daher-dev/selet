import { requireAccess } from "@/lib/access";
import { listOrders } from "@/data/orders";
import { listCustomers } from "@/data/customers";
import { listProducts } from "@/data/products";
import {
  listShakeBases,
  listShakeFlavors,
  listShakeMixins,
  listShakeRims,
  listShakeUtensils,
} from "@/data/shakes";
import { PedidosClient } from "./pedidos-client";

export default async function PedidosPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "pedidos");

  // Shake catalogs are fetched here (not gated behind "shakes" access) since
  // building a "Montar shake" order line is a Pedidos concern any funcionário
  // with order access can do, even though editing the catalog is admin-only.
  const [orders, customers, products, flavors, bases, rims, mixins, utensils] =
    await Promise.all([
      listOrders(storeId, { limit: 200 }),
      listCustomers(storeId),
      listProducts(storeId),
      listShakeFlavors(storeId),
      listShakeBases(storeId),
      listShakeRims(storeId),
      listShakeMixins(storeId),
      listShakeUtensils(storeId),
    ]);

  return (
    <PedidosClient
      storeId={storeId}
      orders={orders}
      customers={customers.filter((c) => !c.archived)}
      products={products.filter((p) => p.active)}
      shakeFlavors={flavors.filter((f) => !f.archived)}
      shakeBases={bases.filter((b) => !b.archived)}
      shakeRims={rims.filter((r) => !r.archived)}
      shakeMixins={mixins.filter((m) => !m.archived)}
      shakeUtensils={utensils.filter((u) => !u.archived)}
    />
  );
}
