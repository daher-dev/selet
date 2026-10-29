import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/firebase-admin";
import { monthKey } from "@/lib/timezone";
import { createCustomer } from "./customers";
import {
  createOrder,
  getOrder,
  setOrderPayment,
  setOrderStatus,
  updateOrder,
  type OrderInput,
} from "./orders";
import { createProduct, updateProduct, type LegacyProductInput } from "./products";
import { computeSummary, readSummary } from "./summary";
import {
  listCommissionItems,
  listCommissionPayments,
  registerCommissionPayment,
  undoCommissionPayment,
} from "./commissions";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

const SELLER = { sellerEmail: "marina@selet.com.br", sellerName: "Marina Alves" };

/** The incremental summary must equal a fresh recompute — catches any commission write path that drifts. */
async function expectConsistent(storeId: string) {
  const [stored, fresh] = await Promise.all([readSummary(storeId), computeSummary(storeId)]);
  expect(stored).toEqual(fresh);
  return fresh;
}

async function mirror(storeId: string, orderId: string) {
  const snap = await getDb().doc(`stores/${storeId}/finance/order-${orderId}`).get();
  return snap.exists ? snap.data()! : null;
}

const product = (over: Partial<LegacyProductInput> = {}): LegacyProductInput => ({
  name: "Coxinha Proteica",
  price: 1500,
  category: "salgados",
  typeTags: [],
  active: true,
  // Commission belongs to the resale offer only.
  saleType: "revenda",
  insumoId: "stock-coxinha",
  recipe: [],
  adicionais: [],
  tiers: [{ qty: 1, price: 1500 }],
  commissionPercent: 5,
  ...over,
});

async function setup(storeId: string, over: Partial<LegacyProductInput> = {}) {
  const productId = await createProduct(storeId, product(over));
  const customerId = await createCustomer(storeId, { name: "Rafael", tags: [] });
  const input = (qty: number, extra: Partial<OrderInput> = {}): OrderInput => ({
    customerId,
    customerName: "Rafael",
    channel: "loja",
    items: [{ productId, name: "Coxinha Proteica", qty, unitPrice: 1500 }],
    ...SELLER,
    ...extra,
  });
  return { productId, customerId, input };
}

