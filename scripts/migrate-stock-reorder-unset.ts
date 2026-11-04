/**
 * One-off migration: the Loja's minimum stock (reorderAt) is optional now;
 * null = the user never configured it (no low-stock alert, no transfer
 * suggestion). Old docs hold either a value the user typed or one we filled in
 * (0 by default, or sealed/3 from the create form) and the two can't be told
 * apart, so every stock item is reset to null and lowStock recomputed
 * (only "esgotado" remains low). Users set the minimum again where it matters.
 *
 * Defaults to a dry run; pass --apply to write.
 *
 *   npx tsx scripts/migrate-stock-reorder-unset.ts           # dry run
 *   npx tsx scripts/migrate-stock-reorder-unset.ts --apply   # writes
 *
 * Targets the emulator when FIRESTORE_EMULATOR_HOST is set, prod otherwise (ADC).
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");
const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);
const BATCH = 400;

async function main() {
  console.log(
    `Alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD"} — modo: ${apply ? "APLICAR" : "dry run"}`,
  );
  let touched = 0;
  for (const store of (await db.collection("stores").get()).docs) {
    const items = (await db.collection(`stores/${store.id}/stockItems`).get()).docs.filter(
      (d) => d.get("reorderAt") != null,
    );
    console.log(`  ${store.id}: ${items.length} item(ns) com mínimo`);
    touched += items.length;
    if (!apply) continue;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = db.batch();
      for (const doc of items.slice(i, i + BATCH)) {
        const usable = doc.get("continuousUse") ? (doc.get("sealed") ?? 0) + (doc.get("openPkg") ? 1 : 0) : (doc.get("qty") ?? 0);
        batch.update(doc.ref, { reorderAt: null, lowStock: usable <= 0 });
      }
      await batch.commit();
    }
  }
  console.log(`\n${touched} item(ns) ${apply ? "atualizados" : "seriam atualizados"}.${apply ? "" : " Rode com --apply para escrever."}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
