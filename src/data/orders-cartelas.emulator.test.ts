import { describe, expect, it } from "vitest";
import { getCartela } from "./cartelas";
import { createCustomer } from "./customers";
import { createOrder, getOrder, setOrderStatus, updateOrder } from "./orders";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

/** Sells a fresh cartela via a one-line order; returns both ids. */
async function sellCartela(
  storeId: string,
  customerId: string,
  customerName: string,
  input: { paidUses: number; unitValue: number },
) {
  const totalUses = input.paidUses + 1;
  const orderId = await createOrder(storeId, {
    customerId,
    customerName,
    channel: "loja",
    items: [
      {
        productId: "cartela",
        name: `Cartela · ${totalUses} usos`,
        qty: 1,
        unitPrice: input.paidUses * input.unitValue,
        cartelaSale: { paidUses: input.paidUses, totalUses, unitValue: input.unitValue },
      },
    ],
  });
  const order = await getOrder(storeId, orderId);
  const cartelaId = order!.cartelaSold[0];
  return { orderId, cartelaId };
}

/** One "punch" line applying `uses` punches of a cartela against a product priced at `listPrice`/unit. */
function punchLine(
  cartelaId: string,
  code: string,
  qty: number,
  listPrice: number,
  unitValue: number,
) {
  const covered = unitValue; // caller is expected to only call this when listPrice >= unitValue
  return {
    productId: "waffle-nutella",
    name: "Waffle Nutella",
    qty,
    unitPrice: listPrice - covered,
    cartelaUse: { cartelaId, code, uses: qty, covered, listPrice },
  };
}

