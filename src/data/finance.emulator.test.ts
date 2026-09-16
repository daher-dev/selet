import { describe, expect, it } from "vitest";
import {
  createManualTx,
  deleteManualTx,
  listTransactions,
  updateManualTx,
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

  it("captures createdBy and note at creation, round-tripped through listTransactions", async () => {
    const storeId = `test-finance-c-${Date.now()}`;
    await createManualTx(
      storeId,
      {
        label: "Aluguel",
        category: "aluguel",
        amount: 420000,
        direction: "out",
        date: new Date().toISOString(),
        note: "Vila Velha",
      },
      "Júlia",
    );
    const [tx] = await listTransactions(storeId);
    expect(tx.createdBy).toBe("Júlia");
    expect(tx.note).toBe("Vila Velha");
  });

  it("defaults createdBy to 'sistema' when no author is given", async () => {
    const storeId = `test-finance-d-${Date.now()}`;
    await createManualTx(storeId, {
      label: "Ajuste",
      category: "outros",
      amount: 100,
      direction: "in",
      date: new Date().toISOString(),
    });
    const [tx] = await listTransactions(storeId);
    expect(tx.createdBy).toBe("sistema");
  });

  it("updates amount, direction and note in place", async () => {
    const storeId = `test-finance-e-${Date.now()}`;
    const date = new Date().toISOString();
    const id = await createManualTx(storeId, {
      label: "Aluguel",
      category: "aluguel",
      amount: 420000,
      direction: "out",
      date,
    });

    await updateManualTx(storeId, id, {
      label: "Aluguel · Vila Velha",
      category: "aluguel",
      amount: 450000,
      direction: "out",
      date,
      note: "Reajuste anual",
    });

    const [tx] = await listTransactions(storeId);
    expect(tx).toMatchObject({
      label: "Aluguel · Vila Velha",
      amount: 450000,
      direction: "out",
      note: "Reajuste anual",
    });
  });

  it("flips direction correctly (out → in)", async () => {
    const storeId = `test-finance-f-${Date.now()}`;
    const date = new Date().toISOString();
    const id = await createManualTx(storeId, {
      label: "Lançamento errado",
      category: "outros",
      amount: 5000,
      direction: "out",
      date,
    });

    await updateManualTx(storeId, id, {
      label: "Aporte do sócio",
      category: "outros",
      amount: 5000,
      direction: "in",
      date,
    });

    const [tx] = await listTransactions(storeId);
    expect(tx.direction).toBe("in");
  });

  it("refuses to update order-sourced transactions", async () => {
    const storeId = `test-finance-g-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Balcão", tags: [] });
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Balcão",
      channel: "loja",
      items: [{ productId: "p", name: "Bowl", qty: 1, unitPrice: 1000 }],
    });
    await setOrderPayment(storeId, orderId, true, "pix");

    await expect(
      updateManualTx(storeId, `order-${orderId}`, {
        label: "Hackeado",
        category: "outros",
        amount: 1,
        direction: "in",
        date: new Date().toISOString(),
      }),
    ).rejects.toThrow();
    const [tx] = await listTransactions(storeId);
    expect(tx.label).not.toBe("Hackeado");
  });
});
