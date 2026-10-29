import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import {
  bumpSummary,
  lowStockContribution,
  readSummaryTx,
  summaryLowStockDelta,
  writeSummaryTx,
} from "./summary";
import { OPEN_ADJUST_REASON_LABELS } from "@/lib/types";
import { movementKind, type MovementKind } from "@/lib/stock-ledger";
import type {
  ConsumptionDraw,
  ConsumptionMode,
  OpenAdjustReason,
  StockCategory,
  StockItem,
  StockLocation,
  StockMovement,
  StockMovementReason,
  StockMovementType,
  StockUnit,
} from "@/lib/types";

function stockCol(storeId: string) {
  return getDb().collection("stores").doc(storeId).collection("stockItems");
}

function toItem(id: string, d: FirebaseFirestore.DocumentData): StockItem {
  return {
    id,
    name: d.name,
    category: d.category,
    unit: d.unit,
    tracked: d.tracked ?? false,
    pkgLabel: d.pkgLabel,
    pkgLabelPlural: d.pkgLabelPlural,
    pkgSize: d.pkgSize,
    sealed: d.sealed ?? 0,
    depSealed: d.depSealed ?? 0,
    open: d.open ?? 0,
    qty: d.qty ?? 0,
    continuousUse: d.continuousUse ?? false,
    consumptionMode: d.consumptionMode ?? (d.continuousUse ? "continuo" : "medido"),
    openPkg: d.openPkg ?? false,
    usos: d.usos ?? 0,
    lastUsos: d.lastUsos ?? undefined,
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
  pkgLabelPlural?: string;
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
  initial: { sealed: number; open: number; depSealed?: number } = { sealed: 0, open: 0 },
  by?: string,
): Promise<string> {
  const depSealed = input.tracked ? (initial.depSealed ?? 0) : 0;
  const state = derive(input.tracked, input.pkgSize, initial.sealed, initial.open);
  const ref = stockCol(storeId).doc();
  const lowStock = computeLowStock({ ...input, ...state, openPkg: false });
  const openingQty = input.tracked ? initial.sealed : initial.open;
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
    depSealed,
    openPkg: false,
    usos: 0,
    movementSeq: (openingQty > 0 ? 1 : 0) + (depSealed > 0 ? 1 : 0),
    lowStock,
    updatedAt: FieldValue.serverTimestamp(),
  });
  // Summary: a new active low-stock item bumps the low-stock badge count. (These
  // writes aren't transactional, so the summary is updated in its own tx after —
  // a small non-atomic window on this low-frequency admin path; noted in Stage 3.)
  const newLow = lowStockContribution(lowStock, input.archived ?? false);
  // Opening balance → a "Compra" (ENTRADA) history entry, so a freshly
  // created item shows where its stock came from (design: "geram uma entrada").
  if (openingQty > 0) {
    const at = Timestamp.now();
    const movRef = ref.collection("movements").doc();
    await movRef.set({
      type: "entrada",
      qty: openingQty,
      byPackage: input.tracked,
      loc: "loja",
      seq: 1,
      price: input.cost ?? null,
      reason: "ENTRADA",
      refOrder: null,
      refItem: null,
      by: by ?? "sistema",
      at,
    });
  }
  if (depSealed > 0) {
    await ref.collection("movements").doc().set({
      type: "entrada",
      qty: depSealed,
      byPackage: true,
      loc: "deposito",
      seq: openingQty > 0 ? 2 : 1,
      price: input.cost ?? null,
      reason: "ENTRADA",
      refOrder: null,
      refItem: null,
      by: by ?? "sistema",
      at: Timestamp.now(),
    });
  }
  if (newLow) {
    await bumpSummary(storeId, (s) => summaryLowStockDelta(s, newLow));
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
      // update() ignores undefined fields, so clearing the manual plural
      // (back to the derived "+s") needs an explicit field delete.
      pkgLabelPlural: input.pkgLabelPlural || FieldValue.delete(),
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
  /** Depósito movements are by package only; default loja. */
  loc?: StockLocation;
  /** Effective date (purchase date). Earlier than the latest movement → the whole ledger is replayed in date order. */
  at?: Date;
  by: string;
}

