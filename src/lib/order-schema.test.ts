import { describe, expect, it } from "vitest";
import { discountSchema, orderItemSchema } from "./order-schema";

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
        flavorIds: ["sabor-1"],
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
      shake: { flavorIds: ["sabor-1"], baseId: null, rims: [], mixins: [] },
    });
    expect(parsed.shake?.brinde).toBeUndefined();
  });

  it("round-trips a shake line with 2-3 flavorIds", () => {
    const two = orderItemSchema.parse({
      ...base,
      productId: "sabor-1",
      shake: { flavorIds: ["sabor-1", "sabor-2"], baseId: null, rims: [], mixins: [] },
    });
    expect(two.shake?.flavorIds).toEqual(["sabor-1", "sabor-2"]);

    const three = orderItemSchema.parse({
      ...base,
      productId: "sabor-1",
      shake: {
        flavorIds: ["sabor-1", "sabor-2", "sabor-3"],
        baseId: null,
        rims: [],
        mixins: [],
      },
    });
    expect(three.shake?.flavorIds).toEqual(["sabor-1", "sabor-2", "sabor-3"]);
  });

  it("rejects a shake line with duplicate flavorIds", () => {
    expect(() =>
      orderItemSchema.parse({
        ...base,
        productId: "sabor-1",
        shake: { flavorIds: ["sabor-1", "sabor-1"], baseId: null, rims: [], mixins: [] },
      }),
    ).toThrow();
  });

  it("rejects a shake line with more than MAX_SHAKE_FLAVORS", () => {
    expect(() =>
      orderItemSchema.parse({
        ...base,
        productId: "sabor-1",
        shake: {
          flavorIds: ["sabor-1", "sabor-2", "sabor-3", "sabor-4"],
          baseId: null,
          rims: [],
          mixins: [],
        },
      }),
    ).toThrow();
  });

  it("rejects a shake line with zero flavorIds", () => {
    expect(() =>
      orderItemSchema.parse({
        ...base,
        productId: "sabor-1",
        shake: { flavorIds: [], baseId: null, rims: [], mixins: [] },
      }),
    ).toThrow();
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

  it("rejects a line combining shake and cartelaSale", () => {
    expect(() =>
      orderItemSchema.parse({
        ...base,
        shake: { flavorIds: ["sabor-1"], baseId: null, rims: [], mixins: [] },
        cartelaSale: { paidUses: 10, totalUses: 11, unitValue: 3000 },
      }),
    ).toThrow();
  });

  it("rejects a line combining cartelaSale and cartelaUse", () => {
    expect(() =>
      orderItemSchema.parse({
        ...base,
        cartelaSale: { paidUses: 10, totalUses: 11, unitValue: 3000 },
        cartelaUse: { cartelaId: "c1", code: "C012", uses: 1, covered: 1000, listPrice: 1000 },
      }),
    ).toThrow();
  });

  it("allows a shake line paid down with a cartela (redeeming a punch card for a shake)", () => {
    const parsed = orderItemSchema.parse({
      ...base,
      unitPrice: 0,
      shake: { flavorIds: ["sabor-1"], baseId: null, rims: [], mixins: [] },
      cartelaUse: { cartelaId: "c1", code: "C012", uses: 1, covered: 1000, listPrice: 1000 },
    });
    expect(parsed.shake).toBeDefined();
    expect(parsed.cartelaUse).toBeDefined();
  });
});

/**
 * discountSchema round-trips, one per kind — `value`'s valid range depends on
 * `kind` (centavos for flat, 1-100 for percent, always 0 for free), so each
 * kind gets its own accept + reject pair.
 */
describe("discountSchema", () => {
  it("round-trips a flat discount (centavos)", () => {
    const input = { kind: "flat" as const, value: 500, reason: "combinado" as const };
    expect(discountSchema.parse(input)).toEqual(input);
  });

  it("rejects a flat discount with value <= 0", () => {
    expect(() => discountSchema.parse({ kind: "flat", value: 0 })).toThrow();
  });

  it("round-trips a percent discount (1-100, reason optional)", () => {
    const input = { kind: "percent" as const, value: 50 };
    expect(discountSchema.parse(input)).toEqual(input);
  });

  it("rejects a percent discount outside 1-100", () => {
    expect(() => discountSchema.parse({ kind: "percent", value: 0 })).toThrow();
    expect(() => discountSchema.parse({ kind: "percent", value: 101 })).toThrow();
  });

  it("round-trips a free discount (value always 0)", () => {
    const input = { kind: "free" as const, value: 0, reason: "cortesia" as const };
    expect(discountSchema.parse(input)).toEqual(input);
  });

  it("rejects a free discount with a non-zero value", () => {
    expect(() => discountSchema.parse({ kind: "free", value: 100 })).toThrow();
  });
});
