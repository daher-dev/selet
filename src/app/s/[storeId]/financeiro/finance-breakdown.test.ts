import { describe, expect, it } from "vitest";
import type { FinanceTx } from "@/lib/types";
import { monthBreakdown } from "./finance-breakdown";

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
