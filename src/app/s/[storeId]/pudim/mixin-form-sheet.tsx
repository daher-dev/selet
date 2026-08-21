"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { PriceTier, PudimMixin, StockItem } from "@/lib/types";
import { formatBRL } from "@/lib/format";
import {
  createPudimMixinAction,
  updatePudimMixinAction,
  type TieredModifierFormInput,
} from "@/actions/pudim";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { InsumoPicker } from "./insumo-picker";

interface MixinFormSheetProps {
  storeId: string;
  modifier: PudimMixin | null;
  stockItems: StockItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MixinFormSheet({
  storeId,
  modifier,
  stockItems,
  open,
  onOpenChange,
}: MixinFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Adicional do pudim
          </p>
          <SheetTitle className="text-[17px] font-bold">
            {modifier ? modifier.name : "Novo adicional"}
          </SheetTitle>
        </SheetHeader>
        {open && (
          <MixinForm
            key={modifier?.id ?? "new"}
            storeId={storeId}
            modifier={modifier}
            stockItems={stockItems}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function MixinForm({
  storeId,
  modifier,
  stockItems,
  onClose,
}: {
  storeId: string;
  modifier: PudimMixin | null;
  stockItems: StockItem[];
  onClose: () => void;
}) {
  const [name, setName] = useState(modifier?.name ?? "");
  const [stockItemId, setStockItemId] = useState(modifier?.insumo.stockItemId ?? "");
  const [qty, setQty] = useState(modifier?.insumo.qty ? String(modifier.insumo.qty) : "");
  const [tiers, setTiers] = useState<PriceTier[]>(
    modifier?.tiers ?? [{ qty: 1, price: 0 }],
  );
  const [pending, startTransition] = useTransition();

  function addTier() {
    setTiers((prev) => [...prev, { qty: prev.length + 1, price: 0 }]);
  }
  function removeTier(index: number) {
    setTiers((prev) => prev.filter((_, i) => i !== index));
  }
  function updateTier(index: number, patch: Partial<PriceTier>) {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function submit() {
    const data: TieredModifierFormInput = {
      storeId,
      name,
      insumo: { stockItemId, qty: qty.trim() ? Number(qty) : null },
      tiers,
    };
    startTransition(async () => {
      const result = modifier
        ? await updatePudimMixinAction(modifier.id, { ...data, archived: modifier.archived })
        : await createPudimMixinAction(data);
      if (result.ok) {
        toast.success(modifier ? "Atualizado." : "Criado.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleArchived() {
    if (!modifier) return;
    startTransition(async () => {
      const data: TieredModifierFormInput = {
        storeId,
        name: modifier.name,
        insumo: {
          stockItemId: modifier.insumo.stockItemId ?? "",
          qty: modifier.insumo.qty,
        },
        tiers: modifier.tiers,
        archived: !modifier.archived,
      };
      const result = await updatePudimMixinAction(modifier.id, data);
      if (result.ok) {
        toast.success(modifier.archived ? "Restaurado." : "Arquivado.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="flex-1 space-y-5 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="mod-name">Nome</Label>
          <Input
            id="mod-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fibra Ativa"
            className="rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Insumo do estoque</Label>
          <InsumoPicker
            stockItems={stockItems}
            value={stockItemId}
            onChange={(item) => setStockItemId(item.id)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mod-qty">Quantidade por pudim</Label>
          <Input
            id="mod-qty"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="20"
            inputMode="decimal"
            className="w-32 rounded-xl tabular"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Faixas de preço</Label>
            <button
              type="button"
              onClick={addTier}
              className="flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
            >
              <Plus className="size-3.5" />
              Faixa
            </button>
          </div>
          <ul className="space-y-2">
            {tiers.map((tier, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-xl border border-border bg-paper p-2.5"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-mist text-[12px] font-bold text-primary">
                  {tier.qty}×
                </span>
                <Input
                  value={tier.qty}
                  onChange={(e) =>
                    updateTier(i, { qty: Math.max(1, Number(e.target.value) || 1) })
                  }
                  inputMode="numeric"
                  className="w-16 rounded-lg tabular"
                />
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-ink-faint">
                    R$
                  </span>
                  <Input
                    value={(tier.price / 100).toFixed(2).replace(".", ",")}
                    onChange={(e) => {
                      const v = Math.round(
                        parseFloat(e.target.value.replace(",", ".")) * 100,
                      );
                      updateTier(i, { price: Number.isFinite(v) ? v : 0 });
                    }}
                    inputMode="decimal"
                    className="rounded-lg pl-9 tabular"
                  />
                </div>
                <span className="tabular hidden text-[11.5px] text-ink-faint sm:inline">
                  {formatBRL(tier.price)}
                </span>
                {tiers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTier(i)}
                    aria-label="Remover faixa"
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-danger-wash hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <SheetFooter className="flex-row gap-2 border-t border-border">
        {modifier && (
          <Button
            variant="outline"
            onClick={toggleArchived}
            disabled={pending}
            className="rounded-xl"
          >
            {modifier.archived ? "Restaurar" : "Arquivar"}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={onClose}
          disabled={pending}
          className="flex-1 rounded-xl"
        >
          Cancelar
        </Button>
        <Button
          onClick={submit}
          disabled={pending || !name.trim() || !stockItemId || tiers.length === 0}
          className="flex-1 rounded-xl font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {modifier ? "Salvar" : "Criar adicional"}
        </Button>
      </SheetFooter>
    </>
  );
}
