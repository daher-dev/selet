import { describe, expect, it } from "vitest";
import type { Order } from "@/lib/types";
import { buildUnpaidByCustomer } from "./customer-logic";

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
