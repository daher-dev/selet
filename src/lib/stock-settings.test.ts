import { describe, expect, it } from "vitest";
import {
  DEFAULT_FINANCE_CATEGORIES,
  DEFAULT_STOCK_CATEGORIES,
  DEFAULT_STOCK_UNITS,
  financeCategoriesFor,
  groupUnitsForPicker,
  slugify,
  uniqueId,
  unitKind,
  unitLabelFrom,
} from "./stock-settings";
import { STOCK_CATEGORIES, STOCK_UNITS } from "./types";

describe("defaults", () => {
  it("keep the ids items already use, so no stock item needs rewriting", () => {
    expect(DEFAULT_STOCK_CATEGORIES.map((c) => c.id)).toEqual([...STOCK_CATEGORIES]);
    expect(DEFAULT_STOCK_UNITS.map((u) => u.id).sort()).toEqual([...STOCK_UNITS].sort());
  });

  it("splits finance defaults into saídas and entradas, Insumos protected", () => {
    expect(financeCategoriesFor(DEFAULT_FINANCE_CATEGORIES, "out").map((c) => c.name)).toEqual([
      "Custos fixos",
      "Impostos",
      "Insumos",
      "Marketing",
      "Outros",
    ]);
    expect(financeCategoriesFor(DEFAULT_FINANCE_CATEGORIES, "in").map((c) => c.name)).toEqual([
      "Aportes",
      "Outras receitas",
    ]);
    expect(DEFAULT_FINANCE_CATEGORIES.find((c) => c.id === "insumos")?.system).toBe(true);
  });
});

describe("unit helpers", () => {
  it("reads the kind from the store's units and falls back to the legacy id rule", () => {
    expect(unitKind(DEFAULT_STOCK_UNITS, "g")).toBe("measure");
    expect(unitKind(DEFAULT_STOCK_UNITS, "sache")).toBe("count");
    const custom = [...DEFAULT_STOCK_UNITS, { id: "pc", symbol: "pç", name: "peça", plural: "peças", kind: "count" as const }];
    expect(unitKind(custom, "pc")).toBe("count");
    expect(unitKind([], "ml")).toBe("measure");
    expect(unitKind([], "xyz")).toBe("count");
  });

  it("labels with the symbol, pluralizing only when the symbol is the full name", () => {
    expect(unitLabelFrom(DEFAULT_STOCK_UNITS, "sache")).toBe("sachê");
    expect(unitLabelFrom(DEFAULT_STOCK_UNITS, "sache", true)).toBe("sachês");
    expect(unitLabelFrom(DEFAULT_STOCK_UNITS, "un", true)).toBe("un");
    expect(unitLabelFrom(DEFAULT_STOCK_UNITS, "gone")).toBe("gone");
  });

  it("groups count units together and measure units in pairs", () => {
    expect(groupUnitsForPicker(DEFAULT_STOCK_UNITS).map((g) => g.map((u) => u.symbol))).toEqual([
      ["un", "sachê"],
      ["g", "kg"],
      ["ml", "L"],
    ]);
  });
});

describe("ids", () => {
  it("slugifies accents and punctuation", () => {
    expect(slugify("Pó de Proteína (PDM)")).toBe("po-de-proteina-pdm");
  });

  it("appends a counter on collision", () => {
    expect(uniqueId("secos", ["secos", "secos-2"])).toBe("secos-3");
    expect(uniqueId("novo", ["secos"])).toBe("novo");
  });
});
