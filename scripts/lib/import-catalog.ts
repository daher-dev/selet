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
import { consumptionModeForUnit, isWeightVolumeUnit } from "../../src/lib/types";
import { recipeFor } from "./recipes";

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
  pkgLabel?: string;
  pkgSize?: number;
  /** Opening ledger — seeded only on first insert; live counts win on re-import. */
  sealed?: number;
  open?: number;
  usos?: number;
  /** contínuo: whether a package is currently open (usos accrue on it). */
  openPkg?: boolean;
  continuousUse: boolean;
  consumptionMode?: "medido" | "continuo";
  resellable: boolean;
  sellPrice?: number;
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

/** Ledger invariant mirrored from src/data/stock.ts: qty = sealed*pkgSize + open. */
function derive(tracked: boolean, pkgSize: number | undefined, sealed: number, open: number) {
  const qty = tracked && pkgSize ? sealed * pkgSize + open : open;
  return { sealed, open, qty };
}

export interface ImportResult {
  products: number;
  stockItems: number;
  archived: number;
}

export interface ImportOptions {
  /**
   * Seed the opening ledger from hbl-stock.json on FIRST insert (sealed/open/
   * usos/openPkg). The emulator seed passes true so the local/demo store keeps
   * realistic counts; the PROD bootstrap omits it (false) so a real store starts
   * at ZERO and does its day-1 count via entrada movements — no demo data.
   * Live counts are always preserved on re-import regardless.
   */
  seedOpeningLedger?: boolean;
}

export async function importCatalog(
  db: Firestore,
  storeId: string,
  { seedOpeningLedger = false }: ImportOptions = {},
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
    const rec = recipeFor(p, prices);
    // Default prep duration (minutes): sob demanda ~1, lote ~4, revenda → none.
    const duration =
      rec.prep === "lote" ? 4 : rec.prep === "sob demanda" ? 1 : undefined;
    // Catalog metadata is refreshed on every import. `active`/`archived` are
    // NOT here: they carry a store's manual sell/hide choice and are set only on
    // first insert (below) so a re-import never force-reactivates or un-hides.
    const fields = {
      name: p.name,
      price: prices[p.slug],
      category: p.category,
      typeTags: p.typeTags,
      description: p.description || undefined,
      saleType: rec.saleType,
      recipe: rec.recipe,
      adicionais: rec.adicionais,
      tiers: rec.tiers,
      insumoId: rec.insumoId,
      stockManaged: rec.stockManaged,
      prep: rec.prep,
      duration,
    };
    await ref.set(
      prune(
        snap.exists
          ? fields
          : {
              ...fields,
              active: true,
              archived: false,
              createdAt: FieldValue.serverTimestamp(),
            },
      ),
      { merge: true },
    );
  }

  const stockCol = db.collection("stores").doc(storeId).collection("stockItems");
  for (const s of stock) {
    const ref = stockCol.doc(s.slug);
    const snap = await ref.get();
    // UNIT RULE (single source of truth in src/lib/types): weight/volume →
    // contínuo (manual, usos + mark-empty); countable → medido. Any conflicting
    // value in the JSON is ignored — the unit decides.
    const continuousUse = isWeightVolumeUnit(s.unit);
    const consumptionMode = consumptionModeForUnit(s.unit);
    // Catalog metadata refreshed on every import. `archived` is NOT here — it is
    // a store's manual hide choice, set only on first insert so a re-import never
    // un-hides an item the store archived (the SYNC pass below owns archiving).
    const catalogFields = {
      name: s.name,
      category: s.category,
      unit: s.unit,
      tracked: s.tracked,
      pkgLabel: s.pkgLabel,
      pkgSize: s.pkgSize,
      continuousUse,
      consumptionMode,
      resellable: s.resellable,
      sellPrice: s.sellPrice,
      cost: s.cost,
      reorderAt: s.reorderAt,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (snap.exists) {
      // Preserve live counts (sealed/open/qty/usos) and archived; only refresh
      // catalog metadata.
      await ref.set(prune(catalogFields), { merge: true });
    } else {
      // First insert. Opening ledger: seedOpeningLedger seeds the realistic
      // hbl-stock.json counts (emulator/demo); otherwise a real store starts at
      // ZERO and counts in via entrada movements (prod bootstrap — no demo data).
      const sealed = seedOpeningLedger ? (s.sealed ?? 0) : 0;
      const open = seedOpeningLedger ? (s.open ?? 0) : 0;
      const openPkg = seedOpeningLedger ? (s.openPkg ?? false) : false;
      const usos = seedOpeningLedger ? (s.usos ?? 0) : 0;
      const state = derive(s.tracked, s.pkgSize, sealed, open);
      const usable = continuousUse ? sealed + (openPkg ? 1 : 0) : state.qty;
      const thr =
        s.tracked && !continuousUse
          ? s.reorderAt * (s.pkgSize || 1)
          : s.reorderAt;
      await ref.set(
        prune({
          ...catalogFields,
          archived: s.archived ?? false,
          ...state,
          openPkg,
          usos,
          lowStock: usable <= thr,
        }),
      );
    }
  }

  // SYNC (idempotent lifecycle): a doc present in the store but ABSENT from the
  // catalog JSON on re-import is ARCHIVED — never hard-deleted, never left stale.
  const keepProducts = new Set(priced.map((p) => p.slug));
  const keepStock = new Set(stock.map((s) => s.slug));
  const archived =
    (await archiveAbsent(productsCol, keepProducts)) +
    (await archiveAbsent(stockCol, keepStock));

  return { products: priced.length, stockItems: stock.length, archived };
}

/**
 * Marks every doc in `col` whose id is not in `keep` as archived. Idempotent:
 * already-archived docs are skipped so re-imports don't churn updatedAt.
 */
async function archiveAbsent(
  col: FirebaseFirestore.CollectionReference,
  keep: Set<string>,
): Promise<number> {
  const snap = await col.get();
  let n = 0;
  for (const doc of snap.docs) {
    if (keep.has(doc.id) || doc.get("archived") === true) continue;
    await doc.ref.set(
      { archived: true, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    n += 1;
  }
  return n;
}
