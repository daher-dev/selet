import { describe, expect, it } from "vitest";
import {
  createOrder,
  setOrderPayment,
  setOrderStatus,
  updateOrder,
} from "./orders";
import { createManualTx, deleteManualTx } from "./finance";
import { applyMovement, createStockItem } from "./stock";
import { computeSummary, readSummary } from "./summary";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

/**
 * The whole point of the summary doc: the value maintained INCREMENTALLY on
 * every write must equal a fresh recompute from the collections. If any write
 * path forgets to update the summary, this diverges.
 */
async function expectConsistent(storeId: string) {
  const [stored, fresh] = await Promise.all([
    readSummary(storeId),
    computeSummary(storeId),
  ]);
  expect(stored).toEqual(fresh);
  return fresh;
}

describe.skipIf(!hasEmulator)("summary aggregates (emulator)", () => {
  it("tracks an order through its whole lifecycle", async () => {
    const storeId = `test-summary-order-${Date.now()}`;
    const items = [{ productId: "p1", name: "Shake", qty: 2, unitPrice: 2000 }];

    // create (novo, unpaid) → open + a receivable
    const orderId = await createOrder(storeId, {
      customerId: null,
      customerName: "Balcão A",
      channel: "loja",
      items,
    });
    let s = await expectConsistent(storeId);
    expect(s.openOrders).toBe(1);
    const mk = Object.keys(s.months)[0];
    expect(s.months[mk].orderCount).toBe(1);
    expect(s.months[mk].ticketSum).toBe(4000);
    expect(s.months[mk].unpaidTotal).toBe(4000);
    expect(s.months[mk].in).toBe(0);

    // advance status among open states → still open
    await setOrderStatus(storeId, orderId, "preparando");
    s = await expectConsistent(storeId);
    expect(s.openOrders).toBe(1);

    // conclude → no longer open, still counted
    await setOrderStatus(storeId, orderId, "concluido");
    s = await expectConsistent(storeId);
    expect(s.openOrders).toBe(0);
    expect(s.months[mk].orderCount).toBe(1);

    // pay → finance income, receivable cleared
    await setOrderPayment(storeId, orderId, true, "pix");
    s = await expectConsistent(storeId);
    expect(s.months[mk].in).toBe(4000);
    expect(s.months[mk].unpaidTotal).toBe(0);
    expect(s.months[mk].unpaidCount).toBe(0);

    // edit total + walk-in customer identity
    await updateOrder(storeId, orderId, {
      customerId: null,
      customerName: "Balcão B",
      channel: "loja",
      items: [{ productId: "p1", name: "Shake", qty: 3, unitPrice: 2000 }],
    });
    s = await expectConsistent(storeId);
    expect(s.months[mk].ticketSum).toBe(6000);
    expect(s.months[mk].in).toBe(6000); // paid mirror amount followed the edit
    expect(Object.keys(s.months[mk].customers)).toEqual(["n_balcao_b"]);

    // cancel → removed from month aggregates (paid mirror stays as income)
    await setOrderStatus(storeId, orderId, "cancelado");
    s = await expectConsistent(storeId);
    expect(s.months[mk].orderCount).toBe(0);
    expect(s.months[mk].in).toBe(6000);

    // uncancel → back in
    await setOrderStatus(storeId, orderId, "novo");
    s = await expectConsistent(storeId);
    expect(s.months[mk].orderCount).toBe(1);
    expect(s.openOrders).toBe(1);
  });

  it("tracks low-stock count and purchase expenses via stock writes", async () => {
    const storeId = `test-summary-stock-${Date.now()}`;

    // A tracked item created below its reorder point → low-stock badge +1, and a
    // priced opening purchase → finance `out`.
    await createStockItem(
      storeId,
      {
        name: "Farinha",
        category: "secos",
        unit: "kg",
        tracked: true,
        pkgLabel: "saco",
        pkgSize: 10,
        continuousUse: false,
        consumptionMode: "medido",
        resellable: false,
        cost: 5000,
        reorderAt: 5,
      },
      { sealed: 1, open: 0 },
      "tester",
    );
    const s = await expectConsistent(storeId);
    expect(s.lowStock).toBe(1);
    const mk = Object.keys(s.months)[0];
    expect(s.months[mk].out).toBe(5000); // 1 package × 5000
  });

  it("tracks manual finance in/out", async () => {
    const storeId = `test-summary-finance-${Date.now()}`;
    const id = await createManualTx(storeId, {
      label: "Aluguel",
      category: "aluguel",
      amount: 120000,
      direction: "out",
      date: new Date().toISOString(),
    });
    let s = await expectConsistent(storeId);
    const mk = Object.keys(s.months)[0];
    expect(s.months[mk].out).toBe(120000);

    await deleteManualTx(storeId, id);
    s = await expectConsistent(storeId);
    // Deleting the only tx empties (or zeroes) the month bucket.
    expect(s.months[mk]?.out ?? 0).toBe(0);
  });

  it("tracks a priced restock movement's expense and low-stock flip", async () => {
    const storeId = `test-summary-move-${Date.now()}`;
    const itemId = await createStockItem(
      storeId,
      {
        name: "Leite",
        category: "bebidas",
        unit: "L",
        tracked: true,
        pkgLabel: "caixa",
        pkgSize: 12,
        continuousUse: false,
        consumptionMode: "medido",
        resellable: false,
        cost: 800,
        reorderAt: 3,
      },
      { sealed: 1, open: 0 },
      "tester",
    );
    let s = await expectConsistent(storeId);
    expect(s.lowStock).toBe(1);

    // Buy 5 packages at 900 each → out += 4500, and stock clears the low flag.
    await applyMovement(storeId, itemId, {
      type: "entrada",
      qty: 5,
      byPackage: true,
      price: 900,
      by: "tester",
    });
    s = await expectConsistent(storeId);
    expect(s.lowStock).toBe(0);
  });
});
