import { describe, expect, it } from "vitest";
import type { StockItem } from "@/lib/types";
import { buildStockCard, minimumLabel, needsAttention, stockStatus, suggestTransferQty } from "./stock-view";

function item(over: Partial<StockItem> = {}): StockItem {
  return {
    id: "i1",
    name: "Copo Descartável 300 ml",
    category: "descartaveis",
    unit: "un",
    tracked: true,
    pkgLabel: "pacote",
    pkgSize: 10,
    sealed: 4,
    depSealed: 12,
    open: 2,
    qty: 42,
    continuousUse: false,
    consumptionMode: "medido",
    openPkg: false,
    usos: 0,
    resellable: false,
    reorderAt: 2,
    lowStock: false,
    archived: false,
    updatedAt: "2026-01-01T12:00:00.000Z",
    ...over,
  };
}

const shake = (over: Partial<StockItem> = {}) =>
  item({
    name: "Shake Herbalife Baunilha",
    unit: "g",
    pkgLabel: "pote",
    pkgSize: 550,
    sealed: 3,
    depSealed: 6,
    open: 0,
    qty: 1650,
    continuousUse: true,
    consumptionMode: "continuo",
    openPkg: true,
    usos: 14,
    reorderAt: 2,
    ...over,
  });

describe("buildStockCard — Loja row", () => {
  it("counts sealed packages plus the loose units of the open one", () => {
    const v = buildStockCard(item());
    expect(v.lojaMain).toBe("4 pacotes + 2 un");
    expect(v.canAdjust).toBe(true);
  });

  it("reads 'em uso' for a contínuo pote in use", () => {
    expect(buildStockCard(shake()).lojaMain).toBe("3 potes + 1 em uso");
    expect(buildStockCard(shake({ sealed: 0, openPkg: true })).lojaMain).toBe("1 em uso");
    expect(buildStockCard(shake()).canAdjust).toBe(false);
  });

  it("says 0 of the package when nothing is left", () => {
    expect(buildStockCard(item({ sealed: 0, open: 0, qty: 0 })).lojaMain).toBe("0 pacotes");
  });

  it("untracked items just show the quantity and have no Depósito row", () => {
    const v = buildStockCard(item({ tracked: false, pkgSize: undefined, pkgLabel: undefined, sealed: 0, open: 200, qty: 200 }));
    expect(v.lojaMain).toBe("200 un");
    expect(v.tracked).toBe(false);
    expect(v.segs).toEqual([]);
  });

  it("colors the number by status", () => {
    expect(buildStockCard(item({ sealed: 0, open: 0, qty: 0 })).lojaColor).toBe("text-destructive");
    expect(buildStockCard(item({ sealed: 1, open: 0, qty: 10 })).lojaColor).toBe("text-amber");
    expect(buildStockCard(item()).lojaColor).toBe("text-ink");
  });
});

describe("buildStockCard — package bar", () => {
  it("draws sealed packages, then the open one: partial when counted, hatched when in use", () => {
    expect(buildStockCard(item()).segs).toEqual([
      { kind: "sealed" },
      { kind: "sealed" },
      { kind: "sealed" },
      { kind: "sealed" },
      { kind: "open", pct: 20 },
    ]);
    expect(buildStockCard(shake()).segs.at(-1)).toEqual({ kind: "uso" });
  });

  it("marks the slots still missing up to the minimum, first so the shortage reads from the left", () => {
    expect(buildStockCard(shake({ sealed: 0, openPkg: false, reorderAt: 3 })).segs).toEqual([
      { kind: "missing" },
      { kind: "missing" },
      { kind: "missing" },
    ]);
    expect(buildStockCard(shake({ sealed: 1, openPkg: true, reorderAt: 3 })).segs).toEqual([
      { kind: "missing" },
      { kind: "sealed" },
      { kind: "uso" },
    ]);
  });

  it("never draws more than 8 slots", () => {
    expect(buildStockCard(item({ sealed: 20, open: 0, qty: 200, reorderAt: 20 })).segs).toHaveLength(8);
  });
});

describe("buildStockCard — Depósito row", () => {
  it("shows the packages and, for countable multi-unit packages, how many units they hold", () => {
    expect(buildStockCard(item())).toMatchObject({ depMain: "12 pacotes", depHint: "120 un", depEmpty: false });
    expect(buildStockCard(item({ depSealed: 1 }))).toMatchObject({ depMain: "1 pacote", depHint: "10 un" });
  });

  it("has no unit hint for contínuo items and reads 'vazio' when empty", () => {
    expect(buildStockCard(shake())).toMatchObject({ depMain: "6 potes", depHint: "" });
    expect(buildStockCard(item({ depSealed: 0 }))).toMatchObject({ depMain: "vazio", depEmpty: true });
  });
});

describe("status", () => {
  it("is esgotado at zero, repor at or under the minimum, ok above", () => {
    expect(stockStatus(item({ sealed: 0, open: 0, qty: 0 }))).toBe("esgotado");
    expect(stockStatus(item({ sealed: 1, open: 0, qty: 10, reorderAt: 2 }))).toBe("repor");
    expect(stockStatus(item())).toBe("ok");
    expect(stockStatus(item({ archived: true }))).toBe("arquivado");
  });

  it("'precisa de atenção' means repor or esgotado", () => {
    expect(needsAttention("repor")).toBe(true);
    expect(needsAttention("esgotado")).toBe(true);
    expect(needsAttention("ok")).toBe(false);
    expect(needsAttention("arquivado")).toBe(false);
  });
});

describe("suggestTransferQty", () => {
  it("moves enough packages to reach the minimum (contínuo counts whole packages)", () => {
    // 1 pote + 1 em uso = 2 against a minimum of 3 → 1 missing, same as the card
    expect(suggestTransferQty(shake({ sealed: 1, reorderAt: 3, depSealed: 6 }))).toBe(1);
    expect(suggestTransferQty(shake({ sealed: 0, reorderAt: 3, depSealed: 6 }))).toBe(2);
    expect(suggestTransferQty(shake({ sealed: 3, reorderAt: 2, depSealed: 6 }))).toBe(1);
  });

  it("counts base units for the rest: a caixa of 12 un against a minimum of 1 caixa", () => {
    const caixa = item({ pkgLabel: "caixa", pkgSize: 12, sealed: 0, open: 0, qty: 0, reorderAt: 2, depSealed: 3 });
    expect(suggestTransferQty(caixa)).toBe(2); // 24 un minimum, 0 on hand → 2 caixas
    expect(suggestTransferQty({ ...caixa, depSealed: 1 })).toBe(1); // capped at what the depósito holds
  });

  it("is at least 1 even when the item is not low", () => {
    expect(suggestTransferQty(item())).toBe(1);
  });
});

describe("minimumLabel", () => {
  const unit = (u: string, plural: boolean) => (u === "un" ? "un" : plural ? "gramas" : "g");
  it("reads in packages for contínuo, base units for the rest", () => {
    expect(minimumLabel(shake({ reorderAt: 2 }), unit)).toBe("2 potes");
    expect(minimumLabel(item({ reorderAt: 2 }), unit)).toBe("20 un");
  });
});
