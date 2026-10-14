import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/firebase-admin";
import {
  adjustOpenBalance,
  applyMovement,
  createStockItem,
  getStockItem,
  listMovements,
  listMovementsPage,
  markPackageEmpty,
  openNextPackage,
  transferToStore,
} from "./stock";
import type { StockItemInput } from "./stock";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

// Per-unit item: 12 un/caixa, resale. Reorders at 1 caixa in the Loja.
const BEBIDA: StockItemInput = {
  name: "CR7 Drive Berry Mix",
  category: "bebidas",
  unit: "un",
  tracked: true,
  pkgLabel: "caixa",
  pkgSize: 12,
  continuousUse: false,
  consumptionMode: "medido",
  resellable: true,
  cost: 14690,
  sellPrice: 2600,
  reorderAt: 1,
};

// Contínuo: weight unit, a pote lasts several uses.
const POTE: StockItemInput = {
  name: "Shake Baunilha",
  category: "secos",
  unit: "g",
  tracked: true,
  pkgLabel: "pote",
  pkgSize: 550,
  continuousUse: true,
  consumptionMode: "continuo",
  resellable: false,
  cost: 13000,
  reorderAt: 2,
};

const mv = { by: "test@selet.com" };
const days = (n: number) => new Date(Date.now() - n * 86_400_000);
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

