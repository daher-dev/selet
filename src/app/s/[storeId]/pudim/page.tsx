import { requireAccess } from "@/lib/access";
import {
  listPudimBases,
  listPudimBrindes,
  listPudimFlavors,
  listPudimMixins,
  listPudimUtensils,
} from "@/data/pudim";
import { listProducts } from "@/data/products";
import { listStockItems } from "@/data/stock";
import { PudimClient } from "./pudim-client";

export default async function PudimPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "pudim");

  const [flavors, bases, mixins, utensils, brindes, products, stockItems] =
    await Promise.all([
      listPudimFlavors(storeId),
      listPudimBases(storeId),
      listPudimMixins(storeId),
      listPudimUtensils(storeId),
      listPudimBrindes(storeId),
      listProducts(storeId),
      listStockItems(storeId),
    ]);

  return (
    <PudimClient
      storeId={storeId}
      flavors={flavors}
      bases={bases}
      mixins={mixins}
      utensils={utensils}
      brindes={brindes}
      products={products.filter((p) => p.active && p.saleType !== "adicional")}
      stockItems={stockItems.filter((s) => !s.archived)}
    />
  );
}
