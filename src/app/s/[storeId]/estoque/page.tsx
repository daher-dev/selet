import { requireAccess } from "@/lib/access";
import { listStockItems } from "@/data/stock";
import { listOrders } from "@/data/orders";
import { listProducts } from "@/data/products";
import { EstoqueClient } from "./estoque-client";
import type { RecipeUsage } from "./estoque-detail-sheet";

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

  // stockItemId → the revenda/adicional catalog products it backs directly
  // (Product.insumoId): an item's detail sheet warns when one of these goes
  // esgotado, since the linked product falls out of the cardápio.
  const resaleByStock: Record<string, string[]> = {};
  // stockItemId → every BASE recipe/adicional line across the catalog that
  // consumes it, for the detail sheet's "Usado nas receitas" chips.
  const recipeUsage: Record<string, RecipeUsage[]> = {};
  for (const p of products) {
    if (!p.active) continue;
    if ((p.saleType === "revenda" || p.saleType === "adicional") && p.insumoId) {
      (resaleByStock[p.insumoId] ??= []).push(p.name);
    }
    for (const r of p.recipe) {
      if (!r.stockItemId) continue;
      (recipeUsage[r.stockItemId] ??= []).push({ name: p.name, qty: r.qty, unit: r.unit });
    }
    for (const a of p.adicionais) {
      if (!a.stockItemId) continue;
      (recipeUsage[a.stockItemId] ??= []).push({
        name: p.name,
        qty: a.qty ?? null,
        unit: a.unit ?? "un",
      });
    }
  }

  return (
    <EstoqueClient
      storeId={storeId}
      items={items}
      orders={orderRefs}
      menuProducts={menuProducts}
      resaleByStock={resaleByStock}
      recipeUsage={recipeUsage}
    />
  );
}
