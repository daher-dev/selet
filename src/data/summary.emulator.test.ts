import { describe, expect, it } from "vitest";
import {
  createOrder,
  setOrderPayment,
  setOrderStatus,
  updateOrder,
} from "./orders";
import { createManualTx, deleteManualTx } from "./finance";
import { createCustomer, setCustomerArchived } from "./customers";
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
    const custA = await createCustomer(storeId, { name: "Balcão A", tags: [] });
    const custB = await createCustomer(storeId, { name: "Balcão B", tags: [] });

    // create (novo, unpaid) → open + a receivable
    const orderId = await createOrder(storeId, {
      customerId: custA,
      customerName: "Balcão A",
      channel: "loja",
      items,
    });
    let s = await expectConsistent(storeId);
    expect(s.openOrders).toBe(1);
    // Two customers created above → active base of 2, both new this month.
    expect(s.activeCustomers).toBe(2);
    const mk = Object.keys(s.months)[0];
    expect(s.months[mk].orderCount).toBe(1);
    expect(s.months[mk].ticketSum).toBe(4000);
    expect(s.months[mk].unpaidTotal).toBe(4000);
    expect(s.months[mk].in).toBe(0);
    expect(s.months[mk].newCustomers).toBe(2);
    expect(s.months[mk].channels).toEqual({ instagram: 0, whatsapp: 0, loja: 1 });
    expect(s.months[mk].sellers).toEqual({ p1: { name: "Shake", qty: 2 } });

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

    // edit total + reassign to another registered customer
    await updateOrder(storeId, orderId, {
      customerId: custB,
      customerName: "Balcão B",
      channel: "loja",
      items: [{ productId: "p1", name: "Shake", qty: 3, unitPrice: 2000 }],
    });
    s = await expectConsistent(storeId);
    expect(s.months[mk].ticketSum).toBe(6000);
    expect(s.months[mk].in).toBe(6000); // paid mirror amount followed the edit
    expect(Object.keys(s.months[mk].customers)).toEqual([`id_${custB}`]);
    // sellers/channels re-stated by the edit (qty 2 → 3, still loja).
    expect(s.months[mk].sellers).toEqual({ p1: { name: "Shake", qty: 3 } });
    expect(s.months[mk].channels).toEqual({ instagram: 0, whatsapp: 0, loja: 1 });

    // cancel → removed from month aggregates (paid mirror stays as income)
    await setOrderStatus(storeId, orderId, "cancelado");
    s = await expectConsistent(storeId);
    expect(s.months[mk].orderCount).toBe(0);
    expect(s.months[mk].in).toBe(6000);
    // channels/sellers drop to nothing while cancelled.
    expect(s.months[mk].channels).toEqual({ instagram: 0, whatsapp: 0, loja: 0 });
    expect(s.months[mk].sellers).toEqual({});

    // uncancel → back in
    await setOrderStatus(storeId, orderId, "novo");
    s = await expectConsistent(storeId);
    expect(s.months[mk].orderCount).toBe(1);
    expect(s.openOrders).toBe(1);
    expect(s.months[mk].channels).toEqual({ instagram: 0, whatsapp: 0, loja: 1 });
    expect(s.months[mk].sellers).toEqual({ p1: { name: "Shake", qty: 3 } });
  });

  it("tracks the customer base: active count + new-per-month", async () => {
    const storeId = `test-summary-customers-${Date.now()}`;
    // Two this month, one back-dated to a past month.
    await createCustomer(storeId, { name: "Ana", tags: [] });
    const bruno = await createCustomer(storeId, { name: "Bruno", tags: [] });
    await createCustomer(storeId, {
      name: "Cida",
      tags: [],
      since: "2026-05-10T12:00:00.000Z",
    });

    let s = await expectConsistent(storeId);
    expect(s.activeCustomers).toBe(3);
    expect(s.months["2026-05"].newCustomers).toBe(1);
    const thisMk = Object.keys(s.months).find((k) => k !== "2026-05")!;
    expect(s.months[thisMk].newCustomers).toBe(2);

    // Archive drops the active base but leaves the historical new-per-month tally.
    await setCustomerArchived(storeId, bruno, true);
    s = await expectConsistent(storeId);
    expect(s.activeCustomers).toBe(2);
    expect(s.months[thisMk].newCustomers).toBe(2);

    // Reactivating restores it (idempotent re-archive is a no-op).
    await setCustomerArchived(storeId, bruno, false);
    s = await expectConsistent(storeId);
    expect(s.activeCustomers).toBe(3);
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
