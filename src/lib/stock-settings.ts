/**
 * Per-store configuration shared by server and client: stock categories and
 * units of use (Configurações → Estoque) and lançamento categories
 * (Configurações → Financeiro). Pure data + helpers, no I/O.
 *
 * Stored as one small doc per domain under stores/{id}/settings/*. When a doc
 * is absent, the DEFAULT_* below apply, so a store works before any migration.
 * Their ids equal the keys the app hardcoded before (secos, g, sache…), which
 * is why existing stock items/lançamentos need no rewrite.
 */

/** Shared 7-swatch palette (design: Mock Configurações 2a). */
export const PALETTE_KEYS = [
  "ocre",
  "terracota",
  "teal",
  "verde",
  "roxo",
  "vermelho",
  "cinza",
] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];

export interface PaletteSwatch {
  label: string;
  /** solid color (text, dots, swatches) */
  hex: string;
  /** soft wash (icon tile background) */
  wash: string;
  /** static Tailwind classes — literals so the scanner emits them */
  fg: string;
  bg: string;
}

export const PALETTE: Record<PaletteKey, PaletteSwatch> = {
  ocre: { label: "Ocre", hex: "#AD861C", wash: "#F5EED2", fg: "text-[#AD861C]", bg: "bg-[#F5EED2]" },
  terracota: { label: "Terracota", hex: "#B0603A", wash: "#F5E7DF", fg: "text-[#B0603A]", bg: "bg-[#F5E7DF]" },
  teal: { label: "Azul", hex: "#2F8FA8", wash: "#E3F1F4", fg: "text-[#2F8FA8]", bg: "bg-[#E3F1F4]" },
  verde: { label: "Verde", hex: "#3A8B4E", wash: "#E4F1DC", fg: "text-[#3A8B4E]", bg: "bg-[#E4F1DC]" },
  roxo: { label: "Roxo", hex: "#7C55C9", wash: "#EDE6F8", fg: "text-[#7C55C9]", bg: "bg-[#EDE6F8]" },
  vermelho: { label: "Vermelho", hex: "#C0492F", wash: "#FBE9E4", fg: "text-[#C0492F]", bg: "bg-[#FBE9E4]" },
  cinza: { label: "Cinza", hex: "#5C6B62", wash: "#EEF1EC", fg: "text-[#5C6B62]", bg: "bg-[#EEF1EC]" },
};

/**
 * Icons offered for a stock category (keys map to lucide icons in category-meta.tsx).
 * Order is display order; the first eight are the original set.
 */
export const CATEGORY_ICON_KEYS = [
  "wheat",
  "drumstick",
  "cup-soda",
  "carrot",
  "pill",
  "sparkles",
  "utensils",
  "package",
  "apple",
  "banana",
  "cherry",
  "grape",
  "citrus",
  "salad",
  "leafy-green",
  "sprout",
  "bean",
  "nut",
  "egg",
  "milk",
  "beef",
  "fish",
  "ham",
  "croissant",
  "sandwich",
  "pizza",
  "soup",
  "cookie",
  "cake-slice",
  "candy",
  "ice-cream-cone",
  "donut",
  "popcorn",
  "coffee",
  "beer",
  "wine",
  "glass-water",
  "cooking-pot",
  "chef-hat",
  "spray-can",
  "droplets",
  "brush-cleaning",
  "flask-conical",
  "heart-pulse",
  "box",
  "boxes",
  "shopping-basket",
  "tag",
  "snowflake",
  "flame",
] as const;
export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

export interface StockCategoryDef {
  id: string;
  name: string;
  icon: CategoryIconKey;
  color: PaletteKey;
}

/**
 * "count" = deducted by an exact count per use (un, sachê → consumption mode
 * "medido"). "measure" = weight/volume, never weighed per use: the open
 * package is tracked by a usage counter and marked empty ("contínuo").
 */
export type UnitKind = "count" | "measure";

export interface StockUnitDef {
  id: string;
  /** short form shown next to quantities: un, g, kg, ml, L, sachê */
  symbol: string;
  name: string;
  plural: string;
  kind: UnitKind;
}

export interface StockSettings {
  categories: StockCategoryDef[];
  units: StockUnitDef[];
}

export const DEFAULT_STOCK_CATEGORIES: StockCategoryDef[] = [
  { id: "secos", name: "Secos", icon: "wheat", color: "ocre" },
  { id: "proteinas", name: "Proteínas", icon: "drumstick", color: "terracota" },
  { id: "bebidas", name: "Bebidas", icon: "cup-soda", color: "teal" },
  { id: "hortifruti", name: "Hortifrúti", icon: "carrot", color: "verde" },
  { id: "suplementos", name: "Suplementos", icon: "pill", color: "roxo" },
  { id: "beleza", name: "Beleza", icon: "sparkles", color: "vermelho" },
  { id: "descartaveis", name: "Descartáveis", icon: "utensils", color: "cinza" },
];

