import { requireAccess } from "@/lib/access";
import {
  listShakeBases,
  listShakeFlavors,
  listShakeMixins,
  listShakeRims,
  listShakeUtensils,
} from "@/data/shakes";
import { listStockItems } from "@/data/stock";
import { ShakesClient } from "./shakes-client";

export default async function ShakesPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "shakes");

  const [flavors, bases, rims, mixins, utensils, stockItems] = await Promise.all([
    listShakeFlavors(storeId),
    listShakeBases(storeId),
    listShakeRims(storeId),
    listShakeMixins(storeId),
    listShakeUtensils(storeId),
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
      stockItems={stockItems.filter((s) => !s.archived)}
    />
  );
}
