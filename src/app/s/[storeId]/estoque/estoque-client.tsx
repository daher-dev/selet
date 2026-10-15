"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Filter, List, Package, Pencil, Store, Warehouse } from "lucide-react";
import type { Product, StockItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemIcon,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePageAction } from "@/components/shell/app-shell-context";
import { CategoryTile } from "@/components/category-meta";
import { useStockCategoryMeta, useStockSettings, useUnits } from "@/components/stock-settings-context";
import { StockItemFormSheet } from "./stock-item-form-sheet";
import { StockDetailSheet, type OrderRef, type RecipeUsage } from "./estoque-detail-sheet";
import { RegistrarCompraDialog } from "./registrar-compra-dialog";
import { AjustarAbertaDialog } from "./ajustar-aberta-dialog";
import { AbrirEmbalagemDialog } from "./abrir-embalagem-dialog";
import { TransferirDialog } from "./transferir-dialog";
import { PackageBar } from "./package-bar";
import { buildStockCard, needsAttention, STATUS_PILL, stockStatus } from "./stock-view";

type Where = "tudo" | "loja" | "dep";
type StatusFilter = "todos" | "atencao" | "ok" | "arquivados";

const WHERE_OPTIONS: { value: Where; label: string }[] = [
  { value: "tudo", label: "Tudo" },
  { value: "loja", label: "Loja" },
  { value: "dep", label: "Depósito" },
];

