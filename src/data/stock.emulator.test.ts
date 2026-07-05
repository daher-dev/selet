import { describe, expect, it } from "vitest";
import {
  applyMovement,
  createStockItem,
  getStockItem,
  listMovements,
  updateStockItem,
} from "./stock";
import type { StockItemInput } from "./stock";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

const GRANOLA: StockItemInput = {
  name: "Granola",
  category: "secos",
  unit: "g",
  tracked: true,
  pkgLabel: "pote",
  pkgSize: 500,
  continuousUse: false,
  resellable: true,
  cost: 1800,
  sellPrice: 3200,
  reorderAt: 1000,
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

    const movements = await listMovements(storeId, id);
    expect(movements).toHaveLength(5);
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
    const id = await createStockItem(storeId, GRANOLA, { sealed: 3, open: 0 });
    expect((await getStockItem(storeId, id))?.lowStock).toBe(false);

    await updateStockItem(storeId, id, { ...GRANOLA, reorderAt: 2000 });
    expect((await getStockItem(storeId, id))?.lowStock).toBe(true);
  });
});