export const DEFAULT_STOCK_UNITS: StockUnitDef[] = [
  { id: "un", symbol: "un", name: "unidade", plural: "unidades", kind: "count" },
  { id: "sache", symbol: "sachê", name: "sachê", plural: "sachês", kind: "count" },
  { id: "g", symbol: "g", name: "grama", plural: "gramas", kind: "measure" },
  { id: "kg", symbol: "kg", name: "quilograma", plural: "quilogramas", kind: "measure" },
  { id: "ml", symbol: "ml", name: "mililitro", plural: "mililitros", kind: "measure" },
  { id: "L", symbol: "L", name: "litro", plural: "litros", kind: "measure" },
];

export const DEFAULT_STOCK_SETTINGS: StockSettings = {
  categories: DEFAULT_STOCK_CATEGORIES,
  units: DEFAULT_STOCK_UNITS,
};

export interface FinanceCategoryDef {
  id: string;
  name: string;
  direction: "in" | "out";
  color: PaletteKey;
  /** protected: can be renamed/recolored but not deleted (drives a Financeiro split) */
  system?: boolean;
}

/** The Insumos saída category the Financeiro hero splits out from Operação. */
export const INSUMOS_CATEGORY_ID = "insumos";
/** Legacy key for Insumos before categories became configurable. */
export const LEGACY_INSUMOS_CATEGORY_ID = "compras";

export interface FinanceSettings {
  categories: FinanceCategoryDef[];
}

export const DEFAULT_FINANCE_CATEGORIES: FinanceCategoryDef[] = [
  { id: "custos-fixos", name: "Custos fixos", direction: "out", color: "ocre" },
  { id: "impostos", name: "Impostos", direction: "out", color: "vermelho" },
  { id: INSUMOS_CATEGORY_ID, name: "Insumos", direction: "out", color: "verde", system: true },
  { id: "marketing", name: "Marketing", direction: "out", color: "roxo" },
  { id: "outros", name: "Outros", direction: "out", color: "cinza" },
  { id: "aportes", name: "Aportes", direction: "in", color: "teal" },
  { id: "outras-receitas", name: "Outras receitas", direction: "in", color: "verde" },
];

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  categories: DEFAULT_FINANCE_CATEGORIES,
};

/** Category of order-mirror lançamentos — system-owned, never listed/editable. */
export const SALES_CATEGORY_ID = "vendas";

/** Legacy manual-tx category → the new default id (migrate-settings.ts). */
export const LEGACY_FINANCE_CATEGORY_MAP: Record<string, string> = {
  compras: INSUMOS_CATEGORY_ID,
  salarios: "custos-fixos",
  aluguel: "custos-fixos",
  marketing: "marketing",
  outros: "outros",
};

// ---------- pure helpers ----------

/** "Pó de Proteína" → "po-de-proteina" (ids are immutable slugs). */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A slug not present in `taken` (appends -2, -3… on collision). */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const root = base || "item";
  if (!set.has(root)) return root;
  let n = 2;
  while (set.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

const LEGACY_MEASURE_IDS = new Set(["g", "kg", "ml", "L"]);

/** Kind of a unit id; falls back to the legacy id rule when the unit is unknown. */
export function unitKind(units: StockUnitDef[], id: string): UnitKind {
  const def = units.find((u) => u.id === id);
  if (def) return def.kind;
  return LEGACY_MEASURE_IDS.has(id) ? "measure" : "count";
}

/** Display label of a unit: its symbol; the plural only when the symbol is the full name (sachê → sachês). */
export function unitLabelFrom(units: StockUnitDef[], id: string, plural = false): string {
  const def = units.find((u) => u.id === id);
  if (!def) return id;
  if (plural && def.symbol.toLowerCase() === def.name.toLowerCase()) return def.plural;
  return def.symbol;
}

/**
 * Unit groups for the segmented pickers: count units together, measure units
 * in pairs (design: [un sachê] [g kg] [ml L]).
 */
export function groupUnitsForPicker(units: StockUnitDef[]): StockUnitDef[][] {
  const count = units.filter((u) => u.kind === "count");
  const measure = units.filter((u) => u.kind === "measure");
  const groups: StockUnitDef[][] = [];
  if (count.length) groups.push(count);
  for (let i = 0; i < measure.length; i += 2) groups.push(measure.slice(i, i + 2));
  return groups;
}

export function financeCategoriesFor(
  categories: FinanceCategoryDef[],
  direction: "in" | "out",
): FinanceCategoryDef[] {
  return categories.filter((c) => c.direction === direction);
}
