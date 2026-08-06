import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/firebase-admin";
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
          shake: { flavorIds: [flavorId], baseId: null, rims: [{ modifierId: rimId, qty: 2 }], mixins: [] },
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
          shake: { flavorIds: [flavorId], baseId: null, rims: [{ modifierId: nutellaId, qty: 1 }], mixins: [] },
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
          shake: { flavorIds: [flavorId], baseId: null, rims: [{ modifierId: pacocaId, qty: 1 }], mixins: [] },
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
          shake: { flavorIds: ["gone"], baseId: null, rims: [], mixins: [] },
        },
      ],
    });
    const order = await getOrder(storeId, orderId);
    expect(order?.total).toBe(3000);
    expect(order?.stockConsumed).toEqual([]);
  });

  it("multi-flavor round-trip: persists all flavorIds and sums every selected flavor's recipe", async () => {
    const storeId = `test-orders-shake-multi-${Date.now()}`;
    const insA = await seedInsumo(storeId, "Base A", 1000);
    const insB = await seedInsumo(storeId, "Base B", 1000);

    const flavorA = await createShakeFlavor(storeId, {
      name: "Frutas Amarelas",
      price: 3200,
      recipe: [{ stockItemId: insA, name: "Base A", qty: 26 }],
    });
    const flavorB = await createShakeFlavor(storeId, {
      name: "Frutas Vermelhas",
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
          name: "Shake · Frutas Amarelas + Frutas Vermelhas",
          qty: 1,
          unitPrice: 3200,
          shake: { flavorIds: [flavorA, flavorB], baseId: null, rims: [], mixins: [] },
        },
      ],
    });

    // This is the regression guard for the "silently dropped field" failure
    // mode: BOTH flavor ids must survive the round-trip through Firestore.
    const order = await getOrder(storeId, orderId);
    expect(order?.items[0].shake?.flavorIds).toEqual([flavorA, flavorB]);

    // Each selected flavor's FULL recipe is drawn (summed, not divided).
    expect((await getStockItem(storeId, insA))?.open).toBe(1000 - 26);
    expect((await getStockItem(storeId, insB))?.open).toBe(1000 - 30);

    await setOrderStatus(storeId, orderId, "cancelado");
    expect((await getStockItem(storeId, insA))?.open).toBe(1000);
    expect((await getStockItem(storeId, insB))?.open).toBe(1000);
  });

  it("partial resolution: one valid flavor id + one deleted/missing one draws only the surviving recipe", async () => {
    const storeId = `test-orders-shake-partial-${Date.now()}`;
    const insA = await seedInsumo(storeId, "Base A", 1000);

    const flavorA = await createShakeFlavor(storeId, {
      name: "Frutas Amarelas",
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
          name: "Shake · Frutas Amarelas + Sabor removido",
          qty: 1,
          unitPrice: 3200,
          shake: { flavorIds: [flavorA, "flavor-removido"], baseId: null, rims: [], mixins: [] },
        },
      ],
    });

    // Best-effort: the order still persists both ids and its price...
    const order = await getOrder(storeId, orderId);
    expect(order?.items[0].shake?.flavorIds).toEqual([flavorA, "flavor-removido"]);
    expect(order?.total).toBe(3200);
    // ...but only the surviving flavor's recipe is actually drawn, never throws.
    expect((await getStockItem(storeId, insA))?.open).toBe(1000 - 26);
  });

  it("read-time normalization: a legacy doc with singular shake.flavorId is read back as flavorIds", async () => {
    const storeId = `test-orders-shake-legacy-${Date.now()}`;
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
          name: "Shake · Sabor legado",
          qty: 1,
          unitPrice: 3000,
          shake: { flavorId: "sabor-legado", baseId: null, rims: [], mixins: [] },
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
    expect(order?.items[0].shake).toMatchObject({ flavorIds: ["sabor-legado"] });
  });
});
