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
      name: "Bowl de frango",
      price: 2990,
      category: "bowls",
      typeTags: ["proteico"],
      active: true,
    });

    let product = await getProduct(storeId, id);
    expect(product).toMatchObject({
      name: "Bowl de frango",
      price: 2990,
      category: "bowls",
      typeTags: ["proteico"],
      active: true,
    });

    await updateProduct(storeId, id, {
      name: "Bowl de frango grande",
      price: 3490,
      category: "bowls",
      typeTags: [],
      active: false,
    });
    product = await getProduct(storeId, id);
    expect(product?.price).toBe(3490);
    expect(product?.active).toBe(false);

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
    });
    expect(await listProducts(otherStore)).toHaveLength(0);
  });
});
