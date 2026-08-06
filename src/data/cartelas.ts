import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import { cartelaCode, computeStatus, coverageFor } from "@/lib/cartelas";
import type {
  Cartela,
  CartelaManualReason,
  CartelaManualUse,
  CartelaStatus,
  CartelaUse,
  OrderItem,
} from "@/lib/types";

function storeRef(storeId: string) {
  return getDb().collection("stores").doc(storeId);
}

function cartelasCol(storeId: string) {
  return storeRef(storeId).collection("cartelas");
}

// `at` is written as a plain ISO string by the app's own consume path
// (data/cartelas.ts's `uses.push({ ..., at: nowIso })`), matching CartelaUse's
// `string` type. But it's read back verbatim here rather than normalized like
// purchasedAt/createdAt/updatedAt — so any writer that stores a Firestore
// Timestamp instead (a seed/migration script, say) leaves a class instance
// sitting in the array. That doesn't fail here; it fails later, opaquely, the
// moment this Cartela crosses a Server Action boundary to a Client Component
// (React's "Only plain objects... can be passed" error) — which silently
// empties the Pedidos order drawer's cartela offer strip since the caller's
// fetch has no `.catch`. Normalizing on read closes off that whole class of
// bug at the source, the same way the other three timestamp fields already do.
function toIsoUseAt(at: unknown): string {
  if (typeof at === "string") return at;
  if (at instanceof Timestamp) return at.toDate().toISOString();
  return "";
}

// Existing docs predate the manual-adjustment feature and have no `kind`
// field on their `uses[]` entries at all — normalize to "order" on read, the
// same way toIsoUseAt() normalizes a legacy Timestamp `at`. Never a
// migration: Firestore is schemaless, so old docs simply lack the field.
function normalizeUse(u: CartelaUse): CartelaUse {
  return u.kind === "manual"
    ? { ...u, at: toIsoUseAt(u.at) }
    : { ...u, kind: "order", at: toIsoUseAt(u.at) };
}

function toCartela(id: string, d: FirebaseFirestore.DocumentData): Cartela {
  return {
    id,
    code: cartelaCode(id),
    customerId: d.customerId,
    customerName: d.customerName,
    paidUses: d.paidUses ?? 0,
    totalUses: d.totalUses ?? 0,
    unitValue: d.unitValue ?? 0,
    amount: d.amount ?? 0,
    uses: ((d.uses ?? []) as CartelaUse[]).map(normalizeUse),
    status: (d.status ?? "ativa") as CartelaStatus,
    soldOnOrderId: d.soldOnOrderId,
    purchasedAt: d.purchasedAt?.toDate().toISOString() ?? "",
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
    updatedAt: d.updatedAt?.toDate().toISOString() ?? "",
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listCartelas(
  storeId: string,
  opts: { limit?: number } = {},
): Promise<Cartela[]> {
  let q = cartelasCol(storeId).orderBy("purchasedAt", "desc");
  if (opts.limit) q = q.limit(opts.limit);
  const snap = await q.get();
  return snap.docs.map((doc) => toCartela(doc.id, doc.data()));
}

/** Cartelas for a customer — feeds the customer detail card and the Pedidos offer strip (filter client-side). */
export async function listCartelasByCustomer(
  storeId: string,
  customerId: string,
): Promise<Cartela[]> {
  const snap = await cartelasCol(storeId).where("customerId", "==", customerId).get();
  return snap.docs.map((doc) => toCartela(doc.id, doc.data()));
}

export async function getCartela(storeId: string, cartelaId: string): Promise<Cartela | null> {
  const snap = await cartelasCol(storeId).doc(cartelaId).get();
  return snap.exists ? toCartela(snap.id, snap.data()!) : null;
}

/** Cheap count for the nav badge — active (non-cancelled, non-exhausted) cartelas. Single-field query. */
export async function countCartelasAtivas(storeId: string): Promise<number> {
  const snap = await cartelasCol(storeId).where("status", "==", "ativa").count().get();
  return snap.data().count;
}

/**
 * Cancels a cartela: a pure status flag (no money movement — the sale's
 * revenue lives on the order that sold it, not a separate mirror). Hides it
 * from the active list/KPIs/Pedidos-offer-eligibility once cancelled.
 */
export async function cancelCartela(storeId: string, cartelaId: string): Promise<void> {
  await cartelasCol(storeId)
    .doc(cartelaId)
    .update({ status: "cancelada" satisfies CartelaStatus, updatedAt: Timestamp.now() });
}

export interface ManualCartelaUseInput {
  count: number;
  reason: CartelaManualReason;
  note?: string;
  /** Acting user's display name — see CartelaManualUse.by. */
  by: string;
}

/**
 * Marks `count` uses as consumed with no order/product behind them — staff
 * flagging a redemption that happened without going through a sale. A single
 * doc read/validate/write transaction, same shape as markPackageEmpty in
 * data/stock.ts: no plan/commit split needed since only one cartela doc is
 * touched. Status is re-derived via computeStatus(), so an adjustment that
 * exhausts the last uses flips the cartela to "esgotada" for free.
 */
export async function markManualCartelaUse(
  storeId: string,
  cartelaId: string,
  input: ManualCartelaUseInput,
): Promise<void> {
  const ref = cartelasCol(storeId).doc(cartelaId);
  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Cartela não encontrada.");
    const data = snap.data()!;
    if ((data.status ?? "ativa") === "cancelada") {
      throw new Error("Esta cartela foi cancelada e não pode ser ajustada.");
    }
    const cartela = toCartela(cartelaId, data);
    const remaining = cartela.totalUses - cartela.uses.length;
    if (input.count > remaining) {
      throw new Error(`Saldo insuficiente: restam ${remaining} uso${remaining === 1 ? "" : "s"}.`);
    }
    const nowIso = new Date().toISOString();
    const newUses: CartelaManualUse[] = Array.from({ length: input.count }, () => ({
      kind: "manual",
      reason: input.reason,
      note: input.note,
      by: input.by,
      at: nowIso,
    }));
    const nextUses = [...cartela.uses, ...newUses];
    const candidate: Cartela = { ...cartela, uses: nextUses };
    tx.update(ref, { uses: nextUses, status: computeStatus(candidate), updatedAt: Timestamp.now() });
  });
}

