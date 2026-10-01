"use client";

import { groupUnitsForPicker } from "@/lib/stock-settings";
import { cn } from "@/lib/utils";
import { useUnits } from "@/components/stock-settings-context";

/**
 * Segmented "Unidade de uso" picker over the store's own units: count units
 * together, measure units in pairs (design: [un sachê] [g kg] [ml L]).
 */
export function UnitPicker({
  value,
  onChange,
  variant = "roomy",
}: {
  value: string;
  onChange: (unitId: string) => void;
  /** "roomy" = the Cadastrar item drawer (design 4a); "compact" = detail edit panel. */
  variant?: "roomy" | "compact";
}) {
  const { units } = useUnits();
  const roomy = variant === "roomy";
  return (
    <div className="flex flex-wrap gap-2">
      {groupUnitsForPicker(units).map((group, gi) => (
        <div
          key={gi}
          className={cn(
            "flex min-w-0 flex-1 gap-0.5",
            roomy
              ? "rounded-xl bg-[#F1F6EE] p-[3px]"
              : "rounded-lg border border-border bg-surface p-0.5",
          )}
        >
          {group.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onChange(u.id)}
              className={cn(
                "flex-1 font-semibold transition-colors",
                roomy ? "h-9 rounded-[9px] px-2 text-[13px]" : "rounded-md py-2 text-[12.5px]",
                value === u.id
                  ? "bg-primary text-white"
                  : roomy
                    ? "text-ink-soft hover:text-ink"
                    : "text-ink-soft hover:text-ink",
              )}
            >
              {u.symbol}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
