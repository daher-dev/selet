import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import type { Customer } from "@/lib/types";
import {
  monthKey,
  readSummaryTx,
  summaryAddCustomer,
  summaryArchiveCustomer,
  writeSummaryTx,
} from "./summary";

export function customersCol(storeId: string) {
  return getDb().collection("stores").doc(storeId).collection("customers");
}

export function toCustomer(
  id: string,
  d: FirebaseFirestore.DocumentData,
): Customer {
  return {
    id,
    name: d.name,
    phone: d.phone,
    city: d.city,
    instagram: d.instagram,
    birthday: d.birthday ?? undefined,
    since: d.since?.toDate().toISOString() ?? "",
    tags: d.tags ?? [],
    notes: d.notes,
    archived: d.archived ?? false,
    orderCount: d.orderCount ?? 0,
    totalSpent: d.totalSpent ?? 0,
    lastOrderAt: d.lastOrderAt?.toDate().toISOString() ?? null,
    avgReorderDays: d.avgReorderDays ?? null,
    reorderProduct: d.reorderProduct ?? null,
  };
}

export async function listCustomers(storeId: string): Promise<Customer[]> {
  const snap = await customersCol(storeId).orderBy("name").get();
  return snap.docs.map((doc) => toCustomer(doc.id, doc.data()));
}

/**
 * Targeted list of customers with a birthday in the current or next calendar
 * month — a bounded query (single `in` filter on the nested `birthday.month`),
 * NOT a full scan. Any birthday within the next 30 days necessarily falls in one
 * of those two months; the caller filters the exact ≤30-day window (and archived
 * customers) in memory over this small result. Single-field index only — the
 * nested `birthday.month` field is auto-indexed, so no composite index needed.
 */
export async function listUpcomingBirthdays(
  storeId: string,
): Promise<Customer[]> {
  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const nextMonth = (thisMonth % 12) + 1;
  const snap = await customersCol(storeId)
    .where("birthday.month", "in", [thisMonth, nextMonth])
    .get();
  return snap.docs.map((doc) => toCustomer(doc.id, doc.data()));
}

export async function getCustomer(
  storeId: string,
  customerId: string,
): Promise<Customer | null> {
  const snap = await customersCol(storeId).doc(customerId).get();
  return snap.exists ? toCustomer(snap.id, snap.data()!) : null;
}

export interface CustomerInput {
  name: string;
  phone?: string;
  city?: string;
  instagram?: string;
  birthday?: { day: number; month: number };
  since?: string; // ISO date; defaults to now on create
  tags: string[];
  notes?: string;
  /** Only honoured on update — lets the edit form archive/reactivate inline. */
  archived?: boolean;
}

export async function createCustomer(
  storeId: string,
  input: CustomerInput,
): Promise<string> {
  const db = getDb();
  const ref = customersCol(storeId).doc();
  const { since, ...data } = input;
  // Use a concrete Timestamp (not serverTimestamp) so the summary's newCustomers
  // month exactly matches the stored `since` — the summary is maintained in the
  // same transaction and can't read a not-yet-resolved server timestamp.
  const sinceTs = since ? Timestamp.fromDate(new Date(since)) : Timestamp.now();

  await db.runTransaction(async (tx) => {
    const summary = await readSummaryTx(tx, storeId);
    summaryAddCustomer(summary, { mk: monthKey(sinceTs.toDate()) });
    writeSummaryTx(tx, storeId, summary);
    tx.set(ref, {
      ...data,
      nameLower: input.name.toLowerCase(),
      since: sinceTs,
      archived: false,
      orderCount: 0,
      totalSpent: 0,
      lastOrderAt: null,
      avgReorderDays: null,
    });
  });
  return ref.id;
}

export async function updateCustomer(
  storeId: string,
  customerId: string,
  input: CustomerInput,
): Promise<void> {
  const db = getDb();
  const ref = customersCol(storeId).doc(customerId);
  const { since, archived, ...data } = input;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Cliente não encontrado.");
    const wasArchived = snap.data()!.archived ?? false;

    // Reflect an archive/reactivate toggle in the active-base counter (read the
    // summary during the read phase, before any write).
    if (archived !== undefined && archived !== wasArchived) {
      const summary = await readSummaryTx(tx, storeId);
      summaryArchiveCustomer(summary, archived ? -1 : 1);
      writeSummaryTx(tx, storeId, summary);
    }

    tx.update(ref, {
      ...data,
      nameLower: input.name.toLowerCase(),
      // Firestore update() ignores undefined fields (ignoreUndefinedProperties),
      // so birthday/notes clear only when explicitly null.
      birthday: input.birthday ?? null,
      ...(since ? { since: Timestamp.fromDate(new Date(since)) } : {}),
      ...(archived === undefined ? {} : { archived }),
    });
  });
}

export async function setCustomerArchived(
  storeId: string,
  customerId: string,
  archived: boolean,
): Promise<void> {
  const db = getDb();
  const ref = customersCol(storeId).doc(customerId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Cliente não encontrado.");
    const wasArchived = snap.data()!.archived ?? false;

    if (archived !== wasArchived) {
      const summary = await readSummaryTx(tx, storeId);
      summaryArchiveCustomer(summary, archived ? -1 : 1);
      writeSummaryTx(tx, storeId, summary);
      tx.update(ref, { archived });
    }
  });
}
