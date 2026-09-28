/**
 * One-off backfill for two related date-drift bugs, both caused by
 * planCartelas (src/data/cartelas.ts) stamping cartela dates with the
 * wall-clock instant a transaction ran instead of the relevant order's own
 * createdAt ("Data da venda"):
 *
 *  1. The CARTELA history drawer shows, next to each "Pedido #..." group,
 *     the LATEST CartelaOrderUse.at in that group (see usesByOrder() in
 *     src/lib/cartelas.ts). `at` used to be stamped with `new Date()` at
 *     write time — and since every order edit reverses and re-appends its
 *     punches, that stamp reset to "now" on every unrelated save, drifting
 *     from the order's own createdAt shown in the Pedidos list.
 *  2. The cartelas list and customer detail sheet show "comprada <date>"
 *     from Cartela.purchasedAt (Cartela.createdAt mirrors it but isn't
 *     displayed). This too was stamped with `new Date()` at the moment the
 *     selling order's transaction committed, instead of that order's own
 *     createdAt.
 *
 * The code fix makes planCartelas stamp both from the relevant order's own
 * createdAt going forward — punches self-heal the next time their order is
 * edited, but purchasedAt/createdAt are written once at sale and never
 * revisited, so they need this backfill regardless. This script corrects
 * what's already stored:
 *  - For every `kind: "order"` entry in every cartela's `uses[]`, look up
 *    the referenced order's real createdAt and rewrite `at` to match.
 *    Manual adjustments (`kind: "manual"`) have no order to derive a date
 *    from and are left untouched.
 *  - For every cartela, look up its `soldOnOrderId` order's real createdAt
 *    and rewrite `purchasedAt`/`createdAt` to match (leaving `updatedAt`
 *    alone — it's a genuine last-touched bookkeeping field).
 * An orderId that doesn't resolve to a real order (deleted order, or
 * synthetic demo-seed ids) is left untouched, with a warning — never
 * invent a date.
 *
 * Defaults to a dry run (prints what would change, writes nothing). Pass
 * --apply to actually write.
 *
 *   npx tsx scripts/migrate-cartela-use-dates.ts            # dry run
 *   npx tsx scripts/migrate-cartela-use-dates.ts --apply     # writes
 *
 * SAFETY: review the printed diffs before ever passing --apply against
 * prod — same convention as every other scripts/migrate-*.ts.
 *
 * Targets the emulator when FIRESTORE_EMULATOR_HOST is set, prod otherwise
 * (via Application Default Credentials) — same connection convention as
 * scripts/migrate-adicionais-saletype.ts.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");

const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);

function toIso(at: unknown): string {
  if (typeof at === "string") return at;
  if (at instanceof Timestamp) return at.toDate().toISOString();
  return "";
}

async function migrate() {
  console.log(
    `Alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD"} — modo: ${apply ? "APLICAR" : "dry run"}`,
  );

  const stores = await db.collection("stores").get();
  let totalCartelas = 0;
  let totalUseEntries = 0;
  let totalPurchases = 0;
  let totalUnresolved = 0;

  for (const store of stores.docs) {
    const cartelasSnap = await db.collection(`stores/${store.id}/cartelas`).get();
    if (cartelasSnap.empty) continue;

    // Collect every orderId any "order"-kind use, or a cartela's own sale,
    // references, dedupe, batch-fetch.
    const orderIds = new Set<string>();
    for (const doc of cartelasSnap.docs) {
      const d = doc.data();
      if (typeof d.soldOnOrderId === "string") orderIds.add(d.soldOnOrderId);
      const uses = (d.uses ?? []) as Record<string, unknown>[];
      for (const u of uses) {
        if (u.kind === "order" && typeof u.orderId === "string") orderIds.add(u.orderId);
      }
    }
    if (orderIds.size === 0) continue;

    const orderRefs = [...orderIds].map((id) => db.doc(`stores/${store.id}/orders/${id}`));
    const orderSnaps = await db.getAll(...orderRefs);
    const orderCreatedAt = new Map<string, Timestamp>();
    for (const snap of orderSnaps) {
      if (snap.exists) orderCreatedAt.set(snap.id, snap.data()!.createdAt as Timestamp);
    }

    console.log(`\n=== STORE: ${store.id} ===`);

    const batch = db.batch();
    let storeCartelas = 0;
    let storeUseEntries = 0;
    let storePurchases = 0;

    for (const doc of cartelasSnap.docs) {
      const d = doc.data();
      const uses = (d.uses ?? []) as Record<string, unknown>[];
      let changedUses = 0;
      let unresolved = 0;
      const nextUses = uses.map((u) => {
        if (u.kind !== "order" || typeof u.orderId !== "string") return u;
        const correctTs = orderCreatedAt.get(u.orderId);
        if (correctTs === undefined) {
          unresolved += 1;
          return u;
        }
        const correctAt = correctTs.toDate().toISOString();
        if (toIso(u.at) === correctAt) return u;
        changedUses += 1;
        return { ...u, at: correctAt };
      });

      const saleTs =
        typeof d.soldOnOrderId === "string" ? orderCreatedAt.get(d.soldOnOrderId) : undefined;
      const purchaseChanged = saleTs !== undefined && toIso(d.purchasedAt) !== saleTs.toDate().toISOString();
      if (saleTs === undefined) unresolved += 1;

      if (unresolved > 0) {
        totalUnresolved += unresolved;
        console.log(
          `  [aviso] cartela ${doc.id}: ${unresolved} referência(s) a pedido sem correspondência — mantido(s) como está.`,
        );
      }
      if (changedUses === 0 && !purchaseChanged) continue;

      storeCartelas += 1;
      storeUseEntries += changedUses;
      if (purchaseChanged) storePurchases += 1;
      const parts = [];
      if (changedUses > 0) parts.push(`${changedUses} uso(s) com data corrigida`);
      if (purchaseChanged) parts.push("purchasedAt/createdAt corrigido(s)");
      console.log(`  cartela ${doc.id}: ${parts.join(", ")}`);

      if (apply) {
        const update: Record<string, unknown> = {};
        if (changedUses > 0) update.uses = nextUses;
        if (purchaseChanged) {
          update.purchasedAt = saleTs;
          update.createdAt = saleTs;
        }
        batch.update(doc.ref, update);
      }
    }

    if (storeCartelas === 0) {
      console.log("  nenhuma cartela precisa de correção.");
      continue;
    }

    totalCartelas += storeCartelas;
    totalUseEntries += storeUseEntries;
    totalPurchases += storePurchases;
    if (apply) await batch.commit();
  }

  console.log(
    `\n${totalCartelas} cartela(s) ${apply ? "corrigida(s)" : "seriam corrigida(s)"}: ${totalUseEntries} uso(s) de pedido, ${totalPurchases} data(s) de compra${apply ? "." : " — rode com --apply para escrever."}`,
  );
  if (totalUnresolved > 0) {
    console.log(
      `${totalUnresolved} referência(s) a pedido sem correspondência foram ignoradas (nunca invente uma data).`,
    );
  }
}

migrate().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
