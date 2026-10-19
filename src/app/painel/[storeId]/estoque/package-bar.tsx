import { cn } from "@/lib/utils";
import type { Seg } from "./stock-view";

const HATCH = "repeating-linear-gradient(135deg, #6b46c1 0 2px, #d3c6f2 2px 4px)";

/**
 * The Loja's package bar: one slot per sealed package (green), the open one
 * (hatched when in continuous use, partly filled when counted) and dashed
 * slots for what is missing up to the minimum.
 */
export function PackageBar({ segs, className }: { segs: Seg[]; className?: string }) {
  return (
    <span className={cn("flex gap-[3px]", className)} aria-hidden>
      {segs.map((seg, i) => {
        const base = "h-[7px] flex-1 overflow-hidden rounded-[4px]";
        if (seg.kind === "sealed") return <span key={i} className={cn(base, "bg-primary")} />;
        if (seg.kind === "missing") return <span key={i} className={cn(base, "border border-dashed border-[#e3a08f]")} />;
        if (seg.kind === "uso") {
          return <span key={i} className={cn(base, "em-uso")} style={{ background: HATCH }} />;
        }
        return (
          <span key={i} className={cn(base, "bg-[#e6def6]")}>
            <span className="block h-full bg-violet" style={{ width: `${seg.pct ?? 0}%` }} />
          </span>
        );
      })}
    </span>
  );
}
