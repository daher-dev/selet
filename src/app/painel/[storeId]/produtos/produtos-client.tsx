"use client";

import { useProductCategories, useProductCategoryMeta } from "@/components/product-settings-context";
import { productKind } from "@/lib/product-offers";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  Box,
  ChefHat,
  Package,
  ChevronDown,
  Filter,
  List,
  Plus,
  Search,
  Tag,
  UtensilsCrossed,
} from "lucide-react";
import type { Product, StockItem } from "@/lib/types";
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
} from "@/components/category-meta";
import { ProductFormSheet } from "./product-form-sheet";
import { useStockCategoryMeta, useUnits } from "@/components/stock-settings-context";

interface ProdutosClientProps {
  storeId: string;
  products: Product[];
  stockItems: StockItem[];
}

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "estoque", label: "Revenda" },
  { value: "receita", label: "Receita" },
  { value: "arquivados", label: "Arquivados" },
];

export function ProdutosClient({
  storeId,
  products,
  stockItems,
}: ProdutosClientProps) {
  const PRODUCT_CATEGORY_META = useProductCategoryMeta();
  const productCategories = useProductCategories();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [saleType, setSaleType] = useState<string>("all");
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const shellSearch = useShellSearch();

  /** Resolve a recipe/insumo reference to its full stock item (name, category, qty…). */
  const stockItemFor = useMemo(() => {
    const byId = new Map<string, StockItem>();
    const byName = new Map<string, StockItem>();
    for (const s of stockItems) {
      byId.set(s.id, s);
      byName.set(s.name.toLowerCase(), s);
    }
    return (ref: { stockItemId?: string; name: string }): StockItem | undefined =>
      (ref.stockItemId ? byId.get(ref.stockItemId) : undefined) ??
      byName.get(ref.name.toLowerCase());
  }, [stockItems]);
  const categoryFor = (ref: { stockItemId?: string; name: string }): string | null =>
    stockItemFor(ref)?.category ?? null;

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
      if (saleType !== "all" && saleType !== "arquivados" && productKind(p) !== saleType)
        return false;
      const catLabel = PRODUCT_CATEGORY_META[p.category]?.label ?? p.category;
      const haystack = `${p.name} ${catLabel}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [products, query, shellSearch, category, saleType, PRODUCT_CATEGORY_META]);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  const router = useRouter();
  usePageAction({
    label: "Novo item",
    onClick: openNew,
    secondary: { label: "Cardápio público", onClick: () => router.push(`/painel/${storeId}/produtos/cardapio-publico`) },
  });

  const categoryLabel =
    category === "all"
      ? "Todas as categorias"
      : (PRODUCT_CATEGORY_META[category]?.label ?? "Todas as categorias");
  const typeLabel =
    saleType === "all"
      ? "Todos os itens"
      : (TYPE_FILTERS.find((t) => t.value === saleType)?.label ?? "Todos os itens");

  return (
    <>
      <div className="mb-4 flex flex-col gap-2.5 md:flex-row md:items-center">
        <div className="relative md:flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar item do cardápio…"
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
          {productCategories.map(({ id: key }) => {
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
              opt.value === "receita"
                ? ChefHat
                : opt.value === "estoque"
                  ? Package
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
                    opt.value === "receita"
                      ? "bg-mist text-primary"
                      : opt.value === "estoque"
                        ? "bg-amber-wash text-amber"
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
              stockItemFor={stockItemFor}
              onClick={() => {
                setEditing(product);
                setFormOpen(true);
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
  stockItemFor,
  onClick,
}: {
  product: Product;
  categoryFor: (ref: { stockItemId?: string; name: string }) => string | null;
  stockItemFor: (ref: { stockItemId?: string; name: string }) => StockItem | undefined;
  onClick: () => void;
}) {
  const PRODUCT_CATEGORY_META = useProductCategoryMeta();
  const STOCK_CATEGORY_META = useStockCategoryMeta();
  const { unitLabel } = useUnits();
  const meta = PRODUCT_CATEGORY_META[product.category];
  const kind = productKind(product);
  // Stock link shown once: the resale item, or the single ingredient of a dose.
  const stockRefId =
    product.resale?.insumoId || (kind === "estoque" ? product.sale?.recipe[0]?.stockItemId : undefined);
  const linkedInsumo = stockRefId ? stockItemFor({ stockItemId: stockRefId, name: "" }) : undefined;
  const dose = kind === "estoque" ? product.sale?.recipe[0] : undefined;
  const doseDetail = dose ? (dose.qty == null ? "sem medição" : `${formatQty(dose.qty, dose.unit)} por dose`) : undefined;

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
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {kind === "receita" ? (
          <WayBadge tone="menu" icon={ChefHat} label="Receita" />
        ) : (
          <>
            {product.resale && <WayBadge tone="stock" icon={Box} label="Embalagem" />}
            {product.sale && <WayBadge tone="menu" icon={Tag} label="Dose" />}
          </>
        )}
      </div>

      {kind === "receita" && product.recipe.length > 0 && (
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

      {product.adicionais.length > 0 && (
        <div className="mt-3">
          <SectionLabel>Opcionais</SectionLabel>
          <div className="mt-2 flex flex-col gap-1.5">
            {product.adicionais.map((add, i) => {
              const addonTiers = [...(add.tiers ?? [])].sort((a, b) => a.qty - b.qty);
              const addonBatches = addonTiers.filter((t) => t.qty !== 1);
              return (
                <div key={i} className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-paper px-2.5 py-1 text-[11.5px] text-ink-soft">
                    {add.name}
                    <span className="font-bold text-primary">
                      + {formatBRL(add.price)}
                    </span>
                  </span>
                  {addonBatches.map((b, bi) => (
                    <span
                      key={bi}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-paper px-2 py-0.5 text-[10.5px] text-ink-faint"
                    >
                      <span className="font-semibold text-ink">
                        {formatQty(b.qty, "un")}
                      </span>
                      <span className="font-bold text-primary">
                        {formatBRL(b.price)}
                      </span>
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {linkedInsumo && (
        <div className="mt-3.5">
          {linkedInsumo.lowStock ? (
            <div className="flex items-center gap-2.5 rounded-[11px] border border-[#f0e4c8] bg-amber-wash px-3 py-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-wash text-amber">
                <AlertTriangle className="size-3.5" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-bold text-amber">
                  Estoque baixo
                </span>
                <span className="block truncate text-[11.5px] text-amber/70">
                  {linkedInsumo.name} ·{" "}
                  {formatQty(linkedInsumo.qty, unitLabel(linkedInsumo.unit, linkedInsumo.qty !== 1))}{" "}
                  restantes
                </span>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-[11px] border border-wash bg-paper px-3 py-2.5">
              {STOCK_CATEGORY_META[linkedInsumo.category] && (
                <CategoryTile
                  meta={STOCK_CATEGORY_META[linkedInsumo.category]}
                  className="size-7"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-ink">
                  Vinculado ao estoque
                </span>
                <span className="block truncate text-[11.5px] text-ink-faint">
                  {linkedInsumo.name} ·{" "}
                  {formatQty(linkedInsumo.qty, unitLabel(linkedInsumo.unit, linkedInsumo.qty !== 1))}{" "}
                  disponíveis
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mt-3.5 space-y-3 border-t border-border pt-3">
        {kind === "receita" ? (
          <WayPrice tiers={product.sale?.tiers ?? product.tiers} unit="unidade" commission={product.sale?.commissionPercent} />
        ) : (
          <>
            {product.resale && (
              <WayPrice
                label="Embalagem"
                tone="stock"
                tiers={product.resale.tiers}
                unit="embalagem"
                commission={product.resale.commissionPercent}
              />
            )}
            {product.sale && (
              <WayPrice
                label="Dose"
                tone="menu"
                tiers={product.sale.tiers}
                unit="dose"
                detail={doseDetail}
                commission={product.sale.commissionPercent}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** "embalagem" → "embalagens", "dose" → "doses". */
const pluralOf = (unit: string) => (unit.endsWith("m") ? `${unit.slice(0, -1)}ns` : `${unit}s`);

/** One way of selling: its price, tiers and (if any) its own commission. */
function WayPrice({
  label,
  tone,
  tiers,
  unit,
  detail,
  commission,
}: {
  label?: string;
  tone?: "menu" | "stock";
  tiers: Product["tiers"];
  unit: string;
  detail?: string;
  commission?: number;
}) {
  const sorted = [...tiers].sort((a, b) => a.qty - b.qty);
  const first = sorted.find((t) => t.qty === 1) ?? sorted[0];
  const batches = sorted.filter((t) => t !== first);
  return (
    <div className="space-y-1.5">
      {(label || commission) && (
        <div className="flex items-center gap-2">
          {label && (
            <span
              className={cn(
                "text-[11px] font-bold uppercase tracking-wide",
                tone === "stock" ? "text-amber" : "text-primary",
              )}
            >
              {label}
            </span>
          )}
          <span className="flex-1" />
          {commission ? (
            <span
              title="Comissão para quem vendeu"
              className="inline-flex items-center rounded-full bg-commission-wash px-2 py-0.5 text-[10.5px] font-bold text-commission"
            >
              {String(commission).replace(".", ",")}% comissão
            </span>
          ) : null}
        </div>
      )}
      {first && (
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="tabular text-[20px] font-bold leading-none text-primary">{formatBRL(first.price)}</span>
          <span className="text-[11.5px] text-ink-faint">
            {first.qty === 1 ? `/ ${unit}` : `/ ${first.qty} ${pluralOf(unit)}`}
            {detail ? ` · ${detail}` : ""}
          </span>
        </div>
      )}
      {batches.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {batches.map((b) => (
            <span
              key={b.qty}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-paper px-2.5 py-1 text-[11.5px] text-ink-soft"
            >
              <span className="font-semibold text-ink">{b.qty} {pluralOf(unit)}</span>
              <span className="font-bold text-primary">{formatBRL(b.price)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function WayBadge({
  tone,
  icon: Icon,
  label,
}: {
  tone: "menu" | "stock";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
        tone === "menu" ? "bg-mist text-primary" : "bg-amber-wash text-amber",
      )}
    >
      <Icon className="size-3" />
      {label}
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
