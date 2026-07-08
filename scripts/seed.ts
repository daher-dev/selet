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
import { importCatalog } from "./lib/import-catalog";
import { refreshStoreSummary } from "./lib/summary";
import { seedInvites } from "./lib/team";

const ADMIN_EMAIL = "joao@daher.dev";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST não definido — recusando (proteção contra rodar em prod).");
  process.exit(1);
}

const app = getApps()[0] ?? initializeApp({ projectId: "selet-prod" });
const db = getFirestore(app);

const STORES = [
  { id: "vila-velha", name: "Vila Velha/ES", sub: "Loja matriz", initial: "V" },
  { id: "passos", name: "Passos/MG", sub: "Filial", initial: "P" },
];

async function seed() {
  for (const { id, ...store } of STORES) {
    await db.doc(`stores/${id}`).set({
      ...store,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

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

  const invited = await seedInvites(db);
  if (invited.length) console.log("Convites criados:", invited.join(", "));

  for (const { id } of STORES) {
    // Emulator/demo store keeps the realistic hbl-stock.json opening counts.
    const r = await importCatalog(db, id, { seedOpeningLedger: true });
    console.log(
      `Catálogo importado em ${id}: ${r.products} produtos, ${r.stockItems} itens de estoque` +
        (r.deleted ? `, ${r.deleted} removidos` : ""),
    );
    // Backfill the pre-computed summary doc (low-stock count, etc.).
    await refreshStoreSummary(db, id);
  }

  console.log(
    "Seed ok: lojas",
    STORES.map((s) => s.id).join(", "),
    "+ admin",
    ADMIN_EMAIL,
  );
}

seed().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
