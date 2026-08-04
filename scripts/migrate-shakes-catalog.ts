/**
 * One-off: backfills stores/{storeId}/shakeFlavors from the legacy
 * category:"shakes" Product docs (a mechanical 1:1 copy of name/price/recipe
 * — safe to automate), and prints a deduplicated candidate list of every
 * distinct `adicionais` entry seen across those products, for a human to
 * manually sort into the new Base/Borda/Adicional/Utensílio catalogs via the
 * Shakes admin UI. That sorting is NOT automated: the old flat data carries
 * no bucket (base vs borda vs adicional vs utensílio), no tier/dose-dupla
 * pricing, and no "default include" flag — none of that is mechanically
 * recoverable from ProductAddon.
 *
 * This script does NOT archive the legacy Product docs — that's a manual
 * follow-up once the team confirms the new Shakes catalog + Pedidos "Montar
 * shake" builder fully replace the old counter workflow.
 *
 * Defaults to a dry run (prints what would happen, writes nothing). Pass
 * --apply to actually write the shakeFlavors docs.
 *
 *   npx tsx scripts/migrate-shakes-catalog.ts            # dry run, both stores
 *   npx tsx scripts/migrate-shakes-catalog.ts --apply     # writes
 *   npx tsx scripts/migrate-shakes-catalog.ts vila-velha  # one store only
 *   npx tsx scripts/migrate-shakes-catalog.ts vila-velha --apply
 *
 * Targets the emulator when FIRESTORE_EMULATOR_HOST is set, prod otherwise
 * (via Application Default Credentials) — same connection convention as the
 * other scripts/ entry points. Idempotent: the shakeFlavor doc id is derived
 * from the source product id (`legacy-${productId}`), so re-running overwrites
 * in place instead of duplicating.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { Product, ProductAddon, RecipeItem } from "../src/lib/types";

const STORE_IDS = ["vila-velha", "passos"] as const;

const apply = process.argv.includes("--apply");
const storeArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const targetStores: readonly string[] = storeArg ? [storeArg] : STORE_IDS;

const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);

function formatRecipe(recipe: RecipeItem[]): string {
  if (recipe.length === 0) return "(sem insumos)";
  return recipe.map((r) => `${r.name} ${r.qty ?? "?"}${r.unit}`).join(", ");
}

/** Distinct-by-name candidate rows across every shake product's adicionais. */
function dedupAddons(products: { name: string; adicionais: ProductAddon[] }[]) {
  const byName = new Map<string, { addon: ProductAddon; seenIn: string[] }>();
  for (const p of products) {
    for (const a of p.adicionais) {
      const entry = byName.get(a.name);
      if (entry) entry.seenIn.push(p.name);
      else byName.set(a.name, { addon: a, seenIn: [p.name] });
    }
  }
  return [...byName.values()];
}

async function migrateStore(storeId: string) {
  console.log(`\n=== ${storeId} ===`);
  const col = db.collection(`stores/${storeId}/products`);
  const snap = await col.where("category", "==", "shakes").get();
  if (snap.empty) {
    console.log("Nenhum produto com category:\"shakes\" encontrado.");
    return;
  }

  const shakeProducts = snap.docs
    .map((d) => ({ ...(d.data() as Product), id: d.id }))
    .filter((p) => p.saleType === "menu" && !p.archived);

  console.log(`${shakeProducts.length} sabor(es) de shake encontrado(s):`);
  const flavorsCol = db.collection(`stores/${storeId}/shakeFlavors`);
  for (const p of shakeProducts) {
    const flavorId = `legacy-${p.id}`;
    console.log(`  - ${p.name} · R$ ${(p.price / 100).toFixed(2)}`);
    console.log(`      recipe: ${formatRecipe(p.recipe ?? [])}`);
    if (apply) {
      await flavorsCol.doc(flavorId).set({
        name: p.name,
        price: p.price,
        recipe: p.recipe ?? [],
        archived: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }
  console.log(
    apply
      ? `${shakeProducts.length} sabor(es) escrito(s) em shakeFlavors.`
      : `${shakeProducts.length} sabor(es) seriam escritos em shakeFlavors — rode com --apply para escrever.`,
  );

  const candidates = dedupAddons(shakeProducts);
  console.log(
    `\n${candidates.length} adicional(is) distinto(s) encontrado(s) nos sabores acima — REVISE MANUALMENTE e distribua entre Base/Borda/Adicional/Utensílio na tela de Shakes:`,
  );
  for (const { addon, seenIn } of candidates) {
    console.log(
      `  - "${addon.name}" — R$ ${(addon.price / 100).toFixed(2)}` +
        (addon.stockItemId ? ` · insumo=${addon.stockItemId}` : " · SEM insumo vinculado") +
        ` · visto em ${seenIn.length} sabor(es)`,
    );
  }
}

async function main() {
  console.log(
    `Alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD"} — modo: ${apply ? "APLICAR" : "dry run"}`,
  );
  for (const storeId of targetStores) await migrateStore(storeId);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
