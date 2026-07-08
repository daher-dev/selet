/**
 * Pre-computed per-store aggregates — PURE core (no `server-only`, no
 * firebase-admin), so it can be shared by the app data layer AND the seed
 * scripts (which run under plain tsx and can't import server-only modules).
 *
 * The materialized summary lives at `stores/{storeId}/meta/summary` and is
 * maintained incrementally inside the same transactions that write orders,
 * finance docs and stock movements (see src/data/summary.ts for the Firestore
 * I/O + wiring). Reads PREFER it, always with a safe fallback that recomputes
 * from the collections, so a missing summary can never break a page.
 *
 * What it holds:
 *  - openOrders: count of orders in an open status (novo|preparando|entrega).
 *  - lowStock:   count of active (non-archived) low-stock items.
 *  - months[YYYY-MM]:
 *      in / out      — finance income/expense (centavos) that month
 *      orderCount    — non-cancelled orders opened that month
 *      ticketSum     — Σ order.total (avgTicket = ticketSum / orderCount)
 *      unpaidTotal / unpaidCount — outstanding "a receber" for that month
 *      customers     — distinct-set as a multiset { key -> live order count };
 *                      activeCustomers = number of keys
 *
 * Money is integer centavos throughout.
 */

export interface MonthAgg {
  in: number;
  out: number;
  orderCount: number;
  ticketSum: number;
  unpaidTotal: number;
  unpaidCount: number;
  /** distinct active customers as a multiset (key -> count of live orders) */
  customers: Record<string, number>;
}

export interface SummaryData {
  openOrders: number;
  lowStock: number;
  months: Record<string, MonthAgg>;
}

/** Statuses that count as an "open" order for the nav badge. */
const OPEN_STATUSES = new Set(["novo", "preparando", "entrega"]);
export function isOpenStatus(status: string): boolean {
  return OPEN_STATUSES.has(status);
}

/** "2026-07" for a given date. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Stable, Firestore-map-safe distinct key for a customer. Prefers the customer
 * doc id; anonymous walk-ins fall back to a slug of their name (mirrors the
 * existing financeiro logic that treats each distinct walk-in name as a
 * customer). Sanitized because Firestore map field names can't contain `.`/`/`.
 */
export function customerKey(
  customerId: string | null | undefined,
  customerName: string,
): string {
  if (customerId) return `id_${customerId}`;
  const slug = (customerName || "anon")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `n_${slug || "anon"}`;
}

/** 1 when the item counts toward the low-stock badge, else 0. */
export function lowStockContribution(lowStock: boolean, archived: boolean): number {
  return lowStock && !archived ? 1 : 0;
}

export function emptyMonth(): MonthAgg {
  return {
    in: 0,
    out: 0,
    orderCount: 0,
    ticketSum: 0,
    unpaidTotal: 0,
    unpaidCount: 0,
    customers: {},
  };
}

export function emptySummary(): SummaryData {
  return { openOrders: 0, lowStock: 0, months: {} };
}

function bucket(s: SummaryData, mk: string): MonthAgg {
  return (s.months[mk] ??= emptyMonth());
}

function incCustomer(b: MonthAgg, key: string | null): void {
  if (!key) return;
  b.customers[key] = (b.customers[key] ?? 0) + 1;
}

function decCustomer(b: MonthAgg, key: string | null): void {
  if (!key) return;
  const n = (b.customers[key] ?? 0) - 1;
  if (n <= 0) delete b.customers[key];
  else b.customers[key] = n;
}

// ---------------------------------------------------------------------------
// Incremental mutators. Each mutates a SummaryData in place; callers read the
// doc, apply the deltas, and write it back inside their transaction. `in`/`out`
// (finance) are intentionally NOT touched by add/remove order — they follow the
// finance mirror doc, adjusted only where that doc is actually written.
// ---------------------------------------------------------------------------

export interface OrderAggInput {
  mk: string;
  total: number;
  custKey: string | null;
  open: boolean;
  paid: boolean;
}

/** An order enters the active (non-cancelled) aggregates. */
export function summaryAddOrder(s: SummaryData, o: OrderAggInput): void {
  const b = bucket(s, o.mk);
  b.orderCount += 1;
  b.ticketSum += o.total;
  incCustomer(b, o.custKey);
  if (o.open) s.openOrders += 1;
  if (!o.paid) {
    b.unpaidTotal += o.total;
    b.unpaidCount += 1;
  }
}

