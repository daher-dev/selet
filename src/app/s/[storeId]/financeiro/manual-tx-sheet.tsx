"use client";

import { useState, useTransition } from "react";
import { ArrowDownRight, ArrowUpRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FINANCE_CATEGORIES } from "@/lib/types";
import { parseBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createManualTxAction } from "@/actions/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const CATEGORY_LABELS: Record<string, string> = {
  vendas: "Vendas",
  compras: "Compras",
  salarios: "Salários",
  aluguel: "Aluguel",
  marketing: "Marketing",
  outros: "Outros",
};

interface ManualTxSheetProps {
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManualTxSheet({ storeId, open, onOpenChange }: ManualTxSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="text-[17px] font-bold">Novo lançamento</SheetTitle>
        </SheetHeader>
        {open && (
          <ManualTxForm storeId={storeId} onClose={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ManualTxForm({
  storeId,
  onClose,
}: {
  storeId: string;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [category, setCategory] = useState<string>("compras");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pending, startTransition] = useTransition();

  function submit() {
    let amountCentavos: number;
    try {
      amountCentavos = parseBRL(amount);
    } catch {
      toast.error("Valor inválido.");
      return;
    }
    startTransition(async () => {
      const result = await createManualTxAction({
        storeId,
        label,
        category: category as (typeof FINANCE_CATEGORIES)[number],
        amount: amountCentavos,
        direction,
        date: new Date(`${date}T12:00:00Z`).toISOString(),
      });
      if (result.ok) {
        toast.success("Lançamento registrado.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="flex-1 space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDirection("in")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
              direction === "in"
                ? "border-primary bg-mint-wash text-primary"
                : "border-border bg-card text-ink-soft",
            )}
          >
            <ArrowUpRight className="size-4" />
            Entrada
          </button>
          <button
            type="button"
            onClick={() => setDirection("out")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
              direction === "out"
                ? "border-destructive bg-danger-wash text-destructive"
                : "border-border bg-card text-ink-soft",
            )}
          >
            <ArrowDownRight className="size-4" />
            Saída
          </button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tx-label">Descrição</Label>
          <Input
            id="tx-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Compra de embalagens"
            className="rounded-xl"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="tx-amount">Valor</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-faint">
                R$
              </span>
              <Input
                id="tx-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="150,00"
                inputMode="decimal"
                className="rounded-xl pl-9 tabular"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tx-date">Data</Label>
            <Input
              id="tx-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FINANCE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          disabled={pending || !label.trim() || !amount.trim()}
          className="flex-1 rounded-xl font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Salvar
        </Button>
      </SheetFooter>
    </>
  );
}
