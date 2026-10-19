import { cn } from "@/lib/utils";

/** One segment per unit of the open package — filled = units still left. */
export function OpenPips({
  total,
  filled,
  className,
}: {
  total: number;
  filled: number;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-[3px]", className)} aria-hidden>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn("h-1.5 flex-1 rounded-full", i < filled ? "bg-violet" : "bg-violet-track")}
        />
      ))}
    </div>
  );
}

/** Large packages (> 12 units) read as a fill bar instead of unreadable pips. */
export function OpenBar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-violet-track", className)} aria-hidden>
      <span className="block h-full rounded-full bg-violet" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Pips for small packages, bar for big ones — what the dialog uses. */
export function OpenMeter({
  total,
  filled,
  className,
}: {
  total: number;
  filled: number;
  className?: string;
}) {
  return total <= 12 ? (
    <OpenPips total={total} filled={filled} className={className} />
  ) : (
    <OpenBar pct={Math.min(100, Math.round((filled / total) * 100))} className={className} />
  );
}
