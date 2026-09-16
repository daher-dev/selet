import { monthKey } from "@/lib/summary-core";
import type { FinanceTx } from "@/lib/types";
import { formatRelative, orderCode } from "@/lib/format";

export const CATEGORY_LABELS: Record<string, string> = {
  vendas: "Vendas",
  compras: "Compras",
  salarios: "Salários",
  aluguel: "Aluguel",
  marketing: "Marketing",
  outros: "Outros",
};

export const PAY_METHOD_LABELS: Record<string, string> = {
  pix: "Pix",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
};

const monthFmt = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

/** ISO date string → "2026-07" competência key (local calendar month). */
export function monthKeyOf(iso: string): string {
  return monthKey(new Date(iso));
}

/** "2026-07" → the current local-time competência key. */
export function currentMonthKey(): string {
  return monthKey(new Date());
}

/** "2026-07" → "Julho de 2026" (competência label). */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const s = monthFmt.format(new Date(y, m - 1, 1));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "2026-07" → "Julho" (month name only, no year — capitalized). */
export function monthNameOnly(key: string): string {
  return monthLabel(key).split(" de ")[0];
}

/** Contiguous list of month keys from `min` to `max`, inclusive. */
export function buildRange(min: string, max: string): string[] {
  const [minY, minM] = min.split("-").map(Number);
  const [maxY, maxM] = max.split("-").map(Number);
  const out: string[] = [];
  let y = minY;
  let m = minM;
  while (y < maxY || (y === maxY && m <= maxM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** "2026-07" → [start, end) Date bounds, for a Firestore date range query. */
export function monthBounds(key: string): { start: Date; end: Date } {
  const [y, m] = key.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

/** Transaction meta line: "Pedido #AB3F · Pix · hoje" or "Aluguel · ontem". */
export function txMeta(tx: FinanceTx): string {
  const parts: string[] = [];
  if (tx.source === "order") {
    parts.push(tx.orderId ? `Pedido #${orderCode(tx.orderId)}` : "Pedido");
    if (tx.payMethod) parts.push(PAY_METHOD_LABELS[tx.payMethod] ?? tx.payMethod);
  } else if (CATEGORY_LABELS[tx.category]) {
    parts.push(CATEGORY_LABELS[tx.category]);
  } else {
    parts.push("Manual");
  }
  if (tx.date) parts.push(formatRelative(tx.date));
  return parts.join(" · ");
}
