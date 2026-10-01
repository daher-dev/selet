import "server-only";

import { cache } from "react";
import { getDb } from "@/lib/firebase-admin";
import {
  DEFAULT_FINANCE_SETTINGS,
  DEFAULT_STOCK_SETTINGS,
  INSUMOS_CATEGORY_ID,
  slugify,
  uniqueId,
  type CategoryIconKey,
  type FinanceCategoryDef,
  type FinanceSettings,
  type PaletteKey,
  type StockCategoryDef,
  type StockSettings,
  type StockUnitDef,
  type UnitKind,
} from "@/lib/stock-settings";

/**
 * Per-store settings docs:
 *   stores/{id}/settings/stock   → { categories[], units[] }
 *   stores/{id}/settings/finance → { categories[] }
 * An absent doc reads as the defaults (so a store works before the migration);
 * the first write materializes the defaults plus the change, atomically.
 */

const BATCH_SIZE = 400;

function storeRef(storeId: string) {
  return getDb().collection("stores").doc(storeId);
}
const stockSettingsRef = (storeId: string) => storeRef(storeId).collection("settings").doc("stock");
const financeSettingsRef = (storeId: string) => storeRef(storeId).collection("settings").doc("finance");

function normStock(d: FirebaseFirestore.DocumentData | undefined): StockSettings {
  return {
    categories: d?.categories ?? DEFAULT_STOCK_SETTINGS.categories,
    units: d?.units ?? DEFAULT_STOCK_SETTINGS.units,
  };
}
function normFinance(d: FirebaseFirestore.DocumentData | undefined): FinanceSettings {
  return { categories: d?.categories ?? DEFAULT_FINANCE_SETTINGS.categories };
}

export const getStockSettings = cache(async (storeId: string): Promise<StockSettings> => {
  const snap = await stockSettingsRef(storeId).get();
  return normStock(snap.data());
});

export const getFinanceSettings = cache(async (storeId: string): Promise<FinanceSettings> => {
  const snap = await financeSettingsRef(storeId).get();
  return normFinance(snap.data());
});

async function mutateStock(
  storeId: string,
  fn: (s: StockSettings) => StockSettings,
): Promise<StockSettings> {
  const ref = stockSettingsRef(storeId);
  return getDb().runTransaction(async (tx) => {
    const next = fn(normStock((await tx.get(ref)).data()));
    tx.set(ref, next);
    return next;
  });
}

async function mutateFinance(
  storeId: string,
  fn: (s: FinanceSettings) => FinanceSettings,
): Promise<FinanceSettings> {
  const ref = financeSettingsRef(storeId);
  return getDb().runTransaction(async (tx) => {
    const next = fn(normFinance((await tx.get(ref)).data()));
    tx.set(ref, next);
    return next;
  });
}

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function count(q: FirebaseFirestore.Query): Promise<number> {
  return (await q.count().get()).data().count;
}

/** Re-points every doc matching `field == from` to `to`, in chunked batches. */
async function repoint(
  col: FirebaseFirestore.CollectionReference,
  field: string,
  from: string,
  to: string,
): Promise<void> {
  for (;;) {
    const snap = await col.where(field, "==", from).limit(BATCH_SIZE).get();
    if (snap.empty) return;
    const batch = getDb().batch();
    for (const doc of snap.docs) batch.update(doc.ref, { [field]: to });
    await batch.commit();
  }
}

// ---------------------------------------------------------------- stock categories

export interface StockCategoryInput {
  name: string;
  icon: CategoryIconKey;
  color: PaletteKey;
}

export async function createStockCategory(storeId: string, input: StockCategoryInput): Promise<string> {
  let id = "";
  await mutateStock(storeId, (s) => {
    if (s.categories.some((c) => sameName(c.name, input.name))) {
      throw new Error("Já existe uma categoria com esse nome.");
    }
    id = uniqueId(slugify(input.name), s.categories.map((c) => c.id));
    return { ...s, categories: [...s.categories, { id, ...input, name: input.name.trim() }] };
  });
  return id;
}

export async function updateStockCategory(
  storeId: string,
  id: string,
  input: StockCategoryInput,
): Promise<void> {
  await mutateStock(storeId, (s) => {
    if (!s.categories.some((c) => c.id === id)) throw new Error("Categoria não encontrada.");
    if (s.categories.some((c) => c.id !== id && sameName(c.name, input.name))) {
      throw new Error("Já existe uma categoria com esse nome.");
    }
    return {
      ...s,
      categories: s.categories.map((c): StockCategoryDef =>
        c.id === id ? { id, ...input, name: input.name.trim() } : c,
      ),
    };
  });
}

export async function countStockItemsByCategory(storeId: string, ids: string[]): Promise<Record<string, number>> {
  const col = storeRef(storeId).collection("stockItems");
  const counts = await Promise.all(ids.map((id) => count(col.where("category", "==", id))));
  return Object.fromEntries(ids.map((id, i) => [id, counts[i]]));
}

/**
 * Deletes a category. With items in it, `moveToId` (another existing category)
 * is required and the items are re-pointed first; re-running after a partial
 * failure simply continues (idempotent).
 */
export async function deleteStockCategory(storeId: string, id: string, moveToId?: string): Promise<void> {
  const s = await getStockSettingsFresh(storeId);
  if (!s.categories.some((c) => c.id === id)) throw new Error("Categoria não encontrada.");
  if (s.categories.length <= 1) throw new Error("Mantenha pelo menos uma categoria.");
  const items = storeRef(storeId).collection("stockItems");
  const n = await count(items.where("category", "==", id));
  if (n > 0) {
    if (!moveToId || moveToId === id || !s.categories.some((c) => c.id === moveToId)) {
      throw new Error("Escolha para onde mover os itens.");
    }
    await repoint(items, "category", id, moveToId);
  }
  await mutateStock(storeId, (cur) => ({ ...cur, categories: cur.categories.filter((c) => c.id !== id) }));
}

