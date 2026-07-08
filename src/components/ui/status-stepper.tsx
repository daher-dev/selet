"use client";

import type { LucideIcon } from "lucide-react";
import { Check, ChefHat, Inbox, Truck, XCircle } from "lucide-react";
import type { OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const FLOW: OrderStatus[] = ["novo", "preparando", "entrega", "concluido"];
const LABELS: Record<string, string> = {
  novo: "Novo",
  preparando: "Preparando",
  entrega: "Entrega",
  concluido: "Concluído",
};
// Per-step node icons (design orderSteps: inbox → chef-hat → truck → check).
const STEP_ICONS: Record<OrderStatus, LucideIcon> = {
  novo: Inbox,
  preparando: ChefHat,
  entrega: Truck,
  concluido: Check,
  cancelado: XCircle,
};

interface StatusStepperProps {
  status: OrderStatus;
  onChange: (status: OrderStatus) => void;
  disabled?: boolean;
}

/**
 * The order lifecycle stepper (novo → preparando → entrega → concluído).
 * Tapping a step moves the order there. Cancelled orders render a rich banner
 * with a "Reabrir" action instead (reopens to "novo").
 */
export function StatusStepper({ status, onChange, disabled }: StatusStepperProps) {
  if (status === "cancelado") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-destructive/25 bg-danger-wash px-4 py-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-destructive/15 text-destructive">
          <XCircle className="size-4.5" strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold text-destructive">
            Pedido cancelado
          </span>
          <span className="block text-[11.5px] text-destructive/75">
            Não entra no faturamento do dia
          </span>
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("novo")}
          className="h-8 shrink-0 rounded-lg border border-destructive/30 bg-card px-3.5 text-[12.5px] font-semibold text-destructive transition-colors hover:bg-danger-wash disabled:opacity-50"
        >
          Reabrir
        </button>
      </div>
    );
  }

  const currentIndex = FLOW.indexOf(status);

  return (
    <ol className="flex items-start">
      {FLOW.map((step, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        const Icon = STEP_ICONS[step];
        return (
          <li key={step} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <span
                className={cn(
                  "h-0.5 flex-1",
                  i === 0 ? "bg-transparent" : done || current ? "bg-primary" : "bg-border",
                )}
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(step)}
                aria-label={LABELS[step]}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  done && "border-primary bg-primary text-white",
                  current && "border-primary bg-mist text-primary",
                  !done && !current && "border-border bg-card text-ink-faint",
                  !disabled && "hover:border-primary",
                )}
              >
                {done ? (
                  <Check className="size-4" strokeWidth={2.4} />
                ) : (
                  <Icon className="size-4" strokeWidth={1.9} />
                )}
              </button>
              <span
                className={cn(
                  "h-0.5 flex-1",
                  i === FLOW.length - 1 ? "bg-transparent" : done ? "bg-primary" : "bg-border",
                )}
              />
            </div>
            <span
              className={cn(
                "text-[10.5px] font-semibold",
                current ? "text-primary" : done ? "text-ink-soft" : "text-ink-faint",
              )}
            >
              {LABELS[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
