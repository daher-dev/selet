/**
 * One-off: delete the "vila-velha" store (stores/vila-velha and every
 * subcollection beneath it). The "passos" store is never touched.
 *
 * Also reports `users` docs that reference the store in `storeIds`. Users are
 * only reported, never modified or deleted — a user left with no store needs a
 * human decision.
 *
 * Defaults to a dry run (prints a per-collection inventory, writes nothing).
 * Pass --apply to actually delete. Irreversible: there is no undo.
 *
 *   npx tsx scripts/delete-store-vila-velha.ts            # dry run
 *   npx tsx scripts/delete-store-vila-velha.ts --apply    # deletes
 *
 * Targets prod via Application Default Credentials; refuses the emulator.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const TARGET = "vila-velha";
const KEEP = "passos";
const apply = process.argv.includes("--apply");

if (process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Refusing to run against the emulator; this script targets prod.");
}

const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);

async function inventory(ref: FirebaseFirestore.DocumentReference, indent = "  "): Promise<number> {
  let total = 0;
  for (const col of await ref.listCollections()) {
    const docs = await col.listDocuments();
    console.log(`${indent}${col.id}: ${docs.length} doc(s)`);
    total += docs.length;
    for (const d of docs) total += await inventory(d, indent + "  ");
  }
  return total;
}

async function main() {
  const storeRef = db.doc(`stores/${TARGET}`);
  const keepRef = db.doc(`stores/${KEEP}`);

  console.log(`stores/${TARGET} doc exists: ${(await storeRef.get()).exists}`);
  const nested = await inventory(storeRef);
  console.log(`total nested docs under stores/${TARGET}: ${nested}`);

  const keepBefore = await inventory(keepRef, "  [keep] ");
  console.log(`stores/${KEEP} nested docs (must be unchanged): ${keepBefore}`);

  const users = await db.collection("users").where("storeIds", "array-contains", TARGET).get();
  console.log(`users referencing "${TARGET}": ${users.size}`);
  for (const u of users.docs) {
    const ids: string[] = u.data().storeIds ?? [];
    const only = ids.every((s) => s === TARGET);
    console.log(`  - ${u.id} · ${u.data().role ?? "—"} · storeIds=${JSON.stringify(ids)}${only ? "  ⚠ would have NO store left" : ""}`);
  }

  if (!apply) {
    console.log("\nDry run — nothing deleted. Re-run with --apply.");
    return;
  }

  console.log(`\nDeleting stores/${TARGET} recursively…`);
  await db.recursiveDelete(storeRef);

  console.log(`stores/${TARGET} doc exists now: ${(await storeRef.get()).exists}`);
  const keepAfter = await inventory(keepRef, "  [keep] ");
  console.log(`stores/${KEEP} nested docs after: ${keepAfter} (before: ${keepBefore})`);
  if (keepAfter !== keepBefore) throw new Error("passos doc count changed!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
