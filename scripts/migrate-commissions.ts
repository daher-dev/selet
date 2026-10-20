/**
 * One-off backfill of seller commissions for orders placed before the
 * commission feature (past month + current month by default).
 *
 *   npx tsx scripts/migrate-commissions.ts                      # dry run
 *   npx tsx scripts/migrate-commissions.ts --apply              # writes
 *   npx tsx scripts/migrate-commissions.ts --since=2026-09-01 --seller=ana@x.com --store=passos
 *
 * Rates live in RATES below (product name → %). The seller of each order is
 * whoever the activity log says registered it, unless --seller overrides it for
 * orders that have none. Orders with no resolvable seller are listed and skipped.
 * Idempotent; defaults to a dry run. Targets the emulator when
 * FIRESTORE_EMULATOR_HOST is set, prod otherwise (Application Default Credentials).
 * Details: scripts/lib/commission-backfill.ts.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { addZonedMonths } from "../src/lib/timezone";
import { backfillCommissions } from "./lib/commission-backfill";

/** Commission % by product name, per store. */
const RATES: Record<string, Record<string, number>> = {
  passos: { Creatina: 15 },
};

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const apply = process.argv.includes("--apply");
const onlyStore = arg("store");
const sellerOverride = arg("seller");
// Default window: the first day of last month (store time zone) onwards.
const sinceArg = arg("since");
const since = sinceArg ? new Date(`${sinceArg}T00:00:00-03:00`) : addZonedMonths(new Date(), -1);
if (Number.isNaN(since.getTime())) throw new Error(`--since inválido: ${sinceArg}`);

const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: "selet-prod" }));

async function main() {
  console.log(
    `Alvo: ${process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD"} — modo: ${apply ? "APLICAR" : "dry run"} — pedidos desde ${since.toISOString()}`,
  );
  let unresolved = 0;
  for (const [storeId, rates] of Object.entries(RATES)) {
    if (onlyStore && onlyStore !== storeId) continue;
    console.log(`\nLoja ${storeId} — taxas: ${JSON.stringify(rates)}`);
    const r = await backfillCommissions(db, storeId, {
      apply,
      since,
      rates,
      sellerOverride,
      log: console.log,
    });
    unresolved += r.unresolved.length;
    console.log(
      `  => produtos ${r.productsUpdated}, pedidos ${r.ordersUpdated}/${r.ordersConsidered}, espelhos ${r.mirrorsUpdated}, ` +
        `comissão total R$ ${(r.totalCommission / 100).toFixed(2).replace(".", ",")}, sem vendedor ${r.unresolved.length}`,
    );
  }
  if (!apply) console.log("\nDry run — nada foi escrito. Use --apply para gravar.");
  if (unresolved > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
