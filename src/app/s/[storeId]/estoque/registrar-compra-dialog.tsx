"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, Loader2, Package, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { StockItem } from "@/lib/types";
import { formatBRL, parseBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { applyMovementAction } from "@/actions/stock";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CategoryTile, STOCK_CATEGORY_META } from "@/components/category-meta";

interface Props {
  storeId: string;
  items: StockItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Insumo not found in the picker → hand off to the full "Cadastrar item" sheet. */
  onCreateNew: () => void;
}

/**
 * Global "Registrar compra" quick-entry: pick any tracked insumo, log how
 * many embalagens came in and the total paid, and we derive the per-package
 * cost (what applyMovementAction actually stores) automatically.
 */
export function RegistrarCompraDialog({ storeId, items, open, onOpenChange, onCreateNew }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm gap-0 rounded-2xl p-0">
        <CompraForm
          key={open ? "open" : "closed"}
          storeId={storeId}
          items={items}
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

function CompraForm({
  storeId,
  items,
  onClose,
  onCreateNew,
}: {
  storeId: string;
  items: StockItem[];
  onClose: () => void;
  onCreateNew: () => void;
}) {
  const pickable = useMemo(
    () => items.filter((i) => i.tracked && !i.archived),
    [items],
  );
  const [itemId, setItemId] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [total, setTotal] = useState("");
  const [pending, startTransition] = useTransition();

  const selected = pickable.find((i) => i.id === itemId) ?? null;
  const pkgLabel = selected?.pkgLabel ?? "emb.";

  const parsedQty = Number(qty.replace(",", "."));
  let totalCents: number | null = null;
  try {
    totalCents = total.trim() ? parseBRL(total) : null;
  } catch {
    totalCents = null;
  }
  const unitCents =
    totalCents != null && parsedQty > 0 ? Math.round(totalCents / parsedQty) : null;
  const margin =
    unitCents != null && selected?.resellable && selected.sellPrice
      ? Math.round(((selected.sellPrice - unitCents) / selected.sellPrice) * 100)
      : null;

  function submit() {
    if (!selected) return toast.error("Escolha o insumo.");
    if (!parsedQty || parsedQty <= 0) return toast.error("Informe as embalagens.");
    startTransition(async () => {
      const r = await applyMovementAction({
        storeId,
        itemId: selected.id,
        type: "entrada",
        qty: parsedQty,
        byPackage: true,
        price: unitCents ?? undefined,
        reason: "ENTRADA",
      });
      if (r.ok) {
        toast.success("Entrada registrada.");
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
          <FieldLabel>Insumo</FieldLabel>
          <ItemPicker
            items={pickable}
            value={selected}
            onChange={(id) => setItemId(id)}
            onCreateNew={onCreateNew}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <FieldLabel>Embalagens</FieldLabel>
            <InlineInput value={qty} onChange={setQty} suffix={`${pkgLabel}(s)`} inputMode="decimal" highlight />
          </div>
          <div>
            <FieldLabel>Custo total</FieldLabel>
            <InlineInput value={total} onChange={setTotal} prefix="R$" inputMode="decimal" />
          </div>
        </div>

        {unitCents != null && (
          <div className="rounded-xl border border-[#dcebd5] bg-surface px-3.5 py-3">
            <span className="text-[12.5px] leading-snug text-ink">
              Custo unitário <strong>{formatBRL(unitCents)}</strong>
              {margin != null && (
                <> · margem de {margin}% no preço atual de {formatBRL(selected!.sellPrice!)}.</>
              )}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-2.5 border-t border-border p-5">
        <Button variant="outline" onClick={onClose} disabled={pending} className="rounded-lg">
          Cancelar
        </Button>
        <Button
          onClick={submit}
          disabled={pending || !selected || !parsedQty}
          className="flex-1 rounded-lg font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Lançar entrada
        </Button>
      </div>
    </>
  );
}

function ItemPicker({
  items,
  value,
  onChange,
  onCreateNew,
}: {
  items: StockItem[];
  value: StockItem | null;
  onChange: (id: string) => void;
  onCreateNew: () => void;
}) {
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
        className="relative z-20 flex h-12 w-full items-center gap-2.5 rounded-[11px] border border-border bg-paper px-3 text-left"
      >
        {value && meta ? (
          <CategoryTile meta={meta} className="size-[30px]" />
        ) : (
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-wash text-ink-faint">
            <Package className="size-4" strokeWidth={1.8} />
          </span>
        )}
        <span className={cn("flex-1 truncate text-[14px] font-semibold", value ? "text-ink" : "text-ink-faint")}>
          {value ? value.name : "Buscar insumo…"}
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
              placeholder="Buscar insumo…"
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
            <p className="px-2 py-3 text-center text-[12.5px] text-ink-faint">Nenhum insumo encontrado.</p>
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
