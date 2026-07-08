import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import type {
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
  await ref.set({
    ...input,
    ...state,
    openPkg: false,
    usos: 0,
    lowStock: computeLowStock({ ...input, ...state, openPkg: false }),
    updatedAt: FieldValue.serverTimestamp(),
  });
  // Opening balance → a "Compra" (ENTRADA) history entry, so a freshly
  // created item shows where its stock came from (design: "geram uma entrada").
  const openingQty = input.tracked ? initial.sealed : initial.open;
  if (openingQty > 0) {
    await ref.collection("movements").doc().set({
      type: "entrada",
      qty: openingQty,
      byPackage: input.tracked,
      price: input.cost ?? null,
      reason: "ENTRADA",
      refOrder: null,
      refItem: null,
      by: by ?? "sistema",
      at: Timestamp.now(),
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
    // Re-derive with (possibly changed) tracking config over current counts.
    const state = derive(input.tracked, input.pkgSize, d.sealed ?? 0, d.open ?? 0);
    tx.update(ref, {
      ...input,
      ...state,
      lowStock: computeLowStock({ ...input, ...state, openPkg: d.openPkg ?? false }),
      updatedAt: Timestamp.now(),
    });
  });
}

export async function deleteStockItem(
  storeId: string,
  itemId: string,
): Promise<void> {
  await stockCol(storeId).doc(itemId).delete();
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
): Promise<void> {
  const db = getDb();
  const ref = stockCol(storeId).doc(itemId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Item não encontrado.");
    const d = snap.data()!;
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
    tx.set(ref.collection("movements").doc(), {
      type: input.type,
      qty: input.type === "abertura" ? 1 : input.qty,
      byPackage: input.type === "abertura" ? true : input.byPackage,
      price: input.price ?? null,
      reason: input.reason ?? (input.type === "entrada" ? "ENTRADA" : "SAIDA"),
      refOrder: input.refOrder ?? null,
      refItem: input.refItem ?? null,
      by: input.by,
      at: Timestamp.now(),
    });
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
): Promise<void> {
  const db = getDb();
  const ref = stockCol(storeId).doc(itemId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Item não encontrado.");
    const d = snap.data()!;
    if (!d.continuousUse) throw new Error("Item não é de uso contínuo.");
    if (d.openPkg) throw new Error("Já existe uma embalagem aberta.");
    if ((d.sealed ?? 0) < 1) throw new Error("Nenhuma embalagem lacrada em estoque.");
    const sealed = (d.sealed ?? 0) - 1;
    tx.update(ref, {
      sealed,
      openPkg: true,
      usos: 0,
      lowStock: computeLowStock({ ...d, sealed, openPkg: true }),
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
}

/**
 * contínuo: marks the open package empty. Logs a PERDA carrying how many usos
 * the package served, then leaves no package open (the next open reopens one).
 */
export async function markPackageEmpty(
  storeId: string,
  itemId: string,
  by: string,
): Promise<void> {
  const db = getDb();
  const ref = stockCol(storeId).doc(itemId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Item não encontrado.");
    const d = snap.data()!;
    if (!d.openPkg) throw new Error("Nenhuma embalagem aberta.");
    const usos = d.usos ?? 0;
    tx.update(ref, {
      openPkg: false,
      usos: 0,
      lowStock: computeLowStock({ ...d, openPkg: false }),
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
