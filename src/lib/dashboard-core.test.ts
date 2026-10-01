import { describe, expect, it } from "vitest";
import type { Order } from "./types";
import { emptySummary, summaryAddOrder, summaryFirstOrderShift } from "./summary-core";
import { monthlySeries, summarizeRecent, trailingMonthKeys } from "./dashboard-core";

function mkOrder(partial: Partial<Order>): Order {
  return {
    id: "o",
    code: "#1",
    customerId: null,
    customerName: "Walk-in",
    channel: "loja",
    items: [],
    total: 0,
    status: "concluido",
    paid: true,
    payMethod: "pix",
    createdAt: "2026-09-10T12:00:00Z",
    ...partial,
  } as Order;
}

describe("summarizeRecent", () => {
  const flavors = new Map([
    ["f-choc", "Chocolate"],
    ["f-mor", "Morango"],
    ["p-leite", "Leite Ninho"],
  ]);

  it("counts orders, distinct customers, top products and top sabores (shake + pudim)", () => {
    const orders = [
      mkOrder({
        customerId: "a",
        items: [
          {
            productId: "shake",
            name: "Shake",
            qty: 2,
            unitPrice: 2000,
            shake: { flavorIds: ["f-choc", "f-mor"], baseId: null, rims: [], mixins: [] },
          },
        ],
      }),
      mkOrder({
        customerId: "a",
        items: [
          {
            productId: "pudim",
            name: "Pudim",
            qty: 1,
            unitPrice: 1500,
            pudim: { flavorIds: ["p-leite"], baseId: null, mixins: [] },
          },
          {
            productId: "cartela",
            name: "Cartela",
            qty: 1,
            unitPrice: 9000,
            cartelaSale: { paidUses: 10, totalUses: 11, unitValue: 900 },
          },
        ],
      }),
      mkOrder({
        customerId: "b",
        status: "cancelado",
        items: [{ productId: "shake", name: "Shake", qty: 9, unitPrice: 2000 }],
      }),
      mkOrder({
        customerName: "Joana",
        items: [
          {
            productId: "shake",
            name: "Shake",
            qty: 1,
            unitPrice: 2000,
            shake: { flavorIds: ["f-choc", "unknown"], baseId: null, rims: [], mixins: [] },
          },
        ],
      }),
    ];
    const r = summarizeRecent(orders, flavors);
    expect(r.orderCount).toBe(3);
    expect(r.activeCustomers).toBe(2); // "a" + walk-in Joana; cancelled "b" excluded
    expect(r.topProducts).toEqual([
      { name: "Shake", qty: 3 },
      { name: "Pudim", qty: 1 },
    ]);
    expect(r.topFlavors).toEqual([
      { name: "Chocolate", qty: 3 },
      { name: "Morango", qty: 2 },
      { name: "Leite Ninho", qty: 1 },
    ]);
  });
});

describe("monthlySeries", () => {
  it("builds 12 trailing months with MoM and a partial current month", () => {
    expect(trailingMonthKeys("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);

    const s = emptySummary();
    const add = (mk: string, total: number, custKey: string) =>
      summaryAddOrder(s, { mk, total, custKey, open: false, paid: true, channel: "whatsapp", items: [] });
    add("2025-11", 10000, "id_a");
    add("2025-12", 20000, "id_a");
    add("2026-01", 15000, "id_a");
    add("2026-01", 5000, "id_b");
    summaryFirstOrderShift(s, { from: null, to: "2025-11" }); // id_a
    summaryFirstOrderShift(s, { from: null, to: "2026-01" }); // id_b

    const keys = trailingMonthKeys("2026-01", 2);
    const series = monthlySeries(s, keys, "2026-01");
    expect(series.map((m) => m.label)).toEqual(["Dez", "Jan"]);
    // Dez's MoM is seeded from Nov (the month before the window).
    expect(series[0].mom).toBe(100);
    expect(series[1].mom).toBe(0);
    expect(series[1].partial).toBe(true);
    expect(series[1].sales).toBe(20000);
    expect(series[1].avgTicket).toBe(10000);
    expect(series[1]).toMatchObject({ novos: 1, recorrentes: 1, activeCustomers: 2 });
  });

  it("has no MoM without a base month", () => {
    const series = monthlySeries(emptySummary(), ["2026-01"], "2026-01");
    expect(series[0].mom).toBeNull();
    expect(series[0].sales).toBe(0);
  });
});
