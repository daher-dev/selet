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
