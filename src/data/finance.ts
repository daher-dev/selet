import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import type { FinanceTx } from "@/lib/types";

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
  const ref = await financeCol(storeId).add({
    label: input.label,
    category: input.category,
    amount: input.amount,
    direction: input.direction,
    source: "manual",
    date: Timestamp.fromDate(new Date(input.date)),
  });
  return ref.id;
}

/** Only manual transactions can be deleted — order mirrors follow the order. */
export async function deleteManualTx(
  storeId: string,
  txId: string,
): Promise<void> {
  const ref = financeCol(storeId).doc(txId);
  const snap = await ref.get();
  if (!snap.exists) return;
  if (snap.data()!.source !== "manual") {
    throw new Error(
      "Lançamentos de pedidos são controlados pelo próprio pedido.",
    );
  }
  await ref.delete();
}
