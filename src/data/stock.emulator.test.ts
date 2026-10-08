import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/firebase-admin";
import {
  adjustOpenBalance,
  applyMovement,
  createStockItem,
  deleteMovement,
  getStockItem,
  listMovements,
  updateMovement,
  updateStockItem,
} from "./stock";
import type { StockItemInput } from "./stock";
import { listTransactions } from "./finance";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

const GRANOLA: StockItemInput = {
  name: "Granola",
  category: "secos",
  unit: "g",
  tracked: true,
  pkgLabel: "pote",
  pkgSize: 500,
  continuousUse: false,
  consumptionMode: "medido",
  resellable: true,
  cost: 1800,
  sellPrice: 3200,
  // Package-based threshold: tracked+medido items reorder at reorderAt packages
  // (× pkgSize base units). 2 potes = 1000 g. See computeLowStock in stock.ts.
  reorderAt: 2,
};

// Per-unit item (copos): count unit, 10 un/pacote, consumed from an open package.
const COPO: StockItemInput = {
  name: "Copo Descartável 300 ml",
  category: "descartaveis",
  unit: "un",
  tracked: true,
  pkgLabel: "pacote",
  pkgSize: 10,
  continuousUse: false,
  consumptionMode: "medido",
  resellable: false,
  // 2 pacotes = 20 un
  reorderAt: 2,
};

const mv = { by: "test@selet.com" };
const db = getDb();

const stockDoc = (storeId: string, itemId: string) =>
  db.collection("stores").doc(storeId).collection("stockItems").doc(itemId);

