"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Customer, PayMethod, VoucherTemplate } from "@/lib/types";
import { PAY_METHODS } from "@/lib/types";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { sellVoucherAction } from "@/actions/vouchers";
import { CustomerPicker } from "@/components/customer-picker";
import { PAY_METHOD_META } from "@/components/order-meta";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface VoucherSellSheetProps {
  storeId: string;
  templates: VoucherTemplate[];
  customers: Customer[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VoucherSellSheet({
  storeId,
  templates,
  customers,
  open,
  onOpenChange,
}: VoucherSellSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="text-[17px] font-bold">Vender voucher</SheetTitle>
        </SheetHeader>
        {open && (
          <SellForm
            storeId={storeId}
            templates={templates}
            customers={customers}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function SellForm({
  storeId,
  templates,
  customers,
  onClose,
}: {
  storeId: string;
  templates: VoucherTemplate[];
  customers: Customer[];
  onClose: () => void;
}) {
  const [customerId, setCustomerId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [paid, setPaid] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod | null>(null);
  const [pending, startTransition] = useTransition();

  const template = templates.find((t) => t.id === templateId) ?? null;

  function customerName(): string {
    return customers.find((c) => c.id === customerId)?.name ?? "";
  }

  function submit() {
    startTransition(async () => {
      const result = await sellVoucherAction({
        storeId,
        customerId,
        customerName: customerName(),
        templateId,
        paid,
        payMethod,
      });
      if (result.ok) {
        toast.success("Voucher vendido.");
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
          <Label>Cliente</Label>
          <CustomerPicker
            storeId={storeId}
            customers={customers}
            value={customerId}
            onChange={setCustomerId}
          />
        </div>

        <div className="space-y-2">
          <Label>Modelo</Label>
          {templates.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-paper px-4 py-4 text-center text-[12px] text-ink-faint">
              Cadastre um modelo na aba Modelos primeiro.
            </p>
          ) : (
            <ul className="space-y-2">
              {templates.map((t) => {
                const active = t.id === templateId;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setTemplateId(t.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                        active
                          ? "border-primary bg-mist"
                          : "border-border bg-card hover:border-primary/40",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">
                          {t.name}
                        </span>
                        <span className="block text-[11px] text-ink-faint">
                          {t.validityDays ? `Vale ${t.validityDays} dias` : "Sem validade"}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-[13.5px] font-bold text-primary">
                        {formatBRL(t.packagePrice)}
                      </span>
                      {active && (
                        <Check className="size-4 shrink-0 text-primary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {template && (
          <div className="flex items-center justify-between rounded-xl border border-mint-wash bg-mist px-4 py-3">
            <span className="text-[13px] font-semibold text-ink-soft">
              Valor do voucher
            </span>
            <span className="tabular text-[22px] font-bold text-primary">
              {formatBRL(template.packagePrice)}
            </span>
          </div>
        )}

        <div className="space-y-2">
          <Label>Pagamento</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setPaid(true);
                if (!payMethod) setPayMethod("pix");
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
                paid
                  ? "border-primary bg-mint-wash text-primary"
                  : "border-border bg-card text-ink-soft",
              )}
            >
              <Check className="size-4" strokeWidth={2.2} />
              Pago
            </button>
            <button
              type="button"
              onClick={() => {
                setPaid(false);
                setPayMethod(null);
              }}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
                !paid
                  ? "border-amber bg-amber-wash text-amber"
                  : "border-border bg-card text-ink-soft",
              )}
            >
              A receber
            </button>
          </div>
          {paid && (
            <div className="grid grid-cols-3 gap-2">
              {PAY_METHODS.map((key) => {
                const meta = PAY_METHOD_META[key];
                const Icon = meta.icon;
                const selected = payMethod === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPayMethod(key)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11.5px] font-semibold transition-colors",
                      selected
                        ? "border-primary bg-mist text-primary"
                        : "border-border bg-card text-ink-soft hover:border-primary/40",
                    )}
                  >
                    <Icon className="size-4" strokeWidth={1.8} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <SheetFooter className="flex-row gap-2 border-t border-border">
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
          disabled={
            pending || !customerId || !templateId || (paid && !payMethod)
          }
          className="flex-1 rounded-xl font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Vender voucher
        </Button>
      </SheetFooter>
    </>
  );
}
