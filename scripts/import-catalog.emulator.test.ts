import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/firebase-admin";
import { importCatalog } from "./lib/import-catalog";

// Runs only against the Firestore emulator (locally or in CI via
// `firebase emulators:exec`). Never against prod.
const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!hasEmulator)("importCatalog (emulator)", () => {
  const db = getDb();
  const products = (storeId: string) =>
    db.collection("stores").doc(storeId).collection("products");
  const stock = (storeId: string) =>
    db.collection("stores").doc(storeId).collection("stockItems");

  // These tests import into the fixed bootstrap stores, and importCatalog
  // deliberately preserves live stock counts on re-import. The "is idempotent"
  // test mutates a café insumo (shake-todos-os-sabores) to simulate live
  // movement, so without a clean slate that mutation leaks into the next run's
  // fresh-import assertions. Wipe both stores' catalog collections up front so
  // the first import always sees the pristine hbl-stock.json opening ledger.
  beforeAll(async () => {
    for (const storeId of ["vila-velha", "passos"]) {
      await db.recursiveDelete(products(storeId));
      await db.recursiveDelete(stock(storeId));
    }
  });

  it("imports the menu at Vila Velha prices, with descriptions and stock (seed path)", async () => {
    // seedOpeningLedger:true is the emulator/demo path — the store keeps the
    // realistic hbl-stock.json opening counts. (The prod bootstrap omits it and
    // starts at ZERO; that branch is covered by the Passos test below.)
    const r = await importCatalog(db, "vila-velha", { seedOpeningLedger: true });
    expect(r.products).toBeGreaterThan(0);
    expect(r.stockItems).toBeGreaterThan(0);

    const [prods, items] = await Promise.all([
      products("vila-velha").get(),
      stock("vila-velha").get(),
    ]);
    expect(prods.size).toBe(r.products);
    expect(items.size).toBe(r.stockItems);

    const shake = (
      await products("vila-velha").doc("shake-frutas-vermelhas").get()
    ).data();
    expect(shake).toMatchObject({ price: 3600, category: "shakes", active: true });
    expect(shake?.description.length).toBeGreaterThan(0);
    expect(shake?.createdAt).toBeTruthy();

    // A tracked café insumo seeds its opening ledger: qty = sealed*pkgSize + open.
    const shakeStock = (
      await stock("vila-velha").doc("shake-todos-os-sabores").get()
    ).data();
    expect(shakeStock).toMatchObject({
      category: "secos",
      tracked: true,
      continuousUse: true,
      consumptionMode: "continuo",
      pkgSize: 550,
      sealed: 3,
      open: 0,
      qty: 1650,
      usos: 14,
      lowStock: false,
      archived: false,
    });

    // An esgotado resale insumo derives lowStock from its reorder threshold.
    const cr7 = (
      await stock("vila-velha").doc("cr7-drive-berry-mix").get()
    ).data();
    expect(cr7).toMatchObject({ resellable: true, qty: 0, lowStock: true });

    // The café seed ships nothing archived.
    const archived = (await stock("vila-velha").get()).docs.filter(
      (d) => d.data().archived === true,
    );
    expect(archived).toHaveLength(0);
  });

  it("imports Passos at its own (cheaper) prices and skips lanches", async () => {
    // Default (no seedOpeningLedger) is the PROD BOOTSTRAP path: a real store
    // starts every insumo at ZERO and counts in via entrada movements — NO demo
    // opening counts (owner directive A).
    const r = await importCatalog(db, "passos");

    // Same shake, different store price.
    const shake = (
      await products("passos").doc("shake-frutas-vermelhas").get()
    ).data();
    expect(shake?.price).toBe(3300);

    // Prod path: the café insumo lands with a zeroed opening ledger (no demo
    // counts), but its unit-derived catalog fields are still set.
    const shakeStock = (
      await stock("passos").doc("shake-todos-os-sabores").get()
    ).data();
    expect(shakeStock).toMatchObject({
      tracked: true,
      continuousUse: true,
      consumptionMode: "continuo",
      pkgSize: 550,
      sealed: 0,
      open: 0,
      qty: 0,
      usos: 0,
      openPkg: false,
    });

    // Passos doesn't sell the lanches, so they aren't imported there…
    const lanche = await products("passos").doc("lanche-barra-proteica").get();
    expect(lanche.exists).toBe(false);
    // …but Vila Velha does.
    const vvLanche = await products("vila-velha").doc("lanche-barra-proteica").get();
    expect(vvLanche.exists).toBe(true);

    expect(r.products).toBeLessThan(
      (await products("vila-velha").get()).size,
    );
  });

  it("is idempotent: no duplicates, createdAt and live stock preserved", async () => {
    const before = await importCatalog(db, "vila-velha");

    const createdAt = (
      await products("vila-velha").doc("shake-frutas-vermelhas").get()
    ).data()?.createdAt;
    // Simulate live movement on a café insumo — re-import must not clobber it.
    await stock("vila-velha").doc("shake-todos-os-sabores").set(
      { sealed: 0, open: 7, qty: 7, usos: 99, lowStock: false },
      { merge: true },
    );

    const after = await importCatalog(db, "vila-velha");
    expect(after.products).toBe(before.products);

    const [prods, items] = await Promise.all([
      products("vila-velha").get(),
      stock("vila-velha").get(),
    ]);
    expect(prods.size).toBe(before.products);
    expect(items.size).toBe(before.stockItems);

    const createdAt2 = (
      await products("vila-velha").doc("shake-frutas-vermelhas").get()
    ).data()?.createdAt;
    expect(createdAt2.isEqual(createdAt)).toBe(true);

    const insumo = (
      await stock("vila-velha").doc("shake-todos-os-sabores").get()
    ).data();
    expect(insumo?.qty).toBe(7);
    expect(insumo?.open).toBe(7);
    expect(insumo?.usos).toBe(99);
  });
});
