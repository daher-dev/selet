"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Filter, List, Package } from "lucide-react";
import type { Product, StockItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemIcon,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  usePageAction,
  useShellSearch,
} from "@/components/shell/app-shell-context";
import { CategoryTile, STOCK_CATEGORY_META } from "@/components/category-meta";
import { STOCK_CATEGORIES } from "@/lib/types";
import { StockItemFormSheet } from "./stock-item-form-sheet";
import { StockDetailSheet, type OrderRef } from "./estoque-detail-sheet";
import { buildStockCard, STATUS_META, stockStatus, type StockStatus } from "./stock-view";

type StatusFilter = "todas" | StockStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "ok", label: "OK" },
  { value: "repor", label: "Repor" },
  { value: "esgotado", label: "Esgotado" },
  { value: "arquivado", label: "Arquivado" },
];

export function EstoqueClient({
  storeId,
  items,
  orders,
  menuProducts,
}: {
  storeId: string;
  items: StockItem[];
  orders: OrderRef[];
  menuProducts: Product[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("todas");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const shellSearch = useShellSearch();

  usePageAction({
    label: "Novo item",
    onClick: () => setFormOpen(true),
  });

  const selected = items.find((i) => i.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const terms = [query, shellSearch]
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    return items
      .filter((item) => {
        if (category && item.category !== category) return false;
        if (status !== "todas" && stockStatus(item) !== status) return false;
        const cat = STOCK_CATEGORY_META[item.category]?.label ?? item.category;
        return terms.every((term) =>
          `${item.name} ${cat}`.toLowerCase().includes(term),
        );
      })
      // Archived items always sink to the bottom of the list.
      .sort(
        (a, b) => Number(a.archived) - Number(b.archived),
      );
  }, [items, query, shellSearch, category, status]);

  const categoryLabel =
    category === null ? "Categoria" : STOCK_CATEGORY_META[category]?.label ?? "Categoria";
  const statusLabel =
    STATUS_FILTERS.find((s) => s.value === status)?.label ?? "Situação";

  return (
    <>
      <div className="mb-4 flex flex-col gap-2.5 md:flex-row md:items-center">
        <div className="relative md:flex-1">
          <Search />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar item do estoque…"
            className="rounded-xl bg-card pl-9"
          />
        </div>

        <FilterDropdown
          label={categoryLabel}
          active={category !== null}
        >
          <DropdownMenuItem active={category === null} onSelect={() => setCategory(null)}>
            <DropdownMenuItemIcon>
              <List />
            </DropdownMenuItemIcon>
            Todas
          </DropdownMenuItem>
          {STOCK_CATEGORIES.map((key) => {
            const meta = STOCK_CATEGORY_META[key];
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

        <FilterDropdown label={statusLabel} active={status !== "todas"}>
          {STATUS_FILTERS.map((opt) => {
            const meta = opt.value === "todas" ? null : STATUS_META[opt.value];
            const Icon = meta?.icon ?? List;
            return (
              <DropdownMenuItem
                key={opt.value}
                active={status === opt.value}
                onSelect={() => setStatus(opt.value)}
              >
                <DropdownMenuItemIcon className={cn(meta?.bg, meta?.fg)}>
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
          icon={Package}
          title={items.length === 0 ? "Nenhum item ainda" : "Nada encontrado"}
          description={
            items.length === 0
              ? "Cadastre insumos para controlar entradas, saídas e alertas de reposição."
              : "Tente outra busca ou filtro."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {filtered.map((item) => (
            <StockCard key={item.id} item={item} onOpen={() => setSelectedId(item.id)} />
          ))}
        </div>
      )}

      <StockDetailSheet
        storeId={storeId}
        item={selected}
        orders={orders}
        menuProducts={menuProducts}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />

      <StockItemFormSheet storeId={storeId} open={formOpen} onOpenChange={setFormOpen} />
    </>
  );
}

function Search() {
  return (
    <svg
      className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
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
          "flex h-10 items-center justify-between gap-2 rounded-xl border bg-card px-3.5 text-[13px] font-semibold transition-colors outline-none md:justify-start",
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

function StockCard({ item, onOpen }: { item: StockItem; onOpen: () => void }) {
  const meta = STOCK_CATEGORY_META[item.category];
  const view = buildStockCard(item);
  const statusMeta = STATUS_META[view.status];
  const StatusIcon = statusMeta.icon;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block overflow-hidden rounded-2xl border border-border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_10px_24px_-14px_rgba(24,107,65,.28)]"
    >
      <div className="flex items-center gap-3 px-4 py-3.5">
        {meta && <CategoryTile meta={meta} className="size-[38px]" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-ink">
            {item.name}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-ink-faint">
            {meta?.label ?? item.category}
          </span>
        </span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-bold",
            statusMeta.bg,
            statusMeta.fg,
          )}
        >
          <StatusIcon className="size-3.5" strokeWidth={2.4} />
          {statusMeta.label}
        </span>
      </div>

      <div
        className={cn(
          "grid border-t border-border/70",
          view.hasOpen ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        <div className="bg-paper px-4 py-3">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
            <SealedIcon />
            {view.leftLabel}
          </span>
          <div
            className={cn(
              "tabular mt-1.5 whitespace-nowrap text-[17px] font-extrabold leading-none",
              view.leftColor,
            )}
          >
            {view.leftMain}
          </div>
          {view.leftSub && (
            <div className="mt-1 whitespace-nowrap text-[12px] text-ink-faint">
              {view.leftSub}
            </div>
          )}
        </div>

        {view.hasOpen && (
          <div className="border-l border-border/70 bg-violet-wash px-4 py-3">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-violet">
              <FracIcon />
              Fracionado
            </span>
            <div className="tabular mt-1.5 whitespace-nowrap text-[17px] font-extrabold leading-none text-violet">
              {view.openMain}
            </div>
            {view.pips && (
              <div className="mt-2 flex gap-[3px]">
                {Array.from({ length: view.pips.total }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 flex-1 rounded-full",
                      i < view.pips!.filled ? "bg-violet" : "bg-violet-track",
                    )}
                  />
                ))}
              </div>
            )}
            {view.barPct !== null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-violet-track">
                <span
                  className="block h-full rounded-full bg-violet"
                  style={{ width: `${view.barPct}%` }}
                />
              </div>
            )}
            {view.openSub && (
              <div className="mt-1.5 whitespace-nowrap text-[12px] text-ink-faint">
                {view.openSub}
              </div>
            )}
          </div>
        )}
      </div>

      {item.resellable && (
        <div className="flex items-center border-t border-border/60 px-4 py-2.5">
          <span className="rounded-full bg-info-wash px-2.5 py-0.5 text-[10.5px] font-bold text-info">
            Revendável
          </span>
        </div>
      )}
    </button>
  );
}

function SealedIcon() {
  return (
    <svg className="size-3 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9h16" />
    </svg>
  );
}

function FracIcon() {
  return (
    <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 8V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" />
      <path d="M3 8h18v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8Z" />
    </svg>
  );
}
