import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import type {
  ConsumptionDraw,
  Order,
  OrderChannel,
  OrderItem,
  OrderStatus,
  PayMethod,
  Product,
} from "@/lib/types";
import { orderCode } from "@/lib/format";
import { buildConsumptionRequests } from "./consumption";
import { getProduct } from "./products";
import { consumeWork, readStockWork, reverseWork, stockPatch } from "./stock";

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
    stockConsumed: d.stockConsumed ?? [],
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

/**
 * Cheap count of "open" orders (novo|preparando|entrega) for the nav badge.
 * Uses a Firestore aggregation query — one metered read, no doc scan.
 * TODO(pre-compute): materialize this into a per-store counter doc updated
 * inside the order create/status transactions (see plan · pre-compute principle).
 */
export async function countOpenOrders(storeId: string): Promise<number> {
  const snap = await ordersCol(storeId)
    .where("status", "in", ["novo", "preparando", "entrega"])
    .count()
    .get();
  return snap.data().count;
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

function stockItemRef(storeId: string, itemId: string) {
  return storeRef(storeId).collection("stockItems").doc(itemId);
}

function productRef(storeId: string, productId: string) {
  return storeRef(storeId).collection("products").doc(productId);
}

/** Loads the products referenced by an order's lines, keyed by id (misses skipped). */
async function fetchLineProducts(
  storeId: string,
  items: OrderItem[],
): Promise<Map<string, Product>> {
  const ids = [...new Set(items.map((i) => i.productId))];
  const loaded = await Promise.all(ids.map((id) => getProduct(storeId, id)));
  const map = new Map<string, Product>();
  loaded.forEach((p, i) => {
    if (p) map.set(ids[i], p);
  });
  return map;
}

/**
 * Read-only planner for an order's stock consumption. Reverses `oldDraws` (the
 * order's currently-held manifest) and applies `newItems` (null = hold nothing,
 * e.g. a cancel) onto a SINGLE working copy per item — reverse-then-apply on the
 * same copy so a diff-update nets correctly, and Firestore's all-reads-before-
 * all-writes rule is honoured (this issues only tx.get; the returned `commit`
 * runs the writes later). Best-effort: never throws; short stock is clamped.
 * Returns the new manifest (the draws the order now holds).
 */
async function planConsumption(
  tx: FirebaseFirestore.Transaction,
  storeId: string,
  orderId: string,
  by: string,
  oldDraws: ConsumptionDraw[],
  newItems: OrderItem[] | null,
  products: Map<string, Product> | null,
): Promise<{ draws: ConsumptionDraw[]; commit: () => void }> {
  const req =
    newItems && products
      ? buildConsumptionRequests(newItems, products)
      : { insumos: new Map<string, { amount: number; uses: number }>(), produced: new Map<string, number>() };

  const stockIds = new Set<string>();
  const productIds = new Set<string>();
  for (const d of oldDraws) {
    if (d.kind === "insumo") stockIds.add(d.refId);
    else productIds.add(d.refId);
  }
  for (const id of req.insumos.keys()) stockIds.add(id);
  for (const id of req.produced.keys()) productIds.add(id);

  // ---- READ phase: fetch every touched doc once. ----
  const stock = new Map<
    string,
    { ref: FirebaseFirestore.DocumentReference; work: ReturnType<typeof readStockWork> }
  >();
  for (const id of stockIds) {
    const ref = stockItemRef(storeId, id);
    const snap = await tx.get(ref);
    if (snap.exists) stock.set(id, { ref, work: readStockWork(snap.data()!) });
  }
  const prod = new Map<string, { ref: FirebaseFirestore.DocumentReference; produced: number }>();
  for (const id of productIds) {
    const ref = productRef(storeId, id);
    const snap = await tx.get(ref);
    if (snap.exists) prod.set(id, { ref, produced: snap.data()!.producedStock ?? 0 });
  }

  // ---- PLAN phase: pure math on the working copies, collecting writes. ----
  const code = orderCode(orderId);
  const movements: { itemId: string; doc: Record<string, unknown> }[] = [];
  const draws: ConsumptionDraw[] = [];

  // 1) Reverse the old manifest (return what this order was holding).
  for (const d of oldDraws) {
    if (d.kind === "insumo") {
      const entry = stock.get(d.refId);
      if (!entry) continue;
      const { movements: ms } = reverseWork(entry.work, d, {
        refOrder: orderId,
        refItem: `Estorno #${code}`,
        by,
      });
      for (const doc of ms) movements.push({ itemId: d.refId, doc });
    } else {
      const entry = prod.get(d.refId);
      if (entry) entry.produced += d.amount ?? 0;
    }
  }

  // 2) Apply the new requests (draw what this order now holds).
  for (const [itemId, need] of req.insumos) {
    const entry = stock.get(itemId);
    if (!entry) continue;
    const { movements: ms, draw } = consumeWork(itemId, entry.work, {
      amount: need.amount,
      uses: need.uses,
      reason: "VENDA",
      refOrder: orderId,
      refItem: `Pedido #${code}`,
      by,
    });
    for (const doc of ms) movements.push({ itemId, doc });
    draws.push(draw);
  }
  for (const [productId, qty] of req.produced) {
    const entry = prod.get(productId);
    if (!entry) continue;
    const applied = Math.min(qty, entry.produced);
    entry.produced -= applied;
    draws.push({ kind: "produced", refId: productId, amount: applied });
  }

  const commit = () => {
    for (const { ref, work } of stock.values()) tx.update(ref, stockPatch(work));
    for (const { ref, produced } of prod.values()) tx.update(ref, { producedStock: produced });
    for (const m of movements) {
      tx.set(stockItemRef(storeId, m.itemId).collection("movements").doc(), m.doc);
    }
  };

  return { draws, commit };
}

export async function createOrder(
  storeId: string,
  input: OrderInput,
  payment: { paid: boolean; payMethod: PayMethod | null } = {
    paid: false,
    payMethod: null,
  },
  by = "sistema",
): Promise<string> {
  const db = getDb();
  const ref = ordersCol(storeId).doc();
  const now = Timestamp.now();
  const total = orderTotal(input.items);
  const products = await fetchLineProducts(storeId, input.items);

  let stockConsumed: ConsumptionDraw[] = [];
  await db.runTransaction(async (tx) => {
    // Reads first: plan consumption, then recompute aggregates.
    const plan = await planConsumption(tx, storeId, ref.id, by, [], input.items, products);
    stockConsumed = plan.draws;
    if (input.customerId) {
      await recomputeAggregates(tx, storeId, input.customerId, {
        orderId: ref.id,
        total,
        createdAt: now,
      });
    }
    // Writes.
    plan.commit();
    tx.set(ref, {
      ...input,
      total,
      status: "novo",
      paid: payment.paid,
      payMethod: payment.paid ? payment.payMethod : null,
      stockConsumed,
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
  by = "sistema",
): Promise<void> {
  const db = getDb();
  const ref = ordersCol(storeId).doc(orderId);
  const products = await fetchLineProducts(storeId, input.items);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Pedido não encontrado.");
    const current = snap.data()!;
    const cancelled = current.status === "cancelado";
    const total = orderTotal(input.items);
    const oldDraws = (current.stockConsumed ?? []) as ConsumptionDraw[];

    // Reconcile stock: reverse the old manifest, then re-apply for the new
    // items — but only if the order is active (a cancelled order holds nothing).
    const plan = await planConsumption(
      tx,
      storeId,
      orderId,
      by,
      oldDraws,
      cancelled ? null : input.items,
      cancelled ? null : products,
    );

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

    plan.commit();
    tx.update(ref, { ...input, total, stockConsumed: plan.draws, updatedAt: Timestamp.now() });
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
  by = "sistema",
): Promise<void> {
  const db = getDb();
  const ref = ordersCol(storeId).doc(orderId);
  // Pre-load products so an uncancel can re-apply consumption for the stored items.
  const existing = await getOrder(storeId, orderId);
  const products = existing
    ? await fetchLineProducts(storeId, existing.items)
    : new Map<string, Product>();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Pedido não encontrado.");
    const current = snap.data()!;
    const wasCancelled = current.status === "cancelado";
    const willBeCancelled = status === "cancelado";
    const oldDraws = (current.stockConsumed ?? []) as ConsumptionDraw[];

    // Cancel → reverse and hold nothing. Uncancel → re-apply from stored items.
    let plan: { draws: ConsumptionDraw[]; commit: () => void } | null = null;
    if (!wasCancelled && willBeCancelled) {
      plan = await planConsumption(tx, storeId, orderId, by, oldDraws, null, null);
    } else if (wasCancelled && !willBeCancelled) {
      plan = await planConsumption(
        tx,
        storeId,
        orderId,
        by,
        [],
        (current.items ?? []) as OrderItem[],
        products,
      );
    }

    if (current.customerId && wasCancelled !== willBeCancelled) {
      await recomputeAggregates(tx, storeId, current.customerId, {
        orderId,
        total: willBeCancelled ? null : (current.total ?? 0),
        createdAt: willBeCancelled ? null : current.createdAt,
      });
    }

    if (plan) plan.commit();
    const patch: Record<string, unknown> = { status, updatedAt: Timestamp.now() };
    if (plan) patch.stockConsumed = plan.draws;
    tx.update(ref, patch);
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
