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
    const customerId = await createCustomer(storeId, { name: "Balcão", tags: [] });
    const orderId = await createOrder(storeId, {
      customerId,
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
    const customerId = await createCustomer(storeId, { name: "Balcão", tags: [] });
    const orderId = await createOrder(
      storeId,
      { customerId, customerName: "Balcão", channel: "loja", items: ITEMS },
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
    const customerId = await createCustomer(storeId, { name: "AB", tags: [] });
    await createOrder(storeId, {
      customerId, customerName: "A", channel: "loja", items: ITEMS,
    });
    await createOrder(storeId, {
      customerId, customerName: "B", channel: "loja", items: ITEMS,
    });
    const orders = await listOrders(storeId);
    expect(orders[0].customerName).toBe("B");
  });

  it("computes and persists a server-computed discount amount, ignoring any client-sent one", async () => {
    const storeId = `test-orders-discount-a-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Discount Co", tags: [] });
    // A bogus client-sent `amount` must never be trusted — the server always
    // recomputes it from kind/value against the order's own items.
    const spoofedDiscount = { kind: "percent", value: 15, amount: 999999 };
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Discount Co",
      channel: "loja",
      items: ITEMS, // total 7200
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      discount: spoofedDiscount as any,
    });
    const order = await getOrder(storeId, orderId);
    // 15% of 7200 = 1080 — never the spoofed 999999.
    expect(order?.discount).toMatchObject({ kind: "percent", value: 15, amount: 1080 });
    expect(order?.total).toBe(7200 - 1080);
  });

  it("updateOrder discount round-trip: recomputes on change, and omitting it clears a previous discount (ignoreUndefinedProperties regression)", async () => {
    const storeId = `test-orders-discount-b-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Ana Desc", tags: [] });
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Ana Desc",
      channel: "loja",
      items: ITEMS, // total 7200
      discount: { kind: "flat", value: 500 },
    });
    let order = await getOrder(storeId, orderId);
    expect(order?.discount).toMatchObject({ kind: "flat", value: 500, amount: 500 });
    expect(order?.total).toBe(6700);

    // Change kind — amount is recomputed, not carried over.
    await updateOrder(storeId, orderId, {
      customerId,
      customerName: "Ana Desc",
      channel: "loja",
      items: ITEMS,
      discount: { kind: "percent", value: 10 },
    });
    order = await getOrder(storeId, orderId);
    expect(order?.discount).toMatchObject({ kind: "percent", value: 10, amount: 720 });
    expect(order?.total).toBe(6480);

    // Omitting `discount` on update is Firestore's ignoreUndefinedProperties
    // trap: a naive `tx.update(ref, {...input})` would SILENTLY KEEP the old
    // stored discount instead of clearing it. It must actually clear.
    await updateOrder(storeId, orderId, {
      customerId,
      customerName: "Ana Desc",
      channel: "loja",
      items: ITEMS,
    });
    order = await getOrder(storeId, orderId);
    expect(order?.discount).toBeNull();
    expect(order?.total).toBe(7200);
  });

  it("notes round-trip: trims on write, and omitting notes on update clears a previous one", async () => {
    const storeId = `test-orders-notes-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Nina", tags: [] });
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Nina",
      channel: "loja",
      items: ITEMS,
      notes: "  Sem gelo, entregar às 15h  ",
    });
    let order = await getOrder(storeId, orderId);
    expect(order?.notes).toBe("Sem gelo, entregar às 15h");

    await updateOrder(storeId, orderId, {
      customerId,
      customerName: "Nina",
      channel: "loja",
      items: ITEMS,
    });
    order = await getOrder(storeId, orderId);
    expect(order?.notes).toBeUndefined();
  });

  it("createOrder rejects paid:true when a full discount makes the total zero", async () => {
    const storeId = `test-orders-zero-create-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Zero", tags: [] });
    await expect(
      createOrder(
        storeId,
        {
          customerId,
          customerName: "Zero",
          channel: "loja",
          items: ITEMS,
          discount: { kind: "free", value: 0 },
        },
        { paid: true, payMethod: "pix" },
      ),
    ).rejects.toThrow();
  });

  it("setOrderPayment rejects marking a zero-total (fully discounted) order as paid", async () => {
    const storeId = `test-orders-zero-pay-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Grátis", tags: [] });
    // "interno" is a real channel now — exercised here incidentally.
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Grátis",
      channel: "interno",
      items: ITEMS,
      discount: { kind: "free", value: 0, reason: "cortesia" },
    });
    const order = await getOrder(storeId, orderId);
    expect(order?.total).toBe(0);
    expect(order?.channel).toBe("interno");
    await expect(setOrderPayment(storeId, orderId, true, "pix")).rejects.toThrow();
  });

  it("a backdated createdAt lands the order doc AND (when paid) the finance mirror in the right month", async () => {
    const storeId = `test-orders-backdate-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Retro", tags: [] });
    const backdated = new Date();
    backdated.setMonth(backdated.getMonth() - 3);

    const orderId = await createOrder(
      storeId,
      {
        customerId,
        customerName: "Retro",
        channel: "loja",
        items: ITEMS,
        createdAt: backdated.toISOString(),
      },
      { paid: true, payMethod: "dinheiro" },
    );

    const order = await getOrder(storeId, orderId);
    const orderCreatedAt = new Date(order!.createdAt);
    expect(orderCreatedAt.getFullYear()).toBe(backdated.getFullYear());
    expect(orderCreatedAt.getMonth()).toBe(backdated.getMonth());

    const mirror = await financeDoc(storeId, orderId);
    const mirrorDate = (
      mirror!.date as unknown as { toDate: () => Date }
    ).toDate();
    expect(mirrorDate.getFullYear()).toBe(backdated.getFullYear());
    expect(mirrorDate.getMonth()).toBe(backdated.getMonth());
  });

  it("updateOrder can move an order's createdAt to a different month", async () => {
    const storeId = `test-orders-move-date-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Move", tags: [] });
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Move",
      channel: "loja",
      items: ITEMS,
    });
    const original = await getOrder(storeId, orderId);

    const moved = new Date();
    moved.setMonth(moved.getMonth() - 2);
    await updateOrder(storeId, orderId, {
      customerId,
      customerName: "Move",
      channel: "loja",
      items: ITEMS,
      createdAt: moved.toISOString(),
    });

    const updated = await getOrder(storeId, orderId);
    expect(updated?.createdAt).not.toBe(original?.createdAt);
    const updatedDate = new Date(updated!.createdAt);
    expect(updatedDate.getFullYear()).toBe(moved.getFullYear());
    expect(updatedDate.getMonth()).toBe(moved.getMonth());
  });

  it("updateOrder demotes a paid order to unpaid and clears the finance mirror when a discount zeroes the total", async () => {
    const storeId = `test-orders-demote-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Demote", tags: [] });
    const orderId = await createOrder(
      storeId,
      { customerId, customerName: "Demote", channel: "loja", items: ITEMS },
      { paid: true, payMethod: "pix" },
    );
    expect(await financeDoc(storeId, orderId)).not.toBeNull();

    await updateOrder(storeId, orderId, {
      customerId,
      customerName: "Demote",
      channel: "loja",
      items: ITEMS,
      discount: { kind: "free", value: 0, reason: "erro-preparo" },
    });

    const order = await getOrder(storeId, orderId);
    expect(order?.total).toBe(0);
    expect(order?.paid).toBe(false);
    expect(order?.payMethod).toBeNull();
    expect(await financeDoc(storeId, orderId)).toBeNull();
  });
});
