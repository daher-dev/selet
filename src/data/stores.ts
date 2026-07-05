import "server-only";

import { getDb } from "@/lib/firebase-admin";
import type { SessionUser, Store } from "@/lib/types";

export async function listStores(): Promise<Store[]> {
  const snap = await getDb().collection("stores").orderBy("name").get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return { id: doc.id, name: d.name, sub: d.sub, initial: d.initial };
  });
}

/** Stores this user can act on (admins and storeIds:"all" see every store). */
export async function listStoresForUser(user: SessionUser): Promise<Store[]> {
  const all = await listStores();
  if (user.role === "admin" || user.storeIds === "all") return all;
  return all.filter((s) => user.storeIds.includes(s.id));
}
