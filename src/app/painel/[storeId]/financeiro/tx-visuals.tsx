import { ArrowDown, ArrowUp } from "lucide-react";
import type { FinanceTx } from "@/lib/types";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Shared look of a movement in the Financeiro screens (design): entradas are
 * green with an up arrow, saídas amber with a down arrow — never red, which
 * the redesign keeps for errors/negative months only.
 */
export function TxIcon({
  direction,
  size = "md",
}: {
  direction: FinanceTx["direction"];
  size?: "md" | "lg";
}) {
  const isIn = direction === "in";
  const Icon = isIn ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center",
        size === "lg" ? "size-[38px] rounded-[10px]" : "size-[34px] rounded-[9px]",
        isIn ? "bg-[#E7F4EC] text-success" : "bg-amber-wash text-amber",
      )}
    >
      <Icon className={size === "lg" ? "size-[18px]" : "size-[17px]"} />
    </span>
  );
}

export function txAmountClass(direction: FinanceTx["direction"]): string {
  return direction === "in" ? "text-success" : "text-amber";
}

export function TxAmount({
  tx,
  className,
}: {
  tx: Pick<FinanceTx, "direction" | "amount">;
  className?: string;
}) {
  return (
    <span className={cn("tabular font-bold", txAmountClass(tx.direction), className)}>
      {tx.direction === "in" ? "+ " : "− "}
      {formatBRL(tx.amount)}
    </span>
  );
}
