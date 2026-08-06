"use client";

import type { Cartela } from "@/lib/types";
import { formatBRL, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CartelaPunchDots } from "@/components/cartela-punch-dots";

interface CartelasListProps {
  cartelas: Cartela[];
  onSelect: (cartela: Cartela) => void;
}

/** Punch-card rows: used/total on the left, name + dots in the middle, unit value on the right. Esgotada rows dim and drop the dot row (per the mock's Luiza Castro row). */
export function CartelasList({ cartelas, onSelect }: CartelasListProps) {
  return (
    <ul className="space-y-3">
      {cartelas.map((c) => {
        const esgotada = c.status === "esgotada";
        const usedCount = c.uses.length;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c)}
              className={cn(
                "flex w-full items-stretch overflow-hidden rounded-2xl border border-border bg-card text-left transition-colors hover:border-primary/40",
                esgotada && "opacity-[.78]",
              )}
            >
              <div className="flex w-[66px] shrink-0 flex-col items-center justify-center gap-1.5 border-r border-muted bg-paper py-4">
                <span className="tabular text-[22px] font-bold leading-none text-ink">
                  {usedCount}
                </span>
                <span className="h-px w-[26px] bg-[#DDE5D8]" />
                <span className="tabular text-[22px] font-medium leading-none text-ink-faint">
                  {c.totalUses}
                </span>
              </div>

              <div className="min-w-0 flex-1 px-5 py-4">
                <div className="flex items-center gap-2">
                  <h3
                    className={cn(
                      "text-[16px] font-bold",
                      esgotada ? "text-ink-soft" : "text-ink",
                    )}
                  >
                    {c.customerName}
                  </h3>
                  {esgotada && (
                    <span className="rounded-full bg-[#EEF1ED] px-2.5 py-0.5 text-[11px] font-bold text-[#7A857D]">
                      Esgotada
                    </span>
                  )}
                </div>
                <span className="mt-0.5 block text-[12.5px] text-ink-faint">
                  #{c.code} · comprada {formatDate(c.purchasedAt)}
                </span>
                {!esgotada && (
                  <div className="mt-3.5">
                    <CartelaPunchDots cartela={c} />
                  </div>
                )}
              </div>

              <div className="flex w-[112px] shrink-0 flex-col items-center justify-center gap-0.5 border-l border-muted bg-paper">
                <span
                  className={cn(
                    "tabular text-[20px] font-bold",
                    esgotada ? "text-ink-faint" : "text-ink",
                  )}
                >
                  {formatBRL(c.unitValue)}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
