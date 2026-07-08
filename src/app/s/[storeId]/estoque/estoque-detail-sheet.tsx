"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ChevronDown,
  Loader2,
  PackagePlus,
  Pencil,
  Search,
  ShoppingBag,
  Trash2,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import type {
  Product,
  StockCategory,
  StockItem,
  StockMovement,
  StockMovementReason,
  StockUnit,
} from "@/lib/types";
import { STOCK_CATEGORIES } from "@/lib/types";
import { formatBRL, formatRelative, formatQty, parseBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  applyMovementAction,
  listMovementsAction,
  markPackageEmptyAction,
  openNextPackageAction,
  updateStockItemAction,
  deleteStockItemAction,
} from "@/actions/stock";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CategoryTile, STOCK_CATEGORY_META } from "@/components/category-meta";
import { isFrac, unitLabel } from "./stock-view";

export interface OrderRef {
  id: string;
  code: string;
  customerName: string;
}

interface Props {
  storeId: string;
  item: StockItem | null;
  orders: OrderRef[];
  menuProducts: Product[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  open,
  onOpenChange,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[520px]"
      >
        {item && (
          <DetailBody
            key={item.id}
            storeId={storeId}
            item={item}
            orders={orders}
            menuProducts={menuProducts}
            onClose={() => onOpenChange(false)}
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
  onClose,
}: {
  storeId: string;
  item: StockItem;
  orders: OrderRef[];
  menuProducts: Product[];
  onClose: () => void;
}) {
  const meta = STOCK_CATEGORY_META[item.category];
  const pu = unitLabel(item.unit);
  const [movements, setMovements] = useState<StockMovement[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mode, setMode] = useState<"none" | "in" | "out">("none");

  useEffect(() => {
    let cancelled = false;
    listMovementsAction(storeId, item.id)
      .then((list) => {
        if (!cancelled) setMovements(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeId, item.id, pending]);

  const embalagem = item.tracked
    ? `${item.pkgLabel ?? "emb."} · ${formatQty(item.pkgSize ?? 0, pu)}`
    : "não embalado · comprado solto";

  return (
    <>
      <SheetHeader className="gap-0 border-b border-border p-5">
        <div className="flex items-center gap-3 pr-8">
          {meta && <CategoryTile meta={meta} className="size-11" />}
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-[18px] font-bold leading-tight">
              {item.name}
            </SheetTitle>
            <p className="mt-0.5 truncate text-[12px] text-ink-faint">
              {meta?.label ?? item.category} · {embalagem}
            </p>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-4 p-5">
        {item.continuousUse && (
          <ContinuoCard storeId={storeId} item={item} pending={pending} startTransition={startTransition} />
        )}

        <EditPanel
          storeId={storeId}
          item={item}
          open={detailsOpen}
          onToggle={() => setDetailsOpen((v) => !v)}
          onClose={onClose}
        />

        <div className="flex items-center gap-2">
          <span className="flex-1 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Movimentações
          </span>
          <SegBtn
            active={mode === "in"}
            onClick={() => setMode((m) => (m === "in" ? "none" : "in"))}
            icon={ArrowDownToLine}
          >
            Entrada
          </SegBtn>
          <SegBtn
            active={mode === "out"}
            onClick={() => setMode((m) => (m === "out" ? "none" : "out"))}
            icon={ArrowUpFromLine}
          >
            Saída
          </SegBtn>
        </div>

        {mode === "in" && (
          <EntradaForm
            storeId={storeId}
            item={item}
            onDone={() => setMode("none")}
          />
        )}
        {mode === "out" && (
          <SaidaForm
            storeId={storeId}
            item={item}
            orders={orders}
            menuProducts={menuProducts}
            onDone={() => setMode("none")}
          />
        )}

        <Timeline movements={movements} item={item} />
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- contínuo */

function ContinuoCard({
  storeId,
  item,
  pending,
  startTransition,
}: {
  storeId: string;
  item: StockItem;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const stateLabel = item.openPkg
    ? `Embalagem aberta · ${item.usos} ${item.usos === 1 ? "uso" : "usos"}`
    : "Nenhuma embalagem aberta";
  const pkg = item.pkgLabel ?? "emb.";
  const sealedLabel = `${item.sealed} ${item.sealed === 1 ? pkg : pkg + "s"} fechada${item.sealed === 1 ? "" : "s"}`;

  function openNext() {
    startTransition(async () => {
      const r = await openNextPackageAction(storeId, item.id);
      if (r.ok) toast.success("Nova embalagem aberta.");
      else toast.error(r.error);
    });
  }
  function markEmpty() {
    startTransition(async () => {
      const r = await markPackageEmptyAction(storeId, item.id);
      if (r.ok) toast.success("Embalagem marcada como vazia.");
      else toast.error(r.error);
    });
  }

  return (
    <div className="rounded-xl border border-border bg-paper p-3.5">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-violet-wash text-violet">
          <Boxes className="size-[18px]" strokeWidth={1.7} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold text-ink">Uso contínuo</span>
          <span className="block text-[11.5px] text-ink-faint">{stateLabel}</span>
        </span>
        <span className="whitespace-nowrap text-[11.5px] font-semibold text-ink-faint">
          {sealedLabel}
        </span>
      </div>
      {item.openPkg ? (
        <Button
          variant="outline"
          onClick={markEmpty}
          disabled={pending}
          className="w-full gap-2 rounded-lg border-[#e7c7bd] bg-[#fcf6f4] font-semibold text-[#c0492f] hover:bg-[#fbece7] hover:text-[#c0492f]"
        >
          <Archive className="size-4" />
          Marcar embalagem como vazia
        </Button>
      ) : item.sealed > 0 ? (
        <Button
          onClick={openNext}
          disabled={pending}
          className="w-full gap-2 rounded-lg font-semibold"
        >
          <PackagePlus className="size-4" />
          Abrir nova embalagem
        </Button>
      ) : (
        <div className="flex h-11 w-full items-center justify-center rounded-lg border border-border bg-wash text-[13px] font-semibold text-ink-faint">
          Sem embalagens em estoque
        </div>
      )}
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
}: {
  storeId: string;
  item: StockItem;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<StockCategory>(item.category);
  const [unit, setUnit] = useState<StockUnit>(item.unit);
  const [continuo, setContinuo] = useState(item.continuousUse);
  const [pkgSize, setPkgSize] = useState(item.pkgSize ? String(item.pkgSize) : "");
  const [reorder, setReorder] = useState(String(item.reorderAt));
  const [pending, startTransition] = useTransition();

  const isCount = unit === "un" || unit === "sache";
  const reorderUnit = item.tracked ? `${item.pkgLabel ?? "emb."}s` : unit;

  function save() {
    startTransition(async () => {
      const r = await updateStockItemAction(item.id, {
        storeId,
        name: item.name,
        category,
        unit,
        tracked: item.tracked,
        pkgLabel: item.pkgLabel,
        pkgSize: pkgSize ? Number(pkgSize.replace(",", ".")) : item.pkgSize,
        continuousUse: continuo,
        consumptionMode: continuo ? "continuo" : "medido",
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
    <div className="overflow-hidden rounded-xl border border-border">
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

      {open && (
        <div className="flex flex-col gap-4 border-t border-border p-3.5">
          <div>
            <FieldLabel>Categoria</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {STOCK_CATEGORIES.map((key) => {
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

          <UnitGroups value={unit} onChange={setUnit} />

          <div>
            <FieldLabel>Baixa no estoque</FieldLabel>
            <Segmented
              options={[
                { value: false, label: "Medição exata" },
                { value: true, label: "Uso contínuo" },
              ]}
              value={continuo}
              onChange={setContinuo}
            />
            <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
              {continuo
                ? "Uso contínuo: sem medição — baixa manual por embalagem."
                : "Medição exata: deduz a quantidade usada a cada preparo."}
            </p>
          </div>

          {isCount && (
            <div>
              <FieldLabel>Lote</FieldLabel>
              <InlineInput
                value={pkgSize}
                onChange={setPkgSize}
                suffix={`${unitLabel(unit)} / ${item.pkgLabel ?? "caixa"}`}
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

          <Button onClick={save} disabled={pending} className="w-full rounded-lg font-semibold">
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
              onClick={remove}
              disabled={pending}
              className="flex-1 gap-1.5 rounded-lg text-[12.5px] text-destructive hover:bg-danger-wash hover:text-destructive"
            >
              <Trash2 className="size-4" />
              Remover
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- entrada/saída */

function EntradaForm({
  storeId,
  item,
  onDone,
}: {
  storeId: string;
  item: StockItem;
  onDone: () => void;
}) {
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
  const [reason, setReason] = useState<StockMovementReason>("AJUSTE");
  const [qty, setQty] = useState("");
  const [ref, setRef] = useState<{ value: string; label: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const byPackage = item.continuousUse || !isFrac(item);
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

function Timeline({
  movements,
  item,
}: {
  movements: StockMovement[] | null;
  item: StockItem;
}) {
  if (!movements || movements.length === 0) return null;
  return (
    <div className="flex flex-col">
      {movements.map((m) => {
        const isIn = m.type === "entrada";
        const reasonKey = m.reason ?? (isIn ? "ENTRADA" : "SAIDA");
        const rm = REASON_META[reasonKey] ?? REASON_META.AJUSTE;
        const Icon = rm.icon;
        const refTxt = m.refOrder
          ? `Pedido #${m.refOrder}`
          : m.refItem && m.refItem !== "—"
            ? m.refItem
            : "";
        // contínuo items measure loose movements in uses, not base units.
        const unit = m.byPackage
          ? `${item.pkgLabel ?? "emb."}${m.qty === 1 ? "" : "s"}`
          : item.continuousUse
            ? m.qty === 1
              ? "uso"
              : "usos"
            : unitLabel(item.unit, m.qty !== 1);
        return (
          <div
            key={m.id}
            className="flex items-center gap-3 border-t border-border/70 py-3 first:border-t-0"
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                isIn ? "bg-mint-wash text-success" : "bg-danger-wash text-destructive",
              )}
            >
              <Icon className="size-[15px]" strokeWidth={1.9} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10.5px] font-bold",
                    rm.bg,
                    rm.fg,
                  )}
                >
                  {rm.label}
                </span>
                {refTxt && (
                  <span className="truncate text-[12px] text-ink-soft">{refTxt}</span>
                )}
              </span>
              <span className="mt-1 block text-[11px] text-ink-faint">
                {formatRelative(m.at)}
                {isIn && m.price != null && <> · {formatBRL(m.price)}</>}
              </span>
            </span>
            <span
              className={cn(
                "tabular shrink-0 whitespace-nowrap text-[14px] font-extrabold",
                isIn ? "text-success" : "text-destructive",
              )}
            >
              {isIn ? "+" : "−"}
              {formatQty(m.qty, unit)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- shared */

function SegBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-white"
          : "border-border bg-card text-ink-soft hover:border-primary/40",
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  );
}

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
  inputMode,
  green,
  red,
}: {
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
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
        inputMode={inputMode}
        className="tabular w-full min-w-0 bg-transparent text-[14px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-faint"
      />
      {suffix && <span className="whitespace-nowrap text-[12.5px] text-ink-faint">{suffix}</span>}
    </div>
  );
}

function UnitGroups({
  value,
  onChange,
}: {
  value: StockUnit;
  onChange: (u: StockUnit) => void;
}) {
  const groups: StockUnit[][] = [
    ["un", "sache"],
    ["g", "kg"],
    ["ml", "L"],
  ];
  return (
    <div>
      <FieldLabel>Unidade de uso</FieldLabel>
      <div className="flex gap-2">
        {groups.map((group, gi) => (
          <div
            key={gi}
            className="flex flex-1 gap-0.5 rounded-lg border border-border bg-surface p-0.5"
          >
            {group.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => onChange(u)}
                className={cn(
                  "flex-1 rounded-md py-2 text-[12.5px] font-semibold transition-colors",
                  value === u ? "bg-primary text-white" : "text-ink-soft hover:text-ink",
                )}
              >
                {unitLabel(u)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Segmented<T extends string | boolean>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-border bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-md py-2 text-[12.5px] font-semibold transition-colors",
            value === o.value ? "bg-primary text-white" : "text-ink-soft hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
