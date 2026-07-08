"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  ChefHat,
  ChevronDown,
  Filter,
  Hammer,
  List,
  Package,
  Plus,
  Search,
  Tag,
  UtensilsCrossed,
} from "lucide-react";
import type { Product, StockItem } from "@/lib/types";
import { PRODUCT_CATEGORIES } from "@/lib/types";
import { formatBRL, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  usePageAction,
  useShellSearch,
} from "@/components/shell/app-shell-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemIcon,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CategoryTile,
  PRODUCT_CATEGORY_META,
  STOCK_CATEGORY_META,
} from "@/components/category-meta";
import { ProductFormSheet } from "./product-form-sheet";
import { ProduzirSheet } from "./produzir-sheet";

interface ProdutosClientProps {
  storeId: string;
  products: Product[];
  stockItems: StockItem[];
}

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "menu", label: "Menu" },
  { value: "revenda", label: "Revenda" },
  { value: "arquivados", label: "Arquivados" },
];

export function ProdutosClient({
  storeId,
  products,
  stockItems,
}: ProdutosClientProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [saleType, setSaleType] = useState<string>("all");
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [producing, setProducing] = useState<Product | null>(null);
  const [produceOpen, setProduceOpen] = useState(false);
  const shellSearch = useShellSearch();

  /** Resolve a recipe/insumo reference to its stock category (for colored tiles). */
  const categoryFor = useMemo(() => {
    const byId = new Map<string, StockItem>();
    const byName = new Map<string, StockItem>();
    for (const s of stockItems) {
      byId.set(s.id, s);
      byName.set(s.name.toLowerCase(), s);
    }
    return (ref: { stockItemId?: string; name: string }): string | null => {
      const item =
        (ref.stockItemId ? byId.get(ref.stockItemId) : undefined) ??
        byName.get(ref.name.toLowerCase());
      return item?.category ?? null;
    };
  }, [stockItems]);

  const filtered = useMemo(() => {
    const terms = [query, shellSearch]
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    return products.filter((p) => {
      // Archived products are hidden by default; only the "Arquivados" tipo
      // surfaces them (and then shows them exclusively).
      if (saleType === "arquivados") {
        if (!p.archived) return false;
      } else if (p.archived) {
        return false;
      }
      if (category !== "all" && p.category !== category) return false;
      if (saleType !== "all" && saleType !== "arquivados" && p.saleType !== saleType)
        return false;
      const catLabel = PRODUCT_CATEGORY_META[p.category]?.label ?? p.category;
      const haystack = `${p.name} ${catLabel}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [products, query, shellSearch, category, saleType]);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  usePageAction({ label: "Novo item", onClick: openNew });

  const categoryLabel =
    category === "all"
      ? "Categoria"
      : (PRODUCT_CATEGORY_META[category]?.label ?? "Categoria");
  const typeLabel =
    saleType === "all"
      ? "Tipo"
      : (TYPE_FILTERS.find((t) => t.value === saleType)?.label ?? "Tipo");

  return (
    <>
      <div className="mb-4 flex flex-col gap-2.5 md:flex-row md:items-center">
        <div className="relative md:flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar item do catálogo…"
            className="rounded-xl bg-card pl-9"
          />
        </div>

        <FilterDropdown label={categoryLabel} active={category !== "all"}>
          <DropdownMenuItem
            active={category === "all"}
            onSelect={() => setCategory("all")}
          >
            <DropdownMenuItemIcon>
              <List />
            </DropdownMenuItemIcon>
            Todas
          </DropdownMenuItem>
          {PRODUCT_CATEGORIES.map((key) => {
            const meta = PRODUCT_CATEGORY_META[key];
            const Icon = meta.icon;
            return (
              <DropdownMenuItem
                key={key}
                active={category === key}
                onSelect={() => setCategory(key)}
              >
                <DropdownMenuItemIcon className={cn(meta.bg, meta.fg)}>
                  <Icon />
                </DropdownMenuItemIcon>
                {meta.label}
              </DropdownMenuItem>
            );
          })}
        </FilterDropdown>

        <FilterDropdown label={typeLabel} active={saleType !== "all"}>
          {TYPE_FILTERS.map((opt) => {
            const Icon =
              opt.value === "menu"
                ? ChefHat
                : opt.value === "revenda"
                  ? Tag
                  : opt.value === "arquivados"
                    ? Archive
                    : List;
            return (
              <DropdownMenuItem
                key={opt.value}
                active={saleType === opt.value}
                onSelect={() => setSaleType(opt.value)}
              >
                <DropdownMenuItemIcon
                  className={
                    opt.value === "menu"
                      ? "bg-mist text-primary"
                      : opt.value === "revenda"
                        ? "bg-cat-bebidas-wash text-cat-bebidas"
                        : opt.value === "arquivados"
                          ? "bg-wash text-ink-faint"
                          : undefined
                  }
                >
                  <Icon />
                </DropdownMenuItemIcon>
                {opt.label}
              </DropdownMenuItem>
            );
          })}
        </FilterDropdown>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title={products.length === 0 ? "Nenhum produto ainda" : "Nada encontrado"}
          description={
            products.length === 0
              ? "Adicione produtos ao cardápio para começar a vender."
              : "Tente outra busca ou filtro."
          }
          action={
            products.length === 0 ? (
              <Button onClick={openNew} className="gap-1.5 rounded-xl font-semibold">
                <Plus className="size-4" />
                Novo produto
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              categoryFor={categoryFor}
              onClick={() => {
                setEditing(product);
                setFormOpen(true);
              }}
              onProduzir={() => {
                setProducing(product);
                setProduceOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <ProductFormSheet
        storeId={storeId}
        product={editing}
        stockItems={stockItems}
        open={formOpen}
        onOpenChange={setFormOpen}
      />

      <ProduzirSheet
        storeId={storeId}
        product={producing}
        stockItems={stockItems}
        open={produceOpen}
        onOpenChange={setProduceOpen}
      />
    </>
  );
}

/** Icon + label + chevron trigger that matches the design's filter menus. */
function FilterDropdown({
  label,
  active,
  children,
}: {
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-10 items-center justify-between gap-2 rounded-xl border bg-card px-3.5 text-[13px] font-semibold outline-none transition-colors md:justify-start",
          active
            ? "border-primary/50 text-ink"
            : "border-border text-ink-soft hover:border-primary/40",
        )}
      >
        <Filter className="size-3.5 text-leaf" />
        <span>{label}</span>
        <ChevronDown className="size-3.5 text-ink-faint md:ml-1" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProductCard({
  product,
  categoryFor,
  onClick,
  onProduzir,
}: {
  product: Product;
  categoryFor: (ref: { stockItemId?: string; name: string }) => string | null;
  onClick: () => void;
  onProduzir: () => void;
}) {
  const meta = PRODUCT_CATEGORY_META[product.category];
  const isMenu = product.saleType === "menu";
  const tiers = [...product.tiers].sort((a, b) => a.qty - b.qty);
  const unitTier =
    tiers.find((t) => t.qty === 1) ?? tiers[0] ?? { qty: 1, price: product.price };
  const batches = tiers.filter((t) => t !== unitTier);
  const canProduce = isMenu && product.stockManaged && product.active;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="flex cursor-pointer flex-col rounded-2xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_14px_30px_-16px_rgba(24,107,65,.28)]"
    >
      <div className="flex items-start gap-3">
        {meta && <CategoryTile meta={meta} />}
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[10.5px] font-semibold uppercase tracking-[0.4px] text-ink-faint">
            {meta?.label ?? product.category}
          </span>
          <h3 className="mt-0.5 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <span className="truncate">{product.name}</span>
            {!product.active && (
              <Badge variant="outline" className="rounded-full text-[10px] text-ink-faint">
                Inativo
              </Badge>
            )}
          </h3>
        </div>
        <TypeBadge isMenu={isMenu} />
      </div>

      {isMenu && product.recipe.length > 0 && (
        <div className="mt-3.5">
          <SectionLabel>Base</SectionLabel>
          <div className="mt-2 flex flex-col gap-1.5">
            {product.recipe.map((item, i) => {
              const cat = categoryFor(item);
              const catMeta = cat ? STOCK_CATEGORY_META[cat] : null;
              return (
                <div key={i} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md",
                      catMeta ? `${catMeta.bg} ${catMeta.fg}` : "bg-mist text-primary",
                    )}
                  >
                    {catMeta ? (
                      <catMeta.icon className="size-3.5" strokeWidth={1.8} />
                    ) : (
                      <Leaf12 />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
                    {item.name}
                  </span>
                  <span className="tabular shrink-0 text-[12.5px] font-semibold text-ink-faint">
                    {item.qty == null ? "sem medição" : formatQty(item.qty, item.unit)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isMenu && product.adicionais.length > 0 && (
        <div className="mt-3">
          <SectionLabel>Adicionais</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {product.adicionais.map((add, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-paper px-2.5 py-1 text-[11.5px] text-ink-soft"
              >
                {add.name}
                <span className="font-bold text-primary">+ {formatBRL(add.price)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3.5 flex items-baseline gap-2 border-t border-border pt-3">
        <span className="tabular text-[22px] font-bold leading-none text-primary">
          {formatBRL(unitTier.price)}
        </span>
        <span className="text-[11.5px] text-ink-faint">
          {unitTier.qty === 1 ? "/ unidade" : `/ ${formatQty(unitTier.qty, "un")}`}
        </span>
        {canProduce && (
          <>
            <span
              className={cn(
                "tabular ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold",
                product.producedStock > 0
                  ? "border-[#cde7d6] bg-mint-wash text-success"
                  : "border-border bg-paper text-ink-faint",
              )}
            >
              <Package className="size-3.5" strokeWidth={1.9} />
              {product.producedStock} em estoque
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onProduzir();
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#cddcc4] bg-card px-3 text-[12.5px] font-semibold text-primary transition-colors hover:border-primary hover:bg-primary hover:text-white"
            >
              <Hammer className="size-3.5" strokeWidth={1.9} />
              Produzir
            </button>
          </>
        )}
      </div>

      {batches.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {batches.map((b, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-paper px-2.5 py-1 text-[11.5px] text-ink-soft"
            >
              <span className="font-semibold text-ink">{formatQty(b.qty, "un")}</span>
              <span className="font-bold text-primary">{formatBRL(b.price)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TypeBadge({ isMenu }: { isMenu: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
        isMenu ? "bg-mist text-primary" : "bg-cat-bebidas-wash text-cat-bebidas",
      )}
    >
      {isMenu ? <ChefHat className="size-3" /> : <Tag className="size-3" />}
      {isMenu ? "Menu" : "Revenda"}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.4px] text-ink-faint">
        {children}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Fallback leaf glyph for BASE rows with no linked stock category. */
function Leaf12() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6" />
    </svg>
  );
}
