import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/firebase-admin";
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
    sale: {
      recipe: [{ stockItemId: stockId, name: "Beauty Drink", qty: 1, unit: "sache" }],
      adicionais: [],
      tiers: [{ qty: 1, price: 2000 }],
      commissionPercent: 5,
    },
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

  it("each offer stamps and accrues its OWN commission rate", async () => {
    const storeId = `test-offer-comm-${Date.now()}`;
    const { productId, line } = await setup(storeId);
    const seller = { sellerEmail: "vend@selet.com", sellerName: "Vendedora" };
    const resale = await createOrder(storeId, { ...line("resale"), ...seller }, { paid: true, payMethod: "pix" });
    const sale = await createOrder(storeId, { ...line("sale"), ...seller }, { paid: true, payMethod: "pix" });

    const a = (await getOrder(storeId, resale))?.items[0];
    const b = (await getOrder(storeId, sale))?.items[0];
    expect([a?.productId, a?.commissionPercent, a?.saleType]).toEqual([productId, 10, "revenda"]);
    expect([b?.commissionPercent, b?.saleType]).toEqual([5, "menu"]);

    const mirror = async (id: string) =>
      (await getDb().doc(`stores/${storeId}/finance/order-${id}`).get()).data();
    expect((await mirror(resale))?.commission?.amount).toBe(5000); // 10% of R$ 500,00
    expect((await mirror(sale))?.commission?.amount).toBe(100); // 5% of R$ 20,00
  });

  it("an offer without commission accrues none even when the other offer has one", async () => {
    const storeId = `test-offer-nocomm-${Date.now()}`;
    const stockId = await createStockItem(storeId, DRINK, { sealed: 5, open: 0 });
    const productId = await createProduct(storeId, {
      name: "Água",
      category: "bebidas",
      typeTags: [],
      active: true,
      sale: { recipe: [{ stockItemId: stockId, name: "Água", qty: 1, unit: "sache" }], adicionais: [], tiers: [{ qty: 1, price: 1000 }] },
      resale: { insumoId: stockId, tiers: [{ qty: 1, price: 30000 }], commissionPercent: 10 },
    });
    const customerId = await createCustomer(storeId, { name: "Ana", tags: [] });
    const id = await createOrder(
      storeId,
      {
        customerId,
        customerName: "Ana",
        channel: "loja",
        sellerEmail: "vend@selet.com",
        sellerName: "Vendedora",
        items: [{ productId, name: "Água", qty: 1, unitPrice: 1000, offer: "sale" }],
      },
      { paid: true, payMethod: "pix" },
    );
    expect((await getOrder(storeId, id))?.items[0].commissionPercent).toBe(0);
    expect((await getDb().doc(`stores/${storeId}/finance/order-${id}`).get()).data()?.commission).toBeUndefined();
  });
});
