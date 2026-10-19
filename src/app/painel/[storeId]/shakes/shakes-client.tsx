"use client";

import { useMemo, useState } from "react";
import { Milk } from "lucide-react";
import type {
  Product,
  ShakeBase,
  ShakeBrinde,
  ShakeFlavor,
  ShakeMixin,
  ShakeRim,
  ShakeUtensil,
  StockItem,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatBRL, formatQty } from "@/lib/format";
import { insumoOutOfStock } from "@/lib/stock-status";
import { usePageAction } from "@/components/shell/app-shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import { FlavorFormSheet } from "./flavor-form-sheet";
import { BaseFormSheet } from "./base-form-sheet";
import { TieredModifierFormSheet } from "./tiered-modifier-form-sheet";
import { UtensilFormSheet } from "./utensil-form-sheet";
import { BrindeGrid } from "./brinde-grid";
import { BrindePickerDialog } from "./brinde-picker-dialog";

type Tab = "sabores" | "bases" | "bordas" | "adicionais" | "brindes" | "utensilios";

const TABS: { key: Tab; label: string }[] = [
  { key: "sabores", label: "Sabores" },
  { key: "bases", label: "Bases" },
  { key: "bordas", label: "Bordas" },
  { key: "adicionais", label: "Adicionais" },
  { key: "brindes", label: "Brindes" },
  { key: "utensilios", label: "Utensílios" },
];

const NEW_ACTION_LABEL: Record<Tab, string> = {
  sabores: "Novo sabor",
  bases: "Nova base",
  bordas: "Nova borda",
  adicionais: "Novo adicional",
  brindes: "Adicionar brinde",
  utensilios: "Novo utensílio",
};

interface ShakesClientProps {
  storeId: string;
  flavors: ShakeFlavor[];
  bases: ShakeBase[];
  rims: ShakeRim[];
  mixins: ShakeMixin[];
  utensils: ShakeUtensil[];
  brindes: ShakeBrinde[];
  products: Product[];
  stockItems: StockItem[];
}

