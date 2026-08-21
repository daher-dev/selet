import { Check, Minus } from "lucide-react";
import type { Cartela } from "@/lib/types";
import { punchStates, type PunchState } from "@/lib/cartelas";
import { cn } from "@/lib/utils";

type CartelaPunchDotsProps = {
  size?: "sm" | "md";
  className?: string;
} & (
  | { cartela: Cartela; states?: never }
  | { cartela?: never; states: PunchState[] }
);

/**
 * Shared punch-dot row — the single place that turns lib/cartelas'
 * punchStates() into pixels. A solid dot is a free/unused slot (amber for
 * the brinde, green for a paid one); an outlined dot with a checkmark is one
 * consumed by an order; a dashed outline with a minus is one consumed by a
 * manual adjustment (no order/product behind it). Used by the Cartelas list,
 * the cartela history drawer, the customer detail card, and the Pedidos
 * cartela builder + "Cartela aplicada" confirmation preview.
 *
 * Two more states exist purely for that last caller's forecast: "usado-agora"
 * (a pulsing solid-green checkmark — about to be consumed by the order being
 * saved) and "disponivel" (a hollow outline — still free after saving). See
 * CartelaConfirmStep's forecastStates() in pedidos/order-sheet.tsx.
 *
 * Accepts either a live `cartela` (most callers — the dots are derived here
 * via punchStates()) or precomputed `states` directly, for callers that
 * already have a PunchState[] on hand (or, as in the Pedidos cartela
 * builder, a not-yet-sold cartela with no real Cartela doc to pass).
 */
export function CartelaPunchDots(props: CartelaPunchDotsProps) {
  const { size = "md", className } = props;
  const states = props.cartela ? punchStates(props.cartela) : props.states;
  const dim = size === "sm" ? "size-3" : "size-3.5";
  const iconDim = size === "sm" ? "size-1.5" : "size-2";
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {states.map((state, i) => {
        if (state === "brinde-livre") {
          return (
            <span key={i} className={cn(dim, "shrink-0 rounded-full bg-amber")} />
          );
        }
        if (state === "livre") {
          return (
            <span key={i} className={cn(dim, "shrink-0 rounded-full bg-primary")} />
          );
        }
        if (state === "usado-agora") {
          return (
            <span
              key={i}
              style={{ animationDelay: `${i * 0.25}s` }}
              className={cn(
                dim,
                "selet-stamp flex shrink-0 items-center justify-center rounded-full bg-primary text-white",
              )}
            >
              <Check className={iconDim} strokeWidth={3.5} />
            </span>
          );
        }
        if (state === "disponivel") {
          return (
            <span
              key={i}
              className={cn(dim, "shrink-0 rounded-full border-[1.5px] border-[#E2E9E2] bg-[#F5F8F3]")}
            />
          );
        }
        if (state === "ajuste") {
          return (
            <span
              key={i}
              className={cn(
                dim,
                "flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-[#B6A4D8] bg-card text-[#7A63B8]",
              )}
            >
              <Minus className={iconDim} strokeWidth={4} />
            </span>
          );
        }
        const isBrinde = state === "brinde-usado";
        return (
          <span
            key={i}
            className={cn(
              dim,
              "flex shrink-0 items-center justify-center rounded-full border bg-card",
              isBrinde ? "border-amber/45 text-amber" : "border-border text-ink-faint",
            )}
          >
            <Check className={iconDim} strokeWidth={3.5} />
          </span>
        );
      })}
    </div>
  );
}
