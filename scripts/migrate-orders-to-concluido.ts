/**
 * One-off migration: the café now fulfills orders on the spot, so a freshly
 * created order starts already "concluido" instead of entering the
 * novo/preparando/entrega pipeline (see NEW_ORDER_STATUS in src/data/orders.ts).
 * This script catches existing orders up to that: any order still sitting in
 * novo/preparando/entrega becomes concluido. "cancelado" orders are left
 * untouched — they're deliberately excluded from revenue/top-sellers/customer
 * totals, and flipping them to concluido would make them count as real sales.
 *
 * Bypasses setOrderStatus() (which also reverses/reapplies stock+cartela
 * consumption and customer aggregates on a cancel/uncancel transition) because
 * none of that applies here — items and payment aren't changing, just the
 * pipeline stage. The only aggregate this status transition affects is the
 * summary doc's `openOrders` counter (novo/preparando/entrega are "open",
 * concluido isn't), so — same pattern as scripts/migrate-remove-interno.ts —
 * this script deletes stores/{id}/meta/summary after a write so the app's
 * existing slowPath full-scan fallback (see src/app/s/[storeId]/dashboard-data.ts)
 * recomputes it fresh on next load, rather than hand-computing the delta.
 *
 * Defaults to a dry run (prints affected orders, writes nothing). Pass
 * --apply to actually write.
 *
 *   npx tsx scripts/migrate-orders-to-concluido.ts            # dry run
 *   npx tsx scripts/migrate-orders-to-concluido.ts --apply     # writes
 *
 * Targets the emulator when FIRESTORE_EMULATOR_HOST is set, prod otherwise
 * (via Application Default Credentials) — same connection convention as
 * scripts/migrate-adicionais-saletype.ts.
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
  let total = 0;

  for (const store of stores.docs) {
    const orders = await db
      .collection(`stores/${store.id}/orders`)
      .where("status", "in", ["novo", "preparando", "entrega"])
      .get();

    console.log(`\n=== STORE: ${store.id} ===`);
    console.log(`  status novo/preparando/entrega -> concluido: ${orders.size} pedido(s)`);
    if (orders.empty) continue;

    total += orders.size;
    for (const doc of orders.docs) {
      const d = doc.data();
      console.log(`    - ${doc.id} · ${d.customerName ?? "—"} · ${d.status}`);
    }

    if (apply) {
      const batch = db.batch();
      for (const doc of orders.docs) batch.update(doc.ref, { status: "concluido" });
      await batch.commit();

      console.log(`    deleting stores/${store.id}/meta/summary so it recomputes fresh…`);
      await db.doc(`stores/${store.id}/meta/summary`).delete();
    }
  }

  console.log(
    `\n${total} pedido(s) ${apply ? "migrado(s) para \"concluido\"." : "seriam migrados — rode com --apply para escrever."}`,
  );
}

migrate().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