describe.skipIf(!hasEmulator)("seller commission (emulator)", () => {
  it("snapshots the % and accrues the commission on the paid mirror and in Saídas", async () => {
    const storeId = `test-comm-a-${Date.now()}`;
    const { input } = await setup(storeId);
    const orderId = await createOrder(storeId, input(3), { paid: true, payMethod: "pix" });

    const order = await getOrder(storeId, orderId);
    expect(order).toMatchObject({ ...SELLER, total: 4500 });
    expect(order?.items[0].commissionPercent).toBe(5);

    expect(await mirror(storeId, orderId)).toMatchObject({
      amount: 4500,
      ...SELLER,
      commission: { amount: 225, base: 4500, items: 3 },
    });
    const s = await expectConsistent(storeId);
    const mk = monthKey(new Date());
    expect(s.months[mk].in).toBe(4500);
    expect(s.months[mk].out).toBe(225);
  });

  it("earns nothing while unpaid, and follows pay / unpay / cancel / uncancel", async () => {
    const storeId = `test-comm-b-${Date.now()}`;
    const { input } = await setup(storeId);
    const mk = monthKey(new Date());
    const orderId = await createOrder(storeId, input(2));
    expect(await mirror(storeId, orderId)).toBeNull();
    expect((await expectConsistent(storeId)).months[mk].out).toBe(0);

    await setOrderPayment(storeId, orderId, true, "pix");
    expect((await mirror(storeId, orderId))?.commission?.amount).toBe(150);
    expect((await expectConsistent(storeId)).months[mk].out).toBe(150);

    await setOrderStatus(storeId, orderId, "cancelado");
    expect(await mirror(storeId, orderId)).toBeNull();
    expect((await expectConsistent(storeId)).months[mk].out).toBe(0);

    await setOrderStatus(storeId, orderId, "concluido");
    expect((await mirror(storeId, orderId))?.commission?.amount).toBe(150);
    expect((await expectConsistent(storeId)).months[mk].out).toBe(150);

    await setOrderPayment(storeId, orderId, false, null);
    expect(await mirror(storeId, orderId)).toBeNull();
    expect((await expectConsistent(storeId)).months[mk].out).toBe(0);
  });

  it("recomputes on edit: qty, discount and a seller change", async () => {
    const storeId = `test-comm-c-${Date.now()}`;
    const { input } = await setup(storeId);
    const mk = monthKey(new Date());
    const orderId = await createOrder(storeId, input(2), { paid: true, payMethod: "pix" });

    await updateOrder(storeId, orderId, input(4));
    expect((await mirror(storeId, orderId))?.commission?.amount).toBe(300);
    expect((await expectConsistent(storeId)).months[mk].out).toBe(300);

    // 50% off → commission on the discounted value.
    await updateOrder(storeId, orderId, input(4, { discount: { kind: "percent", value: 50 } }));
    expect((await mirror(storeId, orderId))?.commission?.amount).toBe(150);
    expect((await expectConsistent(storeId)).months[mk].out).toBe(150);

    // A cortesia earns nothing — the commission is cleared from the mirror too.
    await updateOrder(
      storeId,
      orderId,
      input(4, { discount: { kind: "percent", value: 50, reason: "cortesia" } }),
    );
    expect((await mirror(storeId, orderId))?.commission).toBeUndefined();
    expect((await expectConsistent(storeId)).months[mk].out).toBe(0);

    // Reassigning the seller moves the commission to them.
    await updateOrder(storeId, orderId, {
      ...input(4),
      sellerEmail: "bruno@selet.com.br",
      sellerName: "Bruno",
    });
    expect(await mirror(storeId, orderId)).toMatchObject({
      sellerEmail: "bruno@selet.com.br",
      commission: { amount: 300 },
    });
    await expectConsistent(storeId);
  });

  it("an edit keeps the snapshot of lines already on the order", async () => {
    const storeId = `test-comm-d-${Date.now()}`;
    const { productId, input } = await setup(storeId);
    const orderId = await createOrder(storeId, input(1), { paid: true, payMethod: "pix" });

    // The product's rate changes afterwards…
    await updateProduct(storeId, productId, product({ commissionPercent: 20 }));
    await updateOrder(storeId, orderId, input(2));

    // …but the order still pays the 5% it was sold at.
    const order = await getOrder(storeId, orderId);
    expect(order?.items[0].commissionPercent).toBe(5);
    expect((await mirror(storeId, orderId))?.commission?.amount).toBe(150);
    await expectConsistent(storeId);
  });

  it("an order without a seller, or a product without commission, accrues nothing", async () => {
    const storeId = `test-comm-e-${Date.now()}`;
    const { input } = await setup(storeId);
    const noSeller = await createOrder(
      storeId,
      input(1, { sellerEmail: undefined, sellerName: undefined }),
      { paid: true, payMethod: "pix" },
    );
    expect((await mirror(storeId, noSeller))?.commission).toBeUndefined();

    const plain = await setup(`${storeId}-plain`, { commissionPercent: undefined });
    const noCommission = await createOrder(`${storeId}-plain`, plain.input(1), {
      paid: true,
      payMethod: "pix",
    });
    expect((await mirror(`${storeId}-plain`, noCommission))?.commission).toBeUndefined();
    await expectConsistent(storeId);
    await expectConsistent(`${storeId}-plain`);
  });

  it("registers and undoes a payout without touching Saídas", async () => {
    const storeId = `test-comm-f-${Date.now()}`;
    const { input } = await setup(storeId);
    const mk = monthKey(new Date());
    await createOrder(storeId, input(2), { paid: true, payMethod: "pix" });
    await createOrder(storeId, input(1), { paid: true, payMethod: "pix" });

    const paymentId = await registerCommissionPayment(
      storeId,
      { month: mk, sellerEmail: SELLER.sellerEmail, payMethod: "pix" },
      "admin@selet.com.br",
    );
    const [payment] = await listCommissionPayments(storeId);
    expect(payment).toMatchObject({ id: paymentId, amount: 225, month: mk, sellerName: "Marina Alves" });
    const row = await getDb().doc(`stores/${storeId}/finance/commission-${paymentId}`).get();
    expect(row.data()).toMatchObject({ source: "commission", direction: "out", amount: 225 });

    // Already paid in full → nothing left to pay.
    await expect(
      registerCommissionPayment(
        storeId,
        { month: mk, sellerEmail: SELLER.sellerEmail, payMethod: "pix" },
        "admin@selet.com.br",
      ),
    ).rejects.toThrow(/Não há comissão/);

    // The accrual (225) is in Saídas exactly once, with or without the payout row.
    expect((await expectConsistent(storeId)).months[mk].out).toBe(225);

    await undoCommissionPayment(storeId, paymentId);
    expect(await listCommissionPayments(storeId)).toEqual([]);
    expect((await getDb().doc(`stores/${storeId}/finance/commission-${paymentId}`).get()).exists).toBe(false);
    await expectConsistent(storeId);
  });

  it("lists the month's commissioned items grouped by product", async () => {
    const storeId = `test-comm-g-${Date.now()}`;
    const { input } = await setup(storeId);
    const mk = monthKey(new Date());
    await createOrder(storeId, input(2), { paid: true, payMethod: "pix" });
    await createOrder(storeId, input(1), { paid: true, payMethod: "pix" });
    const rows = await listCommissionItems(storeId, mk);
    expect(rows).toEqual([
      expect.objectContaining({ name: "Coxinha Proteica", percent: 5, qty: 3, sold: 4500, commission: 225 }),
    ]);
    expect(await listCommissionItems(storeId, mk, "outro@selet.com.br")).toEqual([]);
  });
});
