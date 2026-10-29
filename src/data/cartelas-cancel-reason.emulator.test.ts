import { describe, expect, it } from "vitest";
import { cancelCartela, getCartela, previewCartelaCancel } from "./cartelas";
import { createCustomer } from "./customers";
import { listOrderAudit } from "./order-audit";
import { createOrder, getOrder, setOrderPayment } from "./orders";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!hasEmulator)("cartela cancel reason (emulator)", () => {
  it("previews the money at stake and records the reason on the cartela and each cascaded order", async () => {
    const storeId = `test-cartela-reason-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Gil", tags: [] });
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Gil",
      channel: "loja",
      items: [
        {
          productId: "cartela",
          name: "Cartela · 5 usos",
          qty: 1,
          unitPrice: 26000,
          cartelaSale: { paidUses: 4, totalUses: 5, unitValue: 6500 },
        },
      ],
    });
    await setOrderPayment(storeId, orderId, true, "pix", "caixa@selet.com");
    const cartelaId = (await getOrder(storeId, orderId))!.cartelaSold[0];

    const impact = await previewCartelaCancel(storeId, cartelaId);
    expect(impact).toEqual([
      { orderId, month: expect.stringMatching(/^\d{4}-\d{2}$/), total: 26000, paid: true },
    ]);

    await cancelCartela(storeId, cartelaId, "chefe@selet.com", "cliente pediu estorno");

    const cartela = await getCartela(storeId, cartelaId);
    expect(cartela?.status).toBe("cancelada");
    const raw = (await import("@/lib/firebase-admin")).getDb().doc(`stores/${storeId}/cartelas/${cartelaId}`);
    expect((await raw.get()).data()).toMatchObject({ cancelReason: "cliente pediu estorno", cancelledBy: "chefe@selet.com" });

    const cancel = (await listOrderAudit(storeId, orderId)).find((e) => e.action === "status");
    expect(cancel).toMatchObject({
      by: "chefe@selet.com",
      reason: "cliente pediu estorno",
      cause: { kind: "cartela", cartelaId },
    });
    expect(cancel?.finance[0].amount).toBe(-26000);
  });
});
