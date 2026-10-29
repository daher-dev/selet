import type { LucideIcon } from "lucide-react";
import {
  Dumbbell,
  MilkOff,
  Vegan,
  WheatOff,
  Apple,
  Banana,
  Bean,
  Beef,
  Beer,
  Box,
  Boxes,
  BrushCleaning,
  CakeSlice,
  Candy,
  Carrot,
  ChefHat,
  Cherry,
  Citrus,
  Coffee,
  Cookie,
  CookingPot,
  Croissant,
  CupSoda,
  Donut,
  Droplets,
  Drumstick,
  Egg,
  Fish,
  Flame,
  FlaskConical,
  GlassWater,
  Grape,
  CirclePlus,
  Grid3x3,
  Ham,
  HeartPulse,
  IceCreamCone,
  LeafyGreen,
  Milk,
  Nut,
  Package,
  Pill,
  Pizza,
  Popcorn,
  Salad,
  Sandwich,
  ShoppingBasket,
  Snowflake,
  Soup,
  Sparkles,
  SprayCan,
  Sprout,
  Tag,
  Utensils,
  Wheat,
  Wine,
} from "lucide-react";
import { PALETTE, type CategoryIconKey, type StockCategoryDef } from "@/lib/stock-settings";

export interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  /** text color + wash background, from the Selet palette */
  fg: string;
  bg: string;
}

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
  apple: Apple,
  banana: Banana,
  cherry: Cherry,
  grape: Grape,
  citrus: Citrus,
  salad: Salad,
  "leafy-green": LeafyGreen,
  sprout: Sprout,
  bean: Bean,
  nut: Nut,
  egg: Egg,
  milk: Milk,
  beef: Beef,
  fish: Fish,
  ham: Ham,
  croissant: Croissant,
  sandwich: Sandwich,
  pizza: Pizza,
  soup: Soup,
  cookie: Cookie,
  "cake-slice": CakeSlice,
  candy: Candy,
  "ice-cream-cone": IceCreamCone,
  donut: Donut,
  popcorn: Popcorn,
  coffee: Coffee,
  beer: Beer,
  wine: Wine,
  "glass-water": GlassWater,
  "cooking-pot": CookingPot,
  "chef-hat": ChefHat,
  "spray-can": SprayCan,
  droplets: Droplets,
  "brush-cleaning": BrushCleaning,
  "flask-conical": FlaskConical,
  "heart-pulse": HeartPulse,
  box: Box,
  boxes: Boxes,
  "shopping-basket": ShoppingBasket,
  tag: Tag,
  snowflake: Snowflake,
  flame: Flame,
  "grid-3x3": Grid3x3,
  "circle-plus": CirclePlus,
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

/** Same builder for the store's Cardápio categories (Configurações → Cardápio). */
export const buildProductCategoryMeta = buildStockCategoryMeta;

export const PRODUCT_TYPE_TAG_ICONS: Record<string, LucideIcon> = {
  vegano: Vegan,
  vegetariano: Salad,
  "sem-lactose": MilkOff,
  "sem-gluten": WheatOff,
  proteico: Dumbbell,
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
