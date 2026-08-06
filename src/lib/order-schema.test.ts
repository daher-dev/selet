import { describe, expect, it } from "vitest";
import { orderItemSchema } from "./order-schema";

/**
 * Regression guard for Zod's silent-unknown-key-strip: this schema has
 * already lost a field twice (OrderItem.shake, then shake.brinde) because
 * z.object() drops unrecognized keys instead of rejecting them, so a typo'd
 * or forgotten field never surfaces as a validation error — the data just
 * vanishes on save. Every optional sub-object gets its own round-trip test
 * here so a future field gets the same treatment automatically once it's
 * added to a fixture below.
 */
describe("orderItemSchema", () => {
  const base = { productId: "p1", name: "Item", qty: 1, unitPrice: 1000 };

  it("parses a plain Cardápio line with no extras", () => {
    const parsed = orderItemSchema.parse(base);
    expect(parsed.shake).toBeUndefined();
    expect(parsed.cartelaSale).toBeUndefined();
    expect(parsed.cartelaUse).toBeUndefined();
  });

  it("round-trips a shake line's brinde selection intact", () => {
    const input = {
      ...base,
      productId: "sabor-1",
      unitPrice: 500,
      shake: {
        flavorId: "sabor-1",
        baseId: null,
        rims: [],
        mixins: [],
        brinde: {
          productId: "prod-cha",
          name: "Chá Limão",
          listPrice: 1200,
          addons: [{ name: "Fibra Ativa", price: 500 }],
        },
      },
    };
    const parsed = orderItemSchema.parse(input);
    expect(parsed.shake?.brinde).toEqual(input.shake.brinde);
  });

  it("round-trips a shake line with no brinde (optional, stays undefined)", () => {
    const parsed = orderItemSchema.parse({
      ...base,
      productId: "sabor-1",
      shake: { flavorId: "sabor-1", baseId: null, rims: [], mixins: [] },
    });
    expect(parsed.shake?.brinde).toBeUndefined();
  });

  it("round-trips a cartela-sale line", () => {
    const input = {
      ...base,
      qty: 1,
      unitPrice: 30000,
      cartelaSale: { paidUses: 10, totalUses: 11, unitValue: 3000 },
    };
    const parsed = orderItemSchema.parse(input);
    expect(parsed.cartelaSale).toEqual(input.cartelaSale);
  });

  it("rejects a cartela-sale line where totalUses isn't paidUses + 1", () => {
    expect(() =>
      orderItemSchema.parse({
        ...base,
        cartelaSale: { paidUses: 10, totalUses: 10, unitValue: 3000 },
      }),
    ).toThrow();
  });

  it("round-trips a cartela-use line and enforces the covered-price invariant", () => {
    const input = {
      ...base,
      qty: 1,
      unitPrice: 0,
      cartelaUse: { cartelaId: "c1", code: "C012", uses: 1, covered: 1000, listPrice: 1000 },
    };
    const parsed = orderItemSchema.parse(input);
    expect(parsed.cartelaUse).toEqual(input.cartelaUse);

    expect(() =>
      orderItemSchema.parse({
        ...base,
        unitPrice: 999, // should be listPrice - covered = 0
        cartelaUse: { cartelaId: "c1", code: "C012", uses: 1, covered: 1000, listPrice: 1000 },
      }),
    ).toThrow();
  });

  it("rejects a line combining shake and a cartela field", () => {
    expect(() =>
      orderItemSchema.parse({
        ...base,
        shake: { flavorId: "sabor-1", baseId: null, rims: [], mixins: [] },
        cartelaSale: { paidUses: 10, totalUses: 11, unitValue: 3000 },
      }),
    ).toThrow();
  });
});
