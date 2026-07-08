import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import { stockPurchaseFinanceId, stockPurchaseTxData } from "./finance";
import {
  bumpSummary,
  lowStockContribution,
  monthKey,
  readSummaryTx,
  summaryFinance,
  summaryLowStockDelta,
  writeSummaryTx,
} from "./summary";
import type {
  ConsumptionDraw,
  ConsumptionMode,
  StockCategory,
  StockItem,
  StockMovement,
  StockMovementReason,
  StockMovementType,
  StockUnit,
} from "@/lib/types";

function stockCol(storeId: string) {
  return getDb().collection("stores").doc(storeId).collection("stockItems");
}

function financeDoc(storeId: string, id: string) {
  return getDb().collection("stores").doc(storeId).collection("finance").doc(id);
}

function toItem(id: string, d: FirebaseFirestore.DocumentData): StockItem {
  return {
    id,
    name: d.name,
    category: d.category,
    unit: d.unit,
    tracked: d.tracked ?? false,
    pkgLabel: d.pkgLabel,
    pkgSize: d.pkgSize,
    sealed: d.sealed ?? 0,
    open: d.open ?? 0,
    qty: d.qty ?? 0,
    continuousUse: d.continuousUse ?? false,
    consumptionMode: d.consumptionMode ?? (d.continuousUse ? "continuo" : "medido"),
    openPkg: d.openPkg ?? false,
    usos: d.usos ?? 0,
    resellable: d.resellable ?? false,
    cost: d.cost,
    sellPrice: d.sellPrice,
    reorderAt: d.reorderAt ?? 0,
    lowStock: d.lowStock ?? false,
    yieldPct: d.yieldPct,
    archived: d.archived ?? false,
    updatedAt: d.updatedAt?.toDate().toISOString() ?? "",
  };
}

/** Ledger invariant: tracked items always satisfy qty = sealed*pkgSize + open. */
function derive(tracked: boolean, pkgSize: number | undefined, sealed: number, open: number) {
  const qty = tracked && pkgSize ? sealed * pkgSize + open : open;
  return { sealed, open, qty };
}

/**
 * Low-stock test in the design's package-based terms. contínuo items count
 * whole packages (sealed + the open one) against a package threshold; measured
 * tracked items compare base-unit qty against reorderAt packages × pkgSize;
 * untracked items compare loose qty against reorderAt units.
 */
function computeLowStock(f: {
  tracked?: boolean;
  continuousUse?: boolean;
  pkgSize?: number;
  sealed?: number;
  open?: number;
  qty?: number;
  openPkg?: boolean;
  reorderAt?: number;
}): boolean {
  const tracked = f.tracked ?? false;
  const continuo = f.continuousUse ?? false;
  const pkgSize = f.pkgSize || 1;
  const reorderAt = f.reorderAt ?? 0;
  const usable = continuo
    ? (f.sealed ?? 0) + (f.openPkg ? 1 : 0)
    : (f.qty ?? 0);
  const thr = tracked && !continuo ? reorderAt * pkgSize : reorderAt;
  return usable <= thr;
}

export async function listStockItems(storeId: string): Promise<StockItem[]> {
  const snap = await stockCol(storeId).orderBy("name").get();
  return snap.docs.map((doc) => toItem(doc.id, doc.data()));
}

/**
 * Cheap count of active low-stock items for the Estoque nav dot.
 * Aggregation query — one metered read, no doc scan.
 * TODO(pre-compute): materialize into a per-store counter doc updated inside
 * applyMovement (see plan · pre-compute principle).
 */
export async function countLowStock(storeId: string): Promise<number> {
  const snap = await stockCol(storeId)
    .where("archived", "==", false)
    .where("lowStock", "==", true)
    .count()
    .get();
  return snap.data().count;
}

/**
 * Targeted list of active low-stock items for the dashboard's "Estoque baixo"
 * strip — a bounded query (two equality filters + limit), NOT a full scan.
 * The badge COUNT comes from the summary; this only fetches the few names/qtys
 * the strip renders. Composite index (archived, lowStock) in firestore.indexes.json.
 */
