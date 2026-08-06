/**
 * One-off migration: the "Vouchers" feature (VoucherTemplate/Voucher,
 * prepaid multi-product packages) was fully replaced by "Cartelas"
 * (single product-agnostic punch cards, sold ad hoc from Pedidos — no
 * template concept). This script cleans up what's left of the old feature:
 *
 *   1. Rewrites users.sections: "vouchers" -> "cartelas" (a funcionário
 *      granted the old module keeps equivalent access under the new name).
 *   2. Deletes stores/*\/vouchers, stores/*\/voucherTemplates, and any
 *      stores/*\/finance docs with source:"voucher".
 *   3. Deletes the store's stores/{id}/meta/summary doc afterward (only if
 *      a finance doc was actually removed) so the app's existing slowPath
 *      full-scan fallback (see src/app/s/[storeId]/dashboard-data.ts)
 *      recomputes it fresh on next load — cheaper and safer than importing
 *      refreshSummary() directly, which lives behind "server-only" and
 *      can't run under plain tsx outside Next's build.
 *
 * Defaults to a dry run (prints what would change, writes nothing). Pass
 * --apply to actually write.
 *
 *   npx tsx scripts/migrate-vouchers-to-cartelas.ts            # dry run
 *   npx tsx scripts/migrate-vouchers-to-cartelas.ts --apply     # writes
 *
 * SAFETY: run scripts/_check-vouchers-prod.ts first and review the counts
 * with João before ever passing --apply against prod. Real customer
 * balances may exist even though the feature only shipped a couple of
 * days before this migration was written.
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

const STORES = ["vila-velha", "passos"];

async function deleteCollection(path: string): Promise<number> {
  const snap = await db.collection(path).get();
  if (snap.empty) return 0;
  if (apply) {
    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
  }
  return snap.size;
}

async function migrate() {
  console.log(
    `Alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD"} — modo: ${apply ? "APLICAR" : "dry run"}`,
  );

  // 1. users.sections
  const usersSnap = await db.collectionGroup("users").get();
  const toUpdate = usersSnap.docs.filter((d) =>
    ((d.data().sections as string[] | undefined) ?? []).includes("vouchers"),
  );
  console.log(`\nusuários com "vouchers" em sections: ${toUpdate.length}`);
  for (const doc of toUpdate) {
    const sections = ((doc.data().sections as string[] | undefined) ?? []).map((s) =>
      s === "vouchers" ? "cartelas" : s,
    );
    console.log(`  [${doc.ref.path}] ${doc.data().email ?? "—"} -> sections=${JSON.stringify(sections)}`);
    if (apply) await doc.ref.update({ sections });
  }

  // 2 & 3. per-store collections
  for (const storeId of STORES) {
    console.log(`\n=== STORE: ${storeId} ===`);

    const vouchers = await deleteCollection(`stores/${storeId}/vouchers`);
    console.log(`  vouchers: ${vouchers} ${apply ? "deletado(s)" : "seriam deletado(s)"}`);

    const templates = await deleteCollection(`stores/${storeId}/voucherTemplates`);
    console.log(`  voucherTemplates: ${templates} ${apply ? "deletado(s)" : "seriam deletado(s)"}`);

    const financeSnap = await db
      .collection(`stores/${storeId}/finance`)
      .where("source", "==", "voucher")
      .get();
    console.log(
      `  finance (source=voucher): ${financeSnap.size} ${apply ? "deletado(s)" : "seriam deletado(s)"}`,
    );
    if (apply && !financeSnap.empty) {
      const batch = db.batch();
      for (const doc of financeSnap.docs) batch.delete(doc.ref);
      await batch.commit();
    }

    if (apply && financeSnap.size > 0) {
      console.log(`  deleting stores/${storeId}/meta/summary so it recomputes fresh…`);
      await db.doc(`stores/${storeId}/meta/summary`).delete();
    }
  }

  console.log(
    apply
      ? "\nMigração aplicada."
      : "\nDry run concluído — nada foi escrito. Rode com --apply para migrar de verdade.",
  );
}

migrate().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
