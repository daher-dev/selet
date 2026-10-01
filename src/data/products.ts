import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import type {
  PriceTier,
  Product,
  ProductAddon,
  ProductSaleType,
  RecipeItem,
} from "@/lib/types";
function productsCol(storeId: string) {
  return getDb().collection("stores").doc(storeId).collection("products");
}

function toProduct(id: string, d: FirebaseFirestore.DocumentData): Product {
  const saleType: ProductSaleType =
    d.saleType === "revenda" || d.saleType === "adicional" ? d.saleType : "menu";
  const price = d.price ?? 0;
  return {
    id,
    name: d.name,
    price,
    category: d.category,
    typeTags: d.typeTags ?? [],
    description: d.description ?? undefined,
    active: d.active ?? true,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
    saleType,
    recipe: d.recipe ?? [],
    adicionais: d.adicionais ?? [],
    // Legacy docs without tiers fall back to a single unit tier at the base price.
    tiers: d.tiers?.length ? d.tiers : [{ qty: 1, price }],
    insumoId: d.insumoId ?? undefined,
    archived: d.archived ?? false,
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
  saleType: ProductSaleType;
  recipe: RecipeItem[];
  adicionais: ProductAddon[];
  tiers: PriceTier[];
  insumoId?: string;
}

export async function createProduct(
  storeId: string,
  input: ProductInput,
): Promise<string> {
  const ref = await productsCol(storeId).add({
    ...input,
    insumoId: input.insumoId ?? null,
    // In-app creation → mark manual so the catalog fresh-sync (importCatalog's
    // deleteAbsent) NEVER deletes this doc, even though it has a random id not
    // in the import JSON's slug set.
    source: "manual",
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
    // Explicit delete so clearing an optional field in the form persists
    // (a plain update() would leave the old value in place).
    .update({
      ...input,
      description: input.description ?? FieldValue.delete(),
      insumoId: input.insumoId ?? FieldValue.delete(),
    });
}

export async function deleteProduct(
  storeId: string,
  productId: string,
): Promise<void> {
  await productsCol(storeId).doc(productId).delete();
}
