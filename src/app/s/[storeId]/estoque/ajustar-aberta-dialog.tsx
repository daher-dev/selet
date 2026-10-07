"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { OpenAdjustReason, StockItem } from "@/lib/types";
import { OPEN_ADJUST_REASONS, OPEN_ADJUST_REASON_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { adjustOpenBalanceAction } from "@/actions/stock";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUnits } from "@/components/stock-settings-context";
import { OpenMeter } from "./open-meter";

interface Props {
  storeId: string;
  /** The per-unit item being corrected; null keeps the dialog closed. */
  item: StockItem | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Ajustar embalagem aberta" (design 2c): for per-unit items (copos, sachês)
 * the open package's balance is calculated from sales — this lets the user
 * overwrite it with what is really left. Booked as an AJUSTE/PERDA movement.
 */
export function AjustarAbertaDialog({ storeId, item, onOpenChange }: Props) {
  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[calc(100%-2rem)] max-w-[390px] gap-0 overflow-hidden rounded-[18px] p-0 sm:max-w-[390px]"
      >
        {item && (
          <AjustarForm key={item.id} storeId={storeId} item={item} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AjustarForm({
  storeId,
  item,
  onClose,
}: {
  storeId: string;
  item: StockItem;
  onClose: () => void;
}) {
  const { unitLabel } = useUnits();
  const un = unitLabel(item.unit);
  const pkgSize = item.pkgSize ?? 1;
  const current = item.open;
  // An open package can't hold more than its size (unless legacy data already does).
  const max = Math.max(pkgSize, current);

  const [value, setValue] = useState(current);
  const [reason, setReason] = useState<OpenAdjustReason | null>("CONTAGEM");
  const [pending, startTransition] = useTransition();

  const increased = value > current;
  // "Perda" only makes sense when the balance goes down.
  const effectiveReason = reason === "PERDA" && increased ? null : reason;
  const unchanged = value === current;

  function submit() {
    startTransition(async () => {
      const r = await adjustOpenBalanceAction({
        storeId,
        itemId: item.id,
        open: value,
        reason: effectiveReason ?? undefined,
      });
      if (r.ok) {
        toast.success(`Saldo ajustado: ${current} → ${value} ${un}.`);
        onClose();
      } else toast.error(r.error);
    });
  }

  return (
    <>
      <DialogHeader className="gap-0 border-b border-border/70 px-[22px] pb-4 pt-5">
        <span className="text-[11px] font-bold uppercase tracking-[.5px] text-violet">{item.name}</span>
        <DialogTitle className="mt-[3px] text-[18px] font-bold leading-snug">Ajustar embalagem aberta</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4 px-[22px] py-5">
        <div className="flex items-center gap-2.5 rounded-xl border border-violet/15 bg-violet-wash px-3.5 py-3">
          <span className="flex-1 text-[12.5px] text-violet/80">Saldo calculado pelo sistema</span>
          <span className="tabular text-[14px] font-bold text-violet">
            {current} de {pkgSize} {un}
          </span>
        </div>

        <div>
          <FieldLabel>Unidades restantes de verdade</FieldLabel>
          <div className="flex items-center gap-2.5">
            <StepButton
              label="Diminuir"
              disabled={value <= 0 || pending}
              onClick={() => setValue((v) => Math.max(0, v - 1))}
            >
              −
            </StepButton>
            <label className="flex h-[46px] flex-1 items-baseline justify-center gap-1.5 rounded-[11px] border-[1.5px] border-violet pt-1.5">
              <input
                value={value}
                onChange={(e) => {
                  const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                  setValue(Number.isNaN(n) ? 0 : Math.min(max, n));
                }}
                inputMode="numeric"
                aria-label="Unidades restantes de verdade"
                disabled={pending}
                style={{ width: `${Math.max(1, String(value).length)}ch` }}
                className="tabular bg-transparent text-center text-[22px] font-bold leading-none text-ink outline-none"
              />
              <span className="text-[13px] text-ink-faint">
                de {pkgSize} {un}
              </span>
            </label>
            <StepButton
              label="Aumentar"
              disabled={value >= max || pending}
              onClick={() => setValue((v) => Math.min(max, v + 1))}
            >
              +
            </StepButton>
          </div>
          <OpenMeter total={pkgSize} filled={value} className="mt-3" />
        </div>

        <div>
          <FieldLabel>
            Motivo <span className="font-medium normal-case tracking-normal">(opcional)</span>
          </FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {OPEN_ADJUST_REASONS.map((r) => {
              const selected = effectiveReason === r;
              const blocked = r === "PERDA" && increased;
              return (
                <button
                  key={r}
                  type="button"
                  disabled={blocked || pending}
                  aria-pressed={selected}
                  onClick={() => setReason(selected ? null : r)}
                  className={cn(
                    "rounded-full px-[11px] py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-40",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-[#f4f7f1] text-ink-soft hover:border-primary/40",
                  )}
                >
                  {OPEN_ADJUST_REASON_LABELS[r]}
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-[12px] leading-[1.45] text-ink-faint">
          O ajuste fica registrado no histórico do insumo: {current} → {value} {un}.
        </p>
      </div>

      <div className="flex gap-2.5 border-t border-border/70 px-[22px] py-4">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={pending}
          className="h-11 rounded-[11px] px-[18px] text-[13.5px] font-semibold text-ink-soft"
        >
          Cancelar
        </Button>
        <Button
          onClick={submit}
          disabled={pending || unchanged}
          className="h-11 flex-1 rounded-[11px] text-[13.5px] font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Salvar ajuste
        </Button>
      </div>
    </>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-[7px] block text-[11px] font-bold uppercase tracking-[.4px] text-ink-faint">
      {children}
    </span>
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
      className="flex size-[46px] shrink-0 items-center justify-center rounded-[11px] border border-border text-[20px] text-ink-soft transition-colors hover:border-primary/40 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
