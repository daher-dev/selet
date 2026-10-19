"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ShakeBase, StockItem } from "@/lib/types";
import { createShakeBaseAction, updateShakeBaseAction } from "@/actions/shakes";
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

interface BaseFormSheetProps {
  storeId: string;
  base: ShakeBase | null;
  stockItems: StockItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BaseFormSheet({
  storeId,
  base,
  stockItems,
  open,
  onOpenChange,
}: BaseFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Base do shake
          </p>
          <SheetTitle className="text-[17px] font-bold">
            {base ? base.name : "Nova base"}
          </SheetTitle>
        </SheetHeader>
        {open && (
          <BaseForm
            key={base?.id ?? "new"}
            storeId={storeId}
            base={base}
            stockItems={stockItems}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function BaseForm({
  storeId,
  base,
  stockItems,
  onClose,
}: {
  storeId: string;
  base: ShakeBase | null;
  stockItems: StockItem[];
  onClose: () => void;
}) {
  const [name, setName] = useState(base?.name ?? "");
  const [stockItemId, setStockItemId] = useState(base?.insumo.stockItemId ?? "");
  const [qty, setQty] = useState(base?.insumo.qty ? String(base.insumo.qty) : "");
  const [price, setPrice] = useState(
    base ? String(base.price / 100).replace(".", ",") : "0",
  );
  const [pending, startTransition] = useTransition();

  const priceCentavos = Math.round(parseFloat((price || "0").replace(",", ".")) * 100);

  function submit() {
    const data = {
      storeId,
      name,
      insumo: { stockItemId, qty: qty.trim() ? Number(qty) : null },
      price: Number.isFinite(priceCentavos) ? priceCentavos : 0,
    };
    startTransition(async () => {
      const result = base
        ? await updateShakeBaseAction(base.id, { ...data, archived: base.archived })
        : await createShakeBaseAction(data);
      if (result.ok) {
        toast.success(base ? "Base atualizada." : "Base criada.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleArchived() {
    if (!base) return;
    startTransition(async () => {
      const result = await updateShakeBaseAction(base.id, {
        storeId,
        name: base.name,
        insumo: { stockItemId: base.insumo.stockItemId ?? "", qty: base.insumo.qty },
        price: base.price,
        archived: !base.archived,
      });
      if (result.ok) {
        toast.success(base.archived ? "Base restaurada." : "Base arquivada.");
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
          <Label htmlFor="base-name">Nome</Label>
          <Input
            id="base-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Leite + NutreV"
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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="base-qty">Quantidade por shake</Label>
            <Input
              id="base-qty"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="150"
              inputMode="decimal"
              className="rounded-xl tabular"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="base-price">Acréscimo no preço</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-faint">
                R$
              </span>
              <Input
                id="base-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                className="rounded-xl pl-9 tabular"
              />
            </div>
          </div>
        </div>
        <p className="-mt-3 text-[11.5px] text-ink-faint">
          Deixe R$ 0,00 se a base já está no preço do sabor.
        </p>
      </div>

      <SheetFooter className="flex-row gap-2 border-t border-border">
        {base && (
          <Button
            variant="outline"
            onClick={toggleArchived}
            disabled={pending}
            className="rounded-xl"
          >
            {base.archived ? "Restaurar" : "Arquivar"}
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
          disabled={pending || !name.trim() || !stockItemId}
          className="flex-1 rounded-xl font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {base ? "Salvar base" : "Criar base"}
        </Button>
      </SheetFooter>
    </>
  );
}
