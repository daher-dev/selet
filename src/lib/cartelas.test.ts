import { describe, expect, it } from "vitest";
import type { Cartela, CartelaUse } from "./types";
import {
  balanceValue,
  cartelaCode,
  computeStatus,
  coverageFor,
  punchStates,
  remainingUses,
  usesByOrder,
} from "./cartelas";

function use(over: Partial<CartelaUse> = {}): CartelaUse {
  return {
    orderId: "o1",
    orderCode: "O001",
    productName: "Shake da Beleza",
    at: "2026-08-01T10:00:00.000Z",
    ...over,
  };
}

function cartela(over: Partial<Cartela> = {}): Cartela {
  const paidUses = over.paidUses ?? 2;
  return {
    id: "abcd1234",
    code: "ABCD",
    customerId: "c1",
    customerName: "Cliente",
    paidUses,
    totalUses: paidUses + 1,
    unitValue: 3000,
    amount: paidUses * 3000,
    uses: [],
    status: "ativa",
    soldOnOrderId: "o0",
    purchasedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

describe("cartelaCode", () => {
  it("uppercases the first 4 chars of the id, mirroring orderCode", () => {
    expect(cartelaCode("abcd1234")).toBe("ABCD");
  });
});

describe("remainingUses", () => {
  it("is totalUses - uses.length, never negative", () => {
    expect(remainingUses(cartela({ paidUses: 2, uses: [] }))).toBe(3);
    expect(remainingUses(cartela({ paidUses: 2, uses: [use(), use(), use()] }))).toBe(0);
    // over-redemption defensively clamps at 0 rather than going negative
    expect(remainingUses(cartela({ paidUses: 2, uses: [use(), use(), use(), use()] }))).toBe(0);
  });
});

describe("punchStates", () => {
  it("lays out brinde-livre + all livre when nothing was used", () => {
    expect(punchStates(cartela({ paidUses: 2, uses: [] }))).toEqual([
      "brinde-livre",
      "livre",
      "livre",
    ]);
  });

  it("consumes the brinde first (index 0), then paid uses in order", () => {
    expect(punchStates(cartela({ paidUses: 2, uses: [use()] }))).toEqual([
      "brinde-usado",
      "livre",
      "livre",
    ]);
    expect(punchStates(cartela({ paidUses: 2, uses: [use(), use()] }))).toEqual([
      "brinde-usado",
      "usado",
      "livre",
    ]);
  });

  it("all used when uses.length === totalUses", () => {
    expect(punchStates(cartela({ paidUses: 2, uses: [use(), use(), use()] }))).toEqual([
      "brinde-usado",
      "usado",
      "usado",
    ]);
  });

  it("returns exactly totalUses entries for a 1-paid-use cartela (2 total)", () => {
    expect(punchStates(cartela({ paidUses: 1, uses: [] }))).toEqual(["brinde-livre", "livre"]);
    expect(punchStates(cartela({ paidUses: 1, uses: [use()] }))).toEqual([
      "brinde-usado",
      "livre",
    ]);
  });
});

describe("balanceValue", () => {
  it("is remainingUses * unitValue", () => {
    expect(balanceValue(cartela({ paidUses: 10, unitValue: 3000, uses: [] }))).toBe(11 * 3000);
    expect(
      balanceValue(cartela({ paidUses: 10, unitValue: 3000, uses: Array.from({ length: 5 }, () => use()) })),
    ).toBe(6 * 3000);
  });

  it("is 0 once fully redeemed", () => {
    const c = cartela({ paidUses: 2, unitValue: 3000, uses: [use(), use(), use()] });
    expect(balanceValue(c)).toBe(0);
  });
});

describe("coverageFor", () => {
  it("returns null (blocked) when the line's price is below the unit value", () => {
    expect(coverageFor(2000, 3000)).toBeNull();
  });

  it("returns the unit value when the line's price is exactly equal", () => {
    expect(coverageFor(3000, 3000)).toBe(3000);
  });

  it("returns the unit value when the line's price is above (never forfeits the difference)", () => {
    expect(coverageFor(5000, 3000)).toBe(3000);
  });
});

describe("computeStatus", () => {
  it("is ativa while uses remain", () => {
    expect(computeStatus(cartela({ paidUses: 2, uses: [], status: "ativa" }))).toBe("ativa");
    expect(computeStatus(cartela({ paidUses: 2, uses: [use()], status: "ativa" }))).toBe("ativa");
  });

  it("becomes esgotada when remainingUses hits 0", () => {
    expect(
      computeStatus(cartela({ paidUses: 2, uses: [use(), use(), use()], status: "ativa" })),
    ).toBe("esgotada");
  });

  it("never overrides a cancelada flag, even with uses remaining", () => {
    expect(computeStatus(cartela({ paidUses: 2, uses: [], status: "cancelada" }))).toBe(
      "cancelada",
    );
  });
});

describe("usesByOrder", () => {
  it("tags only the very first use (uses[0]) as the brinde", () => {
    const c = cartela({
      paidUses: 2,
      uses: [
        use({ orderId: "o1", orderCode: "O001", at: "2026-08-01T10:00:00.000Z" }),
        use({ orderId: "o2", orderCode: "O002", at: "2026-08-02T10:00:00.000Z" }),
      ],
    });
    const groups = usesByOrder(c);
    const flat = groups.flatMap((g) => g.uses);
    expect(flat.find((u) => u.orderId === "o1")?.isBrinde).toBe(true);
    expect(flat.find((u) => u.orderId === "o2")?.isBrinde).toBe(false);
  });

  it("groups multiple uses from the same order together", () => {
    const c = cartela({
      paidUses: 3,
      uses: [
        use({ orderId: "o1", orderCode: "O001", at: "2026-08-01T10:00:00.000Z" }),
        use({ orderId: "o1", orderCode: "O001", at: "2026-08-01T10:05:00.000Z" }),
        use({ orderId: "o2", orderCode: "O002", at: "2026-08-02T10:00:00.000Z" }),
      ],
    });
    const groups = usesByOrder(c);
    expect(groups).toHaveLength(2);
    const o1Group = groups.find((g) => g.orderId === "o1");
    expect(o1Group?.uses).toHaveLength(2);
  });

  it("orders groups newest-first", () => {
    const c = cartela({
      paidUses: 2,
      uses: [
        use({ orderId: "o1", orderCode: "O001", at: "2026-08-01T10:00:00.000Z" }),
        use({ orderId: "o2", orderCode: "O002", at: "2026-08-03T10:00:00.000Z" }),
      ],
    });
    const groups = usesByOrder(c);
    expect(groups.map((g) => g.orderId)).toEqual(["o2", "o1"]);
  });

  it("returns an empty array for a never-used cartela", () => {
    expect(usesByOrder(cartela({ paidUses: 2, uses: [] }))).toEqual([]);
  });
});
