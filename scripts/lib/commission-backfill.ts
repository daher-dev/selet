/**
 * Backfill of seller commissions on orders placed BEFORE the commission feature
 * existed (see migrate-commissions.ts). For one store it:
 *
 *  1. sets `commissionPercent` on the products named in `rates`;
 *  2. for every order since `since` that has a line of those products:
 *       - snapshots `commissionPercent` on those lines (like the app does at write time),
 *       - sets the seller (`sellerEmail`/`sellerName`) when the order has none —
 *         from `sellerOverride`, else whoever the activity log says registered it
 *         ("Registrou pedido #CODE"),
 *       - when the order is paid and active, writes `commission` + seller on its
 *         finance mirror (`order-{id}`), exactly what the app's mirror writers produce;
 *  3. recomputes the store summary (the commission counts as a Saída of the mirror's month).
 *
 * Idempotent (a second run finds nothing to change). Orders whose seller can't
 * be determined are reported, never guessed. Pure of `server-only`, so it runs
 * under plain tsx and in the emulator tests.
 */
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { orderCode } from "../../src/lib/format";
import { commissionOf } from "../../src/lib/order-money";
import type { CommissionAccrual, OrderItem } from "../../src/lib/types";
import { refreshStoreSummary } from "./summary";

export interface BackfillOptions {
  apply: boolean;
  /** Only orders created at/after this instant are considered. */
  since: Date;
  /** Product name (case-insensitive) → commission %. */
  rates: Record<string, number>;
  /** Seller for orders that have none; default: whoever registered the order. */
  sellerOverride?: string;
  log?: (line: string) => void;
}

export interface BackfillReport {
  productsUpdated: number;
  ordersConsidered: number;
  ordersUpdated: number;
  mirrorsUpdated: number;
  /** Commissioned orders whose seller could not be determined (skipped). */
  unresolved: { orderId: string; code: string }[];
  /** Commission that will accrue/has accrued on mirrors, centavos. */
  totalCommission: number;
}

const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;

type Seller = { sellerEmail: string; sellerName: string };

