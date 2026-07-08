/**
 * DATA-INTEGRITY GUARD for the production bootstrap pipeline.
 *
 * Pure JSON + recipes — no emulator. This is the fail-loud net that catches a
 * broken edit to scripts/data/*.json or scripts/lib/recipes.ts BEFORE it ships
 * into a real store. It cross-checks the three committed data files against the
 * derived recipe/adicionais book so every link resolves:
 *
 *   1. every PRICED menu item (per store) resolves to a recipe whose tier price
 *      matches the store price book;
 *   2. every recipe/adicional `stockItemId` and every revenda `insumoId` points
 *      at a real hbl-stock.json slug (no dangling stock links);
 *   3. every resellable stock item carries a positive-centavos sellPrice;
 *   4. every tracked stock item carries pkgSize + pkgLabel + cost;
 *   5. consumptionMode/continuousUse are consistent with the UNIT RULE
 *      (weight/volume ⇒ contínuo; countable ⇒ medido) across hbl-stock.json —
 *      the unit is the single source of truth (src/lib/types).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { consumptionModeForUnit, isWeightVolumeUnit } from "@/lib/types";
import { recipeFor } from "../lib/recipes";

function load<T>(file: string): T {
  return JSON.parse(readFileSync(new URL(file, import.meta.url), "utf-8")) as T;
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
  unit: string;
  tracked: boolean;
  pkgLabel?: string;
  pkgSize?: number;
  continuousUse: boolean;
  consumptionMode?: "medido" | "continuo";
  resellable: boolean;
  sellPrice?: number;
  cost?: number;
}

const catalog = load<CatalogItem[]>("./menu-catalog.json");
const priceBook = load<PriceBook>("./menu-prices.json");
const stock = load<StockRow[]>("./hbl-stock.json");

const catalogBySlug = new Map(catalog.map((p) => [p.slug, p]));
const stockSlugs = new Set(stock.map((s) => s.slug));
const isPositiveInt = (n: unknown) =>
  typeof n === "number" && Number.isInteger(n) && n > 0;

describe("catalog integrity: every priced item resolves to a recipe", () => {
  for (const [storeId, book] of Object.entries(priceBook)) {
    describe(storeId, () => {
      for (const [slug, price] of Object.entries(book)) {
        it(`${slug} resolves`, () => {
          const item = catalogBySlug.get(slug);
          expect(item, `${slug} is missing from the catalog`).toBeDefined();
          const rec = recipeFor(item!, book);

          // Resolves to a well-formed recipe priced at the store price.
          expect(["menu", "revenda"]).toContain(rec.saleType);
          expect(rec.tiers.length, `${slug} tiers`).toBeGreaterThan(0);
          expect(rec.tiers[0].price, `${slug} tier price`).toBe(price);

          // revenda items sell a resale insumo directly; menu items don't.
          if (rec.saleType === "revenda") {
            expect(rec.insumoId, `${slug} revenda insumoId`).toBeDefined();
            expect(stockSlugs, `${slug} revenda insumoId`).toContain(
              rec.insumoId,
            );
            expect(rec.recipe, `${slug} revenda recipe`).toHaveLength(0);
          } else {
            expect(rec.insumoId, `${slug} menu insumoId`).toBeUndefined();
          }

          // Every recipe ingredient with a stock link resolves.
          for (const ing of rec.recipe) {
            if (ing.stockItemId !== undefined) {
              expect(stockSlugs, `${slug} → recipe ${ing.name}`).toContain(
                ing.stockItemId,
              );
            }
          }

          // Every adicional resolves: positive price, and any stock link valid.
          for (const add of rec.adicionais) {
            expect(isPositiveInt(add.price), `${slug} adic ${add.name} price`).toBe(
              true,
            );
            if (add.stockItemId !== undefined) {
              expect(stockSlugs, `${slug} → adic ${add.name}`).toContain(
                add.stockItemId,
              );
            }
          }
        });
      }
    });
  }

  it("shakes carry the full adicionais list, priced from the store book", () => {
    // The bootstrap must attach inferred adicionais to shakes (owner directive
    // B). Guard that a representative shake gets them, priced per store.
    for (const storeId of Object.keys(priceBook)) {
      const book = priceBook[storeId];
      const shake = catalogBySlug.get("shake-frutas-vermelhas")!;
      const rec = recipeFor(shake, book);
      expect(rec.adicionais.length, `${storeId} shake adicionais`).toBeGreaterThan(
        0,
      );
      for (const add of rec.adicionais) {
        // Price must be exactly what the store book lists for some add-* slug.
        expect(Object.values(book)).toContain(add.price);
      }
    }
  });
});

describe("stock integrity (hbl-stock.json)", () => {
  it("every resellable item carries a positive-centavos sellPrice", () => {
    for (const s of stock) {
      if (s.resellable) {
        expect(isPositiveInt(s.sellPrice), `${s.slug} sellPrice`).toBe(true);
      }
    }
  });

  it("every tracked item carries pkgSize + pkgLabel + cost", () => {
    for (const s of stock) {
      if (s.tracked) {
        expect(isPositiveInt(s.pkgSize), `${s.slug} pkgSize`).toBe(true);
        expect(s.pkgLabel?.trim().length, `${s.slug} pkgLabel`).toBeGreaterThan(0);
        expect(isPositiveInt(s.cost), `${s.slug} cost`).toBe(true);
      }
    }
  });

  it("consumptionMode + continuousUse are derived from the UNIT RULE", () => {
    for (const s of stock) {
      const expectedMode = consumptionModeForUnit(s.unit);
      const expectedContinuous = isWeightVolumeUnit(s.unit);
      // The unit is the single source of truth: weight/volume ⇒ contínuo,
      // countable ⇒ medido. Any JSON value must agree (the importer overrides
      // it, but stale JSON here would be a lie the guard should reject).
      expect(s.consumptionMode, `${s.slug} consumptionMode for unit ${s.unit}`).toBe(
        expectedMode,
      );
      expect(s.continuousUse, `${s.slug} continuousUse for unit ${s.unit}`).toBe(
        expectedContinuous,
      );
    }
  });
});

describe("recipe book stock links (recipes.ts ↔ hbl-stock.json)", () => {
  it("every insumo referenced by any recipe/adicional resolves to a real slug", () => {
    // Walk the whole catalog through the recipe book (using Vila Velha's book,
    // the superset) and collect every stock link, asserting each resolves.
    const book = priceBook["vila-velha"];
    const referenced = new Set<string>();
    for (const item of catalog) {
      const rec = recipeFor(item, book);
      if (rec.insumoId) referenced.add(rec.insumoId);
      for (const ing of rec.recipe) {
        if (ing.stockItemId) referenced.add(ing.stockItemId);
      }
      for (const add of rec.adicionais) {
        if (add.stockItemId) referenced.add(add.stockItemId);
      }
    }
    expect(referenced.size).toBeGreaterThan(0);
    for (const slug of referenced) {
      expect(stockSlugs, `recipe references unknown stock slug ${slug}`).toContain(
        slug,
      );
    }
  });
});
