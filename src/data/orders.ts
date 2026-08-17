import "server-only";

import { Timestamp } from "firebase-admin/firestore";
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
import { orderMoney, type DiscountInput } from "@/lib/order-money";
import {
  cancelSoldCartelas,
  planCartelas,
  reactivateSoldCartelas,
  type CartelaConsumedEntry,
} from "./cartelas";
import { buildConsumptionRequests } from "./consumption";
import { getProduct } from "./products";
import { loadShakeCatalogsForItems, type ShakeCatalogs } from "./shakes";
import { consumeWork, readStockWork, reverseWork, stockPatch } from "./stock";
import {
  customerKey,
  isOpenStatus,
  lowStockContribution,
  monthKey,
  readSummaryTx,
  summaryAddOrder,
  summaryFinance,
  summaryLowStockDelta,
  summaryOpenDelta,
  summaryReceivable,
  summaryRemoveOrder,
  writeSummaryTx,
  type SummaryData,
} from "./summary";

function storeRef(storeId: string) {
  return getDb().collection("stores").doc(storeId);
}

function ordersCol(storeId: string) {
  return storeRef(storeId).collection("orders");
}

/** The café currently fulfills orders on the spot, so a freshly created order
 *  starts already done rather than entering the novo/preparando/entrega
 *  pipeline — staff can still move it back if that changes. */
const NEW_ORDER_STATUS: OrderStatus = "concluido";

/**
 * Back-compat read-time normalization for "Montar shake" lines: older docs
 * (seed data, historical orders) stored `shake.flavorId: string` (singular).
 * Placed orders are immutable financial records — their stockConsumed/
 * cartelaConsumed reversal manifests were computed against that old shape, so
 * the source doc is NEVER rewritten. Instead every reader goes through this
 * single choke point, which normalizes to `flavorIds: string[]`. An order
 * re-saved through the normal edit path is lazily upgraded for free.
 */
function normalizeItem(raw: FirebaseFirestore.DocumentData): OrderItem {
  if (!raw.shake) return raw as OrderItem;
  const rawShake = raw.shake as Record<string, unknown>;
  const flavorIds =
    (rawShake.flavorIds as string[] | undefined) ??
    (rawShake.flavorId ? [rawShake.flavorId as string] : []);
  return { ...raw, shake: { ...rawShake, flavorIds } } as OrderItem;
}

function toOrder(id: string, d: FirebaseFirestore.DocumentData): Order {
  return {
    id,
    code: orderCode(id),
    customerId: d.customerId ?? null,
    customerName: d.customerName,
    channel: d.channel,
    items: ((d.items ?? []) as FirebaseFirestore.DocumentData[]).map(normalizeItem),
    total: d.total ?? 0,
    status: d.status,
    paid: d.paid ?? false,
    payMethod: d.payMethod ?? null,
    stockConsumed: d.stockConsumed ?? [],
    cartelaConsumed: d.cartelaConsumed ?? [],
    cartelaSold: d.cartelaSold ?? [],
    discount: d.discount ?? null,
    notes: d.notes ?? undefined,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
    updatedAt: d.updatedAt?.toDate().toISOString() ?? "",
  };
}

/** Thin wrapper around order-money's shared computation — kept name/signature
 *  compatible (existing tests import it), with an optional discount added. */
export function orderTotal(items: OrderItem[], discount?: DiscountInput | null): number {
  return orderMoney(items, discount).total;
}