export function EstoqueClient({
  storeId,
  storeName,
  items,
  orders,
  menuProducts,
  resaleByStock,
  recipeUsage,
}: {
  storeId: string;
  storeName: string;
  items: StockItem[];
  orders: OrderRef[];
  menuProducts: Product[];
  resaleByStock: Record<string, string[]>;
  recipeUsage: Record<string, RecipeUsage[]>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [where, setWhere] = useState<Where>("tudo");
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [compra, setCompra] = useState<{ itemId: string | null } | null>(null);
  const [transfer, setTransfer] = useState<{ itemId: string | null } | null>(null);
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [openPkgId, setOpenPkgId] = useState<string | null>(null);
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
    onClick: () => setCompra({ itemId: null }),
    secondary: { label: "Transferir para a loja", onClick: () => setTransfer({ itemId: null }) },
  });

  // Strip the deep-link param once mounted so back/refresh doesn't reopen it.
  useEffect(() => {
    if (!searchParams.get("item")) return;
    router.replace(pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const adjusting = items.find((i) => i.id === adjustId) ?? null;
  const openingPkg = items.find((i) => i.id === openPkgId) ?? null;

  const counts = useMemo(() => {
    const active = items.filter((i) => !i.archived);
    const attention = active.filter((i) => needsAttention(stockStatus(i))).length;
    return {
      todos: active.length,
      atencao: attention,
      ok: active.length - attention,
      arquivados: items.length - active.length,
    };
  }, [items]);

  const filtered = useMemo(() => {
    const terms = [query.trim().toLowerCase()].filter(Boolean);
    return items.filter((item) => {
      // Archived items are hidden by default; only the "Arquivados" chip
      // surfaces them (and then shows them exclusively).
      if (status === "arquivados") {
        if (!item.archived) return false;
      } else if (item.archived) {
        return false;
      }
      if (category && item.category !== category) return false;
      if (where === "dep" && item.depSealed === 0) return false;
      if (status === "atencao" && !needsAttention(stockStatus(item))) return false;
      if (status === "ok" && stockStatus(item) !== "ok") return false;
      const cat = STOCK_CATEGORY_META[item.category]?.label ?? item.category;
      return terms.every((term) =>
        `${item.name} ${cat}`.toLowerCase().includes(term),
      );
    });
  }, [items, query, category, where, status, STOCK_CATEGORY_META]);

  const categoryLabel =
    category === null ? "Categorias" : STOCK_CATEGORY_META[category]?.label ?? "Categorias";

  const chips: { value: StatusFilter; label: string; count: number }[] = [
    { value: "todos", label: "Todos", count: counts.todos },
    { value: "atencao", label: "Precisa de atenção", count: counts.atencao },
    { value: "ok", label: "Em dia", count: counts.ok },
  ];
  if (counts.arquivados > 0) chips.push({ value: "arquivados", label: "Arquivados", count: counts.arquivados });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <label className="flex h-10 w-full items-center gap-2 rounded-[10px] border border-border bg-card px-3.5 md:w-[260px]">
          <Search />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar item…"
            aria-label="Buscar item"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
          />
        </label>

        <div
          role="group"
          aria-label="Onde"
          className="flex items-center gap-0.5 rounded-[11px] border border-border bg-card p-[3px]"
        >
          <span className="pl-[7px] pr-2 text-[11px] font-bold uppercase tracking-[.5px] text-ink-soft">Onde</span>
          {WHERE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={where === opt.value}
              onClick={() => setWhere(opt.value)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors",
                where === opt.value ? "bg-ink text-white" : "text-ink-soft hover:bg-wash",
              )}
            >
              {opt.value === "loja" && <Store className="size-[13px] text-primary" strokeWidth={2} />}
              {opt.value === "dep" && <Warehouse className="size-[13px] text-depot" strokeWidth={2} />}
              {opt.label}
            </button>
          ))}
        </div>

        <span className="hidden flex-1 md:block" />

        <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.value}
              type="button"
              aria-pressed={status === chip.value}
              onClick={() => setStatus(chip.value)}
              className={cn(
                "h-9 rounded-[10px] border px-3 text-[12.5px] font-semibold transition-colors",
                status === chip.value
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-card text-ink-soft hover:border-primary/40",
              )}
            >
              {chip.label} · {chip.count}
            </button>
          ))}
        </div>

        <FilterDropdown label={categoryLabel} active={category !== null}>
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
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title={items.length === 0 ? "Nenhum item ainda" : "Nada encontrado"}
          description={
            items.length === 0
              ? "Cadastre itens para controlar a loja e o depósito, entradas e alertas de reposição."
              : "Tente outra busca ou filtro."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <StockCard
              key={item.id}
              item={item}
              where={where}
              onOpen={() => setSelectedId(item.id)}
              onAdjust={() => setAdjustId(item.id)}
              onTransfer={() => setTransfer({ itemId: item.id })}
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
        onBuy={(item) => setCompra({ itemId: item.id })}
        onTransfer={(item) => setTransfer({ itemId: item.id })}
        onOpenPackage={(item) => setOpenPkgId(item.id)}
        onAdjustOpen={(item) => setAdjustId(item.id)}
      />

      <StockItemFormSheet storeId={storeId} open={formOpen} onOpenChange={setFormOpen} />

      <AjustarAbertaDialog
        storeId={storeId}
        item={adjusting}
        onOpenChange={(open) => {
          if (!open) setAdjustId(null);
        }}
      />

      <AbrirEmbalagemDialog
        storeId={storeId}
        item={openingPkg}
        usedIn={openingPkg ? recipeUsage[openingPkg.id] ?? [] : []}
        onOpenChange={(open) => {
          if (!open) setOpenPkgId(null);
        }}
      />

      <TransferirDialog
        storeId={storeId}
        storeName={storeName}
        items={items}
        open={transfer !== null}
        preselectId={transfer?.itemId ?? null}
        onOpenChange={(open) => {
          if (!open) setTransfer(null);
        }}
      />

      <RegistrarCompraDialog
        storeId={storeId}
        items={items}
        open={compra !== null}
        preselectId={compra?.itemId ?? null}
        onOpenChange={(open) => {
          if (!open) setCompra(null);
        }}
        onCreateNew={() => setFormOpen(true)}
      />
    </>
  );
}

