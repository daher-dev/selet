/**
 * BASE recipes + inferred ADICIONAIS + per-store pricing for the café catalog.
 *
 * Everything here is DERIVED from the committed real data (scripts/data/*):
 *   - recipes come from each item's category + its menu-catalog description
 *     (morango / kit kat counts / colágeno are read off the description text);
 *   - adicionais are the "adicionais"-category items, attached to menu items and
 *     PRICED FROM THE STORE PRICE BOOK (the add-* slugs in menu-prices.json), so
 *     Vila Velha and Passos carry their own add-on prices;
 *   - consumption is unit-derived: every WEIGHT/VOLUME insumo (g) is "contínuo"
 *     and carries qty = null ("sem medição", tallied by +usos); only COUNTABLE
 *     insumos (un/sachê: Morango, Kit Kat, Colágeno) carry a real measured count.
 *
 * No demo/fictional data: quantities that aren't a real count are null, not a
 * made-up gram weight.
 */

export interface RecipeItemData {
  stockItemId?: string;
  name: string;
  qty: number | null; // null => "sem medição" (contínuo insumo)
  unit: string;
}
export interface AddonData {
  stockItemId?: string;
  name: string;
  price: number; // centavos (from the store price book)
  qty?: number | null;
  unit?: string;
}
export interface TierData {
  qty: number;
  price: number; // centavos
}
export interface ProductRecipe {
  saleType: "menu" | "revenda";
  recipe: RecipeItemData[];
  adicionais: AddonData[];
  tiers: TierData[];
  insumoId?: string;
  stockManaged: boolean;
  prep: "sob demanda" | "lote" | null;
}

/** The store's slug → price_centavos map (menu-prices.json[storeId]). */
export type StorePrices = Record<string, number>;

export interface RecipeInput {
  slug: string;
  category: string;
  description: string;
}

/** Tracked insumo (stockItems doc) with the display name + base unit used in recipes. */
interface Insumo {
  id: string;
  name: string;
  unit: string;
}

// The tracked Herbalife/café insumos referenced by recipes and add-ons. Ids are
// the stockItems slugs from scripts/data/hbl-stock.json.
const INSUMO = {
  shake: { id: "shake-todos-os-sabores", name: "Shake Herbalife Baunilha", unit: "g" },
  ninho: { id: "leite-em-po-ninho", name: "Leite em pó (Ninho)", unit: "g" },
  pdm: { id: "po-de-proteina-240g-22cs-ou-40-csr", name: "Pó de Proteína (PDM)", unit: "g" },
  nutrisoup: {
    id: "nutri-soup-creme-verde-frango-416g-16-porcoes",
    name: "Nutrisoup Creme Verde-Frango",
    unit: "g",
  },
  fiber: { id: "fiber-concentrate-manga-uva-limao-30-cs", name: "Fiber Concentrate", unit: "g" },
  crunch: { id: "protein-crunch", name: "Protein Crunch", unit: "g" },
  herbal: { id: "herbal-concentrate-51g-original-e-limao-50cc", name: "Herbal Concentrate", unit: "g" },
  beauty: { id: "beauty-drink-colageno-frutas-vermelhas", name: "Beauty Drink Colágeno", unit: "sache" },
  morango: { id: "morango", name: "Morango", unit: "un" },
  kitkat: { id: "kit-kat-proteico", name: "Kit Kat Proteico", unit: "un" },
  barra: { id: "barra-de-proteina-citrus-lemon-e-peanut", name: "Barra de Proteína", unit: "un" },
} satisfies Record<string, Insumo>;

/** One recipe ingredient. Weight/volume insumos pass qty = null (sem medição). */
function ri(insumo: Insumo, qty: number | null): RecipeItemData {
  return { stockItemId: insumo.id, name: insumo.name, qty, unit: insumo.unit };
}

// --- ADICIONAIS: the "adicionais"-category items, mapped to their insumo. ---
// price is looked up per store from the add-* slug; qty is null for contínuo
// (grams tallied by usos) and a real count for medido (Kit Kat un).
interface AddonSpec {
  name: string;
  insumo?: Insumo;
  qty?: number | null;
}
const ADDON_SPECS: Record<string, AddonSpec> = {
  "add-crunch-1-colher": { name: "Crunch (1 colher)", insumo: INSUMO.crunch, qty: null },
  "add-crunch-2-colheres": { name: "Crunch (2 colheres)", insumo: INSUMO.crunch, qty: null },
  "add-waffle-proteico-1-4": { name: "Waffle Proteico 1/4", insumo: INSUMO.pdm, qty: null },
  "add-2-kit-kat-proteico": { name: "2 Kit Kat Proteico", insumo: INSUMO.kitkat, qty: 2 },
  "add-4-kit-kat-proteico": { name: "4 Kit Kat Proteico", insumo: INSUMO.kitkat, qty: 4 },
  "add-borda-dupla": { name: "Borda Dupla", insumo: INSUMO.shake, qty: null },
  "add-calda-quente": { name: "Calda Quente" }, // topping, no stock link
  "add-fibra-soluvel": { name: "Fibra Solúvel", insumo: INSUMO.fiber, qty: null },
};

// Full add-on set → every shake. Waffles carry Crunch (1/2), Fibra Solúvel and
// the Kit Kat (2/4) add-ons.
const SHAKE_ADDONS = Object.keys(ADDON_SPECS);
const WAFFLE_ADDONS = [
  "add-crunch-1-colher",
  "add-crunch-2-colheres",
  "add-fibra-soluvel",
  "add-2-kit-kat-proteico",
  "add-4-kit-kat-proteico",
];