export async function listLowStock(
  storeId: string,
  max = 6,
): Promise<StockItem[]> {
  const snap = await stockCol(storeId)
    .where("archived", "==", false)
    .where("lowStock", "==", true)
    .limit(max)
    .get();
  return snap.docs.map((doc) => toItem(doc.id, doc.data()));
}

export async function getStockItem(
  storeId: string,
  itemId: string,
): Promise<StockItem | null> {
  const snap = await stockCol(storeId).doc(itemId).get();
  return snap.exists ? toItem(snap.id, snap.data()!) : null;
}

export interface StockItemInput {
  name: string;
  category: StockCategory;
  unit: StockUnit;
  tracked: boolean;
  pkgLabel?: string;
  pkgSize?: number;
  continuousUse: boolean;
  consumptionMode: ConsumptionMode;
  resellable: boolean;
  cost?: number;
  sellPrice?: number;
  reorderAt: number;
  yieldPct?: number;
  archived?: boolean;
}

export async function createStockItem(
  storeId: string,
  input: StockItemInput,
  initial: { sealed: number; open: number } = { sealed: 0, open: 0 },
  by?: string,
): Promise<string> {
  const state = derive(input.tracked, input.pkgSize, initial.sealed, initial.open);
  const ref = stockCol(storeId).doc();
  const lowStock = computeLowStock({ ...input, ...state, openPkg: false });
  await ref.set({
    ...input,
    // In-app creation → mark manual so the catalog fresh-sync (importCatalog's
    // deleteAbsent) NEVER deletes this doc, even though it has a random id not
    // in the import JSON's slug set.
    source: "manual",
    // Persist an explicit boolean: the low-stock queries (listLowStock /
    // countLowStock) filter `where("archived","==",false)`, and Firestore
    // equality does NOT match a missing field — so an item created without it
    // would be invisible to the dashboard strip and the nav badge.
    archived: input.archived ?? false,
    ...state,
    openPkg: false,
    usos: 0,
    lowStock,
    updatedAt: FieldValue.serverTimestamp(),
  });
  // Summary: a new active low-stock item bumps the low-stock badge count. (These
  // writes aren't transactional, so the summary is updated in its own tx after —
  // a small non-atomic window on this low-frequency admin path; noted in Stage 3.)
  const newLow = lowStockContribution(lowStock, input.archived ?? false);
  // Opening balance → a "Compra" (ENTRADA) history entry, so a freshly
  // created item shows where its stock came from (design: "geram uma entrada").
  const openingQty = input.tracked ? initial.sealed : initial.open;
  let purchaseOut: { amount: number; mk: string } | null = null;
  if (openingQty > 0) {
    const at = Timestamp.now();
    const movRef = ref.collection("movements").doc();
    await movRef.set({
      type: "entrada",
      qty: openingQty,
      byPackage: input.tracked,
      price: input.cost ?? null,
      reason: "ENTRADA",
      refOrder: null,
      refItem: null,
      by: by ?? "sistema",
      at,
    });
    // Opening purchase with a known unit cost → auto-expense mirror (idempotent).
    if (input.cost != null && input.cost > 0) {
      await financeDoc(storeId, stockPurchaseFinanceId(movRef.id)).set(
        stockPurchaseTxData({
          itemName: input.name,
          amount: input.cost * openingQty,
          date: at,
        }),
      );
      purchaseOut = { amount: input.cost * openingQty, mk: monthKey(at.toDate()) };
    }
  }
  if (newLow || purchaseOut) {
    await bumpSummary(storeId, (s) => {
      if (newLow) summaryLowStockDelta(s, newLow);
      if (purchaseOut) summaryFinance(s, { mk: purchaseOut.mk, direction: "out", amount: purchaseOut.amount });
    });
  }
  return ref.id;
}

