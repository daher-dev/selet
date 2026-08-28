import { Timestamp } from "firebase-admin/firestore";
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
            flavorIds: [flavorId],
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
          pudim: { flavorIds: [flavorId], baseId: leiteId, mixins: [] },
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
          pudim: { flavorIds: [flavorId], baseId: nutrevId, mixins: [] },
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
          pudim: { flavorIds: [flavorId], baseId: null, mixins: [] },
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
          pudim: { flavorIds: [flavorId], baseId: null, mixins: [{ modifierId: mixinId, qty: 1 }] },
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
          pudim: { flavorIds: ["gone"], baseId: "also-gone", mixins: [{ modifierId: "gone-too", qty: 1 }] },
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
            pudim: { flavorIds: [flavorId], baseId: null, mixins: [] },
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

  it("multi-flavor round-trip: persists all flavorIds and sums every selected flavor's recipe", async () => {
    const storeId = `test-orders-pudim-multi-${Date.now()}`;
    const insA = await seedInsumo(storeId, "Base A", 1000);
    const insB = await seedInsumo(storeId, "Base B", 1000);

    const flavorA = await createPudimFlavor(storeId, {
      name: "Chocolate",
      price: 3200,
      recipe: [{ stockItemId: insA, name: "Base A", qty: 26 }],
    });
    const flavorB = await createPudimFlavor(storeId, {
      name: "Doce de Leite",
      price: 3200,
      recipe: [{ stockItemId: insB, name: "Base B", qty: 30 }],
    });

    const customerId = await createCustomer(storeId, { name: "Duda", tags: [] });
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Duda",
      channel: "loja",
      items: [
        {
          // primary (max-price) flavor id convention — both flavors are 3200
          // here, so the productId is just whichever the builder resolved.
          productId: flavorA,
          name: "Pudim · Chocolate + Doce de Leite",
          qty: 1,
          unitPrice: 3200,
          pudim: { flavorIds: [flavorA, flavorB], baseId: null, mixins: [] },
        },
      ],
    });

    // This is the regression guard for the "silently dropped field" failure
    // mode: BOTH flavor ids must survive the round-trip through Firestore.
    const order = await getOrder(storeId, orderId);
    expect(order?.items[0].pudim?.flavorIds).toEqual([flavorA, flavorB]);

    // Each selected flavor's FULL recipe is drawn (summed, not divided).
    expect((await getStockItem(storeId, insA))?.open).toBe(1000 - 26);
    expect((await getStockItem(storeId, insB))?.open).toBe(1000 - 30);

    await setOrderStatus(storeId, orderId, "cancelado");
    expect((await getStockItem(storeId, insA))?.open).toBe(1000);
    expect((await getStockItem(storeId, insB))?.open).toBe(1000);
  });

  it("partial resolution: one valid flavor id + one deleted/missing one draws only the surviving recipe", async () => {
    const storeId = `test-orders-pudim-partial-${Date.now()}`;
    const insA = await seedInsumo(storeId, "Base A", 1000);

    const flavorA = await createPudimFlavor(storeId, {
      name: "Chocolate",
      price: 3200,
      recipe: [{ stockItemId: insA, name: "Base A", qty: 26 }],
    });

    const customerId = await createCustomer(storeId, { name: "Elis", tags: [] });
    const orderId = await createOrder(storeId, {
      customerId,
      customerName: "Elis",
      channel: "loja",
      items: [
        {
          productId: flavorA,
          name: "Pudim · Chocolate + Sabor removido",
          qty: 1,
          unitPrice: 3200,
          pudim: { flavorIds: [flavorA, "sabor-removido"], baseId: null, mixins: [] },
        },
      ],
    });

    // Best-effort: the order still persists both ids and its price...
    const order = await getOrder(storeId, orderId);
    expect(order?.items[0].pudim?.flavorIds).toEqual([flavorA, "sabor-removido"]);
    expect(order?.total).toBe(3200);
    // ...but only the surviving flavor's recipe is actually drawn, never throws.
    expect((await getStockItem(storeId, insA))?.open).toBe(1000 - 26);
  });

  it("read-time normalization: a legacy doc with singular pudim.flavorId is read back as flavorIds", async () => {
    const storeId = `test-orders-pudim-legacy-${Date.now()}`;
    const db = getDb();
    const ref = db.collection("stores").doc(storeId).collection("orders").doc();
    const now = Timestamp.now();
    // Written the OLD way (singular `flavorId`), bypassing createOrder entirely —
    // this is exactly the shape a pre-existing seed/historical doc has. Never
    // rewritten; only the read path (toOrder) normalizes it.
    await ref.set({
      customerId: null,
      customerName: "Legado",
      channel: "loja",
      items: [
        {
          productId: "sabor-legado",
          name: "Pudim · Sabor legado",
          qty: 1,
          unitPrice: 3000,
          pudim: { flavorId: "sabor-legado", baseId: null, mixins: [] },
        },
      ],
      total: 3000,
      status: "novo",
      paid: false,
      payMethod: null,
      stockConsumed: [],
      cartelaConsumed: [],
      cartelaSold: [],
      createdAt: now,
      updatedAt: now,
    });

    const order = await getOrder(storeId, ref.id);
    expect(order?.items[0].pudim).toMatchObject({ flavorIds: ["sabor-legado"] });
  });
});
