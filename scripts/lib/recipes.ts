/**
 * BASE recipes + ADICIONAIS + price tiers for the café catalog.
 *
 * Real data source: the reference design's `baseProducts` array
 * (docs/design/Selet Admin.dc.html, "Dados reais do cardápio Selet") gives the
 * exact recipe/adicionais for the core menu items — those are encoded verbatim
 * in OVERRIDES below. Every Selet shake shares the same Herbalife base (shake
 * powder + Ninho), so products the design doesn't enumerate get a category
 * default following the same real pattern. Ingredient names link to a tracked
 * stockItems slug when one exists (Fiber, Crunch, Nutrisoup…); pantry items
 * that aren't Herbalife stock (Ninho, Morango, Kit Kat) stay name-only.
 */

export interface RecipeItemData {
  stockItemId?: string;
  name: string;
  qty: number | null; // null => "sem medição"
  unit: string;
}
export interface AddonData {
  stockItemId?: string;
  name: string;
  price: number; // centavos
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
}

/** Ingredient/add-on display name → tracked stockItems slug (undefined = untracked pantry item). */
const STOCK: Record<string, string | undefined> = {
  "Shake Herbalife Baunilha": "shake-todos-os-sabores",
  "Leite em pó (Ninho)": undefined,
  "Fiber Concentrate": "fiber-concentrate-manga-uva-limao-30-cs",
  "Protein Crunch": "protein-crunch",
  "Kit Kat Proteico": undefined,
  "Beauty Drink Colágeno": "beauty-drink-colageno-frutas-vermelhas",
  Morango: undefined,
  "Nutrisoup Creme Verde-Frango": "nutri-soup-creme-verde-frango-416g-16-porcoes",
  "Pó de Proteína (PDM)": "po-de-proteina-240g-22cs-ou-40-csr",
  "Herbal Concentrate": "herbal-concentrate-51g-original-e-limao-50cc",
  "Barra de Proteína (Citrus Lemon e Peanut)": "barra-de-proteina-citrus-lemon-e-peanut",
  "Liftoff 75g (1 sachê)": "liftoff-75g-1-sache",
  "Sopa Instantânea todos sabores - unidade": "sopa-instantanea-todos-sabores-unidade",
};

// Omit stockItemId entirely when the ingredient isn't tracked stock — Firestore
// rejects nested `undefined` without ignoreUndefinedProperties.
function r(name: string, qty: number | null, unit: string): RecipeItemData {
  const id = STOCK[name];
  return id ? { stockItemId: id, name, qty, unit } : { name, qty, unit };
}
function a(name: string, price: number): AddonData {
  const id = STOCK[name];
  return id ? { stockItemId: id, name, price } : { name, price };
}

const FIBER = () => a("Fiber Concentrate", 800);
const CRUNCH = () => a("Protein Crunch", 500);

