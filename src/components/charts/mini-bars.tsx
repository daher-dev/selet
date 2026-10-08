"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface MiniBar {
  key: string;
  /** Month label under the bar ("Jul"). */
  label: string;
  value: number;
  /** Text revealed above the bar ("R$ 520", "11"). */
  display: string;
  /** The current period — drawn in the dark brand green. */
  current?: boolean;
}

/** Tallest bar's share of the chart height — leaves room for the revealed value. */
const TALLEST = 72;

/**
 * Tiny CSS bar chart of the Cartelas stat cards (design Mock Cartelas): one
 * column per month, the current month dark, the rest pale. The value shows
 * above a bar on hover, keyboard focus, or tap (a tapped bar stays pinned
 * until another is tapped) — hover alone wouldn't work on the phone-first app.
 */
export function MiniBars({ bars, name, className }: { bars: MiniBar[]; name: string; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const shown = hover ?? pinned;
  const max = Math.max(...bars.map((b) => b.value), 0);

  return (
    <div role="group" aria-label={name} className={cn("flex h-[78px] items-end gap-2", className)}>
      {bars.map((b, i) => {
        const active = shown === i;
        const heightPct = max > 0 ? Math.max(b.value > 0 ? 3 : 0, (b.value / max) * TALLEST) : 0;
        return (
          <button
            key={b.key}
            type="button"
            title={`${b.label}: ${b.display}`}
            aria-label={`${b.label}: ${b.display}`}
            aria-pressed={pinned === i}
            onPointerEnter={(e) => e.pointerType === "mouse" && setHover(i)}
            onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            onClick={() => setPinned((p) => (p === i ? null : i))}
            className="flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end gap-[3px] rounded-sm outline-none"
          >
            <span
              className={cn(
                "whitespace-nowrap text-[10.5px] font-semibold transition-colors",
                active ? "text-primary" : "text-transparent",
              )}
            >
              {b.display}
            </span>
            <span
              className={cn(
                "block w-full rounded-t-[4px] transition-colors",
                b.current || active ? "bg-primary" : "bg-[#b9d3c2]",
              )}
              style={{ height: `${heightPct}%` }}
            />
            <span className="text-[10.5px] text-ink-faint">{b.label}</span>
          </button>
        );
      })}
    </div>
  );
}