/** Build the add-on list for a product, pricing each slug from the store book. */
function buildAddons(slugs: string[], prices: StorePrices): AddonData[] {
  const out: AddonData[] = [];
  for (const slug of slugs) {
    const price = prices[slug];
    if (typeof price !== "number") continue; // store doesn't sell this add-on
    const spec = ADDON_SPECS[slug];
    const addon: AddonData = { name: spec.name, price };
    if (spec.insumo) {
      addon.stockItemId = spec.insumo.id;
      addon.qty = spec.qty ?? null;
      addon.unit = spec.insumo.unit;
    }
    out.push(addon);
  }
  return out;
}

/** Standalone add-on product (adicionais category) → consumes its own insumo. */
function addonStandaloneRecipe(slug: string): RecipeItemData[] {
  const spec = ADDON_SPECS[slug];
  if (!spec?.insumo) return []; // Calda Quente: no tracked insumo
  return [ri(spec.insumo, spec.qty ?? null)];
}

/**
 * Shake recipe: Herbalife base (shake + Ninho, both contínuo) plus the measured
 * specifics read off the description — Morango (2 un) when it mentions morango,
 * Kit Kat (the count in the text) when it mentions kit kat, and Colágeno for the
 * Shake da Beleza.
 */
function shakeRecipe(slug: string, description: string): RecipeItemData[] {
  const items: RecipeItemData[] = [ri(INSUMO.shake, null), ri(INSUMO.ninho, null)];
  const d = description.toLowerCase();
  if (d.includes("morango")) items.push(ri(INSUMO.morango, 2));
  if (/kit\s*kat/i.test(description)) {
    const m = description.match(/(\d+)\s*kit\s*kat/i);
    items.push(ri(INSUMO.kitkat, m ? Number(m[1]) : 2));
  }
  if (slug === "shake-shake-da-beleza") items.push(ri(INSUMO.beauty, 1));
  return items;
}

/**
 * Resolve the full recipe/adicionais/pricing payload for a catalog item, given
 * the store's price book (so add-ons and tiers carry that store's prices).
 */
export function recipeFor(item: RecipeInput, prices: StorePrices): ProductRecipe {
  const { slug, category, description } = item;
  const tiers: TierData[] = [{ qty: 1, price: prices[slug] ?? 0 }];

  switch (category) {
    case "shakes":
      return {
        saleType: "menu",
        recipe: shakeRecipe(slug, description),
        adicionais: buildAddons(SHAKE_ADDONS, prices),
        tiers,
        stockManaged: false,
        prep: "sob demanda",
      };

    case "waffles":
      return {
        saleType: "menu",
        recipe: [ri(INSUMO.pdm, null), ri(INSUMO.ninho, null)],
        adicionais: buildAddons(WAFFLE_ADDONS, prices),
        tiers,
        stockManaged: false,
        prep: "sob demanda",
      };

    case "salgados": {
      if (slug === "salgado-trio-de-coxinhas") {
        return {
          saleType: "menu",
          recipe: [ri(INSUMO.pdm, null), ri(INSUMO.nutrisoup, null)],
          adicionais: [],
          tiers,
          stockManaged: true,
          prep: "lote",
        };
      }
      const recipe =
        slug === "salgado-escondidinho-de-frango"
          ? [ri(INSUMO.nutrisoup, null), ri(INSUMO.pdm, null)]
          : [ri(INSUMO.nutrisoup, null)]; // pizza proteica / de frango
      return { saleType: "menu", recipe, adicionais: [], tiers, stockManaged: false, prep: "sob demanda" };
    }

    case "bebidas": {
      let recipe: RecipeItemData[];
      if (slug === "bebida-seca-barriga") recipe = [ri(INSUMO.fiber, null)];
      else if (slug === "bebida-colageno-drink") recipe = [ri(INSUMO.beauty, 1)];
      else recipe = [ri(INSUMO.herbal, null)]; // hype / sunset / refrigerante
      return { saleType: "menu", recipe, adicionais: [], tiers, stockManaged: false, prep: "sob demanda" };
    }

    case "lanches": {
      if (slug === "lanche-coxinha-proteica") {
        return {
          saleType: "menu",
          recipe: [ri(INSUMO.pdm, null), ri(INSUMO.nutrisoup, null)],
          adicionais: [],
          tiers,
          stockManaged: true,
          prep: "lote",
        };
      }
      if (slug === "lanche-barrinha-de-proteina" || slug === "lanche-barra-proteica") {
        return {
          saleType: "revenda",
          recipe: [],
          adicionais: [],
          tiers,
          insumoId: INSUMO.barra.id,
          stockManaged: false,
          prep: null,
        };
      }
      if (slug === "lanche-pudim-proteico") {
        return {
          saleType: "menu",
          recipe: [ri(INSUMO.pdm, null)],
          adicionais: [],
          tiers,
          stockManaged: false,
          prep: "sob demanda",
        };
      }
      // Pão de Mel / Trufa — no tracked insumo.
      return { saleType: "menu", recipe: [], adicionais: [], tiers, stockManaged: false, prep: "sob demanda" };
    }

    case "adicionais":
      return {
        saleType: "menu",
        recipe: addonStandaloneRecipe(slug),
        adicionais: [],
        tiers,
        stockManaged: false,
        prep: "sob demanda",
      };

    default:
      return { saleType: "menu", recipe: [], adicionais: [], tiers, stockManaged: false, prep: "sob demanda" };
  }
}
