/**
 * Cardápio público: the customer-facing menu a store curates. The menu stores
 * only WHAT shows and HOW it reads (order, texts, a tag, a photo); prices are
 * never stored here — they are resolved live from the catalog, so the menu
 * always follows the Cardápio, Shakes and Pudim.
 *
 * Entries are one of:
 *  - "product": a Cardápio item;
 *  - "shake-mix" / "pudim-mix": a named suggestion built from the Shakes/Pudim
 *    modifiers (sabores, base, bordas, adicionais), priced like an order line;
 *  - "extras-shake" / "extras-pudim": the price table of every adicional/borda.
 *
 * Stored at stores/{id}/settings/menu as { draft, published }.
 */

import { MAX_PUDIM_FLAVORS, MAX_SHAKE_FLAVORS, type PriceTier } from "./types";

export const MENU_SOURCES = ["product", "shake-mix", "pudim-mix", "extras-shake", "extras-pudim"] as const;
export type MenuSource = (typeof MENU_SOURCES)[number];
export type MixKind = "shake" | "pudim";

export const MENU_TAGS = ["novo", "temporario", "mais-pedido"] as const;
export type MenuTag = (typeof MENU_TAGS)[number];
export const MENU_TAG_LABELS: Record<MenuTag, string> = {
  novo: "Novo",
  temporario: "Temporário",
  "mais-pedido": "Mais pedido",
};

export const MIX_MAX_FLAVORS: Record<MixKind, number> = { shake: MAX_SHAKE_FLAVORS, pudim: MAX_PUDIM_FLAVORS };

/** A built shake/pudim: the same picks as a "Montar shake" order line. */
export interface MenuMix {
  flavorIds: string[];
  baseId: string | null;
  rims: { id: string; qty: number }[];
  mixins: { id: string; qty: number }[];
}

export interface MenuEntry {
  source: MenuSource;
  /** Product id, a random id for mixes, the kind for extras tables. */
  id: string;
  /** Overrides the catalog name / description; mixes always carry a name. */
  name?: string;
  description?: string;
  tag?: MenuTag;
  mix?: MenuMix;
  /** Uploaded photo id: the entry becomes a highlight card. */
  photo?: string;
  /** Small caps line on a highlight card ("Combo da casa"). */
  caption?: string;
}

export interface MenuSection {
  id: string;
  title: string;
  /** Small caps line above the title ("Shakes"). */
  kicker?: string;
  /** Short line beside the title ("Bordas, caldas e coberturas generosas."). */
  note?: string;
  /** Printed menu: start this section on a new A4 page. */
  newPage?: boolean;
  entries: MenuEntry[];
}

export interface MenuDoc {
  title: string;
  tagline: string;
  coverPhoto?: string;
  sections: MenuSection[];
}

/** What the editor and the public page receive. */
export interface MenuState {
  draft: MenuDoc;
  published: MenuDoc | null;
  publishedAt: string | null;
}

/** One Cardápio product the menu can point at, with its live price. */
export interface MenuCatalogItem {
  id: string;
  name: string;
  description?: string;
  price: number; // centavos
  /** Cardápio category name, for grouping. */
  group: string;
  /** Archived/inactive in the catalog → never shown to customers. */
  available: boolean;
}

export interface MixOption {
  id: string;
  name: string;
  price: number;
  archived: boolean;
}
export interface MixTieredOption {
  id: string;
  name: string;
  tiers: PriceTier[];
  archived: boolean;
}
/** The Shakes or Pudim modifier catalog. */
export interface MixCatalog {
  flavors: MixOption[];
  bases: MixOption[];
  rims: MixTieredOption[];
  mixins: MixTieredOption[];
}

export interface MenuCatalog {
  products: MenuCatalogItem[];
  shake: MixCatalog;
  pudim: MixCatalog;
}

export const entryKey = (e: { source: MenuSource; id: string }) => `${e.source}:${e.id}`;
export const mixKindOf = (source: MenuSource): MixKind | null =>
  source === "shake-mix" ? "shake" : source === "pudim-mix" ? "pudim" : null;
export const photoUrl = (storeId: string, id: string) => `/cardapio/${storeId}/foto/${id}`;

