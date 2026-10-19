"use client";

import { useState, useTransition } from "react";
import { Loader2, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { PudimFlavor, RecipeItem, StockItem } from "@/lib/types";
import { formatQty } from "@/lib/format";
import { createPudimFlavorAction, updatePudimFlavorAction } from "@/actions/pudim";
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

interface FlavorFormSheetProps {
  storeId: string;
  flavor: PudimFlavor | null;
  stockItems: StockItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FlavorFormSheet({
  storeId,
  flavor,
  stockItems,
  open,
  onOpenChange,
}: FlavorFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Sabor de pudim
          </p>
          <SheetTitle className="text-[17px] font-bold">
            {flavor ? flavor.name : "Novo sabor"}
          </SheetTitle>
        </SheetHeader>
        {open && (
          <FlavorForm
            key={flavor?.id ?? "new"}
            storeId={storeId}
            flavor={flavor}
            stockItems={stockItems}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function FlavorForm({
  storeId,
  flavor,
  stockItems,
  onClose,
}: {
  storeId: string;
  flavor: PudimFlavor | null;
  stockItems: StockItem[];
  onClose: () => void;
}) {
  const [name, setName] = useState(flavor?.name ?? "");
  const [price, setPrice] = useState(
    flavor ? String(flavor.price / 100).replace(".", ",") : "",
  );
  const [recipe, setRecipe] = useState<RecipeItem[]>(flavor?.recipe ?? []);
  const [picking, setPicking] = useState(false);
  const [pending, startTransition] = useTransition();

  const priceCentavos = Math.round(parseFloat((price || "0").replace(",", ".")) * 100);

  function addInsumo(item: StockItem) {
    setPicking(false);
    setRecipe((prev) => {
      if (prev.some((r) => r.stockItemId === item.id)) return prev;
      return [...prev, { stockItemId: item.id, name: item.name, qty: 1, unit: item.unit }];
    });
  }

  function changeQty(stockItemId: string | undefined, delta: number) {
    setRecipe((prev) =>
      prev.map((r) =>
        r.stockItemId === stockItemId
          ? { ...r, qty: Math.max(0, (r.qty ?? 0) + delta) }
          : r,
      ),
    );
  }

  function removeInsumo(stockItemId: string | undefined) {
    setRecipe((prev) => prev.filter((r) => r.stockItemId !== stockItemId));
  }

  function submit() {
    // A sabor with no insumo sells normally but silently draws zero stock
    // forever (see actions/pudim.ts's flavorSchema, which enforces the same
    // rule server-side).
    if (recipe.length === 0) {
      toast.error("Adicione ao menos um insumo a este sabor.");
      return;
    }
    const unlinked = recipe.find((r) => !r.stockItemId);
    if (unlinked) {
      toast.error(`"${unlinked.name}" precisa estar vinculado a um item do estoque.`);
      return;
    }
    const data = {
      storeId,
      name,
      price: Number.isFinite(priceCentavos) ? priceCentavos : 0,
      // Narrowed to the action's required-stockItemId shape — a formality for
      // TS, since the checks above already guarantee every row has one.
      recipe: recipe
        .filter((r): r is RecipeItem & { stockItemId: string } => Boolean(r.stockItemId))
        .map((r) => ({
          stockItemId: r.stockItemId,
          name: r.name,
          qty: r.qty,
          unit: r.unit,
        })),
    };
    startTransition(async () => {
      const result = flavor
        ? await updatePudimFlavorAction(flavor.id, { ...data, archived: flavor.archived })
        : await createPudimFlavorAction(data);
      if (result.ok) {
        toast.success(flavor ? "Sabor atualizado." : "Sabor criado.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleArchived() {
    if (!flavor) return;
    startTransition(async () => {
      // A pre-existing flavor saved before insumo links were required (see
      // submit() above) can still have an empty/unlinked recipe — archiving
      // it hits the same server-side guard, surfaced as a toast below, until
      // it's edited with a real insumo.
      const linkedRecipe = flavor.recipe.filter(
        (r): r is RecipeItem & { stockItemId: string } => Boolean(r.stockItemId),
      );
      const result = await updatePudimFlavorAction(flavor.id, {
        storeId,
        name: flavor.name,
        price: flavor.price,
        recipe: linkedRecipe,
        archived: !flavor.archived,
      });
      if (result.ok) {
        toast.success(flavor.archived ? "Sabor restaurado." : "Sabor arquivado.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="flex-1 space-y-5 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="flavor-name">Nome</Label>
            <Input
              id="flavor-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Frutas Amarelas"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="flavor-price">Preço</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-faint">
                R$
              </span>
              <Input
                id="flavor-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="32,00"
                inputMode="decimal"
                className="rounded-xl pl-9 tabular"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Insumos do sabor</Label>
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              className="text-[12px] font-semibold text-primary hover:underline"
            >
              + Insumo
            </button>
          </div>
          {picking && (
            <InsumoPicker stockItems={stockItems} value="" onChange={addInsumo} />
          )}
          {recipe.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-paper px-4 py-4 text-center text-[12px] text-ink-faint">
              Adicione os insumos deste sabor.
            </p>
          ) : (
            <ul className="space-y-2">
              {recipe.map((r) => (
                <li
                  key={r.stockItemId ?? r.name}
                  className="flex items-center gap-3 rounded-xl border border-border bg-paper p-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                    {r.name}
                  </span>
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
                    <button
                      type="button"
                      onClick={() => changeQty(r.stockItemId, -1)}
                      className="flex size-6 items-center justify-center rounded-md text-ink-soft hover:bg-wash hover:text-primary"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="tabular w-16 text-center text-[12px] font-bold text-ink">
                      {formatQty(r.qty ?? 0, r.unit)}
                    </span>
                    <button
                      type="button"
                      onClick={() => changeQty(r.stockItemId, 1)}
                      className="flex size-6 items-center justify-center rounded-md text-ink-soft hover:bg-wash hover:text-primary"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeInsumo(r.stockItemId)}
                    aria-label="Remover insumo"
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-danger-wash hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <SheetFooter className="flex-row gap-2 border-t border-border">
        {flavor && (
          <Button
            variant="outline"
            onClick={toggleArchived}
            disabled={pending}
            className="rounded-xl"
          >
            {flavor.archived ? "Restaurar" : "Arquivar"}
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
          disabled={pending || !name.trim()}
          className="flex-1 rounded-xl font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Salvar sabor
        </Button>
      </SheetFooter>
    </>
  );
}
