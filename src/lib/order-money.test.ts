import { describe, expect, it } from "vitest";
import type { OrderItem } from "./types";
import {
  cartelaCovered,
  discountAmount,
  itemsSubtotal,
  netOfCartela,
  orderMoney,
} from "./order-money";

function item(over: Partial<OrderItem> = {}): OrderItem {
  return {
    productId: "p1",
    name: "Shake da Beleza",
    qty: 1,
    unitPrice: 3000,
    ...over,
  };
}

describe("netOfCartela", () => {
  it("equals plain qty * unitPrice sum for coverage-free items", () => {
    const items = [item({ unitPrice: 3000, qty: 2 }), item({ unitPrice: 1500, qty: 1 })];
    expect(netOfCartela(items)).toBe(7500);
    expect(itemsSubtotal(items)).toBe(7500); // no coverage -> subtotal === netOfCartela
    expect(cartelaCovered(items)).toBe(0);
  });
});

describe("itemsSubtotal / cartelaCovered", () => {
  it("adds coverage back on top of the netted unitPrice", () => {
    // A line covered by a cartela: unitPrice already nets the coverage out.
    const items = [
      item({
        unitPrice: 0,
        qty: 1,
        cartelaUse: { cartelaId: "c1", code: "ABCD", uses: 1, covered: 3000, listPrice: 3000 },
      }),
      item({ unitPrice: 2000, qty: 1 }),
    ];
    expect(itemsSubtotal(items)).toBe(5000); // 3000 (covered+0) + 2000
    expect(cartelaCovered(items)).toBe(3000);
    expect(netOfCartela(items)).toBe(2000); // today's orderTotal()
  });

  it("scales coverage by qty", () => {
    const items = [
      item({
        unitPrice: 1000,
        qty: 3,
        cartelaUse: { cartelaId: "c1", code: "ABCD", uses: 1, covered: 500, listPrice: 1500 },
      }),
    ];
    expect(itemsSubtotal(items)).toBe(4500); // 3 * (1000 + 500)
    expect(cartelaCovered(items)).toBe(1500); // 3 * 500
    expect(netOfCartela(items)).toBe(3000); // 3 * 1000
  });
});

describe("discountAmount", () => {
  it("free discounts the full base", () => {
    expect(discountAmount(8200, { kind: "free", value: 0, reason: undefined })).toBe(8200);
  });

  it("percent rounds to the nearest centavo", () => {
    expect(discountAmount(8200, { kind: "percent", value: 15 })).toBe(1230);
    expect(discountAmount(3333, { kind: "percent", value: 33 })).toBe(1100); // 1099.89 -> 1100
  });

  it("clamps percent value to [0, 100]", () => {
    expect(discountAmount(1000, { kind: "percent", value: 150 })).toBe(1000);
    expect(discountAmount(1000, { kind: "percent", value: -10 })).toBe(0);
  });

  it("flat is clamped to [0, base]", () => {
    expect(discountAmount(1000, { kind: "flat", value: 400 })).toBe(400);
    expect(discountAmount(1000, { kind: "flat", value: 5000 })).toBe(1000); // never exceeds base
    expect(discountAmount(1000, { kind: "flat", value: -200 })).toBe(0); // never negative
  });

  it("is a no-op for null/undefined discount", () => {
    expect(discountAmount(8200, null)).toBe(0);
    expect(discountAmount(8200, undefined)).toBe(0);
  });

  it("is zero when base is zero or negative", () => {
    expect(discountAmount(0, { kind: "free", value: 0 })).toBe(0);
  });
});

describe("orderMoney — mockup worked example", () => {
  it("8200 subtotal @ 15% => 1230 discount, 6970 total", () => {
    const items = [item({ unitPrice: 8200, qty: 1 })];
    const money = orderMoney(items, { kind: "percent", value: 15 });
    expect(money.subtotal).toBe(8200);
    expect(money.covered).toBe(0);
    expect(money.afterCartela).toBe(8200);
    expect(money.discount).toEqual({ kind: "percent", value: 15, amount: 1230, reason: undefined });
    expect(money.total).toBe(6970);
  });
});

describe("orderMoney — discount stacks AFTER cartela coverage", () => {
  it("subtotal 11800, covered 3000, 10% discount => amount 880 not 1180, total 7920", () => {
    const items = [
      // list price 3000, fully covered by a cartela -> unitPrice nets to 0
      item({
        unitPrice: 0,
        qty: 1,
        cartelaUse: { cartelaId: "c1", code: "ABCD", uses: 1, covered: 3000, listPrice: 3000 },
      }),
      // remaining lines sum to 8800 list price, uncovered
      item({ unitPrice: 8800, qty: 1 }),
    ];
    const money = orderMoney(items, { kind: "percent", value: 10 });
    expect(money.subtotal).toBe(11800); // 3000 + 8800
    expect(money.covered).toBe(3000);
    expect(money.afterCartela).toBe(8800); // the base the discount applies to
    // 10% of 8800 (NOT 11800) => 880
    expect(money.discount?.amount).toBe(880);
    expect(money.total).toBe(7920); // 8800 - 880
  });
});

describe("orderMoney — null/undefined discount is a no-op", () => {
  it("total equals netOfCartela when there is no discount", () => {
    const items = [item({ unitPrice: 5000, qty: 2 })];
    expect(orderMoney(items).discount).toBeNull();
    expect(orderMoney(items).total).toBe(10000);
    expect(orderMoney(items, null).discount).toBeNull();
    expect(orderMoney(items, null).total).toBe(10000);
    expect(orderMoney(items, undefined).total).toBe(netOfCartela(items));
  });
});

describe("orderMoney — flat discount", () => {
  it("subtracts a fixed centavo amount from the coverage-netted base", () => {
    const items = [item({ unitPrice: 5000, qty: 1 })];
    const money = orderMoney(items, { kind: "flat", value: 1200 });
    expect(money.discount?.amount).toBe(1200);
    expect(money.total).toBe(3800);
  });
});