/** Price for an exact tier quantity, or 0 (mirrors the order builders). */
export function tierPrice(tiers: PriceTier[], qty: number): number {
  return tiers.find((t) => t.qty === qty)?.price ?? 0;
}

export interface MixLine {
  label: string;
  price: number;
}

/**
 * A mix priced the way Pedidos prices a "Montar shake/pudim" line: the most
 * expensive sabor, plus the base surcharge, plus each borda/adicional tier.
 * `available` is false when a pick is gone or archived (or no sabor).
 */
export function priceMix(mix: MenuMix, cat: MixCatalog): { price: number; lines: MixLine[]; picks: string[]; available: boolean } {
  const lines: MixLine[] = [];
  let available = mix.flavorIds.length > 0;
  const live = <T extends { id: string; archived: boolean }>(list: T[], id: string) => {
    const x = list.find((o) => o.id === id);
    if (!x || x.archived) available = false;
    return x;
  };
  const flavors = mix.flavorIds.map((id) => live(cat.flavors, id)).filter((f) => !!f);
  const primary = flavors.reduce<MixOption | undefined>(
    (best, f) => (!best || f.price > best.price || (f.price === best.price && f.id < best.id) ? f : best),
    undefined,
  );
  if (primary) lines.push({ label: `Sabor ${primary.name}${flavors.length > 1 ? " (o mais caro)" : ""}`, price: primary.price });
  const base = mix.baseId ? live(cat.bases, mix.baseId) : undefined;
  if (base?.price) lines.push({ label: base.name, price: base.price });
  for (const [picks, list, prefix] of [
    [mix.rims, cat.rims, "Borda "],
    [mix.mixins, cat.mixins, ""],
  ] as const) {
    for (const p of picks) {
      const o = live(list, p.id);
      if (o) lines.push({ label: `${prefix}${o.name}${p.qty > 1 ? ` ${p.qty}×` : ""}`, price: tierPrice(o.tiers, p.qty) });
    }
  }
  const picks = [...flavors.map((f) => f.name), ...lines.slice(primary ? 1 : 0).map((l) => l.label)];
  return { price: lines.reduce((s, l) => s + l.price, 0), lines, picks, available };
}

