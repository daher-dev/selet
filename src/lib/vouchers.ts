/**
 * Pure voucher derivation helpers — no I/O, shared by the data layer, server
 * actions, and client components. `redeemedCount` is always the source of
 * truth (see VoucherLineItem); everything else here is computed from it.
 */
import type { Voucher, VoucherLineItem, VoucherTemplateItem } from "./types";

/** Display code for a voucher doc ID, mirrors orderCode(): first 4 chars, uppercased. */
export function voucherCode(id: string): string {
  return id.slice(0, 4).toUpperCase();
}

export function remaining(item: VoucherLineItem): number {
  return Math.max(0, item.qty - item.redeemedCount);
}

export function lineHasBalance(item: VoucherLineItem): boolean {
  return remaining(item) > 0;
}

export function computeHasBalance(items: VoucherLineItem[]): boolean {
  return items.some(lineHasBalance);
}

export function isExpired(expiresAt: string | null, now: Date = new Date()): boolean {
  return expiresAt !== null && new Date(expiresAt).getTime() < now.getTime();
}

export function isExpiringSoon(
  expiresAt: string | null,
  now: Date = new Date(),
  days = 7,
): boolean {
  if (expiresAt === null) return false;
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return ms >= 0 && ms <= days * 86_400_000;
}

export type VoucherStatus = "ativo" | "vence-em-breve" | "expirado";

export interface VoucherPills {
  status: VoucherStatus;
  unpaid: boolean;
  noExpiry: boolean;
}

/** Status pills for a voucher card, computed from its current state. */
export function voucherPills(voucher: Voucher, now: Date = new Date()): VoucherPills {
  const status: VoucherStatus = isExpired(voucher.expiresAt, now)
    ? "expirado"
    : isExpiringSoon(voucher.expiresAt, now)
      ? "vence-em-breve"
      : "ativo";
  return {
    status,
    unpaid: !voucher.paid,
    noExpiry: voucher.expiresAt === null,
  };
}

export function expiresAtFromValidity(
  purchasedAt: Date,
  validityDays: number | null,
): string | null {
  if (validityDays === null) return null;
  return new Date(purchasedAt.getTime() + validityDays * 86_400_000).toISOString();
}

/** Days between `now` and `expiresAt`, rounded up (0 if past/absent). */
export function daysUntil(expiresAt: string | null, now: Date = new Date()): number {
  if (expiresAt === null) return 0;
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export interface SavingsInfo {
  sum: number; // centavos, sum of unitPrice × qty across items
  savings: number; // centavos, sum - packagePrice (never negative)
  discountPct: number; // rounded, 0 when sum is 0
}

/** Sum-of-parts vs. package price — the template editor's live savings helper. */
export function computeSavings(
  items: VoucherTemplateItem[],
  packagePrice: number,
): SavingsInfo {
  const sum = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const savings = Math.max(0, sum - packagePrice);
  const discountPct = sum > 0 ? Math.round((savings / sum) * 100) : 0;
  return { sum, savings, discountPct };
}

/**
 * Proportional balance value of a voucher: the package price allocated across
 * its still-unredeemed items (not raw unit price × remaining, which would
 * ignore the package discount and overstate the outstanding balance).
 */
export function voucherBalanceValue(voucher: Voucher): number {
  const totalQty = voucher.items.reduce((s, i) => s + i.qty, 0);
  if (totalQty === 0) return 0;
  const remainingQty = voucher.items.reduce((s, i) => s + remaining(i), 0);
  return Math.round((voucher.packagePrice * remainingQty) / totalQty);
}
