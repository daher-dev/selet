"use client";

import { useState, useTransition } from "react";
import { Minus } from "lucide-react";
import { toast } from "sonner";
import type { Cartela } from "@/lib/types";
import { formatBRL, formatDateShort } from "@/lib/format";
import {
  balanceValue,
  CARTELA_MANUAL_REASON_LABELS,
  manualUseGroups,
  usesByOrder,
} from "@/lib/cartelas";
import { cn } from "@/lib/utils";
import { cancelCartelaAction } from "@/actions/cartelas";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CartelaPunchDots } from "@/components/cartela-punch-dots";
import { CartelaManualUseSheet } from "./cartela-manual-use-sheet";

interface CartelaHistorySheetProps {
  storeId: string;
  cartela: Cartela | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Drawer opened by clicking a cartela row: manual adjustments and uses grouped by the order that redeemed them, newest first, with a "Cancelar cartela" escape hatch and a "Marcar uso manual" button that opens CartelaManualUseSheet. */
export function CartelaHistorySheet({
  storeId,
  cartela,
  open,
  onOpenChange,
}: CartelaHistorySheetProps) {
  const [pending, startTransition] = useTransition();
  const [manualOpen, setManualOpen] = useState(false);

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
  const manualGroups = cartela ? manualUseGroups(cartela) : [];

  const hasHistory = manualGroups.length > 0 || groups.length > 0;

  return (
    <>
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
                {!hasHistory ? (
                  <p className="text-[13px] text-ink-faint">
                    Nenhum uso registrado ainda.
                  </p>
                ) : (
                  <>
                    {manualGroups.map((g, gi) => (
                      <div key={g.at}>
                        {gi > 0 && <div className="mb-4 h-px bg-muted" />}
                        <div className="flex items-baseline gap-2">
                          <span className="flex-1 text-[13.5px] font-bold text-[#5A4A86]">
                            Ajuste manual
                          </span>
                          <span className="text-[12px] text-ink-faint">
                            {formatDateShort(g.at)}
                          </span>
                        </div>
                        <div className="mt-2.5 flex items-center gap-2.5 text-[13px] text-ink">
                          <span className="flex size-[15px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-[#B6A4D8] text-[#7A63B8]">
                            <Minus className="size-2" strokeWidth={4} />
                          </span>
                          {g.count} uso{g.count === 1 ? "" : "s"} marcado
                          {g.count === 1 ? "" : "s"} sem pedido
                        </div>
                        <p className="mt-1.5 ml-[25px] text-[12px] text-ink-faint text-pretty">
                          &ldquo;{g.note ?? CARTELA_MANUAL_REASON_LABELS[g.reason]}&rdquo; · {g.by}
                        </p>
                      </div>
                    ))}
                    {manualGroups.length > 0 && groups.length > 0 && (
                      <div className="h-px bg-muted" />
                    )}
                    {groups.map((g, gi) => (
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
                    ))}
                  </>
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
                <button
                  type="button"
                  onClick={() => setManualOpen(true)}
                  disabled={pending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#E0D8F0] bg-[#F1EDF8] py-2.5 text-[13.5px] font-semibold text-[#5A4A86] transition-colors hover:border-[#DCD2F0] disabled:opacity-50"
                >
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-[#B6A4D8] text-[#7A63B8]">
                    <Minus className="size-2.5" strokeWidth={4} />
                  </span>
                  Marcar uso manual
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <CartelaManualUseSheet
        storeId={storeId}
        cartela={cartela}
        open={manualOpen}
        onOpenChange={setManualOpen}
      />
    </>
  );
}
