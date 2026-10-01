import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/firebase-admin";
import { DEFAULT_FINANCE_CATEGORIES, DEFAULT_STOCK_CATEGORIES, DEFAULT_STOCK_UNITS } from "@/lib/stock-settings";
import {
  countFinanceTxByCategory,
  countStockItemsByCategory,
  countStockItemsByUnit,
  createFinanceCategory,
  createStockCategory,
  createStockUnit,
  deleteFinanceCategory,
  deleteStockCategory,
  deleteStockUnit,
  getFinanceSettings,
  getStockSettings,
  updateFinanceCategory,
  updateStockCategory,
  updateStockUnit,
} from "./settings";
import { updateStoreProfile } from "./stores";

// Runs only against the Firestore emulator (locally or in CI via
// `firebase emulators:exec`). Never against prod.
const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!hasEmulator)("settings repository (emulator)", () => {
  const storeId = `test-settings-${Date.now()}`;
  const store = () => getDb().collection("stores").doc(storeId);
  const addItem = (id: string, category: string, unit: string) =>
    store().collection("stockItems").doc(id).set({ name: id, category, unit });

  it("reads the defaults when no settings doc exists", async () => {
    expect((await getStockSettings(storeId)).categories).toEqual(DEFAULT_STOCK_CATEGORIES);
    expect((await getStockSettings(storeId)).units).toEqual(DEFAULT_STOCK_UNITS);
    expect((await getFinanceSettings(storeId)).categories).toEqual(DEFAULT_FINANCE_CATEGORIES);
  });

  it("creates and edits a stock category, materializing the defaults with it", async () => {
    const id = await createStockCategory(storeId, { name: "Laticínios", icon: "carrot", color: "teal" });
    expect(id).toBe("laticinios");
    let s = await getStockSettings(storeId);
    expect(s.categories).toHaveLength(DEFAULT_STOCK_CATEGORIES.length + 1);

    await updateStockCategory(storeId, id, { name: "Lácteos", icon: "wheat", color: "verde" });
    s = await getStockSettings(storeId);
    expect(s.categories.find((c) => c.id === id)).toMatchObject({ name: "Lácteos", color: "verde" });

    await expect(createStockCategory(storeId, { name: "lácteos", icon: "wheat", color: "ocre" })).rejects.toThrow(
      /já existe/i,
    );
  });

  it("deletes a category only after moving its items elsewhere", async () => {
    await addItem("leite", "laticinios", "un");
    await addItem("queijo", "laticinios", "un");
    expect(await countStockItemsByCategory(storeId, ["laticinios"])).toEqual({ laticinios: 2 });

    await expect(deleteStockCategory(storeId, "laticinios")).rejects.toThrow(/mover/i);
    await expect(deleteStockCategory(storeId, "laticinios", "laticinios")).rejects.toThrow(/mover/i);
    await deleteStockCategory(storeId, "laticinios", "secos");

    expect((await getStockSettings(storeId)).categories.some((c) => c.id === "laticinios")).toBe(false);
    expect(await countStockItemsByCategory(storeId, ["secos", "laticinios"])).toEqual({ secos: 2, laticinios: 0 });
  });

  it("creates a unit, locks its kind, and blocks deleting a unit in use", async () => {
    const id = await createStockUnit(storeId, { symbol: "pç", name: "peça", plural: "peças", kind: "count" });
    await expect(createStockUnit(storeId, { symbol: "PÇ", name: "x", plural: "x", kind: "count" })).rejects.toThrow(
      /sigla/i,
    );
    await updateStockUnit(storeId, id, { symbol: "pç", name: "peça", plural: "peças!" });
    const unit = (await getStockSettings(storeId)).units.find((u) => u.id === id);
    expect(unit).toMatchObject({ plural: "peças!", kind: "count" });

    await addItem("tampa", "secos", id);
    expect(await countStockItemsByUnit(storeId, [id])).toEqual({ [id]: 1 });
    await expect(deleteStockUnit(storeId, id)).rejects.toThrow(/1 item usa/);

    await store().collection("stockItems").doc("tampa").update({ unit: "un" });
    await deleteStockUnit(storeId, id);
    expect((await getStockSettings(storeId)).units.some((u) => u.id === id)).toBe(false);
  });

  it("manages finance categories: move on delete, same direction only, Insumos protected", async () => {
    const id = await createFinanceCategory(storeId, { name: "Manutenção", direction: "out", color: "ocre" });
    await expect(createFinanceCategory(storeId, { name: "manutenção", direction: "out", color: "cinza" })).rejects.toThrow(
      /já existe/i,
    );
    // the same name is fine in the other direction
    await createFinanceCategory(storeId, { name: "Manutenção", direction: "in", color: "teal" });
    await updateFinanceCategory(storeId, id, { name: "Manutenção predial", color: "vermelho" });

    await store().collection("finance").doc("t1").set({ category: id, direction: "out", source: "manual" });
    expect(await countFinanceTxByCategory(storeId, [id])).toEqual({ [id]: 1 });
    await expect(deleteFinanceCategory(storeId, id)).rejects.toThrow(/mover/i);
    await expect(deleteFinanceCategory(storeId, id, "aportes")).rejects.toThrow(/mover/i); // wrong direction
    await deleteFinanceCategory(storeId, id, "outros");
    expect((await store().collection("finance").doc("t1").get()).data()?.category).toBe("outros");

    await expect(deleteFinanceCategory(storeId, "insumos")).rejects.toThrow(/não pode ser excluída/i);
  });

  it("updates the store profile and keeps the initial in sync", async () => {
    await store().set({ name: "Vila Velha/ES", sub: "Loja matriz", initial: "V" });
    await updateStoreProfile(storeId, {
      name: "Espaço Selet",
      address: "Av. Central, 10",
      whatsapp: "(27) 99999-0000",
      email: "",
    });
    const d = (await store().get()).data()!;
    expect(d).toMatchObject({ name: "Espaço Selet", initial: "E", address: "Av. Central, 10", whatsapp: "(27) 99999-0000" });
    expect(d.email).toBeUndefined();
  });
});
