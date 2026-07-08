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
import { importCatalog } from "./lib/import-catalog";
import { refreshStoreSummary } from "./lib/summary";
import { seedRealTeam } from "./lib/team";

const ADMIN_EMAIL = "joao@daher.dev";

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST definido — use npm run seed para o emulador.");
  process.exit(1);
}

const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);

const STORES = [
  { id: "vila-velha", name: "Vila Velha/ES", sub: "Loja matriz", initial: "V" },
  { id: "passos", name: "Passos/MG", sub: "Filial", initial: "P" },
];

async function bootstrap() {
  for (const { id, ...store } of STORES) {
    await db.doc(`stores/${id}`).set(
      { ...store, createdAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }

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

  // Real team (NOT the fictional demo roster) — the admin above plus the actual
  // staff in REAL_TEAM. Members without an email yet are reported as pending.
  const { created, pending } = await seedRealTeam(db);
  if (created.length) console.log("Equipe provisionada:", created.join(", "));
  if (pending.length)
    console.log("Equipe pendente (sem e-mail ainda — convide pela tela Equipe):", pending.join(", "));

  for (const { id } of STORES) {
    // Opening ledger stays at ZERO (seedOpeningLedger omitted) — a real store
    // does its day-1 count via entrada movements, not seeded demo counts.
    const r = await importCatalog(db, id);
    console.log(
      `Catálogo importado em ${id}: ${r.products} produtos, ${r.stockItems} itens de estoque` +
        (r.archived ? `, ${r.archived} arquivados` : ""),
    );
    // Pre-compute the per-store summary doc (low-stock count, etc.), like seed.ts.
    await refreshStoreSummary(db, id);
  }

  console.log(
    "Bootstrap ok: lojas",
    STORES.map((s) => s.id).join(", "),
    "+ admin",
    ADMIN_EMAIL,
  );
}

bootstrap().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