export async function updateStockItem(
  storeId: string,
  itemId: string,
  input: StockItemInput,
): Promise<void> {
  const db = getDb();
  const ref = stockCol(storeId).doc(itemId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Item não encontrado.");
    const d = snap.data()!;
    const summary = await readSummaryTx(tx, storeId);
    // Re-derive with (possibly changed) tracking config over current counts.
    const state = derive(input.tracked, input.pkgSize, d.sealed ?? 0, d.open ?? 0);
    const newLow = computeLowStock({ ...input, ...state, openPkg: d.openPkg ?? false });
    // Both lowStock and archived can flip here → recompute the badge contribution.
    const delta =
      lowStockContribution(newLow, input.archived ?? false) -
      lowStockContribution(d.lowStock ?? false, d.archived ?? false);
    if (delta !== 0) {
      summaryLowStockDelta(summary, delta);
      writeSummaryTx(tx, storeId, summary);
    }
    tx.update(ref, {
      ...input,
      ...state,
      lowStock: newLow,
      updatedAt: Timestamp.now(),
    });
  });
}

export async function deleteStockItem(
  storeId: string,
  itemId: string,
): Promise<void> {
  const db = getDb();
  const ref = stockCol(storeId).doc(itemId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const d = snap.data()!;
    const summary = await readSummaryTx(tx, storeId);
    const delta = -lowStockContribution(d.lowStock ?? false, d.archived ?? false);
    if (delta !== 0) {
      summaryLowStockDelta(summary, delta);
      writeSummaryTx(tx, storeId, summary);
    }
    tx.delete(ref);
  });
}

export interface MovementInput {
  type: StockMovementType;
  /** entrada/saida amount; packages when byPackage, else base units. Ignored for abertura. */
  qty: number;
  byPackage: boolean;
  price?: number;
  reason?: StockMovementReason;
  refOrder?: string;
  refItem?: string;
  by: string;
}

/**
 * Applies a stock movement atomically and keeps sealed/open/qty/lowStock
 * consistent. Loose saída on a tracked item auto-opens sealed packages
 * when the open amount runs short.
 */
export async function applyMovement(
  storeId: string,
  itemId: string,
  input: MovementInput,
): Promise<string> {
  const db = getDb();
  const ref = stockCol(storeId).doc(itemId);
  let name = "";

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Item não encontrado.");
    const d = snap.data()!;
    name = d.name ?? "";
    const summary = await readSummaryTx(tx, storeId);
    const oldLow = d.lowStock ?? false;
    const archived = d.archived ?? false;
    const tracked: boolean = d.tracked ?? false;
    const pkgSize: number = d.pkgSize ?? 0;
    let sealed: number = d.sealed ?? 0;
    let open: number = d.open ?? 0;

    switch (input.type) {
      case "entrada":
        if (input.byPackage) {
          if (!tracked) throw new Error("Item não é controlado por embalagem.");
          sealed += input.qty;
        } else {
          open += input.qty;
        }
        break;

      case "saida":
        if (input.byPackage) {
          if (!tracked) throw new Error("Item não é controlado por embalagem.");
          if (input.qty > sealed) throw new Error("Embalagens insuficientes em estoque.");
          sealed -= input.qty;
        } else if (tracked && pkgSize > 0) {
          const need = input.qty;
          if (need > sealed * pkgSize + open) {
            throw new Error("Quantidade insuficiente em estoque.");
          }
          if (need > open) {
            const toOpen = Math.ceil((need - open) / pkgSize);
            sealed -= toOpen;
            open += toOpen * pkgSize;
          }
          open -= need;
        } else {
          if (input.qty > open) throw new Error("Quantidade insuficiente em estoque.");
          open -= input.qty;
        }
        break;

      case "abertura": {
        if (!tracked) throw new Error("Item não é controlado por embalagem.");
        if (sealed < 1) throw new Error("Nenhuma embalagem lacrada em estoque.");
        sealed -= 1;
        open += pkgSize;
        break;
      }
    }

    const state = derive(tracked, pkgSize || undefined, sealed, open);
    const patch: Record<string, unknown> = {
      ...state,
      lowStock: computeLowStock({
        tracked,
        continuousUse: d.continuousUse ?? false,
        pkgSize,
        ...state,
        openPkg: d.openPkg ?? false,
        reorderAt: d.reorderAt ?? 0,
      }),
      updatedAt: Timestamp.now(),
    };
    // An entrada refreshes the item's stored cost to the latest purchase price
    // (per package for tracked items, per base unit otherwise).
    if (input.type === "entrada" && input.price != null) patch.cost = input.price;
    tx.update(ref, patch);
    const at = Timestamp.now();
    const movRef = ref.collection("movements").doc();
    tx.set(movRef, {
      type: input.type,
      qty: input.type === "abertura" ? 1 : input.qty,
      byPackage: input.type === "abertura" ? true : input.byPackage,
      price: input.price ?? null,
      reason: input.reason ?? (input.type === "entrada" ? "ENTRADA" : "SAIDA"),
      refOrder: input.refOrder ?? null,
      refItem: input.refItem ?? null,
      by: input.by,
      at,
    });
    // Auto-expense: a priced entrada is a purchase → mirror into finance.
    // Deterministic id (stock-{movementId}) keeps it idempotent on re-run.
    let purchaseOut = 0;
    if (input.type === "entrada" && input.price != null && input.price > 0) {
      purchaseOut = input.price * input.qty;
      tx.set(
        financeDoc(storeId, stockPurchaseFinanceId(movRef.id)),
        stockPurchaseTxData({
          itemName: name,
          amount: purchaseOut,
          date: at,
        }),
      );
    }
    // Summary: low-stock badge delta (+ the purchase's finance `out`).
    const lowDelta =
      lowStockContribution(patch.lowStock as boolean, archived) -
      lowStockContribution(oldLow, archived);
    if (lowDelta !== 0) summaryLowStockDelta(summary, lowDelta);
    if (purchaseOut > 0) {
      summaryFinance(summary, {
        mk: monthKey(at.toDate()),
        direction: "out",
        amount: purchaseOut,
      });
    }
    if (lowDelta !== 0 || purchaseOut > 0) writeSummaryTx(tx, storeId, summary);
  });
  return name;
}

