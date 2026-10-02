import { beforeEach, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import { applyMovement, deleteMovement, getStockItem } from "@/data/stock";
import { dropMovements, normalize } from "./lib/drop-movements";

// Emulator only — never prod.
const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const STORE = "passos";
const MATCH = normalize("Saborizante");

describe.skipIf(!hasEmulator)("dropMovements (emulator)", () => {
  const db = getDb();
  const store = db.collection("stores").doc(STORE);
  const stock = store.collection("stockItems");

  async function seedItem(id: string, data: Record<string, unknown>) {
    await stock.doc(id).set({
      unit: "g",
      category: "secos",
      tracked: true,
      pkgSize: 100,
      continuousUse: true,
      consumptionMode: "continuo",
      reorderAt: 0,
      archived: false,
      lowStock: false,
      movementSeq: 2,
      ...data,
    });
    const movs = stock.doc(id).collection("movements");
    await movs.doc("m1").set({
      type: "entrada", qty: 3, byPackage: true, seq: 1, price: 500,
      reason: "ENTRADA", refOrder: null, refItem: null, by: "t", at: Timestamp.now(),
    });
    await movs.doc("m2").set({
      type: "abertura", qty: 1, byPackage: true, seq: 2, price: null,
      reason: "AJUSTE", refOrder: null, refItem: "Abriu embalagem", by: "t", at: Timestamp.now(),
    });
    await store.collection("finance").doc("stock-m1").set({ amount: 1500, direction: "out" });
  }

  beforeEach(async () => {
    await db.recursiveDelete(stock);
    await db.recursiveDelete(store.collection("finance"));
    // sealed 2 + one open package with 5 usos = state after the two movements above.
    await seedItem("sab", {
      name: "Saborizante Baunilha", sealed: 2, open: 0, qty: 200, openPkg: true, usos: 5,
    });
    await seedItem("gran", {
      name: "Granola", sealed: 2, open: 0, qty: 200, openPkg: true, usos: 5,
    });
  });

  it("dry run reports matches and writes nothing", async () => {
    const r = await dropMovements(db, { storeId: STORE, match: MATCH, apply: false, deleteFinance: false });
    expect(r.items.map((i) => i.id)).toEqual(["sab"]);
    expect(r.items[0]).toMatchObject({ movements: 2, financeDocs: 1, financeTotal: 1500 });
    expect((await stock.doc("sab").collection("movements").get()).size).toBe(2);
    expect((await stock.doc("sab").get()).data()!.replayBaseline).toBeUndefined();
  });

  it("apply deletes only matching items' movements, keeps counts and finance", async () => {
    const r = await dropMovements(db, { storeId: STORE, match: MATCH, apply: true, deleteFinance: false });
    expect(r.movementsDeleted).toBe(2);
    expect((await stock.doc("sab").collection("movements").get()).size).toBe(0);
    expect((await stock.doc("gran").collection("movements").get()).size).toBe(2);
    const d = (await stock.doc("sab").get()).data()!;
    expect(d).toMatchObject({ sealed: 2, open: 0, qty: 200, openPkg: true, usos: 5, movementSeq: 2 });
    expect(d.replayBaseline).toEqual({ sealed: 2, open: 0, openPkg: true, usos: 5 });
    expect((await store.collection("finance").doc("stock-m1").get()).exists).toBe(true);
  });

  it("is idempotent", async () => {
    await dropMovements(db, { storeId: STORE, match: MATCH, apply: true, deleteFinance: false });
    const r = await dropMovements(db, { storeId: STORE, match: MATCH, apply: true, deleteFinance: false });
    expect(r.movementsDeleted).toBe(0);
    expect((await getStockItem(STORE, "sab"))!.sealed).toBe(2);
  });

  it("--delete-finance removes the Compra mirror and the summary", async () => {
    await store.collection("meta").doc("summary").set({ openOrders: 0 });
    const r = await dropMovements(db, { storeId: STORE, match: MATCH, apply: true, deleteFinance: true });
    expect(r.financeDeleted).toBe(1);
    expect((await store.collection("finance").doc("stock-m1").get()).exists).toBe(false);
    expect((await store.collection("meta").doc("summary").get()).exists).toBe(false);
  });

  it("later movement edits replay from the pinned baseline, not from zero", async () => {
    await dropMovements(db, { storeId: STORE, match: MATCH, apply: true, deleteFinance: false });
    // Without replayBaseline this continuous item would replay from zeros and
    // reset sealed/usos when the new movement is deleted.
    await applyMovement(STORE, "sab", { type: "entrada", qty: 1, byPackage: true, by: "t" });
    const movs = await stock.doc("sab").collection("movements").get();
    expect(movs.size).toBe(1);
    expect((await getStockItem(STORE, "sab"))!.sealed).toBe(3);
    await deleteMovement(STORE, "sab", movs.docs[0].id);
    const after = await getStockItem(STORE, "sab");
    expect(after).toMatchObject({ sealed: 2, openPkg: true, usos: 5, qty: 200 });
  });
});
