"use client";

import { useMemo, useState } from "react";
import { ChefHat, Plus, Search, Tag, UtensilsCrossed } from "lucide-react";
import type { Product } from "@/lib/types";
import { formatBRL, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CategoryTile,
  PRODUCT_CATEGORY_META,
} from "@/components/category-meta";
import { ProductFormSheet } from "./product-form-sheet";

interface ProdutosClientProps {
  storeId: string;
  products: Product[];
}

export function ProdutosClient({ storeId, products }: ProdutosClientProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [saleType, setSaleType] = useState<string>("all");
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (category === "all" || p.category === category) &&
        (saleType === "all" || p.saleType === saleType) &&
        (!q || p.name.toLowerCase().includes(q)),
    );
  }, [products, query, category, saleType]);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Catálogo"
        subtitle={`${products.length} ${products.length === 1 ? "produto" : "produtos"} no cardápio`}
        action={
          <Button onClick={openNew} className="gap-1.5 rounded-xl font-semibold">
            <Plus className="size-4" />
            Novo produto
          </Button>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar item do catálogo…"
            className="rounded-xl bg-card pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FilterSelect
            value={category}
            onValueChange={setCategory}
            label="Categoria"
            allLabel="Todas"
            options={Object.entries(PRODUCT_CATEGORY_META).map(([key, meta]) => ({
              value: key,
              label: meta.label,
            }))}
          />
          <FilterSelect
            value={saleType}
            onValueChange={setSaleType}
            label="Tipo"
            allLabel="Todos"
            options={[
              { value: "menu", label: "Menu" },
              { value: "revenda", label: "Revenda" },
            ]}
          />
        </div>
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
        <ul className="space-y-3">
          {filtered.map((product) => (
            <li key={product.id}>
              <ProductCard
                product={product}
                onClick={() => {
                  setEditing(product);
                  setFormOpen(true);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <ProductFormSheet
        storeId={storeId}
        product={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </>
  );
}

function ProductCard({
  product,
  onClick,
}: {
  product: Product;
  onClick: () => void;
}) {
  const meta = PRODUCT_CATEGORY_META[product.category];
  const isMenu = product.saleType === "menu";
  const tiers = [...product.tiers].sort((a, b) => a.qty - b.qty);
  const unitTier = tiers.find((t) => t.qty === 1) ?? tiers[0] ?? { qty: 1, price: product.price };
  const batches = tiers.filter((t) => t !== unitTier);

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-2xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_14px_30px_-16px_rgba(24,107,65,.28)]"
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
            {product.recipe.map((item, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-mist text-primary">
                  <Leaf12 />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
                  {item.name}
                </span>
                <span className="tabular shrink-0 text-[12.5px] font-semibold text-ink-faint">
                  {item.qty == null ? "sem medição" : formatQty(item.qty, item.unit)}
                </span>
              </div>
            ))}
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
    </button>
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

/** Tiny leaf glyph for BASE ingredient tiles. */
function Leaf12() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6" />
    </svg>
  );
}

function FilterSelect({
  value,
  onValueChange,
  label,
  allLabel,
  options,
}: {
  value: string;
  onValueChange: (v: string) => void;
  label: string;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full rounded-xl bg-card">
        <span className="flex items-center gap-1.5 truncate text-[13px]">
          <span className="text-ink-faint">{label}:</span>
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
