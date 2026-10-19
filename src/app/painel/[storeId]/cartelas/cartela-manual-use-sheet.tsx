"use client";

import { useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Cartela, CartelaManualReason } from "@/lib/types";
import { CARTELA_MANUAL_REASONS } from "@/lib/types";
import { CARTELA_MANUAL_REASON_LABELS, remainingUses } from "@/lib/cartelas";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { markManualCartelaUseAction } from "@/actions/cartelas";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface CartelaManualUseSheetProps {
  storeId: string;
  cartela: Cartela | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_REASON: CartelaManualReason = "NAO_REGISTRADO";

/** Drawer opened from the history sheet's "Marcar uso manual" button (mock frame 3a): marks N uses as consumed with no order/product behind them. */
export function CartelaManualUseSheet({
  storeId,
  cartela,
  open,
  onOpenChange,
}: CartelaManualUseSheetProps) {
  const [count, setCount] = useState(1);
  const [reason, setReason] = useState<CartelaManualReason>(DEFAULT_REASON);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const max = cartela ? Math.max(1, remainingUses(cartela)) : 1;

  function reset() {
    setCount(1);
    setReason(DEFAULT_REASON);
    setNote("");
  }

  function close() {
    onOpenChange(false);
    reset();
  }

  function confirm() {
    if (!cartela) return;
    startTransition(async () => {
      const result = await markManualCartelaUseAction({
        storeId,
        cartelaId: cartela.id,
        count,
        reason,
        note: note.trim() || undefined,
      });
      if (result.ok) {
        toast.success("Uso manual registrado.");
        close();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(next) : close())}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        {cartela && (
          <>
            <SheetHeader className="shrink-0 flex-row items-center gap-3 border-b border-muted p-5 pb-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-[#B6A4D8] bg-card text-[#7A63B8]">
                <Minus className="size-4.5" strokeWidth={4} />
              </span>
              <div className="flex-1">
                <SheetTitle className="text-[17px] font-bold">
                  Marcar uso manual
                </SheetTitle>
                <span className="mt-0.5 block text-[12.5px] text-ink-faint">
                  #{cartela.code} · {cartela.customerName} · {remainingUses(cartela)} usos restantes
                </span>
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-4.5 overflow-y-auto p-5">
              <div className="space-y-2">
                <span className="text-[12.5px] font-semibold text-ink-soft">
                  Quantos usos
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCount((v) => Math.max(1, v - 1))}
                    disabled={count <= 1}
                    className="flex size-10.5 items-center justify-center rounded-xl border border-border text-[20px] font-semibold text-ink-soft transition-colors hover:border-primary/40 disabled:opacity-40"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="tabular min-w-13 text-center text-[22px] font-bold">
                    {count}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCount((v) => Math.min(max, v + 1))}
                    disabled={count >= max}
                    className="flex size-10.5 items-center justify-center rounded-xl border border-border text-[20px] font-semibold text-ink-soft transition-colors hover:border-primary/40 disabled:opacity-40"
                  >
                    <Plus className="size-4" />
                  </button>
                  <span className="flex-1 text-right text-[12.5px] text-ink-faint">
                    equivale a {formatBRL(count * cartela.unitValue)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[12.5px] font-semibold text-ink-soft">Motivo</span>
                <div className="flex flex-wrap gap-2">
                  {CARTELA_MANUAL_REASONS.map((r) => {
                    const selected = reason === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setReason(r)}
                        className={cn(
                          "rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-colors",
                          selected
                            ? "border-[#DCD2F0] bg-[#F1EDF8] text-[#5A4A86]"
                            : "border-border bg-card text-ink-soft hover:border-[#B6A4D8]/50",
                        )}
                      >
                        {CARTELA_MANUAL_REASON_LABELS[r]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[12.5px] font-semibold text-ink-soft">
                  Observação <span className="font-normal text-ink-faint">(opcional)</span>
                </span>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Cliente resgatou na loja sem registro no caixa"
                  maxLength={280}
                  className="min-h-18 rounded-xl"
                />
              </div>

              <p className="text-[12px] text-ink-faint text-pretty">
                O ajuste não gera pedido nem receita. Fica marcado no histórico
                com o ícone de ajuste e o nome de quem lançou.
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
                disabled={pending}
                className="flex-1 rounded-xl"
              >
                Confirmar ajuste
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
