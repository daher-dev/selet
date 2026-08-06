import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import type {
  OrderItem,
  PriceTier,
  Product,
  RecipeItem,
  ShakeBase,
  ShakeBrinde,
  ShakeFlavor,
  ShakeMixin,
  ShakeRim,
  ShakeUtensil,
} from "@/lib/types";
import { getProduct } from "./products";
import { getStockItem } from "./stock";

function storeRef(storeId: string) {
  return getDb().collection("stores").doc(storeId);
}

function flavorsCol(storeId: string) {
  return storeRef(storeId).collection("shakeFlavors");
}
function basesCol(storeId: string) {
  return storeRef(storeId).collection("shakeBases");
}
function rimsCol(storeId: string) {
  return storeRef(storeId).collection("shakeRims");
}
function mixinsCol(storeId: string) {
  return storeRef(storeId).collection("shakeMixins");
}
function utensilsCol(storeId: string) {
  return storeRef(storeId).collection("shakeUtensils");
}
function brindesCol(storeId: string) {
  return storeRef(storeId).collection("shakeBrindes");
}

// ---------------------------------------------------------------------------
// Derive-don't-trust: the client always SELECTS an insumo (never free-types
// its unit), so every insumo write re-resolves name/unit from the referenced
// StockItem doc server-side, mirroring consumptionModeForUnit()'s discipline.
// ---------------------------------------------------------------------------

export interface RecipeItemInput {
  stockItemId?: string;
  name: string;
  qty: number | null;
  unit?: string;
}

async function resolveRecipeItem(
  storeId: string,
  input: RecipeItemInput,
): Promise<RecipeItem> {
  if (!input.stockItemId) {
    return { name: input.name, qty: input.qty, unit: input.unit ?? "" };
  }
  const item = await getStockItem(storeId, input.stockItemId);
  if (!item || item.archived) throw new Error("Insumo do estoque não encontrado.");
  return { stockItemId: input.stockItemId, name: item.name, qty: input.qty, unit: item.unit };
}

export interface InsumoInput {
  stockItemId: string;
  qty: number | null;
}

async function resolveInsumo(storeId: string, input: InsumoInput): Promise<RecipeItem> {
  const item = await getStockItem(storeId, input.stockItemId);
  if (!item || item.archived) throw new Error("Insumo do estoque não encontrado.");
  return { stockItemId: input.stockItemId, name: item.name, qty: input.qty, unit: item.unit };
}

// ---------------------------------------------------------------------------
// Sabores
// ---------------------------------------------------------------------------

function toFlavor(id: string, d: FirebaseFirestore.DocumentData): ShakeFlavor {
  return {
    id,
    name: d.name,
    price: d.price ?? 0,
    recipe: d.recipe ?? [],
    archived: d.archived ?? false,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
  };
}

export async function listShakeFlavors(storeId: string): Promise<ShakeFlavor[]> {
  const snap = await flavorsCol(storeId).orderBy("name").get();
  return snap.docs.map((doc) => toFlavor(doc.id, doc.data()));
}

export async function getShakeFlavor(
  storeId: string,
  id: string,
): Promise<ShakeFlavor | null> {
  const snap = await flavorsCol(storeId).doc(id).get();
  return snap.exists ? toFlavor(snap.id, snap.data()!) : null;
}

export interface ShakeFlavorInput {
  name: string;
  price: number;
  recipe: RecipeItemInput[];
  archived?: boolean;
}

async function resolveFlavorData(storeId: string, input: ShakeFlavorInput) {
  const recipe = await Promise.all(
    input.recipe.map((r) => resolveRecipeItem(storeId, r)),
  );
  return { name: input.name, price: input.price, recipe };
}

