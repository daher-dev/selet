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
 * Resolves an order's lines into the stock draws they should make, per the
 * confirmed café semantics:
 *  - revenda line → decrement its linked insumo by lineQty.
 *  - stockManaged menu line → draw lineQty from the product's producedStock.
 *  - sob-demanda menu line → consume each recipe insumo (medido: qty×lineQty).
 *  - adicionais (any menu line) → consume each add-on's linked insumo.
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

    if (product.saleType === "revenda") {
      if (product.insumoId) addInsumo(insumos, product.insumoId, lineQty, lineQty);
      continue;
    }

    // menu item
    if (product.stockManaged) {
      produced.set(product.id, (produced.get(product.id) ?? 0) + lineQty);
    } else {
      for (const r of product.recipe) {
        if (!r.stockItemId) continue;
        addInsumo(insumos, r.stockItemId, (r.qty ?? 0) * lineQty, lineQty);
      }
    }

    // Add-ons are consumed at sale time regardless of production mode.
    for (const name of line.addons ?? []) {
      const addon = product.adicionais.find((a) => a.name === name);
      if (addon?.stockItemId) {
        addInsumo(insumos, addon.stockItemId, (addon.qty ?? 0) * lineQty, lineQty);
      }
    }
  }

  return { insumos, produced };
}
