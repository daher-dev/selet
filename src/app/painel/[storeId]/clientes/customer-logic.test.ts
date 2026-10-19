import { describe, expect, it } from "vitest";
import type { Customer, Order } from "@/lib/types";
import {
  buildUnpaidByCustomer,
  computeReorder,
  computeRhythm,
  computeStoreAvgTicket,
  isNewCustomer,
  rowOverdueDays,
} from "./customer-logic";

function order(overrides: Partial<Order>): Order {
  return {
    id: Math.random().toString(36).slice(2),
    code: "0001",
    customerId: "joao",
    customerName: "João Souza",
    channel: "whatsapp",
    items: [{ productId: "p1", name: "Shake", qty: 1, unitPrice: 2000 }],
    total: 2000,
    status: "novo",
    paid: false,
    payMethod: null,
    createdAt: "2026-06-01T12:00:00.000Z",
    ...overrides,
  } as Order;
}

function customer(overrides: Partial<Customer>): Customer {
  return {
    id: "c1",
    name: "Luiza Castro",
    since: "2025-08-01T12:00:00.000Z",
    tags: [],
    archived: false,
    orderCount: 15,
    totalSpent: 70_950,
    lastOrderAt: null,
    avgReorderDays: null,
    ...overrides,
  };
}

describe("buildUnpaidByCustomer", () => {
  it("tallies unpaid, non-cancelled orders with a positive total", () => {
    const map = buildUnpaidByCustomer([order({ total: 2000 })]);
    expect(map.get("joao")).toEqual({ total: 2000, count: 1 });
  });

  it("excludes comped (nada a cobrar) orders — a zero total is never a receivable", () => {
    // Same rule as summary-core/orders.ts: an order fully covered by a
    // cartela redemption has total 0 and must not inflate the "A receber"
    // count while contributing nothing to the total (the R$ 0,00 bug).
    const map = buildUnpaidByCustomer([
      order({ total: 2000 }),
      order({ total: 0 }),
    ]);
    expect(map.get("joao")).toEqual({ total: 2000, count: 1 });
  });

  it("omits a customer whose only open orders are all zero-total", () => {
    const map = buildUnpaidByCustomer([order({ total: 0 })]);
    expect(map.has("joao")).toBe(false);
  });

  it("still ignores paid and cancelled orders", () => {
    const map = buildUnpaidByCustomer([
      order({ paid: true }),
      order({ status: "cancelado" }),
    ]);
    expect(map.has("joao")).toBe(false);
  });
});

const NOW = new Date("2026-08-20T12:00:00.000Z");

describe("rowOverdueDays", () => {
  it("returns null when there isn't enough cadence data yet", () => {
    const c = customer({ avgReorderDays: null });
    expect(rowOverdueDays(c, NOW)).toBeNull();
  });

  it("returns null when the customer is on-pace (design Mock Clientes 3a)", () => {
    // Carla Menezes: costuma vir a cada 6 dias, último pedido hoje.
    const c = customer({ avgReorderDays: 6, lastOrderAt: "2026-08-20T09:00:00.000Z" });
    expect(rowOverdueDays(c, NOW)).toBeNull();
  });

  it("returns the day count for an overdue customer (design Mock Clientes 1a/3c: Luiza Castro, 14 dias de atraso)", () => {
    const c = customer({ avgReorderDays: 7, lastOrderAt: "2026-07-30T12:00:00.000Z" });
    expect(rowOverdueDays(c, NOW)).toBe(14);
  });

  it("also flags the more severe 'reactivate' state", () => {
    const c = customer({ avgReorderDays: 5, lastOrderAt: "2026-06-01T12:00:00.000Z" });
    expect(rowOverdueDays(c, NOW)).not.toBeNull();
  });
});

describe("computeRhythm", () => {
  it("reports 'sem leitura' when there's no cadence data yet (design Mock Clientes 3b)", () => {
    const c = customer({ avgReorderDays: null });
    const info = computeRhythm(c, null, NOW);
    expect(info?.tone).toBe("unknown");
    expect(info?.text).toMatch(/sem leitura/);
  });

  it("reports 'em dia' with the cadence and recency (design Mock Clientes 3a)", () => {
    const c = customer({ avgReorderDays: 6, lastOrderAt: "2026-08-20T09:00:00.000Z" });
    const reorder = computeReorder(c, null, NOW);
    const info = computeRhythm(c, reorder, NOW);
    expect(info?.tone).toBe("ok");
    expect(info?.text).toBe("Em dia — costuma vir a cada 6 dias, último pedido hoje.");
  });

  it("defers to the top alert card for overdue/reactivate states (design Mock Clientes 3c)", () => {
    const c = customer({ avgReorderDays: 7, lastOrderAt: "2026-07-30T12:00:00.000Z" });
    const reorder = computeReorder(c, null, NOW);
    expect(reorder?.state).toBe("overdue");
    expect(computeRhythm(c, reorder, NOW)).toBeNull();
  });
});

describe("computeStoreAvgTicket", () => {
  it("averages total spent over total orders, across non-archived customers", () => {
    const avg = computeStoreAvgTicket([
      customer({ id: "a", totalSpent: 2000, orderCount: 1 }),
      customer({ id: "b", totalSpent: 6000, orderCount: 2 }),
    ]);
    expect(avg).toBeCloseTo(8000 / 3);
  });

  it("excludes archived customers", () => {
    const avg = computeStoreAvgTicket([
      customer({ id: "a", totalSpent: 2000, orderCount: 1 }),
      customer({ id: "b", totalSpent: 100_000, orderCount: 10, archived: true }),
    ]);
    expect(avg).toBe(2000);
  });

  it("returns null when nobody has ordered yet", () => {
    expect(computeStoreAvgTicket([customer({ orderCount: 0, totalSpent: 0 })])).toBeNull();
  });
});

describe("isNewCustomer", () => {
  it("is true under 3 orders with no manual tags (design Mock Clientes 1a: João Pedro)", () => {
    expect(isNewCustomer(customer({ orderCount: 2, tags: [] }))).toBe(true);
  });

  it("is false at 3+ orders", () => {
    expect(isNewCustomer(customer({ orderCount: 3, tags: [] }))).toBe(false);
  });

  it("is false when a manual tag already occupies the slot", () => {
    expect(isNewCustomer(customer({ orderCount: 1, tags: ["vip"] }))).toBe(false);
  });

  it("is false for archived customers", () => {
    expect(isNewCustomer(customer({ orderCount: 1, tags: [], archived: true }))).toBe(false);
  });
});
