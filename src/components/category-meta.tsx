import type { LucideIcon } from "lucide-react";
import {
  CupSoda,
  Dumbbell,
  GlassWater,
  Grid3x3,
  Leaf,
  Pizza,
  PlusCircle,
  Sandwich,
  ShoppingBag,
  Sparkles,
} from "lucide-react";

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

/** Stock (insumo) categories — the Herbalife distributor lines. */
export const STOCK_CATEGORY_META: Record<string, CategoryMeta> = {
  nutricao: { label: "Nutrição", icon: Leaf, fg: "text-cat-nutricao", bg: "bg-cat-nutricao-wash" },
  esporte: { label: "24 Hours", icon: Dumbbell, fg: "text-cat-esporte", bg: "bg-cat-esporte-wash" },
  avulsos: { label: "Avulsos", icon: ShoppingBag, fg: "text-cat-avulsos", bg: "bg-cat-avulsos-wash" },
  beleza: { label: "Beleza", icon: Sparkles, fg: "text-cat-beleza", bg: "bg-cat-beleza-wash" },
};

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
