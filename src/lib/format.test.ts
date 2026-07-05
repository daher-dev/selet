import { describe, expect, it } from "vitest";
import {
  formatBRL,
  formatQty,
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
