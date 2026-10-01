"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { segment: "loja", label: "Loja" },
  { segment: "estoque", label: "Estoque" },
  { segment: "financeiro", label: "Financeiro" },
  { segment: "equipe", label: "Equipe" },
] as const;

/**
 * Full-bleed tab strip under the shell header (design: Mock Configurações).
 * Negative margins cancel the shell <main> padding so the strip spans the page.
 */
export function SettingsTabs({ storeId }: { storeId: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Seções de configurações"
      className="-mx-3.5 -mt-4 mb-4 flex gap-[26px] overflow-x-auto border-b border-[#E7EEE6] bg-white px-3.5 min-[820px]:-mx-7 min-[820px]:-mt-[26px] min-[820px]:mb-[26px] min-[820px]:px-7"
    >
      {TABS.map((t) => {
        const href = `/s/${storeId}/configuracoes/${t.segment}`;
        const on = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={t.segment}
            href={href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 py-[13px] text-[13.5px] transition-colors",
              on
                ? "border-primary font-bold text-primary"
                : "border-transparent font-medium text-ink-faint hover:text-ink-soft",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