export interface UpdateMovementInput {
  qty: number;
  price?: number;
}

type MovementWrite = Record<string, unknown> & { seq?: number };

function applyReplayCostPatch(
  patch: Record<string, unknown>,
  item: FirebaseFirestore.DocumentData,
  prev: FirebaseFirestore.DocumentData,
  latestPurchasePrice: number | undefined,
): void {
  if (latestPurchasePrice != null) {
    patch.cost = latestPurchasePrice;
    return;
  }
  if (
    prev.type === "entrada" &&
    prev.price != null &&
    prev.price > 0 &&
    item.cost === prev.price
  ) {
    patch.cost = FieldValue.delete();
  }
}

function isEditableMovement(
  d: FirebaseFirestore.DocumentData,
): boolean {
  return (
    (d.type === "entrada" || d.type === "saida") &&
    !d.refOrder &&
    !d.refItem
  );
}

function nextMovementSeq(d: FirebaseFirestore.DocumentData, count = 1): number {
  return (d.movementSeq ?? 0) + count;
}

type ReplayBaseline = Pick<StockWork, "sealed" | "depSealed" | "open" | "openPkg" | "usos">;

function replayMovementState(
  item: FirebaseFirestore.DocumentData,
  movements: FirebaseFirestore.DocumentData[],
  baseline: ReplayBaseline = {
    sealed: 0,
    depSealed: 0,
    open: 0,
    openPkg: false,
    usos: 0,
  },
): { work: StockWork; latestPurchasePrice?: number } {
  const work: StockWork = {
    tracked: item.tracked ?? false,
    pkgSize: item.pkgSize ?? 0,
    sealed: baseline.sealed,
    depSealed: baseline.depSealed,
    open: baseline.open,
    openPkg: baseline.openPkg,
    usos: baseline.usos,
    continuousUse: item.continuousUse ?? false,
    consumptionMode: item.consumptionMode ?? (item.continuousUse ? "continuo" : "medido"),
    reorderAt: item.reorderAt ?? 0,
  };
  let latestPurchasePrice: number | undefined;

  for (const d of movements) {
    const qty = d.qty ?? 0;
    const byPackage = d.byPackage ?? false;
    if (byPackage && !Number.isInteger(qty)) {
      throw new Error("Movimentações por embalagem precisam de quantidade inteira.");
    }

    // "Ajustar embalagem aberta": the user overwrote the open balance with a real count — a fact that
    // doesn't depend on what came before it (see adjustOpenBalance).
    if (typeof d.openTo === "number") {
      work.open = d.openTo;
      continue;
    }

    // Depósito only ever holds sealed packages: purchases/corrections there, and transfers out of it.
    if (d.loc === "deposito" && (d.type === "entrada" || d.type === "saida")) {
      if (!work.tracked || !byPackage) throw new Error("Movimentação inválida no histórico.");
      if (d.type === "entrada") {
        work.depSealed += qty;
        if (d.price != null && d.price > 0) latestPurchasePrice = d.price;
      } else {
        if (qty > work.depSealed) throw new Error("A edição deixaria o depósito com estoque insuficiente.");
        work.depSealed -= qty;
      }
      continue;
    }
    if (d.type === "transferencia") {
      if (!work.tracked) throw new Error("Movimentação inválida no histórico.");
      if (qty > work.depSealed) throw new Error("A edição deixaria o depósito com estoque insuficiente.");
      work.depSealed -= qty;
      work.sealed += qty;
      continue;
    }

    switch (d.type as StockMovementType) {
      case "entrada":
        if (work.continuousUse && !byPackage) {
          work.usos = Math.max(0, work.usos - qty);
        } else if (byPackage) {
          if (!work.tracked) throw new Error("Movimentação inválida no histórico.");
          work.sealed += qty;
        } else {
          work.open += qty;
        }
        if (d.price != null && d.price > 0) latestPurchasePrice = d.price;
        break;

      case "saida":
        if (work.continuousUse && !byPackage) {
          if (!work.openPkg) {
            throw new Error("A edição deixaria um item contínuo sem embalagem aberta.");
          }
          work.usos += qty;
          break;
        }
        if (byPackage) {
          if (!work.tracked) throw new Error("Movimentação inválida no histórico.");
          if (
            d.reason === "PERDA" &&
            typeof d.refItem === "string" &&
            d.refItem.startsWith("Embalagem esvaziada")
          ) {
            if (!work.openPkg) {
              throw new Error("A edição deixaria o histórico de embalagem inconsistente.");
            }
            work.openPkg = false;
            work.usos = 0;
            break;
          }
          if (qty > work.sealed) {
            throw new Error("A edição deixaria o estoque atual insuficiente.");
          }
          work.sealed -= qty;
        } else if (work.tracked && work.pkgSize > 0) {
          if (qty > work.sealed * work.pkgSize + work.open) {
            throw new Error("A edição deixaria o estoque atual insuficiente.");
          }
          if (qty > work.open) {
            const toOpen = Math.ceil((qty - work.open) / work.pkgSize);
            work.sealed -= toOpen;
            work.open += toOpen * work.pkgSize;
          }
          work.open -= qty;
        } else {
          if (qty > work.open) {
            throw new Error("A edição deixaria o estoque atual insuficiente.");
          }
          work.open -= qty;
        }
        break;

      case "abertura":
        if (d.src === "deposito") {
          if (!work.tracked || work.depSealed < 1) {
            throw new Error("A edição deixaria o histórico de embalagem inconsistente.");
          }
          work.depSealed -= 1;
        } else {
          if (!work.tracked || work.sealed < 1) {
            throw new Error("A edição deixaria o histórico de embalagem inconsistente.");
          }
          work.sealed -= 1;
        }
        if (d.refItem === "Abriu embalagem") {
          if (work.openPkg) {
            throw new Error("A edição deixaria duas embalagens abertas ao mesmo tempo.");
          }
          work.openPkg = true;
          work.usos = 0;
        } else {
          work.open += work.pkgSize;
        }
        break;
    }
  }

  return { work, latestPurchasePrice };
}

