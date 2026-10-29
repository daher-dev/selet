import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import { mirrorFields } from "@/lib/product-offers";
import type {
  PriceTier,
  Product,
  ProductAddon,
  ProductSaleType,
  RecipeItem,
  ResaleOffer,
  SaleOffer,
} from "@/lib/types";
function productsCol(storeId: string) {
  return getDb().collection("stores").doc(storeId).collection("products");
}

function toProduct(id: string, d: FirebaseFirestore.DocumentData): Product {
  const saleType: ProductSaleType =
    d.saleType === "revenda" || d.saleType === "adicional" ? d.saleType : "menu";
  const price = d.price ?? 0;
  // Legacy docs (no `sale`/`resale` blocks) are read into the offers shape, so
  // the deploy is safe before any data changes.
  const legacyTiers: PriceTier[] = d.tiers?.length ? d.tiers : [{ qty: 1, price }];
  const sale: SaleOffer | undefined =
    d.sale ??
    (saleType === "menu"
      ? {
          recipe: d.recipe ?? [],
          adicionais: d.adicionais ?? [],
          tiers: legacyTiers,
          ...(d.commissionPercent > 0 ? { commissionPercent: d.commissionPercent } : {}),
        }
      : undefined);
  const resale: ResaleOffer | undefined =
    d.resale ??
    (saleType !== "menu"
      ? {
          insumoId: d.insumoId ?? "",
          tiers: legacyTiers,
          ...(d.commissionPercent > 0 ? { commissionPercent: d.commissionPercent } : {}),
        }
      : undefined);
  const dual = d.sale && d.resale;
  return {
    id,
    name: d.name,
    price,
    category: d.category,
    typeTags: d.typeTags ?? [],
    description: d.description ?? undefined,
    active: d.active ?? true,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
    sale,
    resale,
    saleType: dual ? "menu" : saleType,
    recipe: d.recipe ?? [],
    adicionais: d.adicionais ?? [],
    // Legacy docs without tiers fall back to a single unit tier at the base price.
    tiers: d.tiers?.length ? d.tiers : [{ qty: 1, price }],
    insumoId: d.insumoId ?? undefined,
    // Display mirror; each order line stamps the rate of the offer it sells.
    commissionPercent: resale?.commissionPercent ?? sale?.commissionPercent,
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
  category: string;
  typeTags: string[];
  description?: string;
  active: boolean;
  /** The two optional offers — at least one. Top-level mirrors are derived from them. */
  sale?: SaleOffer;
  resale?: ResaleOffer;
  /** A resale-only product also offered as an add-on inside other products. */
  adicional?: boolean;
}

/** Legacy single-offer shape, still accepted by scripts and old callers. */
export interface LegacyProductInput {
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
  commissionPercent?: number;
}

function normalize(input: ProductInput | LegacyProductInput) {
  if ("saleType" in input) {
    const sale: SaleOffer | undefined =
      input.saleType === "menu"
        ? {
            recipe: input.recipe,
            adicionais: input.adicionais,
            tiers: input.tiers,
            ...(input.commissionPercent ? { commissionPercent: input.commissionPercent } : {}),
          }
        : undefined;
    const resale: ResaleOffer | undefined =
      input.saleType !== "menu"
        ? {
            insumoId: input.insumoId ?? "",
            tiers: input.tiers,
            ...(input.commissionPercent ? { commissionPercent: input.commissionPercent } : {}),
          }
        : undefined;
    return { base: input, sale, resale, adicional: input.saleType === "adicional" };
  }
  return { base: input, sale: input.sale, resale: input.resale, adicional: input.adicional ?? false };
}

function toDoc(input: ProductInput | LegacyProductInput) {
  const { base, sale, resale, adicional } = normalize(input);
  const { name, category, typeTags, description, active } = base;
  if (!sale && !resale) throw new Error("Ofereça o item por dose (menu) ou por embalagem (revenda).");
  return { name, category, typeTags, description, active, sale, resale, ...mirrorFields(sale, resale, adicional) };
}

export async function createProduct(
  storeId: string,
  input: ProductInput | LegacyProductInput,
): Promise<string> {
  const doc = toDoc(input);
  const ref = await productsCol(storeId).add({
    ...doc,
    sale: doc.sale ?? null,
    resale: doc.resale ?? null,
    insumoId: doc.insumoId ?? null,
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
  input: ProductInput | LegacyProductInput,
): Promise<void> {
  const doc = toDoc(input);
  await productsCol(storeId)
    .doc(productId)
    // Explicit delete so clearing an optional field in the form persists
    // (a plain update() would leave the old value in place).
    .update({
      ...doc,
      sale: doc.sale ?? FieldValue.delete(),
      resale: doc.resale ?? FieldValue.delete(),
      description: doc.description ?? FieldValue.delete(),
      insumoId: doc.insumoId ?? FieldValue.delete(),
      commissionPercent: doc.commissionPercent || FieldValue.delete(),
    });
}

export async function deleteProduct(
  storeId: string,
  productId: string,
): Promise<void> {
  await productsCol(storeId).doc(productId).delete();
}