// ---------------------------------------------------------------------------
// planCartelas — the order-transaction planner
// ---------------------------------------------------------------------------

export interface CartelaConsumedEntry {
  cartelaId: string;
  uses: number;
}

export interface CartelaOldManifest {
  /** The order's currently-held punches (Order.cartelaConsumed), reversed before re-applying. */
  consumed: CartelaConsumedEntry[];
  /**
   * How many cartelaSale lines this order has ALREADY created (Order.cartelaSold.length).
   * `newItems`'s cartelaSale lines beyond this count are genuinely new sales; the
   * first `soldCount` of them are the ones already recorded — never re-created.
   */
  soldCount: number;
}

export interface CartelaPlanResult {
  /** The order's new cartelaConsumed manifest — persist verbatim on the order doc. */
  consumed: CartelaConsumedEntry[];
  /** Ids of cartelas newly created by THIS call — append (never replace) to Order.cartelaSold. */
  soldIds: string[];
  /** Write phase — call after every tx.get() in the whole transaction has run. */
  commit: () => void;
}

/**
 * Read-only planner for an order's cartela activity, modeled directly on
 * planConsumption in ./orders.ts: all tx.get() reads happen up front (read
 * phase), pure math plans the diff, and the returned `commit()` issues the
 * writes later (write phase) — the same all-reads-before-all-writes shape
 * Firestore transactions require.
 *
 * Two things a single order can do to cartelas, both driven by `newItems`:
 *  - A `cartelaSale` line SELLS a brand-new cartela (qty always 1).
 *  - A `cartelaUse` line PUNCHES an existing cartela, one punch per unit.
 *
 * Reversal mirrors the stockConsumed pattern exactly: every use this order
 * previously appended is tagged with its own orderId, so "give back what this
 * order was holding" is just "drop every use entry whose orderId matches" —
 * no need to know which specific punches they were data structurally, only
 * that the position in `uses` decides brinde-vs-paid (see src/lib/cartelas.ts).
 *
 * `newItems: null` means "hold nothing" (a cancel) — every held punch is
 * reversed and no cartela is (re)created. Cancelling/reactivating the
 * cartelas this order itself SOLD is a separate, explicit cascade (see
 * cancelSoldCartelas/reactivateSoldCartelas below) — planCartelas only ever
 * grows Order.cartelaSold, it never un-sells.
 *
 * THROWS (never clamps) when a requested punch would over-redeem a cartela,
 * reference an unknown/cancelled cartela, or cover a line priced below the
 * cartela's fixed unitValue (decision #1 — redemption is blocked outright,
 * never partial).
 */
