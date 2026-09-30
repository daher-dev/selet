import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The tinted card language of the Visão geral / Financeiro redesign: a white
 * card with a colored header strip (solid icon chip + faded watermark icon),
 * and the matching section heading with its period chip.
 */
export type Tone = "green" | "blue" | "pink" | "amber";

export const TONES: Record<
  Tone,
  { wash: string; border: string; solid: string; ink: string; watermark: string }
> = {
  green: { wash: "#E9F3E4", border: "#D3E6CA", solid: "#186B41", ink: "#124F30", watermark: "#186B41" },
  blue: { wash: "#E6EFF8", border: "#CFE0F1", solid: "#2F6FB5", ink: "#1F4F82", watermark: "#2F6FB5" },
  pink: { wash: "#F9EAF2", border: "#F1D3E3", solid: "#C2407E", ink: "#8F2C5B", watermark: "#C2407E" },
  amber: { wash: "#FBF1DC", border: "#F0E0B8", solid: "#B7791F", ink: "#7A5410", watermark: "#B7791F" },
};

export function SectionHeading({ title, chip }: { title: string; chip: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-3">
      <h2 className="text-[16px] font-bold text-ink">{title}</h2>
      <span className="rounded-full bg-[#E2F0DA] px-2.5 py-1 text-[12px] font-bold text-primary">
        {chip}
      </span>
    </div>
  );
}

export function TintedCard({
  tone,
  icon: Icon,
  title,
  subtitle,
  action,
  caps = false,
  iconBg,
  className,
  bodyClassName,
  children,
}: {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** uppercase tracked title (TOP PRODUTOS / TOP SABORES) */
  caps?: boolean;
  /** overrides the icon chip color (Top produtos uses a gold chip) */
  iconBg?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <section
      className={cn("overflow-hidden rounded-2xl border border-border bg-card", className)}
    >
      <header
        className={cn(
          "relative flex items-center gap-3 overflow-hidden border-b px-5",
          caps ? "py-3" : "py-3.5",
        )}
        style={{ background: t.wash, borderColor: t.border }}
      >
        <Icon
          aria-hidden
          className="pointer-events-none absolute -top-5 -right-1.5 size-[110px] opacity-[.16]"
          strokeWidth={1.6}
          style={{ color: iconBg ?? t.watermark }}
        />
        <span
          className={cn(
            "relative flex shrink-0 items-center justify-center text-white",
            caps ? "size-[30px] rounded-[9px]" : "size-[34px] rounded-[10px]",
          )}
          style={{ background: iconBg ?? t.solid }}
        >
          <Icon className={caps ? "size-4" : "size-[18px]"} strokeWidth={2} />
        </span>
        <div className="relative min-w-0 flex-1">
          <h3
            className={cn(
              "text-ink",
              caps
                ? "text-[14px] font-bold tracking-[.6px] uppercase"
                : "text-[15px] font-semibold",
            )}
          >
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-faint">{subtitle}</p>}
        </div>
        {action && <div className="relative">{action}</div>}
      </header>
      <div className={cn("px-5 pt-4 pb-5", bodyClassName)}>{children}</div>
    </section>
  );
}
