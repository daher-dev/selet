import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import type {
  Order,
  OrderChannel,
  OrderItem,
  OrderStatus,
  PayMethod,
} from "@/lib/types";
import { orderCode } from "@/lib/format";

function storeRef(storeId: string) {
  return getDb().collection("stores").doc(storeId);
}

function ordersCol(storeId: string) {
  return storeRef(storeId).collection("orders");
}

function toOrder(id: string, d: FirebaseFirestore.DocumentData): Order {
  return {
    id,
    code: orderCode(id),
    customerId: d.customerId ?? null,
    customerName: d.customerName,
    channel: d.channel,
    items: d.items ?? [],
    total: d.total ?? 0,
    status: d.status,
    paid: d.paid ?? false,
    payMethod: d.payMethod ?? null,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
    updatedAt: d.updatedAt?.toDate().toISOString() ?? "",
  };
}

export function orderTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
}

export async function listOrders(
  storeId: string,
  opts: { limit?: number; since?: Date } = {},
): Promise<Order[]> {
  let q = ordersCol(storeId).orderBy("createdAt", "desc");
  if (opts.since) q = q.where("createdAt", ">=", Timestamp.fromDate(opts.since));
  if (opts.limit) q = q.limit(opts.limit);
  const snap = await q.get();
  return snap.docs.map((doc) => toOrder(doc.id, doc.data()));
}

export async function listOrdersByCustomer(
  storeId: string,
  customerId: string,
  limit = 5,
): Promise<Order[]> {
  const snap = await ordersCol(storeId)
    .where("customerId", "==", customerId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((doc) => toOrder(doc.id, doc.data()));
}

export async function getOrder(
  storeId: string,
  orderId: string,
): Promise<Order | null> {
  const snap = await ordersCol(storeId).doc(orderId).get();
  return snap.exists ? toOrder(snap.id, snap.data()!) : null;
}

export interface OrderInput {
  customerId: string | null;
  customerName: string;
  channel: OrderChannel;
  items: OrderItem[];
}

/**
 * Recomputes a customer's denormalized aggregates from their orders.
 * Runs INSIDE the given transaction (admin SDK transactions allow queries).
 * Counting reads all the customer's non-cancelled orders — fine at this
 * volume, and always correct (no incremental drift).
 */
async function recomputeAggregates(
  tx: FirebaseFirestore.Transaction,
  storeId: string,
  customerId: string,
  /** pending change applied on top of stored docs (the tx hasn't committed) */
  override?: { orderId: string; total: number | null; createdAt: Timestamp | null },
) {
  const snap = await tx.get(
    ordersCol(storeId)
      .where("customerId", "==", customerId)
      .where("status", "!=", "cancelado"),
  );

  const rows: { total: number; createdAt: Timestamp }[] = [];
  for (const doc of snap.docs) {
    if (override && doc.id === override.orderId) continue;
    const d = doc.data();
    if (d.createdAt) rows.push({ total: d.total ?? 0, createdAt: d.createdAt });
  }
  if (override && override.total !== null && override.createdAt !== null) {
    rows.push({ total: override.total, createdAt: override.createdAt });
  }

  rows.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
  const count = rows.length;
  const totalSpent = rows.reduce((s, r) => s + r.total, 0);
  const last = rows[count - 1]?.createdAt ?? null;
  const first = rows[0]?.createdAt ?? null;
  const avgReorderDays =
    count >= 2 && first && last
      ? (last.toMillis() - first.toMillis()) / (count - 1) / 86_400_000
      : null;

  tx.update(storeRef(storeId).collection("customers").doc(customerId), {
    orderCount: count,
    totalSpent,
    lastOrderAt: last,
    avgReorderDays,
  });
}

export async function createOrder(
  storeId: string,
  input: OrderInput,
  payment: { paid: boolean; payMethod: PayMethod | null } = {
    paid: false,
    payMethod: null,
  },
): Promise<string> {
  const db = getDb();
  const ref = ordersCol(storeId).doc();
  const now = Timestamp.now();
  const total = orderTotal(input.items);

  await db.runTransaction(async (tx) => {
    if (input.customerId) {
      await recomputeAggregates(tx, storeId, input.customerId, {
        orderId: ref.id,
        total,
        createdAt: now,
      });
    }
    tx.set(ref, {
      ...input,
      total,
      status: "novo",
      paid: payment.paid,
      payMethod: payment.paid ? payment.payMethod : null,
      createdAt: now,
      updatedAt: now,
    });
    if (payment.paid) {
      tx.set(storeRef(storeId).collection("finance").doc(`order-${ref.id}`), {
        label: `Pedido #${orderCode(ref.id)} · ${input.customerName}`,
        category: "vendas",
        amount: total,
        direction: "in",
        source: "order",
        orderId: ref.id,
        payMethod: payment.payMethod,
        date: now,
      });
    }
  });
  return ref.id;
}

/** Edits customer/channel/items. Recomputes aggregates for affected customers. */
export async function updateOrder(
  storeId: string,
  orderId: string,
  input: OrderInput,
): Promise<void> {
  const db = getDb();
  const ref = ordersCol(storeId).doc(orderId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Pedido não encontrado.");
    const current = snap.data()!;
    const cancelled = current.status === "cancelado";
    const total = orderTotal(input.items);

    const affected = new Set<string>();
    if (current.customerId) affected.add(current.customerId);
    if (input.customerId) affected.add(input.customerId);
    for (const customerId of affected) {
      await recomputeAggregates(tx, storeId, customerId, {
        orderId,
        // The updated order counts toward its (new) customer unless cancelled.
        total: !cancelled && customerId === input.customerId ? total : null,
        createdAt:
          !cancelled && customerId === input.customerId
            ? current.createdAt
            : null,
      });
    }

    tx.update(ref, { ...input, total, updatedAt: Timestamp.now() });
    // Keep the finance mirror in sync with the new total.
    if (current.paid) {
      tx.update(storeRef(storeId).collection("finance").doc(`order-${orderId}`), {
        amount: total,
      });
    }
  });
}

