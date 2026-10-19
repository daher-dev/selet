import { requireAccess } from "@/lib/access";
import { listOrders } from "@/data/orders";
import { listCustomers } from "@/data/customers";
import { listProducts } from "@/data/products";
import {
  listShakeBases,
  listShakeBrindes,
  listShakeFlavors,
  listShakeMixins,
  listShakeRims,
  listShakeUtensils,
} from "@/data/shakes";
import {
  listPudimBases,
  listPudimBrindes,
  listPudimFlavors,
  listPudimMixins,
  listPudimUtensils,
} from "@/data/pudim";
import { PedidosClient } from "./pedidos-client";

export default async function PedidosPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "pedidos");

  // Shake/Pudim catalogs (including brindes) are fetched here (not gated
  // behind "shakes"/"pudim" access) since building a "Montar shake"/"Montar
  // pudim" order line — brinde picked and all — is a Pedidos concern any
  // funcionário with order access can do, even though editing the catalog
  // (adding/archiving a brinde) is admin-only.
  const [
    orders,
    customers,
    products,
    flavors,
    bases,
    rims,
    mixins,
    utensils,
    brindes,
    pudimFlavors,
    pudimBases,
    pudimMixins,
    pudimUtensils,
    pudimBrindes,
  ] = await Promise.all([
    listOrders(storeId, { limit: 200 }),
    listCustomers(storeId),
    listProducts(storeId),
    listShakeFlavors(storeId),
    listShakeBases(storeId),
    listShakeRims(storeId),
    listShakeMixins(storeId),
    listShakeUtensils(storeId),
    listShakeBrindes(storeId),
    listPudimFlavors(storeId),
    listPudimBases(storeId),
    listPudimMixins(storeId),
    listPudimUtensils(storeId),
    listPudimBrindes(storeId),
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
      shakeBrindes={brindes.filter((b) => !b.archived)}
      pudimFlavors={pudimFlavors.filter((f) => !f.archived)}
      pudimBases={pudimBases.filter((b) => !b.archived)}
      pudimMixins={pudimMixins.filter((m) => !m.archived)}
      pudimUtensils={pudimUtensils.filter((u) => !u.archived)}
      pudimBrindes={pudimBrindes.filter((b) => !b.archived)}
    />
  );
}