/** A cartela-sale line isn't a real product — never let it pollute "Mais vendidos" seller tallies. */
function sellerItems(items: OrderItem[]): OrderItem[] {
  return items.filter((i) => !i.cartelaSale);
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
  /** Required: every new order references a registered customer. */
  customerId: string;
  customerName: string;
  channel: OrderChannel;
  items: OrderItem[];
  /** Manual order-level discount; server recomputes `amount`, never trusts a client-sent one. */
  discount?: DiscountInput | null;
  /** Free-text order note (trim, max length enforced by the caller's zod schema). */
  notes?: string;
  /** ISO datetime; retroactive "Data da venda" (create: defaults to now when absent;
   *  edit: moves the order's month bucket — see updateOrder). Mirrors the customer
   *  creation `since` precedent — never spread raw into the doc. */
  createdAt?: string;
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
): Promise<() => void> {
  // Read + compute now (read phase); return a closure that writes later. Callers
  // may recompute several customers in one tx (e.g. a reassignment), so the
  // tx.update MUST be deferred — Firestore forbids a read after any write.
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

  return () => {
    tx.update(storeRef(storeId).collection("customers").doc(customerId), {
      orderCount: count,
      totalSpent,
      lastOrderAt: last,
      avgReorderDays,
    });
  };
}

function stockItemRef(storeId: string, itemId: string) {
  return storeRef(storeId).collection("stockItems").doc(itemId);
}

function productRef(storeId: string, productId: string) {
  return storeRef(storeId).collection("products").doc(productId);
}

/**
 * Loads the products referenced by an order's lines, keyed by id (misses
 * skipped). A shake line's brinde is also a Product join (line.shake.brinde.
 * productId) — included here so both order-item display (its live name/price)
 * and buildConsumptionRequests (its recipe draw) can resolve it from this
 * same map without a second fetch.
 */