export function ShakesClient({
  storeId,
  flavors,
  bases,
  rims,
  mixins,
  utensils,
  brindes,
  products,
  stockItems,
}: ShakesClientProps) {
  const [tab, setTab] = useState<Tab>("sabores");
  const [editingFlavor, setEditingFlavor] = useState<ShakeFlavor | null>(null);
  const [creatingFlavor, setCreatingFlavor] = useState(false);
  const [editingBase, setEditingBase] = useState<ShakeBase | null>(null);
  const [creatingBase, setCreatingBase] = useState(false);
  const [editingRim, setEditingRim] = useState<ShakeRim | null>(null);
  const [creatingRim, setCreatingRim] = useState(false);
  const [editingMixin, setEditingMixin] = useState<ShakeMixin | null>(null);
  const [creatingMixin, setCreatingMixin] = useState(false);
  const [editingUtensil, setEditingUtensil] = useState<ShakeUtensil | null>(null);
  const [creatingUtensil, setCreatingUtensil] = useState(false);
  const [pickingBrinde, setPickingBrinde] = useState(false);

  const stockById = new Map(stockItems.map((s) => [s.id, s]));
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const activeBrindeProductIds = useMemo(
    () => new Set(brindes.filter((b) => !b.archived).map((b) => b.productId)),
    [brindes],
  );

  usePageAction({
    label: NEW_ACTION_LABEL[tab],
    onClick: () => {
      if (tab === "sabores") setCreatingFlavor(true);
      else if (tab === "bases") setCreatingBase(true);
      else if (tab === "bordas") setCreatingRim(true);
      else if (tab === "adicionais") setCreatingMixin(true);
      else if (tab === "brindes") setPickingBrinde(true);
      else setCreatingUtensil(true);
    },
  });

  return (
    <>
      <div className="mb-4 inline-flex flex-wrap items-center gap-0.5 rounded-xl bg-wash p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors",
              tab === t.key
                ? "bg-white text-ink shadow-sm"
                : "text-ink-faint hover:text-ink-soft",
            )}
          >
            {t.label} · {countFor(t.key, { flavors, bases, rims, mixins, utensils, brindes })}
          </button>
        ))}
      </div>

      {tab === "sabores" && (
        <FlavorGrid
          flavors={flavors}
          stockById={stockById}
          onCreate={() => setCreatingFlavor(true)}
          onEdit={setEditingFlavor}
        />
      )}
      {tab === "bases" && (
        <ModifierGrid
          items={bases}
          stockById={stockById}
          emptyTitle="Nenhuma base ainda"
          emptyDescription="Cadastre a primeira base do shake (ex.: Leite, NutreV)."
          onCreate={() => setCreatingBase(true)}
          onEdit={setEditingBase}
          renderPrice={(b) => (b.price > 0 ? `+ ${formatBRL(b.price)}` : "Incluso")}
        />
      )}
      {tab === "bordas" && (
        <ModifierGrid
          items={rims}
          stockById={stockById}
          emptyTitle="Nenhuma borda ainda"
          emptyDescription="Cadastre a primeira borda (ex.: Nutella, Paçoca)."
          onCreate={() => setCreatingRim(true)}
          onEdit={setEditingRim}
          renderPrice={(r) => tiersLabel(r.tiers)}
        />
      )}
      {tab === "adicionais" && (
        <ModifierGrid
          items={mixins}
          stockById={stockById}
          emptyTitle="Nenhum adicional ainda"
          emptyDescription="Cadastre o primeiro adicional (ex.: Fibra Ativa, Whey extra)."
          onCreate={() => setCreatingMixin(true)}
          onEdit={setEditingMixin}
          renderPrice={(m) => tiersLabel(m.tiers)}
        />
      )}
      {tab === "brindes" && (
        <BrindeGrid
          storeId={storeId}
          brindes={brindes}
          productById={productById}
          onCreate={() => setPickingBrinde(true)}
        />
      )}
      {tab === "utensilios" && (
        <ModifierGrid
          items={utensils}
          stockById={stockById}
          emptyTitle="Nenhum utensílio ainda"
          emptyDescription="Cadastre o primeiro utensílio (ex.: Copo, Tampa, Colher)."
          onCreate={() => setCreatingUtensil(true)}
          onEdit={setEditingUtensil}
          renderPrice={(u) =>
            u.defaultIncluded ? "Padrão em todo shake" : "Sob demanda"
          }
        />
      )}

      <FlavorFormSheet
        storeId={storeId}
        flavor={creatingFlavor ? null : editingFlavor}
        stockItems={stockItems}
        open={creatingFlavor || editingFlavor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreatingFlavor(false);
            setEditingFlavor(null);
          }
        }}
      />
      <BaseFormSheet
        storeId={storeId}
        base={creatingBase ? null : editingBase}
        stockItems={stockItems}
        open={creatingBase || editingBase !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreatingBase(false);
            setEditingBase(null);
          }
        }}
      />
      <TieredModifierFormSheet
        kind="borda"
        storeId={storeId}
        modifier={creatingRim ? null : editingRim}
        stockItems={stockItems}
        open={creatingRim || editingRim !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreatingRim(false);
            setEditingRim(null);
          }
        }}
      />
      <TieredModifierFormSheet
        kind="adicional"
        storeId={storeId}
        modifier={creatingMixin ? null : editingMixin}
        stockItems={stockItems}
        open={creatingMixin || editingMixin !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreatingMixin(false);
            setEditingMixin(null);
          }
        }}
      />
      <UtensilFormSheet
        storeId={storeId}
        utensil={creatingUtensil ? null : editingUtensil}
        stockItems={stockItems}
        open={creatingUtensil || editingUtensil !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreatingUtensil(false);
            setEditingUtensil(null);
          }
        }}
      />
      <BrindePickerDialog
        storeId={storeId}
        products={products}
        activeBrindeProductIds={activeBrindeProductIds}
        open={pickingBrinde}
        onOpenChange={setPickingBrinde}
      />
    </>
  );
}

function countFor(
  tab: Tab,
  data: {
    flavors: ShakeFlavor[];
    bases: ShakeBase[];
    rims: ShakeRim[];
    mixins: ShakeMixin[];
    utensils: ShakeUtensil[];
    brindes: ShakeBrinde[];
  },
): number {
  if (tab === "sabores") return data.flavors.length;
  if (tab === "bases") return data.bases.length;
  if (tab === "bordas") return data.rims.length;
  if (tab === "adicionais") return data.mixins.length;
  if (tab === "brindes") return data.brindes.length;
  return data.utensils.length;
}

function tiersLabel(tiers: { qty: number; price: number }[]): string {
  return [...tiers]
    .sort((a, b) => a.qty - b.qty)
    .map((t) => `${t.qty}× ${formatBRL(t.price)}`)
    .join(" · ");
}

