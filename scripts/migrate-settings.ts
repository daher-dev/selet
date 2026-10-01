/**
 * One-off migration for the Configurações release. Per store:
 *  1. stores/{id}/settings/stock — materializes the default stock categories and
 *     units (ids = the keys items already use), plus any category/unit id that
 *     items reference but the defaults don't know, so nothing is orphaned.
 *  2. stores/{id}/settings/finance — materializes the default lançamento
 *     categories (Saídas: Custos fixos, Impostos, Insumos, Marketing, Outros ·
 *     Entradas: Aportes, Outras receitas).
 *  3. Remaps legacy lançamento categories (manual and stock-sourced only; order
 *     mirrors keep "vendas"):
 *       compras → insumos · salarios, aluguel → custos-fixos · marketing, outros
 *       stay · any other saída → outros · any entrada → outras-receitas
 *
 * The app already reads defaults when the docs are absent and treats the legacy
 * "compras" key as Insumos, so running this is cleanup, not a prerequisite.
 * Idempotent. Defaults to a dry run (prints what would change); pass --apply.
 *
 *   npx tsx scripts/migrate-settings.ts            # dry run
 *   npx tsx scripts/migrate-settings.ts --apply    # writes
 *
 * Targets the emulator when FIRESTORE_EMULATOR_HOST is set, prod otherwise
 * (Application Default Credentials) — same convention as the other migrations.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  DEFAULT_FINANCE_CATEGORIES,
  DEFAULT_STOCK_CATEGORIES,
  DEFAULT_STOCK_UNITS,
  LEGACY_FINANCE_CATEGORY_MAP,
  SALES_CATEGORY_ID,
  type StockCategoryDef,
  type StockUnitDef,
} from "../src/lib/stock-settings";

const apply = process.argv.includes("--apply");
const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);

const FINANCE_IDS = new Set(DEFAULT_FINANCE_CATEGORIES.map((c) => c.id));
const BATCH = 400;

function targetCategory(direction: "in" | "out", current: string): string {
  if (FINANCE_IDS.has(current)) {
    const def = DEFAULT_FINANCE_CATEGORIES.find((c) => c.id === current)!;
    if (def.direction === direction) return current;
  }
  if (direction === "in") return "outras-receitas";
  return LEGACY_FINANCE_CATEGORY_MAP[current] ?? "outros";
}

async function migrateStockSettings(storeId: string) {
  const ref = db.doc(`stores/${storeId}/settings/stock`);
  const snap = await ref.get();
  if (snap.exists) {
    console.log("  settings/stock: já existe — mantido");
    return;
  }
  const categories: StockCategoryDef[] = [...DEFAULT_STOCK_CATEGORIES];
  const units: StockUnitDef[] = [...DEFAULT_STOCK_UNITS];
  const items = await db.collection(`stores/${storeId}/stockItems`).select("category", "unit").get();
  for (const doc of items.docs) {
    const { category, unit } = doc.data();
    if (category && !categories.some((c) => c.id === category)) {
      console.log(`    categoria desconhecida em uso: "${category}" → adicionada (cinza, pacote)`);
      categories.push({ id: category, name: category, icon: "package", color: "cinza" });
    }
    if (unit && !units.some((u) => u.id === unit)) {
      console.log(`    unidade desconhecida em uso: "${unit}" → adicionada (contagem)`);
      units.push({ id: unit, symbol: unit, name: unit, plural: unit, kind: "count" });
    }
  }
  console.log(`  settings/stock: ${categories.length} categoria(s), ${units.length} unidade(s)`);
  if (apply) await ref.set({ categories, units });
}

async function migrateFinance(storeId: string) {
  const ref = db.doc(`stores/${storeId}/settings/finance`);
  const snap = await ref.get();
  console.log(`  settings/finance: ${snap.exists ? "já existe — mantido" : `${DEFAULT_FINANCE_CATEGORIES.length} categorias padrão`}`);
  if (!snap.exists && apply) await ref.set({ categories: DEFAULT_FINANCE_CATEGORIES });

  const txs = await db.collection(`stores/${storeId}/finance`).select("category", "direction", "source").get();
  const moves = new Map<string, { ref: FirebaseFirestore.DocumentReference; to: string }>();
  const tally = new Map<string, number>();
  for (const doc of txs.docs) {
    const { category, direction, source } = doc.data();
    if (source === "order" || category === SALES_CATEGORY_ID) continue;
    const to = targetCategory(direction, category);
    if (to === category) continue;
    moves.set(doc.id, { ref: doc.ref, to });
    const key = `${direction === "in" ? "entrada" : "saída"} ${category ?? "(sem categoria)"} → ${to}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  for (const [k, n] of tally) console.log(`    ${n}× ${k}`);
  console.log(`  lançamentos a remapear: ${moves.size}`);
  if (apply) {
    const all = [...moves.values()];
    for (let i = 0; i < all.length; i += BATCH) {
      const batch = db.batch();
      for (const { ref: r, to } of all.slice(i, i + BATCH)) batch.update(r, { category: to });
      await batch.commit();
    }
  }
  return moves.size;
}

async function main() {
  console.log(
    `Alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD"} — modo: ${apply ? "APLICAR" : "dry run"}`,
  );
  let total = 0;
  for (const store of (await db.collection("stores").get()).docs) {
    console.log(`\n=== STORE: ${store.id} ===`);
    await migrateStockSettings(store.id);
    total += await migrateFinance(store.id);
  }
  console.log(`\n${total} lançamento(s) ${apply ? "remapeado(s)." : "seriam remapeados. Rode com --apply para escrever."}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
