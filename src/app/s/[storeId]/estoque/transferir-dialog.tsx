"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowRight, Loader2, Plus, Sparkles, Store, Warehouse } from "lucide-react";
import { toast } from "sonner";
import type { StockItem } from "@/lib/types";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { transferToStoreAction } from "@/actions/stock";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useUnits } from "@/components/stock-settings-context";
import { minimumLabel, pkgCount, stockStatus, suggestTransferQty } from "./stock-view";

interface Props {
  storeId: string;
  storeName: string;
  items: StockItem[];
  open: boolean;
  /** Item to start with (from a card's Depósito row or the item sheet); null = just the suggestions. */
  preselectId: string | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Transferir para a loja" (design 3b): moves sealed packages Depósito → Loja.
 * Items already below the Loja's minimum come as suggestions that must be
 * accepted or discarded, with how many packages it takes to clear the minimum.
 */
export function TransferirDialog({ storeId, storeName, items, open, preselectId, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden p-0 data-[side=right]:sm:max-w-[480px]"
      >
        {open && (
          <TransferForm
            // a different preselection starts a fresh draft
            key={preselectId ?? "none"}
            storeId={storeId}
            storeName={storeName}
            items={items}
            preselectId={preselectId}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

interface Line {
  itemId: string;
  qty: number;
}

function TransferForm({
  storeId,
  storeName,
  items,
  preselectId,
  onClose,
}: {
  storeId: string;
  storeName: string;
  items: StockItem[];
  preselectId: string | null;
  onClose: () => void;
}) {
  const { unitLabel } = useUnits();
  const eligible = useMemo(() => items.filter((i) => i.tracked && !i.archived && i.depSealed > 0), [items]);
  const byId = useMemo(() => new Map(eligible.map((i) => [i.id, i])), [eligible]);

  const [lines, setLines] = useState<Line[]>(() => {
    const pre = preselectId ? eligible.find((i) => i.id === preselectId) : undefined;
    return pre ? [{ itemId: pre.id, qty: suggestTransferQty(pre) }] : [];
  });
  const [discarded, setDiscarded] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const inLines = new Set(lines.map((l) => l.itemId));
  const suggestions = eligible.filter(
    (i) => !inLines.has(i.id) && !discarded.includes(i.id) && ["repor", "esgotado"].includes(stockStatus(i)),
  );
  const addable = eligible.filter((i) => !inLines.has(i.id));

  const setQty = (itemId: string, qty: number) =>
    setLines((ls) => ls.map((l) => (l.itemId === itemId ? { ...l, qty } : l)));

  const ready = suggestions.length === 0 && lines.length > 0;
  const cta = suggestions.length
    ? `Revise ${suggestions.length} ${suggestions.length === 1 ? "sugestão" : "sugestões"}`
    : lines.length
      ? `Transferir ${lines.length} ${lines.length === 1 ? "item" : "itens"}`
      : "Escolha um item";

  /** Loja amount in the terms people count it: base units for multi-unit packages, else packages. */
  function lojaAfter(item: StockItem, extra: number): string {
    const un = (n: number) => unitLabel(item.unit, n !== 1);
    if (!item.continuousUse && (item.pkgSize ?? 1) > 1) {
      return formatQty(item.qty + extra * (item.pkgSize ?? 1), un(item.qty + extra * (item.pkgSize ?? 1)));
    }
    return `${item.sealed + extra} ${pkgCount(item, item.sealed + extra)}`;
  }
  function lojaBefore(item: StockItem): string {
    if (!item.continuousUse && (item.pkgSize ?? 1) > 1) return String(item.qty);
    return String(item.sealed);
  }
  function why(item: StockItem): { text: string; cls: string } {
    const st = stockStatus(item);
    if (st === "esgotado") return { text: `Esgotado na loja · mínimo ${minimumLabel(item, unitLabel)}`, cls: "text-[#b23a22]" };
    if (st === "repor") return { text: `Abaixo do mínimo · mínimo ${minimumLabel(item, unitLabel)}`, cls: "text-[#8a5a0f]" };
    return { text: `${lojaAfter(item, 0)} na loja · mínimo ${minimumLabel(item, unitLabel)}`, cls: "text-ink-soft" };
  }

  function submit() {
    startTransition(async () => {
      const r = await transferToStoreAction({ storeId, lines, note: note.trim() || undefined });
      if (r.ok) {
        toast.success(`Transferência ${r.trCode} registrada.`);
        onClose();
      } else toast.error(r.error);
    });
  }

  return (
    <>
      <SheetHeader className="shrink-0 gap-0 border-b border-border/70 px-5 pb-4 pt-[18px]">
        <div className="pr-8">
          <span className="block text-[11px] font-bold uppercase tracking-[.5px] text-depot">{storeName}</span>
          <SheetTitle className="mt-0.5 text-[18px] font-bold">Transferir para a loja</SheetTitle>
        </div>
        <div className="mt-3.5 flex items-center gap-2.5">
          <span className="flex h-10 flex-1 items-center gap-2 rounded-[10px] bg-depot-wash px-3 text-[13px] font-bold text-depot">
            <Warehouse className="size-[13px] shrink-0" strokeWidth={2} />
            Depósito
          </span>
          <ArrowRight className="size-[18px] shrink-0 text-ink-soft" strokeWidth={2} aria-hidden />
          <span className="flex h-10 flex-1 items-center gap-2 rounded-[10px] bg-mist px-3 text-[13px] font-bold text-primary">
            <Store className="size-[13px] shrink-0" strokeWidth={2} />
            Loja
          </span>
        </div>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-4">
        {lines.map((line) => {
          const item = byId.get(line.itemId);
          if (!item) return null;
          const w = why(item);
          const unit = pkgCount(item, line.qty);
          const dep = item.depSealed;
          return (
            <div key={line.itemId} className="rounded-[13px] border border-border p-3.5">
              <div className="flex items-center gap-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">{item.name}</span>
                  <span className={cn("mt-px block text-[11.5px]", w.cls)}>{w.text}</span>
                </span>
                <div className="flex items-center gap-1">
                  <StepButton
                    label={`Menos ${unit}`}
                    disabled={line.qty <= 1}
                    onClick={() => setQty(line.itemId, Math.max(1, line.qty - 1))}
                  >
                    −
                  </StepButton>
                  <span className="min-w-[62px] text-center">
                    <span className="tabular block text-[16px] font-bold">{line.qty}</span>
                    <span className="block text-[10.5px] text-ink-soft">{unit}</span>
                  </span>
                  <StepButton
                    label={`Mais ${unit}`}
                    disabled={line.qty >= dep}
                    onClick={() => setQty(line.itemId, Math.min(dep, line.qty + 1))}
                  >
                    +
                  </StepButton>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="rounded-[7px] bg-depot-wash px-[9px] py-1 font-semibold text-depot">
                  Depósito {dep} → {dep - line.qty} {pkgCount(item, dep - line.qty)}
                </span>
                <span className="rounded-[7px] bg-mist px-[9px] py-1 font-semibold text-primary">
                  Loja {lojaBefore(item)} → {lojaAfter(item, line.qty)}
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => setLines((ls) => ls.filter((l) => l.itemId !== line.itemId))}
                  className="h-7 rounded-md px-2 text-[12px] font-semibold text-ink-soft underline"
                >
                  Remover
                </button>
              </div>
            </div>
          );
        })}

        {suggestions.length > 0 && (
          <span className="mt-1.5 flex items-center gap-[7px] text-[11px] font-bold uppercase tracking-[.5px] text-[#8a5a0f]">
            <Sparkles className="size-[13px]" strokeWidth={2} aria-hidden />
            Sugestões · abaixo do mínimo na loja
          </span>
        )}
        {suggestions.map((item) => {
          const w = why(item);
          const qty = suggestTransferQty(item);
          return (
            <div key={item.id} className="rounded-[13px] border border-dashed border-[#e3c98d] bg-[#fffcf5] px-3.5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">{item.name}</span>
                  <span className={cn("mt-px block text-[11.5px]", w.cls)}>{w.text}</span>
                </span>
                <span className="shrink-0 text-[13px] font-bold text-[#5c4a1e]">
                  {qty} {pkgCount(item, qty)}
                </span>
              </div>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setDiscarded((d) => [...d, item.id])}
                  className="h-9 flex-1 rounded-[9px] border border-border bg-white text-[12.5px] font-semibold text-[#3d4a42]"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={() => setLines((ls) => [...ls, { itemId: item.id, qty }])}
                  className="h-9 flex-1 rounded-[9px] bg-depot text-[12.5px] font-semibold text-white"
                >
                  Incluir na transferência
                </button>
              </div>
            </div>
          );
        })}

        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={addable.length === 0}
            className="flex h-11 items-center justify-center gap-[7px] rounded-xl border border-dashed border-[#b9c9d6] bg-white text-[13px] font-semibold text-depot outline-none transition-colors hover:bg-depot-wash disabled:opacity-50"
          >
            <Plus className="size-3.5" strokeWidth={2.2} />
            Adicionar item do depósito
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="max-h-64 min-w-64 overflow-y-auto">
            {addable.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onSelect={() => setLines((ls) => [...ls, { itemId: item.id, qty: 1 }])}
              >
                {item.name}
                <span className="ml-auto text-[11.5px] text-ink-soft">
                  {item.depSealed} {pkgCount(item, item.depSealed)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <label className="mt-1 block">
          <span className="mb-[7px] block text-[11px] font-bold uppercase tracking-[.4px] text-ink-soft">
            Observação <span className="font-medium normal-case tracking-normal">(opcional)</span>
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="Ex: reposição de terça"
            className="h-11 w-full rounded-[11px] border border-border bg-white px-3.5 text-[13.5px] text-ink outline-none placeholder:text-ink-faint focus:border-primary"
          />
        </label>
        <span className="text-[11.5px] leading-[1.45] text-ink-soft">
          Cada transferência entra nas movimentações dos dois lados com o mesmo número (ex.: TR-0088), e quem fez fica
          registrado.
        </span>
      </div>

      <div className="flex shrink-0 gap-2.5 border-t border-border/70 px-5 py-3.5">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={pending}
          className="h-[46px] rounded-[11px] bg-white px-[18px] text-[13.5px] font-semibold text-ink-soft"
        >
          Cancelar
        </Button>
        <Button
          onClick={submit}
          disabled={pending || !ready}
          className="h-[46px] flex-1 gap-2 rounded-[11px] bg-depot text-[13.5px] font-semibold text-white hover:bg-depot/90"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {cta}
        </Button>
      </div>
    </>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-border bg-white text-[17px] text-ink-soft transition-colors hover:border-primary/40 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
