import "server-only";

import { getDb } from "@/lib/firebase-admin";
import { defaultMenu, type MenuCatalog, type MenuDoc, type MenuState } from "@/lib/menu";
import type { PriceTier } from "@/lib/types";
import { listProducts } from "./products";
import { listPudimBases, listPudimFlavors, listPudimMixins } from "./pudim";
import { getProductSettings } from "./settings";
import { listShakeBases, listShakeFlavors, listShakeMixins, listShakeRims } from "./shakes";

const menuRef = (storeId: string) =>
  getDb().collection("stores").doc(storeId).collection("settings").doc("menu");

/** Cardápio products (in category order) plus the Shakes and Pudim modifier catalogs, all with live prices. */
export async function loadMenuCatalog(storeId: string): Promise<MenuCatalog> {
  const [products, settings, flavors, bases, rims, mixins, pudins, pudimBases, pudimMixins] = await Promise.all([
    listProducts(storeId),
    getProductSettings(storeId),
    listShakeFlavors(storeId),
    listShakeBases(storeId),
    listShakeRims(storeId),
    listShakeMixins(storeId),
    listPudimFlavors(storeId),
    listPudimBases(storeId),
    listPudimMixins(storeId),
  ]);
  const order = settings.categories.map((c) => c.id);
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  const catName = new Map(settings.categories.map((c) => [c.id, c.name]));
  const opt = (x: { id: string; name: string; price: number; archived: boolean }) => ({
    id: x.id,
    name: x.name,
    price: x.price,
    archived: x.archived,
  });
  const tiered = (x: { id: string; name: string; tiers: PriceTier[]; archived: boolean }) => ({
    id: x.id,
    name: x.name,
    tiers: x.tiers,
    archived: x.archived,
  });
  return {
    products: [...products]
      .sort((a, b) => rank(a.category) - rank(b.category))
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        group: catName.get(p.category) ?? "Outros",
        available: p.active && !p.archived,
      })),
    shake: { flavors: flavors.map(opt), bases: bases.map(opt), rims: rims.map(tiered), mixins: mixins.map(tiered) },
    pudim: { flavors: pudins.map(opt), bases: pudimBases.map(opt), rims: [], mixins: pudimMixins.map(tiered) },
  };
}

/** Absent doc → a draft generated from the catalog, never published. */
export async function getMenuState(storeId: string, catalog: MenuCatalog): Promise<MenuState> {
  const d = (await menuRef(storeId).get()).data();
  return {
    draft: d?.draft ?? defaultMenu(catalog),
    published: d?.published ?? null,
    publishedAt: d?.publishedAt?.toDate().toISOString() ?? null,
  };
}

/** Public page: only the published menu (null = not online). */
export async function getPublishedMenu(storeId: string): Promise<{ doc: MenuDoc; publishedAt: string } | null> {
  const d = (await menuRef(storeId).get()).data();
  if (!d?.published) return null;
  return { doc: d.published, publishedAt: d.publishedAt?.toDate().toISOString() ?? "" };
}

export async function saveMenuDraft(storeId: string, draft: MenuDoc): Promise<void> {
  await menuRef(storeId).set({ draft, updatedAt: new Date() }, { merge: true });
}

export async function publishMenu(storeId: string, draft: MenuDoc): Promise<string> {
  const at = new Date();
  await menuRef(storeId).set({ draft, published: draft, publishedAt: at, updatedAt: at }, { merge: true });
  return at.toISOString();
}

export async function unpublishMenu(storeId: string): Promise<void> {
  await menuRef(storeId).set({ published: null, updatedAt: new Date() }, { merge: true });
}

// ---------------------------------------------------------------- photos

// ponytail: photos live as Firestore bytes (resized in the browser to < 900 KB),
// which keeps us off Cloud Storage; move to Storage if photos outgrow one doc.
const photosCol = (storeId: string) => getDb().collection("stores").doc(storeId).collection("menuPhotos");

export async function saveMenuPhoto(storeId: string, bytes: Buffer, type: string): Promise<string> {
  const ref = await photosCol(storeId).add({ data: bytes, type, createdAt: new Date() });
  return ref.id;
}

export async function getMenuPhoto(storeId: string, id: string): Promise<{ data: Buffer; type: string } | null> {
  const d = (await photosCol(storeId).doc(id).get()).data();
  return d ? { data: Buffer.from(d.data), type: d.type } : null;
}
