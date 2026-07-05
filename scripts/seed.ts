/**
 * Seeds the Firestore EMULATOR with a store and the initial admin user.
 *
 *   npm run seed
 *
 * Refuses to run without FIRESTORE_EMULATOR_HOST so it can never touch prod.
 * (Prod bootstrap is scripts/bootstrap-prod.ts, run once with ADC.)
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const ADMIN_EMAIL = "joao@daher.dev";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST não definido — recusando (proteção contra rodar em prod).");
  process.exit(1);
}

const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);

async function seed() {
  await db.doc("stores/vila-velha").set({
    name: "Vila Velha/ES",
    sub: "Loja matriz",
    initial: "V",
    createdAt: FieldValue.serverTimestamp(),
  });

  await db.doc(`users/${ADMIN_EMAIL}`).set({
    email: ADMIN_EMAIL,
    uid: null,
    name: "João Daher",
    role: "admin",
    storeIds: "all",
    sections: [],
    status: "ativo",
    invitedAt: FieldValue.serverTimestamp(),
  });

  console.log("Seed ok: loja vila-velha + admin", ADMIN_EMAIL);
}

seed().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