function replayBaselineState(
  item: FirebaseFirestore.DocumentData,
  movements: FirebaseFirestore.DocumentData[],
): ReplayBaseline {
  const replayBaseline = item.replayBaseline;
  if (replayBaseline && typeof replayBaseline === "object") {
    const baseline = replayBaseline as FirebaseFirestore.DocumentData;
    return {
      sealed: baseline.sealed ?? 0,
      depSealed: baseline.depSealed ?? 0,
      open: baseline.open ?? 0,
      openPkg: baseline.openPkg ?? false,
      usos: baseline.usos ?? 0,
    };
  }
  if (!(item.tracked ?? false) || (item.continuousUse ?? false)) {
    return { sealed: 0, depSealed: 0, open: 0, openPkg: false, usos: 0 };
  }
  const { work } = replayMovementState(item, movements);
  return {
    sealed: 0,
    depSealed: 0,
    open: Math.max(0, (item.qty ?? 0) - derive(work.tracked, work.pkgSize, work.sealed, work.open).qty),
    openPkg: false,
    usos: 0,
  };
}

interface MovementEntry {
  id: string;
  data: FirebaseFirestore.DocumentData;
  created: number;
}

function toEntry(doc: FirebaseFirestore.QueryDocumentSnapshot): MovementEntry {
  return { id: doc.id, data: doc.data(), created: doc.createTime?.toMillis() ?? 0 };
}

/**
 * Replay order = the effective date (`at`: a back-dated purchase lands where its date says),
 * then insertion order (`seq`, absent on sale movements), then creation time.
 */
function compareMovements(a: MovementEntry, b: MovementEntry): number {
  const aAt = a.data.at?.toMillis?.() ?? 0;
  const bAt = b.data.at?.toMillis?.() ?? 0;
  if (aAt !== bAt) return aAt - bAt;
  const aSeq = a.data.seq;
  const bSeq = b.data.seq;
  if (typeof aSeq === "number" && typeof bSeq === "number" && aSeq !== bSeq) {
    return aSeq - bSeq;
  }
  return a.created === b.created ? a.id.localeCompare(b.id) : a.created - b.created;
}

