import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import type { Customer } from "@/lib/types";

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
  const { since, ...data } = input;
  const ref = await customersCol(storeId).add({
    ...data,
    nameLower: input.name.toLowerCase(),
    since: since ? Timestamp.fromDate(new Date(since)) : FieldValue.serverTimestamp(),
    archived: false,
    orderCount: 0,
    totalSpent: 0,
    lastOrderAt: null,
    avgReorderDays: null,
  });
  return ref.id;
}

export async function updateCustomer(
  storeId: string,
  customerId: string,
  input: CustomerInput,
): Promise<void> {
  const { since, archived, ...data } = input;
  await customersCol(storeId)
    .doc(customerId)
    .update({
      ...data,
      nameLower: input.name.toLowerCase(),
      // Firestore update() ignores undefined fields (ignoreUndefinedProperties),
      // so birthday/notes clear only when explicitly null.
      birthday: input.birthday ?? null,
      ...(since ? { since: Timestamp.fromDate(new Date(since)) } : {}),
      ...(archived === undefined ? {} : { archived }),
    });
}

export async function setCustomerArchived(
  storeId: string,
  customerId: string,
  archived: boolean,
): Promise<void> {
  await customersCol(storeId).doc(customerId).update({ archived });
}
