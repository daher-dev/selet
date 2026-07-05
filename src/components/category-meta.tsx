import type { LucideIcon } from "lucide-react";
import {
  Beef,
  Carrot,
  Croissant,
  CupSoda,
  Salad,
  Soup,
  Wheat,
} from "lucide-react";

export interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  /** text color + wash background, from the Selet palette */
  fg: string;
  bg: string;
}

/** Product categories (Catálogo). */
export const PRODUCT_CATEGORY_META: Record<string, CategoryMeta> = {
  bowls: { label: "Bowls", icon: Salad, fg: "text-cat-bowls", bg: "bg-cat-bowls-wash" },
  sopas: { label: "Sopas", icon: Soup, fg: "text-cat-sopas", bg: "bg-cat-sopas-wash" },
  salgados: { label: "Salgados", icon: Croissant, fg: "text-cat-salgados", bg: "bg-cat-salgados-wash" },
  bebidas: { label: "Bebidas", icon: CupSoda, fg: "text-cat-bebidas", bg: "bg-cat-bebidas-wash" },
};

/** Stock (insumo) categories. */
export const STOCK_CATEGORY_META: Record<string, CategoryMeta> = {
  bebidas: { label: "Bebidas", icon: CupSoda, fg: "text-cat-bebidas", bg: "bg-cat-bebidas-wash" },
  hortifruti: { label: "Hortifrúti", icon: Carrot, fg: "text-cat-bowls", bg: "bg-cat-bowls-wash" },
  proteinas: { label: "Proteínas", icon: Beef, fg: "text-cat-proteinas", bg: "bg-cat-proteinas-wash" },
  secos: { label: "Secos", icon: Wheat, fg: "text-cat-salgados", bg: "bg-cat-salgados-wash" },
  base: { label: "Base", icon: Soup, fg: "text-cat-sopas", bg: "bg-cat-sopas-wash" },
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