/**
 * Applies a stock movement atomically and keeps sealed/open/qty/lowStock
 * consistent. Loose saída on a tracked item auto-opens sealed packages
 * when the open amount runs short. Depósito movements (loc "deposito") are
 * whole packages only and never touch the Loja balance or its low-stock flag.
 * A back-dated entry (`at` before the latest movement) is inserted and the
 * whole ledger replayed in date order, so absolute corrections stay anchors.
 */
export async function applyMovement(
  storeId: string,
  itemId: string,
  input: MovementInput,
): Promise<string> {
  const db = getDb();
  const ref = stockCol(storeId).doc(itemId);
  let name = "";
  const loc: StockLocation = input.loc ?? "loja";
  const at = input.at ? Timestamp.fromDate(input.at) : Timestamp.now();
  if (input.at && input.at.getTime() > Date.now() + 60_000) {
    throw new Error("A data não pode ser futura.");
  }

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Item não encontrado.");
    const d = snap.data()!;
    name = d.name ?? "";
    const movements = ref.collection("movements");
    const latest = input.at ? await tx.get(movements.orderBy("at", "desc").limit(1)) : null;
    const backdated =
      !!latest && !latest.empty && latest.docs[0].data().at.toMillis() > at.toMillis();
    const all = backdated ? await tx.get(movements.orderBy("at", "asc")) : null;
    const summary = await readSummaryTx(tx, storeId);
    const oldLow = d.lowStock ?? false;
    const archived = d.archived ?? false;
    const tracked: boolean = d.tracked ?? false;
    const pkgSize: number = d.pkgSize ?? 0;
    let sealed: number = d.sealed ?? 0;
    let depSealed: number = d.depSealed ?? 0;
    let open: number = d.open ?? 0;

    if (loc === "deposito") {
      if (!tracked) throw new Error("Item não é controlado por embalagem.");
      if (!input.byPackage || input.type === "abertura") {
        throw new Error("O depósito guarda apenas embalagens fechadas.");
      }
    }

    const seq = nextMovementSeq(d);
    const doc = {
      type: input.type,
      qty: input.type === "abertura" ? 1 : input.qty,
      byPackage: input.type === "abertura" ? true : input.byPackage,
      loc,
      seq,
      price: input.price ?? null,
      reason: input.reason ?? (input.type === "entrada" ? "ENTRADA" : "SAIDA"),
      refOrder: input.refOrder ?? null,
      refItem: input.refItem ?? null,
      by: input.by,
      at,
    };

    let patch: Record<string, unknown>;
    if (backdated && all) {
      const entries = [
        ...all.docs.map(toEntry),
        { id: "~new", data: doc, created: Number.MAX_SAFE_INTEGER },
      ].sort(compareMovements);
      const baseline = replayBaselineState(d, all.docs.map((x) => x.data()));
      const { work, latestPurchasePrice } = replayMovementState(
        d,
        entries.map((e) => e.data),
        baseline,
      );
      patch = { ...stockPatch(work), movementSeq: seq };
      if (latestPurchasePrice != null) patch.cost = latestPurchasePrice;
    } else {
      if (loc === "deposito") {
        if (input.type === "entrada") depSealed += input.qty;
        else {
          if (input.qty > depSealed) throw new Error("Embalagens insuficientes no depósito.");
          depSealed -= input.qty;
        }
      } else {
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
      }

      const state = derive(tracked, pkgSize || undefined, sealed, open);
      patch = {
        ...state,
        depSealed,
        movementSeq: seq,
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
    }
    tx.update(ref, patch);
    tx.set(movements.doc(), doc);
    // Stock prices never reach finance: bills are entered manually when paid.
    const lowDelta =
      lowStockContribution(patch.lowStock as boolean, archived) -
      lowStockContribution(oldLow, archived);
    if (lowDelta !== 0) {
      summaryLowStockDelta(summary, lowDelta);
      writeSummaryTx(tx, storeId, summary);
    }
  });
  return name;
}

