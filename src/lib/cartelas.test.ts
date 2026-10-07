import { describe, expect, it } from "vitest";
import type { Cartela, CartelaManualUse, CartelaOrderUse, CartelaUse } from "./types";
import {
  balanceValue,
  cartelaCode,
  cartelaMonthlyStats,
  computeStatus,
  coverageFor,
  forecastPunchStates,
  manualUseGroups,
  punchStates,
  remainingUses,
  usesByOrder,
} from "./cartelas";

function use(over: Partial<CartelaOrderUse> = {}): CartelaUse {
  return {
    kind: "order",
    orderId: "o1",
    orderCode: "O001",
    productName: "Shake da Beleza",
    at: "2026-08-01T10:00:00.000Z",
    ...over,
  };
}

function manualUse(over: Partial<CartelaManualUse> = {}): CartelaUse {
  return {
    kind: "manual",
    reason: "NAO_REGISTRADO",
    by: "Camila",
    at: "2026-08-03T10:00:00.000Z",
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

  it("renders a manual adjustment as 'ajuste' regardless of position", () => {
    expect(
      punchStates(cartela({ paidUses: 2, uses: [use(), manualUse(), use()] })),
    ).toEqual(["brinde-usado", "ajuste", "usado"]);
    // even when the manual entry happens to be the brinde slot
    expect(punchStates(cartela({ paidUses: 2, uses: [manualUse()] }))).toEqual([
      "ajuste",
      "livre",
      "livre",
    ]);
  });
});

