/**
 * One-off migration: products tagged category:"adicionais" predate the
 * dedicated saleType:"adicional" value and need to be flipped over so they
 * get the new behavior (excluded from the Pedidos picker, live-linkable from
 * other products). `category` is left untouched — it's purely cosmetic.
 *
 * Defaults to a dry run (prints affected products, writes nothing). Pass
 * --apply to actually write.
 *
 *   npx tsx scripts/migrate-adicionais-saletype.ts            # dry run
 *   npx tsx scripts/migrate-adicionais-saletype.ts --apply     # writes
 *
 * Targets the emulator when FIRESTORE_EMULATOR_HOST is set, prod otherwise
 * (via Application Default Credentials) — same connection convention as the
 * other scripts/ entry points.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");

const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);

async function migrate() {
  console.log(
    `Alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD"} — modo: ${apply ? "APLICAR" : "dry run"}`,
  );

  const stores = await db.collection("stores").get();
  let totalAffected = 0;

  for (const store of stores.docs) {
    const products = await db
      .collection(`stores/${store.id}/products`)
      .where("category", "==", "adicionais")
      .get();

    const toMigrate = products.docs.filter((d) => d.data().saleType !== "adicional");
    if (toMigrate.length === 0) continue;

    totalAffected += toMigrate.length;
    console.log(`\n${store.id} (${toMigrate.length} produto(s)):`);
    for (const doc of toMigrate) {
      const d = doc.data();
      console.log(`  - ${doc.id} · ${d.name} (saleType atual: ${d.saleType ?? "menu"})`);
    }

    if (apply) {
      const batch = db.batch();
      for (const doc of toMigrate) batch.update(doc.ref, { saleType: "adicional" });
      await batch.commit();
    }
  }

  console.log(
    `\n${totalAffected} produto(s) ${apply ? "migrado(s)." : "seriam migrados — rode com --apply para escrever."}`,
  );
}

migrate().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
