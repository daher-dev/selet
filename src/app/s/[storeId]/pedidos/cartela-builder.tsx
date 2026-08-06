"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { OrderItem } from "@/lib/types";
import type { PunchState } from "@/lib/cartelas";
import { formatBRL, parseBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CartelaPunchDots } from "@/components/cartela-punch-dots";

/** Best-effort BRL parse for a live-typed input: invalid/partial text (an
 *  empty field, a trailing comma) reads as 0 instead of throwing mid-edit. */
function safeParseBRL(input: string): number {
  try {
    return Math.max(0, parseBRL(input));
  } catch {
    return 0;
  }
}

interface CartelaBuilderProps {
  /** A cartela is always sold to a specific customer, but that's only
   *  needed at save time (the order's Save button already requires one) —
   *  this just drives a non-blocking reminder, nothing here is disabled. */
  hasCustomer: boolean;
  onConfirm: (item: OrderItem) => void;
}

/**
 * A cartela is sold ad hoc, right here — no template. `paidUses` + the one
 * built-in brinde become `totalUses`; the line's price is paidUses × unitValue.
 */
export function CartelaBuilder({ hasCustomer, onConfirm }: CartelaBuilderProps) {
  const [paidUses, setPaidUses] = useState(10);
  const [valueInput, setValueInput] = useState("");

  const unitValue = safeParseBRL(valueInput);
  const totalUses = paidUses + 1;
  const total = paidUses * unitValue;
  const canConfirm = paidUses >= 1 && unitValue > 0;

  // No doc exists yet (nothing to sell until "Adicionar ao pedido"), so this
  // is built by hand rather than derived from a real Cartela: brinde first,
  // nothing redeemed yet.
  const states: PunchState[] = Array.from({ length: totalUses }, (_, i) =>
    i === 0 ? "brinde-livre" : "livre",
  );

  function confirm() {
    if (!canConfirm) return;
    onConfirm({
      productId: "cartela",
      name: `Cartela · ${totalUses} usos`,
      qty: 1,
      unitPrice: total,
      cartelaSale: { paidUses, totalUses, unitValue },
    });
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="flex items-center justify-between">
          <Label>Produtos (usos pagos)</Label>
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setPaidUses((v) => Math.max(1, v - 1))}
              className="flex size-7 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-wash hover:text-primary"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="tabular w-8 text-center text-[15px] font-bold text-ink">
              {paidUses}
            </span>
            <button
              type="button"
              onClick={() => setPaidUses((v) => v + 1)}
              className="flex size-7 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-wash hover:text-primary"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Valor do produto</Label>
          <div className="flex h-11 items-center rounded-xl border border-border bg-card px-3 focus-within:border-primary">
            <span className="mr-1.5 text-[13px] font-semibold text-ink-faint">R$</span>
            <Input
              value={valueInput}
              onChange={(e) => setValueInput(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className="h-8 flex-1 border-0 bg-transparent p-0 text-[15px] font-bold text-ink shadow-none focus-visible:ring-0"
            />
          </div>
          <p className="text-[11px] text-ink-faint">
            Valor de cada uso — uma linha do pedido só pode ser coberta por esta
            cartela se custar isso ou mais.
          </p>
        </div>

        <div className="rounded-xl border border-mint-wash bg-mist p-3.5">
          <p className="text-[12.5px] text-ink-soft">
            {totalUses} usos · {paidUses} pago{paidUses === 1 ? "" : "s"} + 1 brinde
          </p>
          <div className="mt-2.5">
            <CartelaPunchDots states={states} />
          </div>
        </div>

        {!hasCustomer && (
          <p className="text-[11.5px] text-ink-faint">
            Um cliente ainda vai ser necessário para salvar o pedido.
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-border p-4">
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold text-ink-faint">
            Cartela
          </span>
          <span className="tabular text-[20px] font-bold text-primary">
            {formatBRL(total)}
          </span>
        </span>
        <Button
          onClick={confirm}
          disabled={!canConfirm}
          className="h-11 gap-1.5 rounded-xl px-5 font-semibold"
        >
          <Plus className="size-4" />
          Adicionar ao pedido
        </Button>
      </div>
    </>
  );
}
