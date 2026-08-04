"use client";

import { useState, useTransition } from "react";
import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ShakeUtensil, StockItem } from "@/lib/types";
import { createShakeUtensilAction, updateShakeUtensilAction } from "@/actions/shakes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { InsumoPicker } from "./insumo-picker";

interface UtensilFormSheetProps {
  storeId: string;
  utensil: ShakeUtensil | null;
  stockItems: StockItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UtensilFormSheet({
  storeId,
  utensil,
  stockItems,
  open,
  onOpenChange,
}: UtensilFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Utensílio do shake
          </p>
          <SheetTitle className="text-[17px] font-bold">
            {utensil ? utensil.name : "Novo utensílio"}
          </SheetTitle>
        </SheetHeader>
        {open && (
          <UtensilForm
            key={utensil?.id ?? "new"}
            storeId={storeId}
            utensil={utensil}
            stockItems={stockItems}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function UtensilForm({
  storeId,
  utensil,
  stockItems,
  onClose,
}: {
  storeId: string;
  utensil: ShakeUtensil | null;
  stockItems: StockItem[];
  onClose: () => void;
}) {
  const [name, setName] = useState(utensil?.name ?? "");
  const [stockItemId, setStockItemId] = useState(utensil?.insumo.stockItemId ?? "");
  const [qty, setQty] = useState(utensil?.insumo.qty ? String(utensil.insumo.qty) : "1");
  const [defaultIncluded, setDefaultIncluded] = useState(
    utensil?.defaultIncluded ?? true,
  );
  const [pending, startTransition] = useTransition();

  function submit() {
    const data = {
      storeId,
      name,
      insumo: { stockItemId, qty: qty.trim() ? Number(qty) : null },
      defaultIncluded,
    };
    startTransition(async () => {
      const result = utensil
        ? await updateShakeUtensilAction(utensil.id, { ...data, archived: utensil.archived })
        : await createShakeUtensilAction(data);
      if (result.ok) {
        toast.success(utensil ? "Utensílio atualizado." : "Utensílio criado.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleArchived() {
    if (!utensil) return;
    startTransition(async () => {
      const result = await updateShakeUtensilAction(utensil.id, {
        storeId,
        name: utensil.name,
        insumo: {
          stockItemId: utensil.insumo.stockItemId ?? "",
          qty: utensil.insumo.qty,
        },
        defaultIncluded: utensil.defaultIncluded,
        archived: !utensil.archived,
      });
      if (result.ok) {
        toast.success(utensil.archived ? "Utensílio restaurado." : "Utensílio arquivado.");
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
          <Label htmlFor="utensil-name">Nome</Label>
          <Input
            id="utensil-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Copo 500 ml"
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
          <Label htmlFor="utensil-qty">Quantidade por shake</Label>
          <Input
            id="utensil-qty"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="1"
            inputMode="numeric"
            className="w-32 rounded-xl tabular"
          />
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-mint-wash bg-mist px-3.5 py-3">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-[12px] text-ink-soft">
            Sem acréscimo: utensílios não aparecem no pedido nem somam ao total.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-3">
          <div>
            <p className="text-[13px] font-semibold text-ink">Padrão em todo shake</p>
            <p className="mt-0.5 text-[11.5px] text-ink-faint">
              Desligue para usar só quando o atendente pedir.
            </p>
          </div>
          <Switch checked={defaultIncluded} onCheckedChange={setDefaultIncluded} />
        </div>
      </div>

      <SheetFooter className="flex-row gap-2 border-t border-border">
        {utensil && (
          <Button
            variant="outline"
            onClick={toggleArchived}
            disabled={pending}
            className="rounded-xl"
          >
            {utensil.archived ? "Restaurar" : "Arquivar"}
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
          {utensil ? "Salvar utensílio" : "Criar utensílio"}
        </Button>
      </SheetFooter>
    </>
  );
}
