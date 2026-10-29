import { describe, expect, it } from "vitest";
import { createCustomer } from "./customers";
import { listOrderAudit } from "./order-audit";
import { createOrder, setOrderPayment, setOrderStatus, updateOrder } from "./orders";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

const ITEMS = [{ productId: "p1", name: "Bowl", qty: 2, unitPrice: 3000 }]; // 6000

describe.skipIf(!hasEmulator)("order audit trail (emulator)", () => {
  it("records who/what/when and the money impact of every change", async () => {
    const storeId = `test-audit-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Maria", tags: [] });
    const orderId = await createOrder(
      storeId,
      { customerId, customerName: "Maria", channel: "loja", items: ITEMS },
      { paid: true, payMethod: "pix" },
      "ana@selet.com",
    );
    await updateOrder(
      storeId,
      orderId,
      { customerId, customerName: "Maria", channel: "loja", items: [{ ...ITEMS[0], qty: 3 }] },
      "bia@selet.com",
    );
    await setOrderStatus(storeId, orderId, "cancelado", "caio@selet.com", { reason: "cliente desistiu" });
    await setOrderPayment(storeId, orderId, false, null, "dani@selet.com");

    const log = (await listOrderAudit(storeId, orderId)).reverse();
    expect(log.map((e) => [e.action, e.by])).toEqual([
      ["created", "ana@selet.com"],
      ["edited", "bia@selet.com"],
      ["status", "caio@selet.com"],
      ["payment", "dani@selet.com"],
    ]);
    expect(log[0].finance[0].amount).toBe(6000);
    expect(log[1].changes.map((c) => c.field)).toEqual(expect.arrayContaining(["total", "items"]));
    expect(log[1].finance[0].amount).toBe(3000);
    expect(log[2]).toMatchObject({ reason: "cliente desistiu", changes: [{ field: "status", to: "cancelado" }] });
    expect(log[2].finance[0].amount).toBe(-9000);
  });

  it("does not log a status write that changes nothing", async () => {
    const storeId = `test-audit-noop-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Maria", tags: [] });
    const orderId = await createOrder(storeId, { customerId, customerName: "Maria", channel: "loja", items: ITEMS });
    const before = (await listOrderAudit(storeId, orderId)).length;
    await setOrderStatus(storeId, orderId, "concluido", "ana@selet.com");
    expect((await listOrderAudit(storeId, orderId)).length).toBe(before);
  });
});