/** An order leaves the active aggregates (cancellation). Exact inverse. */
export function summaryRemoveOrder(s: SummaryData, o: OrderAggInput): void {
  const b = bucket(s, o.mk);
  b.orderCount = Math.max(0, b.orderCount - 1);
  b.ticketSum = Math.max(0, b.ticketSum - o.total);
  decCustomer(b, o.custKey);
  if (o.open) s.openOrders = Math.max(0, s.openOrders - 1);
  if (!o.paid) {
    b.unpaidTotal = Math.max(0, b.unpaidTotal - o.total);
    b.unpaidCount = Math.max(0, b.unpaidCount - 1);
  }
}

/** Bump the global open-orders count (status change among non-cancelled states). */
export function summaryOpenDelta(s: SummaryData, delta: number): void {
  s.openOrders = Math.max(0, s.openOrders + delta);
}

/** Finance in/out delta (signed centavos). Source: order mirror, stock, manual. */
export function summaryFinance(
  s: SummaryData,
  input: { mk: string; direction: "in" | "out"; amount: number },
): void {
  const b = bucket(s, input.mk);
  if (input.direction === "in") b.in = Math.max(0, b.in + input.amount);
  else b.out = Math.max(0, b.out + input.amount);
}

/** Outstanding "a receber" delta (sign +1 to add a receivable, -1 to clear one). */
export function summaryReceivable(
  s: SummaryData,
  input: { mk: string; total: number; sign: 1 | -1 },
): void {
  const b = bucket(s, input.mk);
  b.unpaidTotal = Math.max(0, b.unpaidTotal + input.sign * input.total);
  b.unpaidCount = Math.max(0, b.unpaidCount + input.sign);
}

/** Low-stock badge count delta. */
export function summaryLowStockDelta(s: SummaryData, delta: number): void {
  s.lowStock = Math.max(0, s.lowStock + delta);
}

// ---------------------------------------------------------------------------
// Full recompute from raw collection data (backfill + verification + fallback).
// ---------------------------------------------------------------------------

export interface OrderLike {
  status: string;
  total: number;
  paid: boolean;
  customerId: string | null;
  customerName: string;
  createdAt: Date;
}
export interface FinanceLike {
  direction: "in" | "out";
  amount: number;
  date: Date;
}
export interface StockLike {
  lowStock: boolean;
  archived: boolean;
}

export function computeSummaryFrom(input: {
  orders: OrderLike[];
  finance: FinanceLike[];
  stock: StockLike[];
}): SummaryData {
  const s = emptySummary();
  for (const o of input.orders) {
    if (o.status === "cancelado") continue;
    summaryAddOrder(s, {
      mk: monthKey(o.createdAt),
      total: o.total ?? 0,
      custKey: customerKey(o.customerId, o.customerName),
      open: isOpenStatus(o.status),
      paid: !!o.paid,
    });
  }
  for (const f of input.finance) {
    summaryFinance(s, {
      mk: monthKey(f.date),
      direction: f.direction,
      amount: f.amount ?? 0,
    });
  }
  for (const st of input.stock) {
    s.lowStock += lowStockContribution(!!st.lowStock, !!st.archived);
  }
  return s;
}

/** A month bucket that carries no information (all counters zero, no customers). */
export function isEmptyMonth(b: MonthAgg): boolean {
  return (
    b.in === 0 &&
    b.out === 0 &&
    b.orderCount === 0 &&
    b.ticketSum === 0 &&
    b.unpaidTotal === 0 &&
    b.unpaidCount === 0 &&
    Object.keys(b.customers).length === 0
  );
}

/**
 * Returns a copy keeping only the most recent `keep` NON-empty month buckets, so
 * the single summary doc stays bounded AND exactly matches a fresh recompute
 * (which never materializes an untouched month). "YYYY-MM" keys sort
 * chronologically.
 */
export function pruneMonths(s: SummaryData, keep = 18): SummaryData {
  const keys = Object.keys(s.months)
    .filter((k) => !isEmptyMonth(s.months[k]))
    .sort();
  const kept = keys.slice(-keep);
  const months: Record<string, MonthAgg> = {};
  for (const k of kept) months[k] = s.months[k];
  return { openOrders: s.openOrders, lowStock: s.lowStock, months };
}

/** activeCustomers for a month bucket = number of distinct customer keys. */
export function activeCustomerCount(b: MonthAgg | undefined): number {
  return b ? Object.keys(b.customers).length : 0;
}
