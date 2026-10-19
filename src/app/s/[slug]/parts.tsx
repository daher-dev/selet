import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Green wordmark band used by every public screen without a step bar. */
export function Brand({ label = "Sorteio", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-baseline gap-2.5 bg-primary px-[22px] pb-5 pt-[22px] text-white", className)}>
      <span className="font-display text-[26px] font-semibold leading-none">Selet</span>
      <span className="text-[10px] font-semibold uppercase tracking-[2.5px] text-[#CFE6C2]">{label}</span>
    </div>
  );
}

const TONES = {
  blue: "bg-[#EAF1F7] text-[#2B5F86]",
  amber: "bg-[#FBF1DC] text-[#8A5A0F]",
  red: "bg-[#FBE9E4] text-[#B23A22]",
  grey: "bg-[#F1F4F0] text-[#5C6B62]",
} as const;

export interface MessageAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

/** A closed/unavailable link (board 8a): icon, headline, text and up to two actions. */
export function MessageScreen({
  eyebrow,
  icon: Icon,
  tone,
  title,
  text,
  actions,
}: {
  eyebrow: string;
  icon: LucideIcon;
  tone: keyof typeof TONES;
  title: string;
  text: string;
  actions: MessageAction[];
}) {
  const [primary, secondary] = actions;
  const cls = {
    primary: "flex h-[52px] items-center justify-center rounded-[13px] bg-primary text-[15px] font-bold text-white",
    secondary: "mt-1.5 flex h-11 items-center justify-center text-[13.5px] font-semibold text-primary",
  };
  const render = (a: MessageAction, className: string) =>
    a.href ? (
      <a
        href={a.href}
        className={className}
        {...(a.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
      >
        {a.label}
      </a>
    ) : (
      <button type="button" onClick={a.onClick} className={className}>
        {a.label}
      </button>
    );
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-[#F6FAF4] sm:shadow-[0_0_0_1px_#D6E2D0]">
      <Brand />
      <div className="flex flex-1 flex-col px-[22px] pb-6 pt-7">
        <span className="text-[13px] font-semibold text-ink-soft">{eyebrow}</span>
        <span className={cn("mt-[22px] flex size-16 items-center justify-center rounded-full", TONES[tone])}>
          <Icon className="size-7" strokeWidth={1.8} />
        </span>
        <h1 className="mt-[18px] text-2xl font-bold leading-tight">{title}</h1>
        <p className="mt-2 text-[14.5px] leading-normal text-[#3D4A42]">{text}</p>
        <span className="min-h-8 flex-1" />
        {primary && render(primary, cls.primary)}
        {secondary && render(secondary, cls.secondary)}
      </div>
    </main>
  );
}