async function getStockSettingsFresh(storeId: string): Promise<StockSettings> {
  return normStock((await stockSettingsRef(storeId).get()).data());
}

// ---------------------------------------------------------------- stock units

export interface StockUnitInput {
  symbol: string;
  name: string;
  plural: string;
  kind: UnitKind;
}

export async function createStockUnit(storeId: string, input: StockUnitInput): Promise<string> {
  let id = "";
  await mutateStock(storeId, (s) => {
    if (s.units.some((u) => sameName(u.symbol, input.symbol))) {
      throw new Error("Já existe uma unidade com essa sigla.");
    }
    id = uniqueId(slugify(input.symbol) || "un", s.units.map((u) => u.id));
    const unit: StockUnitDef = {
      id,
      symbol: input.symbol.trim(),
      name: input.name.trim(),
      plural: input.plural.trim(),
      kind: input.kind,
    };
    return { ...s, units: [...s.units, unit] };
  });
  return id;
}

/** Id and kind are immutable (kind drives each item's consumption mode). */
export async function updateStockUnit(
  storeId: string,
  id: string,
  input: Omit<StockUnitInput, "kind">,
): Promise<void> {
  await mutateStock(storeId, (s) => {
    if (!s.units.some((u) => u.id === id)) throw new Error("Unidade não encontrada.");
    if (s.units.some((u) => u.id !== id && sameName(u.symbol, input.symbol))) {
      throw new Error("Já existe uma unidade com essa sigla.");
    }
    return {
      ...s,
      units: s.units.map((u): StockUnitDef =>
        u.id === id
          ? { ...u, symbol: input.symbol.trim(), name: input.name.trim(), plural: input.plural.trim() }
          : u,
      ),
    };
  });
}

export async function countStockItemsByUnit(storeId: string, ids: string[]): Promise<Record<string, number>> {
  const col = storeRef(storeId).collection("stockItems");
  const counts = await Promise.all(ids.map((id) => count(col.where("unit", "==", id))));
  return Object.fromEntries(ids.map((id, i) => [id, counts[i]]));
}

export async function deleteStockUnit(storeId: string, id: string): Promise<void> {
  const n = await count(storeRef(storeId).collection("stockItems").where("unit", "==", id));
  if (n > 0) {
    throw new Error(`${n} ${n === 1 ? "item usa" : "itens usam"} esta unidade. Troque a unidade deles antes de excluir.`);
  }
  await mutateStock(storeId, (s) => {
    if (!s.units.some((u) => u.id === id)) throw new Error("Unidade não encontrada.");
    if (s.units.length <= 1) throw new Error("Mantenha pelo menos uma unidade.");
    return { ...s, units: s.units.filter((u) => u.id !== id) };
  });
}

// ---------------------------------------------------------------- finance categories

export interface FinanceCategoryInput {
  name: string;
  direction: "in" | "out";
  color: PaletteKey;
}

export async function createFinanceCategory(storeId: string, input: FinanceCategoryInput): Promise<string> {
  let id = "";
  await mutateFinance(storeId, (s) => {
    if (s.categories.some((c) => c.direction === input.direction && sameName(c.name, input.name))) {
      throw new Error("Já existe uma categoria com esse nome.");
    }
    id = uniqueId(slugify(input.name), s.categories.map((c) => c.id));
    return { ...s, categories: [...s.categories, { id, ...input, name: input.name.trim() }] };
  });
  return id;
}

/** Direction is immutable (it decides which lists the category appears in). */
export async function updateFinanceCategory(
  storeId: string,
  id: string,
  input: Omit<FinanceCategoryInput, "direction">,
): Promise<void> {
  await mutateFinance(storeId, (s) => {
    const cur = s.categories.find((c) => c.id === id);
    if (!cur) throw new Error("Categoria não encontrada.");
    if (s.categories.some((c) => c.id !== id && c.direction === cur.direction && sameName(c.name, input.name))) {
      throw new Error("Já existe uma categoria com esse nome.");
    }
    return {
      ...s,
      categories: s.categories.map((c): FinanceCategoryDef =>
        c.id === id ? { ...c, name: input.name.trim(), color: input.color } : c,
      ),
    };
  });
}

export async function countFinanceTxByCategory(storeId: string, ids: string[]): Promise<Record<string, number>> {
  const col = storeRef(storeId).collection("finance");
  const counts = await Promise.all(ids.map((id) => count(col.where("category", "==", id))));
  return Object.fromEntries(ids.map((id, i) => [id, counts[i]]));
}

export async function deleteFinanceCategory(storeId: string, id: string, moveToId?: string): Promise<void> {
  const s = normFinance((await financeSettingsRef(storeId).get()).data());
  const cur = s.categories.find((c) => c.id === id);
  if (!cur) throw new Error("Categoria não encontrada.");
  if (cur.system || id === INSUMOS_CATEGORY_ID) throw new Error("Esta categoria não pode ser excluída.");
  const col = storeRef(storeId).collection("finance");
  const n = await count(col.where("category", "==", id));
  if (n > 0) {
    const target = s.categories.find((c) => c.id === moveToId);
    if (!target || target.id === id || target.direction !== cur.direction) {
      throw new Error("Escolha para onde mover os lançamentos.");
    }
    await repoint(col, "category", id, target.id);
  }
  await mutateFinance(storeId, (c) => ({ ...c, categories: c.categories.filter((x) => x.id !== id) }));
}
