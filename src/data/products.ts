import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import type {
  PriceTier,
  Product,
  ProductAddon,
  ProductSaleType,
  RecipeItem,
} from "@/lib/types";
import { consumeWork, readStockWork, stockPatch } from "./stock";
import {
  lowStockContribution,
  readSummaryTx,
  summaryLowStockDelta,
  writeSummaryTx,
} from "./summary";

function productsCol(storeId: string) {
  return getDb().collection("stores").doc(storeId).collection("products");
}

function stockItemRef(storeId: string, itemId: string) {
  return getDb()
    .collection("stores")
    .doc(storeId)
    .collection("stockItems")
    .doc(itemId);
}

function toProduct(id: string, d: FirebaseFirestore.DocumentData): Product {
  const saleType = d.saleType === "revenda" ? "revenda" : "menu";
  const price = d.price ?? 0;
  return {
    id,
    name: d.name,
    price,
    category: d.category,
    typeTags: d.typeTags ?? [],
    description: d.description ?? undefined,
    active: d.active ?? true,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
    saleType,
    recipe: d.recipe ?? [],
    adicionais: d.adicionais ?? [],
    // Legacy docs without tiers fall back to a single unit tier at the base price.
    tiers: d.tiers?.length ? d.tiers : [{ qty: 1, price }],
    insumoId: d.insumoId ?? undefined,
    stockManaged: d.stockManaged ?? false,
    producedStock: d.producedStock ?? 0,
    prep: d.prep ?? null,
    duration: d.duration ?? undefined,
    archived: d.archived ?? false,
  };
}

export async function listProducts(storeId: string): Promise<Product[]> {
  const snap = await productsCol(storeId).orderBy("name").get();
  return snap.docs.map((doc) => toProduct(doc.id, doc.data()));
}

export async function getProduct(
  storeId: string,
  productId: string,
): Promise<Product | null> {
  const snap = await productsCol(storeId).doc(productId).get();
  return snap.exists ? toProduct(snap.id, snap.data()!) : null;
}

export interface ProductInput {
  name: string;
  price: number;
  category: string;
  typeTags: string[];
  description?: string;
  active: boolean;
  saleType: ProductSaleType;
  recipe: RecipeItem[];
  adicionais: ProductAddon[];
  tiers: PriceTier[];
  insumoId?: string;
  stockManaged: boolean;
  prep?: "sob demanda" | "lote" | null;
  duration?: number;
}

export async function createProduct(
  storeId: string,
  input: ProductInput,
): Promise<string> {
  const ref = await productsCol(storeId).add({
    ...input,
    insumoId: input.insumoId ?? null,
    producedStock: 0,
    // In-app creation → mark manual so the catalog fresh-sync (importCatalog's
    // deleteAbsent) NEVER deletes this doc, even though it has a random id not
    // in the import JSON's slug set.
    source: "manual",
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function updateProduct(
  storeId: string,
  productId: string,
  input: ProductInput,
): Promise<void> {
  await productsCol(storeId)
    .doc(productId)
    // Explicit delete so clearing an optional field in the form persists
    // (a plain update() would leave the old value in place).
    .update({
      ...input,
      description: input.description ?? FieldValue.delete(),
      insumoId: input.insumoId ?? FieldValue.delete(),
      prep: input.prep ?? FieldValue.delete(),
      duration: input.duration ?? FieldValue.delete(),
    });
}

export async function deleteProduct(
  storeId: string,
  productId: string,
): Promise<void> {
  await productsCol(storeId).doc(productId).delete();
}

export interface ProduceResult {
  /** The produced item's name (for activity/UI labels). */
  name: string;
  /** Finished units on hand after the batch. */
  producedStock: number;
  /** Insumos that couldn't be fully consumed (short stock, best-effort). */
  shortages: { itemId: string; missing: number }[];
}

/**
 * Produces `porcoes` finished units of a stockManaged menu item: consumes its
 * BASE recipe insumos ×porcoes (per each insumo's mode — medido deducts, contínuo
 * tallies usos), logs a CONSUMO movement per insumo (refItem = the product), and
 * adds `porcoes` to product.producedStock. Transactional and best-effort — short
 * stock is clamped and reported, never thrown, so a batch is never blocked.
 */
export async function produceBatch(
  storeId: string,
  productId: string,
  porcoes: number,
  by: string,
): Promise<ProduceResult> {
  if (!Number.isInteger(porcoes) || porcoes < 1) {
    throw new Error("Informe uma quantidade de porções válida.");
  }
  const db = getDb();
  const pRef = productsCol(storeId).doc(productId);
  let result: ProduceResult = { name: "", producedStock: 0, shortages: [] };

  await db.runTransaction(async (tx) => {
    // ---- READ phase. ----
    const psnap = await tx.get(pRef);
    if (!psnap.exists) throw new Error("Produto não encontrado.");
    const summary = await readSummaryTx(tx, storeId);
    const pdata = psnap.data()!;
    const recipe = (pdata.recipe ?? []) as RecipeItem[];

    // Aggregate per-insumo need across the recipe (only tracked entries).
    const needs = new Map<string, { amount: number; uses: number }>();
    for (const r of recipe) {
      if (!r.stockItemId) continue;
      const cur = needs.get(r.stockItemId) ?? { amount: 0, uses: 0 };
      cur.amount += (r.qty ?? 0) * porcoes;
      cur.uses += porcoes;
      needs.set(r.stockItemId, cur);
    }

    const stock = new Map<
      string,
      {
        ref: FirebaseFirestore.DocumentReference;
        work: ReturnType<typeof readStockWork>;
        oldLow: boolean;
        archived: boolean;
      }
    >();
    for (const id of needs.keys()) {
      const ref = stockItemRef(storeId, id);
      const snap = await tx.get(ref);
      if (snap.exists) {
        const data = snap.data()!;
        stock.set(id, {
          ref,
          work: readStockWork(data),
          oldLow: data.lowStock ?? false,
          archived: data.archived ?? false,
        });
      }
    }

    // ---- PLAN phase. ----
    const movements: { itemId: string; doc: Record<string, unknown> }[] = [];
    const shortages: { itemId: string; missing: number }[] = [];
    const label = (pdata.name as string) ?? productId;
    for (const [itemId, need] of needs) {
      const entry = stock.get(itemId);
      if (!entry) {
        shortages.push({ itemId, missing: need.amount || need.uses });
        continue;
      }
      const { movements: ms, shortage } = consumeWork(itemId, entry.work, {
        amount: need.amount,
        uses: need.uses,
        reason: "CONSUMO",
        refItem: label,
        by,
      });
      for (const doc of ms) movements.push({ itemId, doc });
      if (shortage > 0) shortages.push({ itemId, missing: shortage });
    }
    const newProduced = (pdata.producedStock ?? 0) + porcoes;

    // ---- WRITE phase. ----
    let lowStockDelta = 0;
    for (const { ref, work, oldLow, archived } of stock.values()) {
      const patch = stockPatch(work);
      tx.update(ref, patch);
      lowStockDelta +=
        lowStockContribution(patch.lowStock as boolean, archived) -
        lowStockContribution(oldLow, archived);
    }
    if (lowStockDelta !== 0) {
      summaryLowStockDelta(summary, lowStockDelta);
      writeSummaryTx(tx, storeId, summary);
    }
    for (const m of movements) {
      tx.set(stockItemRef(storeId, m.itemId).collection("movements").doc(), m.doc);
    }
    tx.update(pRef, { producedStock: newProduced });
    result = { name: label, producedStock: newProduced, shortages };
  });

  return result;
}
