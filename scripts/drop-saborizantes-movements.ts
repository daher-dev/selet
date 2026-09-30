/**
 * One-off PROD cleanup: deletes the stock MOVEMENT HISTORY
 * (stores/passos/stockItems/{id}/movements/*) of every stock item whose name
 * contains "Saborizante" (case/accent-insensitive, archived included).
 *
 * What it does NOT touch: the items themselves and their current counts
 * (sealed/open/qty/lowStock). Before deleting, it pins the current state as
 * `replayBaseline` on each item so later edits/deletes of NEW movements replay
 * correctly (see replayBaselineState in src/data/stock.ts).
 *
 * Finance: priced "entrada" movements were mirrored into finance as
 * "Compra · <item>" expenses. Those are LEFT ALONE by default (the report
 * lists how many/how much). Pass --delete-finance to remove them too; the
 * store summary is then deleted so the app recomputes it.
 *
 * Defaults to a dry run (prints matches, writes nothing). Deletion is
 * irreversible — take a Firestore export / rely on PITR first.
 *
 *   gcloud auth application-default login
 *   npx tsx scripts/drop-saborizantes-movements.ts                        # dry run
 *   npx tsx scripts/drop-saborizantes-movements.ts --apply --confirm passos
 *   npx tsx scripts/drop-saborizantes-movements.ts --apply --confirm passos --delete-finance
 *
 * Targets the emulator when FIRESTORE_EMULATOR_HOST is set, prod otherwise
 * (Application Default Credentials).
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { dropMovements, normalize } from "./lib/drop-movements";

const STORE_ID = "passos";
const MATCH = normalize("Saborizante");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const deleteFinance = args.includes("--delete-finance");
const confirmIdx = args.indexOf("--confirm");
const confirmed = confirmIdx >= 0 && args[confirmIdx + 1] === STORE_ID;
const onEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

if (apply && !onEmulator && !confirmed) {
  console.error(`Em PROD, --apply exige --confirm ${STORE_ID}.`);
  process.exit(1);
}

const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);

async function main() {
  console.log(
    `Alvo: ${onEmulator ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : "PROD (selet-prod)"}` +
      ` · loja: ${STORE_ID} · modo: ${apply ? "APLICAR" : "dry run"}` +
      `${deleteFinance ? " · +despesas Compra" : ""}\n`,
  );

  const res = await dropMovements(db, {
    storeId: STORE_ID,
    match: MATCH,
    apply,
    deleteFinance,
    log: console.log,
  });

  if (res.items.length === 0) {
    console.error(`Nenhum item com nome contendo "Saborizante" em ${STORE_ID}. Itens existentes:`);
    for (const n of [...res.allNames].sort()) console.error(`  - ${n}`);
    process.exit(2);
  }

  const totalMov = res.items.reduce((s, i) => s + i.movements, 0);
  const totalFin = res.items.reduce((s, i) => s + i.financeDocs, 0);
  console.log(
    `\n${res.items.length} item(ns), ${totalMov} movimentação(ões).` +
      (apply
        ? ` Removidas: ${res.movementsDeleted} movimentação(ões), ${res.financeDeleted} despesa(s) Compra` +
          `${deleteFinance ? "" : ` (${totalFin} despesa(s) mantida(s); use --delete-finance para removê-las)`}.`
        : ` Nada foi escrito. Rode com --apply --confirm ${STORE_ID} para executar.`),
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