/**
 * contínuo: opens the next sealed package. Decrements sealed, marks a package
 * open, and resets the usos counter. Logs an abertura movement so the timeline
 * records when the package was opened.
 */
export async function openNextPackage(
  storeId: string,
  itemId: string,
  by: string,
): Promise<string> {
  const db = getDb();
  const ref = stockCol(storeId).doc(itemId);
  let name = "";
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Item não encontrado.");
    const d = snap.data()!;
    name = d.name ?? "";
    if (!d.continuousUse) throw new Error("Item não é de uso contínuo.");
    if (d.openPkg) throw new Error("Já existe uma embalagem aberta.");
    if ((d.sealed ?? 0) < 1) throw new Error("Nenhuma embalagem lacrada em estoque.");
    const summary = await readSummaryTx(tx, storeId);
    const sealed = (d.sealed ?? 0) - 1;
    const newLow = computeLowStock({ ...d, sealed, openPkg: true });
    const lowDelta =
      lowStockContribution(newLow, d.archived ?? false) -
      lowStockContribution(d.lowStock ?? false, d.archived ?? false);
    if (lowDelta !== 0) {
      summaryLowStockDelta(summary, lowDelta);
      writeSummaryTx(tx, storeId, summary);
    }
    tx.update(ref, {
      sealed,
      openPkg: true,
      usos: 0,
      lowStock: newLow,
      updatedAt: Timestamp.now(),
    });
    tx.set(ref.collection("movements").doc(), {
      type: "abertura",
      qty: 1,
      byPackage: true,
      price: null,
      reason: "AJUSTE",
      refOrder: null,
      refItem: "Abriu embalagem",
      by,
      at: Timestamp.now(),
    });
  });
  return name;
}

/**
 * contínuo: marks the open package empty. Logs a PERDA carrying how many usos
 * the package served, then leaves no package open (the next open reopens one).
 */
