import { requireAccess } from "@/lib/access";
import { listProducts } from "@/data/products";
import { ProdutosClient } from "./produtos-client";

export default async function ProdutosPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "produtos");
  const products = await listProducts(storeId);

  return <ProdutosClient storeId={storeId} products={products} />;
}
