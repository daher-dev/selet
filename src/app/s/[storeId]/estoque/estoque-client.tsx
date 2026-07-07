"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Package, Plus, Search } from "lucide-react";
import type { StockItem } from "@/lib/types";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { CategoryTile, STOCK_CATEGORY_META } from "@/components/category-meta";
import { StockItemFormSheet } from "./stock-item-form-sheet";
import { MovementSheet } from "./movement-sheet";

type StatusFilter = "todos" | "critico" | "baixo" | "normal";

export function stockStatus(item: StockItem): "critico" | "baixo" | "normal" {
  if (item.reorderAt <= 0) return "normal";
  if (item.qty <= item.reorderAt / 2) return "critico";
  if (item.qty <= item.reorderAt) return "baixo";
  return "normal";
}

const STATUS_META: Record<
  "critico" | "baixo" | "normal",
  { label: string; fg: string; bg: string }
> = {
  critico: { label: "Crítico", fg: "text-destructive", bg: "bg-danger-wash" },
  baixo: { label: "Baixo", fg: "text-amber", bg: "bg-amber-wash" },
  normal: { label: "Normal", fg: "text-primary", bg: "bg-mint-wash" },
};

export function EstoqueClient({
  storeId,
  items,
}: {
  storeId: string;
  items: StockItem[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const activeItems = items.filter((i) => !i.archived);
  const archivedCount = items.length - activeItems.length;
  const lowCount = activeItems.filter((i) => i.lowStock).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (showArchived ? !item.archived : item.archived) return false;
      if (category && item.category !== category) return false;
      if (status !== "todos" && stockStatus(item) !== status) return false;
      return !q || item.name.toLowerCase().includes(q);
    });
  }, [items, query, category, status, showArchived]);

  return (
    <>
      <PageHeader
        title="Estoque"
        subtitle={`${activeItems.length} ${activeItems.length === 1 ? "insumo" : "insumos"} cadastrados`}
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="gap-1.5 rounded-xl font-semibold"
          >
            <Plus className="size-4" />
            Novo item
          </Button>
        }
      />

      {lowCount > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber/40 bg-amber-wash px-4 py-3">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-amber" />
          </span>
          <p className="text-[13px] text-ink-soft">
            <strong className="font-bold text-ink">{lowCount}</strong>{" "}
            {lowCount === 1 ? "item precisa" : "itens precisam"} de reposição
          </p>
          <AlertTriangle className="ml-auto size-4 text-amber" />
        </div>
      )}

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar insumo…"
            className="rounded-xl bg-card pl-9"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <FilterRowLabel>Categoria</FilterRowLabel>
          <FilterChip label="Todas" active={category === null} onClick={() => setCategory(null)} />
          {Object.entries(STOCK_CATEGORY_META).map(([key, meta]) => (
            <FilterChip
              key={key}
              label={meta.label}
              active={category === key}
              onClick={() => setCategory(category === key ? null : key)}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <FilterRowLabel>Situação</FilterRowLabel>
          {(["todos", "critico", "baixo", "normal"] as const).map((s) => (
            <FilterChip
              key={s}
              label={s === "todos" ? "Todos" : STATUS_META[s].label}
              active={status === s}
              onClick={() => setStatus(s)}
            />
          ))}
          {archivedCount > 0 && (
            <FilterChip
              label={`Arquivados (${archivedCount})`}
              active={showArchived}
              onClick={() => setShowArchived((v) => !v)}
            />
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title={items.length === 0 ? "Nenhum insumo ainda" : "Nada encontrado"}
          description={
            items.length === 0
              ? "Cadastre insumos para controlar entradas, saídas e alertas de reposição."
              : "Tente outra busca ou filtro."
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((item) => {
            const meta = STOCK_CATEGORY_META[item.category];
            const s = stockStatus(item);
            const sMeta = STATUS_META[s];
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(24,107,65,.28)]"
                >
                  {meta && <CategoryTile meta={meta} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink">
                      {item.name}
                    </span>
                    <span className="tabular mt-0.5 block text-[11.5px] text-ink-faint">
                      {item.tracked
                        ? `${item.sealed} ${item.pkgLabel ?? "emb."} lacradas · ${formatQty(item.open, item.unit)} abertos`
                        : formatQty(item.qty, item.unit)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="tabular text-[13.5px] font-bold text-ink">
                      {formatQty(item.qty, item.unit)}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        sMeta.bg,
                        sMeta.fg,
                      )}
                    >
                      {sMeta.label}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <MovementSheet
        storeId={storeId}
        item={selected}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onEdit={(item) => {
          setEditing(item);
          setSelectedId(null);
          setFormOpen(true);
        }}
      />

      <StockItemFormSheet
        storeId={storeId}
        item={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </>
  );
}

/** Row label for the filter chip rows — desktop only, mobile keeps chips compact. */
function FilterRowLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="hidden w-20 shrink-0 text-[11px] font-bold uppercase tracking-wide text-ink-faint lg:inline-block">
      {children}
    </span>
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