describe.skipIf(!hasEmulator)("stock repository (emulator)", () => {
  it("tracked item keeps qty = sealed*pkgSize + open through the ledger", async () => {
    const storeId = `test-stock-a-${Date.now()}`;
    const id = await createStockItem(storeId, GRANOLA, { sealed: 3, open: 200 });

    let item = await getStockItem(storeId, id);
    expect(item).toMatchObject({ sealed: 3, open: 200, qty: 1700, lowStock: false });

    // entrada of 2 packages
    await applyMovement(storeId, id, { ...mv, type: "entrada", qty: 2, byPackage: true, price: 3600 });
    item = await getStockItem(storeId, id);
    expect(item).toMatchObject({ sealed: 5, open: 200, qty: 2700 });

    // abrir pacote
    await applyMovement(storeId, id, { ...mv, type: "abertura", qty: 1, byPackage: true });
    item = await getStockItem(storeId, id);
    expect(item).toMatchObject({ sealed: 4, open: 700, qty: 2700 });

    // loose saída within open amount
    await applyMovement(storeId, id, { ...mv, type: "saida", qty: 300, byPackage: false });
    item = await getStockItem(storeId, id);
    expect(item).toMatchObject({ sealed: 4, open: 400, qty: 2400 });

    // loose saída exceeding open → auto-opens packages
    await applyMovement(storeId, id, { ...mv, type: "saida", qty: 900, byPackage: false });
    item = await getStockItem(storeId, id);
    expect(item).toMatchObject({ sealed: 3, open: 0, qty: 1500 });

    // package saída (resale)
    await applyMovement(storeId, id, { ...mv, type: "saida", qty: 1, byPackage: true });
    item = await getStockItem(storeId, id);
    expect(item).toMatchObject({ sealed: 2, open: 0, qty: 1000, lowStock: true });

    // 5 movements applied above + the opening ENTRADA createStockItem records
    // for the opening balance (sealed: 3 > 0).
    const movements = await listMovements(storeId, id);
    expect(movements).toHaveLength(6);
  });

  it("rejects overdraws", async () => {
    const storeId = `test-stock-b-${Date.now()}`;
    const id = await createStockItem(storeId, GRANOLA, { sealed: 1, open: 0 });

    await expect(
      applyMovement(storeId, id, { ...mv, type: "saida", qty: 600, byPackage: false }),
    ).rejects.toThrow("insuficiente");
    await expect(
      applyMovement(storeId, id, { ...mv, type: "saida", qty: 2, byPackage: true }),
    ).rejects.toThrow();

    // state unchanged after failed movements
    expect(await getStockItem(storeId, id)).toMatchObject({ sealed: 1, open: 0, qty: 500 });
  });

  it("untracked item uses a single loose amount", async () => {
    const storeId = `test-stock-c-${Date.now()}`;
    const id = await createStockItem(
      storeId,
      { ...GRANOLA, name: "Alface", category: "hortifruti", unit: "un", tracked: false, pkgLabel: undefined, pkgSize: undefined, reorderAt: 5 },
      { sealed: 0, open: 10 },
    );

    await applyMovement(storeId, id, { ...mv, type: "saida", qty: 6, byPackage: false });
    expect(await getStockItem(storeId, id)).toMatchObject({ qty: 4, lowStock: true });

    await expect(
      applyMovement(storeId, id, { ...mv, type: "abertura", qty: 1, byPackage: true }),
    ).rejects.toThrow();
  });

  it("updating reorder threshold re-evaluates lowStock", async () => {
    const storeId = `test-stock-d-${Date.now()}`;
    // 3 potes = 1500 g on hand; threshold 2 potes (1000 g) → not low yet.
    const id = await createStockItem(storeId, GRANOLA, { sealed: 3, open: 0 });
    expect((await getStockItem(storeId, id))?.lowStock).toBe(false);

    // Raise the threshold above what's on hand (4 potes = 2000 g > 1500 g) → low.
    await updateStockItem(storeId, id, { ...GRANOLA, reorderAt: 4 });
    expect((await getStockItem(storeId, id))?.lowStock).toBe(true);
  });

  it("a priced opening balance does NOT create a finance entry", async () => {
    const storeId = `test-stock-e-${Date.now()}`;
    const id = await createStockItem(storeId, GRANOLA, { sealed: 3, open: 0 });

    expect(await listTransactions(storeId)).toHaveLength(0);
    const [opening] = await listMovements(storeId, id);
    expect(opening.price).toBe(GRANOLA.cost);
  });

  it("a priced entrada movement does NOT create a finance entry", async () => {
    const storeId = `test-stock-f-${Date.now()}`;
    const id = await createStockItem(storeId, { ...GRANOLA, cost: undefined }, { sealed: 1, open: 0 });

    await applyMovement(storeId, id, { ...mv, type: "entrada", qty: 2, byPackage: true, price: 3600 });

    expect(await listTransactions(storeId)).toHaveLength(0);
    expect(await getStockItem(storeId, id)).toMatchObject({ sealed: 3, cost: 3600 });
  });

  it("editing a manual entrada recomputes stock without touching finance", async () => {
    const storeId = `test-stock-g-${Date.now()}`;
    const id = await createStockItem(storeId, GRANOLA, { sealed: 5, open: 0 });
    const [opening] = await listMovements(storeId, id);

    await updateMovement(storeId, id, opening.id, { qty: 3, price: 1900 });

    expect(await getStockItem(storeId, id)).toMatchObject({
      sealed: 3,
      open: 0,
      qty: 1500,
      cost: 1900,
    });

    expect(await listTransactions(storeId)).toHaveLength(0);
  });

  it("refuses to edit linked automatic movements", async () => {
    const storeId = `test-stock-h-${Date.now()}`;
    const id = await createStockItem(storeId, GRANOLA, { sealed: 3, open: 0 });

    await applyMovement(storeId, id, {
      ...mv,
      type: "saida",
      qty: 1,
      byPackage: true,
      reason: "VENDA",
      refOrder: "P123",
    });

    const sale = (await listMovements(storeId, id)).find((m) => m.refOrder === "P123");
    expect(sale).toBeDefined();

    await expect(
      updateMovement(storeId, id, sale!.id, { qty: 2 }),
    ).rejects.toThrow("somente leitura");
  });

  it("editing a manual saída replays tracked stock correctly", async () => {
    const storeId = `test-stock-i-${Date.now()}`;
    const id = await createStockItem(storeId, GRANOLA, { sealed: 2, open: 0 });

    await applyMovement(storeId, id, {
      ...mv,
      type: "saida",
      qty: 300,
      byPackage: false,
      reason: "AJUSTE",
    });

    const manualOut = (await listMovements(storeId, id)).find(
      (m) => m.type === "saida" && m.reason === "AJUSTE" && !m.refOrder && !m.refItem,
    );
    expect(manualOut).toBeDefined();

    await updateMovement(storeId, id, manualOut!.id, { qty: 700 });

    expect(await getStockItem(storeId, id)).toMatchObject({
      sealed: 0,
      open: 300,
      qty: 300,
    });
  });

  it("editing a manual saída preserves tracked opening loose stock", async () => {
    const storeId = `test-stock-i-open-${Date.now()}`;
    const id = await createStockItem(storeId, GRANOLA, { sealed: 2, open: 400 });

    await applyMovement(storeId, id, {
      ...mv,
      type: "saida",
      qty: 700,
      byPackage: false,
      reason: "AJUSTE",
    });

    const manualOut = (await listMovements(storeId, id)).find(
      (m) => m.type === "saida" && m.reason === "AJUSTE" && !m.refOrder && !m.refItem,
    );
    expect(manualOut).toBeDefined();

    await updateMovement(storeId, id, manualOut!.id, { qty: 900 });

    expect(await getStockItem(storeId, id)).toMatchObject({
      sealed: 1,
      open: 0,
      qty: 500,
    });
  });

  it("deleting a manual entrada recomputes stock and leaves finance untouched", async () => {
    const storeId = `test-stock-j-${Date.now()}`;
    const id = await createStockItem(storeId, GRANOLA, { sealed: 2, open: 0 });
    const [opening] = await listMovements(storeId, id);

    await deleteMovement(storeId, id, opening.id);

    expect(await getStockItem(storeId, id)).toMatchObject({
      sealed: 0,
      open: 0,
      qty: 0,
    });
    expect(await listTransactions(storeId)).toHaveLength(0);
  });

  it("deleting a manual entrada preserves tracked opening loose stock", async () => {
    const storeId = `test-stock-j-open-${Date.now()}`;
    const id = await createStockItem(storeId, GRANOLA, { sealed: 2, open: 400 });
    const [opening] = await listMovements(storeId, id);

    await deleteMovement(storeId, id, opening.id);

    expect(await getStockItem(storeId, id)).toMatchObject({
      sealed: 0,
      open: 400,
      qty: 400,
    });
  });

  it("editing a manual entrada preserves an import replay baseline", async () => {
    const storeId = `test-stock-j-import-${Date.now()}`;
    const id = await createStockItem(storeId, GRANOLA);
    await stockDoc(storeId, id).set(
      {
        source: "import",
        replayBaseline: { sealed: 2, open: 200, openPkg: false, usos: 0 },
        sealed: 2,
        open: 200,
        qty: 1200,
        lowStock: false,
      },
      { merge: true },
    );

    await applyMovement(storeId, id, {
      ...mv,
      type: "entrada",
      qty: 1,
      byPackage: true,
      reason: "AJUSTE",
    });

    const manualIn = (await listMovements(storeId, id)).find(
      (m) => m.type === "entrada" && m.reason === "AJUSTE" && !m.refOrder && !m.refItem,
    );
    expect(manualIn).toBeDefined();

    await updateMovement(storeId, id, manualIn!.id, { qty: 2, price: undefined });

    expect(await getStockItem(storeId, id)).toMatchObject({
      sealed: 4,
      open: 200,
      qty: 2200,
    });
  });

  it("deleting a manual entrada preserves a continuous import replay baseline", async () => {
    const storeId = `test-stock-j-import-continuo-${Date.now()}`;
    const id = await createStockItem(storeId, {
      ...GRANOLA,
      name: "Café",
      continuousUse: true,
      consumptionMode: "continuo",
    });
    await stockDoc(storeId, id).set(
      {
        source: "import",
        replayBaseline: { sealed: 3, open: 0, openPkg: true, usos: 14 },
        sealed: 3,
        open: 0,
        qty: 1500,
        openPkg: true,
        usos: 14,
        lowStock: false,
      },
      { merge: true },
    );

    await applyMovement(storeId, id, {
      ...mv,
      type: "entrada",
      qty: 1,
      byPackage: true,
      reason: "AJUSTE",
    });

    const manualIn = (await listMovements(storeId, id)).find(
      (m) => m.type === "entrada" && m.reason === "AJUSTE" && !m.refOrder && !m.refItem,
    );
    expect(manualIn).toBeDefined();

    await deleteMovement(storeId, id, manualIn!.id);

    expect(await getStockItem(storeId, id)).toMatchObject({
      sealed: 3,
      openPkg: true,
      usos: 14,
      qty: 1500,
    });
  });

  it("keeps the latest purchase cost when editing an older priced entrada", async () => {
    const storeId = `test-stock-k-${Date.now()}`;
    const id = await createStockItem(storeId, GRANOLA, { sealed: 1, open: 0 });
    await applyMovement(storeId, id, {
      ...mv,
      type: "entrada",
      qty: 2,
      byPackage: true,
      price: 3000,
    });

    const opening = (await listMovements(storeId, id)).find((m) => m.price === GRANOLA.cost);
    expect(opening).toBeDefined();

    await updateMovement(storeId, id, opening!.id, { qty: 2, price: 1500 });

    expect(await getStockItem(storeId, id)).toMatchObject({
      sealed: 4,
      qty: 2000,
      cost: 3000,
    });
  });

  it("keeps the latest purchase cost when deleting an older priced entrada", async () => {
    const storeId = `test-stock-l-${Date.now()}`;
    const id = await createStockItem(storeId, GRANOLA, { sealed: 1, open: 0 });
    await applyMovement(storeId, id, {
      ...mv,
      type: "entrada",
      qty: 2,
      byPackage: true,
      price: 3000,
    });

    const opening = (await listMovements(storeId, id)).find((m) => m.price === GRANOLA.cost);
    expect(opening).toBeDefined();

    await deleteMovement(storeId, id, opening!.id);

    expect(await getStockItem(storeId, id)).toMatchObject({
      sealed: 2,
      qty: 1000,
      cost: 3000,
    });

    expect(await listTransactions(storeId)).toHaveLength(0);
  });
  describe("adjustOpenBalance (Ajustar embalagem aberta)", () => {
    const adj = { unitLabel: "un", by: "test@selet.com" };

    it("raises the open balance and books a non-editable AJUSTE entrada of the difference", async () => {
      const storeId = `test-stock-adj-a-${Date.now()}`;
      const id = await createStockItem(storeId, COPO, { sealed: 4, open: 2 });

      const r = await adjustOpenBalance(storeId, id, { ...adj, open: 5, reason: "CONTAGEM" });
      expect(r).toEqual({ name: COPO.name, from: 2, to: 5 });

      expect(await getStockItem(storeId, id)).toMatchObject({ sealed: 4, open: 5, qty: 45, lowStock: false });
      const [last] = await listMovements(storeId, id);
      expect(last).toMatchObject({
        type: "entrada",
        qty: 3,
        byPackage: false,
        reason: "AJUSTE",
        refItem: "Contagem errada · 2 → 5 un",
      });
    });

    it("books a decrease marked Perda as a PERDA saída", async () => {
      const storeId = `test-stock-adj-b-${Date.now()}`;
      const id = await createStockItem(storeId, COPO, { sealed: 4, open: 2 });

      await adjustOpenBalance(storeId, id, { ...adj, open: 0, reason: "PERDA" });

      expect(await getStockItem(storeId, id)).toMatchObject({ sealed: 4, open: 0, qty: 40 });
      const [last] = await listMovements(storeId, id);
      expect(last).toMatchObject({ type: "saida", qty: 2, reason: "PERDA", refItem: "Perda · 2 → 0 un" });
    });

    it("works without a reason", async () => {
      const storeId = `test-stock-adj-c-${Date.now()}`;
      const id = await createStockItem(storeId, COPO, { sealed: 1, open: 6 });

      await adjustOpenBalance(storeId, id, { ...adj, open: 4 });

      const [last] = await listMovements(storeId, id);
      expect(last).toMatchObject({ type: "saida", qty: 2, reason: "AJUSTE", refItem: "Ajuste de saldo · 6 → 4 un" });
    });

    it("re-evaluates lowStock", async () => {
      const storeId = `test-stock-adj-d-${Date.now()}`;
      const id = await createStockItem(storeId, COPO, { sealed: 2, open: 0 });
      expect((await getStockItem(storeId, id))?.lowStock).toBe(true); // 20 un ≤ 2 pacotes

      await adjustOpenBalance(storeId, id, { ...adj, open: 5 });
      expect(await getStockItem(storeId, id)).toMatchObject({ qty: 25, lowStock: false });

      await adjustOpenBalance(storeId, id, { ...adj, open: 0 });
      expect(await getStockItem(storeId, id)).toMatchObject({ qty: 20, lowStock: true });
    });

    it("stays replay-safe: editing an earlier manual movement keeps the user's real count", async () => {
      const storeId = `test-stock-adj-e-${Date.now()}`;
      const id = await createStockItem(storeId, COPO, { sealed: 3, open: 0 });
      await applyMovement(storeId, id, { ...mv, type: "entrada", qty: 4, byPackage: false, reason: "AJUSTE" });
      await adjustOpenBalance(storeId, id, { ...adj, open: 7, reason: "OUTRO" });

      const movements = await listMovements(storeId, id);
      const manual = movements.find((m) => m.type === "entrada" && !m.byPackage && !m.refItem);
      expect(manual).toBeDefined();
      // The correction itself carries a refItem, so it isn't offered for editing.
      expect(movements.find((m) => m.refItem === "Outro · 4 → 7 un")).toBeDefined();

      await updateMovement(storeId, id, manual!.id, { qty: 2 });

      // The adjustment says "there are really 7 left" — that stays true whatever happened before it.
      expect(await getStockItem(storeId, id)).toMatchObject({ sealed: 3, open: 7, qty: 37 });
    });

    it("a downward adjustment stays absolute when an earlier movement is edited", async () => {
      const storeId = `test-stock-adj-h-${Date.now()}`;
      const id = await createStockItem(storeId, COPO, { sealed: 3, open: 0 });
      await applyMovement(storeId, id, { ...mv, type: "entrada", qty: 4, byPackage: false, reason: "AJUSTE" });
      await adjustOpenBalance(storeId, id, { ...adj, open: 1, reason: "PERDA" }); // 4 → 1 (saída 3)

      const manual = (await listMovements(storeId, id)).find((m) => m.type === "entrada" && !m.byPackage && !m.refItem);
      // Shrinking the earlier entrada leaves only 2 loose units before the adjustment. A relative replay would
      // auto-open a sealed package to cover the saída of 3; the user's real count (1) must win instead.
      await updateMovement(storeId, id, manual!.id, { qty: 2 });

      expect(await getStockItem(storeId, id)).toMatchObject({ sealed: 3, open: 1, qty: 31 });
    });

    it("deleting an earlier movement keeps the adjusted balance", async () => {
      const storeId = `test-stock-adj-i-${Date.now()}`;
      const id = await createStockItem(storeId, COPO, { sealed: 3, open: 0 });
      await applyMovement(storeId, id, { ...mv, type: "entrada", qty: 4, byPackage: false, reason: "AJUSTE" });
      await adjustOpenBalance(storeId, id, { ...adj, open: 1, reason: "PERDA" });

      const manual = (await listMovements(storeId, id)).find((m) => m.type === "entrada" && !m.byPackage && !m.refItem);
      await deleteMovement(storeId, id, manual!.id);

      expect(await getStockItem(storeId, id)).toMatchObject({ sealed: 3, open: 1, qty: 31 });
    });

    it("rejects invalid adjustments", async () => {
      const storeId = `test-stock-adj-f-${Date.now()}`;
      const id = await createStockItem(storeId, COPO, { sealed: 3, open: 4 });

      await expect(adjustOpenBalance(storeId, id, { ...adj, open: 4 })).rejects.toThrow(/mesmo/);
      await expect(adjustOpenBalance(storeId, id, { ...adj, open: 11 })).rejects.toThrow(/no máximo 10/);
      await expect(adjustOpenBalance(storeId, id, { ...adj, open: -1 })).rejects.toThrow(/inteiro/);
      await expect(adjustOpenBalance(storeId, id, { ...adj, open: 2.5 })).rejects.toThrow(/inteiro/);
      await expect(adjustOpenBalance(storeId, id, { ...adj, open: 6, reason: "PERDA" })).rejects.toThrow(/Perda/);
      await expect(adjustOpenBalance(storeId, "missing", { ...adj, open: 1 })).rejects.toThrow(/não encontrado/);

      // Nothing was written.
      expect(await getStockItem(storeId, id)).toMatchObject({ open: 4, qty: 34 });
      expect(await listMovements(storeId, id)).toHaveLength(1); // just the opening entrada
    });

    it("only applies to tracked, measured, per-unit items", async () => {
      const storeId = `test-stock-adj-g-${Date.now()}`;
      const loose = await createStockItem(storeId, { ...COPO, tracked: false, pkgLabel: undefined, pkgSize: undefined }, { sealed: 0, open: 8 });
      const continuo = await createStockItem(
        storeId,
        { ...COPO, name: "Pote", unit: "g", pkgSize: 500, continuousUse: true, consumptionMode: "continuo" },
        { sealed: 2, open: 0 },
      );

      await expect(adjustOpenBalance(storeId, loose, { ...adj, open: 3 })).rejects.toThrow(/não controla/);
      await expect(adjustOpenBalance(storeId, continuo, { ...adj, open: 3 })).rejects.toThrow(/não controla/);
    });
  });
});