export async function planCartelas(
  tx: FirebaseFirestore.Transaction,
  storeId: string,
  orderId: string,
  orderCode: string,
  customer: { id: string; name: string },
  oldManifest: CartelaOldManifest,
  newItems: OrderItem[] | null,
): Promise<CartelaPlanResult> {
  const useLines = (newItems ?? []).filter(
    (i): i is OrderItem & { cartelaUse: NonNullable<OrderItem["cartelaUse"]> } => !!i.cartelaUse,
  );

  // ---- READ phase: every cartela this order previously held, plus every
  // cartela a cartelaUse line now references. New sales need no read (a
  // pre-allocated ref is a pure write, no different from ordersCol(...).doc()).
  const ids = new Set<string>();
  for (const e of oldManifest.consumed) ids.add(e.cartelaId);
  for (const line of useLines) ids.add(line.cartelaUse.cartelaId);

  const cartelas = new Map<string, { ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }>();
  for (const id of ids) {
    const ref = cartelasCol(storeId).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error(`Cartela não encontrada: ${id}`);
    cartelas.set(id, { ref, data: snap.data()! });
  }

  // ---- PLAN phase: pure math on working copies of each touched cartela's `uses`. ----
  const working = new Map<string, CartelaUse[]>();
  for (const [id, { data }] of cartelas) {
    working.set(id, [...((data.uses ?? []) as CartelaUse[])]);
  }

  // 1) Reverse: drop every use entry this order previously appended. Manual
  // adjustments have no orderId and must never be touched by this reversal.
  for (const { cartelaId } of oldManifest.consumed) {
    const uses = working.get(cartelaId);
    if (!uses) continue;
    working.set(
      cartelaId,
      uses.filter((u) => u.kind === "manual" || u.orderId !== orderId),
    );
  }

  // 2) Validate the new request against the reversed (clean) balances.
  const neededByCartela = new Map<string, number>();
  for (const line of useLines) {
    neededByCartela.set(
      line.cartelaUse.cartelaId,
      (neededByCartela.get(line.cartelaUse.cartelaId) ?? 0) + line.cartelaUse.uses,
    );
  }
  for (const [cartelaId, totalNeeded] of neededByCartela) {
    const entry = cartelas.get(cartelaId);
    if (!entry) throw new Error(`Cartela não encontrada: ${cartelaId}`);
    if (entry.data.status === "cancelada") {
      throw new Error("Esta cartela foi cancelada e não pode ser usada.");
    }
    const uses = working.get(cartelaId) ?? [];
    const totalUses = (entry.data.totalUses ?? 0) as number;
    const remaining = Math.max(0, totalUses - uses.length);
    if (totalNeeded > remaining) {
      throw new Error(`Saldo insuficiente na cartela #${cartelaCode(cartelaId)} para este uso.`);
    }
  }
  for (const line of useLines) {
    const entry = cartelas.get(line.cartelaUse.cartelaId)!;
    const unitValue = (entry.data.unitValue ?? 0) as number;
    if (coverageFor(line.cartelaUse.listPrice, unitValue) === null) {
      throw new Error(
        `O preço deste item é menor que o valor de um uso da cartela (${(unitValue / 100).toFixed(2)}).`,
      );
    }
  }

  // 3) Apply: append one use entry per punched unit, tagged to this order.
  const nowIso = new Date().toISOString();
  for (const line of useLines) {
    const uses = working.get(line.cartelaUse.cartelaId)!;
    for (let i = 0; i < line.cartelaUse.uses; i++) {
      uses.push({ kind: "order", orderId, orderCode, productName: line.name, at: nowIso });
    }
  }

  // 4) New sales: cartelaSale lines beyond what's already recorded on the
  // order are genuinely new this call — everything up to `soldCount` was
  // already created by an earlier call and must never be re-created.
  const saleLines = (newItems ?? []).filter((i) => !!i.cartelaSale);
  const newSaleLines = saleLines.slice(oldManifest.soldCount);
  if (newSaleLines.length > 0 && !customer.id) {
    throw new Error("Uma cartela só pode ser vendida para um cliente identificado.");
  }
  const soldIds: string[] = [];
  const newCartelaWrites: { ref: FirebaseFirestore.DocumentReference; doc: Record<string, unknown> }[] = [];
  const nowTs = Timestamp.now();
  for (const line of newSaleLines) {
    const sale = line.cartelaSale!;
    const ref = cartelasCol(storeId).doc();
    soldIds.push(ref.id);
    newCartelaWrites.push({
      ref,
      doc: {
        customerId: customer.id,
        customerName: customer.name,
        paidUses: sale.paidUses,
        totalUses: sale.totalUses,
        unitValue: sale.unitValue,
        amount: sale.paidUses * sale.unitValue,
        uses: [],
        status: "ativa" satisfies CartelaStatus,
        soldOnOrderId: orderId,
        purchasedAt: nowTs,
        createdAt: nowTs,
        updatedAt: nowTs,
      },
    });
  }

  // ---- Build the order's new consumed manifest: how many punches (across
  // all lines) it holds on each touched cartela, after reverse+apply. ----
  const consumed: CartelaConsumedEntry[] = [];
  for (const [cartelaId, uses] of working) {
    const mine = uses.filter((u) => u.kind === "order" && u.orderId === orderId).length;
    if (mine > 0) consumed.push({ cartelaId, uses: mine });
  }

  const commit = () => {
    const now = Timestamp.now();
    for (const [id, { ref, data }] of cartelas) {
      const uses = working.get(id)!;
      // Re-derive status from the SAME candidate shape computeStatus expects —
      // single source of truth, never re-implemented here (a manually
      // "cancelada" cartela stays cancelled; otherwise ativa/esgotada follows
      // the new uses.length vs totalUses).
      const candidate: Cartela = { ...toCartela(id, data), uses, status: (data.status ?? "ativa") as CartelaStatus };
      tx.update(ref, { uses, status: computeStatus(candidate), updatedAt: now });
    }
    for (const w of newCartelaWrites) tx.set(w.ref, w.doc);
  };

  return { consumed, soldIds, commit };
}

