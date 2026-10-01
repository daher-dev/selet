import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import type { SessionUser, Store } from "@/lib/types";

export async function listStores(): Promise<Store[]> {
  const snap = await getDb().collection("stores").orderBy("name").get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      name: d.name,
      sub: d.sub,
      initial: d.initial,
      defaultDDD: d.defaultDDD,
      address: d.address ?? undefined,
      whatsapp: d.whatsapp ?? undefined,
      email: d.email ?? undefined,
    };
  });
}

/** Stores this user can act on (admins and storeIds:"all" see every store). */
export async function listStoresForUser(user: SessionUser): Promise<Store[]> {
  const all = await listStores();
  if (user.role === "admin" || user.storeIds === "all") return all;
  return all.filter((s) => user.storeIds.includes(s.id));
}

export interface StoreProfileInput {
  name: string;
  address?: string;
  whatsapp?: string;
  email?: string;
}

/** Updates the store profile (Configurações → Loja). `initial` follows the name. */
export async function updateStoreProfile(storeId: string, input: StoreProfileInput): Promise<void> {
  const name = input.name.trim();
  await getDb()
    .collection("stores")
    .doc(storeId)
    .update({
      name,
      initial: name.charAt(0).toUpperCase(),
      address: input.address?.trim() || FieldValue.delete(),
      whatsapp: input.whatsapp?.trim() || FieldValue.delete(),
      email: input.email?.trim() || FieldValue.delete(),
    });
}