export async function updateMovement(
  storeId: string,
  itemId: string,
  movementId: string,
  input: UpdateMovementInput,
): Promise<void> {
  const db = getDb();
  const itemRef = stockCol(storeId).doc(itemId);
  const movementRef = itemRef.collection("movements").doc(movementId);

  await db.runTransaction(async (tx) => {
    const itemSnap = await tx.get(itemRef);
    if (!itemSnap.exists) throw new Error("Item não encontrado.");
    const item = itemSnap.data()!;

    const movementSnap = await tx.get(movementRef);
    if (!movementSnap.exists) throw new Error("Movimentação não encontrada.");
    const prev = movementSnap.data()!;
    if (!isEditableMovement(prev)) {
      throw new Error("Movimentações automáticas ou vinculadas são somente leitura.");
    }
    if ((prev.byPackage ?? false) && !Number.isInteger(input.qty)) {
      throw new Error("Movimentações por embalagem precisam de quantidade inteira.");
    }

    const allMovements = await tx.get(itemRef.collection("movements").orderBy("at", "asc"));
    const baseline = replayBaselineState(
      item,
      allMovements.docs.map((doc) => doc.data()),
    );
    const nextPrice = prev.type === "entrada" ? (input.price ?? null) : null;
    const merged = allMovements.docs
      .map(toEntry)
      .sort(compareMovements)
      .map((e) =>
        e.id === movementId
          ? {
              ...e.data,
              qty: input.qty,
              price: nextPrice,
            }
          : e.data,
      );
    const { work, latestPurchasePrice } = replayMovementState(item, merged, baseline);
    const patch = stockPatch(work);
    applyReplayCostPatch(patch, item, prev, latestPurchasePrice);

    const summary = await readSummaryTx(tx, storeId);
    const lowDelta =
      lowStockContribution(patch.lowStock as boolean, item.archived ?? false) -
      lowStockContribution(item.lowStock ?? false, item.archived ?? false);
    if (lowDelta !== 0) summaryLowStockDelta(summary, lowDelta);

    tx.update(itemRef, patch);
    tx.update(movementRef, { qty: input.qty, price: nextPrice });

    if (lowDelta !== 0) writeSummaryTx(tx, storeId, summary);
  });
}

