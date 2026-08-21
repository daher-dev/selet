"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { addPudimBrindesAction } from "@/actions/pudim";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PRODUCT_CATEGORY_META } from "@/components/category-meta";

interface BrindePickerDialogProps {
  storeId: string;
  products: Product[];
  /** Products already an active (non-archived) brinde — excluded from the list (decision #1: add-only flow). */
  activeBrindeProductIds: Set<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BrindePickerDialog({
  storeId,
  products,
  activeBrindeProductIds,
  open,
  onOpenChange,
}: BrindePickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-md flex-col gap-0 overflow-hidden rounded-2xl p-0">
        {open && (
          <PickerForm
            key="open"
            storeId={storeId}
            products={products}
            activeBrindeProductIds={activeBrindeProductIds}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickerForm({
  storeId,
  products,
  activeBrindeProductIds,
  onClose,
}: {
  storeId: string;
  products: Product[];
  activeBrindeProductIds: Set<string>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  // Starts empty: nothing pre-selected (an add-only flow, not a preload-and-edit list).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const pickable = useMemo(
    () => products.filter((p) => !activeBrindeProductIds.has(p.id)),
    [products, activeBrindeProductIds],
  );

  const q = query.trim().toLowerCase();
  const shown = q ? pickable.filter((p) => p.name.toLowerCase().includes(q)) : pickable;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (selected.size === 0) return;
    startTransition(async () => {
      const result = await addPudimBrindesAction({ storeId, productIds: [...selected] });
      if (result.ok) {
        toast.success(selected.size === 1 ? "Brinde adicionado." : "Brindes adicionados.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <DialogHeader className="flex-shrink-0 gap-0 border-b border-border p-5 pb-4">
        <span className="text-[11px] font-bold uppercase tracking-wide text-leaf">Brindes</span>
        <DialogTitle className="mt-0.5 text-[18px] font-bold">Adicionar do cardápio</DialogTitle>
      </DialogHeader>

      <div className="flex-shrink-0 px-5 pt-4">
        <div className="flex h-11 items-center gap-2.5 rounded-[11px] border border-border px-3">
          <Search className="size-3.5 shrink-0 text-ink-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar produto…"
            className="w-full min-w-0 bg-transparent text-[13.5px] outline-none placeholder:text-ink-faint"
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 py-3.5">
        {shown.map((p) => {
          const meta = PRODUCT_CATEGORY_META[p.category];
          const isSelected = selected.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              aria-pressed={isSelected}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition-colors",
                isSelected
                  ? "border-[1.5px] border-primary bg-mist"
                  : "border-border hover:border-primary/30",
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-md",
                  isSelected ? "bg-primary text-white" : "border-[1.5px] border-border",
                )}
              >
                {isSelected && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  {meta?.label ?? "Sem categoria"}
                </span>
                <span className="mt-0.5 block truncate text-[14px] font-semibold text-ink">
                  {p.name}
                </span>
              </span>
              <span className="shrink-0 text-[12.5px] font-semibold text-ink-faint">
                {formatBRL(p.price)}
              </span>
            </button>
          );
        })}
        {shown.length === 0 && (
          <p className="px-2 py-8 text-center text-[12.5px] text-ink-faint">
            Nenhum produto encontrado.
          </p>
        )}
      </div>

      <div className="flex flex-shrink-0 gap-2.5 border-t border-border p-5">
        <Button variant="outline" onClick={onClose} disabled={pending} className="rounded-lg">
          Cancelar
        </Button>
        <Button
          onClick={submit}
          disabled={pending || selected.size === 0}
          className="flex-1 rounded-lg font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Adicionar {selected.size} {selected.size === 1 ? "brinde" : "brindes"}
        </Button>
      </div>
    </>
  );
}
