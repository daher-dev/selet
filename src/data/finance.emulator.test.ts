import { describe, expect, it } from "vitest";
import {
  createManualTx,
  deleteManualTx,
  listTransactions,
} from "./finance";
import { createOrder, setOrderPayment } from "./orders";
import { createCustomer } from "./customers";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!hasEmulator)("finance repository (emulator)", () => {
  it("creates and deletes manual transactions", async () => {
    const storeId = `test-finance-a-${Date.now()}`;
    const id = await createManualTx(storeId, {
      label: "Compra de embalagens",
      category: "compras",
      amount: 15000,
      direction: "out",
      date: new Date().toISOString(),
    });

    let txs = await listTransactions(storeId);
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      label: "Compra de embalagens",
      amount: 15000,
      direction: "out",
      source: "manual",
    });

    await deleteManualTx(storeId, id);
    txs = await listTransactions(storeId);
    expect(txs).toHaveLength(0);
  });

  it("refuses to delete order-sourced transactions", async () => {
    const storeId = `test-finance-b-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Balcão", tags: [] });
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Balcão",
      channel: "loja",
      items: [{ productId: "p", name: "Bowl", qty: 1, unitPrice: 1000 }],
    });
    await setOrderPayment(storeId, orderId, true, "pix");

    await expect(deleteManualTx(storeId, `order-${orderId}`)).rejects.toThrow();
    expect(await listTransactions(storeId)).toHaveLength(1);
  });
});
