import { describe, expect, it } from "vitest";
import type { OrderItem, Product } from "@/lib/types";
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

  it("legacy manual add-on (stockItemId, no productId) consumes its own insumo", () => {
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

  it("catalog-linked (productId) add-on draws for the referenced adicional product, sob-demanda recipe", () => {
    const caldaQuente = product({
      id: "calda-quente",
      saleType: "adicional",
      recipe: [{ stockItemId: "ins-calda", name: "Calda", qty: 1, unit: "un" }],
    });
    const shake = product({
      id: "shake",
      adicionais: [{ name: "Calda Quente", price: 300, productId: "calda-quente" }],
    });
    const { insumos } = buildConsumptionRequests(
      [line({ productId: "shake", qty: 3, addons: ["Calda Quente"] })],
      new Map([
        ["shake", shake],
        ["calda-quente", caldaQuente],
      ]),
    );
    // 1 unit of Calda Quente's own recipe (qty:1) per shake sold.
    expect(insumos.get("ins-calda")).toEqual({ amount: 3, uses: 3 });
  });

  it("catalog-linked add-on to a stockManaged adicional product draws from its producedStock", () => {
    const chantilly = product({
      id: "chantilly",
      saleType: "adicional",
      stockManaged: true,
      recipe: [{ stockItemId: "ins-cream", name: "Creme", qty: 1, unit: "un" }],
    });
    const shake = product({
      id: "shake",
      adicionais: [{ name: "Chantilly", price: 200, productId: "chantilly" }],
    });
    const { insumos, produced } = buildConsumptionRequests(
      [line({ productId: "shake", qty: 2, addons: ["Chantilly"] })],
      new Map([
        ["shake", shake],
        ["chantilly", chantilly],
      ]),
    );
    expect(produced.get("chantilly")).toBe(2);
    expect(insumos.size).toBe(0);
  });

  it("catalog-linked add-on whose referenced product is missing from the map is skipped, not thrown", () => {
    const shake = product({
      id: "shake",
      adicionais: [{ name: "Sumiu", price: 100, productId: "deleted-product" }],
    });
    const { insumos, produced } = buildConsumptionRequests(
      [line({ productId: "shake", qty: 1, addons: ["Sumiu"] })],
      new Map([["shake", shake]]),
    );
    expect(insumos.size).toBe(0);
    expect(produced.size).toBe(0);
  });
});