describe.skipIf(!hasEmulator)("orders repository · cartela lines (emulator)", () => {
  it("sells a cartela (paidUses+1 total, no stock draw) and lists it under the buyer", async () => {
    const storeId = `test-orders-cartela-sell-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Mariana", tags: [] });

    const { orderId, cartelaId } = await sellCartela(storeId, customerId, "Mariana", {
      paidUses: 2,
      unitValue: 3000,
    });

    const order = await getOrder(storeId, orderId);
    expect(order?.total).toBe(6000);
    expect(order?.stockConsumed).toEqual([]);
    expect(order?.cartelaSold).toEqual([cartelaId]);
    expect(order?.cartelaConsumed).toEqual([]);

    const cartela = await getCartela(storeId, cartelaId);
    expect(cartela).toMatchObject({
      customerId,
      customerName: "Mariana",
      paidUses: 2,
      totalUses: 3,
      unitValue: 3000,
      amount: 6000,
      uses: [],
      status: "ativa",
      soldOnOrderId: orderId,
    });
  });

  it("punching a cartela consumes the brinde first, and editing the punch count nets the diff correctly", async () => {
    const storeId = `test-orders-cartela-punch-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Beatriz", tags: [] });
    const { cartelaId } = await sellCartela(storeId, customerId, "Beatriz", {
      paidUses: 2,
      unitValue: 3000,
    });
    const cartela0 = await getCartela(storeId, cartelaId);
    const code = cartela0!.code;

    // Punch once (the brinde, unitPrice net of the covered amount).
    const punchOrderId = await createOrder(storeId, {
      customerId,
      customerName: "Beatriz",
      channel: "loja",
      items: [punchLine(cartelaId, code, 1, 3500, 3000)],
    });
    const punchOrder1 = await getOrder(storeId, punchOrderId);
    expect(punchOrder1?.total).toBe(500);
    expect(punchOrder1?.cartelaConsumed).toEqual([{ cartelaId, uses: 1 }]);

    let cartela = await getCartela(storeId, cartelaId);
    expect(cartela?.uses).toHaveLength(1);
    expect(cartela?.uses[0]).toMatchObject({
      orderId: punchOrderId,
      orderCode: punchOrder1?.code,
      productName: "Waffle Nutella",
    });
    expect(cartela?.status).toBe("ativa");

    // Edit the same order up to 2 punches — reverse-then-reapply must net to
    // exactly 2 held uses, not 3 (mirrors the shake "swap the Borda" test).
    await updateOrder(storeId, punchOrderId, {
      customerId,
      customerName: "Beatriz",
      channel: "loja",
      items: [punchLine(cartelaId, code, 2, 3500, 3000)],
    });
    const punchOrder2 = await getOrder(storeId, punchOrderId);
    expect(punchOrder2?.cartelaConsumed).toEqual([{ cartelaId, uses: 2 }]);

    cartela = await getCartela(storeId, cartelaId);
    expect(cartela?.uses).toHaveLength(2);
    expect(cartela?.status).toBe("ativa"); // 1 of 3 uses remains
  });

  it("cancelling a punch order returns its punches, and uncancelling reapplies them", async () => {
    const storeId = `test-orders-cartela-cancel-punch-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Carla", tags: [] });
    const { cartelaId } = await sellCartela(storeId, customerId, "Carla", {
      paidUses: 1,
      unitValue: 2000,
    });
    const code = (await getCartela(storeId, cartelaId))!.code;

    const punchOrderId = await createOrder(storeId, {
      customerId,
      customerName: "Carla",
      channel: "loja",
      items: [punchLine(cartelaId, code, 2, 2500, 2000)],
    });
    expect((await getCartela(storeId, cartelaId))?.uses).toHaveLength(2);

    await setOrderStatus(storeId, punchOrderId, "cancelado");
    let cartela = await getCartela(storeId, cartelaId);
    expect(cartela?.uses).toEqual([]);
    expect(cartela?.status).toBe("ativa");
    expect((await getOrder(storeId, punchOrderId))?.cartelaConsumed).toEqual([]);

    await setOrderStatus(storeId, punchOrderId, "novo");
    cartela = await getCartela(storeId, cartelaId);
    expect(cartela?.uses).toHaveLength(2);
    expect((await getOrder(storeId, punchOrderId))?.cartelaConsumed).toEqual([
      { cartelaId, uses: 2 },
    ]);
  });

  it("cancelling the selling order cancels the cartela; uncancelling recomputes its real status", async () => {
    const storeId = `test-orders-cartela-cancel-sale-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Diego", tags: [] });
    // paidUses: 0 → totalUses: 1 (just the brinde), so fully punching it is one use.
    const { orderId: sellOrderId, cartelaId } = await sellCartela(storeId, customerId, "Diego", {
      paidUses: 0,
      unitValue: 1500,
    });
    const code = (await getCartela(storeId, cartelaId))!.code;

    // Fully punch it via a separate order before the sale is cancelled.
    await createOrder(storeId, {
      customerId,
      customerName: "Diego",
      channel: "loja",
      items: [punchLine(cartelaId, code, 1, 2000, 1500)],
    });
    expect((await getCartela(storeId, cartelaId))?.status).toBe("esgotada");

    await setOrderStatus(storeId, sellOrderId, "cancelado");
    expect((await getCartela(storeId, cartelaId))?.status).toBe("cancelada");

    // A cancelled cartela can never be punched, regardless of its balance.
    await expect(
      createOrder(storeId, {
        customerId,
        customerName: "Diego",
        channel: "loja",
        items: [punchLine(cartelaId, code, 1, 2000, 1500)],
      }),
    ).rejects.toThrow();

    await setOrderStatus(storeId, sellOrderId, "novo");
    // Uncancel recomputes from the cartela's OWN uses vs totalUses (esgotada
    // here, since the earlier punch order was never touched) — not a blind "ativa".
    expect((await getCartela(storeId, cartelaId))?.status).toBe("esgotada");
  });

  it("rejects over-redemption: applying more uses than the cartela has remaining", async () => {
    const storeId = `test-orders-cartela-over-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Elias", tags: [] });
    const { cartelaId } = await sellCartela(storeId, customerId, "Elias", {
      paidUses: 1,
      unitValue: 2000,
    }); // totalUses: 2
    const code = (await getCartela(storeId, cartelaId))!.code;

    await expect(
      createOrder(storeId, {
        customerId,
        customerName: "Elias",
        channel: "loja",
        items: [punchLine(cartelaId, code, 3, 2500, 2000)], // only 2 remain
      }),
    ).rejects.toThrow();

    // Rejected — the cartela holds no punches from the failed order.
    expect((await getCartela(storeId, cartelaId))?.uses).toEqual([]);
  });

  it("rejects a line priced below the cartela's fixed unit value (never forfeits the difference)", async () => {
    const storeId = `test-orders-cartela-below-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Fabio", tags: [] });
    const { cartelaId } = await sellCartela(storeId, customerId, "Fabio", {
      paidUses: 2,
      unitValue: 3000,
    });
    const code = (await getCartela(storeId, cartelaId))!.code;

    // listPrice (2000) < unitValue (3000) — must be blocked outright, never clamped.
    await expect(
      createOrder(storeId, {
        customerId,
        customerName: "Fabio",
        channel: "loja",
        items: [punchLine(cartelaId, code, 1, 2000, 3000)],
      }),
    ).rejects.toThrow();

    expect((await getCartela(storeId, cartelaId))?.uses).toEqual([]);
  });
});