describe("forecastPunchStates", () => {
  it("0 pre-existing used, some new-in-draft: split is all usado-agora then disponivel", () => {
    // paidUses: 2 → totalUses 3, nothing used yet, this order will consume 2.
    expect(forecastPunchStates(cartela({ paidUses: 2, uses: [] }), 0, 2)).toEqual([
      "usado-agora",
      "usado-agora",
      "disponivel",
    ]);
  });

  it("some pre-existing used, 0 new-in-draft: prior states carry their real per-slot kind", () => {
    // brinde + 1 paid use already redeemed by a DIFFERENT order; this order adds nothing new.
    expect(forecastPunchStates(cartela({ paidUses: 2, uses: [use(), use()] }), 0, 0)).toEqual([
      "brinde-usado",
      "usado",
      "disponivel",
    ]);
  });

  it("mix of pre-existing and new: prior prefix + usado-agora + remainder, in that order", () => {
    // 1 pre-existing use (the brinde), this order adds 1 more (a paid slot).
    expect(forecastPunchStates(cartela({ paidUses: 2, uses: [use()] }), 0, 1)).toEqual([
      "brinde-usado",
      "usado-agora",
      "disponivel",
    ]);
  });

  it("fully exhausted after save: no disponivel slots left, no negative padding", () => {
    expect(forecastPunchStates(cartela({ paidUses: 2, uses: [use()] }), 0, 2)).toEqual([
      "brinde-usado",
      "usado-agora",
      "usado-agora",
    ]);
  });

  it("consumedByThisOrder strips exactly that many uses off the pre-existing prefix", () => {
    // This SAME order (being edited) already holds 1 use against this cartela
    // (the brinde) — it's about to be reversed and replaced by newUsesInDraft,
    // so it must NOT appear in the "prior" (unrelated-to-this-save) prefix.
    const c = cartela({ paidUses: 2, uses: [use()] });
    expect(forecastPunchStates(c, 1, 1)).toEqual(["usado-agora", "disponivel", "disponivel"]);
  });

  it("a pre-existing manual 'ajuste' slot keeps rendering as ajuste, not usado/usado-agora", () => {
    const c = cartela({ paidUses: 2, uses: [use(), manualUse()] });
    expect(forecastPunchStates(c, 0, 0)).toEqual(["brinde-usado", "ajuste", "disponivel"]);
  });

  it("defaults consumedByThisOrder/newUsesInDraft to 0 (create-order case)", () => {
    expect(forecastPunchStates(cartela({ paidUses: 1, uses: [use()] }))).toEqual([
      "brinde-usado",
      "disponivel",
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

  it("excludes manual adjustments — they have no order to group by", () => {
    const c = cartela({
      paidUses: 2,
      uses: [
        use({ orderId: "o1", orderCode: "O001", at: "2026-08-01T10:00:00.000Z" }),
        manualUse({ at: "2026-08-02T10:00:00.000Z" }),
      ],
    });
    const groups = usesByOrder(c);
    expect(groups).toHaveLength(1);
    expect(groups[0].orderId).toBe("o1");
  });
});

describe("manualUseGroups", () => {
  it("groups uses sharing the same `at` into one batch with a count", () => {
    const c = cartela({
      paidUses: 3,
      uses: [
        manualUse({ at: "2026-08-03T10:00:00.000Z", note: "Cliente resgatou na loja" }),
        manualUse({ at: "2026-08-03T10:00:00.000Z", note: "Cliente resgatou na loja" }),
      ],
    });
    const groups = manualUseGroups(c);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ count: 2, note: "Cliente resgatou na loja", by: "Camila" });
  });

  it("excludes order-backed uses", () => {
    const c = cartela({ paidUses: 2, uses: [use()] });
    expect(manualUseGroups(c)).toEqual([]);
  });

  it("orders batches newest-first and flags isBrinde only when the batch includes uses[0]", () => {
    const c = cartela({
      paidUses: 3,
      uses: [
        manualUse({ at: "2026-08-01T10:00:00.000Z" }),
        use({ at: "2026-08-02T10:00:00.000Z" }),
        manualUse({ at: "2026-08-03T10:00:00.000Z" }),
      ],
    });
    const groups = manualUseGroups(c);
    expect(groups.map((g) => g.at)).toEqual([
      "2026-08-03T10:00:00.000Z",
      "2026-08-01T10:00:00.000Z",
    ]);
    expect(groups.find((g) => g.at === "2026-08-01T10:00:00.000Z")?.isBrinde).toBe(true);
    expect(groups.find((g) => g.at === "2026-08-03T10:00:00.000Z")?.isBrinde).toBe(false);
  });

  it("returns an empty array for a never-used cartela", () => {
    expect(manualUseGroups(cartela({ paidUses: 2, uses: [] }))).toEqual([]);
  });
});

describe("cartelaMonthlyStats", () => {
  // "Today" is 2026-10-15 in America/Sao_Paulo; the window is Mai–Out.
  const now = new Date("2026-10-15T15:00:00.000Z");

  it("returns the last 6 months oldest first, flagging the current one", () => {
    const months = cartelaMonthlyStats([], now);
    expect(months.map((m) => m.key)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(months.map((m) => m.label)).toEqual(["Mai", "Jun", "Jul", "Ago", "Set", "Out"]);
    expect(months.filter((m) => m.current).map((m) => m.key)).toEqual(["2026-10"]);
    expect(months.every((m) => m.balance === 0 && m.soldAmount === 0 && m.soldCount === 0 && m.uses === 0)).toBe(true);
  });

  it("counts sales in the month of purchase and uses in the month they happened", () => {
    const c = cartela({
      paidUses: 2, // 3 total, 3000 each → amount 6000
      purchasedAt: "2026-07-10T12:00:00.000Z",
      uses: [
        use({ at: "2026-07-12T12:00:00.000Z" }),
        use({ at: "2026-08-02T12:00:00.000Z" }),
        manualUse({ at: "2026-08-20T12:00:00.000Z" }),
      ],
    });
    const byKey = Object.fromEntries(cartelaMonthlyStats([c], now).map((m) => [m.key, m]));
    expect(byKey["2026-07"]).toMatchObject({ soldAmount: 6000, soldCount: 1, uses: 1 });
    expect(byKey["2026-08"]).toMatchObject({ soldAmount: 0, soldCount: 0, uses: 2 });
    expect(byKey["2026-09"]).toMatchObject({ soldAmount: 0, soldCount: 0, uses: 0 });
  });

  it("reconstructs the month-end balance from the uses made so far", () => {
    const c = cartela({
      paidUses: 2,
      purchasedAt: "2026-07-10T12:00:00.000Z",
      uses: [use({ at: "2026-07-12T12:00:00.000Z" }), use({ at: "2026-08-02T12:00:00.000Z" })],
    });
    const byKey = Object.fromEntries(cartelaMonthlyStats([c], now).map((m) => [m.key, m]));
    expect(byKey["2026-06"].balance).toBe(0); // not sold yet
    expect(byKey["2026-07"].balance).toBe(2 * 3000); // 3 uses − 1 used
    expect(byKey["2026-08"].balance).toBe(1 * 3000);
    expect(byKey["2026-10"].balance).toBe(1 * 3000);
  });

  it("buckets by the store time zone, not UTC", () => {
    // 2026-08-01T01:00Z is still 31/07 22:00 in São Paulo.
    const c = cartela({ purchasedAt: "2026-08-01T01:00:00.000Z" });
    const byKey = Object.fromEntries(cartelaMonthlyStats([c], now).map((m) => [m.key, m]));
    expect(byKey["2026-07"].soldCount).toBe(1);
    expect(byKey["2026-08"].soldCount).toBe(0);
  });

  it("current-month balance equals the Σ balanceValue headline", () => {
    const cs = [
      cartela({ id: "a", purchasedAt: "2026-06-05T12:00:00.000Z", uses: [use({ at: "2026-06-06T12:00:00.000Z" })] }),
      cartela({ id: "b", paidUses: 5, unitValue: 2200, purchasedAt: "2026-10-02T12:00:00.000Z", uses: [] }),
      // exhausted → contributes nothing
      cartela({
        id: "c",
        paidUses: 1,
        purchasedAt: "2026-05-02T12:00:00.000Z",
        uses: [use({ at: "2026-05-03T12:00:00.000Z" }), use({ at: "2026-05-04T12:00:00.000Z" })],
      }),
    ];
    const current = cartelaMonthlyStats(cs, now).at(-1)!;
    expect(current.balance).toBe(cs.reduce((sum, c) => sum + balanceValue(c), 0));
  });

  it("ignores purchases after the window's last month but keeps older cartelas' balance", () => {
    const old = cartela({ purchasedAt: "2026-01-10T12:00:00.000Z", uses: [] }); // bought before the window
    const months = cartelaMonthlyStats([old], now);
    expect(months.every((m) => m.balance === 3 * 3000)).toBe(true);
    expect(months.every((m) => m.soldCount === 0)).toBe(true);
  });
});
