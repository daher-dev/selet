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
    revendaAmount: d.revendaAmount ?? undefined,
    stockItemId: d.stockItemId ?? undefined,
    payMethod: d.payMethod ?? undefined,
    date: d.date?.toDate().toISOString() ?? "",
    note: d.note ?? undefined,
    createdBy: d.createdBy ?? undefined,
  };
}

export async function listTransactions(
  storeId: string,
  opts: { since?: Date; until?: Date; limit?: number } = {},
): Promise<FinanceTx[]> {
  let q = financeCol(storeId).orderBy("date", "desc");
  if (opts.since) q = q.where("date", ">=", Timestamp.fromDate(opts.since));
  if (opts.until) q = q.where("date", "<", Timestamp.fromDate(opts.until));
  if (opts.limit) q = q.limit(opts.limit);
  const snap = await q.get();
  return snap.docs.map((doc) => toTx(doc.id, doc.data()));
}

/** Current category of a lançamento (undefined when it doesn't exist). */
export async function getTxCategory(storeId: string, txId: string): Promise<string | undefined> {
  const snap = await financeCol(storeId).doc(txId).get();
  return snap.exists ? (snap.data()!.category as string) : undefined;
}

export interface ManualTxInput {
  label: string;
  category: string;
  amount: number; // centavos, positive
  direction: "in" | "out";
  date: string; // ISO
  note?: string;
}

export async function createManualTx(
  storeId: string,
  input: ManualTxInput,
  by?: string,
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
      note: input.note?.trim() || null,
      createdBy: by ?? "sistema",
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

/**
 * Only manual transactions can be edited — automatic mirrors follow their
 * source. Reverses the OLD amount/direction/month's contribution to the
 * summary and applies the NEW one on the same in-memory working copy before
 * the single write, so a direction flip or a month-crossing date edit stays
 * correct (mirrors deleteManualTx's reversal fused with createManualTx's
 * application).
 */
export async function updateManualTx(
  storeId: string,
  txId: string,
  input: ManualTxInput,
): Promise<void> {
  const db = getDb();
  const ref = financeCol(storeId).doc(txId);
  const newDate = Timestamp.fromDate(new Date(input.date));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Lançamento não encontrado.");
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
    }
    summaryFinance(summary, {
      mk: monthKey(newDate.toDate()),
      direction: input.direction,
      amount: input.amount,
    });
    writeSummaryTx(tx, storeId, summary);
    tx.update(ref, {
      label: input.label,
      category: input.category,
      amount: input.amount,
      direction: input.direction,
      date: newDate,
      note: input.note?.trim() || null,
    });
  });
}

