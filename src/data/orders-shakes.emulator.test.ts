import { describe, expect, it } from "vitest";
import { createCustomer } from "./customers";
import { createOrder, getOrder, setOrderStatus, updateOrder } from "./orders";
import { createShakeFlavor, createShakeRim } from "./shakes";
import { createStockItem, getStockItem } from "./stock";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

async function seedInsumo(storeId: string, name: string, openQty: number) {
  return createStockItem(
    storeId,
    {
      name,
      category: "secos",
      unit: "g",
      tracked: false,
      continuousUse: false,
      consumptionMode: "medido",
      resellable: false,
      reorderAt: 10,
    },
    { sealed: 0, open: openQty },
  );
}

describe.skipIf(!hasEmulator)("orders repository · shake lines (emulator)", () => {
  it("consumes the flavor's recipe + rim insumo, and reverses exactly on cancel", async () => {
    const storeId = `test-orders-shake-a-${Date.now()}`;
    const baseInsumo = await seedInsumo(storeId, "Shake base", 1000);
    const rimInsumo = await seedInsumo(storeId, "Nutella", 200);

    const flavorId = await createShakeFlavor(storeId, {
      name: "Frutas Amarelas",
      price: 3200,
      recipe: [{ stockItemId: baseInsumo, name: "Shake base", qty: 26 }],
    });
    const rimId = await createShakeRim(storeId, {
      name: "Nutella",
      insumo: { stockItemId: rimInsumo, qty: 20 },
      tiers: [{ qty: 1, price: 600 }, { qty: 2, price: 1000 }],
    });

    const customerId = await createCustomer(storeId, { name: "Mariana", tags: [] });
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Mariana",
      channel: "loja",
      items: [
        {
          productId: flavorId,
          name: "Shake · Frutas Amarelas / Borda Nutella ×2",
          qty: 2, // 2 shakes
          unitPrice: 3200 + 1000,
          shake: { flavorId, baseId: null, rims: [{ modifierId: rimId, qty: 2 }], mixins: [] },
        },
      ],
    });

    // base: 26g × 2 shakes = 52g; rim: 20g × 2 (dose dupla) × 2 shakes = 80g
    expect((await getStockItem(storeId, baseInsumo))?.open).toBe(1000 - 52);
    expect((await getStockItem(storeId, rimInsumo))?.open).toBe(200 - 80);

    const order = await getOrder(storeId, orderId);
    expect(order?.stockConsumed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "insumo", refId: baseInsumo, amount: 52 }),
        expect.objectContaining({ kind: "insumo", refId: rimInsumo, amount: 80 }),
      ]),
    );

    await setOrderStatus(storeId, orderId, "cancelado");
    expect((await getStockItem(storeId, baseInsumo))?.open).toBe(1000);
    expect((await getStockItem(storeId, rimInsumo))?.open).toBe(200);
    expect((await getOrder(storeId, orderId))?.stockConsumed).toEqual([]);

    await setOrderStatus(storeId, orderId, "novo");
    expect((await getStockItem(storeId, baseInsumo))?.open).toBe(1000 - 52);
    expect((await getStockItem(storeId, rimInsumo))?.open).toBe(200 - 80);
  });

  it("editing a shake line to swap the Borda nets the stock diff correctly", async () => {
    const storeId = `test-orders-shake-b-${Date.now()}`;
    const baseInsumo = await seedInsumo(storeId, "Shake base", 1000);
    const nutellaInsumo = await seedInsumo(storeId, "Nutella", 200);
    const pacocaInsumo = await seedInsumo(storeId, "Paçoca", 200);

    const flavorId = await createShakeFlavor(storeId, {
      name: "Frutas Amarelas",
      price: 3200,
      recipe: [{ stockItemId: baseInsumo, name: "Shake base", qty: 26 }],
    });
    const nutellaId = await createShakeRim(storeId, {
      name: "Nutella",
      insumo: { stockItemId: nutellaInsumo, qty: 20 },
      tiers: [{ qty: 1, price: 600 }],
    });
    const pacocaId = await createShakeRim(storeId, {
      name: "Paçoca",
      insumo: { stockItemId: pacocaInsumo, qty: 15 },
      tiers: [{ qty: 1, price: 400 }],
    });

    const customerId = await createCustomer(storeId, { name: "Beatriz", tags: [] });
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Beatriz",
      channel: "loja",
      items: [
        {
          productId: flavorId,
          name: "Shake · Frutas Amarelas / Borda Nutella",
          qty: 1,
          unitPrice: 3200 + 600,
          shake: { flavorId, baseId: null, rims: [{ modifierId: nutellaId, qty: 1 }], mixins: [] },
        },
      ],
    });
    expect((await getStockItem(storeId, nutellaInsumo))?.open).toBe(200 - 20);
    expect((await getStockItem(storeId, pacocaInsumo))?.open).toBe(200);

    // Swap Nutella → Paçoca.
    await updateOrder(storeId, orderId, {
      customerId,
      customerName: "Beatriz",
      channel: "loja",
      items: [
        {
          productId: flavorId,
          name: "Shake · Frutas Amarelas / Borda Paçoca",
          qty: 1,
          unitPrice: 3200 + 400,
          shake: { flavorId, baseId: null, rims: [{ modifierId: pacocaId, qty: 1 }], mixins: [] },
        },
      ],
    });

    // Nutella fully returned, Paçoca freshly drawn — base recipe unaffected (same qty both times).
    expect((await getStockItem(storeId, nutellaInsumo))?.open).toBe(200);
    expect((await getStockItem(storeId, pacocaInsumo))?.open).toBe(200 - 15);
    expect((await getStockItem(storeId, baseInsumo))?.open).toBe(1000 - 26);
  });

  it("a shake line with no matching catalog entries draws nothing (best-effort)", async () => {
    const storeId = `test-orders-shake-c-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Carla", tags: [] });
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Carla",
      channel: "loja",
      items: [
        {
          productId: "gone",
          name: "Shake · Sabor removido",
          qty: 1,
          unitPrice: 3000,
          shake: { flavorId: "gone", baseId: null, rims: [], mixins: [] },
        },
      ],
    });
    const order = await getOrder(storeId, orderId);
    expect(order?.total).toBe(3000);
    expect(order?.stockConsumed).toEqual([]);
  });
});
