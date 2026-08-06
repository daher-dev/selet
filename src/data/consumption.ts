import type { OrderItem, Product } from "@/lib/types";
import type { ShakeCatalogs } from "./shakes";

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
 * Draws `qty` units of `product`'s own stock — revenda/adicional decrements
 * its linked insumo; menu draws from producedStock when batch-managed, else
 * consumes the BASE recipe.
 */
function drawForProduct(
  product: Product,
  qty: number,
  insumos: Map<string, InsumoNeed>,
  produced: Map<string, number>,
) {
  if (product.saleType === "revenda" || product.saleType === "adicional") {
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
 * Resolves a "Montar shake" line's picks (flavor recipe + base + rims + mixins
 * + utensílios, respecting per-line overrides else each utensílio's own
 * defaultIncluded) into the same insumos map — everything downstream
 * (planConsumption, consumeWork/reverseWork, the ConsumptionDraw reversal
 * manifest) is generic over that map and needs no changes. Best-effort: a
 * catalog entry that's gone (deleted after the order was placed) is skipped,
 * mirroring the unresolved-product discipline elsewhere in this file.
 */
function resolveShakeLine(
  line: OrderItem,
  catalogs: ShakeCatalogs | undefined,
  insumos: Map<string, InsumoNeed>,
) {
  const sel = line.shake;
  if (!sel || !catalogs) return;
  const lineQty = line.qty;

  const flavor = catalogs.flavors.get(sel.flavorId);
  for (const r of flavor?.recipe ?? []) {
    if (!r.stockItemId) continue;
    addInsumo(insumos, r.stockItemId, (r.qty ?? 0) * lineQty, lineQty);
  }

  const base = sel.baseId ? catalogs.bases.get(sel.baseId) : undefined;
  if (base?.insumo.stockItemId) {
    addInsumo(insumos, base.insumo.stockItemId, (base.insumo.qty ?? 0) * lineQty, lineQty);
  }

  for (const { modifierId, qty } of sel.rims) {
    const rim = catalogs.rims.get(modifierId);
    if (!rim?.insumo.stockItemId) continue;
    addInsumo(insumos, rim.insumo.stockItemId, (rim.insumo.qty ?? 0) * qty * lineQty, qty * lineQty);
  }
  for (const { modifierId, qty } of sel.mixins) {
    const mixin = catalogs.mixins.get(modifierId);
    if (!mixin?.insumo.stockItemId) continue;
    addInsumo(
      insumos,
      mixin.insumo.stockItemId,
      (mixin.insumo.qty ?? 0) * qty * lineQty,
      qty * lineQty,
    );
  }

  const overrides = new Map((sel.utensilOverrides ?? []).map((o) => [o.utensilId, o.included]));
  for (const u of catalogs.utensils) {
    const included = overrides.get(u.id) ?? u.defaultIncluded;
    if (!included || !u.insumo.stockItemId) continue;
    addInsumo(insumos, u.insumo.stockItemId, (u.insumo.qty ?? 0) * lineQty, lineQty);
  }
}

/**
 * Resolves an order's lines into the stock draws they should make, per the
 * confirmed café semantics:
 *  - revenda/adicional line → decrement its linked insumo by lineQty (adicional
 *    is never independently orderable, but the draw logic is shared).
 *  - stockManaged menu line → draw lineQty from producedStock.
 *  - sob-demanda menu line → consume each recipe insumo (medido: qty×lineQty).
 *  - adicionais (any menu line) → consume each add-on's own stockItemId.
 *  - "Montar shake" line (line.shake set) → resolveShakeLine (flavor recipe +
 *    base + rims + mixins + utensílios), an entirely separate resolution path
 *    from the Product-based one above. If the line also carries a brinde (a
 *    free Product riding along), that brinde's own recipe/producedStock draws
 *    via drawForProduct (same as an ordinary Cardápio line) PLUS its charged
 *    add-ons' insumos — all scaled by lineQty, regardless of the line's
 *    unitPrice (a brinde's price is 0, but that never gates its stock draw).
 * Only entries carrying a stockItemId are tracked; name-only pantry rows skip.
 * The per-insumo mode (medido vs continuo) is decided later, by the item.
 */
export function buildConsumptionRequests(
  items: OrderItem[],
  products: Map<string, Product>,
  shakeCatalogs?: ShakeCatalogs,
): ConsumptionRequests {
  const insumos = new Map<string, InsumoNeed>();
  const produced = new Map<string, number>();

  for (const line of items) {
    if (line.cartelaSale) continue; // sells a punch card, not a real product — no stock draw.
    if (line.shake) {
      resolveShakeLine(line, shakeCatalogs, insumos);

      // A brinde (free menu item riding on this shake line) still draws real
      // stock — its own unitPrice contribution is 0, but price must never gate
      // consumption. Looked up in the already-loaded products map (same one
      // used for ordinary Cardápio lines below); missing/archived → best-effort
      // skip, never throw.
      const brinde = line.shake.brinde;
      if (brinde) {
        const brindeProduct = products.get(brinde.productId);
        if (brindeProduct) {
          drawForProduct(brindeProduct, line.qty, insumos, produced);
          for (const addon of brinde.addons ?? []) {
            const productAddon = brindeProduct.adicionais.find((a) => a.name === addon.name);
            if (!productAddon?.stockItemId) continue;
            addInsumo(
              insumos,
              productAddon.stockItemId,
              (productAddon.qty ?? 0) * line.qty,
              line.qty,
            );
          }
        }
      }
      continue;
    }

    const product = products.get(line.productId);
    if (!product) continue; // unresolved product → best-effort skip
    const lineQty = line.qty;

    drawForProduct(product, lineQty, insumos, produced);

    // Add-ons are consumed at sale time regardless of production mode.
    for (const name of line.addons ?? []) {
      const addon = product.adicionais.find((a) => a.name === name);
      if (!addon?.stockItemId) continue;
      addInsumo(insumos, addon.stockItemId, (addon.qty ?? 0) * lineQty, lineQty);
    }
  }

  return { insumos, produced };
}
