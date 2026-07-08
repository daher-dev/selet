/**
 * Backfill for the pre-computed per-store summary doc (Stage 3). Seed scripts
 * write collection docs directly (bypassing the app's incremental maintenance),
 * so after seeding we recompute the summary from scratch and write it. Uses the
 * shared PURE core (no server-only) so it runs under plain tsx.
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  computeSummaryFrom,
  pruneMonths,
} from "../../src/lib/summary-core";

export async function refreshStoreSummary(
  db: Firestore,
  storeId: string,
): Promise<void> {
  const store = db.collection("stores").doc(storeId);
  const [ordersSnap, financeSnap, stockSnap] = await Promise.all([
    store.collection("orders").get(),
    store.collection("finance").get(),
    store.collection("stockItems").get(),
  ]);

  const summary = pruneMonths(
    computeSummaryFrom({
      orders: ordersSnap.docs.map((doc) => {
        const d = doc.data();
        return {
          status: d.status,
          total: d.total ?? 0,
          paid: d.paid ?? false,
          customerId: d.customerId ?? null,
          customerName: d.customerName ?? "",
          createdAt: d.createdAt?.toDate() ?? new Date(0),
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
    }),
  );

  await store.collection("meta").doc("summary").set({
    openOrders: summary.openOrders,
    lowStock: summary.lowStock,
    months: summary.months,
    updatedAt: Timestamp.now(),
  });
}
