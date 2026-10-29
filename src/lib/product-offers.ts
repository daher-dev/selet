import type { PriceTier, Product, ProductSaleType, ResaleOffer, SaleOffer } from "./types";

/** The qty:1 price, or the per-unit price of the first tier when sold in lote only. */
export function unitPriceOf(tiers: PriceTier[]): number {
  const unit = tiers.find((t) => t.qty === 1);
  if (unit) return unit.price;
  return tiers[0] ? Math.round(tiers[0].price / tiers[0].qty) : 0;
}

export function deriveSaleType(sale: SaleOffer | undefined, resale: ResaleOffer | undefined, adicional: boolean): ProductSaleType {
  if (sale) return "menu";
  return adicional ? "adicional" : "revenda";
}

/** Top-level fields kept in sync with the offers so every older reader keeps working. */
export function mirrorFields(sale: SaleOffer | undefined, resale: ResaleOffer | undefined, adicional: boolean) {
  const primary = sale ?? resale;
  const tiers = primary?.tiers ?? [];
  return {
    saleType: deriveSaleType(sale, resale, adicional),
    price: unitPriceOf(tiers),
    tiers,
    recipe: sale?.recipe ?? [],
    adicionais: sale?.adicionais ?? [],
    insumoId: resale?.insumoId,
    commissionPercent: resale?.commissionPercent ?? sale?.commissionPercent,
  };
}

/** The offer a line sells: its own `offer`, else the legacy saleType, else the only one the product has. */
export function lineOffer(product: Pick<Product, "sale" | "resale" | "saleType">, offer?: "sale" | "resale"): "sale" | "resale" {
  if (offer === "sale" && product.sale) return "sale";
  if (offer === "resale" && product.resale) return "resale";
  if (product.sale && !product.resale) return "sale";
  if (product.resale && !product.sale) return "resale";
  return product.saleType === "revenda" || product.saleType === "adicional" ? "resale" : "sale";
}

/**
 * What the item IS, from the user's point of view: a stock item sold as-is
 * (whole packages and/or single doses of one item) or something prepared from
 * a multi-ingredient recipe. Derived — the stored shape stays sale/resale.
 */
export function productKind(p: Pick<Product, "sale" | "resale">): "estoque" | "receita" {
  if (p.resale) return "estoque";
  const recipe = p.sale?.recipe ?? [];
  return recipe.length === 1 && recipe[0].stockItemId ? "estoque" : "receita";
}
