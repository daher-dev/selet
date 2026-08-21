import { describe, expect, it } from "vitest";
import {
  addPudimBrindes,
  createPudimBase,
  createPudimFlavor,
  createPudimMixin,
  createPudimUtensil,
  getPudimFlavor,
  listPudimBases,
  listPudimBrindes,
  listPudimFlavors,
  listPudimMixins,
  listPudimUtensils,
  loadPudimCatalogsForItems,
  setPudimBrindeArchived,
  updatePudimBase,
  updatePudimFlavor,
  updatePudimMixin,
  updatePudimUtensil,
} from "./pudim";
import { createProduct } from "./products";
import { createStockItem } from "./stock";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

async function seedInsumo(storeId: string, name: string) {
  return createStockItem(
    storeId,
    {
      name,
      category: "secos",
      unit: "g",
      tracked: false,
      continuousUse: false,
      consumptionMode: "medido",
      resellable: false,
      reorderAt: 10,
    },
    { sealed: 0, open: 1000 },
  );
}

describe.skipIf(!hasEmulator)("pudim repository (emulator)", () => {
  it("creates, reads, and updates a flavor, round-tripping its recipe", async () => {
    const storeId = `test-pudim-flavor-${Date.now()}`;
    const insumoId = await seedInsumo(storeId, "Shake Banana");

    const id = await createPudimFlavor(storeId, {
      name: "Frutas Amarelas",
      price: 3200,
      recipe: [{ stockItemId: insumoId, name: "Shake Banana", qty: 26 }],
    });

    let flavor = await getPudimFlavor(storeId, id);
    expect(flavor).toMatchObject({
      name: "Frutas Amarelas",
      price: 3200,
      archived: false,
      recipe: [{ stockItemId: insumoId, name: "Shake Banana", qty: 26, unit: "g" }],
    });

    await updatePudimFlavor(storeId, id, {
      name: "Frutas Amarelas (revisado)",
      price: 3400,
      recipe: [{ stockItemId: insumoId, name: "Shake Banana", qty: 30 }],
    });
    flavor = await getPudimFlavor(storeId, id);
    expect(flavor).toMatchObject({ name: "Frutas Amarelas (revisado)", price: 3400 });
    expect(flavor?.recipe[0].qty).toBe(30);
  });

  it("derive-don't-trust: a client-supplied name/unit is ignored, re-resolved from the live StockItem", async () => {
    const storeId = `test-pudim-derive-${Date.now()}`;
    const insumoId = await seedInsumo(storeId, "Fibra de Manga");

    const id = await createPudimFlavor(storeId, {
      name: "Ovomaltine",
      price: 3400,
      // Deliberately wrong name/unit — the server must ignore both.
      recipe: [{ stockItemId: insumoId, name: "NOME ERRADO", qty: 5, unit: "kg" }],
    });
    const flavor = await getPudimFlavor(storeId, id);
    expect(flavor?.recipe[0]).toMatchObject({ name: "Fibra de Manga", unit: "g" });
  });

  it("archiving a flavor flips `archived` and excludes it from listPudimFlavors' default view semantics", async () => {
    const storeId = `test-pudim-archive-${Date.now()}`;
    const insumoId = await seedInsumo(storeId, "Shake Chocolate");
    const id = await createPudimFlavor(storeId, {
      name: "Chocolate",
      price: 3000,
      recipe: [{ stockItemId: insumoId, name: "Shake Chocolate", qty: 26 }],
    });

    await updatePudimFlavor(storeId, id, {
      name: "Chocolate",
      price: 3000,
      recipe: [{ stockItemId: insumoId, name: "Shake Chocolate", qty: 26 }],
      archived: true,
    });

    const all = await listPudimFlavors(storeId);
    const found = all.find((f) => f.id === id);
    // listPudimFlavors returns everything (archived filtering happens in the UI/page
    // layer, same as Shakes) — but the archived flag itself must persist.
    expect(found?.archived).toBe(true);
    // Still retrievable directly.
    expect((await getPudimFlavor(storeId, id))?.archived).toBe(true);

    await updatePudimFlavor(storeId, id, {
      name: "Chocolate",
      price: 3000,
      recipe: [{ stockItemId: insumoId, name: "Shake Chocolate", qty: 26 }],
      archived: false,
    });
    expect((await getPudimFlavor(storeId, id))?.archived).toBe(false);
  });

  it("creates/updates a base, mixin, and utensil, each resolving their insumo server-side", async () => {
    const storeId = `test-pudim-modifiers-${Date.now()}`;
    const leiteInsumo = await seedInsumo(storeId, "Leite integral");
    const fibraInsumo = await seedInsumo(storeId, "Fibra Ativa");
    const copoInsumo = await seedInsumo(storeId, "Copo 500ml");

    const baseId = await createPudimBase(storeId, {
      name: "Leite",
      insumo: { stockItemId: leiteInsumo, qty: 300 },
      price: 0,
    });
    await updatePudimBase(storeId, baseId, {
      name: "Leite",
      insumo: { stockItemId: leiteInsumo, qty: 300 },
      price: 200,
    });
    const bases = await listPudimBases(storeId);
    expect(bases.find((b) => b.id === baseId)).toMatchObject({ price: 200 });

    const mixinId = await createPudimMixin(storeId, {
      name: "Fibra Ativa",
      insumo: { stockItemId: fibraInsumo, qty: 1 },
      tiers: [{ qty: 1, price: 500 }, { qty: 2, price: 800 }],
    });
    await updatePudimMixin(storeId, mixinId, {
      name: "Fibra Ativa",
      insumo: { stockItemId: fibraInsumo, qty: 1 },
      tiers: [{ qty: 1, price: 500 }, { qty: 2, price: 900 }],
    });
    const mixins = await listPudimMixins(storeId);
    expect(mixins.find((m) => m.id === mixinId)?.tiers).toEqual([
      { qty: 1, price: 500 },
      { qty: 2, price: 900 },
    ]);

    const utensilId = await createPudimUtensil(storeId, {
      name: "Copo 500 ml",
      insumo: { stockItemId: copoInsumo, qty: 1 },
      defaultIncluded: true,
    });
    await updatePudimUtensil(storeId, utensilId, {
      name: "Copo 500 ml",
      insumo: { stockItemId: copoInsumo, qty: 1 },
      defaultIncluded: false,
    });
    const utensils = await listPudimUtensils(storeId);
    expect(utensils.find((u) => u.id === utensilId)?.defaultIncluded).toBe(false);
  });

  it("addPudimBrindes rejects a missing, inactive, or 'adicional' product; accepts a valid one", async () => {
    const storeId = `test-pudim-brindes-${Date.now()}`;
    const activeProduct = await createProduct(storeId, {
      name: "Chá Limão",
      price: 1200,
      category: "bebidas",
      typeTags: [],
      active: true,
      saleType: "menu",
      recipe: [],
      adicionais: [],
      tiers: [{ qty: 1, price: 1200 }],
      stockManaged: false,
    });
    const inactiveProduct = await createProduct(storeId, {
      name: "Chá Descontinuado",
      price: 1200,
      category: "bebidas",
      typeTags: [],
      active: false,
      saleType: "menu",
      recipe: [],
      adicionais: [],
      tiers: [{ qty: 1, price: 1200 }],
      stockManaged: false,
    });
    const adicionalProduct = await createProduct(storeId, {
      name: "Calda extra",
      price: 300,
      category: "adicionais",
      typeTags: [],
      active: true,
      saleType: "adicional",
      recipe: [],
      adicionais: [],
      tiers: [{ qty: 1, price: 300 }],
      stockManaged: false,
    });

    const count = await addPudimBrindes(storeId, [
      activeProduct,
      inactiveProduct,
      adicionalProduct,
      "does-not-exist",
    ]);
    expect(count).toBe(1);

    const brindes = await listPudimBrindes(storeId);
    expect(brindes.map((b) => b.productId)).toEqual([activeProduct]);
    expect(brindes[0].archived).toBe(false);

    await setPudimBrindeArchived(storeId, activeProduct, true);
    expect((await listPudimBrindes(storeId)).find((b) => b.productId === activeProduct)?.archived).toBe(
      true,
    );
  });

  it("loadPudimCatalogsForItems only fetches catalog entries actually referenced by the given items", async () => {
    const storeId = `test-pudim-catalogs-${Date.now()}`;
    const insumoId = await seedInsumo(storeId, "Shake Banana");
    const referencedFlavor = await createPudimFlavor(storeId, {
      name: "Referenciado",
      price: 3200,
      recipe: [{ stockItemId: insumoId, name: "Shake Banana", qty: 26 }],
    });
    const unreferencedFlavor = await createPudimFlavor(storeId, {
      name: "Não referenciado",
      price: 3200,
      recipe: [{ stockItemId: insumoId, name: "Shake Banana", qty: 26 }],
    });
    const utensilId = await createPudimUtensil(storeId, {
      name: "Copo",
      insumo: { stockItemId: insumoId, qty: 1 },
      defaultIncluded: true,
    });

    const catalogs = await loadPudimCatalogsForItems(storeId, [
      {
        productId: referencedFlavor,
        name: "Pudim",
        qty: 1,
        unitPrice: 3200,
        pudim: { flavorId: referencedFlavor, baseId: null, mixins: [] },
      },
    ]);

    expect(catalogs.flavors.has(referencedFlavor)).toBe(true);
    expect(catalogs.flavors.has(unreferencedFlavor)).toBe(false);
    // Utensílios are always fully loaded (store-wide defaults apply to every line).
    expect(catalogs.utensils.map((u) => u.id)).toContain(utensilId);
  });
});
