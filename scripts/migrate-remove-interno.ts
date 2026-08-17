/**
 * One-off migration: the "Interno" concept was removed from two places —
 *   1. ORDER_CHANNELS (src/lib/types.ts) — the "Interno" sale channel card
 *      is gone; existing orders with channel:"interno" become channel:"loja".
 *   2. DISCOUNT_REASONS (src/lib/types.ts) — the "Consumo interno" discount
 *      reason is gone; existing orders with discount.reason:"consumo-interno"
 *      become discount.reason:"cortesia".
 * Both migrations run per store, in sequence, in a single pass.
 *
 * Step 1 deletes the store's stores/{id}/meta/summary doc afterward (only if
 * an order was actually rewritten) so the app's existing slowPath full-scan
 * fallback (see src/app/s/[storeId]/dashboard-data.ts) recomputes it fresh
 * on next load — cheaper and safer than importing refreshSummary() directly,
 * which lives behind "server-only" and can't run under plain tsx outside
 * Next's build. Once recomputed, the old "interno" counts land under "loja"
 * naturally, since the source orders now say "loja". Step 2 needs no such
 * invalidation — discount.reason isn't tracked in the summary aggregates.
 *
 * Defaults to a dry run (prints affected orders, writes nothing). Pass
 * --apply to actually write.
 *
 *   npx tsx scripts/migrate-remove-interno.ts            # dry run
 *   npx tsx scripts/migrate-remove-interno.ts --apply     # writes
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

async function migrateChannel(storeId: string): Promise<number> {
  const orders = await db
    .collection(`stores/${storeId}/orders`)
    .where("channel", "==", "interno")
    .get();

  console.log(`  channel "interno" -> "loja": ${orders.size} pedido(s)`);
  if (orders.empty) return 0;
  for (const doc of orders.docs) {
    const d = doc.data();
    console.log(`    - ${doc.id} · ${d.customerName ?? "—"} · ${d.status ?? "—"}`);
  }

  if (apply) {
    const batch = db.batch();
    for (const doc of orders.docs) batch.update(doc.ref, { channel: "loja" });
    await batch.commit();

    console.log(`    deleting stores/${storeId}/meta/summary so it recomputes fresh…`);
    await db.doc(`stores/${storeId}/meta/summary`).delete();
  }

  return orders.size;
}

async function migrateDiscountReason(storeId: string): Promise<number> {
  const orders = await db
    .collection(`stores/${storeId}/orders`)
    .where("discount.reason", "==", "consumo-interno")
    .get();

  console.log(`  discount.reason "consumo-interno" -> "cortesia": ${orders.size} pedido(s)`);
  if (orders.empty) return 0;
  for (const doc of orders.docs) {
    const d = doc.data();
    console.log(`    - ${doc.id} · ${d.customerName ?? "—"} · ${d.status ?? "—"}`);
  }

  if (apply) {
    const batch = db.batch();
    for (const doc of orders.docs) batch.update(doc.ref, { "discount.reason": "cortesia" });
    await batch.commit();
  }

  return orders.size;
}

async function migrate() {
  console.log(
    `Alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD"} — modo: ${apply ? "APLICAR" : "dry run"}`,
  );

  const stores = await db.collection("stores").get();
  let totalChannel = 0;
  let totalReason = 0;

  for (const store of stores.docs) {
    console.log(`\n=== STORE: ${store.id} ===`);
    totalChannel += await migrateChannel(store.id);
    totalReason += await migrateDiscountReason(store.id);
  }

  console.log(
    `\n${totalChannel} pedido(s) ${apply ? "migrado(s) para channel:\"loja\"." : "teriam channel migrado para \"loja\""} — ${totalReason} pedido(s) ${apply ? "migrado(s) para reason:\"cortesia\"." : "teriam reason migrado para \"cortesia\""}${apply ? "" : ". Rode com --apply para escrever."}`,
  );
}

migrate().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
