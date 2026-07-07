/**
 * Shared catalog importer used by both seed (emulator) and bootstrap-prod.
 *
 * Reads the committed JSON in scripts/data/ and writes the café menu into
 * `stores/{storeId}/products` and the Herbalife supply list into
 * `stores/{storeId}/stockItems`. Docs use deterministic slug ids so the
 * import is idempotent — re-running updates catalog fields in place without
 * duplicating and WITHOUT clobbering a store's live stock counts or the
 * original createdAt.
 *
 * Kept dependency-light (no `@/data/*` — those pull in `server-only`, which
 * throws under tsx) by replicating the document shapes here.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FieldValue, type Firestore } from "firebase-admin/firestore";

// Resolved from the repo root (cwd for tsx scripts, vitest and Playwright),
// avoiding import.meta so this loads under every runner.
const dataDir = join(process.cwd(), "scripts", "data");

interface CatalogItem {
  slug: string;
  name: string;
  description: string;
  category: string;
  typeTags: string[];
}

/** { storeId: { slug: price_centavos } } — a store sells only the slugs it prices. */
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

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(dataDir, file), "utf-8")) as T;
}

/** Drops undefined values so writes work without ignoreUndefinedProperties. */
function prune<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
}

/** Ledger invariant mirrored from src/data/stock.ts. */
function derive(tracked: boolean, pkgSize: number | undefined, sealed: number, open: number) {
  const qty = tracked && pkgSize ? sealed * pkgSize + open : open;
  return { sealed, open, qty };
}

export interface ImportResult {
  products: number;
  stockItems: number;
}

export async function importCatalog(
  db: Firestore,
  storeId: string,
): Promise<ImportResult> {
  const catalog = readJson<CatalogItem[]>("menu-catalog.json");
  const priceBook = readJson<PriceBook>("menu-prices.json");
  const stock = readJson<StockRow[]>("hbl-stock.json");

  // A store sells only the catalog items it has a price for (prices differ per
  // store; some items aren't sold at every store). Existing docs for items not
  // in this store's price book are left untouched, not deleted.
  const prices = priceBook[storeId] ?? {};
  const priced = catalog.filter((p) => typeof prices[p.slug] === "number");

  const productsCol = db.collection("stores").doc(storeId).collection("products");
  for (const p of priced) {
    const ref = productsCol.doc(p.slug);
    const snap = await ref.get();
    const fields = {
      name: p.name,
      price: prices[p.slug],
      category: p.category,
      typeTags: p.typeTags,
      description: p.description || undefined,
      active: true,
    };
    // Only stamp createdAt on first insert so re-imports don't reset it.
    await ref.set(
      prune(snap.exists ? fields : { ...fields, createdAt: FieldValue.serverTimestamp() }),
      { merge: true },
    );
  }

  const stockCol = db.collection("stores").doc(storeId).collection("stockItems");
  for (const s of stock) {
    const ref = stockCol.doc(s.slug);
    const snap = await ref.get();
    const catalogFields = {
      name: s.name,
      category: s.category,
      unit: s.unit,
      tracked: s.tracked,
      continuousUse: s.continuousUse,
      resellable: s.resellable,
      sellPrice: s.sellPrice,
      cost: s.cost,
      reorderAt: s.reorderAt,
      archived: s.archived ?? false,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (snap.exists) {
      // Preserve live counts; only refresh catalog metadata.
      await ref.set(prune(catalogFields), { merge: true });
    } else {
      const state = derive(s.tracked, undefined, 0, 0);
      await ref.set(
        prune({
          ...catalogFields,
          ...state,
          lowStock: state.qty <= s.reorderAt,
        }),
      );
    }
  }

  return { products: priced.length, stockItems: stock.length };
}
