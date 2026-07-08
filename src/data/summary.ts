import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import {
  computeSummaryFrom,
  emptyMonth,
  emptySummary,
  pruneMonths,
  type ChannelCounts,
  type MonthAgg,
  type SummaryData,
} from "@/lib/summary-core";

export type { MonthAgg, SummaryData } from "@/lib/summary-core";
export {
  activeCustomerCount,
  customerKey,
  isOpenStatus,
  lowStockContribution,
  monthKey,
  summaryAddCustomer,
  summaryAddOrder,
  summaryArchiveCustomer,
  summaryFinance,
  summaryLowStockDelta,
  summaryOpenDelta,
  summaryReceivable,
  summaryRemoveOrder,
} from "@/lib/summary-core";

export function summaryRef(storeId: string) {
  return getDb()
    .collection("stores")
    .doc(storeId)
    .collection("meta")
    .doc("summary");
}

function mapSummary(d: FirebaseFirestore.DocumentData): SummaryData {
  const months: Record<string, MonthAgg> = {};
  const raw = (d.months ?? {}) as Record<string, Partial<MonthAgg>>;
  for (const [k, v] of Object.entries(raw)) {
    const ch = (v.channels ?? {}) as Partial<ChannelCounts>;
    months[k] = {
      ...emptyMonth(),
      in: v.in ?? 0,
      out: v.out ?? 0,
      orderCount: v.orderCount ?? 0,
      ticketSum: v.ticketSum ?? 0,
      unpaidTotal: v.unpaidTotal ?? 0,
      unpaidCount: v.unpaidCount ?? 0,
      customers: v.customers ?? {},
      channels: {
        instagram: ch.instagram ?? 0,
        whatsapp: ch.whatsapp ?? 0,
        loja: ch.loja ?? 0,
      },
      sellers: v.sellers ?? {},
      newCustomers: v.newCustomers ?? 0,
    };
  }
  return {
    openOrders: d.openOrders ?? 0,
    lowStock: d.lowStock ?? 0,
    activeCustomers: d.activeCustomers ?? 0,
    months,
  };
}

/** Serializes a working summary for Firestore (prunes old months, stamps time). */
function serialize(s: SummaryData): Record<string, unknown> {
  const pruned = pruneMonths(s);
  return {
    openOrders: Math.max(0, pruned.openOrders),
    lowStock: Math.max(0, pruned.lowStock),
    activeCustomers: Math.max(0, pruned.activeCustomers),
    months: pruned.months,
    updatedAt: Timestamp.now(),
  };
}

/** Non-transactional read for page loads. Returns null when the doc is absent. */
export async function readSummary(storeId: string): Promise<SummaryData | null> {
  const snap = await summaryRef(storeId).get();
  return snap.exists ? mapSummary(snap.data()!) : null;
}

/**
 * Transactional read (returns a mutable working copy, empty if absent). Call
 * during a transaction's READ phase; mutate with the summary-core mutators as
 * you compute; then persist with writeSummaryTx during the WRITE phase.
 */
export async function readSummaryTx(
  tx: FirebaseFirestore.Transaction,
  storeId: string,
): Promise<SummaryData> {
  const snap = await tx.get(summaryRef(storeId));
  return snap.exists ? mapSummary(snap.data()!) : emptySummary();
}

export function writeSummaryTx(
  tx: FirebaseFirestore.Transaction,
  storeId: string,
  s: SummaryData,
): void {
  tx.set(summaryRef(storeId), serialize(s));
}

/**
 * Applies an incremental change to the summary in its OWN transaction. For the
 * non-transactional write paths (item create/delete, manual finance) where the
 * source write can't share a transaction with the summary update.
 */
export async function bumpSummary(
  storeId: string,
  apply: (s: SummaryData) => void,
): Promise<void> {
  const db = getDb();
  await db.runTransaction(async (tx) => {
    const s = await readSummaryTx(tx, storeId);
    apply(s);
    writeSummaryTx(tx, storeId, s);
  });
}

/**
 * Full recompute from the collections — for backfill (seed) and verification,
 * NOT per request. Reads all orders/finance/stock for the store (bounded by the
 * store's own volume); the materialized doc is what per-request reads consume.
 */
export async function computeSummary(storeId: string): Promise<SummaryData> {
  const store = getDb().collection("stores").doc(storeId);
  const [ordersSnap, financeSnap, stockSnap, customersSnap] = await Promise.all([
    store.collection("orders").get(),
    store.collection("finance").get(),
    store.collection("stockItems").get(),
    store.collection("customers").get(),
  ]);
  return computeSummaryFrom({
    orders: ordersSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        status: d.status,
        total: d.total ?? 0,
        paid: d.paid ?? false,
        customerId: d.customerId ?? null,
        customerName: d.customerName ?? "",
        createdAt: d.createdAt?.toDate() ?? new Date(0),
        channel: d.channel,
        items: d.items ?? [],
      };
    }),
    finance: financeSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        direction: d.direction,
        amount: d.amount ?? 0,
        date: d.date?.toDate() ?? new Date(0),
      };
    }),
    stock: stockSnap.docs.map((doc) => {
      const d = doc.data();
      return { lowStock: d.lowStock ?? false, archived: d.archived ?? false };
    }),
    customers: customersSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        since: d.since?.toDate() ?? new Date(0),
        archived: d.archived ?? false,
      };
    }),
  });
}

/** Recomputes and overwrites the summary doc (backfill entry point). */
export async function refreshSummary(storeId: string): Promise<SummaryData> {
  const s = await computeSummary(storeId);
  await summaryRef(storeId).set(serialize(s));
  return s;
}
