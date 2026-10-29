import { describe, expect, it } from "vitest";
import { createCustomer } from "./customers";
import { createOrder, getOrder, setOrderStatus } from "./orders";
import { createProduct } from "./products";
import { createStockItem, getStockItem } from "./stock";
import type { StockItemInput } from "./stock";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

const DRINK: StockItemInput = {
  name: "Beauty Drink",
  category: "secos",
  unit: "sache",
  tracked: true,
  pkgLabel: "caixa",
  pkgSize: 30,
  continuousUse: false,
  consumptionMode: "medido",
  resellable: true,
  reorderAt: 1,
};

async function setup(storeId: string) {
  const stockId = await createStockItem(storeId, DRINK, { sealed: 5, open: 0 });
  const productId = await createProduct(storeId, {
    name: "Beauty Drink",
    category: "bebidas",
    typeTags: [],
    active: true,
    // One record, two offers: a dose from the open box, or a whole box.
    sale: { recipe: [{ stockItemId: stockId, name: "Beauty Drink", qty: 1, unit: "sache" }], adicionais: [], tiers: [{ qty: 1, price: 2000 }] },
    resale: { insumoId: stockId, tiers: [{ qty: 1, price: 50000 }], commissionPercent: 10 },
  });
  const customerId = await createCustomer(storeId, { name: "Ana", tags: [] });
  const line = (offer: "sale" | "resale", qty = 1) => ({
    customerId,
    customerName: "Ana",
    channel: "loja" as const,
    items: [{ productId, name: "Beauty Drink", qty, unitPrice: offer === "resale" ? 50000 : 2000, offer }],
  });
  return { stockId, productId, line };
}

describe.skipIf(!hasEmulator)("resale vs sale stock debit (emulator)", () => {
  it("a resale line debits whole sealed packages and cancel/uncancel restore them", async () => {
    const storeId = `test-resale-${Date.now()}`;
    const { stockId, line } = await setup(storeId);

    const orderId = await createOrder(storeId, line("resale", 2));
    let item = await getStockItem(storeId, stockId);
    expect(item?.sealed).toBe(3);
    expect(item?.open).toBe(0); // never opened a box
    expect((await getOrder(storeId, orderId))?.stockConsumed[0].packages).toBe(2);

    await setOrderStatus(storeId, orderId, "cancelado");
    item = await getStockItem(storeId, stockId);
    expect(item?.sealed).toBe(5);

    await setOrderStatus(storeId, orderId, "concluido");
    expect((await getStockItem(storeId, stockId))?.sealed).toBe(3);
  });

  it("a sale line of the same product draws a portion from the open package", async () => {
    const storeId = `test-sale-${Date.now()}`;
    const { stockId, line } = await setup(storeId);

    await createOrder(storeId, line("sale", 2));
    const item = await getStockItem(storeId, stockId);
    expect(item?.sealed).toBe(4); // opened one box…
    expect(item?.open).toBe(28); // …and took two sachês from it
  });

  it("only the resale line earns commission", async () => {
    const storeId = `test-offer-comm-${Date.now()}`;
    const { productId, line } = await setup(storeId);
    const resale = await createOrder(storeId, line("resale"));
    const sale = await createOrder(storeId, line("sale"));
    const a = (await getOrder(storeId, resale))?.items[0];
    const b = (await getOrder(storeId, sale))?.items[0];
    expect([a?.productId, a?.commissionPercent, a?.saleType]).toEqual([productId, 10, "revenda"]);
    expect([b?.commissionPercent, b?.saleType]).toEqual([0, "menu"]);
  });
});
