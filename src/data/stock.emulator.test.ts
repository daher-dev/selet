import { describe, expect, it } from "vitest";
import {
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

const mv = { by: "test@selet.com" };

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

  it("a priced opening balance mirrors a finance doc carrying the item's stockItemId", async () => {
    const storeId = `test-stock-e-${Date.now()}`;
    const id = await createStockItem(storeId, GRANOLA, { sealed: 3, open: 0 });

    const [tx] = await listTransactions(storeId);
    expect(tx).toMatchObject({
      source: "stock",
      stockItemId: id,
      amount: GRANOLA.cost! * 3,
      direction: "out",
    });
  });

  it("a priced entrada movement mirrors a finance doc carrying the item's stockItemId", async () => {
    const storeId = `test-stock-f-${Date.now()}`;
    // No opening cost, so no mirror is created at creation time — isolates
    // the applyMovement path's own stockItemId threading.
    const id = await createStockItem(storeId, { ...GRANOLA, cost: undefined }, { sealed: 1, open: 0 });
    expect(await listTransactions(storeId)).toHaveLength(0);

    await applyMovement(storeId, id, { ...mv, type: "entrada", qty: 2, byPackage: true, price: 3600 });

    const [tx] = await listTransactions(storeId);
    expect(tx).toMatchObject({
      source: "stock",
      stockItemId: id,
      amount: 3600 * 2,
      direction: "out",
    });
  });

  it("editing a manual entrada recomputes stock and its mirrored purchase", async () => {
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

    const [tx] = await listTransactions(storeId);
    expect(tx).toMatchObject({
      source: "stock",
      stockItemId: id,
      amount: 1900 * 3,
      direction: "out",
    });
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

  it("deleting a manual entrada recomputes stock and removes its mirrored purchase", async () => {
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

    const txs = await listTransactions(storeId);
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ amount: 6000, stockItemId: id });
  });
});
