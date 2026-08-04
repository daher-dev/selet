"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Voucher } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { remaining } from "@/lib/vouchers";
import { cn } from "@/lib/utils";
import { redeemVoucherItemAction } from "@/actions/vouchers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface RedeemDialogProps {
  storeId: string;
  voucher: Voucher | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RedeemDialog({ storeId, voucher, open, onOpenChange }: RedeemDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-2xl p-0">
        {voucher && (
          <RedeemForm
            key={voucher.id}
            storeId={storeId}
            voucher={voucher}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RedeemForm({
  storeId,
  voucher,
  onClose,
}: {
  storeId: string;
  voucher: Voucher;
  onClose: () => void;
}) {
  const available = voucher.items.filter((i) => remaining(i) > 0);
  const [productId, setProductId] = useState<string | null>(
    available[0]?.productId ?? null,
  );
  const [pending, startTransition] = useTransition();

  const selected = available.find((i) => i.productId === productId) ?? null;

  function confirm() {
    if (!selected) return;
    startTransition(async () => {
      const result = await redeemVoucherItemAction({
        storeId,
        voucherId: voucher.id,
        productId: selected.productId,
      });
      if (result.ok) {
        toast.success("Retirada registrada.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <DialogHeader className="border-b border-border p-4 pb-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
          #{voucher.code} · {voucher.customerName}
        </p>
        <DialogTitle className="text-[15px] font-bold">
          Registrar retirada
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4 p-4">
        <ul className="space-y-2">
          {available.map((item) => {
            const active = item.productId === productId;
            return (
              <li key={item.productId}>
                <button
                  type="button"
                  onClick={() => setProductId(item.productId)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                    active
                      ? "border-primary bg-mist"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">
                      {item.name}
                    </span>
                    <span className="tabular block text-[11.5px] text-ink-faint">
                      {remaining(item)} de {item.qty} disponíveis
                    </span>
                  </span>
                  {active && (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {selected && (
          <div className="rounded-xl border border-mint-wash bg-mist p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
              Depois desta retirada
            </p>
            <div className="mt-2 flex items-center gap-1">
              {Array.from({ length: selected.qty }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "size-2.5 rounded-full",
                    i < selected.redeemedCount + 1 ? "bg-primary" : "bg-white",
                  )}
                />
              ))}
            </div>
            <p className="tabular mt-1.5 text-[11.5px] text-ink-soft">
              Restam {remaining(selected) - 1} {selected.name}
              {voucher.expiresAt ? ` até ${formatDate(voucher.expiresAt)}.` : "."}
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-border p-4">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={pending}
          className="flex-1 rounded-xl"
        >
          Cancelar
        </Button>
        <Button
          onClick={confirm}
          disabled={pending || !selected}
          className="flex-1 rounded-xl font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Confirmar retirada
        </Button>
      </div>
    </>
  );
}
