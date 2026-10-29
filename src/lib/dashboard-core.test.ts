import { describe, expect, it } from "vitest";
import type { Order } from "./types";
import { emptySummary, summaryAddOrder, summaryFirstOrderShift } from "./summary-core";
import { monthlySeries, summarizeRecent, trailingMonthKeys, weeklySeries } from "./dashboard-core";

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

describe("weeklySeries", () => {
  // Thu 29/10/2026 → current week Mon 26/10; 3 weeks: 12/10, 19/10, 26/10.
  const now = new Date("2026-10-29T15:00:00Z");
  const at = (day: number, hour = 15) => new Date(Date.UTC(2026, 9, day, hour)).toISOString();
  const firstOrderAt = new Map([
    ["ana", new Date(at(21))], // novo in week of 19/10
    ["bia", new Date("2026-08-01T12:00:00Z")],
  ]);

  it("buckets Monday–Sunday and counts distinct clients per week", () => {
    const orders = [
      mkOrder({ customerId: "bia", total: 4000, createdAt: at(13), channel: "loja" }),
      mkOrder({ customerId: "ana", total: 1000, createdAt: at(21), channel: "instagram" }),
      mkOrder({ customerId: "ana", total: 500, createdAt: at(25), channel: "instagram" }), // Sun, same week
      mkOrder({ customerId: "bia", total: 2000, createdAt: at(22), channel: "whatsapp" }),
      mkOrder({ customerId: "ana", total: 300, createdAt: at(27) }),
      mkOrder({ customerId: "ana", total: 9999, createdAt: at(27), status: "cancelado" }),
      mkOrder({ customerId: null, customerName: "Joana", total: 100, createdAt: at(28) }),
      mkOrder({ customerId: "bia", total: 777, createdAt: at(5) }), // outside the 3-week window
    ];
    const w = weeklySeries({ orders, firstOrderAt, now, count: 3 });
    expect(w.map((p) => p.key)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(w.map((p) => p.sales)).toEqual([4000, 3500, 400]);
    expect(w[1]).toMatchObject({ orderCount: 3, activeCustomers: 2, novos: 1, recorrentes: 1 });
    expect(w[1].channels).toEqual({ instagram: 2, whatsapp: 1, loja: 0 });
    // ana ordered in two weeks: counted once in each; already recorrente in the later one.
    expect(w[2]).toMatchObject({ activeCustomers: 2, novos: 0, recorrentes: 2 });
    expect(w.map((p) => p.partial)).toEqual([false, false, true]);
    expect(w[0].mom).toBeNull();
    expect(w[1].mom).toBe(-12.5);
    expect(w[2].mom).toBeNull(); // open week has no WoW
    expect(w[1].title).toBe("Semana de 19 out a 25 out");
  });

  it("follows the store timezone (Sun 23:30 BRT is still that week, Mon 00:30 BRT starts the next)", () => {
    const orders = [
      mkOrder({ customerId: "bia", total: 100, createdAt: "2026-10-26T02:30:00Z" }), // Sun 25 23:30 BRT
      mkOrder({ customerId: "bia", total: 200, createdAt: "2026-10-26T03:30:00Z" }), // Mon 26 00:30 BRT
    ];
    const w = weeklySeries({ orders, firstOrderAt, now, count: 2 });
    expect(w.map((p) => p.sales)).toEqual([100, 200]);
  });
});