describe.skipIf(!hasEmulator)("stock depósito (emulator)", () => {
  describe("purchases and corrections in the depósito", () => {
    it("a depósito purchase only grows depSealed and leaves the Loja alone", async () => {
      const storeId = `test-dep-a-${stamp()}`;
      const id = await createStockItem(storeId, BEBIDA, { sealed: 0, open: 0 });
      expect((await getStockItem(storeId, id))?.lowStock).toBe(true);

      await applyMovement(storeId, id, {
        ...mv, type: "entrada", qty: 2, byPackage: true, price: 14000, loc: "deposito",
      });

      expect(await getStockItem(storeId, id)).toMatchObject({
        depSealed: 2, sealed: 0, open: 0, qty: 0, lowStock: true, cost: 14000,
      });
      const [last] = await listMovements(storeId, id);
      expect(last).toMatchObject({ type: "entrada", loc: "deposito", qty: 2, byPackage: true });
    });

    it("rejects loose or overdrawn depósito movements and untracked items", async () => {
      const storeId = `test-dep-b-${stamp()}`;
      const id = await createStockItem(storeId, BEBIDA, { sealed: 0, open: 0, depSealed: 1 });

      await expect(
        applyMovement(storeId, id, { ...mv, type: "entrada", qty: 3, byPackage: false, loc: "deposito" }),
      ).rejects.toThrow(/apenas embalagens/);
      await expect(
        applyMovement(storeId, id, { ...mv, type: "saida", qty: 2, byPackage: true, loc: "deposito" }),
      ).rejects.toThrow(/insuficientes no depósito/);

      const loose = await createStockItem(
        storeId,
        { ...BEBIDA, name: "Tampa", tracked: false, pkgLabel: undefined, pkgSize: undefined },
        { sealed: 0, open: 5 },
      );
      await expect(
        applyMovement(storeId, loose, { ...mv, type: "entrada", qty: 1, byPackage: true, loc: "deposito" }),
      ).rejects.toThrow(/embalagem/);
      expect((await getStockItem(storeId, id))?.depSealed).toBe(1);
    });

    it("an opening depósito balance shows up as a depósito entrada in the ledger", async () => {
      const storeId = `test-dep-c-${stamp()}`;
      const id = await createStockItem(storeId, BEBIDA, { sealed: 1, open: 0, depSealed: 3 }, "ana@selet.com");

      expect(await getStockItem(storeId, id)).toMatchObject({ sealed: 1, depSealed: 3 });
      const page = await listMovementsPage(storeId, id, { loc: "deposito" });
      expect(page.rows).toHaveLength(1);
      expect(page.rows[0]).toMatchObject({ loc: "deposito", qty: 3, by: "ana@selet.com" });
    });
  });

  describe("transferToStore", () => {
    it("moves packages Depósito → Loja with one shared TR code and a movement per item", async () => {
      const storeId = `test-tr-a-${stamp()}`;
      const a = await createStockItem(storeId, BEBIDA, { sealed: 0, open: 0, depSealed: 3 });
      const b = await createStockItem(storeId, { ...POTE }, { sealed: 1, open: 0, depSealed: 4 });
      expect((await getStockItem(storeId, a))?.lowStock).toBe(true);

      const out = await transferToStore(storeId, [{ itemId: a, qty: 2 }, { itemId: b, qty: 2 }], "ana@selet.com", "reposição de terça");

      expect(out).toEqual({ trCode: "TR-0001", count: 2 });
      // minimum is 1 caixa (12 un): 24 un is above it, so the alert clears
      expect(await getStockItem(storeId, a)).toMatchObject({ depSealed: 1, sealed: 2, qty: 24, lowStock: false });
      expect(await getStockItem(storeId, b)).toMatchObject({ depSealed: 2, sealed: 3 });
      const [tr] = await listMovements(storeId, a);
      expect(tr).toMatchObject({
        type: "transferencia", reason: "TRANSFERENCIA", loc: "ambos", trCode: "TR-0001", qty: 2, note: "reposição de terça",
      });

      expect((await transferToStore(storeId, [{ itemId: a, qty: 1 }], "ana@selet.com")).trCode).toBe("TR-0002");
    });

    it("keeps the nav badge counter in step when a transfer lifts an item above its minimum", async () => {
      const storeId = `test-tr-badge-${stamp()}`;
      const a = await createStockItem(storeId, BEBIDA, { sealed: 0, open: 0, depSealed: 3 });
      const snap = () => getDb().collection("stores").doc(storeId).collection("meta").doc("summary").get();
      expect((await snap()).data()?.lowStock).toBe(1);

      await transferToStore(storeId, [{ itemId: a, qty: 2 }], mv.by);

      expect((await snap()).data()?.lowStock).toBe(0);
    });

    it("rejects overdrawing the depósito, duplicates, empty and untracked lines, writing nothing", async () => {
      const storeId = `test-tr-b-${stamp()}`;
      const a = await createStockItem(storeId, BEBIDA, { sealed: 0, open: 0, depSealed: 1 });
      const b = await createStockItem(storeId, { ...POTE }, { sealed: 0, open: 0, depSealed: 1 });
      const loose = await createStockItem(
        storeId,
        { ...BEBIDA, name: "Tampa", tracked: false, pkgLabel: undefined, pkgSize: undefined },
        { sealed: 0, open: 5 },
      );

      await expect(transferToStore(storeId, [], mv.by)).rejects.toThrow(/ao menos um/);
      await expect(
        transferToStore(storeId, [{ itemId: a, qty: 1 }, { itemId: a, qty: 1 }], mv.by),
      ).rejects.toThrow(/uma vez/);
      await expect(
        transferToStore(storeId, [{ itemId: b, qty: 1 }, { itemId: a, qty: 2 }], mv.by),
      ).rejects.toThrow(/Depósito sem embalagens/);
      await expect(transferToStore(storeId, [{ itemId: loose, qty: 1 }], mv.by)).rejects.toThrow(/embalagem/);
      await expect(transferToStore(storeId, [{ itemId: a, qty: 0 }], mv.by)).rejects.toThrow(/inteiro/);

      // The failed multi-line transfer rolled back its first line too.
      expect(await getStockItem(storeId, b)).toMatchObject({ depSealed: 1, sealed: 0 });
      expect(await listMovements(storeId, b)).toHaveLength(1);
    });
  });

  describe("abrir embalagem from the depósito", () => {
    it("takes the pote straight from the depósito without touching the Loja's sealed count", async () => {
      const storeId = `test-open-a-${stamp()}`;
      const id = await createStockItem(storeId, POTE, { sealed: 3, open: 0, depSealed: 6 });

      await openNextPackage(storeId, id, mv.by, { from: "deposito", note: "Pote anterior rendeu 14 usos (78%)" });

      expect(await getStockItem(storeId, id)).toMatchObject({ depSealed: 5, sealed: 3, openPkg: true, usos: 0 });
      const [m] = await listMovements(storeId, id);
      expect(m).toMatchObject({ type: "abertura", loc: "ambos", note: "Pote anterior rendeu 14 usos (78%)" });
    });

    it("rejects an empty depósito and defaults to the Loja", async () => {
      const storeId = `test-open-b-${stamp()}`;
      const id = await createStockItem(storeId, POTE, { sealed: 2, open: 0, depSealed: 0 });

      await expect(openNextPackage(storeId, id, mv.by, { from: "deposito" })).rejects.toThrow(/depósito/);
      await openNextPackage(storeId, id, mv.by);
      expect(await getStockItem(storeId, id)).toMatchObject({ sealed: 1, openPkg: true });
    });

    it("remembers how many uses the closed pote served", async () => {
      const storeId = `test-open-c-${stamp()}`;
      const id = await createStockItem(storeId, POTE, { sealed: 2, open: 0 });
      await openNextPackage(storeId, id, mv.by);
      // sales tally uses through the consumption engine; set the counter directly here
      await getDb().collection("stores").doc(storeId).collection("stockItems").doc(id).update({ usos: 3 });

      await markPackageEmpty(storeId, id, mv.by);

      expect(await getStockItem(storeId, id)).toMatchObject({ openPkg: false, lastUsos: 3 });
    });
  });

  describe("dated entries replay the ledger in date order", () => {
    it("rejects a future date", async () => {
      const storeId = `test-date-a-${stamp()}`;
      const id = await createStockItem(storeId, BEBIDA, { sealed: 1, open: 0 });
      await expect(
        applyMovement(storeId, id, { ...mv, type: "entrada", qty: 1, byPackage: true, at: new Date(Date.now() + 3 * 86_400_000) }),
      ).rejects.toThrow(/futura/);
    });

    it("a back-dated package purchase lands in the right place and updates the balance", async () => {
      const storeId = `test-date-b-${stamp()}`;
      const id = await createStockItem(storeId, BEBIDA, { sealed: 1, open: 0 });

      await applyMovement(storeId, id, { ...mv, type: "entrada", qty: 2, byPackage: true, price: 9000, at: days(5) });

      expect(await getStockItem(storeId, id)).toMatchObject({ sealed: 3, qty: 36 });
      const rows = await listMovements(storeId, id);
      expect(rows.map((r) => r.qty)).toEqual([1, 2]); // newest first: the opening entrada, then the older purchase
    });

    it("a back-dated purchase never overrides the cost of a more recent purchase", async () => {
      const storeId = `test-date-c-${stamp()}`;
      const id = await createStockItem(storeId, BEBIDA, { sealed: 1, open: 0 }); // opening entrada at cost 14690

      await applyMovement(storeId, id, { ...mv, type: "entrada", qty: 1, byPackage: true, price: 5000, at: days(10) });

      expect((await getStockItem(storeId, id))?.cost).toBe(14690);
    });

    it("an entrada dated today (or after the latest movement) takes the plain path and sets the cost", async () => {
      const storeId = `test-date-d-${stamp()}`;
      const id = await createStockItem(storeId, BEBIDA, { sealed: 1, open: 0 });

      await applyMovement(storeId, id, { ...mv, type: "entrada", qty: 1, byPackage: true, price: 15000, at: new Date() });

      expect(await getStockItem(storeId, id)).toMatchObject({ sealed: 2, cost: 15000 });
    });

    it("keeps an 'Ajustar embalagem aberta' correction as an anchor: a loose entrada dated before it does not change the balance", async () => {
      const storeId = `test-date-e-${stamp()}`;
      const id = await createStockItem(storeId, BEBIDA, { sealed: 3, open: 4 });
      await adjustOpenBalance(storeId, id, { open: 6, unitLabel: "un", by: mv.by });
      expect(await getStockItem(storeId, id)).toMatchObject({ sealed: 3, open: 6, qty: 42 });

      await applyMovement(storeId, id, { ...mv, type: "entrada", qty: 5, byPackage: false, at: days(2) });

      // Counted open balance wins over an older entrada.
      expect(await getStockItem(storeId, id)).toMatchObject({ sealed: 3, open: 6, qty: 42 });
    });

    it("rejects a back-dated movement the history can no longer support", async () => {
      const storeId = `test-date-f-${stamp()}`;
      const id = await createStockItem(storeId, BEBIDA, { sealed: 2, open: 0 });
      await applyMovement(storeId, id, { ...mv, type: "saida", qty: 2, byPackage: true });

      // Taking 1 package out three days ago, before the opening stock existed → impossible.
      await expect(
        applyMovement(storeId, id, { ...mv, type: "saida", qty: 1, byPackage: true, at: days(3) }),
      ).rejects.toThrow(/insuficiente/);
      expect(await getStockItem(storeId, id)).toMatchObject({ sealed: 0 });
      expect(await listMovements(storeId, id)).toHaveLength(2);
    });
  });

  describe("listMovementsPage", () => {
    it("filters by location and kind and pages with a cursor, newest first", async () => {
      const storeId = `test-page-${stamp()}`;
      const id = await createStockItem(storeId, BEBIDA, { sealed: 0, open: 0 });
      // distinct dates, oldest first
      await applyMovement(storeId, id, { ...mv, type: "entrada", qty: 4, byPackage: true, at: days(5) });
      await applyMovement(storeId, id, { ...mv, type: "entrada", qty: 3, byPackage: true, loc: "deposito", at: days(4) });
      await applyMovement(storeId, id, { ...mv, type: "saida", qty: 1, byPackage: true, reason: "AJUSTE", at: days(3) });
      await transferToStore(storeId, [{ itemId: id, qty: 1 }], mv.by);
      await applyMovement(storeId, id, { ...mv, type: "saida", qty: 1, byPackage: true, reason: "VENDA", refOrder: "P1" });

      const all = await listMovementsPage(storeId, id, { limit: 50 });
      const ats = all.rows.map((r) => r.at);
      expect([...ats].sort().reverse()).toEqual(ats);

      expect((await listMovementsPage(storeId, id, { kind: "transf" })).rows.map((r) => r.type)).toEqual(["transferencia"]);
      expect((await listMovementsPage(storeId, id, { kind: "consumo" })).rows).toHaveLength(1);
      expect((await listMovementsPage(storeId, id, { kind: "ajuste" })).rows).toHaveLength(1);
      // depósito view = its own purchase + the transfer that touches both sides
      const dep = await listMovementsPage(storeId, id, { loc: "deposito" });
      expect(dep.rows.map((r) => r.type).sort()).toEqual(["entrada", "transferencia"]);
      // loja view hides the depósito purchase but keeps the transfer
      const loja = await listMovementsPage(storeId, id, { loc: "loja" });
      expect(loja.rows.some((r) => r.loc === "deposito")).toBe(false);

      const first = await listMovementsPage(storeId, id, { limit: 2 });
      expect(first.rows).toHaveLength(2);
      expect(first.next).not.toBeNull();
      const second = await listMovementsPage(storeId, id, { limit: 2, before: first.next! });
      const seen = new Set([...first.rows, ...second.rows].map((r) => r.id));
      expect(seen.size).toBe(first.rows.length + second.rows.length); // no duplicates across pages
      expect(second.rows[0].at <= first.rows[1].at).toBe(true);
    });
  });
});
