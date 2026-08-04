import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import type {
  PayMethod,
  Voucher,
  VoucherLineItem,
  VoucherTemplate,
  VoucherTemplateItem,
} from "@/lib/types";
import { voucherCode, computeHasBalance, expiresAtFromValidity } from "@/lib/vouchers";
import { monthKey, readSummaryTx, summaryFinance, writeSummaryTx } from "./summary";

function storeRef(storeId: string) {
  return getDb().collection("stores").doc(storeId);
}

function voucherTemplatesCol(storeId: string) {
  return storeRef(storeId).collection("voucherTemplates");
}

function vouchersCol(storeId: string) {
  return storeRef(storeId).collection("vouchers");
}

function financeRef(storeId: string, voucherId: string) {
  return storeRef(storeId).collection("finance").doc(`voucher-${voucherId}`);
}

function toVoucherTemplate(
  id: string,
  d: FirebaseFirestore.DocumentData,
): VoucherTemplate {
  return {
    id,
    name: d.name,
    description: d.description ?? undefined,
    items: d.items ?? [],
    packagePrice: d.packagePrice ?? 0,
    validityDays: d.validityDays ?? null,
    active: d.active ?? true,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
    updatedAt: d.updatedAt?.toDate().toISOString() ?? "",
  };
}

function toVoucher(id: string, d: FirebaseFirestore.DocumentData): Voucher {
  return {
    id,
    code: voucherCode(id),
    templateId: d.templateId,
    templateName: d.templateName,
    customerId: d.customerId,
    customerName: d.customerName,
    items: d.items ?? [],
    packagePrice: d.packagePrice ?? 0,
    purchasedAt: d.purchasedAt?.toDate().toISOString() ?? "",
    expiresAt: d.expiresAt?.toDate().toISOString() ?? null,
    paid: d.paid ?? false,
    payMethod: d.payMethod ?? null,
    hasBalance: d.hasBalance ?? true,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
    updatedAt: d.updatedAt?.toDate().toISOString() ?? "",
  };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function listVoucherTemplates(
  storeId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<VoucherTemplate[]> {
  let q = voucherTemplatesCol(storeId).orderBy("createdAt", "desc");
  if (opts.activeOnly) q = q.where("active", "==", true);
  const snap = await q.get();
  return snap.docs.map((doc) => toVoucherTemplate(doc.id, doc.data()));
}

export async function getVoucherTemplate(
  storeId: string,
  templateId: string,
): Promise<VoucherTemplate | null> {
  const snap = await voucherTemplatesCol(storeId).doc(templateId).get();
  return snap.exists ? toVoucherTemplate(snap.id, snap.data()!) : null;
}

export interface VoucherTemplateInput {
  name: string;
  description?: string;
  items: VoucherTemplateItem[];
  packagePrice: number;
  validityDays: number | null;
}

export async function createVoucherTemplate(
  storeId: string,
  input: VoucherTemplateInput,
): Promise<string> {
  const now = Timestamp.now();
  const ref = await voucherTemplatesCol(storeId).add({
    ...input,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function updateVoucherTemplate(
  storeId: string,
  templateId: string,
  input: VoucherTemplateInput,
): Promise<void> {
  await voucherTemplatesCol(storeId)
    .doc(templateId)
    .update({ ...input, updatedAt: Timestamp.now() });
}

export async function setVoucherTemplateActive(
  storeId: string,
  templateId: string,
  active: boolean,
): Promise<void> {
  await voucherTemplatesCol(storeId)
    .doc(templateId)
    .update({ active, updatedAt: Timestamp.now() });
}

// ---------------------------------------------------------------------------
// Vouchers (sold instances)
// ---------------------------------------------------------------------------

export async function listVouchers(
  storeId: string,
  opts: { limit?: number } = {},
): Promise<Voucher[]> {
  let q = vouchersCol(storeId).orderBy("purchasedAt", "desc");
  if (opts.limit) q = q.limit(opts.limit);
  const snap = await q.get();
  return snap.docs.map((doc) => toVoucher(doc.id, doc.data()));
}

/** Vouchers for a customer, for the Pedidos balance banner (filter client-side). */
export async function listVouchersByCustomer(
  storeId: string,
  customerId: string,
): Promise<Voucher[]> {
  const snap = await vouchersCol(storeId).where("customerId", "==", customerId).get();
  return snap.docs.map((doc) => toVoucher(doc.id, doc.data()));
}

export async function getVoucher(
  storeId: string,
  voucherId: string,
): Promise<Voucher | null> {
  const snap = await vouchersCol(storeId).doc(voucherId).get();
  return snap.exists ? toVoucher(snap.id, snap.data()!) : null;
}

/** Cheap count for the nav badge — vouchers with a balance expiring within `days`. */
export async function countVouchersExpiringSoon(
  storeId: string,
  days = 7,
): Promise<number> {
  const now = Timestamp.now();
  const until = Timestamp.fromMillis(now.toMillis() + days * 86_400_000);
  const snap = await vouchersCol(storeId)
    .where("hasBalance", "==", true)
    .where("expiresAt", ">=", now)
    .where("expiresAt", "<=", until)
    .count()
    .get();
  return snap.data().count;
}

export interface SellVoucherInput {
  customerId: string;
  customerName: string;
  templateId: string;
}

/**
 * Sells a voucher: reads the template SERVER-SIDE and snapshots its items/
 * price/expiry — the client never supplies price or line contents (unlike an
 * Order, a voucher sale has no per-line customization, so there is no reason
 * to trust anything but the template id + customer + payment from the client).
 * Books the Financeiro mirror at sale/payment time when sold already paid.
 */
export async function sellVoucher(
  storeId: string,
  input: SellVoucherInput,
  payment: { paid: boolean; payMethod: PayMethod | null },
): Promise<string> {
  const db = getDb();
  const templateRef = voucherTemplatesCol(storeId).doc(input.templateId);
  const ref = vouchersCol(storeId).doc();
  const now = Timestamp.now();

  await db.runTransaction(async (tx) => {
    const templateSnap = await tx.get(templateRef);
    if (!templateSnap.exists) throw new Error("Modelo de voucher não encontrado.");
    const template = toVoucherTemplate(templateSnap.id, templateSnap.data()!);
    if (!template.active) throw new Error("Este modelo está desativado.");
    const summary = await readSummaryTx(tx, storeId);

    const items: VoucherLineItem[] = template.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      unitPrice: i.unitPrice,
      qty: i.qty,
      redeemedCount: 0,
    }));
    const expiresAt = expiresAtFromValidity(now.toDate(), template.validityDays);

    if (payment.paid) {
      summaryFinance(summary, {
        mk: monthKey(now.toDate()),
        direction: "in",
        amount: template.packagePrice,
      });
      writeSummaryTx(tx, storeId, summary);
    }

    tx.set(ref, {
      templateId: template.id,
      templateName: template.name,
      customerId: input.customerId,
      customerName: input.customerName,
      items,
      packagePrice: template.packagePrice,
      purchasedAt: now,
      expiresAt: expiresAt ? Timestamp.fromDate(new Date(expiresAt)) : null,
      paid: payment.paid,
      payMethod: payment.paid ? payment.payMethod : null,
      hasBalance: computeHasBalance(items),
      createdAt: now,
      updatedAt: now,
    });
    if (payment.paid) {
      tx.set(financeRef(storeId, ref.id), {
        label: `Voucher #${voucherCode(ref.id)} · ${input.customerName}`,
        category: "vendas",
        amount: template.packagePrice,
        direction: "in",
        source: "voucher",
        voucherId: ref.id,
        payMethod: payment.payMethod,
        date: now,
      });
    }
  });
  return ref.id;
}

/** Toggles payment. Deterministic finance-mirror id makes create/delete idempotent. */
export async function setVoucherPayment(
  storeId: string,
  voucherId: string,
  paid: boolean,
  payMethod: PayMethod | null,
): Promise<void> {
  const db = getDb();
  const ref = vouchersCol(storeId).doc(voucherId);
  const finRef = financeRef(storeId, voucherId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Voucher não encontrado.");
    const current = snap.data()!;
    const summary = await readSummaryTx(tx, storeId);
    const mirrorSnap = await tx.get(finRef);
    const now = Timestamp.now();

    if (mirrorSnap.exists) {
      const md = mirrorSnap.data()!;
      const priorMk = md.date ? monthKey((md.date as Timestamp).toDate()) : monthKey(now.toDate());
      summaryFinance(summary, { mk: priorMk, direction: "in", amount: -(md.amount ?? 0) });
    }
    if (paid) {
      summaryFinance(summary, {
        mk: monthKey(now.toDate()),
        direction: "in",
        amount: current.packagePrice ?? 0,
      });
    }
    writeSummaryTx(tx, storeId, summary);

    tx.update(ref, { paid, payMethod: paid ? payMethod : null, updatedAt: now });
    if (paid) {
      tx.set(finRef, {
        label: `Voucher #${voucherCode(voucherId)} · ${current.customerName}`,
        category: "vendas",
        amount: current.packagePrice ?? 0,
        direction: "in",
        source: "voucher",
        voucherId,
        payMethod,
        date: now,
      });
    } else {
      tx.delete(finRef);
    }
  });
}

/**
 * Redeems one unit of a voucher's line item ("Registrar retirada"). Single
 * transaction, all-reads-before-writes. Rejects when nothing remains on that
 * line or the voucher has expired.
 */
export async function redeemVoucherItem(
  storeId: string,
  voucherId: string,
  productId: string,
): Promise<void> {
  const db = getDb();
  const ref = vouchersCol(storeId).doc(voucherId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Voucher não encontrado.");
    const d = snap.data()!;
    const now = Timestamp.now();
    const expiresAt = d.expiresAt as Timestamp | null;
    if (expiresAt && expiresAt.toMillis() < now.toMillis()) {
      throw new Error("Voucher expirado.");
    }

    const items = (d.items ?? []) as VoucherLineItem[];
    const idx = items.findIndex((i) => i.productId === productId);
    if (idx < 0) throw new Error("Item não encontrado neste voucher.");
    const line = items[idx];
    if (line.redeemedCount >= line.qty) {
      throw new Error("Nenhum item disponível para retirada.");
    }

    const nextItems = items.map((i, j) =>
      j === idx ? { ...i, redeemedCount: i.redeemedCount + 1 } : i,
    );
    tx.update(ref, {
      items: nextItems,
      hasBalance: computeHasBalance(nextItems),
      updatedAt: now,
    });
  });
}
