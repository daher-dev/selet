"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChefHat,
  Loader2,
  PackageOpen,
  Pencil,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  Trash2,
  TriangleAlert,
  Utensils,
  Warehouse,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import type {
  Product,
  StockCategory,
  StockItem,
  StockLocation,
  StockMovement,
  StockMovementReason,
  StockUnit,
} from "@/lib/types";
import { formatBRL, formatRelative, formatQty, parseBRL } from "@/lib/format";
import { expectedUses, yieldPercent } from "@/lib/stock-yield";
import { cn } from "@/lib/utils";
import {
  applyMovementAction,
  deleteMovementAction,
  getStockItemAction,
  markPackageEmptyAction,
  updateMovementAction,
  updateStockItemAction,
  deleteStockItemAction,
} from "@/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CategoryTile } from "@/components/category-meta";
import { useStockCategoryMeta, useStockSettings, useUnits } from "@/components/stock-settings-context";
import { ConfirmDialog } from "../sorteios/confirm-dialog";
import { Movimentacoes } from "./movimentacoes";
import { OpenMeter } from "./open-meter";
import { UnitPicker } from "./unit-picker";
import {
  buildStockCard,
  isFrac,
  minimumLabel,
  needsAttention,
  pkgCount,
  pkgPlural,
  STATUS_PILL,
  stockStatus,
  suggestTransferQty,
} from "./stock-view";

export interface OrderRef {
  id: string;
  code: string;
  customerName: string;
}

/** One recipe/adicional line elsewhere in the catalog that consumes this insumo. */
export interface RecipeUsage {
  name: string;
  qty: number | null;
  unit: string;
}