export async function deleteMovement(
  storeId: string,
  itemId: string,
  movementId: string,
): Promise<void> {
  const db = getDb();
  const itemRef = stockCol(storeId).doc(itemId);
  const movementRef = itemRef.collection("movements").doc(movementId);

  await db.runTransaction(async (tx) => {
    const itemSnap = await tx.get(itemRef);
    if (!itemSnap.exists) throw new Error("Item não encontrado.");
    const item = itemSnap.data()!;

    const movementSnap = await tx.get(movementRef);
    if (!movementSnap.exists) throw new Error("Movimentação não encontrada.");
    const prev = movementSnap.data()!;
    if (!isEditableMovement(prev)) {
      throw new Error("Movimentações automáticas ou vinculadas são somente leitura.");
    }

    const allMovements = await tx.get(itemRef.collection("movements").orderBy("at", "asc"));
    const baseline = replayBaselineState(
      item,
      allMovements.docs.map((doc) => doc.data()),
    );
    const remaining = allMovements.docs
      .map(toEntry)
      .sort(compareMovements)
      .filter((e) => e.id !== movementId)
      .map((e) => e.data);
    const { work, latestPurchasePrice } = replayMovementState(item, remaining, baseline);
    const patch = stockPatch(work);
    applyReplayCostPatch(patch, item, prev, latestPurchasePrice);

    const summary = await readSummaryTx(tx, storeId);
    const lowDelta =
      lowStockContribution(patch.lowStock as boolean, item.archived ?? false) -
      lowStockContribution(item.lowStock ?? false, item.archived ?? false);
    if (lowDelta !== 0) summaryLowStockDelta(summary, lowDelta);

    tx.update(itemRef, patch);
    tx.delete(movementRef);

    if (lowDelta !== 0) {
      writeSummaryTx(tx, storeId, summary);
    }
  });
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
  opts: { from?: StockLocation; note?: string } = {},
): Promise<string> {
  const from = opts.from ?? "loja";
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
    if (from === "deposito" ? (d.depSealed ?? 0) < 1 : (d.sealed ?? 0) < 1) {
      throw new Error(from === "deposito" ? "Nenhuma embalagem lacrada no depósito." : "Nenhuma embalagem lacrada em estoque.");
    }
    const summary = await readSummaryTx(tx, storeId);
    // Opening from the depósito never touches the Loja's sealed count (the package goes straight into use).
    const sealed = from === "deposito" ? (d.sealed ?? 0) : (d.sealed ?? 0) - 1;
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
      ...(from === "deposito" ? { depSealed: (d.depSealed ?? 0) - 1 } : {}),
      openPkg: true,
      usos: 0,
      movementSeq: nextMovementSeq(d),
      lowStock: newLow,
      updatedAt: Timestamp.now(),
    });
    tx.set(ref.collection("movements").doc(), {
      type: "abertura",
      qty: 1,
      byPackage: true,
      loc: from === "deposito" ? "ambos" : "loja",
      ...(from === "deposito" ? { src: "deposito" } : {}),
      seq: nextMovementSeq(d),
      price: null,
      reason: "AJUSTE",
      refOrder: null,
      refItem: "Abriu embalagem",
      note: opts.note ?? null,
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
      lastUsos: usos,
      movementSeq: nextMovementSeq(d),
      lowStock: newLow,
      updatedAt: Timestamp.now(),
    });
    tx.set(ref.collection("movements").doc(), {
      type: "saida",
      qty: 1,
      byPackage: true,
      loc: "loja",
      seq: nextMovementSeq(d),
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

export interface OpenAdjustInput {
  /** What is really left in the open package, in base units (whole numbers). */
  open: number;
  /** Optional cause; "PERDA" books a decrease as a loss, anything else as AJUSTE. */
  reason?: OpenAdjustReason;
  /** Display unit for the history note ("un"). */
  unitLabel: string;
  by: string;
}

/**
 * Per-unit items (copos, sachês: tracked, medido, count unit): the user
 * overwrites the open package's calculated balance with the real one. Booked
 * as a loose entrada/saida of the difference (what the timeline shows) carrying
 * a `refItem` note — so it isn't editable from the timeline, a correction being
 * a historical fact — plus the absolute `openTo`, which replay applies as an
 * override instead of re-running the difference.
 */
export async function adjustOpenBalance(
  storeId: string,
  itemId: string,
  input: OpenAdjustInput,
): Promise<{ name: string; from: number; to: number }> {
  const db = getDb();
  const ref = stockCol(storeId).doc(itemId);
  let result = { name: "", from: 0, to: 0 };

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Item não encontrado.");
    const d = snap.data()!;
    const work = readStockWork(d);
    if (!work.tracked || work.continuousUse || work.consumptionMode !== "medido" || work.pkgSize < 1) {
      throw new Error("Este item não controla a embalagem aberta por unidade.");
    }
    const to = input.open;
    if (!Number.isInteger(to) || to < 0) throw new Error("Informe um número inteiro de unidades.");
    const from = work.open;
    const max = Math.max(work.pkgSize, from);
    if (to > max) throw new Error(`A embalagem aberta tem no máximo ${max} unidades.`);
    const delta = to - from;
    if (delta === 0) throw new Error("O saldo informado é o mesmo que o atual.");
    if (input.reason === "PERDA" && delta > 0) throw new Error("Perda só pode reduzir o saldo.");

    const summary = await readSummaryTx(tx, storeId);
    const archived = d.archived ?? false;
    const seq = nextMovementSeq(d);
    work.open = to;
    const patch: Record<string, unknown> = { ...stockPatch(work), movementSeq: seq };
    tx.update(ref, patch);

    const label = input.reason ? OPEN_ADJUST_REASON_LABELS[input.reason] : "Ajuste de saldo";
    const at = Timestamp.now();
    tx.set(ref.collection("movements").doc(), {
      type: delta > 0 ? "entrada" : "saida",
      qty: Math.abs(delta),
      byPackage: false,
      loc: "loja",
      seq,
      price: null,
      reason: input.reason === "PERDA" ? "PERDA" : "AJUSTE",
      refOrder: null,
      refItem: `${label} · ${from} → ${to} ${input.unitLabel}`,
      // The user's real count. Replay (replayMovementState) treats it as an absolute override, so a later
      // edit/delete of an EARLIER movement can't turn this correction into a relative one.
      openTo: to,
      by: input.by,
      at,
    });

    const lowDelta =
      lowStockContribution(patch.lowStock as boolean, archived) -
      lowStockContribution(d.lowStock ?? false, archived);
    if (lowDelta !== 0) {
      summaryLowStockDelta(summary, lowDelta);
      writeSummaryTx(tx, storeId, summary);
    }
    result = { name: d.name ?? "", from, to };
  });
  return result;
}

