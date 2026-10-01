import { describe, expect, it } from "vitest";
import {
  computeSummaryFrom,
  emptySummary,
  monthCustomerSplit,
  pruneMonths,
  summaryAddOrder,
  summaryFirstOrderShift,
  type OrderLike,
} from "./summary-core";

describe("novos / recorrentes", () => {
  it("moves the novo count when a customer's first-order month changes", () => {
    const s = emptySummary();
    summaryFirstOrderShift(s, { from: null, to: "2026-05" }); // first order
    expect(s.months["2026-05"].novos).toBe(1);
    summaryFirstOrderShift(s, { from: "2026-05", to: "2026-05" }); // no-op
    expect(s.months["2026-05"].novos).toBe(1);
    summaryFirstOrderShift(s, { from: "2026-05", to: "2026-07" }); // first cancelled
    expect(s.months["2026-05"].novos).toBe(0);
    expect(s.months["2026-07"].novos).toBe(1);
    summaryFirstOrderShift(s, { from: "2026-07", to: null }); // no orders left
    expect(s.months["2026-07"].novos).toBe(0);
  });

  it("splits a month's active customers, never exceeding them", () => {
    const s = emptySummary();
    const add = (custKey: string) =>
      summaryAddOrder(s, { mk: "2026-06", total: 1000, custKey, open: false, paid: true, channel: "loja", items: [] });
    add("id_a");
    add("id_b");
    add("n_walkin");
    summaryFirstOrderShift(s, { from: null, to: "2026-06" });
    expect(monthCustomerSplit(s.months["2026-06"])).toEqual({ novos: 1, recorrentes: 2 });
    expect(monthCustomerSplit(undefined)).toEqual({ novos: 0, recorrentes: 0 });
  });

  it("recompute counts each registered customer once, in their earliest active order month", () => {
    const at = (iso: string) => new Date(iso);
    const base: Omit<OrderLike, "status" | "customerId" | "createdAt"> = {
      total: 1000,
      paid: true,
      customerName: "",
      channel: "loja",
      items: [],
    };
    const s = computeSummaryFrom({
      orders: [
        { ...base, status: "concluido", customerId: "a", createdAt: at("2026-01-10T15:00:00Z") },
        { ...base, status: "concluido", customerId: "a", createdAt: at("2026-06-10T15:00:00Z") },
        { ...base, status: "cancelado", customerId: "b", createdAt: at("2026-02-10T15:00:00Z") },
        { ...base, status: "concluido", customerId: "b", createdAt: at("2026-06-11T15:00:00Z") },
        { ...base, status: "concluido", customerId: null, customerName: "Balcão", createdAt: at("2026-06-12T15:00:00Z") },
      ],
      finance: [],
      stock: [],
      customers: [],
    });
    expect(s.months["2026-01"].novos).toBe(1);
    expect(s.months["2026-06"].novos).toBe(1);
    // Pruning old buckets doesn't change who is new in the kept months.
    const pruned = pruneMonths(s, 1);
    expect(monthCustomerSplit(pruned.months["2026-06"])).toEqual({ novos: 1, recorrentes: 2 });
  });
});
