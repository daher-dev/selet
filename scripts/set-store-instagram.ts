/**
 * One-off: sets stores/{id}.instagram (the default profile of new sorteios).
 *
 *   npx tsx scripts/set-store-instagram.ts <storeId> <handle>           # dry run
 *   npx tsx scripts/set-store-instagram.ts <storeId> <handle> --apply   # writes
 *
 * Accepts "@selet.vv" or "selet.vv"; stores it lowercased
 * without "@". Targets the emulator when FIRESTORE_EMULATOR_HOST is set, prod
 * otherwise (ADC) — same convention as the other scripts here.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const [storeId, raw] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");

const handle = /^@?([A-Za-z0-9._]{1,30})$/i.exec(raw?.trim() ?? "")?.[1]?.toLowerCase();
if (!storeId || !handle) {
  console.error("Uso: set-store-instagram.ts <storeId> <@handle> [--apply]");
  process.exit(1);
}

const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: "selet-prod" }));
const ref = db.collection("stores").doc(storeId);
const snap = await ref.get();
if (!snap.exists) throw new Error(`Loja ${storeId} não existe.`);
console.log(`${snap.data()!.name}: instagram ${snap.data()!.instagram ?? "—"} -> ${handle}${apply ? "" : " (dry run)"}`);
if (apply) await ref.update({ instagram: handle });
