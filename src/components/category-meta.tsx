import type { LucideIcon } from "lucide-react";
import {
  Carrot,
  CupSoda,
  Drumstick,
  GlassWater,
  Grid3x3,
  Package,
  Pill,
  Pizza,
  PlusCircle,
  Utensils,
  Sandwich,
  Sparkles,
  Wheat,
} from "lucide-react";
import { PALETTE, type CategoryIconKey, type StockCategoryDef } from "@/lib/stock-settings";

export interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  /** text color + wash background, from the Selet palette */
  fg: string;
  bg: string;
}

/** Product categories (Catálogo) — the café menu sections. */
export const PRODUCT_CATEGORY_META: Record<string, CategoryMeta> = {
  shakes: { label: "Shakes", icon: GlassWater, fg: "text-cat-shakes", bg: "bg-cat-shakes-wash" },
  waffles: { label: "Waffles", icon: Grid3x3, fg: "text-cat-waffles", bg: "bg-cat-waffles-wash" },
  salgados: { label: "Salgados", icon: Pizza, fg: "text-cat-salgados", bg: "bg-cat-salgados-wash" },
  bebidas: { label: "Bebidas", icon: CupSoda, fg: "text-cat-bebidas", bg: "bg-cat-bebidas-wash" },
  lanches: { label: "Lanches", icon: Sandwich, fg: "text-cat-lanches", bg: "bg-cat-lanches-wash" },
  adicionais: { label: "Adicionais", icon: PlusCircle, fg: "text-cat-adicionais", bg: "bg-cat-adicionais-wash" },
};

/** Icon registry for the per-store stock categories (keys: CATEGORY_ICON_KEYS). */
export const CATEGORY_ICONS: Record<CategoryIconKey, LucideIcon> = {
  wheat: Wheat,
  drumstick: Drumstick,
  "cup-soda": CupSoda,
  carrot: Carrot,
  pill: Pill,
  sparkles: Sparkles,
  utensils: Utensils,
  package: Package,
};

/**
 * Stock (insumo) category meta, built from the store's own categories
 * (Configurações → Estoque). Use `useStockCategoryMeta()` in components.
 */
export function buildStockCategoryMeta(categories: StockCategoryDef[]): Record<string, CategoryMeta> {
  return Object.fromEntries(
    categories.map((c) => {
      const swatch = PALETTE[c.color] ?? PALETTE.cinza;
      return [
        c.id,
        { label: c.name, icon: CATEGORY_ICONS[c.icon] ?? Package, fg: swatch.fg, bg: swatch.bg },
      ];
    }),
  );
}

export const PRODUCT_TYPE_TAG_LABELS: Record<string, string> = {
  vegano: "Vegano",
  vegetariano: "Vegetariano",
  "sem-lactose": "Sem lactose",
  "sem-gluten": "Sem glúten",
  proteico: "Proteico",
};

export function CategoryTile({
  meta,
  className,
}: {
  meta: CategoryMeta;
  className?: string;
}) {
  const Icon = meta.icon;
  return (
    <span
      className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${meta.bg} ${meta.fg} ${className ?? ""}`}
    >
      <Icon className="size-5" strokeWidth={1.8} />
    </span>
  );
}
