import "server-only";

import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import { itemLabels, type AuditChange, type AuditSnap } from "@/lib/order-audit";
import type { OrderItem } from "@/lib/types";

/**
 * Append-only history of every change to an order: stores/{id}/orders/{orderId}/audit.
 * Written inside the SAME transaction as the change, so a change can never
 * commit without its entry (unlike the best-effort team activity feed). No
 * update/delete path exists on purpose.
 */
function auditCol(storeId: string, orderId: string) {
  return getDb().collection("stores").doc(storeId).collection("orders").doc(orderId).collection("audit");
}

export type AuditAction = "created" | "edited" | "status" | "payment";

export interface FinanceEffect {
  /** Competência ("YYYY-MM") whose Entradas moved. */
  month: string;
  /** Centavos added (+) or removed (−) from that month's Entradas. */
  amount: number;
}

export interface OrderAuditInput {
  action: AuditAction;
  by: string;
  changes: AuditChange[];
  finance?: FinanceEffect[];
  /** Why — typed by the user (cancelling a paid order requires one). */
  reason?: string;
  /** What triggered it when not a direct action, e.g. cancelling a cartela. */
  cause?: { kind: "cartela"; cartelaId: string };
}

export interface OrderAuditEntry extends Omit<OrderAuditInput, "finance"> {
  id: string;
  finance: FinanceEffect[];
  at: string;
}

export function appendOrderAudit(tx: Transaction, storeId: string, orderId: string, entry: OrderAuditInput): void {
  if (entry.changes.length === 0 && !entry.finance?.length) return;
  tx.set(auditCol(storeId, orderId).doc(), {
    action: entry.action,
    by: entry.by,
    changes: entry.changes,
    finance: entry.finance ?? [],
    reason: entry.reason ?? null,
    cause: entry.cause ?? null,
    at: Timestamp.now(),
  });
}

export async function listOrderAudit(storeId: string, orderId: string): Promise<OrderAuditEntry[]> {
  const snap = await auditCol(storeId, orderId).orderBy("at", "desc").get();
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      action: x.action,
      by: x.by,
      changes: x.changes ?? [],
      finance: x.finance ?? [],
      reason: x.reason ?? undefined,
      cause: x.cause ?? undefined,
      at: (x.at as Timestamp).toDate().toISOString(),
    };
  });
}

/** Snapshot of a stored order doc's audited fields. */
export function snapOfDoc(d: FirebaseFirestore.DocumentData): AuditSnap {
  return {
    status: d.status,
    paid: d.paid ?? false,
    payMethod: d.payMethod ?? null,
    total: d.total ?? 0,
    customerName: d.customerName ?? "",
    channel: d.channel,
    createdAt: (d.createdAt as Timestamp).toDate().toISOString(),
    sellerEmail: d.sellerEmail ?? null,
    notes: d.notes ?? null,
    items: itemLabels((d.items ?? []) as OrderItem[]),
  };
}
