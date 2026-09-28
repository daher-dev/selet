/**
 * One-off backfill: the CARTELA history drawer shows, next to each "Pedido
 * #..." group, the LATEST CartelaOrderUse.at in that group (see
 * usesByOrder() in src/lib/cartelas.ts). Until this fix, planCartelas
 * (src/data/cartelas.ts) stamped `at` with the wall-clock instant the order
 * was SAVED — and since every edit reverses and re-appends the order's
 * punches, that stamp got reset to "now" on every unrelated save. The
 * drawer's date then drifted from the order's own createdAt ("Data da
 * venda"), which is what the Pedidos list actually shows for the same
 * order.
 *
 * The code fix makes planCartelas stamp `at` from the order's own createdAt
 * going forward, which self-heals a cartela the next time its order is
 * edited. This script corrects what's already stored: for every
 * `kind: "order"` entry in every cartela's `uses[]`, it looks up the
 * referenced order's real createdAt and rewrites `at` to match. Manual
 * adjustments (`kind: "manual"`) have no order to derive a date from and
 * are left untouched. An entry whose orderId doesn't resolve to a real
 * order (e.g. deleted order, or synthetic demo-seed ids) is left untouched
 * too, with a warning — never invent a date.
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
  let totalEntries = 0;
  let totalUnresolved = 0;

  for (const store of stores.docs) {
    const cartelasSnap = await db.collection(`stores/${store.id}/cartelas`).get();
    if (cartelasSnap.empty) continue;

    // Collect every orderId any "order"-kind use references, dedupe, batch-fetch.
    const orderIds = new Set<string>();
    for (const doc of cartelasSnap.docs) {
      const uses = (doc.data().uses ?? []) as Record<string, unknown>[];
      for (const u of uses) {
        if (u.kind === "order" && typeof u.orderId === "string") orderIds.add(u.orderId);
      }
    }
    if (orderIds.size === 0) continue;

    const orderRefs = [...orderIds].map((id) => db.doc(`stores/${store.id}/orders/${id}`));
    const orderSnaps = await db.getAll(...orderRefs);
    const orderCreatedAt = new Map<string, string>();
    for (const snap of orderSnaps) {
      if (snap.exists) orderCreatedAt.set(snap.id, toIso(snap.data()!.createdAt));
    }

    console.log(`\n=== STORE: ${store.id} ===`);

    const batch = db.batch();
    let storeCartelas = 0;
    let storeEntries = 0;

    for (const doc of cartelasSnap.docs) {
      const uses = (doc.data().uses ?? []) as Record<string, unknown>[];
      let changed = 0;
      let unresolved = 0;
      const nextUses = uses.map((u) => {
        if (u.kind !== "order" || typeof u.orderId !== "string") return u;
        const correctAt = orderCreatedAt.get(u.orderId);
        if (correctAt === undefined) {
          unresolved += 1;
          return u;
        }
        if (toIso(u.at) === correctAt) return u;
        changed += 1;
        return { ...u, at: correctAt };
      });

      if (unresolved > 0) {
        totalUnresolved += unresolved;
        console.log(
          `  [aviso] cartela ${doc.id}: ${unresolved} uso(s) com orderId sem pedido correspondente — mantido(s) como está.`,
        );
      }
      if (changed === 0) continue;

      storeCartelas += 1;
      storeEntries += changed;
      console.log(`  cartela ${doc.id}: ${changed} uso(s) com data corrigida`);
      if (apply) batch.update(doc.ref, { uses: nextUses });
    }

    if (storeCartelas === 0) {
      console.log("  nenhuma cartela precisa de correção.");
      continue;
    }

    totalCartelas += storeCartelas;
    totalEntries += storeEntries;
    if (apply) await batch.commit();
  }

  console.log(
    `\n${totalCartelas} cartela(s) / ${totalEntries} uso(s) ${apply ? "corrigido(s)." : "seriam corrigido(s) — rode com --apply para escrever."}`,
  );
  if (totalUnresolved > 0) {
    console.log(
      `${totalUnresolved} uso(s) com orderId sem pedido correspondente foram ignorados (nunca invente uma data).`,
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
