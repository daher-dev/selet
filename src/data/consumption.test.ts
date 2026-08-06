import { describe, expect, it } from "vitest";
import type {
  OrderItem,
  Product,
  ShakeBase,
  ShakeFlavor,
  ShakeMixin,
  ShakeRim,
  ShakeUtensil,
} from "@/lib/types";
import type { ShakeCatalogs } from "./shakes";
import { buildConsumptionRequests } from "./consumption";

function product(overrides: Partial<Product> & { id: string }): Product {
  return {
    name: overrides.id,
    price: 1000,
    category: "shakes",
    typeTags: [],
    active: true,
    createdAt: "",
    saleType: "menu",
    recipe: [],
    adicionais: [],
    tiers: [{ qty: 1, price: 1000 }],
    stockManaged: false,
    producedStock: 0,
    archived: false,
    ...overrides,
  };
}

function line(overrides: Partial<OrderItem> & { productId: string }): OrderItem {
  return { name: overrides.productId, qty: 1, unitPrice: 1000, ...overrides };
}

describe("buildConsumptionRequests", () => {
  it("revenda line decrements its linked insumo by lineQty", () => {
    const shake = product({ id: "shake", saleType: "revenda", insumoId: "ins-1" });
    const { insumos } = buildConsumptionRequests(
      [line({ productId: "shake", qty: 3 })],
      new Map([["shake", shake]]),
    );
    expect(insumos.get("ins-1")).toEqual({ amount: 3, uses: 3 });
  });

  it("adicional line decrements its linked insumo like revenda", () => {
    const caldaQuente = product({
      id: "calda-quente",
      saleType: "adicional",
      insumoId: "ins-calda",
    });
    const { insumos } = buildConsumptionRequests(
      [line({ productId: "calda-quente", qty: 3 })],
      new Map([["calda-quente", caldaQuente]]),
    );
    expect(insumos.get("ins-calda")).toEqual({ amount: 3, uses: 3 });
  });

  it("sob-demanda menu line consumes its recipe scaled by lineQty", () => {
    const waffle = product({
      id: "waffle",
      saleType: "menu",
      recipe: [{ stockItemId: "ins-1", name: "Insumo", qty: 2, unit: "g" }],
    });
    const { insumos } = buildConsumptionRequests(
      [line({ productId: "waffle", qty: 2 })],
      new Map([["waffle", waffle]]),
    );
    expect(insumos.get("ins-1")).toEqual({ amount: 4, uses: 2 });
  });

  it("stockManaged menu line draws from producedStock instead of consuming insumos", () => {
    const bolo = product({
      id: "bolo",
      saleType: "menu",
      stockManaged: true,
      recipe: [{ stockItemId: "ins-1", name: "Insumo", qty: 2, unit: "g" }],
    });
    const { insumos, produced } = buildConsumptionRequests(
      [line({ productId: "bolo", qty: 4 })],
      new Map([["bolo", bolo]]),
    );
    expect(produced.get("bolo")).toBe(4);
    expect(insumos.size).toBe(0);
  });

  it("add-on with stockItemId consumes its own insumo", () => {
    const shake = product({
      id: "shake",
      adicionais: [{ name: "Crunch", price: 500, stockItemId: "ins-crunch", qty: 1 }],
    });
    const { insumos } = buildConsumptionRequests(
      [line({ productId: "shake", qty: 2, addons: ["Crunch"] })],
      new Map([["shake", shake]]),
    );
    expect(insumos.get("ins-crunch")).toEqual({ amount: 2, uses: 2 });
  });

  it("add-on without a stockItemId (freeform pantry item) consumes nothing", () => {
    const shake = product({
      id: "shake",
      adicionais: [{ name: "Sem estoque", price: 100 }],
    });
    const { insumos, produced } = buildConsumptionRequests(
      [line({ productId: "shake", qty: 1, addons: ["Sem estoque"] })],
      new Map([["shake", shake]]),
    );
    expect(insumos.size).toBe(0);
    expect(produced.size).toBe(0);
  });
});

