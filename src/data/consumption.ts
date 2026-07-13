import type { OrderItem, Product } from "@/lib/types";

/** Per-insumo consumption need. medido reads `amount`; continuo reads `uses`. */
export interface InsumoNeed {
  amount: number;
  uses: number;
}

export interface ConsumptionRequests {
  /** stockItems id → summed need across all lines. */
  insumos: Map<string, InsumoNeed>;
  /** stockManaged product id → porções to draw from producedStock. */
  produced: Map<string, number>;
}

function addInsumo(map: Map<string, InsumoNeed>, id: string, amount: number, uses: number) {
  const cur = map.get(id) ?? { amount: 0, uses: 0 };
  cur.amount += amount;
  cur.uses += uses;
  map.set(id, cur);
}

/**
 * Draws `qty` units of `product`'s own stock — revenda decrements its linked
 * insumo; menu/adicional (produced the same way) draws from producedStock
 * when batch-managed, else consumes the BASE recipe. Shared by the top-level
 * per-line draw and by a catalog-linked add-on resolving its own product.
 */
function drawForProduct(
  product: Product,
  qty: number,
  insumos: Map<string, InsumoNeed>,
  produced: Map<string, number>,
) {
  if (product.saleType === "revenda") {
    if (product.insumoId) addInsumo(insumos, product.insumoId, qty, qty);
    return;
  }
  if (product.stockManaged) {
    produced.set(product.id, (produced.get(product.id) ?? 0) + qty);
  } else {
    for (const r of product.recipe) {
      if (!r.stockItemId) continue;
      addInsumo(insumos, r.stockItemId, (r.qty ?? 0) * qty, qty);
    }
  }
}

/**
 * Resolves an order's lines into the stock draws they should make, per the
 * confirmed café semantics:
 *  - revenda line → decrement its linked insumo by lineQty.
 *  - stockManaged menu/adicional line → draw lineQty from producedStock.
 *  - sob-demanda menu/adicional line → consume each recipe insumo (medido:
 *    qty×lineQty). adicional is produced exactly like menu — it's only
 *    reachable here via another line's add-ons, never as its own line.
 *  - adicionais (any menu line) → consume each add-on's linked insumo: either
 *    the add-on's own stockItemId, or — for a catalog-linked add-on — draw
 *    for the referenced adicional product the same way its own line would.
 * Only entries carrying a stockItemId are tracked; name-only pantry rows skip.
 * The per-insumo mode (medido vs continuo) is decided later, by the item.
 */
export function buildConsumptionRequests(
  items: OrderItem[],
  products: Map<string, Product>,
): ConsumptionRequests {
  const insumos = new Map<string, InsumoNeed>();
  const produced = new Map<string, number>();

  for (const line of items) {
    const product = products.get(line.productId);
    if (!product) continue; // unresolved product → best-effort skip
    const lineQty = line.qty;

    drawForProduct(product, lineQty, insumos, produced);

    // Add-ons are consumed at sale time regardless of production mode.
    for (const name of line.addons ?? []) {
      const addon = product.adicionais.find((a) => a.name === name);
      if (!addon) continue;
      if (addon.productId) {
        const linked = products.get(addon.productId);
        if (linked) drawForProduct(linked, lineQty, insumos, produced);
      } else if (addon.stockItemId) {
        addInsumo(insumos, addon.stockItemId, (addon.qty ?? 0) * lineQty, lineQty);
      }
    }
  }

  return { insumos, produced };
}