export interface TransferLine {
  itemId: string;
  /** Whole packages moving Depósito → Loja. */
  qty: number;
}

/**
 * "Transferir para a loja": moves whole sealed packages from the Depósito to the
 * Loja in ONE transaction so every line shares a TR-0001 code. One movement per
 * item (the ledger is per item); it shows on both sides. The Loja's low-stock
 * flag is recomputed since its sealed count grows.
 */
export async function transferToStore(
  storeId: string,
  lines: TransferLine[],
  by: string,
  note?: string,
): Promise<{ trCode: string; count: number }> {
  if (lines.length === 0) throw new Error("Escolha ao menos um item.");
  if (new Set(lines.map((l) => l.itemId)).size !== lines.length) {
    throw new Error("Cada item só pode aparecer uma vez na transferência.");
  }
  const db = getDb();
  const counterRef = db.collection("stores").doc(storeId).collection("meta").doc("stockTransfers");
  let trCode = "";

  await db.runTransaction(async (tx) => {
    const refs = lines.map((l) => stockCol(storeId).doc(l.itemId));
    const [counter, summary, ...snaps] = await Promise.all([
      tx.get(counterRef),
      readSummaryTx(tx, storeId),
      ...refs.map((r) => tx.get(r)),
    ]);
    const seq = ((counter.data()?.seq as number | undefined) ?? 0) + 1;
    trCode = `TR-${String(seq).padStart(4, "0")}`;
    let lowDelta = 0;

    snaps.forEach((snap, i) => {
      const { qty } = lines[i];
      if (!snap.exists) throw new Error("Item não encontrado.");
      if (!Number.isInteger(qty) || qty < 1) throw new Error("Informe um número inteiro de embalagens.");
      const d = snap.data()!;
      const work = readStockWork(d);
      if (!work.tracked) throw new Error(`${d.name} não é controlado por embalagem.`);
      if (qty > work.depSealed) throw new Error(`Depósito sem embalagens suficientes de ${d.name}.`);
      work.depSealed -= qty;
      work.sealed += qty;
      const patch: Record<string, unknown> = { ...stockPatch(work), movementSeq: nextMovementSeq(d) };
      const archived = d.archived ?? false;
      lowDelta +=
        lowStockContribution(patch.lowStock as boolean, archived) -
        lowStockContribution(d.lowStock ?? false, archived);
      tx.update(refs[i], patch);
      tx.set(refs[i].collection("movements").doc(), {
        type: "transferencia",
        qty,
        byPackage: true,
        loc: "ambos",
        seq: nextMovementSeq(d),
        price: null,
        reason: "TRANSFERENCIA",
        refOrder: null,
        refItem: null,
        trCode,
        note: note?.trim() || null,
        by,
        at: Timestamp.now(),
      });
    });

    tx.set(counterRef, { seq }, { merge: true });
    if (lowDelta !== 0) {
      summaryLowStockDelta(summary, lowDelta);
      writeSummaryTx(tx, storeId, summary);
    }
  });
  return { trCode, count: lines.length };
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
  /** Sealed packages in the depósito; consumption never touches it, only transfers/purchases do. */
  depSealed: number;
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
    depSealed: d.depSealed ?? 0,
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
    depSealed: w.depSealed,
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
    loc: "loja",
    price: null,
    reason,
    refOrder: ctx.refOrder ?? null,
    refItem: ctx.refItem ?? null,
    by: ctx.by,
    at: Timestamp.now(),
  };
}

