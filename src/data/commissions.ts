import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import { canAccessSection, canAccessStore } from "@/lib/access";
import { commissionLines } from "@/lib/order-money";
import { zonedTimeToUtc } from "@/lib/timezone";
import type {
  CommissionItemRow,
  CommissionPayment,
  OrderItem,
  PayMethod,
  SellerOption,
} from "@/lib/types";
import { getUserByEmail, listUsers } from "./users";

function storeRef(storeId: string) {
  return getDb().collection("stores").doc(storeId);
}

function paymentsCol(storeId: string) {
  return storeRef(storeId).collection("commissionPayments");
}

/** [start, end) of a "YYYY-MM" competência in the store's time zone. */
function monthRange(month: string): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new Error("Competência inválida.");
  const [y, mo] = [Number(m[1]), Number(m[2])];
  return { start: zonedTimeToUtc(y, mo, 1), end: zonedTimeToUtc(y, mo + 1, 1) };
}

/** Active members who can take orders in this store — the "Vendido por" choices. */
export async function listSellers(storeId: string): Promise<SellerOption[]> {
  const users = await listUsers();
  return users
    .filter(
      (u) =>
        u.status === "ativo" &&
        canAccessStore(u, storeId) &&
        canAccessSection(u, "pedidos"),
    )
    .map((u) => ({ email: u.email, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Validates a seller email against the store's team and returns the name to snapshot. */
export async function resolveSeller(storeId: string, email: string): Promise<SellerOption> {
  const user = await getUserByEmail(email);
  if (
    !user ||
    user.status !== "ativo" ||
    !canAccessStore(user, storeId) ||
    !canAccessSection(user, "pedidos")
  ) {
    throw new Error("Vendedor inválido para esta loja.");
  }
  return { email: user.email, name: user.name };
}

function toPayment(id: string, d: FirebaseFirestore.DocumentData): CommissionPayment {
  return {
    id,
    sellerEmail: d.sellerEmail,
    sellerName: d.sellerName,
    month: d.month,
    amount: d.amount ?? 0,
    payMethod: d.payMethod ?? undefined,
    paidAt: d.paidAt?.toDate().toISOString() ?? "",
    createdBy: d.createdBy ?? undefined,
  };
}

/** Payouts registered since `since` (the Financeiro evolution window). */
export async function listCommissionPayments(
  storeId: string,
  opts: { since?: Date } = {},
): Promise<CommissionPayment[]> {
  let q = paymentsCol(storeId).orderBy("paidAt", "desc");
  if (opts.since) q = q.where("paidAt", ">=", Timestamp.fromDate(opts.since));
  const snap = await q.get();
  return snap.docs.map((doc) => toPayment(doc.id, doc.data()));
}

/** Paid order mirrors of a competência that carry a seller. */
async function monthMirrors(storeId: string, month: string, sellerEmail?: string) {
  const { start, end } = monthRange(month);
  const snap = await storeRef(storeId)
    .collection("finance")
    .where("date", ">=", Timestamp.fromDate(start))
    .where("date", "<", Timestamp.fromDate(end))
    .get();
  return snap.docs.filter((doc) => {
    const d = doc.data();
    return d.source === "order" && d.sellerEmail && (!sellerEmail || d.sellerEmail === sellerEmail);
  });
}

/**
 * Registers the payout of a seller's outstanding commission for a competência:
 * the payment doc plus its read-only "Comissão · Nome" row in Movimentações.
 * Amount = accrued − already paid, computed here (never trusted from the
 * client). The row is informational: the accrual already counts in Saídas.
 */
export async function registerCommissionPayment(
  storeId: string,
  input: { month: string; sellerEmail: string; payMethod: PayMethod },
  by: string,
): Promise<string> {
  const mirrors = await monthMirrors(storeId, input.month, input.sellerEmail);
  const accrued = mirrors.reduce((sum, doc) => sum + (doc.data().commission?.amount ?? 0), 0);
  const sellerName = mirrors[0]?.data().sellerName ?? input.sellerEmail;
  const db = getDb();
  const ref = paymentsCol(storeId).doc();
  await db.runTransaction(async (tx) => {
    const paidSnap = await tx.get(paymentsCol(storeId).where("month", "==", input.month));
    const paid = paidSnap.docs
      .filter((doc) => doc.data().sellerEmail === input.sellerEmail)
      .reduce((sum, doc) => sum + (doc.data().amount ?? 0), 0);
    const amount = accrued - paid;
    if (amount <= 0) throw new Error("Não há comissão a pagar para este vendedor.");
    const now = Timestamp.now();
    tx.set(ref, {
      sellerEmail: input.sellerEmail,
      sellerName,
      month: input.month,
      amount,
      payMethod: input.payMethod,
      paidAt: now,
      createdBy: by,
    });
    tx.set(storeRef(storeId).collection("finance").doc(`commission-${ref.id}`), {
      label: `Comissão · ${sellerName}`,
      category: "comissoes",
      amount,
      direction: "out",
      source: "commission",
      sellerEmail: input.sellerEmail,
      sellerName,
      commissionMonth: input.month,
      payMethod: input.payMethod,
      date: now,
      createdBy: by,
    });
  });
  return ref.id;
}

/** Undoes a payout: both the payment and its Movimentações row go away. */
export async function undoCommissionPayment(storeId: string, paymentId: string): Promise<void> {
  const db = getDb();
  await db.runTransaction(async (tx) => {
    tx.delete(paymentsCol(storeId).doc(paymentId));
    tx.delete(storeRef(storeId).collection("finance").doc(`commission-${paymentId}`));
  });
}

/** "Ver por item": the month's commissioned lines (of one seller, or all), grouped by product. */
export async function listCommissionItems(
  storeId: string,
  month: string,
  sellerEmail?: string,
): Promise<CommissionItemRow[]> {
  const mirrors = await monthMirrors(storeId, month, sellerEmail);
  const orderIds = mirrors.map((doc) => doc.data().orderId as string).filter(Boolean);
  if (orderIds.length === 0) return [];
  const orders = await getDb().getAll(
    ...orderIds.map((id) => storeRef(storeId).collection("orders").doc(id)),
  );
  const rows = new Map<string, CommissionItemRow>();
  for (const snap of orders) {
    if (!snap.exists) continue;
    const d = snap.data()!;
    for (const l of commissionLines((d.items ?? []) as OrderItem[], d.total ?? 0, d.discount)) {
      const key = `${l.item.productId}@${l.item.commissionPercent}`;
      const row = rows.get(key) ?? {
        productId: l.item.productId,
        name: l.item.name,
        percent: l.item.commissionPercent ?? 0,
        qty: 0,
        sold: 0,
        commission: 0,
      };
      row.qty += l.item.qty;
      row.sold += l.base;
      row.commission += l.commission;
      rows.set(key, row);
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, sold: Math.round(r.sold), commission: Math.round(r.commission) }))
    .sort((a, b) => b.commission - a.commission);
}
