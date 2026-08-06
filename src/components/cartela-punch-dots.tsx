import { Check } from "lucide-react";
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
 * already consumed. Used by the Cartelas list, the cartela history drawer,
 * the customer detail card, and the Pedidos cartela builder + "Cartela
 * aplicada" confirmation preview.
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
