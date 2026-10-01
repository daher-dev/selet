import { describe, expect, it } from "vitest";
import type { FinanceTx } from "@/lib/types";
import { monthBreakdown } from "./finance-breakdown";
import { todayDateInput } from "./finance-shared";

const tx = (p: Partial<FinanceTx>): FinanceTx => ({
  id: Math.random().toString(36),
  label: "x",
  category: "outros",
  amount: 0,
  direction: "in",
  source: "manual",
  date: "2026-07-15T15:00:00Z",
  ...p,
});

describe("monthBreakdown", () => {
  it("splits entradas into consumo/revenda/outras and saídas into insumos/operação", () => {
    const m = monthBreakdown([
      tx({ source: "order", category: "vendas", amount: 10000, revendaAmount: 4000 }),
      tx({ source: "order", category: "vendas", amount: 3000 }), // legacy mirror
      tx({ source: "manual", category: "outros", amount: 2000 }), // aporte
      tx({ direction: "out", source: "stock", category: "compras", amount: 1500 }),
      tx({ direction: "out", source: "manual", category: "aluguel", amount: 4200 }),
    ]).get("2026-07")!;
    expect(m).toEqual({
      in: 15000,
      out: 5700,
      consumo: 9000,
      revenda: 4000,
      outrasEntradas: 2000,
      insumos: 1500,
      operacao: 4200,
    });
  });
});

describe("monthBreakdown — configurable categories", () => {
  it("counts the Insumos category and the legacy compras key as Insumos", () => {
    const m = monthBreakdown([
      tx({ direction: "out", category: "insumos", amount: 1000 }),
      tx({ direction: "out", category: "compras", amount: 500 }),
      tx({ direction: "out", category: "custos-fixos", amount: 700 }),
    ]).get("2026-07")!;
    expect(m.insumos).toBe(1500);
    expect(m.operacao).toBe(700);
  });
});

describe("todayDateInput", () => {
  it("uses the store's calendar day, not the UTC one", () => {
    // 00:03 UTC on Oct 1 is still 21:03 on Sep 30 in São Paulo.
    expect(todayDateInput(new Date("2026-10-01T00:03:00Z"))).toBe("2026-09-30");
    expect(todayDateInput(new Date("2026-10-01T03:30:00Z"))).toBe("2026-10-01");
  });
});