// ---------------------------------------------------------------------------
// Cancel/reactivate cascade — a cartela SOLD by an order tracks its own
// status; cancelling/uncancelling the SELLING order cascades onto it. This is
// deliberately separate from planCartelas (which only ever grows
// Order.cartelaSold, never un-sells): mirrors how planConsumption itself
// knows nothing about "cancel" as a concept beyond newItems=null, leaving the
// cancel-specific bookkeeping to the setOrderStatus caller.
// ---------------------------------------------------------------------------

/**
 * Cascade half of an order cancel: flips every cartela this order sold to
 * "cancelada" (pure status flag, same as cancelCartela — no read needed,
 * these docs are known to exist). Call only in the WRITE phase (after every
 * tx.get() in the transaction has already run).
 */
export function cancelSoldCartelas(
  tx: FirebaseFirestore.Transaction,
  storeId: string,
  cartelaIds: string[],
): void {
  const now = Timestamp.now();
  for (const id of cartelaIds) {
    tx.update(cartelasCol(storeId).doc(id), { status: "cancelada" satisfies CartelaStatus, updatedAt: now });
  }
}

/**
 * Cascade half of an order UNcancel: recomputes status for every cartela
 * this order sold, from its own uses vs totalUses — ignoring the stored
 * "cancelada" flag (this IS the explicit un-cancel signal). Read-phase-safe:
 * call alongside planCartelas, before any writes; invoke the returned
 * closure in the write phase.
 */
export async function reactivateSoldCartelas(
  tx: FirebaseFirestore.Transaction,
  storeId: string,
  cartelaIds: string[],
): Promise<() => void> {
  const reads: { ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }[] = [];
  for (const id of cartelaIds) {
    const ref = cartelasCol(storeId).doc(id);
    const snap = await tx.get(ref);
    if (snap.exists) reads.push({ ref, data: snap.data()! });
  }
  return () => {
    const now = Timestamp.now();
    for (const { ref, data } of reads) {
      const usesLen = ((data.uses ?? []) as unknown[]).length;
      const totalUses = (data.totalUses ?? 0) as number;
      const status: CartelaStatus = totalUses - usesLen <= 0 ? "esgotada" : "ativa";
      tx.update(ref, { status, updatedAt: now });
    }
  };
}
