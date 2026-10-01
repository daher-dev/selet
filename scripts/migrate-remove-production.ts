/**
 * One-off migration: batch production ("Produzir", "Feito em lote", per-product
 * finished-goods stock) was removed. Menu items are always prepared from their
 * recipe now, so on every product this unsets the dead fields:
 * stockManaged, producedStock, prep, duration.
 *
 * The app already ignores these fields (sales consume recipe insumos), so this
 * is cleanup, not a prerequisite. The report lists every product still holding
 * finished units (producedStock > 0): those units had their insumos consumed
 * when produced, and will be consumed AGAIN if sold from the recipe — review
 * them (e.g. adjust the insumos' stock) before/after applying.
 *
 * Defaults to a dry run; pass --apply to write.
 *
 *   npx tsx scripts/migrate-remove-production.ts           # dry run
 *   npx tsx scripts/migrate-remove-production.ts --apply   # writes
 *
 * Targets the emulator when FIRESTORE_EMULATOR_HOST is set, prod otherwise (ADC).
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");
const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);
const FIELDS = ["stockManaged", "producedStock", "prep", "duration"] as const;
const BATCH = 400;

async function main() {
  console.log(
    `Alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD"} — modo: ${apply ? "APLICAR" : "dry run"}`,
  );
  let touched = 0;
  let leftovers = 0;
  for (const store of (await db.collection("stores").get()).docs) {
    console.log(`\n=== STORE: ${store.id} ===`);
    const products = await db.collection(`stores/${store.id}/products`).get();
    const targets = products.docs.filter((d) => FIELDS.some((f) => d.get(f) !== undefined));
    for (const doc of targets) {
      const produced = doc.get("producedStock") ?? 0;
      if (produced > 0) {
        leftovers += 1;
        console.log(`  ! ${doc.get("name")} (${doc.id}): ${produced} porção(ões) em producedStock`);
      }
    }
    console.log(`  produtos com campos de produção: ${targets.length}`);
    touched += targets.length;
    if (apply) {
      for (let i = 0; i < targets.length; i += BATCH) {
        const batch = db.batch();
        for (const doc of targets.slice(i, i + BATCH)) {
          batch.update(doc.ref, Object.fromEntries(FIELDS.map((f) => [f, FieldValue.delete()])));
        }
        await batch.commit();
      }
    }
  }
  console.log(
    `\n${touched} produto(s) ${apply ? "limpos" : "seriam limpos"} — ${leftovers} com producedStock > 0 (revisar).${apply ? "" : " Rode com --apply para escrever."}`,
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
