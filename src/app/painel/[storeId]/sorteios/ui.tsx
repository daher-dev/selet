"use client";

import Link from "next/link";
import { toast } from "sonner";
import type { EntryStatus, LeadKind, RaffleStatus } from "@/lib/raffles";
import { cn } from "@/lib/utils";

export type PillTone = "green" | "amber" | "gold" | "grey" | "blue";

const TONES: Record<PillTone, string> = {
  green: "bg-[#E7F4EC] text-[#2E7D4A]",
  amber: "bg-[#FBF1DC] text-[#8A5A0F]",
  gold: "bg-[#F6EAC6] text-[#8A6312]",
  grey: "bg-[#F1F4F0] text-[#3D4A42]",
  blue: "bg-[#EAF1F7] text-[#2B5F86]",
};

export function Pill({
  tone,
  dot = false,
  className,
  children,
}: {
  tone: PillTone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-full px-[9px] text-[11px] font-bold leading-5",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const RAFFLE_STATUS: Record<RaffleStatus, { label: string; tone: PillTone; dot: boolean }> = {
  aberto: { label: "Inscrições abertas", tone: "green", dot: true },
  encerrado: { label: "Inscrições encerradas", tone: "amber", dot: true },
  rascunho: { label: "Rascunho", tone: "grey", dot: false },
  sorteado: { label: "Sorteado", tone: "blue", dot: false },
};

export const ENTRY_STATUS: Record<EntryStatus, { label: string; tone: PillTone }> = {
  ok: { label: "Validado", tone: "green" },
  pend: { label: "A conferir", tone: "amber" },
  excl: { label: "Excluído", tone: "grey" },
};

export const LEAD_STATUS: Record<LeadKind, { label: string; tone: PillTone }> = {
  novo: { label: "Lead novo", tone: "gold" },
  vinc: { label: "Vinculado a cliente", tone: "green" },
  cli: { label: "Virou cliente", tone: "blue" },
};

/** Soft avatar colors (same family the Clientes avatars use). */
const AVATARS = [
  ["#E3F1F4", "#2F7F95"],
  ["#F5EED2", "#8F6E14"],
  ["#EFEAF8", "#6B46C1"],
  ["#F8E9F1", "#C2407E"],
  ["#E7F2E4", "#3A8B4E"],
  ["#F5E7DF", "#9A5230"],
  ["#EAF1F7", "#2B5F86"],
] as const;

export function avatarColors(seed: string): { background: string; color: string } {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [background, color] = AVATARS[h % AVATARS.length];
  return { background, color };
}

/** "selet.app/s/aniversario" — origin without the scheme, for display. */
export function linkLabel(origin: string, slug: string): string {
  return `${origin.replace(/^https?:\/\//, "")}/s/${slug}`;
}

export async function copyLink(origin: string, slug: string) {
  try {
    await navigator.clipboard.writeText(`${origin}/s/${slug}`);
    toast.success("Link copiado.");
  } catch {
    toast.error("Não foi possível copiar. Selecione o link e copie à mão.");
  }
}

export async function shareLink(origin: string, slug: string, title: string) {
  const url = `${origin}/s/${slug}`;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
    } catch {
      // dismissed by the user
    }
    return;
  }
  await copyLink(origin, slug);
}

/** Sorteios | Leads switch shared by the two list screens. */
export function SorteiosTabs({
  storeId,
  active,
  sorteios,
  novos,
}: {
  storeId: string;
  active: "sorteios" | "leads";
  sorteios: number;
  novos: number;
}) {
  const base = `/painel/${storeId}/sorteios`;
  const tab = (on: boolean) =>
    cn(
      "flex h-[34px] items-center gap-[7px] rounded-lg px-3.5 text-[13px] font-semibold",
      on ? "bg-ink text-white" : "text-ink-soft hover:text-ink",
    );
  return (
    <nav
      aria-label="Seção"
      className="flex w-fit items-center gap-0.5 rounded-[11px] border border-border bg-white p-[3px]"
    >
      <Link href={base} aria-current={active === "sorteios" ? "page" : undefined} className={tab(active === "sorteios")}>
        Sorteios <span className="text-[11px] opacity-75">{sorteios}</span>
      </Link>
      <Link href={`${base}/leads`} aria-current={active === "leads" ? "page" : undefined} className={tab(active === "leads")}>
        Leads
        {novos > 0 && (
          <span
            className={cn(
              "rounded-full px-[7px] text-[10px] font-bold",
              active === "leads" ? "bg-white/20 text-white" : "bg-[#F6EAC6] text-[#8A6312]",
            )}
          >
            {novos} {novos === 1 ? "novo" : "novos"}
          </span>
        )}
      </Link>
    </nav>
  );
}
