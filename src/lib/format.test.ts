import { describe, expect, it } from "vitest";
import {
  formatBRL,
  formatPudimLineName,
  formatQty,
  formatShakeLineName,
  initials,
  orderCode,
  parseBRL,
} from "./format";

describe("formatBRL", () => {
  it("formats centavos as pt-BR currency", () => {
    // Intl uses a non-breaking space between R$ and the number.
    expect(formatBRL(123456).replace(/ /g, " ")).toBe("R$ 1.234,56");
    expect(formatBRL(0).replace(/ /g, " ")).toBe("R$ 0,00");
    expect(formatBRL(900).replace(/ /g, " ")).toBe("R$ 9,00");
  });
});

describe("parseBRL", () => {
  it("parses pt-BR money strings into centavos", () => {
    expect(parseBRL("1.234,56")).toBe(123456);
    expect(parseBRL("1234,56")).toBe(123456);
    expect(parseBRL("R$ 9,00")).toBe(900);
    expect(parseBRL("15")).toBe(1500);
  });

  it("round-trips with formatBRL", () => {
    expect(parseBRL(formatBRL(87654))).toBe(87654);
  });

  it("throws on garbage", () => {
    expect(() => parseBRL("abc")).toThrow();
  });
});

describe("orderCode", () => {
  it("uppercases the first 4 chars of the doc id", () => {
    expect(orderCode("a3f8xkzz")).toBe("A3F8");
  });
});

describe("initials", () => {
  it("takes first and last name initials", () => {
    expect(initials("Maria Silva")).toBe("MS");
    expect(initials("Ana Paula de Souza")).toBe("AS");
    expect(initials("João")).toBe("J");
  });
});

describe("formatQty", () => {
  it("formats with pt-BR decimals", () => {
    expect(formatQty(1500, "g")).toBe("1.500 g");
    expect(formatQty(1.5, "kg")).toBe("1,5 kg");
  });
});

describe("formatShakeLineName", () => {
  it("formats a single-flavor line", () => {
    expect(
      formatShakeLineName({
        flavors: ["Frutas Amarelas"],
        base: "NutreV",
        rims: [{ name: "Nutella", qty: 1 }],
        mixins: [],
      }),
    ).toBe("Shake · Frutas Amarelas / NutreV / Borda Nutella");
  });

  it("joins multiple flavors with ' + '", () => {
    expect(
      formatShakeLineName({
        flavors: ["Frutas Amarelas", "Frutas Vermelhas"],
        base: "NutreV",
        rims: [{ name: "Nutella", qty: 1 }],
        mixins: [],
      }),
    ).toBe("Shake · Frutas Amarelas + Frutas Vermelhas / NutreV / Borda Nutella");
  });

  it("handles no base/rims/mixins", () => {
    expect(
      formatShakeLineName({ flavors: ["Morango"], rims: [], mixins: [] }),
    ).toBe("Shake · Morango");
  });

  it("includes tiered rims and mixins with quantities", () => {
    expect(
      formatShakeLineName({
        flavors: ["Frutas Amarelas"],
        rims: [],
        mixins: [{ name: "Fibra Ativa", qty: 2 }],
      }),
    ).toBe("Shake · Frutas Amarelas / +2× Fibra Ativa");
  });
});

describe("formatPudimLineName", () => {
  it("formats a single-flavor line with a base", () => {
    expect(
      formatPudimLineName({ flavor: "Frutas Amarelas", base: "NutreV", mixins: [] }),
    ).toBe("Pudim · Frutas Amarelas / NutreV");
  });

  it("handles no base/mixins", () => {
    expect(formatPudimLineName({ flavor: "Chocolate", mixins: [] })).toBe("Pudim · Chocolate");
  });

  it("includes tiered mixins with quantities", () => {
    expect(
      formatPudimLineName({
        flavor: "Frutas Amarelas",
        mixins: [{ name: "Fibra Ativa", qty: 2 }],
      }),
    ).toBe("Pudim · Frutas Amarelas / +2× Fibra Ativa");
  });

  it("omits the ×qty prefix for a single unit", () => {
    expect(
      formatPudimLineName({
        flavor: "Cookies",
        mixins: [{ name: "Whey extra", qty: 1 }],
      }),
    ).toBe("Pudim · Cookies / +Whey extra");
  });
});
