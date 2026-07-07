import { describe, expect, it } from "vitest";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "./products";

// Runs only against the Firestore emulator (locally or in CI via
// `firebase emulators:exec`). Never against prod.
const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!hasEmulator)("products repository (emulator)", () => {
  const storeId = `test-products-${Date.now()}`;

  it("creates, reads, updates and deletes a product", async () => {
    const id = await createProduct(storeId, {
      name: "Shake Frutas Vermelhas",
      price: 3600,
      category: "shakes",
      typeTags: ["proteico"],
      description: "Morango com Baunilha e borda de Morango.",
      active: true,
      saleType: "menu",
      recipe: [
        { stockItemId: "shake-baunilha", name: "Shake Baunilha", qty: null, unit: "g" },
        { name: "Leite em pó", qty: 15, unit: "g" },
      ],
      adicionais: [{ name: "Protein Crunch", price: 500 }],
      tiers: [{ qty: 1, price: 3600 }],
      stockManaged: false,
    });

    let product = await getProduct(storeId, id);
    expect(product).toMatchObject({
      name: "Shake Frutas Vermelhas",
      price: 3600,
      category: "shakes",
      typeTags: ["proteico"],
      description: "Morango com Baunilha e borda de Morango.",
      active: true,
      saleType: "menu",
      adicionais: [{ name: "Protein Crunch", price: 500 }],
      tiers: [{ qty: 1, price: 3600 }],
    });
    // The BASE recipe round-trips, including the "sem medição" (null qty) row.
    expect(product?.recipe).toEqual([
      { stockItemId: "shake-baunilha", name: "Shake Baunilha", qty: null, unit: "g" },
      { name: "Leite em pó", qty: 15, unit: "g" },
    ]);

    await updateProduct(storeId, id, {
      name: "Shake Frutas Vermelhas G",
      price: 4200,
      category: "shakes",
      typeTags: [],
      active: false,
      saleType: "menu",
      recipe: [{ name: "Shake Baunilha", qty: null, unit: "g" }],
      adicionais: [],
      tiers: [
        { qty: 1, price: 4200 },
        { qty: 3, price: 11000 },
      ],
      stockManaged: true,
    });
    product = await getProduct(storeId, id);
    expect(product?.price).toBe(4200);
    expect(product?.active).toBe(false);
    expect(product?.stockManaged).toBe(true);
    expect(product?.tiers).toHaveLength(2);
    expect(product?.adicionais).toEqual([]);
    // description cleared on an update that omits it
    expect(product?.description).toBeUndefined();

    const all = await listProducts(storeId);
    expect(all).toHaveLength(1);

    await deleteProduct(storeId, id);
    expect(await getProduct(storeId, id)).toBeNull();
    expect(await listProducts(storeId)).toHaveLength(0);
  });

  it("scopes products by store (multi-tenant isolation)", async () => {
    const otherStore = `${storeId}-other`;
    await createProduct(storeId, {
      name: "Suco verde",
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
    expect(await listProducts(otherStore)).toHaveLength(0);
  });
});
