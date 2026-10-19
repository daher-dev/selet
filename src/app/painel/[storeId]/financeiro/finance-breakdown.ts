import type { FinanceTx } from "@/lib/types";
import { INSUMOS_CATEGORY_ID, LEGACY_INSUMOS_CATEGORY_ID } from "@/lib/stock-settings";
import { monthKeyOf } from "./finance-shared";

/** One competência's totals and the hero's Entradas/Saídas splits (centavos). */
export interface MonthBreakdown {
  in: number;
  out: number;
  /** order income from prepared items (menu/adicional/cartelas) */
  consumo: number;
  /** order income from resold stock items */
  revenda: number;
  /** manual income (aporte, ajustes…) — not a sale */
  outrasEntradas: number;
  /** Insumos saídas (category "insumos", legacy "compras") */
  insumos: number;
  /** every other expense (salários, aluguel, marketing, outros) */
  operacao: number;
}

/**
 * Groups transactions by competência month. Entradas split by origin: order
 * mirrors are Consumo minus their `revendaAmount` share, manual income is
 * "Outras". Saídas split into Insumos (category "insumos", or the legacy
 * "compras" key until migrate-settings runs) and Operação (everything else).
 */
export function monthBreakdown(txs: FinanceTx[]): Map<string, MonthBreakdown> {
  const map = new Map<string, MonthBreakdown>();
  for (const tx of txs) {
    if (!tx.date) continue;
    const key = monthKeyOf(tx.date);
    let b = map.get(key);
    if (!b) {
      b = { in: 0, out: 0, consumo: 0, revenda: 0, outrasEntradas: 0, insumos: 0, operacao: 0 };
      map.set(key, b);
    }
    if (tx.direction === "in") {
      b.in += tx.amount;
      if (tx.source === "order") {
        const revenda = Math.min(tx.amount, Math.max(0, tx.revendaAmount ?? 0));
        b.revenda += revenda;
        b.consumo += tx.amount - revenda;
      } else {
        b.outrasEntradas += tx.amount;
      }
    } else {
      b.out += tx.amount;
      if (tx.category === INSUMOS_CATEGORY_ID || tx.category === LEGACY_INSUMOS_CATEGORY_ID) b.insumos += tx.amount;
      else b.operacao += tx.amount;
    }
  }
  return map;
}
