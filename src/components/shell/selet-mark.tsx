import { cn } from "@/lib/utils";

export function SeletLeaf({
  className,
  strokeWidth = 1.8,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M11 20A7 7 0 0 1 4 13c0-4 3-6.5 3-6.5" />
      <path d="M11 20c0-8 5-12 9-13 0 8-4 13-9 13Z" />
    </svg>
  );
}

/** Green rounded tile with the white leaf — the Selet symbol. */
export function SeletMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-[27%] bg-primary text-white",
        className ?? "size-9",
      )}
    >
      <SeletLeaf className="size-1/2" />
    </span>
  );
}

/** Cormorant Garamond wordmark. */
export function SeletWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display font-semibold tracking-[0.01em] text-primary leading-none",
        className,
      )}
    >
      Selet
    </span>
  );
}
