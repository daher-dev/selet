import { monthKey } from "@/lib/summary-core";
import { STORE_TIME_ZONE, zonedParts, zonedTimeToUtc } from "@/lib/timezone";
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
  timeZone: STORE_TIME_ZONE,
});

/** ISO date string → "2026-07" competência key (local calendar month). */
export function monthKeyOf(iso: string): string {
  return monthKey(new Date(iso));
}

/** "2026-07" → the current local-time competência key. */
export function currentMonthKey(): string {
  return monthKey(new Date());
}

/**
 * Today's calendar date in the STORE's timezone as "YYYY-MM-DD" (the value a
 * date input expects). Never `toISOString().slice(0, 10)`: that is the UTC day,
 * which is already tomorrow from 21h in São Paulo — a lançamento created late
 * in the evening would land on the next day (or the next competência).
 */
export function todayDateInput(now: Date = new Date()): string {
  const { year, month, day } = zonedParts(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "2026-07" → "Julho de 2026" (competência label). */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const s = monthFmt.format(zonedTimeToUtc(y, m, 1));
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
  return { start: zonedTimeToUtc(y, m, 1), end: zonedTimeToUtc(y, m + 1, 1) };
}

/** "2026-07" → "Julho 2026" (competência label, as in the design). */
export function competenciaLabel(key: string): string {
  return `${monthNameOnly(key)} ${key.split("-")[0]}`;
}

/** Store-day "dd/MM" for an ISO date ("dd/MM/yyyy" with `year`). */
export function dayMonth(iso: string, year = false): string {
  const { year: y, month, day } = zonedParts(new Date(iso));
  const dm = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
  return year ? `${dm}/${y}` : dm;
}

/**
 * Compact meta line for a movement row: "Hoje · Pix", "Ontem · Compras",
 * "25/07 · Aluguel" — the store-day date (today/yesterday spelled out), then
 * the pay method for an order mirror or the category otherwise.
 */
export function txShortMeta(tx: FinanceTx, now: Date = new Date()): string {
  const parts: string[] = [];
  if (tx.date) {
    const day = dayMonth(tx.date, true);
    const today = dayMonth(now.toISOString(), true);
    const yesterday = dayMonth(new Date(now.getTime() - 86_400_000).toISOString(), true);
    parts.push(day === today ? "Hoje" : day === yesterday ? "Ontem" : dayMonth(tx.date));
  }
  if (tx.source === "order") {
    if (tx.payMethod) parts.push(PAY_METHOD_LABELS[tx.payMethod] ?? tx.payMethod);
  } else if (CATEGORY_LABELS[tx.category]) {
    parts.push(CATEGORY_LABELS[tx.category]);
  }
  return parts.join(" · ");
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
