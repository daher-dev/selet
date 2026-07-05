import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/firebase-admin";
import { createCustomer, getCustomer } from "./customers";
import {
  createOrder,
  getOrder,
  listOrders,
  setOrderPayment,
  setOrderStatus,
  updateOrder,
} from "./orders";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

const ITEMS = [
  { productId: "p1", name: "Bowl", qty: 2, unitPrice: 3000 },
  { productId: "p2", name: "Suco", qty: 1, unitPrice: 1200 },
]; // total 7200

async function financeDoc(storeId: string, orderId: string) {
  const snap = await getDb()
    .doc(`stores/${storeId}/finance/order-${orderId}`)
    .get();
  return snap.exists ? snap.data()! : null;
}

describe.skipIf(!hasEmulator)("orders repository (emulator)", () => {
  it("creates an order and updates customer aggregates", async () => {
    const storeId = `test-orders-a-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Maria", tags: [] });

    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Maria",
      channel: "whatsapp",
      items: ITEMS,
    });

    const order = await getOrder(storeId, orderId);
    expect(order).toMatchObject({
      total: 7200,
      status: "novo",
      paid: false,
      payMethod: null,
    });

    const customer = await getCustomer(storeId, customerId);
    expect(customer?.orderCount).toBe(1);
    expect(customer?.totalSpent).toBe(7200);
    expect(customer?.lastOrderAt).toBeTruthy();
  });

  it("cancel removes from aggregates; reopen restores", async () => {
    const storeId = `test-orders-b-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "João", tags: [] });
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "João",
      channel: "loja",
      items: ITEMS,
    });

    await setOrderStatus(storeId, orderId, "cancelado");
    let customer = await getCustomer(storeId, customerId);
    expect(customer?.orderCount).toBe(0);
    expect(customer?.totalSpent).toBe(0);

    await setOrderStatus(storeId, orderId, "novo");
    customer = await getCustomer(storeId, customerId);
    expect(customer?.orderCount).toBe(1);
    expect(customer?.totalSpent).toBe(7200);
  });

  it("paid toggle creates/deletes exactly one finance doc (idempotent)", async () => {
    const storeId = `test-orders-c-${Date.now()}`;
    const orderId = await createOrder(storeId, {
      customerId: null,
      customerName: "Balcão",
      channel: "loja",
      items: ITEMS,
    });

    await setOrderPayment(storeId, orderId, true, "pix");
    await setOrderPayment(storeId, orderId, true, "pix"); // repeat: no dup
    let tx = await financeDoc(storeId, orderId);
    expect(tx).toMatchObject({
      amount: 7200,
      direction: "in",
      source: "order",
      payMethod: "pix",
    });
    const all = await getDb().collection(`stores/${storeId}/finance`).get();
    expect(all.size).toBe(1);

    await setOrderPayment(storeId, orderId, false, null);
    tx = await financeDoc(storeId, orderId);
    expect(tx).toBeNull();
    expect((await getOrder(storeId, orderId))?.payMethod).toBeNull();
  });

  it("creating a paid order writes the finance doc in the same transaction", async () => {
    const storeId = `test-orders-d-${Date.now()}`;
    const orderId = await createOrder(
      storeId,
      { customerId: null, customerName: "Balcão", channel: "loja", items: ITEMS },
      { paid: true, payMethod: "dinheiro" },
    );
    expect(await financeDoc(storeId, orderId)).toMatchObject({ amount: 7200 });
  });

  it("editing items updates total, aggregates and the finance mirror", async () => {
    const storeId = `test-orders-e-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Ana", tags: [] });
    const orderId = await createOrder(
      storeId,
      { customerId, customerName: "Ana", channel: "instagram", items: ITEMS },
      { paid: true, payMethod: "pix" },
    );

    await updateOrder(storeId, orderId, {
      customerId,
      customerName: "Ana",
      channel: "instagram",
      items: [{ productId: "p1", name: "Bowl", qty: 1, unitPrice: 3000 }],
    });

    expect((await getOrder(storeId, orderId))?.total).toBe(3000);
    expect((await getCustomer(storeId, customerId))?.totalSpent).toBe(3000);
    expect(await financeDoc(storeId, orderId)).toMatchObject({ amount: 3000 });
  });

  it("computes avgReorderDays from first/last order span", async () => {
    const storeId = `test-orders-f-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Bia", tags: [] });
    await createOrder(storeId, {
      customerId, customerName: "Bia", channel: "loja", items: ITEMS,
    });
    await createOrder(storeId, {
      customerId, customerName: "Bia", channel: "loja", items: ITEMS,
    });
    const customer = await getCustomer(storeId, customerId);
    expect(customer?.orderCount).toBe(2);
    // Two orders seconds apart → avg is ~0 days but must be a number now.
    expect(customer?.avgReorderDays).not.toBeNull();
  });

  it("lists orders newest first", async () => {
    const storeId = `test-orders-g-${Date.now()}`;
    await createOrder(storeId, {
      customerId: null, customerName: "A", channel: "loja", items: ITEMS,
    });
    await createOrder(storeId, {
      customerId: null, customerName: "B", channel: "loja", items: ITEMS,
    });
    const orders = await listOrders(storeId);
    expect(orders[0].customerName).toBe("B");
  });
});