export async function createShakeFlavor(
  storeId: string,
  input: ShakeFlavorInput,
): Promise<string> {
  const data = await resolveFlavorData(storeId, input);
  const ref = await flavorsCol(storeId).add({
    ...data,
    archived: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function updateShakeFlavor(
  storeId: string,
  id: string,
  input: ShakeFlavorInput,
): Promise<void> {
  const data = await resolveFlavorData(storeId, input);
  await flavorsCol(storeId)
    .doc(id)
    .update({ ...data, archived: input.archived ?? false });
}

// ---------------------------------------------------------------------------
// Bases
// ---------------------------------------------------------------------------

function toBase(id: string, d: FirebaseFirestore.DocumentData): ShakeBase {
  return {
    id,
    name: d.name,
    insumo: d.insumo,
    price: d.price ?? 0,
    archived: d.archived ?? false,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
  };
}

export async function listShakeBases(storeId: string): Promise<ShakeBase[]> {
  const snap = await basesCol(storeId).orderBy("name").get();
  return snap.docs.map((doc) => toBase(doc.id, doc.data()));
}

export interface ShakeBaseInput {
  name: string;
  insumo: InsumoInput;
  price: number;
  archived?: boolean;
}

export async function createShakeBase(
  storeId: string,
  input: ShakeBaseInput,
): Promise<string> {
  const insumo = await resolveInsumo(storeId, input.insumo);
  const ref = await basesCol(storeId).add({
    name: input.name,
    insumo,
    price: input.price,
    archived: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function updateShakeBase(
  storeId: string,
  id: string,
  input: ShakeBaseInput,
): Promise<void> {
  const insumo = await resolveInsumo(storeId, input.insumo);
  await basesCol(storeId)
    .doc(id)
    .update({
      name: input.name,
      insumo,
      price: input.price,
      archived: input.archived ?? false,
    });
}

// ---------------------------------------------------------------------------
// Bordas / Adicionais — identical shape (tiered pricing), share the plumbing.
// ---------------------------------------------------------------------------

export interface TieredModifierInput {
  name: string;
  insumo: InsumoInput;
  tiers: PriceTier[];
  archived?: boolean;
}

function toTieredModifier(
  id: string,
  d: FirebaseFirestore.DocumentData,
): ShakeRim | ShakeMixin {
  return {
    id,
    name: d.name,
    insumo: d.insumo,
    tiers: d.tiers ?? [],
    archived: d.archived ?? false,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
  };
}

async function createTieredModifier(
  storeId: string,
  col: FirebaseFirestore.CollectionReference,
  input: TieredModifierInput,
): Promise<string> {
  const insumo = await resolveInsumo(storeId, input.insumo);
  const ref = await col.add({
    name: input.name,
    insumo,
    tiers: input.tiers,
    archived: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

async function updateTieredModifier(
  storeId: string,
  col: FirebaseFirestore.CollectionReference,
  id: string,
  input: TieredModifierInput,
): Promise<void> {
  const insumo = await resolveInsumo(storeId, input.insumo);
  await col.doc(id).update({
    name: input.name,
    insumo,
    tiers: input.tiers,
    archived: input.archived ?? false,
  });
}

export async function listShakeRims(storeId: string): Promise<ShakeRim[]> {
  const snap = await rimsCol(storeId).orderBy("name").get();
  return snap.docs.map((doc) => toTieredModifier(doc.id, doc.data()));
}
export async function createShakeRim(storeId: string, input: TieredModifierInput) {
  return createTieredModifier(storeId, rimsCol(storeId), input);
}
export async function updateShakeRim(
  storeId: string,
  id: string,
  input: TieredModifierInput,
) {
  return updateTieredModifier(storeId, rimsCol(storeId), id, input);
}

export async function listShakeMixins(storeId: string): Promise<ShakeMixin[]> {
  const snap = await mixinsCol(storeId).orderBy("name").get();
  return snap.docs.map((doc) => toTieredModifier(doc.id, doc.data()));
}
export async function createShakeMixin(storeId: string, input: TieredModifierInput) {
  return createTieredModifier(storeId, mixinsCol(storeId), input);
}
export async function updateShakeMixin(
  storeId: string,
  id: string,
  input: TieredModifierInput,
) {
  return updateTieredModifier(storeId, mixinsCol(storeId), id, input);
}

// ---------------------------------------------------------------------------
// Utensílios
// ---------------------------------------------------------------------------

function toUtensil(id: string, d: FirebaseFirestore.DocumentData): ShakeUtensil {
  return {
    id,
    name: d.name,
    insumo: d.insumo,
    defaultIncluded: d.defaultIncluded ?? true,
    archived: d.archived ?? false,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
  };
}

export async function listShakeUtensils(storeId: string): Promise<ShakeUtensil[]> {
  const snap = await utensilsCol(storeId).orderBy("name").get();
  return snap.docs.map((doc) => toUtensil(doc.id, doc.data()));
}

export interface ShakeUtensilInput {
  name: string;
  insumo: InsumoInput;
  defaultIncluded: boolean;
  archived?: boolean;
}

export async function createShakeUtensil(
  storeId: string,
  input: ShakeUtensilInput,
): Promise<string> {
  const insumo = await resolveInsumo(storeId, input.insumo);
  const ref = await utensilsCol(storeId).add({
    name: input.name,
    insumo,
    defaultIncluded: input.defaultIncluded,
    archived: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function updateShakeUtensil(
  storeId: string,
  id: string,
  input: ShakeUtensilInput,
): Promise<void> {
  const insumo = await resolveInsumo(storeId, input.insumo);
  await utensilsCol(storeId)
    .doc(id)
    .update({
      name: input.name,
      insumo,
      defaultIncluded: input.defaultIncluded,
      archived: input.archived ?? false,
    });
}

// ---------------------------------------------------------------------------
// Brindes — a café menu Product given away free alongside a "Montar shake"
// order line. `id === productId`: a pure join against products, no recipe or
// price of its own here (always read the LIVE Product for display). Only the
// name is cached on the doc, purely as a fallback label if the Product is
// later deleted/archived (brinde-grid.tsx's muted-state rendering).
// ---------------------------------------------------------------------------

function toBrinde(id: string, d: FirebaseFirestore.DocumentData): ShakeBrinde {
  return {
    id,
    productId: id,
    name: d.name,
    archived: d.archived ?? false,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
  };
}

export async function listShakeBrindes(storeId: string): Promise<ShakeBrinde[]> {
  const snap = await brindesCol(storeId).orderBy("name").get();
  return snap.docs.map((doc) => toBrinde(doc.id, doc.data()));
}

/**
 * Adds (or re-activates) brindes from a set of product ids. Derive-don't-
 * trust: each id is re-resolved against the LIVE Product server-side and
 * rejected if the product is missing, inactive, or itself an "adicional"
 * (not independently orderable — see PRODUCT_SALE_TYPES). Idempotent: an id
 * that's already a (possibly archived) brinde just gets {name, archived:
 * false} rewritten, WITHOUT resetting createdAt; a brand-new id gets
 * createdAt via serverTimestamp. Returns the number of brindes written
 * (rejected ids are silently skipped, best-effort).
 */
export async function addShakeBrindes(
  storeId: string,
  productIds: string[],
): Promise<number> {
  const uniqueIds = [...new Set(productIds)];
  const products = await Promise.all(uniqueIds.map((id) => getProduct(storeId, id)));

  const valid = uniqueIds
    .map((id, i) => ({ id, product: products[i] }))
    .filter(
      (v): v is { id: string; product: Product } =>
        !!v.product && v.product.active && v.product.saleType !== "adicional",
    );
  if (valid.length === 0) return 0;

  const existingSnaps = await Promise.all(
    valid.map(({ id }) => brindesCol(storeId).doc(id).get()),
  );

  const db = getDb();
  const batch = db.batch();
  valid.forEach(({ id, product }, i) => {
    const ref = brindesCol(storeId).doc(id);
    if (existingSnaps[i].exists) {
      batch.update(ref, { name: product.name, archived: false });
    } else {
      batch.set(ref, {
        name: product.name,
        archived: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });
  await batch.commit();
  return valid.length;
}

export async function setShakeBrindeArchived(
  storeId: string,
  productId: string,
  archived: boolean,
): Promise<void> {
  await brindesCol(storeId).doc(productId).update({ archived });
}

// ---------------------------------------------------------------------------
// Consumption-engine support: batch-load only the catalog entries an order's
// shake lines actually reference (mirrors fetchLineProducts' discipline),
// plus the full (small) utensílios list, since defaults apply store-wide.
// ---------------------------------------------------------------------------

export interface ShakeCatalogs {
  flavors: Map<string, ShakeFlavor>;
  bases: Map<string, ShakeBase>;
  rims: Map<string, ShakeRim>;
  mixins: Map<string, ShakeMixin>;
  utensils: ShakeUtensil[];
}

async function loadByIds<T extends { id: string }>(
  col: FirebaseFirestore.CollectionReference,
  ids: Set<string>,
  toEntity: (id: string, d: FirebaseFirestore.DocumentData) => T,
): Promise<Map<string, T>> {
  const map = new Map<string, T>();
  await Promise.all(
    [...ids].map(async (id) => {
      const snap = await col.doc(id).get();
      if (snap.exists) map.set(id, toEntity(snap.id, snap.data()!));
    }),
  );
  return map;
}

export async function loadShakeCatalogsForItems(
  storeId: string,
  items: OrderItem[],
): Promise<ShakeCatalogs> {
  const flavorIds = new Set<string>();
  const baseIds = new Set<string>();
  const rimIds = new Set<string>();
  const mixinIds = new Set<string>();
  for (const line of items) {
    const shake = line.shake;
    if (!shake) continue;
    flavorIds.add(shake.flavorId);
    if (shake.baseId) baseIds.add(shake.baseId);
    for (const r of shake.rims) rimIds.add(r.modifierId);
    for (const m of shake.mixins) mixinIds.add(m.modifierId);
  }

  const [flavors, bases, rims, mixins, utensils] = await Promise.all([
    loadByIds(flavorsCol(storeId), flavorIds, toFlavor),
    loadByIds(basesCol(storeId), baseIds, toBase),
    loadByIds(rimsCol(storeId), rimIds, toTieredModifier),
    loadByIds(mixinsCol(storeId), mixinIds, toTieredModifier),
    listShakeUtensils(storeId),
  ]);

  return { flavors, bases, rims, mixins, utensils };
}