describe("buildConsumptionRequests · Montar shake lines", () => {
  function flavor(overrides: Partial<ShakeFlavor> & { id: string }): ShakeFlavor {
    return { name: overrides.id, price: 3000, recipe: [], archived: false, createdAt: "", ...overrides };
  }
  function base(overrides: Partial<ShakeBase> & { id: string }): ShakeBase {
    return {
      name: overrides.id,
      insumo: { name: "Insumo", qty: 1, unit: "un" },
      price: 0,
      archived: false,
      createdAt: "",
      ...overrides,
    };
  }
  function tiered(
    overrides: Partial<ShakeRim> & { id: string },
  ): ShakeRim | ShakeMixin {
    return {
      name: overrides.id,
      insumo: { name: "Insumo", qty: 1, unit: "un" },
      tiers: [{ qty: 1, price: 500 }],
      archived: false,
      createdAt: "",
      ...overrides,
    };
  }
  function utensil(overrides: Partial<ShakeUtensil> & { id: string }): ShakeUtensil {
    return {
      name: overrides.id,
      insumo: { name: "Insumo", qty: 1, unit: "un" },
      defaultIncluded: true,
      archived: false,
      createdAt: "",
      ...overrides,
    };
  }

  function catalogs(over: Partial<ShakeCatalogs> = {}): ShakeCatalogs {
    return {
      flavors: new Map(),
      bases: new Map(),
      rims: new Map(),
      mixins: new Map(),
      utensils: [],
      ...over,
    };
  }

  function shakeLine(overrides: Partial<OrderItem> = {}): OrderItem {
    return {
      productId: "sabor-1",
      name: "Shake",
      qty: 1,
      unitPrice: 3000,
      shake: {
        flavorId: "sabor-1",
        baseId: null,
        rims: [],
        mixins: [],
      },
      ...overrides,
    };
  }

  it("consumes the flavor's own recipe, scaled by lineQty", () => {
    const f = flavor({
      id: "sabor-1",
      recipe: [{ stockItemId: "ins-shake", name: "Shake base", qty: 26, unit: "g" }],
    });
    const { insumos } = buildConsumptionRequests(
      [shakeLine({ qty: 2 })],
      new Map(),
      catalogs({ flavors: new Map([["sabor-1", f]]) }),
    );
    expect(insumos.get("ins-shake")).toEqual({ amount: 52, uses: 2 });
  });

  it("consumes the chosen base's insumo", () => {
    const f = flavor({ id: "sabor-1" });
    const b = base({ id: "base-1", insumo: { stockItemId: "ins-leite", name: "Leite", qty: 150, unit: "ml" } });
    const { insumos } = buildConsumptionRequests(
      [shakeLine({ shake: { flavorId: "sabor-1", baseId: "base-1", rims: [], mixins: [] } })],
      new Map(),
      catalogs({ flavors: new Map([["sabor-1", f]]), bases: new Map([["base-1", b]]) }),
    );
    expect(insumos.get("ins-leite")).toEqual({ amount: 150, uses: 1 });
  });

  it("rim/mixin quantity scales the insumo draw (dose dupla)", () => {
    const f = flavor({ id: "sabor-1" });
    const rim = tiered({
      id: "rim-1",
      insumo: { stockItemId: "ins-nutella", name: "Nutella", qty: 20, unit: "g" },
    }) as ShakeRim;
    const mixin = tiered({
      id: "mix-1",
      insumo: { stockItemId: "ins-fibra", name: "Fibra", qty: 1, unit: "dose" },
    }) as ShakeMixin;
    const { insumos } = buildConsumptionRequests(
      [
        shakeLine({
          qty: 2, // 2 shakes ordered
          shake: {
            flavorId: "sabor-1",
            baseId: null,
            rims: [{ modifierId: "rim-1", qty: 2 }], // dose dupla
            mixins: [{ modifierId: "mix-1", qty: 1 }],
          },
        }),
      ],
      new Map(),
      catalogs({
        flavors: new Map([["sabor-1", f]]),
        rims: new Map([["rim-1", rim]]),
        mixins: new Map([["mix-1", mixin]]),
      }),
    );
    // rim: 20g × 2 (dose dupla) × 2 (lineQty) = 80g, uses = 2×2 = 4
    expect(insumos.get("ins-nutella")).toEqual({ amount: 80, uses: 4 });
    // mixin: 1 dose × 1 × 2 (lineQty) = 2, uses = 1×2 = 2
    expect(insumos.get("ins-fibra")).toEqual({ amount: 2, uses: 2 });
  });

  it("utensílio with defaultIncluded=true is drawn automatically", () => {
    const f = flavor({ id: "sabor-1" });
    const u = utensil({
      id: "copo",
      defaultIncluded: true,
      insumo: { stockItemId: "ins-copo", name: "Copo", qty: 1, unit: "un" },
    });
    const { insumos } = buildConsumptionRequests(
      [shakeLine()],
      new Map(),
      catalogs({ flavors: new Map([["sabor-1", f]]), utensils: [u] }),
    );
    expect(insumos.get("ins-copo")).toEqual({ amount: 1, uses: 1 });
  });

  it("utensílio with defaultIncluded=false is NOT drawn unless overridden to true", () => {
    const f = flavor({ id: "sabor-1" });
    const u = utensil({
      id: "canudo",
      defaultIncluded: false,
      insumo: { stockItemId: "ins-canudo", name: "Canudo", qty: 1, unit: "un" },
    });
    const cat = catalogs({ flavors: new Map([["sabor-1", f]]), utensils: [u] });

    const skipped = buildConsumptionRequests([shakeLine()], new Map(), cat);
    expect(skipped.insumos.has("ins-canudo")).toBe(false);

    const included = buildConsumptionRequests(
      [
        shakeLine({
          shake: {
            flavorId: "sabor-1",
            baseId: null,
            rims: [],
            mixins: [],
            utensilOverrides: [{ utensilId: "canudo", included: true }],
          },
        }),
      ],
      new Map(),
      cat,
    );
    expect(included.insumos.get("ins-canudo")).toEqual({ amount: 1, uses: 1 });
  });

  it("a per-line override can also OPT OUT of a default-included utensílio", () => {
    const f = flavor({ id: "sabor-1" });
    const u = utensil({
      id: "guardanapo",
      defaultIncluded: true,
      insumo: { stockItemId: "ins-guardanapo", name: "Guardanapo", qty: 2, unit: "un" },
    });
    const { insumos } = buildConsumptionRequests(
      [
        shakeLine({
          shake: {
            flavorId: "sabor-1",
            baseId: null,
            rims: [],
            mixins: [],
            utensilOverrides: [{ utensilId: "guardanapo", included: false }],
          },
        }),
      ],
      new Map(),
      catalogs({ flavors: new Map([["sabor-1", f]]), utensils: [u] }),
    );
    expect(insumos.has("ins-guardanapo")).toBe(false);
  });

  it("missing catalogs (undefined) is a best-effort no-op, never throws", () => {
    expect(() => buildConsumptionRequests([shakeLine()], new Map())).not.toThrow();
    const { insumos } = buildConsumptionRequests([shakeLine()], new Map());
    expect(insumos.size).toBe(0);
  });

  it("a shake line referencing a deleted flavor/modifier is skipped, not thrown", () => {
    const { insumos } = buildConsumptionRequests(
      [
        shakeLine({
          shake: {
            flavorId: "gone",
            baseId: "also-gone",
            rims: [{ modifierId: "gone-too", qty: 1 }],
            mixins: [],
          },
        }),
      ],
      new Map(),
      catalogs(),
    );
    expect(insumos.size).toBe(0);
  });

  describe("brinde (free Product riding a shake line)", () => {
    it("a unitPrice:0 brinde line still consumes its recipe (headline regression case)", () => {
      const f = flavor({ id: "sabor-1" });
      const brindeProduct = product({
        id: "cha-limao",
        recipe: [{ stockItemId: "ins-cha", name: "Chá", qty: 5, unit: "g" }],
      });
      const { insumos } = buildConsumptionRequests(
        [
          shakeLine({
            unitPrice: 0,
            shake: {
              flavorId: "sabor-1",
              baseId: null,
              rims: [],
              mixins: [],
              brinde: { productId: "cha-limao", name: "Chá Limão", listPrice: 800 },
            },
          }),
        ],
        new Map([["cha-limao", brindeProduct]]),
        catalogs({ flavors: new Map([["sabor-1", f]]) }),
      );
      expect(insumos.get("ins-cha")).toEqual({ amount: 5, uses: 1 });
    });

    it("a brinde addon with a stockItemId consumes its insumo", () => {
      const f = flavor({ id: "sabor-1" });
      const brindeProduct = product({
        id: "cha-limao",
        adicionais: [{ name: "Mel", price: 200, stockItemId: "ins-mel", qty: 10, unit: "ml" }],
      });
      const { insumos } = buildConsumptionRequests(
        [
          shakeLine({
            shake: {
              flavorId: "sabor-1",
              baseId: null,
              rims: [],
              mixins: [],
              brinde: {
                productId: "cha-limao",
                name: "Chá Limão",
                listPrice: 800,
                addons: [{ name: "Mel", price: 200 }],
              },
            },
          }),
        ],
        new Map([["cha-limao", brindeProduct]]),
        catalogs({ flavors: new Map([["sabor-1", f]]) }),
      );
      expect(insumos.get("ins-mel")).toEqual({ amount: 10, uses: 1 });
    });

    it("a stockManaged brinde draws producedStock, not insumos", () => {
      const f = flavor({ id: "sabor-1" });
      const brindeProduct = product({
        id: "bolo-fatia",
        stockManaged: true,
        recipe: [{ stockItemId: "ins-farinha", name: "Farinha", qty: 50, unit: "g" }],
      });
      const { insumos, produced } = buildConsumptionRequests(
        [
          shakeLine({
            shake: {
              flavorId: "sabor-1",
              baseId: null,
              rims: [],
              mixins: [],
              brinde: { productId: "bolo-fatia", name: "Bolo", listPrice: 600 },
            },
          }),
        ],
        new Map([["bolo-fatia", brindeProduct]]),
        catalogs({ flavors: new Map([["sabor-1", f]]) }),
      );
      expect(produced.get("bolo-fatia")).toBe(1);
      expect(insumos.has("ins-farinha")).toBe(false);
    });

    it("brinde recipe AND addon draws scale by line.qty", () => {
      const f = flavor({ id: "sabor-1" });
      const brindeProduct = product({
        id: "cha-limao",
        recipe: [{ stockItemId: "ins-cha", name: "Chá", qty: 5, unit: "g" }],
        adicionais: [{ name: "Mel", price: 200, stockItemId: "ins-mel", qty: 10, unit: "ml" }],
      });
      const { insumos } = buildConsumptionRequests(
        [
          shakeLine({
            qty: 3,
            shake: {
              flavorId: "sabor-1",
              baseId: null,
              rims: [],
              mixins: [],
              brinde: {
                productId: "cha-limao",
                name: "Chá Limão",
                listPrice: 800,
                addons: [{ name: "Mel", price: 200 }],
              },
            },
          }),
        ],
        new Map([["cha-limao", brindeProduct]]),
        catalogs({ flavors: new Map([["sabor-1", f]]) }),
      );
      expect(insumos.get("ins-cha")).toEqual({ amount: 15, uses: 3 });
      expect(insumos.get("ins-mel")).toEqual({ amount: 30, uses: 3 });
    });

    it("a brinde whose Product is absent from the map is skipped without throwing", () => {
      const f = flavor({ id: "sabor-1" });
      const args: Parameters<typeof buildConsumptionRequests> = [
        [
          shakeLine({
            shake: {
              flavorId: "sabor-1",
              baseId: null,
              rims: [],
              mixins: [],
              brinde: { productId: "gone", name: "Sumiu", listPrice: 500 },
            },
          }),
        ],
        new Map(),
        catalogs({ flavors: new Map([["sabor-1", f]]) }),
      ];
      expect(() => buildConsumptionRequests(...args)).not.toThrow();
      const { insumos, produced } = buildConsumptionRequests(...args);
      expect(insumos.size).toBe(0);
      expect(produced.size).toBe(0);
    });
  });
});
