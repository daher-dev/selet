"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { Cartela } from "@/lib/types";
import { formatBRL, formatDateShort } from "@/lib/format";
import { balanceValue, usesByOrder } from "@/lib/cartelas";
import { cn } from "@/lib/utils";
import { cancelCartelaAction } from "@/actions/cartelas";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CartelaPunchDots } from "@/components/cartela-punch-dots";

interface CartelaHistorySheetProps {
  storeId: string;
  cartela: Cartela | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Drawer opened by clicking a cartela row: uses grouped by the order that redeemed them, newest first, with a "Cancelar cartela" escape hatch. */
export function CartelaHistorySheet({
  storeId,
  cartela,
  open,
  onOpenChange,
}: CartelaHistorySheetProps) {
  const [pending, startTransition] = useTransition();

  function cancel() {
    if (!cartela) return;
    startTransition(async () => {
      const result = await cancelCartelaAction({
        storeId,
        cartelaId: cartela.id,
      });
      if (result.ok) {
        toast.success("Cartela cancelada.");
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  const groups = cartela ? usesByOrder(cartela) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        {cartela && (
          <>
            <SheetHeader className="shrink-0 gap-0 border-b border-muted p-5 pb-4.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-leaf">
                #{cartela.code} · {cartela.customerName}
              </p>
              <SheetTitle className="mt-0.5 text-[19px] font-bold">
                {cartela.paidUses} × {formatBRL(cartela.unitValue)}
              </SheetTitle>
              <div className="mt-3.5 flex items-center gap-3.5">
                <CartelaPunchDots cartela={cartela} />
                <span className="flex-1" />
                <span className="whitespace-nowrap text-[12.5px] font-bold text-primary">
                  Saldo {formatBRL(balanceValue(cartela))}
                </span>
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {groups.length === 0 ? (
                <p className="text-[13px] text-ink-faint">
                  Nenhum uso registrado ainda.
                </p>
              ) : (
                groups.map((g, gi) => (
                  <div key={g.orderId}>
                    {gi > 0 && <div className="mb-4 h-px bg-muted" />}
                    <div className="flex items-baseline gap-2">
                      <span className="flex-1 text-[13.5px] font-bold text-ink">
                        Pedido #{g.orderCode}
                      </span>
                      <span className="text-[12px] text-ink-faint">
                        {formatDateShort(g.at)}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {g.uses.map((u, ui) => (
                        <div
                          key={ui}
                          className="flex items-center gap-2.5 text-[13px] text-ink-soft"
                        >
                          <span
                            className={cn(
                              "size-[13px] shrink-0 rounded-full",
                              u.isBrinde ? "bg-[#D9A11B]" : "bg-primary",
                            )}
                          />
                          {u.productName}
                          {u.isBrinde && (
                            <span className="text-[11.5px] text-ink-faint">
                              brinde
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2.5 border-t border-muted p-4">
              <button
                type="button"
                onClick={cancel}
                disabled={pending}
                className="shrink-0 rounded-xl border border-border bg-card px-4 py-2.5 text-[13.5px] font-semibold text-ink-soft transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
              >
                Cancelar cartela
              </button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
                className="flex-1 rounded-xl"
              >
                Fechar
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
