import { requireAccess } from "@/lib/access";
import {
  listShakeBases,
  listShakeBrindes,
  listShakeFlavors,
  listShakeMixins,
  listShakeRims,
  listShakeUtensils,
} from "@/data/shakes";
import { listProducts } from "@/data/products";
import { listStockItems } from "@/data/stock";
import { ShakesClient } from "./shakes-client";

export default async function ShakesPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "shakes");

  const [flavors, bases, rims, mixins, utensils, brindes, products, stockItems] =
    await Promise.all([
      listShakeFlavors(storeId),
      listShakeBases(storeId),
      listShakeRims(storeId),
      listShakeMixins(storeId),
      listShakeUtensils(storeId),
      listShakeBrindes(storeId),
      listProducts(storeId),
      listStockItems(storeId),
    ]);

  return (
    <ShakesClient
      storeId={storeId}
      flavors={flavors}
      bases={bases}
      rims={rims}
      mixins={mixins}
      utensils={utensils}
      brindes={brindes}
      products={products.filter((p) => p.active && p.saleType !== "adicional")}
      stockItems={stockItems.filter((s) => !s.archived)}
    />
  );
}
