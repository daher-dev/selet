/**
 * One-off migration for the Financeiro "Consumo vs Revenda" split and the
 * Visão geral "novos vs recorrentes" chart:
 *
 *  1. Snapshots `saleType` onto every order line that lacks it, resolved from
 *     the line's product doc (missing product → "menu").
 *  2. Writes `revendaAmount` on every order finance mirror (`order-{id}`) —
 *     the part of the mirror's amount that came from revenda lines, same
 *     proration as the app (src/lib/order-money.ts revendaShare).
 *  3. Recomputes stores/{id}/meta/summary so it gains `firstOrderMonth`.
 *
 * Idempotent. Defaults to a dry run (prints counts, writes nothing). Pass
 * --apply to actually write.
 *
 *   npx tsx scripts/migrate-order-saletype.ts            # dry run
 *   npx tsx scripts/migrate-order-saletype.ts --apply     # writes
 *
 * Targets the emulator when FIRESTORE_EMULATOR_HOST is set, prod otherwise
 * (via Application Default Credentials) — same connection convention as the
 * other scripts/ entry points.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type WriteBatch } from "firebase-admin/firestore";
import { revendaShare } from "../src/lib/order-money";
import type { OrderItem, ProductSaleType } from "../src/lib/types";
import { refreshStoreSummary } from "./lib/summary";

const apply = process.argv.includes("--apply");

const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);

/** Batches writes, committing every 400 ops (Firestore caps a batch at 500). */
function batcher() {
  let batch: WriteBatch = db.batch();
  let n = 0;
  return {
    async add(fn: (b: WriteBatch) => void) {
      fn(batch);
      n += 1;
      if (n >= 400) {
        await batch.commit();
        batch = db.batch();
        n = 0;
      }
    },
    async flush() {
      if (n > 0) await batch.commit();
    },
  };
}

async function migrate() {
  console.log(
    `Alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD"} — modo: ${apply ? "APLICAR" : "dry run"}`,
  );

  const stores = await db.collection("stores").get();
  for (const store of stores.docs) {
    const [productsSnap, ordersSnap, financeSnap] = await Promise.all([
      db.collection(`stores/${store.id}/products`).get(),
      db.collection(`stores/${store.id}/orders`).get(),
      db.collection(`stores/${store.id}/finance`).where("source", "==", "order").get(),
    ]);
    const saleTypes = new Map<string, ProductSaleType>();
    for (const p of productsSnap.docs) {
      saleTypes.set(p.id, (p.data().saleType as ProductSaleType | undefined) ?? "menu");
    }

    const writes = batcher();
    const itemsByOrder = new Map<string, OrderItem[]>();
    let ordersTouched = 0;
    for (const o of ordersSnap.docs) {
      const raw = (o.data().items ?? []) as OrderItem[];
      let changed = false;
      const items = raw.map((item) => {
        if (item.saleType) return item;
        changed = true;
        return { ...item, saleType: saleTypes.get(item.productId) ?? "menu" };
      });
      itemsByOrder.set(o.id, items);
      if (!changed) continue;
      ordersTouched += 1;
      if (apply) await writes.add((b) => b.update(o.ref, { items }));
    }

    let mirrorsTouched = 0;
    let revendaTotal = 0;
    for (const f of financeSnap.docs) {
      const d = f.data();
      const items = d.orderId ? itemsByOrder.get(d.orderId as string) : undefined;
      const revendaAmount = items ? revendaShare(items, d.amount ?? 0) : 0;
      revendaTotal += revendaAmount;
      if (d.revendaAmount === revendaAmount) continue;
      mirrorsTouched += 1;
      if (apply) await writes.add((b) => b.update(f.ref, { revendaAmount }));
    }

    if (apply) {
      await writes.flush();
      await refreshStoreSummary(db, store.id);
    }
    console.log(
      `${store.id}: ${ordersTouched} pedido(s) sem saleType, ${mirrorsTouched} espelho(s) financeiro(s) a atualizar · revenda total R$ ${(revendaTotal / 100).toFixed(2)}`,
    );
  }

  console.log(apply ? "\nMigração aplicada (resumo recalculado)." : "\nDry run — rode com --apply para escrever.");
}

migrate().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