export async function setOrderStatus(
  storeId: string,
  orderId: string,
  status: OrderStatus,
): Promise<void> {
  const db = getDb();
  const ref = ordersCol(storeId).doc(orderId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Pedido não encontrado.");
    const current = snap.data()!;
    const wasCancelled = current.status === "cancelado";
    const willBeCancelled = status === "cancelado";

    if (current.customerId && wasCancelled !== willBeCancelled) {
      await recomputeAggregates(tx, storeId, current.customerId, {
        orderId,
        total: willBeCancelled ? null : (current.total ?? 0),
        createdAt: willBeCancelled ? null : current.createdAt,
      });
    }
    tx.update(ref, { status, updatedAt: Timestamp.now() });
  });
}

/**
 * Toggles payment. The finance mirror doc has the deterministic ID
 * `order-{orderId}`, so create/delete is idempotent.
 */
export async function setOrderPayment(
  storeId: string,
  orderId: string,
  paid: boolean,
  payMethod: PayMethod | null,
): Promise<void> {
  const db = getDb();
  const ref = ordersCol(storeId).doc(orderId);
  const financeRef = storeRef(storeId).collection("finance").doc(`order-${orderId}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Pedido não encontrado.");
    const current = snap.data()!;

    tx.update(ref, {
      paid,
      payMethod: paid ? payMethod : null,
      updatedAt: Timestamp.now(),
    });

    if (paid) {
      tx.set(financeRef, {
        label: `Pedido #${orderCode(orderId)} · ${current.customerName}`,
        category: "vendas",
        amount: current.total ?? 0,
        direction: "in",
        source: "order",
        orderId,
        payMethod,
        date: FieldValue.serverTimestamp(),
      });
    } else {
      tx.delete(financeRef);
    }
  });
}
