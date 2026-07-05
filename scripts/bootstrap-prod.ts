/**
 * One-off PROD bootstrap: creates the first store and the first admin user.
 * Run once with Application Default Credentials:
 *
 *   gcloud auth application-default login
 *   npm run bootstrap:prod
 *
 * Idempotent (set with merge). Refuses to run against the emulator.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const ADMIN_EMAIL = "joao@daher.dev";

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST definido — use npm run seed para o emulador.");
  process.exit(1);
}

const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);

async function bootstrap() {
  await db.doc("stores/vila-velha").set(
    {
      name: "Vila Velha/ES",
      sub: "Loja matriz",
      initial: "V",
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await db.doc(`users/${ADMIN_EMAIL}`).set(
    {
      email: ADMIN_EMAIL,
      name: "João Daher",
      role: "admin",
      storeIds: "all",
      sections: [],
      status: "ativo",
      invitedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  console.log("Bootstrap ok: loja vila-velha + admin", ADMIN_EMAIL);
}

bootstrap().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
