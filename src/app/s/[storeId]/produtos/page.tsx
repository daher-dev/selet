import { requireAccess } from "@/lib/access";
import { listProducts } from "@/data/products";
import { listStockItems } from "@/data/stock";
import { ProdutosClient } from "./produtos-client";

export default async function ProdutosPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "produtos");
  const [products, stockItems] = await Promise.all([
    listProducts(storeId),
    listStockItems(storeId),
  ]);

  return (
    <ProdutosClient
      storeId={storeId}
      products={products}
      stockItems={stockItems}
    />
  );
}
