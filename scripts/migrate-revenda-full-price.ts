/**
 * Re-derives `revendaAmount` on every order finance mirror (`order-{id}`) with
 * the current revendaShare (src/lib/order-money.ts): Revenda is the resold
 * products' full price, capped at what was charged — discounts hit Consumo
 * first. Before, the discount was prorated across lines, leaving centavos.
 * Touches only that field (amounts, summary and commissions are unchanged).
 *
 * Idempotent; dry run by default, --apply writes. Prod unless
 * FIRESTORE_EMULATOR_HOST is set.
 *
 *   npx tsx scripts/migrate-revenda-full-price.ts
 *   npx tsx scripts/migrate-revenda-full-price.ts --apply
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { revendaShare } from "../src/lib/order-money";
import type { OrderItem } from "../src/lib/types";

const apply = process.argv.includes("--apply");
const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: "selet-prod" }));

async function main() {
  console.log(`Alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? "emulador" : "PROD"} — ${apply ? "APLICAR" : "dry run"}`);
  for (const store of (await db.collection("stores").get()).docs) {
    const mirrors = await store.ref.collection("finance").where("source", "==", "order").get();
    let touched = 0;
    for (const f of mirrors.docs) {
      const orderId = f.data().orderId as string | undefined;
      if (!orderId) continue;
      await db.runTransaction(async (tx) => {
        const [mirror, order] = await Promise.all([tx.get(f.ref), tx.get(store.ref.collection("orders").doc(orderId))]);
        if (!mirror.exists) return;
        const want = revendaShare((order.data()?.items ?? []) as OrderItem[], mirror.data()!.amount ?? 0);
        const had = mirror.data()!.revendaAmount ?? 0;
        if (had === want) return;
        touched += 1;
        console.log(`  ${f.id}: ${had} -> ${want}`);
        if (apply) tx.update(f.ref, { revendaAmount: want });
      });
    }
    console.log(`${store.id}: ${touched} espelho(s)`);
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
