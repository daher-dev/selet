import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/firebase-admin";
import { createCustomer } from "./customers";
import { createOrder, getOrder, setOrderStatus, updateOrder } from "./orders";
import { createPudimBase, createPudimFlavor, createPudimMixin } from "./pudim";
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

async function financeDoc(storeId: string, orderId: string) {
  const snap = await getDb().doc(`stores/${storeId}/finance/order-${orderId}`).get();
  return snap.exists ? snap.data()! : null;
}

describe.skipIf(!hasEmulator)("orders repository · pudim lines (emulator)", () => {
  it("consumes the flavor's recipe + base + mixin insumo, and reverses exactly on cancel", async () => {
    const storeId = `test-orders-pudim-a-${Date.now()}`;
    const baseInsumoStock = await seedInsumo(storeId, "Pudim base", 1000);
    const baseModifierInsumo = await seedInsumo(storeId, "Leite", 500);
    const mixinInsumo = await seedInsumo(storeId, "Fibra Ativa", 200);

    const flavorId = await createPudimFlavor(storeId, {
      name: "Frutas Amarelas",
      price: 3200,
      recipe: [{ stockItemId: baseInsumoStock, name: "Pudim base", qty: 26 }],
    });
    const baseId = await createPudimBase(storeId, {
      name: "Leite",
      insumo: { stockItemId: baseModifierInsumo, qty: 150 },
      price: 0,
    });
    const mixinId = await createPudimMixin(storeId, {
      name: "Fibra Ativa",
      insumo: { stockItemId: mixinInsumo, qty: 5 },
      tiers: [{ qty: 1, price: 500 }],
    });

    const customerId = await createCustomer(storeId, { name: "Mariana", tags: [] });
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Mariana",
      channel: "loja",
      items: [
        {
          productId: flavorId,
          name: "Pudim · Frutas Amarelas / Leite / +Fibra Ativa",
          qty: 2, // 2 pudins
          unitPrice: 3200 + 500,
          pudim: {
            flavorId,
            baseId,
            mixins: [{ modifierId: mixinId, qty: 1 }],
          },
        },
      ],
    });

    // flavor: 26g × 2 pudins = 52g; base: 150ml × 2 = 300; mixin: 5g × 1 × 2 = 10
    expect((await getStockItem(storeId, baseInsumoStock))?.open).toBe(1000 - 52);
    expect((await getStockItem(storeId, baseModifierInsumo))?.open).toBe(500 - 300);
    expect((await getStockItem(storeId, mixinInsumo))?.open).toBe(200 - 10);

    const order = await getOrder(storeId, orderId);
    expect(order?.stockConsumed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "insumo", refId: baseInsumoStock, amount: 52 }),
        expect.objectContaining({ kind: "insumo", refId: baseModifierInsumo, amount: 300 }),
        expect.objectContaining({ kind: "insumo", refId: mixinInsumo, amount: 10 }),
      ]),
    );

    await setOrderStatus(storeId, orderId, "cancelado");
    expect((await getStockItem(storeId, baseInsumoStock))?.open).toBe(1000);
    expect((await getStockItem(storeId, baseModifierInsumo))?.open).toBe(500);
    expect((await getStockItem(storeId, mixinInsumo))?.open).toBe(200);
    expect((await getOrder(storeId, orderId))?.stockConsumed).toEqual([]);

    await setOrderStatus(storeId, orderId, "novo");
    expect((await getStockItem(storeId, baseInsumoStock))?.open).toBe(1000 - 52);
    expect((await getStockItem(storeId, baseModifierInsumo))?.open).toBe(500 - 300);
    expect((await getStockItem(storeId, mixinInsumo))?.open).toBe(200 - 10);
  });

  it("editing a pudim line to swap the base nets the stock diff correctly", async () => {
    const storeId = `test-orders-pudim-b-${Date.now()}`;
    const flavorInsumo = await seedInsumo(storeId, "Pudim base", 1000);
    const leiteInsumo = await seedInsumo(storeId, "Leite", 500);
    const nutrevInsumo = await seedInsumo(storeId, "NutreV", 500);

    const flavorId = await createPudimFlavor(storeId, {
      name: "Frutas Amarelas",
      price: 3200,
      recipe: [{ stockItemId: flavorInsumo, name: "Pudim base", qty: 26 }],
    });
    const leiteId = await createPudimBase(storeId, {
      name: "Leite",
      insumo: { stockItemId: leiteInsumo, qty: 150 },
      price: 0,
    });
    const nutrevId = await createPudimBase(storeId, {
      name: "NutreV",
      insumo: { stockItemId: nutrevInsumo, qty: 40 },
      price: 0,
    });

    const customerId = await createCustomer(storeId, { name: "Beatriz", tags: [] });
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Beatriz",
      channel: "loja",
      items: [
        {
          productId: flavorId,
          name: "Pudim · Frutas Amarelas / Leite",
          qty: 1,
          unitPrice: 3200,
          pudim: { flavorId, baseId: leiteId, mixins: [] },
        },
      ],
    });
    expect((await getStockItem(storeId, leiteInsumo))?.open).toBe(500 - 150);
    expect((await getStockItem(storeId, nutrevInsumo))?.open).toBe(500);

    // Swap Leite → NutreV.
    await updateOrder(storeId, orderId, {
      customerId,
      customerName: "Beatriz",
      channel: "loja",
      items: [
        {
          productId: flavorId,
          name: "Pudim · Frutas Amarelas / NutreV",
          qty: 1,
          unitPrice: 3200,
          pudim: { flavorId, baseId: nutrevId, mixins: [] },
        },
      ],
    });

    // Leite fully returned, NutreV freshly drawn — flavor recipe unaffected (same qty both times).
    expect((await getStockItem(storeId, leiteInsumo))?.open).toBe(500);
    expect((await getStockItem(storeId, nutrevInsumo))?.open).toBe(500 - 40);
    expect((await getStockItem(storeId, flavorInsumo))?.open).toBe(1000 - 26);
  });

  it("editing a pudim line to add a mixin nets only the incremental draw", async () => {
    const storeId = `test-orders-pudim-c-${Date.now()}`;
    const flavorInsumo = await seedInsumo(storeId, "Pudim base", 1000);
    const mixinInsumo = await seedInsumo(storeId, "Colágeno", 500);

    const flavorId = await createPudimFlavor(storeId, {
      name: "Beleza",
      price: 3800,
      recipe: [{ stockItemId: flavorInsumo, name: "Pudim base", qty: 26 }],
    });
    const mixinId = await createPudimMixin(storeId, {
      name: "Colágeno",
      insumo: { stockItemId: mixinInsumo, qty: 8 },
      tiers: [{ qty: 1, price: 800 }],
    });

    const customerId = await createCustomer(storeId, { name: "Carla", tags: [] });
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Carla",
      channel: "loja",
      items: [
        {
          productId: flavorId,
          name: "Pudim · Beleza",
          qty: 1,
          unitPrice: 3800,
          pudim: { flavorId, baseId: null, mixins: [] },
        },
      ],
    });
    expect((await getStockItem(storeId, mixinInsumo))?.open).toBe(500);

    await updateOrder(storeId, orderId, {
      customerId,
      customerName: "Carla",
      channel: "loja",
      items: [
        {
          productId: flavorId,
          name: "Pudim · Beleza / +Colágeno",
          qty: 1,
          unitPrice: 3800 + 800,
          pudim: { flavorId, baseId: null, mixins: [{ modifierId: mixinId, qty: 1 }] },
        },
      ],
    });
    expect((await getStockItem(storeId, mixinInsumo))?.open).toBe(500 - 8);
    // The flavor recipe itself is unaffected by adding a mixin.
    expect((await getStockItem(storeId, flavorInsumo))?.open).toBe(1000 - 26);
  });

  it("a pudim line with no matching catalog entries draws nothing (best-effort)", async () => {
    const storeId = `test-orders-pudim-d-${Date.now()}`;
    const customerId = await createCustomer(storeId, { name: "Duda", tags: [] });
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Duda",
      channel: "loja",
      items: [
        {
          productId: "gone",
          name: "Pudim · Sabor removido",
          qty: 1,
          unitPrice: 3000,
          pudim: { flavorId: "gone", baseId: "also-gone", mixins: [{ modifierId: "gone-too", qty: 1 }] },
        },
      ],
    });
    const order = await getOrder(storeId, orderId);
    expect(order?.total).toBe(3000);
    expect(order?.stockConsumed).toEqual([]);
  });

  it("cancelling a paid pudim order reverses its Financeiro mirror; uncancel restores it", async () => {
    const storeId = `test-orders-pudim-finance-${Date.now()}`;
    const flavorInsumo = await seedInsumo(storeId, "Pudim base", 1000);
    const flavorId = await createPudimFlavor(storeId, {
      name: "Chocolate",
      price: 3000,
      recipe: [{ stockItemId: flavorInsumo, name: "Pudim base", qty: 26 }],
    });

    const customerId = await createCustomer(storeId, { name: "Elis", tags: [] });
    const orderId = await createOrder(
      storeId,
      {
        customerId,
        customerName: "Elis",
        channel: "loja",
        items: [
          {
            productId: flavorId,
            name: "Pudim · Chocolate",
            qty: 1,
            unitPrice: 3000,
            pudim: { flavorId, baseId: null, mixins: [] },
          },
        ],
      },
      { paid: true, payMethod: "pix" },
    );
    expect(await financeDoc(storeId, orderId)).toMatchObject({ amount: 3000, direction: "in" });

    await setOrderStatus(storeId, orderId, "cancelado");
    expect(await financeDoc(storeId, orderId)).toBeNull();
    // Stock reversed too, on the same cancel.
    expect((await getStockItem(storeId, flavorInsumo))?.open).toBe(1000);

    await setOrderStatus(storeId, orderId, "novo");
    expect(await financeDoc(storeId, orderId)).toMatchObject({ amount: 3000, direction: "in" });
    expect((await getStockItem(storeId, flavorInsumo))?.open).toBe(1000 - 26);
  });
});
