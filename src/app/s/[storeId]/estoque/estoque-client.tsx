"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Filter, List, Package, Pencil, TriangleAlert } from "lucide-react";
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
import { CategoryTile } from "@/components/category-meta";
import { useStockCategoryMeta, useStockSettings, useUnits } from "@/components/stock-settings-context";
import { StockItemFormSheet } from "./stock-item-form-sheet";
import { StockDetailSheet, type OrderRef, type RecipeUsage } from "./estoque-detail-sheet";
import { RegistrarCompraDialog } from "./registrar-compra-dialog";
import { AjustarAbertaDialog } from "./ajustar-aberta-dialog";
import { OpenBar, OpenPips } from "./open-meter";
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
  resaleByStock,
  recipeUsage,
}: {
  storeId: string;
  items: StockItem[];
  orders: OrderRef[];
  menuProducts: Product[];
  resaleByStock: Record<string, string[]>;
  recipeUsage: Record<string, RecipeUsage[]>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("todas");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [compraOpen, setCompraOpen] = useState(false);
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const shellSearch = useShellSearch();
  const STOCK_CATEGORY_META = useStockCategoryMeta();
  const { categories: stockCategories } = useStockSettings();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Deep link from a Movimentações "Origem" chip (?item=<id>): open that
  // item's sheet straight from the initial render, same pattern as pedidos'
  // ?novo=1/?order=<id>.
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("item"));

  usePageAction({
    label: "Registrar compra",
    onClick: () => setCompraOpen(true),
  });

  // Strip the deep-link param once mounted so back/refresh doesn't reopen it.
  useEffect(() => {
    if (!searchParams.get("item")) return;
    router.replace(pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const adjusting = items.find((i) => i.id === adjustId) ?? null;

  function selectStatus(v: StatusFilter) {
    setLowStockOnly(false);
    setStatus(v);
  }

  const alert = useMemo(() => buildStockAlert(items), [items]);

  const filtered = useMemo(() => {
    const terms = [query, shellSearch]
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    return items.filter((item) => {
      // Archived items are hidden by default; only the "Arquivado" situação
      // surfaces them (and then shows them exclusively).
      if (status === "arquivado") {
        if (!item.archived) return false;
      } else if (item.archived) {
        return false;
      }
      if (category && item.category !== category) return false;
      if (lowStockOnly) {
        const st = stockStatus(item);
        if (st !== "esgotado" && st !== "repor") return false;
      } else if (status !== "todas" && stockStatus(item) !== status) return false;
      const cat = STOCK_CATEGORY_META[item.category]?.label ?? item.category;
      return terms.every((term) =>
        `${item.name} ${cat}`.toLowerCase().includes(term),
      );
    });
  }, [items, query, shellSearch, category, status, lowStockOnly, STOCK_CATEGORY_META]);

  const categoryLabel =
    category === null ? "Todas as categorias" : STOCK_CATEGORY_META[category]?.label ?? "Todas as categorias";
  const statusLabel = lowStockOnly
    ? "Para repor"
    : status === "todas"
      ? "Todos os status"
      : STATUS_FILTERS.find((s) => s.value === status)?.label ?? "Todos os status";

  return (
    <>
      {alert && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-[#f2d8cf] bg-[#fdf4f1] px-4 py-3.5">
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[#fbe0d8] text-destructive">
            <TriangleAlert className="size-[18px]" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-bold text-destructive">{alert.headline}</span>
            <span className="mt-px block truncate text-[12px] text-[#8a6a60]">{alert.detail}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setLowStockOnly(true);
              setCategory(null);
              setQuery("");
            }}
            className="shrink-0 whitespace-nowrap text-[12.5px] font-bold text-destructive hover:underline"
          >
            Gerar lista de compra →
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-2.5 md:flex-row md:items-center">
        <div className="relative md:flex-1">
          <Search />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar insumo…"
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
          {stockCategories.map(({ id: key }) => {
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

        <FilterDropdown label={statusLabel} active={status !== "todas" || lowStockOnly}>
          {STATUS_FILTERS.map((opt) => {
            const meta = opt.value === "todas" ? null : STATUS_META[opt.value];
            const Icon = meta?.icon ?? List;
            return (
              <DropdownMenuItem
                key={opt.value}
                active={!lowStockOnly && status === opt.value}
                onSelect={() => selectStatus(opt.value)}
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
            <StockCard
              key={item.id}
              item={item}
              onOpen={() => setSelectedId(item.id)}
              onAdjust={() => setAdjustId(item.id)}
            />
          ))}
        </div>
      )}

      <StockDetailSheet
        storeId={storeId}
        item={selected}
        orders={orders}
        menuProducts={menuProducts}
        resaleNames={selected ? resaleByStock[selected.id] ?? [] : []}
        usedIn={selected ? recipeUsage[selected.id] ?? [] : []}
        open={selectedId !== null && selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />

      <StockItemFormSheet storeId={storeId} open={formOpen} onOpenChange={setFormOpen} />

      <AjustarAbertaDialog
        storeId={storeId}
        item={adjusting}
        onOpenChange={(open) => {
          if (!open) setAdjustId(null);
        }}
      />

      <RegistrarCompraDialog
        storeId={storeId}
        items={items}
        open={compraOpen}
        onOpenChange={setCompraOpen}
        onCreateNew={() => setFormOpen(true)}
      />
    </>
  );
}

/** "1 insumo esgotado e 2 abaixo do mínimo" banner copy, built from live data. */
function buildStockAlert(
  items: StockItem[],
): { headline: string; detail: string } | null {
  const visible = items.filter((i) => !i.archived);
  const esgotados = visible.filter((i) => stockStatus(i) === "esgotado");
  const repor = visible.filter((i) => stockStatus(i) === "repor");
  if (esgotados.length === 0 && repor.length === 0) return null;

  const headlineParts: string[] = [];
  if (esgotados.length > 0) {
    const s = esgotados.length === 1 ? "" : "s";
    headlineParts.push(`${esgotados.length} insumo${s} esgotado${s}`);
  }
  if (repor.length > 0) {
    headlineParts.push(`${repor.length} abaixo do mínimo`);
  }

  const detailParts: string[] = [];
  if (esgotados.length > 0) {
    const verb = esgotados.length === 1 ? "zerou" : "zeraram";
    detailParts.push(`${joinNames(esgotados.map((i) => i.name))} ${verb}`);
  }
  if (repor.length > 0) {
    detailParts.push(`${joinNames(repor.map((i) => i.name))} na última embalagem`);
  }

  return { headline: headlineParts.join(" e "), detail: detailParts.join(" · ") };
}

/** "A", "A e B", or "A, B e mais N" — keeps the banner readable at any count. */
function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(" e ");
  return `${names.slice(0, 2).join(", ")} e mais ${names.length - 2}`;
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

function StockCard({
  item,
  onOpen,
  onAdjust,
}: {
  item: StockItem;
  onOpen: () => void;
  onAdjust: () => void;
}) {
  const STOCK_CATEGORY_META = useStockCategoryMeta();
  const { units } = useUnits();
  const meta = STOCK_CATEGORY_META[item.category];
  const view = buildStockCard(item, units);
  const statusMeta = STATUS_META[view.status];
  const StatusIcon = statusMeta.icon;
  // Esgotado is the one status urgent enough to override the category tile's
  // own color — everything else keeps its category identity.
  const tileMeta =
    meta && view.status === "esgotado"
      ? { ...meta, fg: "text-destructive", bg: "bg-danger-wash" }
      : meta;

  const openPanel = (
    <>
      <span
        className={cn(
          "flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[.7px]",
          view.hasOpen ? "text-[#7c55c9]" : "text-[#c3cdbf]",
        )}
      >
        {view.hasOpen && <FracIcon />}
        Aberto
      </span>
      {view.hasOpen ? (
        <>
          <div className="tabular mt-[7px] whitespace-nowrap text-[17px] font-bold leading-[normal] text-violet">
            {view.openMain}
          </div>
          {view.pips && <OpenPips total={view.pips.total} filled={view.pips.filled} className="mt-2" />}
          {view.barPct !== null && <OpenBar pct={view.barPct} className="mt-2" />}
          {view.openSub && (
            <div className="mt-1.5 whitespace-nowrap text-[12.5px] text-[#a99bc4]">{view.openSub}</div>
          )}
        </>
      ) : (
        <div className="mt-[9px] whitespace-nowrap text-[13px] text-[#a0ac9d]">{view.openMutedLabel}</div>
      )}
    </>
  );

  // The card is a div, not a button: the open panel of per-unit items is its
  // own button (Ajustar saldo), and buttons can't nest. A full-bleed button
  // underneath carries the "open details" click; content sits above it and
  // lets clicks through except for the adjust panel.
  return (
    <div className="group relative overflow-hidden rounded-[14px] border border-border bg-card text-left leading-[normal] transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_10px_24px_-14px_rgba(24,107,65,.28)]">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Abrir ${item.name}`}
        className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      />
      <div className="pointer-events-none relative">
        <div className="flex items-center gap-[13px] px-[18px] py-4">
          {tileMeta && <CategoryTile meta={tileMeta} className="size-11 [&>svg]:size-[22px]" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-semibold tracking-[-.2px] text-ink">{item.name}</span>
            <span className="mt-px block truncate text-[12.5px] text-[#a0ac9d]">
              {meta?.label ?? item.category}
              {item.resellable && " · revenda"}
              {view.perUnit && " · consumo por unidade"}
            </span>
          </span>
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full",
              statusMeta.bg,
              statusMeta.fg,
            )}
          >
            <StatusIcon className="size-[15px]" strokeWidth={2.3} />
          </span>
        </div>

        <div className="grid grid-cols-2 border-t border-[#f0f4ed]">
          <div className="px-[18px] pb-[15px] pt-[13px]">
            <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[.7px] text-[#3a8b4e]">
              <SealedIcon />
              {view.leftLabel}
            </span>
            <div
              className={cn(
                "tabular mt-[7px] whitespace-nowrap text-[17px] font-bold leading-[normal]",
                view.leftColor,
              )}
            >
              {view.leftMain}
            </div>
            {view.leftSub && (
              <div className="mt-0.5 whitespace-nowrap text-[12.5px] text-[#a0ac9d]">{view.leftSub}</div>
            )}
          </div>

          {view.canAdjust ? (
            <button
              type="button"
              onClick={onAdjust}
              title="Ajustar saldo"
              aria-label={`Ajustar saldo da embalagem aberta de ${item.name}`}
              className="pointer-events-auto relative border-l border-[#ede6f8] bg-violet-wash px-[18px] pb-[15px] pt-[13px] text-left transition-colors hover:bg-[#f0e9fb] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet"
            >
              <span className="absolute right-3 top-[9px] flex size-[26px] items-center justify-center rounded-[8px] border border-[#e0d5f3] bg-white text-violet">
                <Pencil className="size-[13px]" strokeWidth={2.1} />
              </span>
              {openPanel}
            </button>
          ) : (
            <div
              className={cn(
                "border-l px-[18px] pb-[15px] pt-[13px]",
                view.hasOpen ? "border-[#ede6f8] bg-violet-wash" : "border-[#f0f4ed]",
              )}
            >
              {openPanel}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SealedIcon() {
  return (
    <svg className="size-[13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 11h18" />
    </svg>
  );
}

function FracIcon() {
  return (
    <svg className="size-[13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
      <rect x="3" y="9" width="18" height="6" rx="3" />
    </svg>
  );
}
