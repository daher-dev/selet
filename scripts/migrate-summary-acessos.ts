/**
 * One-off migration: the monthly summary now counts "acessos" (customer × day)
 * instead of distinct customers per month, so every store's summary doc is
 * recomputed from its orders.
 *
 * Defaults to a dry run; pass --apply to write.
 *
 *   npx tsx scripts/migrate-summary-acessos.ts           # dry run
 *   npx tsx scripts/migrate-summary-acessos.ts --apply   # writes
 *
 * Targets the emulator when FIRESTORE_EMULATOR_HOST is set, prod otherwise (ADC).
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { refreshStoreSummary } from "./lib/summary";

const apply = process.argv.includes("--apply");
const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);

async function main() {
  console.log(
    `Alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD"} — modo: ${apply ? "APLICAR" : "dry run"}`,
  );
  for (const store of (await db.collection("stores").get()).docs) {
    console.log(`  ${store.id}: resumo ${apply ? "recalculado" : "seria recalculado"}`);
    if (apply) await refreshStoreSummary(db, store.id);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
