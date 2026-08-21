import { describe, expect, it } from "vitest";
import type {
  OrderItem,
  Product,
  PudimBase,
  PudimFlavor,
  PudimMixin,
  PudimUtensil,
  ShakeBase,
  ShakeFlavor,
  ShakeMixin,
  ShakeRim,
  ShakeUtensil,
} from "@/lib/types";
import type { ShakeCatalogs } from "./shakes";
import type { PudimCatalogs } from "./pudim";
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
        flavorIds: ["sabor-1"],
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
      [shakeLine({ shake: { flavorIds: ["sabor-1"], baseId: "base-1", rims: [], mixins: [] } })],
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
            flavorIds: ["sabor-1"],
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
            flavorIds: ["sabor-1"],
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
            flavorIds: ["sabor-1"],
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
            flavorIds: ["gone"],
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

  describe("multi-flavor shakes (até 3 sabores)", () => {
    it("draws the FULL recipe of EVERY selected flavor, summed across distinct insumos", () => {
      const f1 = flavor({
        id: "sabor-1",
        recipe: [{ stockItemId: "ins-shake", name: "Shake base", qty: 26, unit: "g" }],
      });
      const f2 = flavor({
        id: "sabor-2",
        recipe: [{ stockItemId: "ins-morango", name: "Morango", qty: 40, unit: "g" }],
      });
      const { insumos } = buildConsumptionRequests(
        [
          shakeLine({
            qty: 2, // 2 shakes ordered
            shake: { flavorIds: ["sabor-1", "sabor-2"], baseId: null, rims: [], mixins: [] },
          }),
        ],
        new Map(),
        catalogs({ flavors: new Map([["sabor-1", f1], ["sabor-2", f2]]) }),
      );
      // Each flavor's FULL recipe is drawn (not divided by flavor count),
      // scaled by lineQty — a deliberate approximation.
      expect(insumos.get("ins-shake")).toEqual({ amount: 52, uses: 2 }); // 26 × 2
      expect(insumos.get("ins-morango")).toEqual({ amount: 80, uses: 2 }); // 40 × 2
    });

    it("accumulates onto a SHARED insumo between two selected flavors (addInsumo merges, not overwrites)", () => {
      const f1 = flavor({
        id: "sabor-1",
        recipe: [{ stockItemId: "ins-leite", name: "Leite", qty: 100, unit: "ml" }],
      });
      const f2 = flavor({
        id: "sabor-2",
        recipe: [{ stockItemId: "ins-leite", name: "Leite", qty: 60, unit: "ml" }],
      });
      const { insumos } = buildConsumptionRequests(
        [shakeLine({ shake: { flavorIds: ["sabor-1", "sabor-2"], baseId: null, rims: [], mixins: [] } })],
        new Map(),
        catalogs({ flavors: new Map([["sabor-1", f1], ["sabor-2", f2]]) }),
      );
      // 100ml + 60ml summed onto the same insumo, uses accumulate too (1 + 1).
      expect(insumos.get("ins-leite")).toEqual({ amount: 160, uses: 2 });
    });

    it("three selected flavors all contribute, plus rims/mixins/utensílios still resolve once per line", () => {
      const f1 = flavor({ id: "sabor-1", recipe: [{ stockItemId: "ins-a", name: "A", qty: 10, unit: "g" }] });
      const f2 = flavor({ id: "sabor-2", recipe: [{ stockItemId: "ins-b", name: "B", qty: 20, unit: "g" }] });
      const f3 = flavor({ id: "sabor-3", recipe: [{ stockItemId: "ins-c", name: "C", qty: 30, unit: "g" }] });
      const rim = tiered({
        id: "rim-1",
        insumo: { stockItemId: "ins-nutella", name: "Nutella", qty: 20, unit: "g" },
      }) as ShakeRim;
      const { insumos } = buildConsumptionRequests(
        [
          shakeLine({
            shake: {
              flavorIds: ["sabor-1", "sabor-2", "sabor-3"],
              baseId: null,
              rims: [{ modifierId: "rim-1", qty: 1 }],
              mixins: [],
            },
          }),
        ],
        new Map(),
        catalogs({
          flavors: new Map([["sabor-1", f1], ["sabor-2", f2], ["sabor-3", f3]]),
          rims: new Map([["rim-1", rim]]),
        }),
      );
      expect(insumos.get("ins-a")).toEqual({ amount: 10, uses: 1 });
      expect(insumos.get("ins-b")).toEqual({ amount: 20, uses: 1 });
      expect(insumos.get("ins-c")).toEqual({ amount: 30, uses: 1 });
      // The rim isn't per-flavor — it resolves exactly once per line either way.
      expect(insumos.get("ins-nutella")).toEqual({ amount: 20, uses: 1 });
    });

    it("a partially-deleted flavor set still draws the surviving flavors' recipes", () => {
      const f1 = flavor({
        id: "sabor-1",
        recipe: [{ stockItemId: "ins-shake", name: "Shake base", qty: 26, unit: "g" }],
      });
      const { insumos } = buildConsumptionRequests(
        [shakeLine({ shake: { flavorIds: ["sabor-1", "gone"], baseId: null, rims: [], mixins: [] } })],
        new Map(),
        catalogs({ flavors: new Map([["sabor-1", f1]]) }),
      );
      expect(insumos.get("ins-shake")).toEqual({ amount: 26, uses: 1 });
    });
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
              flavorIds: ["sabor-1"],
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
              flavorIds: ["sabor-1"],
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
              flavorIds: ["sabor-1"],
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
              flavorIds: ["sabor-1"],
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
              flavorIds: ["sabor-1"],
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

describe("buildConsumptionRequests · Montar pudim lines", () => {
  function flavor(overrides: Partial<PudimFlavor> & { id: string }): PudimFlavor {
    return { name: overrides.id, price: 3000, recipe: [], archived: false, createdAt: "", ...overrides };
  }
  function base(overrides: Partial<PudimBase> & { id: string }): PudimBase {
    return {
      name: overrides.id,
      insumo: { name: "Insumo", qty: 1, unit: "un" },
      price: 0,
      archived: false,
      createdAt: "",
      ...overrides,
    };
  }
  function mixin(overrides: Partial<PudimMixin> & { id: string }): PudimMixin {
    return {
      name: overrides.id,
      insumo: { name: "Insumo", qty: 1, unit: "un" },
      tiers: [{ qty: 1, price: 500 }],
      archived: false,
      createdAt: "",
      ...overrides,
    };
  }
  function utensil(overrides: Partial<PudimUtensil> & { id: string }): PudimUtensil {
    return {
      name: overrides.id,
      insumo: { name: "Insumo", qty: 1, unit: "un" },
      defaultIncluded: true,
      archived: false,
      createdAt: "",
      ...overrides,
    };
  }

  function catalogs(over: Partial<PudimCatalogs> = {}): PudimCatalogs {
    return {
      flavors: new Map(),
      bases: new Map(),
      mixins: new Map(),
      utensils: [],
      ...over,
    };
  }

  function pudimLine(overrides: Partial<OrderItem> = {}): OrderItem {
    return {
      productId: "sabor-1",
      name: "Pudim",
      qty: 1,
      unitPrice: 3000,
      pudim: {
        flavorId: "sabor-1",
        baseId: null,
        mixins: [],
      },
      ...overrides,
    };
  }

  it("consumes the flavor's own recipe, scaled by lineQty", () => {
    const f = flavor({
      id: "sabor-1",
      recipe: [{ stockItemId: "ins-pudim", name: "Pudim base", qty: 26, unit: "g" }],
    });
    const { insumos } = buildConsumptionRequests(
      [pudimLine({ qty: 2 })],
      new Map(),
      undefined,
      catalogs({ flavors: new Map([["sabor-1", f]]) }),
    );
    expect(insumos.get("ins-pudim")).toEqual({ amount: 52, uses: 2 });
  });

  it("consumes the chosen base's insumo (0/no draw when baseId is null)", () => {
    const f = flavor({ id: "sabor-1" });
    const b = base({
      id: "base-1",
      insumo: { stockItemId: "ins-leite", name: "Leite", qty: 150, unit: "ml" },
    });
    const withBase = buildConsumptionRequests(
      [pudimLine({ pudim: { flavorId: "sabor-1", baseId: "base-1", mixins: [] } })],
      new Map(),
      undefined,
      catalogs({ flavors: new Map([["sabor-1", f]]), bases: new Map([["base-1", b]]) }),
    );
    expect(withBase.insumos.get("ins-leite")).toEqual({ amount: 150, uses: 1 });

    const noBase = buildConsumptionRequests(
      [pudimLine()],
      new Map(),
      undefined,
      catalogs({ flavors: new Map([["sabor-1", f]]), bases: new Map([["base-1", b]]) }),
    );
    expect(noBase.insumos.has("ins-leite")).toBe(false);
  });

  it("mixin quantity scales the insumo draw, by both mixin qty and lineQty", () => {
    const f = flavor({ id: "sabor-1" });
    const m = mixin({
      id: "mix-1",
      insumo: { stockItemId: "ins-fibra", name: "Fibra", qty: 1, unit: "dose" },
    });
    const { insumos } = buildConsumptionRequests(
      [
        pudimLine({
          qty: 2, // 2 pudins ordered
          pudim: { flavorId: "sabor-1", baseId: null, mixins: [{ modifierId: "mix-1", qty: 2 }] },
        }),
      ],
      new Map(),
      undefined,
      catalogs({ flavors: new Map([["sabor-1", f]]), mixins: new Map([["mix-1", m]]) }),
    );
    // 1 dose × 2 (mixin qty) × 2 (lineQty) = 4, uses = 2×2 = 4
    expect(insumos.get("ins-fibra")).toEqual({ amount: 4, uses: 4 });
  });

  it("two mixins (or a mixin + base) sharing a stockItemId sum into one InsumoNeed", () => {
    const f = flavor({ id: "sabor-1" });
    const b = base({
      id: "base-1",
      insumo: { stockItemId: "ins-leite", name: "Leite", qty: 100, unit: "ml" },
    });
    const m = mixin({
      id: "mix-1",
      insumo: { stockItemId: "ins-leite", name: "Leite", qty: 30, unit: "ml" },
    });
    const { insumos } = buildConsumptionRequests(
      [
        pudimLine({
          pudim: { flavorId: "sabor-1", baseId: "base-1", mixins: [{ modifierId: "mix-1", qty: 1 }] },
        }),
      ],
      new Map(),
      undefined,
      catalogs({
        flavors: new Map([["sabor-1", f]]),
        bases: new Map([["base-1", b]]),
        mixins: new Map([["mix-1", m]]),
      }),
    );
    expect(insumos.get("ins-leite")).toEqual({ amount: 130, uses: 2 });
  });

  it("utensílio with defaultIncluded=true is drawn automatically", () => {
    const f = flavor({ id: "sabor-1" });
    const u = utensil({
      id: "copo",
      defaultIncluded: true,
      insumo: { stockItemId: "ins-copo", name: "Copo", qty: 1, unit: "un" },
    });
    const { insumos } = buildConsumptionRequests(
      [pudimLine()],
      new Map(),
      undefined,
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

    const skipped = buildConsumptionRequests([pudimLine()], new Map(), undefined, cat);
    expect(skipped.insumos.has("ins-canudo")).toBe(false);

    const included = buildConsumptionRequests(
      [
        pudimLine({
          pudim: {
            flavorId: "sabor-1",
            baseId: null,
            mixins: [],
            utensilOverrides: [{ utensilId: "canudo", included: true }],
          },
        }),
      ],
      new Map(),
      undefined,
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
        pudimLine({
          pudim: {
            flavorId: "sabor-1",
            baseId: null,
            mixins: [],
            utensilOverrides: [{ utensilId: "guardanapo", included: false }],
          },
        }),
      ],
      new Map(),
      undefined,
      catalogs({ flavors: new Map([["sabor-1", f]]), utensils: [u] }),
    );
    expect(insumos.has("ins-guardanapo")).toBe(false);
  });

  it("missing catalogs (undefined) is a best-effort no-op, never throws", () => {
    expect(() => buildConsumptionRequests([pudimLine()], new Map())).not.toThrow();
    const { insumos } = buildConsumptionRequests([pudimLine()], new Map());
    expect(insumos.size).toBe(0);
  });

  it("a pudim line referencing a deleted flavor/base/mixin is skipped, not thrown", () => {
    const { insumos } = buildConsumptionRequests(
      [
        pudimLine({
          pudim: {
            flavorId: "gone",
            baseId: "also-gone",
            mixins: [{ modifierId: "gone-too", qty: 1 }],
          },
        }),
      ],
      new Map(),
      undefined,
      catalogs(),
    );
    expect(insumos.size).toBe(0);
  });

  describe("brinde (free Product riding a pudim line)", () => {
    it("a unitPrice:0 brinde line still consumes its recipe (headline regression case)", () => {
      const f = flavor({ id: "sabor-1" });
      const brindeProduct = product({
        id: "cha-limao",
        recipe: [{ stockItemId: "ins-cha", name: "Chá", qty: 5, unit: "g" }],
      });
      const { insumos } = buildConsumptionRequests(
        [
          pudimLine({
            unitPrice: 0,
            pudim: {
              flavorId: "sabor-1",
              baseId: null,
              mixins: [],
              brinde: { productId: "cha-limao", name: "Chá Limão", listPrice: 800 },
            },
          }),
        ],
        new Map([["cha-limao", brindeProduct]]),
        undefined,
        catalogs({ flavors: new Map([["sabor-1", f]]) }),
      );
      expect(insumos.get("ins-cha")).toEqual({ amount: 5, uses: 1 });
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
          pudimLine({
            pudim: {
              flavorId: "sabor-1",
              baseId: null,
              mixins: [],
              brinde: { productId: "bolo-fatia", name: "Bolo", listPrice: 600 },
            },
          }),
        ],
        new Map([["bolo-fatia", brindeProduct]]),
        undefined,
        catalogs({ flavors: new Map([["sabor-1", f]]) }),
      );
      expect(produced.get("bolo-fatia")).toBe(1);
      expect(insumos.has("ins-farinha")).toBe(false);
    });

    it("a brinde whose Product is absent from the map is skipped without throwing", () => {
      const f = flavor({ id: "sabor-1" });
      const args: Parameters<typeof buildConsumptionRequests> = [
        [
          pudimLine({
            pudim: {
              flavorId: "sabor-1",
              baseId: null,
              mixins: [],
              brinde: { productId: "gone", name: "Sumiu", listPrice: 500 },
            },
          }),
        ],
        new Map(),
        undefined,
        catalogs({ flavors: new Map([["sabor-1", f]]) }),
      ];
      expect(() => buildConsumptionRequests(...args)).not.toThrow();
      const { insumos, produced } = buildConsumptionRequests(...args);
      expect(insumos.size).toBe(0);
      expect(produced.size).toBe(0);
    });
  });
});