/** "Morango e Baunilha com borda de Morango e Fibra de uva" — the suggested description. */
export function describeMix(mix: MenuMix, cat: MixCatalog): string {
  const names = (ids: string[], list: { id: string; name: string }[]) =>
    ids.map((id) => list.find((o) => o.id === id)?.name).filter((n): n is string => !!n);
  const and = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs.at(-1)}`);
  const flavors = names(mix.flavorIds, cat.flavors);
  const extras = [
    ...names(mix.rims.map((r) => r.id), cat.rims).map((n) => `borda de ${n.toLowerCase()}`),
    ...names(mix.mixins.map((m) => m.id), cat.mixins).map((n) => n.toLowerCase()),
  ];
  const head = and(flavors);
  return extras.length ? `${head} com ${and(extras)}.` : head ? `${head}.` : "";
}

export interface TableRow {
  label: string;
  price: number;
}

/** Every live adicional and borda, one row per quantity tier ("Crunch · 2×"). */
export function extrasRows(cat: MixCatalog): TableRow[] {
  const rows: TableRow[] = [];
  for (const [list, prefix] of [
    [cat.mixins, ""],
    [cat.rims, "Borda "],
  ] as const) {
    for (const o of list) {
      if (o.archived) continue;
      const tiers = [...o.tiers].sort((a, b) => a.qty - b.qty);
      for (const t of tiers) rows.push({ label: `${prefix}${o.name}${tiers.length > 1 ? ` · ${t.qty}×` : ""}`, price: t.price });
    }
  }
  return rows;
}

export interface ResolvedEntry {
  key: string;
  kind: "item" | "table";
  number: number;
  name: string;
  description: string;
  price: number;
  tag?: MenuTag;
  available: boolean;
  /** Extras tables only. */
  rows: TableRow[];
  /** Mixes only: every pick ("Morango", "Borda Morango 2×"), for the editor's chip. */
  mixPicks: string[];
  entry: MenuEntry;
}

export interface ResolvedSection {
  section: MenuSection;
  entries: ResolvedEntry[];
  /** Every item costs the same (3+ items) → show one "Preço único" instead of a price per line. */
  uniformPrice: number | null;
}

/** The text an entry shows when it has no override (catalog name, generated description…). */
export function entryDefaults(entry: MenuEntry, catalog: MenuCatalog): { name: string; description: string } {
  const kind = mixKindOf(entry.source);
  if (kind && entry.mix) return { name: "", description: describeMix(entry.mix, catalog[kind]) };
  if (entry.source === "extras-shake") return { name: "Adicionais de shake", description: "" };
  if (entry.source === "extras-pudim") return { name: "Adicionais de pudim", description: "" };
  const p = catalog.products.find((x) => x.id === entry.id);
  return { name: p?.name ?? "", description: p?.description ?? "" };
}

function resolveEntry(entry: MenuEntry, catalog: MenuCatalog): Omit<ResolvedEntry, "number" | "key" | "entry"> {
  const d = entryDefaults(entry, catalog);
  const name = entry.name?.trim() || d.name;
  const description = entry.description?.trim() ?? d.description;
  const kind = mixKindOf(entry.source);
  if (kind) {
    const m = entry.mix ? priceMix(entry.mix, catalog[kind]) : { price: 0, picks: [], available: false };
    return { kind: "item", name: name || "Sugestão sem nome", description, price: m.price, tag: entry.tag, available: m.available, rows: [], mixPicks: m.picks };
  }
  if (entry.source === "extras-shake" || entry.source === "extras-pudim") {
    const rows = extrasRows(catalog[entry.source === "extras-shake" ? "shake" : "pudim"]);
    return { kind: "table", name, description, price: 0, available: rows.length > 0, rows, mixPicks: [] };
  }
  const p = catalog.products.find((x) => x.id === entry.id);
  return {
    kind: "item",
    name: name || "Item removido do Cardápio",
    description,
    price: p?.price ?? 0,
    tag: entry.tag,
    available: !!p?.available,
    rows: [],
    mixPicks: [],
  };
}

/**
 * Joins the menu to the live catalog. Entries whose item is gone or
 * unavailable are dropped unless `keepUnavailable` (the editor shows them
 * faded). Numbers run across the whole menu, counting only visible items.
 */
export function resolveMenu(doc: MenuDoc, catalog: MenuCatalog, { keepUnavailable = false } = {}): ResolvedSection[] {
  let n = 0;
  return doc.sections.map((section) => {
    const entries: ResolvedEntry[] = [];
    for (const entry of section.entries) {
      const r = resolveEntry(entry, catalog);
      if (!r.available && !keepUnavailable) continue;
      entries.push({ ...r, key: entryKey(entry), number: r.available && r.kind === "item" ? ++n : 0, entry });
    }
    const priced = entries.filter((e) => e.available && e.kind === "item");
    const uniformPrice = priced.length >= 3 && priced.every((e) => e.price === priced[0].price) ? priced[0].price : null;
    return { section, entries, uniformPrice };
  });
}

export function newSectionId(taken: Iterable<string>): string {
  const ids = new Set(taken);
  let i = ids.size + 1;
  while (ids.has(`s${i}`)) i++;
  return `s${i}`;
}

/**
 * First-open menu: one section per Cardápio category (its available items, in
 * catalog order), then the shake and pudim extras tables. The store prunes and
 * adds its built suggestions from here instead of starting blank.
 */
export function defaultMenu(catalog: MenuCatalog): MenuDoc {
  const groups = new Map<string, MenuCatalogItem[]>();
  for (const item of catalog.products) {
    if (!item.available) continue;
    groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  }
  const sections: MenuSection[] = [...groups].map(([group, items], i) => ({
    id: `s${i + 1}`,
    title: group,
    entries: items.map((it) => ({ source: "product", id: it.id })),
  }));
  for (const kind of ["shake", "pudim"] as const) {
    if (!extrasRows(catalog[kind]).length) continue;
    sections.push({
      id: `s${sections.length + 1}`,
      title: kind === "shake" ? "Extras para o seu shake" : "Extras para o seu pudim",
      kicker: "Adicionais",
      entries: [{ source: kind === "shake" ? "extras-shake" : "extras-pudim", id: kind }],
    });
  }
  return { title: "Cardápio", tagline: "", sections };
}