// A whole-card-clickable wrapper: a <div role="button">, NOT <button> — some
// cards nest their own "Restaurar" button, and <button> can't contain
// <button> (invalid HTML / hydration error). Mirrors DataListRow's
// clickable-card convention.
export function ClickableCard({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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
      className={cn(
        "cursor-pointer rounded-2xl border p-4 text-left transition-colors",
        active
          ? "border-border bg-card hover:border-primary/40"
          : "border-dashed border-border/70 bg-paper opacity-80",
      )}
    >
      {children}
    </div>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold",
        active ? "bg-mint-wash text-primary" : "bg-wash text-ink-faint",
      )}
    >
      {active ? "Ativo" : "Arquivado"}
    </span>
  );
}

function OutOfStockChip() {
  return (
    <span className="rounded-full bg-amber-wash px-2 py-0.5 text-[10px] font-bold text-amber">
      Sem estoque
    </span>
  );
}

function FlavorGrid({
  flavors,
  stockById,
  onCreate,
  onEdit,
}: {
  flavors: ShakeFlavor[];
  stockById: Map<string, StockItem>;
  onCreate: () => void;
  onEdit: (f: ShakeFlavor) => void;
}) {
  if (flavors.length === 0) {
    return (
      <EmptyState
        icon={Milk}
        title="Nenhum sabor ainda"
        description="Cadastre o primeiro sabor de shake (ex.: Frutas Amarelas)."
        action={
          <button
            type="button"
            onClick={onCreate}
            className="rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-white"
          >
            Novo sabor
          </button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {flavors.map((f) => (
        <ClickableCard key={f.id} active={!f.archived} onClick={() => onEdit(f)}>
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate text-[14.5px] font-bold text-ink">
              {f.name}
            </span>
            <StatusPill active={!f.archived} />
          </div>
          <p className="mt-0.5 text-[11.5px] text-ink-faint">
            {f.recipe.length} {f.recipe.length === 1 ? "insumo" : "insumos"}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {f.recipe.map((r) => {
              const stock = r.stockItemId ? stockById.get(r.stockItemId) : undefined;
              const out = stock ? insumoOutOfStock(stock) : false;
              return (
                <span
                  key={r.stockItemId ?? r.name}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-paper px-2 py-0.5 text-[11px] text-ink-soft"
                >
                  {r.name} · {formatQty(r.qty ?? 0, r.unit)}
                  {out && <OutOfStockChip />}
                </span>
              );
            })}
          </div>
          <div className="mt-3 border-t border-wash pt-3">
            <span
              className={cn(
                "tabular text-[16px] font-bold",
                f.archived ? "text-ink-faint" : "text-primary",
              )}
            >
              {formatBRL(f.price)}
            </span>
            <span className="ml-1 text-[11.5px] text-ink-faint">/ copo</span>
          </div>
        </ClickableCard>
      ))}
    </div>
  );
}

interface ModifierLike {
  id: string;
  name: string;
  insumo: { stockItemId?: string; qty: number | null; unit?: string };
  archived: boolean;
}

function ModifierGrid<T extends ModifierLike>({
  items,
  stockById,
  emptyTitle,
  emptyDescription,
  onCreate,
  onEdit,
  renderPrice,
}: {
  items: T[];
  stockById: Map<string, StockItem>;
  emptyTitle: string;
  emptyDescription: string;
  onCreate: () => void;
  onEdit: (item: T) => void;
  renderPrice: (item: T) => string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Milk}
        title={emptyTitle}
        description={emptyDescription}
        action={
          <button
            type="button"
            onClick={onCreate}
            className="rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-white"
          >
            Adicionar
          </button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const stock = item.insumo.stockItemId
          ? stockById.get(item.insumo.stockItemId)
          : undefined;
        const out = stock ? insumoOutOfStock(stock) : false;
        return (
          <ClickableCard key={item.id} active={!item.archived} onClick={() => onEdit(item)}>
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 truncate text-[14.5px] font-bold text-ink">
                {item.name}
              </span>
              <StatusPill active={!item.archived} />
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
              {stock?.name ?? "Insumo"} · {formatQty(item.insumo.qty ?? 0, item.insumo.unit ?? "")}
              {out && <OutOfStockChip />}
            </p>
            <div className="mt-3 border-t border-wash pt-3">
              <span
                className={cn(
                  "text-[13px] font-semibold",
                  item.archived ? "text-ink-faint" : "text-primary",
                )}
              >
                {renderPrice(item)}
              </span>
            </div>
          </ClickableCard>
        );
      })}
    </div>
  );
}
