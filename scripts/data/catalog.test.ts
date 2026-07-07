import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_TYPE_TAGS,
  STOCK_CATEGORIES,
  STOCK_UNITS,
} from "@/lib/types";

function load<T>(file: string): T {
  return JSON.parse(
    readFileSync(new URL(file, import.meta.url), "utf-8"),
  ) as T;
}

interface CatalogItem {
  slug: string;
  name: string;
  description: string;
  category: string;
  typeTags: string[];
}

type PriceBook = Record<string, Record<string, number>>;

interface StockRow {
  slug: string;
  name: string;
  category: string;
  unit: string;
  tracked: boolean;
  continuousUse: boolean;
  resellable: boolean;
  sellPrice: number;
  cost?: number;
  reorderAt: number;
  archived?: boolean;
}

const catalog = load<CatalogItem[]>("./menu-catalog.json");
const prices = load<PriceBook>("./menu-prices.json");
const stock = load<StockRow[]>("./hbl-stock.json");

const isPositiveInt = (n: unknown) =>
  typeof n === "number" && Number.isInteger(n) && n > 0;

describe("menu-catalog.json (base café catalog)", () => {
  it("has entries", () => {
    expect(catalog.length).toBeGreaterThan(0);
  });

  it("has unique slugs", () => {
    const slugs = catalog.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every item is well-formed (no price — that lives per store)", () => {
    for (const p of catalog) {
      expect(p.slug, `slug of ${p.name}`).toMatch(/^[a-z0-9-]+$/);
      expect(p.name.trim().length, `name of ${p.slug}`).toBeGreaterThan(0);
      expect(PRODUCT_CATEGORIES, `category of ${p.slug}`).toContain(p.category);
      expect(Array.isArray(p.typeTags)).toBe(true);
      for (const t of p.typeTags) expect(PRODUCT_TYPE_TAGS).toContain(t);
      expect(typeof p.description).toBe("string");
      expect(p).not.toHaveProperty("price");
    }
  });
});

describe("menu-prices.json (per-store price book)", () => {
  const slugs = new Set(catalog.map((p) => p.slug));

  it("bootstraps both stores", () => {
    expect(Object.keys(prices).sort()).toEqual(["passos", "vila-velha"]);
  });

  it("every priced slug exists in the catalog with a positive-integer price", () => {
    for (const [store, book] of Object.entries(prices)) {
      expect(Object.keys(book).length, `${store} price count`).toBeGreaterThan(0);
      for (const [slug, price] of Object.entries(book)) {
        expect(slugs, `${store} → ${slug}`).toContain(slug);
        expect(isPositiveInt(price), `${store} → ${slug} price`).toBe(true);
      }
    }
  });

  it("Vila Velha prices the full catalog; Passos omits the lanches it doesn't sell", () => {
    expect(Object.keys(prices["vila-velha"]).length).toBe(catalog.length);
    const passosSlugs = new Set(Object.keys(prices["passos"]));
    const lanches = catalog.filter((p) => p.category === "lanches");
    for (const l of lanches) expect(passosSlugs.has(l.slug)).toBe(false);
  });
});

describe("hbl-stock.json (bootstrap estoque, shared)", () => {
  it("has entries", () => {
    expect(stock.length).toBeGreaterThan(0);
  });

  it("has unique slugs", () => {
    const slugs = stock.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every stock item is well-formed", () => {
    for (const s of stock) {
      expect(s.slug, `slug of ${s.name}`).toMatch(/^[a-z0-9-]+$/);
      expect(s.name.trim().length, `name of ${s.slug}`).toBeGreaterThan(0);
      expect(STOCK_CATEGORIES, `category of ${s.slug}`).toContain(s.category);
      expect(STOCK_UNITS, `unit of ${s.slug}`).toContain(s.unit);
      expect(isPositiveInt(s.sellPrice), `sellPrice of ${s.slug}`).toBe(true);
      if (s.cost !== undefined) {
        expect(isPositiveInt(s.cost), `cost of ${s.slug}`).toBe(true);
      }
      expect(typeof s.resellable).toBe("boolean");
      expect(typeof s.tracked).toBe("boolean");
      expect(typeof s.continuousUse).toBe("boolean");
      expect(Number.isInteger(s.reorderAt) && s.reorderAt >= 0).toBe(true);
    }
  });

  it("the beleza (personal-care) line is archived; food items are not", () => {
    const beleza = stock.filter((s) => s.category === "beleza");
    expect(beleza.length).toBeGreaterThan(0);
    for (const s of beleza) expect(s.archived, s.name).toBe(true);
    // Nothing outside the beleza line ships archived.
    for (const s of stock) {
      if (s.category !== "beleza") expect(s.archived ?? false, s.name).toBe(false);
    }
  });
});
