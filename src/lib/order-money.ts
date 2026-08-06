/**
 * Pure order-money derivation helpers — no I/O, shared by the data layer,
 * server actions, and the client drawer (live preview and persisted total
 * MUST use the exact same computation, see order-sheet.tsx).
 *
 * Order of operations, load-bearing: cartela coverage is already netted out
 * of each line's `unitPrice` (see OrderItem.cartelaUse); the manual discount
 * applies AFTER that, on top of the coverage-netted subtotal.
 *   Subtotal (pre-coverage) -> minus cartela coverage -> minus discount -> Total
 */
import type { OrderDiscount, OrderItem } from "./types";

export type DiscountInput = Pick<OrderDiscount, "kind" | "value" | "reason">;

/** Sum qty * (unitPrice + covered) — the pre-coverage list price of every line. */
export function itemsSubtotal(items: OrderItem[]): number {
  return items.reduce(
    (sum, item) => sum + item.qty * (item.unitPrice + (item.cartelaUse?.covered ?? 0)),
    0,
  );
}

/** Sum qty * covered — the total cartela coverage netted into this order's lines. */
export function cartelaCovered(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.qty * (item.cartelaUse?.covered ?? 0), 0);
}

/** Sum qty * unitPrice — today's orderTotal(): coverage already netted in, no discount. */
export function netOfCartela(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
}

/**
 * Discount amount in centavos, computed against `base` (the coverage-netted
 * subtotal). Never negative, never exceeds `base`.
 */
export function discountAmount(base: number, d: DiscountInput | null | undefined): number {
  if (!d || base <= 0) return 0;
  if (d.kind === "free") return base;
  if (d.kind === "percent") {
    const pct = Math.min(100, Math.max(0, d.value));
    return Math.min(base, Math.max(0, Math.round((base * pct) / 100)));
  }
  // flat
  return Math.min(base, Math.max(0, Math.round(d.value)));
}

export interface OrderMoney {
  /** Pre-coverage list price sum. */
  subtotal: number;
  /** Cartela coverage netted out of the lines. */
  covered: number;
  /** subtotal - covered — the base the discount applies against. */
  afterCartela: number;
  /** The persisted discount shape (server-computed `amount`), or null when none. */
  discount: OrderDiscount | null;
  /** afterCartela - discount.amount — what's actually owed. */
  total: number;
}

export function orderMoney(items: OrderItem[], d?: DiscountInput | null): OrderMoney {
  const subtotal = itemsSubtotal(items);
  const covered = cartelaCovered(items);
  const afterCartela = subtotal - covered;
  const amount = discountAmount(afterCartela, d);
  const discount: OrderDiscount | null = d
    ? { kind: d.kind, value: d.kind === "free" ? 0 : d.value, amount, reason: d.reason }
    : null;
  return {
    subtotal,
    covered,
    afterCartela,
    discount,
    total: afterCartela - amount,
  };
}
