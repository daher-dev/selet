import { describe, expect, it } from "vitest";
import {
  computeSummaryFrom,
  emptySummary,
  monthCustomerSplit,
  pruneMonths,
  summaryAddOrder,
  summaryRemoveOrder,
  type OrderAggInput,
} from "./summary-core";

function order(mk: string, custKey: string): OrderAggInput {
  return {
    mk,
    total: 1000,
    custKey,
    open: false,
    paid: true,
    channel: "loja",
    items: [],
  };
}

describe("firstOrderMonth / monthCustomerSplit", () => {
  it("counts a customer as novo only in the month of their first order", () => {
    const s = emptySummary();
    summaryAddOrder(s, order("2026-05", "id_a"));
    summaryAddOrder(s, order("2026-06", "id_a"));
    summaryAddOrder(s, order("2026-06", "id_b"));
    expect(s.firstOrderMonth).toEqual({ id_a: "2026-05", id_b: "2026-06" });
    expect(monthCustomerSplit(s, "2026-05")).toEqual({ novos: 1, recorrentes: 0 });
    expect(monthCustomerSplit(s, "2026-06")).toEqual({ novos: 1, recorrentes: 1 });
  });

  it("a backdated earlier order moves the first-order month back", () => {
    const s = emptySummary();
    summaryAddOrder(s, order("2026-06", "id_a"));
    summaryAddOrder(s, order("2026-04", "id_a"));
    expect(s.firstOrderMonth.id_a).toBe("2026-04");
    expect(monthCustomerSplit(s, "2026-06")).toEqual({ novos: 0, recorrentes: 1 });
  });

  it("cancelling the first order hands 'novo' to the next month with orders", () => {
    const s = emptySummary();
    summaryAddOrder(s, order("2026-05", "id_a"));
    summaryAddOrder(s, order("2026-07", "id_a"));
    summaryRemoveOrder(s, order("2026-05", "id_a"));
    expect(s.firstOrderMonth.id_a).toBe("2026-07");
    summaryRemoveOrder(s, order("2026-07", "id_a"));
    expect(s.firstOrderMonth.id_a).toBeUndefined();
  });

  it("keeps the first-order month while the customer still has orders in it", () => {
    const s = emptySummary();
    summaryAddOrder(s, order("2026-05", "id_a"));
    summaryAddOrder(s, order("2026-05", "id_a"));
    summaryRemoveOrder(s, order("2026-05", "id_a"));
    expect(s.firstOrderMonth.id_a).toBe("2026-05");
  });

  it("incremental matches a recompute and survives pruning", () => {
    const at = (iso: string) => new Date(iso);
    const base = {
      total: 1000,
      paid: true,
      customerName: "",
      channel: "loja" as const,
      items: [],
    };
    const s = computeSummaryFrom({
      orders: [
        { ...base, status: "concluido", customerId: "a", createdAt: at("2026-01-10T15:00:00Z") },
        { ...base, status: "concluido", customerId: "a", createdAt: at("2026-06-10T15:00:00Z") },
        { ...base, status: "cancelado", customerId: "b", createdAt: at("2026-02-10T15:00:00Z") },
        { ...base, status: "concluido", customerId: "b", createdAt: at("2026-06-11T15:00:00Z") },
      ],
      finance: [],
      stock: [],
      customers: [],
    });
    expect(s.firstOrderMonth).toEqual({ id_a: "2026-01", id_b: "2026-06" });
    // Pruning old month buckets must not forget who is recurrent.
    const pruned = pruneMonths(s, 1);
    expect(Object.keys(pruned.months)).toEqual(["2026-06"]);
    expect(monthCustomerSplit(pruned, "2026-06")).toEqual({ novos: 1, recorrentes: 1 });
  });
});
