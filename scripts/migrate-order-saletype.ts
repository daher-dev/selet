/**
 * One-off migration for the Financeiro "Consumo vs Revenda" split and the
 * Visão geral "novos vs recorrentes" chart:
 *
 *  1. Snapshots `saleType` onto every order line that lacks it, resolved from
 *     the line's product doc (missing product → "menu").
 *  2. Writes `revendaAmount` on every order finance mirror (`order-{id}`) —
 *     the part of the mirror's amount that came from revenda lines, same
 *     proration as the app (src/lib/order-money.ts revendaShare).
 *  3. Writes `firstOrderAt` on every customer — their earliest non-cancelled
 *     order, exactly what the app's recomputeAggregates maintains.
 *  4. Recomputes stores/{id}/meta/summary (per-month `novos` included).
 *
 * Safe to run against the live app: steps 1–3 each re-read their doc inside
 * a transaction, so an order edited mid-run is never overwritten with a stale
 * copy, and the mirrors are listed only after every order is stamped, so a
 * mirror created mid-run is still corrected. Step 4 overwrites the summary from a fresh scan (like every other
 * refresh script) — run it in a quiet hour, or simply re-run the script.
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
import { getFirestore, type Timestamp } from "firebase-admin/firestore";
import { revendaShare } from "../src/lib/order-money";
import type { OrderItem, ProductSaleType } from "../src/lib/types";
import { refreshStoreSummary } from "./lib/summary";

const apply = process.argv.includes("--apply");

const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);

/** Stamps missing saleTypes; returns null when every line already has one. */
function stamp(
  items: OrderItem[],
  saleTypes: Map<string, ProductSaleType>,
): OrderItem[] | null {
  if (items.every((i) => i.saleType)) return null;
  return items.map((i) =>
    i.saleType ? i : { ...i, saleType: saleTypes.get(i.productId) ?? "menu" },
  );
}

async function migrate() {
  console.log(
    `Alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD"} — modo: ${apply ? "APLICAR" : "dry run"}`,
  );

  const stores = await db.collection("stores").get();
  for (const store of stores.docs) {
    const base = `stores/${store.id}`;
    const [productsSnap, ordersSnap, customersSnap] = await Promise.all([
      db.collection(`${base}/products`).get(),
      db.collection(`${base}/orders`).get(),
      db.collection(`${base}/customers`).get(),
    ]);
    const saleTypes = new Map<string, ProductSaleType>();
    for (const p of productsSnap.docs) {
      saleTypes.set(p.id, (p.data().saleType as ProductSaleType | undefined) ?? "menu");
    }

    // 1. Order lines.
    let ordersTouched = 0;
    for (const o of ordersSnap.docs) {
      if (!stamp((o.data().items ?? []) as OrderItem[], saleTypes)) continue;
      ordersTouched += 1;
      if (!apply) continue;
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(o.ref);
        const items = stamp((fresh.data()?.items ?? []) as OrderItem[], saleTypes);
        if (items) tx.update(o.ref, { items });
      });
    }

    // 2. Order finance mirrors. Queried only AFTER step 1: a legacy order paid
    // (or uncancelled) while step 1 ran gets a mirror whose revendaAmount was
    // derived from still-unstamped lines (0). Querying now includes it, and
    // any mirror created after this point derives from stamped lines already.
    const mirrorsSnap = await db
      .collection(`${base}/finance`)
      .where("source", "==", "order")
      .get();
    let mirrorsTouched = 0;
    for (const f of mirrorsSnap.docs) {
      const orderId = f.data().orderId as string | undefined;
      if (!orderId) continue;
      const orderRef = db.doc(`${base}/orders/${orderId}`);
      if (!apply) {
        const order = ordersSnap.docs.find((d) => d.id === orderId);
        const items = (order?.data().items ?? []) as OrderItem[];
        const want = revendaShare(stamp(items, saleTypes) ?? items, f.data().amount ?? 0);
        if (f.data().revendaAmount !== want) mirrorsTouched += 1;
        continue;
      }
      await db.runTransaction(async (tx) => {
        const [mirror, order] = await Promise.all([tx.get(f.ref), tx.get(orderRef)]);
        if (!mirror.exists) return;
        const items = (order.data()?.items ?? []) as OrderItem[];
        const want = revendaShare(items, mirror.data()!.amount ?? 0);
        if (mirror.data()!.revendaAmount === want) return;
        mirrorsTouched += 1;
        tx.update(f.ref, { revendaAmount: want });
      });
    }

    // 3. Customers' first-order date (earliest non-cancelled order).
    let customersTouched = 0;
    for (const c of customersSnap.docs) {
      const firstOf = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) =>
        docs
          .map((d) => d.data().createdAt as Timestamp | undefined)
          .filter((t): t is Timestamp => !!t)
          .sort((a, b) => a.toMillis() - b.toMillis())[0] ?? null;
      const ordersOf = db
        .collection(`${base}/orders`)
        .where("customerId", "==", c.id)
        .where("status", "!=", "cancelado");
      if (!apply) {
        const first = firstOf((await ordersOf.get()).docs);
        const stored = c.data().firstOrderAt as Timestamp | null | undefined;
        if ((stored?.toMillis() ?? null) !== (first?.toMillis() ?? null)) customersTouched += 1;
        continue;
      }
      await db.runTransaction(async (tx) => {
        const [snap, customer] = await Promise.all([tx.get(ordersOf), tx.get(c.ref)]);
        if (!customer.exists) return;
        const first = firstOf(snap.docs);
        const stored = customer.data()!.firstOrderAt as Timestamp | null | undefined;
        if ((stored?.toMillis() ?? null) === (first?.toMillis() ?? null)) return;
        customersTouched += 1;
        tx.update(c.ref, { firstOrderAt: first });
      });
    }

    // 4. Summary (per-month novos, everything else re-consolidated).
    if (apply) await refreshStoreSummary(db, store.id);

    console.log(
      `${store.id}: ${ordersTouched} pedido(s) sem saleType · ${mirrorsTouched} espelho(s) financeiro(s) · ${customersTouched} cliente(s) sem firstOrderAt`,
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