// --- Design "baseProducts" (real recipes), keyed by our catalog slug. ---
const OVERRIDES: Record<string, ProductRecipe> = {
  "shake-frutas-vermelhas": {
    saleType: "menu",
    recipe: [r("Shake Herbalife Baunilha", null, "g"), r("Leite em pó (Ninho)", null, "g")],
    adicionais: [FIBER(), CRUNCH()],
    tiers: [{ qty: 1, price: 3600 }],
    stockManaged: false,
  },
  "shake-oreo": {
    saleType: "menu",
    recipe: [r("Shake Herbalife Baunilha", null, "g"), r("Leite em pó (Ninho)", null, "g")],
    adicionais: [a("Kit Kat Proteico", 500), CRUNCH()],
    tiers: [{ qty: 1, price: 3600 }],
    stockManaged: false,
  },
  "shake-ovomaltine": {
    saleType: "menu",
    recipe: [r("Shake Herbalife Baunilha", null, "g"), r("Protein Crunch", null, "g")],
    adicionais: [FIBER()],
    tiers: [{ qty: 1, price: 4100 }],
    stockManaged: false,
  },
  "shake-bombom-serenata": {
    saleType: "menu",
    recipe: [
      r("Shake Herbalife Baunilha", null, "g"),
      r("Leite em pó (Ninho)", null, "g"),
      r("Kit Kat Proteico", 2, "un"),
    ],
    adicionais: [FIBER()],
    tiers: [{ qty: 1, price: 4400 }],
    stockManaged: false,
  },
  "shake-shake-da-beleza": {
    saleType: "menu",
    recipe: [r("Shake Herbalife Baunilha", null, "g"), r("Beauty Drink Colágeno", 1, "sachê")],
    adicionais: [],
    tiers: [{ qty: 1, price: 4400 }],
    stockManaged: false,
  },
  "shake-trad-danoninho": {
    saleType: "menu",
    recipe: [r("Shake Herbalife Baunilha", null, "g"), r("Morango", 2, "un")],
    adicionais: [FIBER()],
    tiers: [{ qty: 1, price: 2800 }],
    stockManaged: false,
  },
  "salgado-pizza-proteica": {
    saleType: "menu",
    recipe: [r("Nutrisoup Creme Verde-Frango", 40, "g")],
    adicionais: [],
    tiers: [{ qty: 1, price: 3300 }],
    stockManaged: false,
  },
  "salgado-pizza-de-frango": {
    saleType: "menu",
    recipe: [r("Nutrisoup Creme Verde-Frango", 40, "g")],
    adicionais: [],
    tiers: [{ qty: 1, price: 3600 }],
    stockManaged: false,
  },
  "salgado-escondidinho-de-frango": {
    saleType: "menu",
    recipe: [r("Nutrisoup Creme Verde-Frango", 40, "g"), r("Pó de Proteína (PDM)", 20, "g")],
    adicionais: [],
    tiers: [{ qty: 1, price: 3600 }],
    stockManaged: false,
  },
  "lanche-coxinha-proteica": {
    saleType: "menu",
    recipe: [r("Pó de Proteína (PDM)", 25, "g"), r("Nutrisoup Creme Verde-Frango", 15, "g")],
    adicionais: [],
    tiers: [
      { qty: 1, price: 1500 },
      { qty: 3, price: 3700 },
    ],
    stockManaged: true,
  },
  "bebida-hype-drink": {
    saleType: "menu",
    recipe: [r("Herbal Concentrate", 3, "g")],
    adicionais: [],
    tiers: [{ qty: 1, price: 2800 }],
    stockManaged: false,
  },
  "bebida-colageno-drink": {
    saleType: "menu",
    recipe: [r("Beauty Drink Colágeno", 1, "sachê")],
    adicionais: [],
    tiers: [{ qty: 1, price: 2200 }],
    stockManaged: false,
  },
  "bebida-seca-barriga": {
    saleType: "menu",
    recipe: [r("Fiber Concentrate", 5, "g")],
    adicionais: [],
    tiers: [{ qty: 1, price: 1900 }],
    stockManaged: false,
  },
  "bebida-refrigerante-saudavel": {
    saleType: "menu",
    recipe: [r("Herbal Concentrate", 2, "g")],
    adicionais: [],
    tiers: [{ qty: 1, price: 1800 }],
    stockManaged: false,
  },
  // Revenda — resold stock items (no recipe).
  "lanche-barra-proteica": {
    saleType: "revenda",
    recipe: [],
    adicionais: [],
    tiers: [{ qty: 1, price: 1800 }],
    insumoId: STOCK["Barra de Proteína (Citrus Lemon e Peanut)"],
    stockManaged: false,
  },
  "lanche-barrinha-de-proteina": {
    saleType: "revenda",
    recipe: [],
    adicionais: [],
    tiers: [{ qty: 1, price: 1800 }],
    insumoId: STOCK["Barra de Proteína (Citrus Lemon e Peanut)"],
    stockManaged: false,
  },
};

/** Category default following the real Selet pattern, for items the design doesn't enumerate. */
function categoryDefault(category: string, priceCentavos: number): ProductRecipe {
  const tiers: TierData[] = [{ qty: 1, price: priceCentavos }];
  switch (category) {
    case "shakes":
      return {
        saleType: "menu",
        recipe: [r("Shake Herbalife Baunilha", null, "g"), r("Leite em pó (Ninho)", null, "g")],
        adicionais: [FIBER(), CRUNCH()],
        tiers,
        stockManaged: false,
      };
    case "waffles":
      return {
        saleType: "menu",
        recipe: [r("Pó de Proteína (PDM)", 25, "g"), r("Leite em pó (Ninho)", null, "g")],
        adicionais: [FIBER(), CRUNCH()],
        tiers,
        stockManaged: false,
      };
    case "salgados":
      return {
        saleType: "menu",
        recipe: [r("Nutrisoup Creme Verde-Frango", 40, "g")],
        adicionais: [],
        tiers,
        stockManaged: false,
      };
    case "bebidas":
      return {
        saleType: "menu",
        recipe: [r("Herbal Concentrate", 3, "g")],
        adicionais: [],
        tiers,
        stockManaged: false,
      };
    case "lanches":
      return {
        saleType: "menu",
        recipe: [r("Pó de Proteína (PDM)", 20, "g")],
        adicionais: [],
        tiers,
        stockManaged: false,
      };
    case "adicionais":
    default:
      // Add-ons sold standalone: a simple priced item, no base recipe.
      return { saleType: "menu", recipe: [], adicionais: [], tiers, stockManaged: false };
  }
}

/** Resolve the recipe payload for a catalog slug. Real design data wins; else category default. */
export function recipeFor(
  slug: string,
  category: string,
  priceCentavos: number,
): ProductRecipe {
  const override = OVERRIDES[slug];
  if (override) {
    // The unit (qty:1) tier follows the store's real price book; lote tiers are
    // kept from the design as-is.
    const tiers = override.tiers.map((t) =>
      t.qty === 1 ? { ...t, price: priceCentavos } : t,
    );
    return { ...override, tiers };
  }
  return categoryDefault(category, priceCentavos);
}
