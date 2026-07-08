import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import type { FinanceTx } from "@/lib/types";
import {
  monthKey,
  readSummaryTx,
  summaryFinance,
  writeSummaryTx,
} from "./summary";

function financeCol(storeId: string) {
  return getDb().collection("stores").doc(storeId).collection("finance");
}

function toTx(id: string, d: FirebaseFirestore.DocumentData): FinanceTx {
  return {
    id,
    label: d.label,
    category: d.category,
    amount: d.amount ?? 0,
    direction: d.direction,
    source: d.source,
    orderId: d.orderId,
    payMethod: d.payMethod ?? undefined,
    date: d.date?.toDate().toISOString() ?? "",
  };
}

export async function listTransactions(
  storeId: string,
  opts: { since?: Date; limit?: number } = {},
): Promise<FinanceTx[]> {
  let q = financeCol(storeId).orderBy("date", "desc");
  if (opts.since) q = q.where("date", ">=", Timestamp.fromDate(opts.since));
  if (opts.limit) q = q.limit(opts.limit);
  const snap = await q.get();
  return snap.docs.map((doc) => toTx(doc.id, doc.data()));
}

export interface ManualTxInput {
  label: string;
  category: string;
  amount: number; // centavos, positive
  direction: "in" | "out";
  date: string; // ISO
}

export async function createManualTx(
  storeId: string,
  input: ManualTxInput,
): Promise<string> {
  const db = getDb();
  const ref = financeCol(storeId).doc();
  const date = Timestamp.fromDate(new Date(input.date));
  await db.runTransaction(async (tx) => {
    const summary = await readSummaryTx(tx, storeId);
    summaryFinance(summary, {
      mk: monthKey(date.toDate()),
      direction: input.direction,
      amount: input.amount,
    });
    writeSummaryTx(tx, storeId, summary);
    tx.set(ref, {
      label: input.label,
      category: input.category,
      amount: input.amount,
      direction: input.direction,
      source: "manual",
      date,
    });
  });
  return ref.id;
}

/** Only manual transactions can be deleted — automatic mirrors follow their source. */
export async function deleteManualTx(
  storeId: string,
  txId: string,
): Promise<void> {
  const db = getDb();
  const ref = financeCol(storeId).doc(txId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const d = snap.data()!;
    if (d.source !== "manual") {
      throw new Error(
        "Lançamentos automáticos são controlados pela sua origem.",
      );
    }
    const summary = await readSummaryTx(tx, storeId);
    if (d.date) {
      summaryFinance(summary, {
        mk: monthKey((d.date as Timestamp).toDate()),
        direction: d.direction,
        amount: -(d.amount ?? 0),
      });
      writeSummaryTx(tx, storeId, summary);
    }
    tx.delete(ref);
  });
}

// ---------------------------------------------------------------------------
// Auto-expense capture (Stage 2). A stock ENTRADA that carries a purchase price
// mirrors into a deterministic finance OUT row, exactly like an order-payment
// mirrors into an income row. The id is derived from the movement id so a
// re-applied write overwrites in place (idempotent) instead of duplicating.
// Scope: only purchases (event-driven). Payroll/rent/marketing stay MANUAL
// recurring lançamentos — they are not posted from any stock event.
// ---------------------------------------------------------------------------

/** Deterministic finance doc id mirroring a stock purchase movement. */
export function stockPurchaseFinanceId(movementId: string): string {
  return `stock-${movementId}`;
}

/**
 * Finance OUT payload for a stock purchase. `amount` is the total spent on the
 * entrada (unit price × quantity, in centavos) — the movement stores `price` as
 * the per-unit/per-package purchase price, so the caller multiplies by qty.
 */
export function stockPurchaseTxData(input: {
  itemName: string;
  amount: number; // centavos, total, positive
  date: Timestamp;
}) {
  return {
    label: `Compra · ${input.itemName}`,
    category: "compras",
    amount: input.amount,
    direction: "out" as const,
    source: "stock" as const,
    date: input.date,
  };
}
