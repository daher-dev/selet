"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, Loader2, Package, Plus, Search, Store, Warehouse } from "lucide-react";
import { toast } from "sonner";
import type { StockItem, StockLocation } from "@/lib/types";
import { formatBRL, parseBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { applyMovementAction } from "@/actions/stock";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CategoryTile } from "@/components/category-meta";
import { useStockCategoryMeta, useUnits } from "@/components/stock-settings-context";
import { todayDateInput } from "../financeiro/finance-shared";
import { buildStockCard, pkgCount, pkgPlural } from "./stock-view";

interface Props {
  storeId: string;
  items: StockItem[];
  open: boolean;
  /** Item to start with (opened from an item's sheet); null = pick one. */
  preselectId?: string | null;
  onOpenChange: (open: boolean) => void;
  /** Item not found in the picker → hand off to the full "Cadastrar item" sheet. */
  onCreateNew: () => void;
}

/**
 * Global "Registrar compra" quick-entry (design 3a): pick any tracked item, where
 * the packages go (Depósito or Loja), how many came in, the total paid and the
 * purchase date; the per-package and per-unit cost (what applyMovementAction
 * stores) is derived automatically.
 */
export function RegistrarCompraDialog({ storeId, items, open, preselectId = null, onOpenChange, onCreateNew }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[410px] gap-0 rounded-[18px] p-0 sm:max-w-[410px]">
        <CompraForm
          key={open ? `open-${preselectId ?? ""}` : "closed"}
          storeId={storeId}
          items={items}
          preselectId={preselectId}
          onClose={() => onOpenChange(false)}
          onCreateNew={() => {
            onOpenChange(false);
            onCreateNew();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** "caixa" reads "cx" next to the number; other packages keep their name. */
function pkgAbbrev(label: string): string {
  return label === "caixa" ? "cx" : label;
}

function CompraForm({
  storeId,
  items,
  preselectId,
  onClose,
  onCreateNew,
}: {
  storeId: string;
  items: StockItem[];
  preselectId: string | null;
  onClose: () => void;
  onCreateNew: () => void;
}) {
  const { units, unitLabel } = useUnits();
  const pickable = useMemo(
    () => items.filter((i) => i.tracked && !i.archived),
    [items],
  );
  const [itemId, setItemId] = useState<string | null>(preselectId);
  const [dest, setDest] = useState<StockLocation>("deposito");
  const [qty, setQty] = useState("");
  const [total, setTotal] = useState("");
  const [date, setDate] = useState(() => todayDateInput());
  const [pending, startTransition] = useTransition();

  const selected = pickable.find((i) => i.id === itemId) ?? null;
  const pkgLabel = selected?.pkgLabel ?? "emb.";
  const today = todayDateInput();

  const parsedQty = Number(qty.replace(",", "."));
  let totalCents: number | null = null;
  try {
    totalCents = total.trim() ? parseBRL(total) : null;
  } catch {
    totalCents = null;
  }
  const unitCents =
    totalCents != null && parsedQty > 0 ? Math.round(totalCents / parsedQty) : null;
  // Per countable unit inside a multi-unit package (a caixa of 12 un): what resale margin is measured on.
  const perUnitCents =
    unitCents != null && selected && !selected.continuousUse && (selected.pkgSize ?? 1) > 1
      ? unitCents / (selected.pkgSize ?? 1)
      : null;
  const margin =
    unitCents != null && selected?.resellable && selected.sellPrice
      ? Math.round(((selected.sellPrice - (perUnitCents ?? unitCents)) / selected.sellPrice) * 100)
      : null;

  function submit() {
    if (!selected) return toast.error("Escolha o item.");
    if (!parsedQty || parsedQty <= 0) return toast.error("Informe as embalagens.");
    if (!Number.isInteger(parsedQty)) return toast.error("Informe um número inteiro de embalagens.");
    startTransition(async () => {
      const r = await applyMovementAction({
        storeId,
        itemId: selected.id,
        type: "entrada",
        qty: parsedQty,
        byPackage: true,
        price: unitCents ?? undefined,
        reason: "ENTRADA",
        loc: dest,
        date: date || undefined,
      });
      if (r.ok) {
        toast.success(dest === "deposito" ? "Compra lançada no depósito." : "Compra lançada na loja.");
        onClose();
      } else toast.error(r.error);
    });
  }

  return (
    <>
      <DialogHeader className="gap-0 border-b border-border p-5 pb-4">
        <span className="text-[11px] font-bold uppercase tracking-wide text-leaf">Estoque</span>
        <DialogTitle className="mt-0.5 text-[18px] font-bold">Registrar compra</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4 p-5">
        <div>
          <FieldLabel>Item</FieldLabel>
          <ItemPicker
            items={pickable}
            value={selected}
            onChange={(id) => setItemId(id)}
            onCreateNew={onCreateNew}
            sub={
              selected
                ? [
                    `${selected.pkgLabel}${
                      !selected.continuousUse && (selected.pkgSize ?? 1) > 1
                        ? ` com ${selected.pkgSize} ${unitLabel(selected.unit)}`
                        : ""
                    }`,
                    `loja ${buildStockCard(selected, units).lojaMain}`,
                    `depósito ${selected.depSealed} ${pkgCount(selected, selected.depSealed)}`,
                  ].join(" · ")
                : undefined
            }
          />
        </div>

        <div>
          <FieldLabel>Guardar em</FieldLabel>
          <div role="group" aria-label="Guardar em" className="grid grid-cols-2 gap-2">
            <DestOption
              on={dest === "deposito"}
              onClick={() => setDest("deposito")}
              icon={<Warehouse className="size-3.5 shrink-0 text-depot" strokeWidth={2} />}
              name="Depósito"
              nameClass="text-depot"
              sub="Guarda e repõe a loja depois"
              subClass="text-depot-soft"
              onClass="border-[1.5px] border-depot bg-depot-wash shadow-[0_0_0_3px_var(--color-depot-wash)]"
            />
            <DestOption
              on={dest === "loja"}
              onClick={() => setDest("loja")}
              icon={<Store className="size-3.5 shrink-0 text-primary" strokeWidth={2} />}
              name="Loja"
              nameClass="text-primary"
              sub="Já entra para uso e venda"
              subClass="text-[#3d5a47]"
              onClass="border-[1.5px] border-primary bg-mist shadow-[0_0_0_3px_var(--color-mist)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <FieldLabel>{selected ? pkgPlural(pkgLabel, selected.pkgLabelPlural) : "Embalagens"}</FieldLabel>
            <InlineInput value={qty} onChange={setQty} suffix={pkgAbbrev(pkgLabel)} inputMode="numeric" highlight />
          </label>
          <label className="block">
            <FieldLabel>Custo total</FieldLabel>
            <InlineInput value={total} onChange={setTotal} prefix="R$" inputMode="decimal" />
          </label>
        </div>

        {unitCents != null && (
          <div className="rounded-xl border border-[#ddebd5] bg-[#f3f8ef] px-3.5 py-3">
            <span className="text-[12.5px] leading-[1.45] text-[#3d4a42]">
              {formatBRL(unitCents)} por {pkgLabel}
              {perUnitCents != null && selected && (
                <>
                  {" · "}
                  <strong>
                    {formatBRL(Math.round(perUnitCents))} por {unitLabel(selected.unit)}
                  </strong>
                </>
              )}
              {margin != null && (
                <> · margem de {margin}% no preço atual de {formatBRL(selected!.sellPrice!)}.</>
              )}
            </span>
          </div>
        )}

        <label className="block">
          <FieldLabel>Data da compra</FieldLabel>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="tabular flex h-[46px] w-full items-center rounded-[11px] border border-border bg-paper px-3.5 text-[14px] text-ink outline-none focus:border-primary"
          />
          {date && date !== today && (
            <span className="mt-1.5 block text-[11.5px] leading-snug text-ink-faint">
              Entra no histórico nessa data. Saldos contados depois dela (Ajustar embalagem aberta) prevalecem.
            </span>
          )}
        </label>
      </div>

      <div className="flex gap-2.5 border-t border-border p-5">
        <Button variant="outline" onClick={onClose} disabled={pending} className="h-11 rounded-[11px] px-[18px]">
          Cancelar
        </Button>
        <Button
          onClick={submit}
          disabled={pending || !selected || !parsedQty || !date}
          className="h-11 flex-1 rounded-[11px] font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {dest === "deposito" ? "Lançar no depósito" : "Lançar na loja"}
        </Button>
      </div>
    </>
  );
}

function DestOption({
  on,
  onClick,
  icon,
  name,
  nameClass,
  sub,
  subClass,
  onClass,
}: {
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  name: string;
  nameClass: string;
  sub: string;
  subClass: string;
  onClass: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "block rounded-[11px] px-3 py-[11px] text-left transition-colors",
        on ? onClass : "border border-border bg-white hover:border-primary/30",
      )}
    >
      <span className={cn("flex items-center gap-[7px] text-[13.5px] font-bold", nameClass)}>
        {icon}
        {name}
      </span>
      <span className={cn("mt-[3px] block text-[11.5px]", subClass)}>{sub}</span>
    </button>
  );
}

function ItemPicker({
  items,
  value,
  onChange,
  onCreateNew,
  sub,
}: {
  items: StockItem[];
  value: StockItem | null;
  onChange: (id: string) => void;
  onCreateNew: () => void;
  /** Second line under the selected item's name: its package and where the stock sits. */
  sub?: string;
}) {
  const STOCK_CATEGORY_META = useStockCategoryMeta();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const meta = value ? STOCK_CATEGORY_META[value.category] : null;

  const q = query.trim().toLowerCase();
  const shown = q
    ? items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 6)
    : items.slice(0, 6);

  return (
    <div className="relative" ref={boxRef}>
      {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative z-20 flex min-h-12 w-full items-center gap-2.5 rounded-[11px] border border-border bg-paper px-3 py-1.5 text-left"
      >
        {value && meta ? (
          <CategoryTile meta={meta} className="size-[30px]" />
        ) : (
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-wash text-ink-faint">
            <Package className="size-4" strokeWidth={1.8} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[14px] font-semibold", value ? "text-ink" : "text-ink-faint")}>
            {value ? value.name : "Buscar item…"}
          </span>
          {value && sub && <span className="block truncate text-[11.5px] text-ink-soft">{sub}</span>}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-ink-faint" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-[0_14px_34px_-12px_rgba(21,40,30,.3)]">
          <div className="mb-1 flex items-center gap-1.5 rounded-lg border border-border bg-paper px-2.5 py-1.5">
            <Search className="size-3.5 shrink-0 text-ink-faint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar item…"
              className="w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-ink-faint"
            />
          </div>
          {shown.map((i) => {
            const m = STOCK_CATEGORY_META[i.category];
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => {
                  onChange(i.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
              >
                <CategoryTile meta={m} className="size-7" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">{i.name}</span>
              </button>
            );
          })}
          {shown.length === 0 && (
            <p className="px-2 py-3 text-center text-[12.5px] text-ink-faint">Nenhum item encontrado.</p>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onCreateNew();
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-border px-2 py-2.5 text-left text-[13px] font-semibold text-primary transition-colors hover:bg-mist"
          >
            <Plus className="size-3.5" strokeWidth={2.2} />
            Cadastrar novo item
          </button>
        </div>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-ink-faint">
      {children}
    </span>
  );
}

function InlineInput({
  value,
  onChange,
  prefix,
  suffix,
  inputMode,
  highlight,
}: {
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  inputMode?: "decimal" | "numeric" | "text";
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-[46px] items-center gap-1.5 rounded-[11px] border bg-paper px-3.5",
        highlight ? "border-[1.5px] border-primary bg-white" : "border-border",
      )}
    >
      {prefix && <span className="whitespace-nowrap text-[12.5px] text-ink-faint">{prefix}</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        className="tabular w-full min-w-0 bg-transparent text-[14px] font-bold text-ink outline-none placeholder:font-normal placeholder:text-ink-faint"
      />
      {suffix && <span className="whitespace-nowrap text-[12.5px] text-ink-faint">{suffix}</span>}
    </div>
  );
}