export async function markPackageEmpty(
  storeId: string,
  itemId: string,
  by: string,
): Promise<string> {
  const db = getDb();
  const ref = stockCol(storeId).doc(itemId);
  let name = "";
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Item não encontrado.");
    const d = snap.data()!;
    name = d.name ?? "";
    if (!d.openPkg) throw new Error("Nenhuma embalagem aberta.");
    const summary = await readSummaryTx(tx, storeId);
    const usos = d.usos ?? 0;
    const newLow = computeLowStock({ ...d, openPkg: false });
    const lowDelta =
      lowStockContribution(newLow, d.archived ?? false) -
      lowStockContribution(d.lowStock ?? false, d.archived ?? false);
    if (lowDelta !== 0) {
      summaryLowStockDelta(summary, lowDelta);
      writeSummaryTx(tx, storeId, summary);
    }
    tx.update(ref, {
      openPkg: false,
      usos: 0,
      lowStock: newLow,
      updatedAt: Timestamp.now(),
    });
    tx.set(ref.collection("movements").doc(), {
      type: "saida",
      qty: 1,
      byPackage: true,
      price: null,
      reason: "PERDA",
      refOrder: null,
      refItem: `Embalagem esvaziada · ${usos} ${usos === 1 ? "uso" : "usos"}`,
      by,
      at: Timestamp.now(),
    });
  });
  return name;
}

// ---------------------------------------------------------------------------
// Consumption engine (Phase 2). Pure, in-transaction helpers that mutate a
// lightweight working copy of a stock item so several draws (and a reversal of
// old draws) can be folded onto ONE read before a single write — the Firestore
// "all reads before all writes" rule makes this fold necessary. `applyMovement`
// above stays the manual/single-shot path; these are the sale/production path.
// ---------------------------------------------------------------------------

/** Mutable slice of a stock doc the consumption math touches. */
export interface StockWork {
  tracked: boolean;
  pkgSize: number;
  sealed: number;
  open: number;
  openPkg: boolean;
  usos: number;
  continuousUse: boolean;
  consumptionMode: ConsumptionMode;
  reorderAt: number;
}

export function readStockWork(d: FirebaseFirestore.DocumentData): StockWork {
  return {
    tracked: d.tracked ?? false,
    pkgSize: d.pkgSize ?? 0,
    sealed: d.sealed ?? 0,
    open: d.open ?? 0,
    openPkg: d.openPkg ?? false,
    usos: d.usos ?? 0,
    continuousUse: d.continuousUse ?? false,
    consumptionMode: d.consumptionMode ?? (d.continuousUse ? "continuo" : "medido"),
    reorderAt: d.reorderAt ?? 0,
  };
}

/** The Firestore patch that persists a working copy (keeps qty + lowStock in sync). */
export function stockPatch(w: StockWork): Record<string, unknown> {
  const state = derive(w.tracked, w.pkgSize || undefined, w.sealed, w.open);
  return {
    ...state,
    openPkg: w.openPkg,
    usos: w.usos,
    lowStock: computeLowStock({
      tracked: w.tracked,
      continuousUse: w.continuousUse,
      pkgSize: w.pkgSize,
      ...state,
      openPkg: w.openPkg,
      reorderAt: w.reorderAt,
    }),
    updatedAt: Timestamp.now(),
  };
}

type MovementDoc = Record<string, unknown>;

function movement(
  type: StockMovementType,
  qty: number,
  byPackage: boolean,
  reason: StockMovementReason,
  ctx: { refOrder?: string; refItem?: string; by: string },
): MovementDoc {
  return {
    type,
    qty,
    byPackage,
    price: null,
    reason,
    refOrder: ctx.refOrder ?? null,
    refItem: ctx.refItem ?? null,
    by: ctx.by,
    at: Timestamp.now(),
  };
}

export interface ConsumeRequest {
  /** medido: base units to deduct. */
  amount: number;
  /** continuo: uses to tally on the open package. */
  uses: number;
  reason: StockMovementReason;
  refOrder?: string;
  refItem?: string;
  by: string;
}

export interface ConsumeResult {
  movements: MovementDoc[];
  draw: ConsumptionDraw;
  /** Requested minus applied (base units for medido, uses for continuo). */
  shortage: number;
}

/**
 * Best-effort consume against a working copy. Branches on the ITEM's
 * consumptionMode (never throws): medido deducts a measured amount clamped to
 * what exists (auto-opening sealed packages like applyMovement's saída);
 * continuo tallies `uses` onto the open package, auto-opening one if none is
 * open. Returns the exact draw to persist for later reversal.
 */