export async function backfillCommissions(
  db: Firestore,
  storeId: string,
  opts: BackfillOptions,
): Promise<BackfillReport> {
  const log = opts.log ?? (() => {});
  const base = `stores/${storeId}`;
  const report: BackfillReport = {
    productsUpdated: 0,
    ordersConsidered: 0,
    ordersUpdated: 0,
    mirrorsUpdated: 0,
    unresolved: [],
    totalCommission: 0,
  };

  // 1. Products.
  const rateByName = new Map(Object.entries(opts.rates).map(([n, r]) => [n.toLowerCase(), r]));
  const rateById = new Map<string, number>();
  for (const doc of (await db.collection(`${base}/products`).get()).docs) {
    const rate = rateByName.get(String(doc.data().name ?? "").toLowerCase());
    if (rate === undefined) continue;
    rateById.set(doc.id, rate);
    if (doc.data().commissionPercent !== rate) {
      report.productsUpdated += 1;
      log(`  produto "${doc.data().name}" → ${rate}% (era ${doc.data().commissionPercent ?? "sem comissão"})`);
      if (opts.apply) await doc.ref.update({ commissionPercent: rate });
    }
  }
  if (rateById.size === 0) {
    log(`  nenhum produto com taxa configurada nesta loja`);
    return report;
  }

  // Who registered each order, from the activity log (the app logs it with the user's email).
  const registrant = new Map<string, string>();
  const acts = await db
    .collection(`${base}/activities`)
    .where("label", ">=", "Registrou pedido #")
    .where("label", "<", "Registrou pedido $")
    .get();
  for (const a of acts.docs) {
    const code = String(a.data().label).split("#")[1];
    if (code && a.data().by) registrant.set(code, a.data().by);
  }

  const names = new Map<string, string>();
  async function sellerFor(email: string): Promise<Seller> {
    const key = email.toLowerCase();
    if (!names.has(key)) {
      const u = await db.doc(`users/${key}`).get();
      names.set(key, u.exists ? (u.data()!.name ?? key) : key);
    }
    return { sellerEmail: key, sellerName: names.get(key)! };
  }

  // 2. Orders.
  const orders = await db
    .collection(`${base}/orders`)
    .where("createdAt", ">=", Timestamp.fromDate(opts.since))
    .get();
  const hasCommissionedLine = (items: OrderItem[]) =>
    items.some((i) => rateById.has(i.productId) && !i.cartelaSale && !i.shake && !i.pudim);

  for (const snap of orders.docs) {
    if (!hasCommissionedLine((snap.data().items ?? []) as OrderItem[])) continue;
    report.ordersConsidered += 1;
    const code = orderCode(snap.id);

    const plan = async (
      order: FirebaseFirestore.DocumentData,
      mirror: FirebaseFirestore.DocumentData | undefined,
    ) => {
      const items = ((order.items ?? []) as OrderItem[]).map((i) =>
        rateById.has(i.productId) && i.commissionPercent === undefined && !i.cartelaSale && !i.shake && !i.pudim
          ? { ...i, commissionPercent: rateById.get(i.productId)! }
          : i,
      );
      const email: string | undefined = order.sellerEmail ?? opts.sellerOverride ?? registrant.get(code);
      if (!email) return null;
      const seller: Seller = order.sellerEmail
        ? { sellerEmail: order.sellerEmail, sellerName: order.sellerName ?? order.sellerEmail }
        : await sellerFor(email);
      const itemsChanged = items.some((i, n) => i.commissionPercent !== (order.items[n] as OrderItem).commissionPercent);
      const sellerChanged = order.sellerEmail !== seller.sellerEmail;
      const mirrorLive = !!mirror && order.paid && order.status !== "cancelado";
      const commission: CommissionAccrual | null = mirrorLive
        ? (() => {
            const c = commissionOf(items, order.total ?? 0, order.discount);
            return c.amount > 0 ? c : null;
          })()
        : null;
      const mirrorChanged =
        mirrorLive &&
        ((mirror!.commission?.amount ?? 0) !== (commission?.amount ?? 0) ||
          mirror!.sellerEmail !== seller.sellerEmail);
      return { items, seller, commission, itemsChanged, sellerChanged, mirrorChanged, mirrorLive };
    };

    const mirrorRef = db.doc(`${base}/finance/order-${snap.id}`);
    const first = await plan(snap.data(), (await mirrorRef.get()).data());
    if (!first) {
      report.unresolved.push({ orderId: snap.id, code });
      log(`  pedido #${code}: SEM vendedor (nenhum registro de quem lançou) — use --seller=email`);
      continue;
    }
    const when = (snap.data().createdAt as Timestamp).toDate().toISOString().slice(0, 10);
    log(
      `  pedido #${code} · ${when} · ${snap.data().customerName} · ${snap.data().paid ? "pago" : "não pago"}` +
        ` · vendedor ${first.seller.sellerName}` +
        ` · comissão ${first.mirrorLive ? brl(first.commission?.amount ?? 0) : "— (acumula ao pagar)"}` +
        (first.itemsChanged || first.sellerChanged || first.mirrorChanged ? "" : " · já migrado"),
    );
    if (first.commission) report.totalCommission += first.commission.amount;
    if (!(first.itemsChanged || first.sellerChanged || first.mirrorChanged)) continue;

    report.ordersUpdated += first.itemsChanged || first.sellerChanged ? 1 : 0;
    report.mirrorsUpdated += first.mirrorChanged ? 1 : 0;
    if (!opts.apply) continue;
    await db.runTransaction(async (tx) => {
      // Re-read inside the transaction so an order edited mid-run is never overwritten with a stale copy.
      const [fresh, freshMirror] = await Promise.all([tx.get(snap.ref), tx.get(mirrorRef)]);
      const p = await plan(fresh.data()!, freshMirror.data());
      if (!p) return;
      if (p.itemsChanged || p.sellerChanged) {
        tx.update(snap.ref, { items: p.items, ...p.seller });
      }
      if (p.mirrorChanged) {
        tx.update(mirrorRef, { commission: p.commission ?? FieldValue.delete(), ...p.seller });
      }
    });
  }

  // 3. The commission is a Saída of the mirror's month: recompute the summary.
  if (opts.apply && report.mirrorsUpdated > 0) await refreshStoreSummary(db, storeId);
  return report;
}
