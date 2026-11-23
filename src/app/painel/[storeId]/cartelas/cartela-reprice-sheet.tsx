"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { Cartela } from "@/lib/types";
import { remainingUses } from "@/lib/cartelas";
import { formatBRL, parseBRL } from "@/lib/format";
import { repriceCartelaAction } from "@/actions/cartelas";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CartelaRepriceSheetProps {
  storeId: string;
  cartela: Cartela | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function safeParseBRL(input: string): number {
  try {
    return Math.max(0, parseBRL(input));
  } catch {
    return 0;
  }
}

/** Drawer opened from the history sheet's "Reajustar valor do uso": changes the value of the PENDING uses only; past uses keep the old value. */
export function CartelaRepriceSheet({
  storeId,
  cartela,
  open,
  onOpenChange,
}: CartelaRepriceSheetProps) {
  const [valueInput, setValueInput] = useState("");
  const [pending, startTransition] = useTransition();

  const next = safeParseBRL(valueInput);
  const remaining = cartela ? remainingUses(cartela) : 0;
  const canConfirm = !!cartela && next > 0 && next !== cartela.unitValue;

  function close() {
    onOpenChange(false);
    setValueInput("");
  }

  function confirm() {
    if (!cartela || !canConfirm) return;
    startTransition(async () => {
      const result = await repriceCartelaAction({
        storeId,
        cartelaId: cartela.id,
        unitValue: next,
      });
      if (result.ok) {
        toast.success("Valor do uso reajustado.");
        close();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        {cartela && (
          <>
            <SheetHeader className="shrink-0 border-b border-muted p-5 pb-4">
              <SheetTitle className="text-[17px] font-bold">Reajustar valor do uso</SheetTitle>
              <span className="mt-0.5 block text-[12.5px] text-ink-faint">
                #{cartela.code} · {cartela.customerName} · {remaining} uso
                {remaining === 1 ? "" : "s"} restante{remaining === 1 ? "" : "s"}
              </span>
            </SheetHeader>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <p className="text-[13px] text-ink-soft">
                Valor atual: <b>{formatBRL(cartela.unitValue)}</b> por uso
              </p>
              <div className="space-y-2">
                <span className="text-[12.5px] font-semibold text-ink-soft">
                  Novo valor por uso
                </span>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3">
                  <span className="text-[15px] font-bold text-ink-faint">R$</span>
                  <Input
                    value={valueInput}
                    onChange={(e) => setValueInput(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="h-10 flex-1 border-0 bg-transparent p-0 text-[15px] font-bold text-ink shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>
              <p className="text-[12px] text-ink-faint text-pretty">
                Vale só para os {remaining} uso{remaining === 1 ? "" : "s"} pendente
                {remaining === 1 ? "" : "s"}. Usos já feitos mantêm o valor antigo e o
                cliente não paga a diferença. O reajuste fica registrado no histórico.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2.5 border-t border-muted p-4">
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="shrink-0 rounded-xl border border-border bg-card px-4.5 py-2.5 text-[13.5px] font-semibold text-ink-soft transition-colors hover:border-ink-faint/40 disabled:opacity-50"
              >
                Cancelar
              </button>
              <Button
                onClick={confirm}
                disabled={pending || !canConfirm}
                className="flex-1 rounded-xl"
              >
                Confirmar reajuste
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