export function consumeWork(
  itemId: string,
  w: StockWork,
  req: ConsumeRequest,
): ConsumeResult {
  const ctx = { refOrder: req.refOrder, refItem: req.refItem, by: req.by };

  if (w.consumptionMode === "continuo") {
    const uses = req.uses;
    if (uses <= 0) {
      return { movements: [], draw: { kind: "insumo", refId: itemId, mode: "continuo", usos: 0 }, shortage: 0 };
    }
    const movements: MovementDoc[] = [];
    // Need an open package to tally uses onto; auto-open one if possible.
    if (!w.openPkg) {
      if (w.sealed >= 1) {
        w.sealed -= 1;
        w.openPkg = true;
        w.usos = 0;
        movements.push(movement("abertura", 1, true, "AJUSTE", { ...ctx, refItem: "Abriu embalagem" }));
      } else {
        // Nothing to open or use — flag the full shortage, tally nothing.
        return { movements, draw: { kind: "insumo", refId: itemId, mode: "continuo", usos: 0 }, shortage: uses };
      }
    }
    w.usos += uses;
    movements.push(movement("saida", uses, false, req.reason, ctx));
    return { movements, draw: { kind: "insumo", refId: itemId, mode: "continuo", usos: uses }, shortage: 0 };
  }

  // medido
  const need = req.amount;
  if (need <= 0) {
    return { movements: [], draw: { kind: "insumo", refId: itemId, mode: "medido", amount: 0 }, shortage: 0 };
  }
  const available = w.tracked && w.pkgSize > 0 ? w.sealed * w.pkgSize + w.open : w.open;
  const consumed = Math.min(need, available);
  const shortage = need - consumed;
  if (w.tracked && w.pkgSize > 0) {
    if (consumed > w.open) {
      const toOpen = Math.ceil((consumed - w.open) / w.pkgSize);
      w.sealed -= toOpen;
      w.open += toOpen * w.pkgSize;
    }
    w.open -= consumed;
  } else {
    w.open -= consumed;
  }
  const movements: MovementDoc[] = consumed > 0 ? [movement("saida", consumed, false, req.reason, ctx)] : [];
  return { movements, draw: { kind: "insumo", refId: itemId, mode: "medido", amount: consumed }, shortage };
}

/**
 * Exact inverse of a persisted insumo draw against a working copy. medido
 * returns the consumed base units to the loose `open` pool; continuo subtracts
 * the tallied uses (clamped ≥ 0). Auto-opens from consume are intentionally NOT
 * re-sealed — opening a package is a physical event a cancellation can't undo.
 */
export function reverseWork(
  w: StockWork,
  draw: ConsumptionDraw,
  ctx: { refOrder?: string; refItem?: string; by: string },
): { movements: MovementDoc[] } {
  if (draw.kind !== "insumo") return { movements: [] };
  if (draw.mode === "continuo") {
    const usos = draw.usos ?? 0;
    if (usos <= 0) return { movements: [] };
    w.usos = Math.max(0, w.usos - usos);
    return { movements: [movement("entrada", usos, false, "AJUSTE", { ...ctx, refItem: ctx.refItem ?? "Estorno" })] };
  }
  const amount = draw.amount ?? 0;
  if (amount <= 0) return { movements: [] };
  w.open += amount;
  return { movements: [movement("entrada", amount, false, "AJUSTE", { ...ctx, refItem: ctx.refItem ?? "Estorno" })] };
}

export async function listMovements(
  storeId: string,
  itemId: string,
  limit = 20,
): Promise<StockMovement[]> {
  const snap = await stockCol(storeId)
    .doc(itemId)
    .collection("movements")
    .orderBy("at", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      type: d.type,
      qty: d.qty,
      byPackage: d.byPackage ?? false,
      price: d.price ?? undefined,
      reason: d.reason ?? undefined,
      refOrder: d.refOrder ?? undefined,
      refItem: d.refItem ?? undefined,
      by: d.by,
      at: d.at?.toDate().toISOString() ?? "",
    };
  });
}
