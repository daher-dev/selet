import { describe, expect, it } from "vitest";
import type { StockItem } from "@/lib/types";
import { buildStockCard } from "./stock-view";

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

describe("buildStockCard — per-unit items (count unit, medido)", () => {
  it("reads how many are left in the open package and how many were used", () => {
    const v = buildStockCard(item());
    expect(v.hasOpen).toBe(true);
    expect(v.openMain).toBe("Restam 2 de 10 un");
    expect(v.openSub).toBe("8 un já usadas");
    expect(v.leftMain).toBe("4 pacotes");
    expect(v.leftSub).toBe("10 un/pacote");
  });

  it("uses the singular for exactly one", () => {
    expect(buildStockCard(item({ open: 1 }))).toMatchObject({
      openMain: "Resta 1 de 10 un",
      openSub: "9 un já usadas",
    });
    expect(buildStockCard(item({ open: 9 })).openSub).toBe("1 un já usada");
  });

  it("pluralizes unit names that are words (sachê)", () => {
    const v = buildStockCard(item({ unit: "sache", pkgSize: 10, open: 6 }));
    expect(v.openMain).toBe("Restam 6 de 10 sachês");
    expect(v.openSub).toBe("4 sachês já usadas");
    expect(buildStockCard(item({ unit: "sache", open: 9 })).openSub).toBe("1 sachê já usada");
  });

  it("draws one pip per unit (filled = remaining) up to 12, a bar beyond", () => {
    expect(buildStockCard(item()).pips).toEqual({ total: 10, filled: 2 });
    expect(buildStockCard(item()).barPct).toBeNull();

    const big = buildStockCard(item({ pkgSize: 50, open: 20, qty: 220 }));
    expect(big.pips).toBeNull();
    expect(big.barPct).toBe(40);
  });

  it("can be adjusted only while a package is open", () => {
    const v = buildStockCard(item());
    expect(v.perUnit).toBe(true);
    expect(v.canAdjust).toBe(true);

    const closed = buildStockCard(item({ open: 0, qty: 40 }));
    expect(closed.perUnit).toBe(true);
    expect(closed.canAdjust).toBe(false);
    expect(closed.openMutedLabel).toBe("Nenhuma embalagem aberta");
  });
});

describe("buildStockCard — other items", () => {
  it("whole-unit items never fraction nor adjust", () => {
    const v = buildStockCard(item({ pkgSize: 1, pkgLabel: "garrafa", open: 0, sealed: 3, qty: 3 }));
    expect(v.perUnit).toBe(false);
    expect(v.canAdjust).toBe(false);
    expect(v.openMutedLabel).toBe("Não fraciona");
  });

  it("measured (contínuo) items keep the 'Em uso · N usos' panel and aren't per-unit", () => {
    const v = buildStockCard(
      item({ name: "Shake", unit: "g", pkgSize: 550, continuousUse: true, consumptionMode: "continuo", openPkg: true, usos: 14, open: 0, qty: 1650 }),
    );
    expect(v.openMain).toBe("Em uso · 14 usos");
    expect(v.perUnit).toBe(false);
    expect(v.canAdjust).toBe(false);
  });

  it("untracked items have no per-unit behavior", () => {
    const v = buildStockCard(item({ tracked: false, pkgSize: undefined, pkgLabel: undefined, sealed: 0, open: 200, qty: 200 }));
    expect(v.perUnit).toBe(false);
    expect(v.canAdjust).toBe(false);
  });
});
