/**
 * READ-ONLY prod safety check ahead of the Vouchers→Cartelas migration.
 * Counts leftover voucher data so a human can decide whether
 * migrate-vouchers-to-cartelas.ts --apply is safe to run. Writes nothing.
 *
 *   npx tsx scripts/_check-vouchers-prod.ts
 *
 * Targets selet-prod via Application Default Credentials — refuses to run
 * against the emulator (the whole point is checking real prod data).
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST set — refusing, this must run against prod.");
  process.exit(1);
}

const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);

const STORES = ["vila-velha", "passos"];

async function main() {
  let totalVouchers = 0;
  let totalTemplates = 0;

  for (const storeId of STORES) {
    const [vouchers, templates] = await Promise.all([
      db.collection(`stores/${storeId}/vouchers`).get(),
      db.collection(`stores/${storeId}/voucherTemplates`).get(),
    ]);
    totalVouchers += vouchers.size;
    totalTemplates += templates.size;
    console.log(`\n=== STORE: ${storeId} ===`);
    console.log(`  vouchers: ${vouchers.size}`);
    for (const doc of vouchers.docs) {
      const d = doc.data();
      console.log(
        `    [${doc.id}] cliente="${d.customerName}" template="${d.templateName}" pago=${!!d.paid} hasBalance=${!!d.hasBalance} expiresAt=${d.expiresAt ?? "—"}`,
      );
    }
    console.log(`  voucherTemplates: ${templates.size}`);
    for (const doc of templates.docs) {
      const d = doc.data();
      console.log(`    [${doc.id}] "${d.name}" active=${!!d.active}`);
    }

    const financeVoucherTx = await db
      .collection(`stores/${storeId}/finance`)
      .where("source", "==", "voucher")
      .get();
    console.log(`  finance docs with source=voucher: ${financeVoucherTx.size}`);
  }

  const usersSnap = await db.collectionGroup("users").get();
  const usersWithVouchers = usersSnap.docs.filter((d) =>
    ((d.data().sections as string[] | undefined) ?? []).includes("vouchers"),
  );
  console.log(`\nusers with "vouchers" in sections: ${usersWithVouchers.length}`);
  for (const doc of usersWithVouchers) {
    console.log(`  [${doc.id}] ${doc.data().email ?? "—"}`);
  }

  console.log(
    `\nTOTAL: ${totalVouchers} voucher(s) sold, ${totalTemplates} template(s), ${usersWithVouchers.length} user(s) with the old "vouchers" permission.`,
  );
  console.log(
    totalVouchers === 0 && totalTemplates === 0
      ? "Nothing real to lose — safe to run migrate-vouchers-to-cartelas.ts --apply."
      : "NON-ZERO — review the listing above with João before running --apply; real customer balances may exist.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
