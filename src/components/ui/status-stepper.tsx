"use client";

import { Check } from "lucide-react";
import type { OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const FLOW: OrderStatus[] = ["novo", "preparando", "entrega", "concluido"];
const LABELS: Record<string, string> = {
  novo: "Novo",
  preparando: "Preparando",
  entrega: "Entrega",
  concluido: "Concluído",
};

interface StatusStepperProps {
  status: OrderStatus;
  onChange: (status: OrderStatus) => void;
  disabled?: boolean;
}

/**
 * The order lifecycle stepper (novo → preparando → entrega → concluído).
 * Tapping a step moves the order there. Cancelled orders render a flat
 * banner instead — reopening is handled by the parent.
 */
export function StatusStepper({ status, onChange, disabled }: StatusStepperProps) {
  if (status === "cancelado") {
    return (
      <div className="rounded-xl bg-danger-wash px-4 py-3 text-center text-[13px] font-semibold text-destructive">
        Pedido cancelado
      </div>
    );
  }

  const currentIndex = FLOW.indexOf(status);

  return (
    <ol className="flex items-start">
      {FLOW.map((step, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
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
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-colors",
                  done && "border-primary bg-primary text-white",
                  current && "border-primary bg-mist text-primary",
                  !done && !current && "border-border bg-card text-ink-faint",
                  !disabled && "hover:border-primary",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
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