interface Props {
  storeId: string;
  item: StockItem | null;
  orders: OrderRef[];
  menuProducts: Product[];
  /** Revenda/adicional catalog products backed directly by this insumo. */
  resaleNames: string[];
  usedIn: RecipeUsage[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Comprar": the page opens Registrar compra with this item preselected. */
  onBuy: (item: StockItem) => void;
  /** Depósito tile / "Repor do depósito": the page opens Transferir para a loja with this item. */
  onTransfer: (item: StockItem) => void;
  /** "Abrir embalagem" on a contínuo item with no package in use. */
  onOpenPackage: (item: StockItem) => void;
  /** "Ajustar" on the open package of a per-unit item. */
  onAdjustOpen: (item: StockItem) => void;
}

const SAIDA_REASONS: StockMovementReason[] = ["AJUSTE", "PERDA", "VENDA", "CONSUMO"];

const REASON_META: Record<
  string,
  { label: string; fg: string; bg: string; icon: LucideIcon }
> = {
  ENTRADA: { label: "Compra", fg: "text-success", bg: "bg-mint-wash", icon: ArrowDownToLine },
  AJUSTE: { label: "AJUSTE", fg: "text-ink-soft", bg: "bg-wash", icon: Pencil },
  PERDA: { label: "PERDA", fg: "text-destructive", bg: "bg-danger-wash", icon: Trash2 },
  VENDA: { label: "VENDA", fg: "text-info", bg: "bg-info-wash", icon: ShoppingBag },
  CONSUMO: { label: "CONSUMO", fg: "text-violet", bg: "bg-violet-wash", icon: Utensils },
  SAIDA: { label: "SAÍDA", fg: "text-ink-soft", bg: "bg-wash", icon: ArrowUpFromLine },
};

export function StockDetailSheet({
  storeId,
  item,
  orders,
  menuProducts,
  resaleNames,
  usedIn,
  open,
  onOpenChange,
  onBuy,
  onTransfer,
  onOpenPackage,
  onAdjustOpen,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden p-0 data-[side=right]:sm:max-w-[480px]"
      >
        {item && (
          <DetailBody
            key={item.id}
            storeId={storeId}
            item={item}
            orders={orders}
            menuProducts={menuProducts}
            resaleNames={resaleNames}
            usedIn={usedIn}
            onClose={() => onOpenChange(false)}
            onBuy={onBuy}
            onTransfer={onTransfer}
            onOpenPackage={onOpenPackage}
            onAdjustOpen={onAdjustOpen}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({
  storeId,
  item,
  orders,
  menuProducts,
  resaleNames,
  usedIn,
  onClose,
  onBuy,
  onTransfer,
  onOpenPackage,
  onAdjustOpen,
}: {
  storeId: string;
  item: StockItem;
  orders: OrderRef[];
  menuProducts: Product[];
  resaleNames: string[];
  usedIn: RecipeUsage[];
  onClose: () => void;
  onBuy: (item: StockItem) => void;
  onTransfer: (item: StockItem) => void;
  onOpenPackage: (item: StockItem) => void;
  onAdjustOpen: (item: StockItem) => void;
}) {
  const STOCK_CATEGORY_META = useStockCategoryMeta();
  const [liveItem, setLiveItem] = useState(item);
  const meta = STOCK_CATEGORY_META[liveItem.category];
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [editingMovement, setEditingMovement] = useState<StockMovement | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const refreshDetail = () => setReloadKey((v) => v + 1);

  // The page re-renders with fresh server data after any dialog's action: follow it
  // (adjusting state during render, guarded, rather than in an effect).
  const [prevItem, setPrevItem] = useState(item);
  if (item !== prevItem) {
    setPrevItem(item);
    setLiveItem(item);
    setReloadKey((v) => v + 1);
  }

  useEffect(() => {
    let cancelled = false;
    getStockItemAction(storeId, item.id)
      .then((nextItem) => {
        if (cancelled) return;
        if (nextItem) setLiveItem(nextItem);
        else onClose();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeId, item.id, reloadKey, onClose]);

  const status = stockStatus(liveItem);
  const pill = STATUS_PILL[status];
  const canRepor = liveItem.tracked && needsAttention(status) && liveItem.depSealed > 0;
  const reporQty = suggestTransferQty(liveItem);

  return (
    <>
      <SheetHeader className="shrink-0 flex-row items-center gap-[13px] border-b border-[#eef3ea] p-5 py-[18px] pr-14">
        {meta && <CategoryTile meta={meta} className="size-11 rounded-[11px]" />}
        <div className="min-w-0 flex-1">
          <SheetTitle className="truncate text-[18px] font-bold leading-tight">{liveItem.name}</SheetTitle>
          <span className="mt-1 flex items-center gap-[7px]">
            <span className={cn("rounded-full px-[7px] text-[10.5px] font-bold leading-4", pill.bg, pill.fg)}>
              {pill.label}
            </span>
            <span className="truncate rounded-full bg-[#f1f4f0] px-[7px] text-[10.5px] font-semibold leading-4 text-[#3d4a42]">
              {meta?.label ?? liveItem.category}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-pressed={editing}
          className={cn(
            "flex h-[34px] shrink-0 items-center rounded-[9px] border px-[11px] text-[12.5px] font-semibold transition-colors",
            editing ? "border-primary bg-mist text-primary" : "border-border text-[#3d4a42] hover:border-primary/40",
          )}
        >
          Editar
        </button>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-[22px] pt-[18px]">
        {editing && (
          <EditPanel storeId={storeId} item={liveItem} open onToggle={() => setEditing(false)} onClose={onClose} hideToggle />
        )}

        <LocationTiles item={liveItem} highlightDeposit={canRepor} onTransfer={() => onTransfer(liveItem)} />

        {resaleNames.length > 0 && status === "esgotado" && <ResaleOutWarning names={resaleNames} />}

        <OpenPackagePanel
          storeId={storeId}
          item={liveItem}
          usedIn={usedIn}
          onOpenPackage={() => onOpenPackage(liveItem)}
          onAdjustOpen={() => onAdjustOpen(liveItem)}
          onDone={refreshDetail}
        />

        <MetricTiles item={liveItem} usedIn={usedIn} />

        {adjusting && (
          <AdjustPanel
            storeId={storeId}
            item={liveItem}
            orders={orders}
            menuProducts={menuProducts}
            onDone={() => {
              setAdjusting(false);
              refreshDetail();
            }}
          />
        )}

        {editingMovement && (
          <MovementEditForm
            key={editingMovement.id}
            storeId={storeId}
            item={liveItem}
            movement={editingMovement}
            onCancel={() => setEditingMovement(null)}
            onDone={() => {
              setEditingMovement(null);
              refreshDetail();
            }}
          />
        )}

        <Movimentacoes
          storeId={storeId}
          item={liveItem}
          reloadKey={reloadKey}
          onEdit={(m) => {
            setAdjusting(false);
            setEditingMovement(m);
          }}
        />
      </div>

      <div className="flex shrink-0 gap-2.5 border-t border-[#f0f4ed] px-5 py-3.5">
        {canRepor ? (
          <>
            <Button
              variant="outline"
              onClick={() => onBuy(liveItem)}
              className="h-11 rounded-[11px] border-[#cddcc4] px-4 text-[13.5px] font-semibold text-primary"
            >
              Registrar compra
            </Button>
            <Button
              onClick={() => onTransfer(liveItem)}
              className="h-11 flex-1 gap-2 rounded-[11px] bg-depot text-[13.5px] font-semibold text-white hover:bg-depot/90"
            >
              Repor {reporQty} {pkgCount(liveItem, reporQty)} do depósito
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={() => {
                setEditingMovement(null);
                setAdjusting((v) => !v);
              }}
              aria-pressed={adjusting}
              className={cn(
                "h-11 gap-2 rounded-[11px] px-4 text-[13.5px] font-semibold",
                liveItem.tracked ? "" : "flex-1",
                adjusting ? "border-primary bg-mist text-primary" : "text-[#3d4a42]",
              )}
            >
              <Pencil className="size-3.5" strokeWidth={2} />
              Ajustar estoque
            </Button>
            {liveItem.tracked && (
              <Button onClick={() => onBuy(liveItem)} className="h-11 flex-1 gap-2 rounded-[11px] text-[13.5px] font-semibold">
                <ShoppingCart className="size-3.5" strokeWidth={2} />
                Comprar
              </Button>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------ depósito + loja */

function LocationTiles({
  item,
  highlightDeposit,
  onTransfer,
}: {
  item: StockItem;
  highlightDeposit: boolean;
  onTransfer: () => void;
}) {
  const { units, unitLabel } = useUnits();
  const status = stockStatus(item);
  const card = buildStockCard(item, units);

  if (!item.tracked) {
    return (
      <div className="rounded-xl border border-[#ddebd5] bg-[#f3f8ef] px-3.5 py-[13px]">
        <TileLabel icon={Store} tone="loja">
          Em estoque
        </TileLabel>
        <span className={cn("mt-1.5 block text-[22px] font-bold", card.lojaColor)}>{card.lojaMain}</span>
        <span className="mt-px block text-[12px] text-[#3d5a47]">não rastreado</span>
      </div>
    );
  }

  const dep = item.depSealed;
  const pkgSize = item.pkgSize ?? 1;
  const depUnits =
    !item.continuousUse && pkgSize > 1 ? formatQty(dep * pkgSize, unitLabel(item.unit, dep * pkgSize !== 1)) : "";
  const depSub =
    dep === 0
      ? "sem embalagens"
      : highlightDeposit
        ? [depUnits, "dá para repor agora"].filter(Boolean).join(" · ")
        : item.cost
          ? `${formatBRL(dep * item.cost)} parados`
          : depUnits;
  const alert = needsAttention(status);
  const sealedText = `${item.sealed} ${pkgCount(item, item.sealed)}`;
  const openPart = item.continuousUse
    ? item.openPkg
      ? "+ 1 em uso"
      : ""
    : item.open > 0
      ? `+ ${formatQty(item.open, unitLabel(item.unit, item.open !== 1))}`
      : "";
  const lojaSub = alert && status === "esgotado" ? `mínimo ${minimumLabel(item, unitLabel)}` : [openPart, `mín. ${minimumLabel(item, unitLabel)}`].filter(Boolean).join(" · ");

  const depBody = (
    <>
      <TileLabel icon={Warehouse} tone="deposito">
        Depósito
      </TileLabel>
      <span className="mt-1.5 block text-[22px] font-bold text-depot">
        {dep} {pkgCount(item, dep)}
      </span>
      <span className="mt-px block text-[12px] text-depot-soft">{depSub}</span>
    </>
  );

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {dep > 0 ? (
        <button
          type="button"
          onClick={onTransfer}
          aria-label={`Transferir ${item.name} do depósito para a loja`}
          className={cn(
            "block rounded-xl bg-depot-wash px-3.5 py-[13px] text-left transition-colors hover:border-[#9dbdd6]",
            highlightDeposit ? "border-[1.5px] border-depot" : "border border-depot-line",
          )}
        >
          {depBody}
        </button>
      ) : (
        <div className="rounded-xl border border-depot-line bg-depot-wash px-3.5 py-[13px]">{depBody}</div>
      )}
      <div
        className={cn(
          "rounded-xl px-3.5 py-[13px]",
          alert ? "border border-[#f2d8cf] bg-[#fdf4f1]" : "border border-[#ddebd5] bg-[#f3f8ef]",
        )}
      >
        <TileLabel icon={Store} tone="loja">
          Loja
        </TileLabel>
        <span className={cn("mt-1.5 block text-[22px] font-bold", status === "esgotado" ? "text-[#b23a22]" : "text-ink")}>
          {status === "esgotado" ? card.lojaMain : sealedText}
        </span>
        <span className={cn("mt-px block text-[12px]", alert ? "text-[#7a564b]" : "text-[#3d5a47]")}>{lojaSub}</span>
      </div>
    </div>
  );
}

function TileLabel({
  icon: Icon,
  tone,
  children,
}: {
  icon: LucideIcon;
  tone: "loja" | "deposito";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-[7px] text-[11px] font-bold uppercase tracking-[.5px]",
        tone === "loja" ? "text-primary" : "text-depot",
      )}
    >
      <Icon className="size-[13px] shrink-0" strokeWidth={2} />
      {children}
    </span>
  );
}

/* --------------------------------------------------------- embalagem aberta */

/** Per-use amounts the recipes take from this item (drives the forecast and "por uso" cost). */
function perUseQtys(usedIn: RecipeUsage[]): number[] {
  return usedIn.flatMap((u) => (u.qty != null ? [u.qty] : []));
}

function OpenPackagePanel({
  storeId,
  item,
  usedIn,
  onOpenPackage,
  onAdjustOpen,
  onDone,
}: {
  storeId: string;
  item: StockItem;
  usedIn: RecipeUsage[];
  onOpenPackage: () => void;
  onAdjustOpen: () => void;
  onDone: () => void;
}) {
  const { units, unitLabel } = useUnits();
  const [pending, startTransition] = useTransition();
  const label = item.pkgLabel ?? "embalagem";

  function markEmpty() {
    startTransition(async () => {
      const r = await markPackageEmptyAction(storeId, item.id);
      if (r.ok) {
        toast.success("Embalagem marcada como vazia.");
        onDone();
      } else toast.error(r.error);
    });
  }

  if (item.continuousUse && item.openPkg) {
    return (
      <div className="rounded-xl border border-[#ede6f8] bg-violet-wash px-4 py-3.5">
        <div className="flex items-center">
          <span className="flex-1 text-[11px] font-bold uppercase tracking-[.5px] text-violet">
            {label.charAt(0).toUpperCase() + label.slice(1)} em uso
          </span>
          <span className="rounded-full bg-[#ede6f8] px-2 py-0.5 text-[11px] font-semibold text-[#5c4f78]">Uso contínuo</span>
        </div>
        <div className="mt-1.5 text-[30px] font-semibold tracking-[-.5px]">
          {item.usos} {item.usos === 1 ? "uso" : "usos"}
        </div>
        <div
          className="em-uso mt-2.5 h-2 rounded-[5px]"
          style={{ background: "repeating-linear-gradient(135deg, #6b46c1 0 3px, #d3c6f2 3px 6px)" }}
          aria-hidden
        />
        <button
          type="button"
          onClick={markEmpty}
          disabled={pending}
          className="mt-3 flex h-[42px] w-full items-center justify-center gap-[7px] rounded-[10px] border border-[#d9ccf3] bg-white text-[13px] font-semibold text-violet transition-colors hover:bg-[#fbf9fe] disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-[15px] animate-spin" /> : <Archive className="size-[15px]" strokeWidth={2} />}
          Marcar vazia
        </button>
      </div>
    );
  }

  if (item.continuousUse && !item.openPkg) {
    const available = item.sealed + item.depSealed;
    const expected = expectedUses(item.pkgSize, perUseQtys(usedIn));
    const pct = item.lastUsos != null ? yieldPercent(item.lastUsos, expected) : undefined;
    return (
      <div className="rounded-xl border border-dashed border-[#c9d3cb] bg-[#fafbf9] px-4 py-3.5">
        <span className="block text-[11px] font-bold uppercase tracking-[.5px] text-ink-soft">
          Nenhum {label} em uso
        </span>
        {item.lastUsos != null && (
          <span className="mt-1.5 block text-[14px] font-semibold">
            Último {label} rendeu {item.lastUsos} {item.lastUsos === 1 ? "uso" : "usos"}
            {pct != null && <span className="text-[#8a5a0f]"> ({pct}% do previsto)</span>}
          </span>
        )}
        <button
          type="button"
          onClick={onOpenPackage}
          disabled={available < 1}
          className="mt-3 flex h-[42px] w-full items-center justify-center gap-[7px] rounded-[10px] bg-violet text-[13px] font-semibold text-white transition-colors hover:bg-violet/90 disabled:opacity-50"
        >
          <PackageOpen className="size-[15px]" strokeWidth={2} />
          Abrir embalagem
        </button>
        <span className="mt-[7px] block text-center text-[11.5px] text-ink-soft">
          {available < 1
            ? "Sem embalagens em estoque"
            : item.sealed > 0
              ? `Usa 1 dos ${item.sealed} ${pkgCount(item, item.sealed)} lacrados da loja`
              : `Usa 1 dos ${item.depSealed} ${pkgCount(item, item.depSealed)} lacrados do depósito`}
        </span>
      </div>
    );
  }

  // Per-unit item (copos, sachês) with a partly used package: its balance can be corrected by hand.
  if (buildStockCard(item, units).canAdjust) {
    const pkgSize = item.pkgSize ?? 1;
    const un = unitLabel(item.unit, true);
    return (
      <div className="rounded-xl border border-[#ede6f8] bg-violet-wash px-4 py-3.5">
        <span className="block text-[11px] font-bold uppercase tracking-[.5px] text-violet">Embalagem aberta</span>
        <div className="mt-1.5 text-[30px] font-semibold tracking-[-.5px]">
          {item.open}
          <span className="ml-2 text-[13.5px] font-normal tracking-normal text-[#5c4f78]">
            de {pkgSize} {un}
          </span>
        </div>
        <OpenMeter total={pkgSize} filled={item.open} className="mt-2.5" />
        <button
          type="button"
          onClick={onAdjustOpen}
          className="mt-3 flex h-[42px] w-full items-center justify-center gap-[7px] rounded-[10px] border border-[#d9ccf3] bg-white text-[13px] font-semibold text-violet transition-colors hover:bg-[#fbf9fe]"
        >
          <Pencil className="size-[15px]" strokeWidth={2} />
          Ajustar
        </button>
      </div>
    );
  }
  return null;
}

/* ----------------------------------------------------- custo · rendimento · receitas */

function MetricTiles({ item, usedIn }: { item: StockItem; usedIn: RecipeUsage[] }) {
  const { unitLabel } = useUnits();
  const [recipesOpen, setRecipesOpen] = useState(false);
  const label = item.pkgLabel ?? "emb.";
  const qtys = perUseQtys(usedIn);
  const expected = item.continuousUse ? expectedUses(item.pkgSize, qtys) : undefined;
  const pkgSize = item.pkgSize ?? 1;

  const tiles: React.ReactNode[] = [];
  if (item.tracked && item.cost) {
    const per = item.continuousUse
      ? expected
        ? `~${formatBRL(Math.round(item.cost / expected))} por uso`
        : undefined
      : pkgSize > 1
        ? `${formatBRL(Math.round(item.cost / pkgSize))} por ${unitLabel(item.unit)}`
        : undefined;
    tiles.push(
      <MetricTile key="custo" label={`Custo/${label}`} value={formatBRL(item.cost)} sub={per} />,
    );
  }
  if (item.continuousUse && expected) {
    const pct = item.lastUsos != null ? yieldPercent(item.lastUsos, expected) : undefined;
    tiles.push(
      <MetricTile
        key="rend"
        label="Rendimento"
        value={pct != null ? `${pct}%` : "—"}
        valueClass={pct != null ? (pct >= 100 ? "text-success" : "text-[#8a5a0f]") : undefined}
        sub={`${expected} usos previstos`}
      />,
    );
  }
  if (usedIn.length > 0) {
    const avg = qtys.length ? qtys.reduce((a, b) => a + b, 0) / qtys.length : null;
    tiles.push(
      <button
        key="receitas"
        type="button"
        aria-expanded={recipesOpen}
        onClick={() => setRecipesOpen((v) => !v)}
        className="rounded-[11px] border border-[#eef3ea] px-3 py-[11px] text-left transition-colors hover:border-primary/40"
      >
        <span className="block text-[10.5px] font-bold uppercase tracking-[.4px] text-ink-soft">Receitas</span>
        <span className="mt-[3px] block text-[15px] font-bold text-primary underline">
          {usedIn.length} {usedIn.length === 1 ? "item" : "itens"}
        </span>
        <span className="block text-[11.5px] text-ink-soft">
          {avg != null ? `${formatQty(Math.round(avg * 100) / 100, unitLabel(item.unit))} por uso` : "sem medição"}
        </span>
      </button>,
    );
  }
  if (tiles.length === 0) return null;
  return (
    <>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
        {tiles}
      </div>
      {recipesOpen && <UsedInRecipes usedIn={usedIn} />}
    </>
  );
}

function MetricTile({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-[11px] border border-[#eef3ea] px-3 py-[11px]">
      <span className="block text-[10.5px] font-bold uppercase tracking-[.4px] text-ink-soft">{label}</span>
      <span className={cn("tabular mt-[3px] block text-[15px] font-bold", valueClass)}>{value}</span>
      {sub && <span className="block text-[11.5px] text-ink-soft">{sub}</span>}
    </div>
  );
}

/* ------------------------------------------------------------ ajustar estoque */

/** Footer "Ajustar estoque": a manual entrada or saída, in the Loja or (whole packages) in the Depósito. */
function AdjustPanel({
  storeId,
  item,
  orders,
  menuProducts,
  onDone,
}: {
  storeId: string;
  item: StockItem;
  orders: OrderRef[];
  menuProducts: Product[];
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"in" | "out">("in");
  const [loc, setLoc] = useState<StockLocation>("loja");
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-paper p-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[11px] font-bold uppercase tracking-[.5px] text-ink-soft">Ajustar estoque</span>
        <PanelToggle on={mode === "in"} onClick={() => setMode("in")}>
          Entrada
        </PanelToggle>
        <PanelToggle on={mode === "out"} onClick={() => setMode("out")}>
          Saída
        </PanelToggle>
      </div>
      {item.tracked && (
        <div role="group" aria-label="Onde" className="flex gap-2">
          <PanelToggle on={loc === "loja"} onClick={() => setLoc("loja")}>
            <Store className="size-3 text-primary" strokeWidth={2.2} />
            Loja
          </PanelToggle>
          <PanelToggle on={loc === "deposito"} onClick={() => setLoc("deposito")}>
            <Warehouse className="size-3 text-depot" strokeWidth={2.2} />
            Depósito
          </PanelToggle>
        </div>
      )}
      {mode === "in" ? (
        <EntradaForm storeId={storeId} item={item} loc={loc} onDone={onDone} />
      ) : (
        <SaidaForm storeId={storeId} item={item} loc={loc} orders={orders} menuProducts={menuProducts} onDone={onDone} />
      )}
    </div>
  );
}

function PanelToggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
        on ? "border-primary bg-primary text-white" : "border-border bg-card text-ink-soft hover:border-primary/40",
      )}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------- revenda esgotado */

/** "A", "A e B", or "A, B e mais N" — same join rule as the estoque banner. */
function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(" e ");
  return `${names.slice(0, 2).join(", ")} e mais ${names.length - 2}`;
}

function ResaleOutWarning({ names }: { names: string[] }) {
  const label = joinNames(names);
  const plural = names.length > 1;
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-[#f1d6ce] bg-[#fdf5f2] p-3.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-danger-wash text-destructive">
        <TriangleAlert className="size-[15px]" strokeWidth={2} />
      </span>
      <p className="text-[12.5px] leading-snug text-[#8a6a60]">
        {plural ? `Os itens de revenda ${label}` : `O item de revenda ${label}`}{" "}
        {plural ? "aparecem" : "aparece"} indisponíve{plural ? "is" : "l"} no cardápio
        enquanto este insumo estiver zerado.
      </p>
    </div>
  );
}

/* --------------------------------------------------------- usado nas receitas */

function UsedInRecipes({ usedIn }: { usedIn: RecipeUsage[] }) {
  const MAX = 4;
  const visible = usedIn.slice(0, MAX);
  const hidden = usedIn.length - visible.length;
  return (
    <div className="rounded-xl border border-border bg-paper p-3.5">
      <span className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
        <ChefHat className="size-3.5" strokeWidth={1.9} />
        Usado nas receitas
      </span>
      <div className="flex flex-col gap-1.5">
        {visible.map((u, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-[13px]">
            <span className="truncate text-ink-soft">{u.name}</span>
            <span className="tabular shrink-0 font-semibold text-ink-faint">
              {u.qty == null ? "sem medição" : formatQty(u.qty, u.unit)}
            </span>
          </div>
        ))}
        {hidden > 0 && (
          <span className="mt-0.5 text-[12px] font-semibold text-ink-faint">
            +{hidden} {hidden === 1 ? "item" : "itens"}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------- alterar informações */

function EditPanel({
  storeId,
  item,
  open,
  onToggle,
  onClose,
  hideToggle,
}: {
  storeId: string;
  item: StockItem;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** The sheet's "Editar" button already opens it: show just the form. */
  hideToggle?: boolean;
}) {
  const STOCK_CATEGORY_META = useStockCategoryMeta();
  const { categories: stockCategories } = useStockSettings();
  const { unitLabel, unitKind } = useUnits();
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<StockCategory>(item.category);
  const [unit, setUnit] = useState<StockUnit>(item.unit);
  const [pkgLabel, setPkgLabel] = useState(item.pkgLabel ?? "caixa");
  const [pkgLabelPluralInput, setPkgLabelPluralInput] = useState(item.pkgLabelPlural ?? "");
  const [pkgSize, setPkgSize] = useState(item.pkgSize ? String(item.pkgSize) : "");
  const [reorder, setReorder] = useState(String(item.reorderAt));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const isCount = unitKind(unit) === "count";
  const pkgLabelValue = pkgLabel.trim() || "caixa";
  const pkgLabelPlural = pkgPlural(pkgLabelValue, pkgLabelPluralInput);
  // UNIT RULE: consumption mode is DERIVED from the unit, never toggled here.
  const isWeightVol = unitKind(unit) === "measure";
  const reorderUnit = item.tracked ? pkgLabelPlural : unit;

  function save() {
    if (!name.trim()) return toast.error("Informe o nome do item.");
    startTransition(async () => {
      const r = await updateStockItemAction(item.id, {
        storeId,
        name: name.trim(),
        category,
        unit,
        tracked: item.tracked,
        pkgLabel: item.tracked ? pkgLabelValue : undefined,
        pkgLabelPlural: item.tracked ? pkgLabelPluralInput.trim() || undefined : undefined,
        pkgSize: pkgSize ? Number(pkgSize.replace(",", ".")) : item.pkgSize,
        continuousUse: isWeightVol,
        consumptionMode: isWeightVol ? "continuo" : "medido",
        resellable: item.resellable,
        cost: item.cost,
        sellPrice: item.sellPrice,
        reorderAt: reorder ? Number(reorder.replace(",", ".")) : 0,
        yieldPct: item.yieldPct,
        archived: item.archived,
      });
      if (r.ok) toast.success("Item atualizado.");
      else toast.error(r.error);
    });
  }

  function archive() {
    startTransition(async () => {
      const r = await updateStockItemAction(item.id, {
        storeId,
        name: item.name,
        category: item.category,
        unit: item.unit,
        tracked: item.tracked,
        pkgLabel: item.pkgLabel,
        pkgLabelPlural: item.pkgLabelPlural,
        pkgSize: item.pkgSize,
        continuousUse: item.continuousUse,
        consumptionMode: item.consumptionMode,
        resellable: item.resellable,
        cost: item.cost,
        sellPrice: item.sellPrice,
        reorderAt: item.reorderAt,
        yieldPct: item.yieldPct,
        archived: !item.archived,
      });
      if (r.ok) toast.success(item.archived ? "Item reativado." : "Item arquivado.");
      else toast.error(r.error);
    });
  }

  function remove() {
    startTransition(async () => {
      const r = await deleteStockItemAction(storeId, item.id);
      if (r.ok) {
        toast.success("Item removido.");
        onClose();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="shrink-0 overflow-hidden rounded-xl border border-border">
      {!hideToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center gap-2 bg-paper px-3.5 py-2.5 text-left transition-colors hover:bg-wash"
        >
          <Pencil className="size-[15px] text-primary" strokeWidth={1.8} />
          <span className="flex-1 text-[13.5px] font-semibold text-ink">
            Alterar informações
          </span>
          <ChevronDown
            className={cn("size-4 text-ink-faint transition-transform", open && "rotate-180")}
          />
        </button>
      )}

      {open && (
        <div className={cn("flex flex-col gap-4 p-3.5", !hideToggle && "border-t border-border")}>
          <div>
            <FieldLabel>Nome do item</FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Leite de coco"
              className="h-[42px] rounded-lg bg-paper"
            />
          </div>

          <div>
            <FieldLabel>Categoria</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {stockCategories.map(({ id: key }) => {
                const m = STOCK_CATEGORY_META[key];
                const Icon = m.icon;
                const on = category === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategory(key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                      on
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-card text-ink-soft hover:border-primary/40",
                    )}
                  >
                    <Icon className="size-3.5" strokeWidth={1.8} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <FieldLabel>Unidade de uso</FieldLabel>
            <UnitPicker value={unit} onChange={setUnit} variant="compact" />
          </div>

          {item.tracked && (
            <div>
              <FieldLabel>Embalagem</FieldLabel>
              <InlineInput
                value={pkgLabel}
                onChange={setPkgLabel}
                inputMode="text"
              />
              <FieldLabel>Embalagem (plural)</FieldLabel>
              <InlineInput
                value={pkgLabelPluralInput}
                onChange={setPkgLabelPluralInput}
                placeholder={pkgPlural(pkgLabelValue)}
                inputMode="text"
              />
            </div>
          )}

          <div>
            <FieldLabel>Baixa no estoque</FieldLabel>
            <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
              <span className="block text-[12.5px] font-semibold text-ink">
                {isWeightVol
                  ? "Controle manual · marcar como vazia"
                  : "Baixa automática por contagem"}
              </span>
              <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">
                {isWeightVol
                  ? "Itens por peso/volume não são pesados a cada uso — baixa manual por embalagem."
                  : "Itens contáveis (un/sachê) deduzem a quantidade usada a cada preparo."}
              </p>
            </div>
          </div>

          {isCount && (
            <div>
              <FieldLabel>Lote</FieldLabel>
              <InlineInput
                value={pkgSize}
                onChange={setPkgSize}
                suffix={`${unitLabel(unit)} / ${pkgLabelValue}`}
                inputMode="decimal"
              />
            </div>
          )}

          <div>
            <FieldLabel>Alerta de estoque baixo</FieldLabel>
            <InlineInput
              value={reorder}
              onChange={setReorder}
              prefix="avisar abaixo de"
              suffix={reorderUnit}
              inputMode="decimal"
            />
          </div>

          <Button
            onClick={save}
            disabled={pending || !name.trim()}
            className="w-full rounded-lg font-semibold"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Salvar alterações
          </Button>

          <div className="flex gap-2 border-t border-border pt-3">
            <Button
              variant="ghost"
              onClick={archive}
              disabled={pending}
              className="flex-1 gap-1.5 rounded-lg text-[12.5px] text-ink-soft"
            >
              <Archive className="size-4" />
              {item.archived ? "Reativar" : "Arquivar"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirmingDelete(true)}
              disabled={pending}
              className="flex-1 gap-1.5 rounded-lg text-[12.5px] text-destructive hover:bg-danger-wash hover:text-destructive"
            >
              <Trash2 className="size-4" />
              Excluir item
            </Button>
          </div>
          <ConfirmDialog
            open={confirmingDelete}
            onOpenChange={setConfirmingDelete}
            title={`Excluir "${item.name}"?`}
            text="O item é removido do estoque por completo. Não dá para desfazer — para só tirar da lista, use Arquivar."
            cta="Excluir"
            tone="danger"
            pending={pending}
            onConfirm={remove}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- entrada/saída */

function EntradaForm({
  storeId,
  item,
  loc,
  onDone,
}: {
  storeId: string;
  item: StockItem;
  loc: StockLocation;
  onDone: () => void;
}) {
  const { unitLabel } = useUnits();
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [pending, startTransition] = useTransition();
  const unit = item.tracked ? `${item.pkgLabel ?? "emb."}(s)` : unitLabel(item.unit);

  function submit() {
    const parsedQty = Number(qty.replace(",", "."));
    if (!parsedQty || parsedQty <= 0) return toast.error("Informe a quantidade.");
    let parsedPrice: number | undefined;
    if (price.trim()) {
      try {
        parsedPrice = parseBRL(price);
      } catch {
        return toast.error("Preço inválido.");
      }
    }
    startTransition(async () => {
      const r = await applyMovementAction({
        storeId,
        itemId: item.id,
        type: "entrada",
        qty: parsedQty,
        byPackage: item.tracked,
        price: parsedPrice,
        reason: "ENTRADA",
        loc,
      });
      if (r.ok) {
        toast.success("Entrada registrada.");
        onDone();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="rounded-xl border border-[#cde7d6] bg-[#f4faf5] p-3.5">
      <div className="flex gap-2.5">
        <SmallField label="Quantidade" className="flex-1">
          <InlineInput value={qty} onChange={setQty} suffix={unit} inputMode="decimal" green />
        </SmallField>
        <SmallField label="Preço de compra" className="flex-1">
          <InlineInput value={price} onChange={setPrice} prefix="R$" inputMode="decimal" green />
        </SmallField>
      </div>
      <Button
        onClick={submit}
        disabled={pending}
        className="mt-3 w-full rounded-lg bg-success font-bold hover:bg-success/90"
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        Registrar entrada
      </Button>
    </div>
  );
}

function SaidaForm({
  storeId,
  item,
  loc,
  orders,
  menuProducts,
  onDone,
}: {
  storeId: string;
  item: StockItem;
  loc: StockLocation;
  orders: OrderRef[];
  menuProducts: Product[];
  onDone: () => void;
}) {
  const { unitLabel } = useUnits();
  const [reason, setReason] = useState<StockMovementReason>("AJUSTE");
  const [qty, setQty] = useState("");
  const [ref, setRef] = useState<{ value: string; label: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // The depósito only holds whole packages.
  const byPackage = loc === "deposito" || item.continuousUse || !isFrac(item);
  const saidaUnit = byPackage ? `${item.pkgLabel ?? "emb."}(s)` : unitLabel(item.unit);
  const showRef = reason === "VENDA" || reason === "CONSUMO";

  function submit() {
    const parsedQty = Number(qty.replace(",", "."));
    if (!parsedQty || parsedQty <= 0) return toast.error("Informe a quantidade.");
    startTransition(async () => {
      const r = await applyMovementAction({
        storeId,
        itemId: item.id,
        type: "saida",
        qty: parsedQty,
        byPackage,
        reason,
        refOrder: reason === "VENDA" ? ref?.value : undefined,
        refItem: reason === "CONSUMO" ? ref?.value : undefined,
        loc,
      });
      if (r.ok) {
        toast.success("Saída registrada.");
        onDone();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="rounded-xl border border-[#f1d6ce] bg-[#fdf5f2] p-3.5">
      <FieldLabel className="mb-1.5 normal-case tracking-normal text-ink-soft">Motivo</FieldLabel>
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        {SAIDA_REASONS.map((r) => {
          const m = REASON_META[r];
          const Icon = m.icon;
          const on = reason === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => {
                setReason(r);
                setRef(null);
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[12px] font-semibold transition-colors",
                on
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-card text-ink-soft hover:border-primary/40",
              )}
            >
              <Icon className="size-3.5" strokeWidth={1.9} />
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-2.5">
        <SmallField label="Quantidade" className="w-[120px] shrink-0">
          <InlineInput value={qty} onChange={setQty} suffix={saidaUnit} inputMode="decimal" red />
        </SmallField>
        {showRef && (
          <SmallField
            label={reason === "VENDA" ? "Pedido vinculado" : "Item produzido"}
            className="min-w-0 flex-1"
          >
            <RefPicker
              reason={reason}
              orders={orders}
              menuProducts={menuProducts}
              value={ref}
              onChange={setRef}
            />
          </SmallField>
        )}
      </div>

      <Button
        onClick={submit}
        disabled={pending}
        className="mt-3 w-full rounded-lg bg-[#c0492f] font-bold hover:bg-[#c0492f]/90"
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        Registrar saída
      </Button>
    </div>
  );
}

/** Searchable order/product reference picker (design's popover over recent options). */
function RefPicker({
  reason,
  orders,
  menuProducts,
  value,
  onChange,
}: {
  reason: StockMovementReason;
  orders: OrderRef[];
  menuProducts: Product[];
  value: { value: string; label: string } | null;
  onChange: (v: { value: string; label: string } | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const options =
    reason === "VENDA"
      ? orders.map((o) => ({ value: o.code, label: `#${o.code} · ${o.customerName}` }))
      : menuProducts.map((p) => ({ value: p.name, label: p.name }));

  const q = query.toLowerCase();
  const shown = options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 6);

  return (
    <div className="relative" ref={boxRef}>
      {open && (
        <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
      )}
      <div className="relative z-20 flex h-10 items-center gap-1.5 rounded-lg border border-[#f1d6ce] bg-white px-2.5">
        <Search className="size-3.5 shrink-0 text-ink-faint" />
        <input
          value={value ? value.label : query}
          onChange={(e) => {
            onChange(null);
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={reason === "VENDA" ? "Buscar pedido…" : "Buscar item…"}
          className="w-full min-w-0 bg-transparent text-[14px] outline-none placeholder:text-ink-faint"
        />
      </div>
      {open && shown.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+5px)] z-20 max-h-44 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-[0_14px_34px_-12px_rgba(21,40,30,.3)]">
          {shown.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o);
                setOpen(false);
              }}
              className="block w-full truncate rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-soft transition-colors hover:bg-accent"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- timeline */

function MovementEditForm({
  storeId,
  item,
  movement,
  onCancel,
  onDone,
}: {
  storeId: string;
  item: StockItem;
  movement: StockMovement;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { unitLabel } = useUnits();
  const [qty, setQty] = useState(String(movement.qty).replace(".", ","));
  const [price, setPrice] = useState(
    movement.price != null ? formatBRL(movement.price).replace("R$", "").trim() : "",
  );
  const [pending, startTransition] = useTransition();
  const isIn = movement.type === "entrada";
  const unit = movement.byPackage
    ? pkgCount(item, movement.qty)
    : item.continuousUse
      ? movement.qty === 1
        ? "uso"
        : "usos"
      : unitLabel(item.unit, movement.qty !== 1);

  function submit() {
    const parsedQty = Number(qty.replace(",", "."));
    if (!parsedQty || parsedQty <= 0) return toast.error("Informe a quantidade.");
    if (movement.byPackage && !Number.isInteger(parsedQty)) {
      return toast.error("Movimentações por embalagem precisam de quantidade inteira.");
    }

    let parsedPrice: number | undefined;
    if (isIn && price.trim()) {
      try {
        parsedPrice = parseBRL(price);
      } catch {
        return toast.error("Preço inválido.");
      }
    }

    startTransition(async () => {
      const result = await updateMovementAction({
        storeId,
        itemId: item.id,
        movementId: movement.id,
        qty: parsedQty,
        byPackage: movement.byPackage,
        price: isIn ? parsedPrice : undefined,
      });
      if (result.ok) {
        toast.success("Movimentação atualizada.");
        onDone();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteMovementAction({
        storeId,
        itemId: item.id,
        movementId: movement.id,
      });
      if (result.ok) {
        toast.success("Movimentação excluída.");
        onDone();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-3.5",
        isIn ? "border-[#cde7d6] bg-[#f4faf5]" : "border-[#f1d6ce] bg-[#fdf5f2]",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-bold text-ink">
            Editar {isIn ? "entrada" : "saída"}
          </p>
          <p className="text-[11px] text-ink-faint">{formatRelative(movement.at)}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
          className="h-8 rounded-lg px-2 text-[12px]"
        >
          Cancelar
        </Button>
      </div>

      <div className="flex gap-2.5">
        <SmallField label="Quantidade" className="flex-1">
          <InlineInput
            value={qty}
            onChange={setQty}
            suffix={unit}
            inputMode={movement.byPackage ? "numeric" : "decimal"}
            green={isIn}
            red={!isIn}
          />
        </SmallField>
        {isIn && (
          <SmallField label="Preço de compra" className="flex-1">
            <InlineInput
              value={price}
              onChange={setPrice}
              prefix="R$"
              inputMode="decimal"
              green
            />
          </SmallField>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="destructive"
          onClick={handleDelete}
          disabled={pending}
          className="flex-1 rounded-lg font-bold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Excluir
        </Button>
        <Button
          onClick={submit}
          disabled={pending}
          className={cn(
            "flex-1 rounded-lg font-bold",
            isIn ? "bg-success hover:bg-success/90" : "bg-[#c0492f] hover:bg-[#c0492f]/90",
          )}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Salvar edição
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- shared */

function FieldLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "mb-2 block text-[11px] font-bold uppercase tracking-wide text-ink-faint",
        className,
      )}
    >
      {children}
    </span>
  );
}

function SmallField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[11px] text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function InlineInput({
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  inputMode,
  green,
  red,
}: {
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  inputMode?: "decimal" | "numeric" | "text";
  green?: boolean;
  red?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-10 items-center gap-1.5 rounded-lg border bg-white px-3",
        green ? "border-[#d6e6ce]" : red ? "border-[#f1d6ce]" : "border-border bg-paper",
      )}
    >
      {prefix && <span className="whitespace-nowrap text-[12.5px] text-ink-faint">{prefix}</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="tabular w-full min-w-0 bg-transparent text-[14px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-faint"
      />
      {suffix && <span className="whitespace-nowrap text-[12.5px] text-ink-faint">{suffix}</span>}
    </div>
  );
}