function Search() {
  return (
    <svg
      className="size-[15px] shrink-0 text-ink-soft"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
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
          "flex h-9 items-center justify-between gap-2 rounded-[10px] border bg-card px-3 text-[12.5px] font-semibold transition-colors outline-none md:justify-start",
          active
            ? "border-primary/50 text-ink"
            : "border-border text-ink-soft hover:border-primary/40",
        )}
      >
        <Filter className="size-3.5 text-ink-soft" />
        <span>{label}</span>
        <ChevronDown className="size-3 text-ink-faint" strokeWidth={2.4} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StockCard({
  item,
  where,
  onOpen,
  onAdjust,
  onTransfer,
}: {
  item: StockItem;
  where: Where;
  onOpen: () => void;
  onAdjust: () => void;
  onTransfer: () => void;
}) {
  const STOCK_CATEGORY_META = useStockCategoryMeta();
  const { units } = useUnits();
  const meta = STOCK_CATEGORY_META[item.category];
  const view = buildStockCard(item, units);
  const pill = STATUS_PILL[view.status];
  // Esgotado is the one status urgent enough to override the category tile's
  // own color — everything else keeps its category identity.
  const tileMeta =
    meta && view.status === "esgotado"
      ? { ...meta, fg: "text-destructive", bg: "bg-danger-wash" }
      : meta;
  const showLoja = where !== "dep";
  const showDep = where !== "loja" && view.tracked;

  const lojaRow = (
    <>
      <span className="flex items-center gap-[7px]">
        <Store className="size-[13px] shrink-0 text-primary" strokeWidth={2} />
        <span className="text-[11px] font-bold uppercase tracking-[.5px] text-primary">Loja</span>
        <span className="flex-1" />
        <span className={cn("tabular text-[13.5px] font-bold", view.lojaColor)}>{view.lojaMain}</span>
      </span>
      {view.segs.length > 0 && <PackageBar segs={view.segs} className="mt-2" />}
    </>
  );

  // The card is a div, not a button: the Loja row of per-unit items is its own
  // button (Ajustar embalagem aberta) and the Depósito row opens the transfer,
  // and buttons can't nest. A full-bleed button underneath carries the "open
  // details" click; content sits above it and lets clicks through except for
  // the rows that act.
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[14px] border bg-card pb-2.5 text-left leading-[normal] transition-all hover:border-[#9cc5ae] hover:shadow-[0_10px_28px_-16px_rgba(21,60,40,.35)]",
        pill.border,
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Abrir ${item.name}`}
        className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      />
      <div className="pointer-events-none relative flex flex-col">
        <div className="flex items-center gap-[11px] px-[15px] pb-3 pt-3.5">
          {tileMeta && <CategoryTile meta={tileMeta} className="size-[38px] [&>svg]:size-[19px]" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-semibold text-ink">{item.name}</span>
            <span className="mt-[3px] flex items-center gap-[7px]">
              <span className={cn("shrink-0 rounded-full px-[7px] text-[10.5px] font-bold leading-4", pill.bg, pill.fg)}>
                {pill.label}
              </span>
              <span className="min-w-0 truncate rounded-full bg-[#f1f4f0] px-[7px] text-[10.5px] font-semibold leading-4 text-[#3d4a42]">
                {meta?.label ?? item.category}
              </span>
            </span>
          </span>
        </div>

        {showLoja &&
          (view.canAdjust ? (
            <button
              type="button"
              onClick={onAdjust}
              title="Ajustar embalagem aberta"
              aria-label={`Ajustar saldo da embalagem aberta de ${item.name}`}
              className="pointer-events-auto relative mx-2.5 block rounded-[10px] bg-[#f7faf5] px-[11px] pb-[11px] pt-2.5 text-left text-ink transition-colors hover:bg-[#eef5ea]"
            >
              <span className="absolute right-1.5 top-1.5 hidden size-[22px] items-center justify-center rounded-md border border-[#e0d5f3] bg-white text-violet group-hover:flex">
                <Pencil className="size-[11px]" strokeWidth={2.1} />
              </span>
              {lojaRow}
            </button>
          ) : (
            <div className="mx-2.5 block rounded-[10px] bg-[#f7faf5] px-[11px] pb-[11px] pt-2.5">{lojaRow}</div>
          ))}

        {showDep && (
          <button
            type="button"
            onClick={view.depEmpty ? onOpen : onTransfer}
            aria-label={
              view.depEmpty ? `Depósito vazio de ${item.name}` : `Transferir ${item.name} do depósito para a loja`
            }
            className={cn(
              "pointer-events-auto mx-2.5 flex items-center gap-[7px] rounded-[10px] px-[11px] py-[9px] text-left text-ink transition-[filter] hover:brightness-[.97]",
              showLoja && "mt-1.5",
              view.depEmpty ? "bg-[#f4f6f3]" : "bg-depot-wash",
            )}
          >
            <Warehouse
              className={cn("size-[13px] shrink-0", view.depEmpty ? "text-[#b9c3bb]" : "text-depot")}
              strokeWidth={2}
            />
            <span
              className={cn(
                "text-[11px] font-bold uppercase tracking-[.5px]",
                view.depEmpty ? "text-ink-soft" : "text-depot",
              )}
            >
              Depósito
            </span>
            <span className="flex-1" />
            <span className={cn("tabular text-[13.5px] font-bold", view.depEmpty ? "text-ink-soft" : "text-depot")}>
              {view.depMain}
            </span>
            {view.depHint && <span className="text-[11.5px] text-depot-soft">{view.depHint}</span>}
          </button>
        )}
      </div>
    </div>
  );
}
