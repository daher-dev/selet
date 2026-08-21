import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import type {
  OrderItem,
  PriceTier,
  Product,
  PudimBase,
  PudimBrinde,
  PudimFlavor,
  PudimMixin,
  PudimUtensil,
  RecipeItem,
} from "@/lib/types";
import { getProduct } from "./products";
import { getStockItem } from "./stock";

function storeRef(storeId: string) {
  return getDb().collection("stores").doc(storeId);
}

function flavorsCol(storeId: string) {
  return storeRef(storeId).collection("pudimFlavors");
}
function basesCol(storeId: string) {
  return storeRef(storeId).collection("pudimBases");
}
function mixinsCol(storeId: string) {
  return storeRef(storeId).collection("pudimMixins");
}
function utensilsCol(storeId: string) {
  return storeRef(storeId).collection("pudimUtensils");
}
function brindesCol(storeId: string) {
  return storeRef(storeId).collection("pudimBrindes");
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

function toFlavor(id: string, d: FirebaseFirestore.DocumentData): PudimFlavor {
  return {
    id,
    name: d.name,
    price: d.price ?? 0,
    recipe: d.recipe ?? [],
    archived: d.archived ?? false,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
  };
}

export async function listPudimFlavors(storeId: string): Promise<PudimFlavor[]> {
  const snap = await flavorsCol(storeId).orderBy("name").get();
  return snap.docs.map((doc) => toFlavor(doc.id, doc.data()));
}

export async function getPudimFlavor(
  storeId: string,
  id: string,
): Promise<PudimFlavor | null> {
  const snap = await flavorsCol(storeId).doc(id).get();
  return snap.exists ? toFlavor(snap.id, snap.data()!) : null;
}

export interface PudimFlavorInput {
  name: string;
  price: number;
  recipe: RecipeItemInput[];
  archived?: boolean;
}

async function resolveFlavorData(storeId: string, input: PudimFlavorInput) {
  const recipe = await Promise.all(
    input.recipe.map((r) => resolveRecipeItem(storeId, r)),
  );
  return { name: input.name, price: input.price, recipe };
}

export async function createPudimFlavor(
  storeId: string,
  input: PudimFlavorInput,
): Promise<string> {
  const data = await resolveFlavorData(storeId, input);
  const ref = await flavorsCol(storeId).add({
    ...data,
    archived: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function updatePudimFlavor(
  storeId: string,
  id: string,
  input: PudimFlavorInput,
): Promise<void> {
  const data = await resolveFlavorData(storeId, input);
  await flavorsCol(storeId)
    .doc(id)
    .update({ ...data, archived: input.archived ?? false });
}

// ---------------------------------------------------------------------------
// Bases
// ---------------------------------------------------------------------------

function toBase(id: string, d: FirebaseFirestore.DocumentData): PudimBase {
  return {
    id,
    name: d.name,
    insumo: d.insumo,
    price: d.price ?? 0,
    archived: d.archived ?? false,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
  };
}

export async function listPudimBases(storeId: string): Promise<PudimBase[]> {
  const snap = await basesCol(storeId).orderBy("name").get();
  return snap.docs.map((doc) => toBase(doc.id, doc.data()));
}

export interface PudimBaseInput {
  name: string;
  insumo: InsumoInput;
  price: number;
  archived?: boolean;
}

export async function createPudimBase(
  storeId: string,
  input: PudimBaseInput,
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

export async function updatePudimBase(
  storeId: string,
  id: string,
  input: PudimBaseInput,
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
// Adicionais — tiered pricing, the only tiered modifier type Pudim has (no
// Borda equivalent).
// ---------------------------------------------------------------------------

export interface TieredModifierInput {
  name: string;
  insumo: InsumoInput;
  tiers: PriceTier[];
  archived?: boolean;
}

function toMixin(id: string, d: FirebaseFirestore.DocumentData): PudimMixin {
  return {
    id,
    name: d.name,
    insumo: d.insumo,
    tiers: d.tiers ?? [],
    archived: d.archived ?? false,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
  };
}

export async function listPudimMixins(storeId: string): Promise<PudimMixin[]> {
  const snap = await mixinsCol(storeId).orderBy("name").get();
  return snap.docs.map((doc) => toMixin(doc.id, doc.data()));
}

export async function createPudimMixin(
  storeId: string,
  input: TieredModifierInput,
): Promise<string> {
  const insumo = await resolveInsumo(storeId, input.insumo);
  const ref = await mixinsCol(storeId).add({
    name: input.name,
    insumo,
    tiers: input.tiers,
    archived: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function updatePudimMixin(
  storeId: string,
  id: string,
  input: TieredModifierInput,
): Promise<void> {
  const insumo = await resolveInsumo(storeId, input.insumo);
  await mixinsCol(storeId)
    .doc(id)
    .update({
      name: input.name,
      insumo,
      tiers: input.tiers,
      archived: input.archived ?? false,
    });
}

// ---------------------------------------------------------------------------
// Utensílios
// ---------------------------------------------------------------------------

function toUtensil(id: string, d: FirebaseFirestore.DocumentData): PudimUtensil {
  return {
    id,
    name: d.name,
    insumo: d.insumo,
    defaultIncluded: d.defaultIncluded ?? true,
    archived: d.archived ?? false,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
  };
}

export async function listPudimUtensils(storeId: string): Promise<PudimUtensil[]> {
  const snap = await utensilsCol(storeId).orderBy("name").get();
  return snap.docs.map((doc) => toUtensil(doc.id, doc.data()));
}

export interface PudimUtensilInput {
  name: string;
  insumo: InsumoInput;
  defaultIncluded: boolean;
  archived?: boolean;
}

export async function createPudimUtensil(
  storeId: string,
  input: PudimUtensilInput,
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

export async function updatePudimUtensil(
  storeId: string,
  id: string,
  input: PudimUtensilInput,
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
// Brindes — a café menu Product given away free alongside a "Montar pudim"
// order line. `id === productId`: a pure join against products, no recipe or
// price of its own here (always read the LIVE Product for display). Only the
// name is cached on the doc, purely as a fallback label if the Product is
// later deleted/archived (brinde-grid.tsx's muted-state rendering).
// ---------------------------------------------------------------------------

function toBrinde(id: string, d: FirebaseFirestore.DocumentData): PudimBrinde {
  return {
    id,
    productId: id,
    name: d.name,
    archived: d.archived ?? false,
    createdAt: d.createdAt?.toDate().toISOString() ?? "",
  };
}

export async function listPudimBrindes(storeId: string): Promise<PudimBrinde[]> {
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
export async function addPudimBrindes(
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

export async function setPudimBrindeArchived(
  storeId: string,
  productId: string,
  archived: boolean,
): Promise<void> {
  await brindesCol(storeId).doc(productId).update({ archived });
}

// ---------------------------------------------------------------------------
// Consumption-engine support: batch-load only the catalog entries an order's
// pudim lines actually reference (mirrors fetchLineProducts' discipline),
// plus the full (small) utensílios list, since defaults apply store-wide.
// ---------------------------------------------------------------------------

export interface PudimCatalogs {
  flavors: Map<string, PudimFlavor>;
  bases: Map<string, PudimBase>;
  mixins: Map<string, PudimMixin>;
  utensils: PudimUtensil[];
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

export async function loadPudimCatalogsForItems(
  storeId: string,
  items: OrderItem[],
): Promise<PudimCatalogs> {
  const flavorIds = new Set<string>();
  const baseIds = new Set<string>();
  const mixinIds = new Set<string>();
  for (const line of items) {
    const pudim = line.pudim;
    if (!pudim) continue;
    flavorIds.add(pudim.flavorId);
    if (pudim.baseId) baseIds.add(pudim.baseId);
    for (const m of pudim.mixins) mixinIds.add(m.modifierId);
  }

  const [flavors, bases, mixins, utensils] = await Promise.all([
    loadByIds(flavorsCol(storeId), flavorIds, toFlavor),
    loadByIds(basesCol(storeId), baseIds, toBase),
    loadByIds(mixinsCol(storeId), mixinIds, toMixin),
    listPudimUtensils(storeId),
  ]);

  return { flavors, bases, mixins, utensils };
}