export interface ConsumeRequest {
  /** Whole sealed packages to debit (resale); never opens one. */
  packages?: number;
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

  // Resale: debit whole sealed packages first. Anything the sealed stock can't
  // cover falls back to the item's own mode below (loose open units, or an
  // untracked item) so a sale never silently draws nothing.
  const wantPackages = req.packages ?? 0;
  if (wantPackages > 0) {
    const sold = w.tracked && w.pkgSize > 0 ? Math.min(wantPackages, w.sealed) : 0;
    const rest = wantPackages - sold;
    w.sealed -= sold;
    const pkgMovements: MovementDoc[] = sold > 0 ? [movement("saida", sold, true, req.reason, ctx)] : [];
    if (rest <= 0) {
      return { movements: pkgMovements, draw: { kind: "insumo", refId: itemId, mode: w.consumptionMode, packages: sold }, shortage: 0 };
    }
    const tail = consumeWork(itemId, w, { ...req, packages: 0, amount: rest, uses: rest });
    return {
      movements: [...pkgMovements, ...tail.movements],
      draw: { ...tail.draw, ...(sold > 0 ? { packages: sold } : {}) },
      shortage: tail.shortage,
    };
  }

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
  const packages = draw.packages ?? 0;
  const pkgMovements: MovementDoc[] = [];
  if (packages > 0) {
    w.sealed += packages;
    pkgMovements.push(movement("entrada", packages, true, "AJUSTE", { ...ctx, refItem: ctx.refItem ?? "Estorno" }));
  }
  if (draw.mode === "continuo") {
    const usos = draw.usos ?? 0;
    if (usos > 0) {
      w.usos = Math.max(0, w.usos - usos);
      pkgMovements.push(movement("entrada", usos, false, "AJUSTE", { ...ctx, refItem: ctx.refItem ?? "Estorno" }));
    }
    return { movements: pkgMovements };
  }
  const amount = draw.amount ?? 0;
  if (amount > 0) {
    w.open += amount;
    pkgMovements.push(movement("entrada", amount, false, "AJUSTE", { ...ctx, refItem: ctx.refItem ?? "Estorno" }));
  }
  return { movements: pkgMovements };
}

function toMovement(doc: FirebaseFirestore.QueryDocumentSnapshot): StockMovement {
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
    loc: d.loc ?? "loja",
    trCode: d.trCode ?? undefined,
    note: d.note ?? undefined,
    by: d.by,
    at: d.at?.toDate().toISOString() ?? "",
  };
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
  return snap.docs.map(toMovement);
}

export interface MovementPage {
  rows: StockMovement[];
  /** `at` of the last row scanned, to pass back as `before`; null when the ledger is exhausted. */
  next: string | null;
}

/**
 * Filtered, cursor-paged ledger (newest first). Filters run after the read, so
 * a page keeps scanning batches until it has `limit` matches or runs out.
 */
export async function listMovementsPage(
  storeId: string,
  itemId: string,
  opts: { loc?: StockLocation; kind?: MovementKind; before?: string; limit?: number } = {},
): Promise<MovementPage> {
  const limit = opts.limit ?? 15;
  const col = stockCol(storeId).doc(itemId).collection("movements");
  const rows: StockMovement[] = [];
  let cursor = opts.before ? Timestamp.fromDate(new Date(opts.before)) : null;
  let exhausted = false;
  while (rows.length < limit && !exhausted) {
    let q = col.orderBy("at", "desc").limit(50);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    for (const doc of snap.docs) {
      cursor = doc.data().at;
      const m = toMovement(doc);
      if (opts.loc && m.loc !== opts.loc && m.loc !== "ambos") continue;
      if (opts.kind && movementKind(m) !== opts.kind) continue;
      rows.push(m);
      if (rows.length === limit) break;
    }
    if (snap.size < 50) exhausted = true;
  }
  const more = rows.length === limit && cursor !== null;
  return { rows, next: more ? (rows[rows.length - 1].at || null) : null };
}
