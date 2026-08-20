/**
 * One-off backfill: setOrderStatus() used to leave a cancelled order's paid
 * finance mirror (stores/{id}/finance/order-{orderId}, direction "in") in
 * place — cancelling removed the order from orderCount/ticketSum but never
 * reversed its income mirror (see src/data/orders.ts setOrderStatus). Any
 * order that was marked paid and *then* cancelled before that fix still has
 * its stale "in" mirror sitting in Firestore, inflating Financeiro's revenue
 * totals and summary.months[...].in for whatever month it was posted in.
 *
 * This script finds every "cancelado" order that still has a matching finance
 * mirror doc, deletes the mirror, then recomputes and persists that store's
 * stores/{id}/meta/summary from scratch — via scripts/lib/summary.ts'
 * refreshStoreSummary (the plain-tsx-safe twin of src/data/summary.ts's
 * refreshSummary, which lives behind "server-only"). Recomputing directly
 * (rather than deleting the summary doc and hoping something recomputes it
 * later) matters here: the app's incremental writers rebuild the summary from
 * an EMPTY base when the doc is absent (see readSummaryTx), so leaving it
 * deleted risks the next unrelated order write silently wiping history.
 *
 * Defaults to a dry run (prints affected orders, writes nothing). Pass
 * --apply to actually write.
 *
 *   npx tsx scripts/migrate-cancelled-order-mirrors.ts            # dry run
 *   npx tsx scripts/migrate-cancelled-order-mirrors.ts --apply     # writes
 *
 * Targets the emulator when FIRESTORE_EMULATOR_HOST is set, prod otherwise
 * (via Application Default Credentials) — same connection convention as
 * scripts/migrate-adicionais-saletype.ts.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { formatBRL } from "../src/lib/format";
import { refreshStoreSummary } from "./lib/summary";

const apply = process.argv.includes("--apply");

const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);

/** Firestore batch delete is capped at 500 ops; chunk with headroom. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function migrateStore(storeId: string): Promise<number> {
  const cancelledSnap = await db
    .collection(`stores/${storeId}/orders`)
    .where("status", "==", "cancelado")
    .get();

  if (cancelledSnap.empty) {
    console.log(`\n=== STORE: ${storeId} ===`);
    console.log("  0 pedido(s) cancelado(s).");
    return 0;
  }

  const mirrorRefs = cancelledSnap.docs.map((doc) =>
    db.doc(`stores/${storeId}/finance/order-${doc.id}`),
  );
  const mirrorSnaps = await db.getAll(...mirrorRefs);

  const stale: { orderId: string; customerName: string; ref: DocumentReference; amount: number }[] =
    [];
  cancelledSnap.docs.forEach((orderDoc, i) => {
    const mirrorSnap = mirrorSnaps[i];
    if (mirrorSnap.exists) {
      stale.push({
        orderId: orderDoc.id,
        customerName: (orderDoc.data().customerName as string) ?? "—",
        ref: mirrorSnap.ref,
        amount: (mirrorSnap.data()?.amount as number | undefined) ?? 0,
      });
    }
  });

  console.log(`\n=== STORE: ${storeId} ===`);
  console.log(
    `  ${cancelledSnap.size} pedido(s) cancelado(s) — ${stale.length} com mirror financeiro pendente:`,
  );
  for (const s of stale) {
    console.log(`    - ${s.orderId} · ${s.customerName} · ${formatBRL(s.amount)}`);
  }
  if (stale.length === 0) return 0;

  if (apply) {
    for (const batchRefs of chunk(stale, 450)) {
      const batch = db.batch();
      for (const s of batchRefs) batch.delete(s.ref);
      await batch.commit();
    }
    console.log(`    recomputando stores/${storeId}/meta/summary…`);
    await refreshStoreSummary(db, storeId);
  }

  return stale.length;
}

async function migrate() {
  console.log(
    `Alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD"} — modo: ${apply ? "APLICAR" : "dry run"}`,
  );

  const stores = await db.collection("stores").get();
  let total = 0;
  for (const store of stores.docs) total += await migrateStore(store.id);

  console.log(
    `\n${total} mirror(s) financeiro(s) de pedido(s) cancelado(s) ${apply ? "removido(s) e resumo(s) recomputado(s)." : "seriam removidos — rode com --apply para escrever."}`,
  );
}

migrate().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