async function fetchLineProducts(
  storeId: string,
  items: OrderItem[],
): Promise<Map<string, Product>> {
  const ids = new Set(items.map((i) => i.productId));
  for (const item of items) {
    const brindeId = item.shake?.brinde?.productId;
    if (brindeId) ids.add(brindeId);
  }
  const idList = [...ids];
  const loaded = await Promise.all(idList.map((id) => getProduct(storeId, id)));
  const map = new Map<string, Product>();
  loaded.forEach((p, i) => {
    if (p) map.set(idList[i], p);
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
  /** Shared working summary — commit() folds low-stock flips into it. */
  summary: SummaryData,
  shakeCatalogs?: ShakeCatalogs,
): Promise<{ draws: ConsumptionDraw[]; commit: () => void }> {
  const req =
    newItems && products
      ? buildConsumptionRequests(newItems, products, shakeCatalogs)
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
    {
      ref: FirebaseFirestore.DocumentReference;
      work: ReturnType<typeof readStockWork>;
      oldLow: boolean;
      archived: boolean;
    }
  >();
  for (const id of stockIds) {
    const ref = stockItemRef(storeId, id);
    const snap = await tx.get(ref);
    if (snap.exists) {
      const data = snap.data()!;
      stock.set(id, {
        ref,
        work: readStockWork(data),
        oldLow: data.lowStock ?? false,
        archived: data.archived ?? false,
      });
    }
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
    let lowStockDelta = 0;
    for (const { ref, work, oldLow, archived } of stock.values()) {
      const patch = stockPatch(work);
      tx.update(ref, patch);
      lowStockDelta +=
        lowStockContribution(patch.lowStock as boolean, archived) -
        lowStockContribution(oldLow, archived);
    }
    if (lowStockDelta !== 0) summaryLowStockDelta(summary, lowStockDelta);
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
  // Destructure the three new fields out — never spread them raw into the doc
  // (createdAt is an ISO string, not a Timestamp; discount must be the
  // server-computed shape, never a client-sent `amount`).
  const { discount: discountInput, notes, createdAt: createdAtISO, ...rest } = input;
  const money = orderMoney(input.items, discountInput);
  const total = money.total;
  // A R$0 order can never be marked paid — only "nada a cobrar" (paid:false).
  if (payment.paid && total === 0) {
    throw new Error(
      "Pedido sem valor não pode ser marcado como pago — use \"Nada a cobrar\".",
    );
  }
  // Concrete Timestamp (never serverTimestamp()) so every "when this happened"
  // derivation below — doc createdAt/updatedAt, recomputeAggregates, monthKey,
  // and the finance mirror's own date — uses the SAME instant, letting a
  // backdated sale land in the right month everywhere, including Financeiro.
  const now = createdAtISO ? Timestamp.fromDate(new Date(createdAtISO)) : Timestamp.now();
  const products = await fetchLineProducts(storeId, input.items);
  const shakeCatalogs = await loadShakeCatalogsForItems(storeId, input.items);

  let stockConsumed: ConsumptionDraw[] = [];
  let cartelaConsumed: CartelaConsumedEntry[] = [];
  let cartelaSold: string[] = [];
  await db.runTransaction(async (tx) => {
    // Reads first: summary, plan consumption + cartelas, then recompute aggregates.
    const summary = await readSummaryTx(tx, storeId);
    const plan = await planConsumption(
      tx,
      storeId,
      ref.id,
      by,
      [],
      input.items,
      products,
      summary,
      shakeCatalogs,
    );
    stockConsumed = plan.draws;
    const cartelaPlan = await planCartelas(
      tx,
      storeId,
      ref.id,
      orderCode(ref.id),
      { id: input.customerId, name: input.customerName },
      { consumed: [], soldCount: 0 },
      input.items,
    );
    cartelaConsumed = cartelaPlan.consumed;
    cartelaSold = cartelaPlan.soldIds;
    const commitAggregates = input.customerId
      ? await recomputeAggregates(tx, storeId, input.customerId, {
          orderId: ref.id,
          total,
          createdAt: now,
        })
      : null;
    // Summary: a new order enters the current-month aggregates.
    const mk = monthKey(now.toDate());
    summaryAddOrder(summary, {
      mk,
      total,
      custKey: customerKey(input.customerId, input.customerName),
      open: isOpenStatus(NEW_ORDER_STATUS),
      paid: payment.paid,
      channel: input.channel,
      items: sellerItems(input.items),
    });
    // Paid at creation → its finance income mirror lands this month too.
    if (payment.paid) summaryFinance(summary, { mk, direction: "in", amount: total });

    // Writes.
    plan.commit();
    cartelaPlan.commit();
    commitAggregates?.();
    writeSummaryTx(tx, storeId, summary);
    tx.set(ref, {
      ...rest,
      total,
      status: NEW_ORDER_STATUS,
      paid: payment.paid,
      payMethod: payment.paid ? payment.payMethod : null,
      discount: money.discount ?? null,
      notes: notes?.trim() || null,
      stockConsumed,
      cartelaConsumed,
      cartelaSold,
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
  // Same discipline as createOrder: never spread these three raw into the doc.
  const { discount: discountInput, notes, createdAt: createdAtISO, ...rest } = input;
  const products = await fetchLineProducts(storeId, input.items);
  const shakeCatalogs = await loadShakeCatalogsForItems(storeId, input.items);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Pedido não encontrado.");
    const current = snap.data()!;
    const summary = await readSummaryTx(tx, storeId);
    const cancelled = current.status === "cancelado";
    const money = orderMoney(input.items, discountInput);
    const total = money.total;
    const oldTotal = current.total ?? 0;
    const oldDraws = (current.stockConsumed ?? []) as ConsumptionDraw[];
    const oldCartelaConsumed = (current.cartelaConsumed ?? []) as CartelaConsumedEntry[];
    const oldCartelaSold = (current.cartelaSold ?? []) as string[];
    // The finance mirror buckets `in` by its own date, which can differ from the
    // order's createdAt (e.g. paid in a later month) — read it so an amount shift
    // is attributed to the mirror's real month (read phase, before any write).
    const financeMirrorRef = storeRef(storeId)
      .collection("finance")
      .doc(`order-${orderId}`);
    const financeMirrorSnap = current.paid ? await tx.get(financeMirrorRef) : null;

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
      summary,
      cancelled ? undefined : shakeCatalogs,
    );
    // Same reverse-then-reapply shape for cartelas — a cancelled order holds
    // no punches, but its already-sold cartelas are untouched here (see
    // setOrderStatus for the cancel/uncancel cascade on those).
    const cartelaPlan = await planCartelas(
      tx,
      storeId,
      orderId,
      orderCode(orderId),
      { id: input.customerId, name: input.customerName },
      { consumed: oldCartelaConsumed, soldCount: oldCartelaSold.length },
      cancelled ? null : input.items,
    );

    // (a) paidBefore/paidAfter tracked SEPARATELY — an edit can DEMOTE payment
    // (e.g. a "Grátis" discount dropping the total to 0), which the old code's
    // single `paid` var couldn't express.
    const paidBefore = current.paid ?? false;
    const paidAfter = paidBefore && total > 0;

    // (b) the order's month is no longer immutable — `createdAt` can move on
    // edit ("Data da venda" is editable). oldMk from the CURRENTLY STORED
    // createdAt, newMk from the (possibly updated) createdAt.
    const oldCreatedAt = current.createdAt as Timestamp;
    const newCreatedAt = createdAtISO
      ? Timestamp.fromDate(new Date(createdAtISO))
      : oldCreatedAt;

    const affected = new Set<string>();
    if (current.customerId) affected.add(current.customerId);
    if (input.customerId) affected.add(input.customerId);
    const aggregateCommits: Array<() => void> = [];
    for (const customerId of affected) {
      aggregateCommits.push(
        await recomputeAggregates(tx, storeId, customerId, {
          orderId,
          // The updated order counts toward its (new) customer unless cancelled.
          total: !cancelled && customerId === input.customerId ? total : null,
          createdAt:
            !cancelled && customerId === input.customerId ? newCreatedAt : null,
        }),
      );
    }

    // Summary: an active order is re-stated — removed from its OLD month
    // bucket (with paidBefore) and re-added to its NEW month bucket (with
    // paidAfter) — so a cross-month edit correctly MOVES the aggregates
    // instead of corrupting one month or leaving stale numbers in the other.
    // A cancelled order isn't in the buckets, but its (still-present) paid
    // mirror amount does change below.
    const oldMk = monthKey(oldCreatedAt.toDate());
    const newMk = monthKey(newCreatedAt.toDate());
    if (!cancelled) {
      const open = isOpenStatus(current.status);
      summaryRemoveOrder(summary, {
        mk: oldMk,
        total: oldTotal,
        custKey: customerKey(current.customerId ?? null, current.customerName),
        open,
        paid: paidBefore,
        channel: current.channel,
        items: sellerItems((current.items ?? []) as OrderItem[]),
      });
      summaryAddOrder(summary, {
        mk: newMk,
        total,
        custKey: customerKey(input.customerId, input.customerName),
        open,
        paid: paidAfter,
        channel: input.channel,
        items: sellerItems(input.items),
      });
    }

    // (c) Finance mirror: exists iff paid (the existing invariant). A discount
    // demoting an already-paid order to "nada a cobrar" DELETES the mirror and
    // reverses its amount out of the month it was posted in — never leave a
    // stale mirror, and never write a R$0 mirror for a comped order. Staying
    // paid with a changed total just updates the amount and shifts the delta.
    const mirrorDate = financeMirrorSnap?.data()?.date as Timestamp | undefined;
    const mirrorAmount = financeMirrorSnap?.data()?.amount as number | undefined;
    const financeMk = mirrorDate ? monthKey(mirrorDate.toDate()) : oldMk;
    if (paidBefore && !paidAfter) {
      if (mirrorAmount) {
        summaryFinance(summary, { mk: financeMk, direction: "in", amount: -mirrorAmount });
      }
    } else if (paidAfter && total !== oldTotal) {
      summaryFinance(summary, { mk: financeMk, direction: "in", amount: total - oldTotal });
    }

    plan.commit();
    cartelaPlan.commit();
    for (const commit of aggregateCommits) commit();
    writeSummaryTx(tx, storeId, summary);
    // (d) ignoreUndefinedProperties trap: tx.update(ref, {...input}) with
    // discount: undefined would SILENTLY KEEP the old stored discount instead
    // of clearing it. discount/notes are always written explicitly so "no
    // discount"/"no notes" persists as null, never a silent no-op.
    tx.update(ref, {
      ...rest,
      total,
      // paidAfter reflects the demotion computed above (a) — a "Grátis"
      // discount zeroing the total flips the order's own paid/payMethod back
      // to unpaid/nothing-to-charge, not just the summary bucket.
      paid: paidAfter,
      payMethod: paidAfter ? (current.payMethod ?? null) : null,
      discount: money.discount ?? null,
      notes: notes?.trim() || null,
      stockConsumed: plan.draws,
      cartelaConsumed: cartelaPlan.consumed,
      cartelaSold: [...oldCartelaSold, ...cartelaPlan.soldIds],
      createdAt: newCreatedAt,
      updatedAt: Timestamp.now(),
    });
    if (paidBefore && !paidAfter) {
      tx.delete(financeMirrorRef);
    } else if (paidAfter) {
      tx.update(financeMirrorRef, { amount: total });
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
  const shakeCatalogs = existing
    ? await loadShakeCatalogsForItems(storeId, existing.items)
    : undefined;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Pedido não encontrado.");
    const current = snap.data()!;
    const summary = await readSummaryTx(tx, storeId);
    const wasCancelled = current.status === "cancelado";
    const willBeCancelled = status === "cancelado";
    const oldDraws = (current.stockConsumed ?? []) as ConsumptionDraw[];
    const oldCartelaConsumed = (current.cartelaConsumed ?? []) as CartelaConsumedEntry[];
    const cartelaSold = (current.cartelaSold ?? []) as string[];
    const customer = { id: current.customerId ?? "", name: current.customerName ?? "" };

    // Cancel → reverse and hold nothing. Uncancel → re-apply from stored items.
    let plan: { draws: ConsumptionDraw[]; commit: () => void } | null = null;
    let cartelaPlan: Awaited<ReturnType<typeof planCartelas>> | null = null;
    // Uncancel reactivates the cartelas THIS order sold (cascade counterpart
    // to cancelSoldCartelas below) — read phase, before any writes.
    let reactivateSold: (() => void) | null = null;
    if (!wasCancelled && willBeCancelled) {
      plan = await planConsumption(tx, storeId, orderId, by, oldDraws, null, null, summary);
      cartelaPlan = await planCartelas(
        tx,
        storeId,
        orderId,
        orderCode(orderId),
        customer,
        { consumed: oldCartelaConsumed, soldCount: cartelaSold.length },
        null,
      );
    } else if (wasCancelled && !willBeCancelled) {
      plan = await planConsumption(
        tx,
        storeId,
        orderId,
        by,
        [],
        (current.items ?? []) as OrderItem[],
        products,
        summary,
        shakeCatalogs,
      );
      cartelaPlan = await planCartelas(
        tx,
        storeId,
        orderId,
        orderCode(orderId),
        customer,
        { consumed: [], soldCount: cartelaSold.length },
        (current.items ?? []) as OrderItem[],
      );
      if (cartelaSold.length > 0) {
        reactivateSold = await reactivateSoldCartelas(tx, storeId, cartelaSold);
      }
    }

    const commitAggregates =
      current.customerId && wasCancelled !== willBeCancelled
        ? await recomputeAggregates(tx, storeId, current.customerId, {
            orderId,
            total: willBeCancelled ? null : (current.total ?? 0),
            createdAt: willBeCancelled ? null : current.createdAt,
          })
        : null;

    // Summary: cancelling removes the order from the month aggregates; uncancel
    // re-adds it (the finance mirror is untouched by status, so `in` isn't
    // adjusted here). A status change between open/closed states only shifts the
    // open-orders badge count.
    const mk = monthKey((current.createdAt as Timestamp).toDate());
    const total = current.total ?? 0;
    const custKey = customerKey(current.customerId ?? null, current.customerName);
    const paid = current.paid ?? false;
    const channel = current.channel as OrderChannel;
    const items = (current.items ?? []) as OrderItem[];
    if (!wasCancelled && willBeCancelled) {
      summaryRemoveOrder(summary, {
        mk,
        total,
        custKey,
        open: isOpenStatus(current.status),
        paid,
        channel,
        items: sellerItems(items),
      });
    } else if (wasCancelled && !willBeCancelled) {
      summaryAddOrder(summary, {
        mk,
        total,
        custKey,
        open: isOpenStatus(status),
        paid,
        channel,
        items: sellerItems(items),
      });
    } else {
      const delta =
        (isOpenStatus(status) ? 1 : 0) - (isOpenStatus(current.status) ? 1 : 0);
      if (delta !== 0) summaryOpenDelta(summary, delta);
    }

    if (plan) plan.commit();
    if (cartelaPlan) cartelaPlan.commit();
    if (reactivateSold) reactivateSold();
    // Cancel cascade: flip every cartela this order sold to "cancelada" — a
    // pure status flag, blind write (no read needed, mirrors cancelCartela).
    if (!wasCancelled && willBeCancelled && cartelaSold.length > 0) {
      cancelSoldCartelas(tx, storeId, cartelaSold);
    }
    commitAggregates?.();
    writeSummaryTx(tx, storeId, summary);
    const patch: Record<string, unknown> = { status, updatedAt: Timestamp.now() };
    if (plan) patch.stockConsumed = plan.draws;
    if (cartelaPlan) patch.cartelaConsumed = cartelaPlan.consumed;
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
    const summary = await readSummaryTx(tx, storeId);
    // Read the existing mirror so we can back its `in` out of the exact month it
    // was posted in (its date, not the order's) before re-posting / clearing.
    const mirrorSnap = await tx.get(financeRef);

    const wasPaid = current.paid ?? false;
    const cancelled = current.status === "cancelado";
    const total = current.total ?? 0;
    // A R$0 order can never be marked paid — only "nada a cobrar" (paid:false).
    if (paid && total === 0) {
      throw new Error(
        "Pedido sem valor não pode ser marcado como pago — use \"Nada a cobrar\".",
      );
    }
    const orderMk = monthKey((current.createdAt as Timestamp).toDate());
    const now = Timestamp.now();

    tx.update(ref, {
      paid,
      payMethod: paid ? payMethod : null,
      updatedAt: now,
    });

    // Finance `in`: remove the prior mirror's contribution (by its stored month),
    // then add the new one when paid — so incremental matches a fresh recompute
    // that buckets finance by the doc's date.
    if (mirrorSnap.exists) {
      const md = mirrorSnap.data()!;
      const priorMk = md.date ? monthKey((md.date as Timestamp).toDate()) : orderMk;
      summaryFinance(summary, { mk: priorMk, direction: "in", amount: -(md.amount ?? 0) });
    }
    if (paid) {
      summaryFinance(summary, { mk: monthKey(now.toDate()), direction: "in", amount: total });
    }
    // "A receber": an order is a receivable exactly when non-cancelled, unpaid,
    // AND has a non-zero total (a comped/nada-a-cobrar order is never a
    // receivable — mirrors the summary-core unpaid-tally rule).
    if (!cancelled && wasPaid !== paid && total > 0) {
      summaryReceivable(summary, { mk: orderMk, total, sign: paid ? -1 : 1 });
    }
    writeSummaryTx(tx, storeId, summary);

    if (paid) {
      tx.set(financeRef, {
        label: `Pedido #${orderCode(orderId)} · ${current.customerName}`,
        category: "vendas",
        amount: total,
        direction: "in",
        source: "order",
        orderId,
        payMethod,
        date: now,
      });
    } else {
      tx.delete(financeRef);
    }
  });
}
