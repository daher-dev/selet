/**
 * Core of scripts/drop-saborizantes-movements.ts, split out so it can be tested
 * against the emulator. Deletes the movement HISTORY of stock items whose name
 * matches, leaving current counts (sealed/open/qty/lowStock) untouched.
 *
 * Plain firebase-admin only (no "server-only"), so it runs under tsx.
 */
import type { Firestore } from "firebase-admin/firestore";

/** Lowercase + strip accents, so "Saborizantés" and "SABORIZANTE" both match. */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Mirrors stockPurchaseFinanceId in src/data/finance.ts (that file is server-only). */
const financeIdFor = (movementId: string) => `stock-${movementId}`;

export interface DropOptions {
  storeId: string;
  /** Normalized substring to look for in the item name. */
  match: string;
  apply: boolean;
  /** Also delete the finance "Compra · …" mirrors of the removed entradas. */
  deleteFinance: boolean;
  log?: (line: string) => void;
}

export interface ItemReport {
  id: string;
  name: string;
  category: string;
  archived: boolean;
  sealed: number;
  open: number;
  qty: number;
  movements: number;
  financeDocs: number;
  financeTotal: number; // centavos
}

export interface DropResult {
  items: ItemReport[];
  movementsDeleted: number;
  financeDeleted: number;
  /** Item names in the store, for the "no match" hint. */
  allNames: string[];
}

const BATCH = 400;

async function deleteRefs(db: Firestore, refs: FirebaseFirestore.DocumentReference[]) {
  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + BATCH)) batch.delete(ref);
    await batch.commit();
  }
}

export async function dropMovements(
  db: Firestore,
  opts: DropOptions,
): Promise<DropResult> {
  const log = opts.log ?? (() => {});
  const store = db.collection("stores").doc(opts.storeId);

  const stockSnap = await store.collection("stockItems").get();
  const allNames = stockSnap.docs.map((d) => String(d.data().name ?? ""));
  const matches = stockSnap.docs.filter((d) =>
    normalize(String(d.data().name ?? "")).includes(opts.match),
  );

  const items: ItemReport[] = [];
  const movementRefs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();

  for (const doc of matches) {
    const d = doc.data();
    const movs = await doc.ref.collection("movements").get();
    movementRefs.set(doc.id, movs.docs);

    // Priced entradas are the ones that mirrored into finance.
    const priced = movs.docs.filter((m) => {
      const x = m.data();
      return x.type === "entrada" && x.price != null && x.price > 0;
    });
    const financeSnaps = await Promise.all(
      priced.map((m) => store.collection("finance").doc(financeIdFor(m.id)).get()),
    );
    const existing = financeSnaps.filter((s) => s.exists);

    items.push({
      id: doc.id,
      name: String(d.name ?? ""),
      category: String(d.category ?? ""),
      archived: d.archived ?? false,
      sealed: d.sealed ?? 0,
      open: d.open ?? 0,
      qty: d.qty ?? 0,
      movements: movs.size,
      financeDocs: existing.length,
      financeTotal: existing.reduce((sum, s) => sum + (s.data()!.amount ?? 0), 0),
    });
  }

  for (const it of items) {
    log(
      `  ${it.id} · ${it.name} [${it.category}${it.archived ? ", arquivado" : ""}]` +
        ` · sealed ${it.sealed} / open ${it.open} / qty ${it.qty}` +
        ` · ${it.movements} movimentação(ões)` +
        ` · ${it.financeDocs} despesa(s) "Compra" espelhada(s) (R$ ${(it.financeTotal / 100).toFixed(2)})`,
    );
  }

  let movementsDeleted = 0;
  let financeDeleted = 0;

  if (opts.apply) {
    for (const doc of matches) {
      const movs = movementRefs.get(doc.id) ?? [];
      const d = doc.data();

      // 1. Pin the CURRENT state as the replay baseline BEFORE the history goes.
      //    updateMovement/deleteMovement replay all movements from this; without
      //    it, continuous items would replay from zero and get their counts reset
      //    the next time someone edits/deletes a new movement.
      await doc.ref.update({
        replayBaseline: {
          sealed: d.sealed ?? 0,
          open: d.open ?? 0,
          openPkg: d.openPkg ?? false,
          usos: d.usos ?? 0,
        },
      });

      // 2. Finance mirrors (opt-in), computed from the movements about to go.
      if (opts.deleteFinance) {
        const finRefs = movs
          .filter((m) => {
            const x = m.data();
            return x.type === "entrada" && x.price != null && x.price > 0;
          })
          .map((m) => store.collection("finance").doc(financeIdFor(m.id)));
        const present = (await Promise.all(finRefs.map((r) => r.get()))).filter(
          (s) => s.exists,
        );
        await deleteRefs(db, present.map((s) => s.ref));
        financeDeleted += present.length;
      }

      // 3. The movements themselves.
      await deleteRefs(db, movs.map((m) => m.ref));
      movementsDeleted += movs.length;
    }

    // finance `out` per month lives in the summary; drop it so the app's slow
    // path recomputes it (same approach as migrate-remove-interno.ts).
    if (opts.deleteFinance && financeDeleted > 0) {
      await store.collection("meta").doc("summary").delete();
    }
  }

  return { items, movementsDeleted, financeDeleted, allNames };
}
