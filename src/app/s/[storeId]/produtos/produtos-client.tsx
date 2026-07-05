"use client";

import { useMemo, useState } from "react";
import { Plus, Search, UtensilsCrossed } from "lucide-react";
import type { Product } from "@/lib/types";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import {
  CategoryTile,
  PRODUCT_CATEGORY_META,
  PRODUCT_TYPE_TAG_LABELS,
} from "@/components/category-meta";
import { ProductFormSheet } from "./product-form-sheet";

interface ProdutosClientProps {
  storeId: string;
  products: Product[];
}

export function ProdutosClient({ storeId, products }: ProdutosClientProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!category || p.category === category) &&
        (!q || p.name.toLowerCase().includes(q)),
    );
  }, [products, query, category]);

  return (
    <>
      <PageHeader
        title="Catálogo"
        subtitle={`${products.length} ${products.length === 1 ? "produto" : "produtos"} no cardápio`}
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="gap-1.5 rounded-xl font-semibold"
          >
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
            placeholder="Buscar produto…"
            className="rounded-xl bg-card pl-9"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <FilterChip
            label="Todos"
            active={category === null}
            onClick={() => setCategory(null)}
          />
          {Object.entries(PRODUCT_CATEGORY_META).map(([key, meta]) => (
            <FilterChip
              key={key}
              label={meta.label}
              active={category === key}
              onClick={() => setCategory(category === key ? null : key)}
            />
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title={products.length === 0 ? "Nenhum produto ainda" : "Nada encontrado"}
          description={
            products.length === 0
              ? "Adicione produtos ao cardápio para começar a vender."
              : "Tente outra busca ou categoria."
          }
          action={
            products.length === 0 ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                className="gap-1.5 rounded-xl font-semibold"
              >
                <Plus className="size-4" />
                Novo produto
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((product) => {
            const meta = PRODUCT_CATEGORY_META[product.category];
            return (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(product);
                    setFormOpen(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(24,107,65,.28)]"
                >
                  {meta && <CategoryTile meta={meta} />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-ink">
                        {product.name}
                      </span>
                      {!product.active && (
                        <Badge
                          variant="outline"
                          className="rounded-full text-[10px] text-ink-faint"
                        >
                          Inativo
                        </Badge>
                      )}
                    </span>
                    {product.typeTags.length > 0 && (
                      <span className="mt-0.5 block truncate text-[11.5px] text-ink-faint">
                        {product.typeTags
                          .map((t) => PRODUCT_TYPE_TAG_LABELS[t] ?? t)
                          .join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="tabular shrink-0 text-[14px] font-bold text-ink">
                    {formatBRL(product.price)}
                  </span>
                </button>
              </li>
            );
          })}
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

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-white"
          : "border-border bg-card text-ink-soft hover:border-primary/40",
      )}
    >
      {label}
    </button>
  );
}
