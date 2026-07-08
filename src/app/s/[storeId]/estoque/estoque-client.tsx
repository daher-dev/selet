"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Boxes, Package, PackageOpen, Search } from "lucide-react";
import type { StockItem } from "@/lib/types";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  usePageAction,
  useShellSearch,
} from "@/components/shell/app-shell-context";
import { CategoryTile, STOCK_CATEGORY_META } from "@/components/category-meta";
import { StockItemFormSheet } from "./stock-item-form-sheet";
import { MovementSheet } from "./movement-sheet";

type StockStatus = "esgotado" | "baixo" | "normal";
type StatusFilter = "todos" | StockStatus;

/**
 * Stock level status from the qty ledger: zero on hand → esgotado, at/below the
 * reorder point → baixo (repor), otherwise normal. (Archived items get their own
 * muted pill — see statusPill.)
 */
export function stockStatus(item: StockItem): StockStatus {
  if (item.qty <= 0) return "esgotado";
  if (item.reorderAt > 0 && item.qty <= item.reorderAt) return "baixo";
  return "normal";
}

const STATUS_META: Record<StockStatus, { label: string; fg: string; bg: string }> = {
  esgotado: { label: "Esgotado", fg: "text-destructive", bg: "bg-danger-wash" },
  baixo: { label: "Repor", fg: "text-amber", bg: "bg-amber-wash" },
  normal: { label: "Normal", fg: "text-success", bg: "bg-mint-wash" },
};

/** Pill shown on a card — archived items override the level status with a muted badge. */
function statusPill(item: StockItem): { label: string; fg: string; bg: string } {
  if (item.archived) return { label: "Arquivado", fg: "text-ink-faint", bg: "bg-wash" };
  return STATUS_META[stockStatus(item)];
}

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
  const shellSearch = useShellSearch();

  usePageAction({
    label: "Novo item",
    onClick: () => {
      setEditing(null);
      setFormOpen(true);
    },
  });

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const activeItems = items.filter((i) => !i.archived);
  const archivedCount = items.length - activeItems.length;
  const lowCount = activeItems.filter((i) => i.lowStock).length;

  const filtered = useMemo(() => {
    const terms = [query, shellSearch]
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    return items.filter((item) => {
      if (showArchived ? !item.archived : item.archived) return false;
      if (category && item.category !== category) return false;
      if (status !== "todos" && stockStatus(item) !== status) return false;
      return terms.every((term) => item.name.toLowerCase().includes(term));
    });
  }, [items, query, shellSearch, category, status, showArchived]);

  return (
    <>
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
          {(["todos", "esgotado", "baixo", "normal"] as const).map((s) => (
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
            const pill = statusPill(item);
            // Fill of the currently-open package (loose amount ÷ one package).
            const openPct =
              item.pkgSize && item.pkgSize > 0
                ? Math.min(100, Math.max(0, (item.open / item.pkgSize) * 100))
                : 0;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className="block w-full rounded-2xl border border-border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(24,107,65,.28)]"
                >
                  <span className="flex items-center gap-3">
                    {meta && <CategoryTile meta={meta} />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-ink">
                        {item.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-ink-faint">
                        {meta?.label ?? item.category}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold",
                        pill.bg,
                        pill.fg,
                      )}
                    >
                      <span className="size-1.5 rounded-full bg-current" />
                      {pill.label}
                    </span>
                  </span>

                  {/* Ledger: tracked items split sealed vs. fractioned (open) stock. */}
                  {item.tracked ? (
                    <span className="mt-3 flex items-stretch overflow-hidden rounded-xl border border-border bg-paper">
                      <span className="flex-1 p-2.5">
                        <span className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wide text-ink-faint">
                          <Boxes className="size-3" />
                          Lacradas
                        </span>
                        <span className="tabular mt-1 block text-[15px] font-extrabold leading-none text-ink">
                          {item.sealed}
                          <span className="ml-1 text-[11px] font-semibold text-ink-faint">
                            {item.pkgLabel ?? "emb."}
                          </span>
                        </span>
                        <span className="tabular mt-1 block text-[11px] text-ink-faint">
                          total {formatQty(item.qty, item.unit)}
                        </span>
                      </span>
                      {item.open > 0 && (
                        <span className="flex-1 border-l border-border p-2.5">
                          <span className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wide text-ink-faint">
                            <PackageOpen className="size-3" />
                            Fracionado
                          </span>
                          <span className="tabular mt-1 block text-[15px] font-extrabold leading-none text-ink">
                            {formatQty(item.open, item.unit)}
                          </span>
                          {item.pkgSize ? (
                            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-mist">
                              <span
                                className="block h-full rounded-full bg-primary"
                                style={{ width: `${openPct}%` }}
                              />
                            </span>
                          ) : (
                            <span className="mt-1 block text-[11px] text-ink-faint">
                              embalagem aberta
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="mt-3 flex items-center justify-between rounded-xl border border-border bg-paper px-3 py-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                        Em estoque
                      </span>
                      <span className="tabular text-[15px] font-extrabold text-ink">
                        {formatQty(item.qty, item.unit)}
                      </span>
                    </span>
                  )}
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
