import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import type { Product } from "@/lib/types";

function productsCol(storeId: string) {
  return getDb().collection("stores").doc(storeId).collection("products");
}

function toProduct(id: string, d: FirebaseFirestore.DocumentData): Product {
  return {
    id,
    name: d.name,
    price: d.price,
    category: d.category,
    typeTags: d.typeTags ?? [],
    description: d.description ?? undefined,
    active: d.active ?? true,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
  };
}

export async function listProducts(storeId: string): Promise<Product[]> {
  const snap = await productsCol(storeId).orderBy("name").get();
  return snap.docs.map((doc) => toProduct(doc.id, doc.data()));
}

export async function getProduct(
  storeId: string,
  productId: string,
): Promise<Product | null> {
  const snap = await productsCol(storeId).doc(productId).get();
  return snap.exists ? toProduct(snap.id, snap.data()!) : null;
}

export interface ProductInput {
  name: string;
  price: number;
  category: string;
  typeTags: string[];
  description?: string;
  active: boolean;
}

export async function createProduct(
  storeId: string,
  input: ProductInput,
): Promise<string> {
  const ref = await productsCol(storeId).add({
    ...input,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function updateProduct(
  storeId: string,
  productId: string,
  input: ProductInput,
): Promise<void> {
  await productsCol(storeId)
    .doc(productId)
    // Explicit delete so clearing the description in the form persists
    // (a plain update() would leave the old value in place).
    .update({ ...input, description: input.description ?? FieldValue.delete() });
}

export async function deleteProduct(
  storeId: string,
  productId: string,
): Promise<void> {
  await productsCol(storeId).doc(productId).delete();
}
