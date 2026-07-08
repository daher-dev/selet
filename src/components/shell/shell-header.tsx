"use client";

import { usePathname } from "next/navigation";
import { Menu, Plus, Search } from "lucide-react";
import type { Store } from "@/lib/types";
import { pageMeta, segmentFromPathname } from "./titles";
import { useShellState } from "./app-shell-context";

/**
 * Persistent top-bar. One responsive element covers both layouts (design
 * uses a single header with responsive styles):
 *  - desktop (≥820px): hamburger hidden · title + store-aware subtitle ·
 *    240px global search · contextual primary add button (icon + label).
 *  - mobile (<820px): hamburger · centered title · icon-only add.
 */
export function ShellHeader({
  store,
  onOpenNav,
}: {
  store: Store;
  onOpenNav: () => void;
}) {
  const pathname = usePathname();
  const segment = segmentFromPathname(pathname, store.id);
  const { title, subtitle } = pageMeta(segment, store);
  const { action, search, setSearch } = useShellState();

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-border bg-white px-3.5 min-[820px]:h-[72px] min-[820px]:gap-5 min-[820px]:px-7">
      {/* Hamburger — mobile only */}
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Abrir menu"
        className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] border border-border bg-white text-ink-soft transition-colors hover:bg-mist min-[820px]:hidden"
      >
        <Menu className="size-[18px]" strokeWidth={1.9} />
      </button>

      {/* Title + subtitle */}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[19px] font-bold tracking-[-0.2px] text-ink">
          {title}
        </h1>
        <p className="mt-px hidden truncate text-[12.5px] text-ink-faint min-[820px]:block">
          {subtitle}
        </p>
      </div>

      {/* Global search — desktop only */}
      <label className="hidden h-[38px] w-[240px] items-center gap-2 rounded-[10px] border border-border bg-surface px-3 min-[820px]:flex">
        <Search className="size-[15px] shrink-0 text-ink-faint" strokeWidth={2} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar pedido, cliente…"
          className="w-full min-w-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
        />
      </label>

      {/* Contextual primary add — label hidden on mobile (icon only) */}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          aria-label={action.label}
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-0 text-[13px] font-semibold text-white shadow-[0_2px_6px_-2px_rgba(24,107,65,0.47)] transition-[transform,box-shadow,filter] hover:-translate-y-0.5 hover:shadow-[0_9px_20px_-8px_rgba(24,107,65,0.6)] hover:brightness-105 active:translate-y-0 active:scale-95 min-[820px]:w-auto min-[820px]:px-[18px]"
        >
          <Plus className="size-[15px] shrink-0" strokeWidth={2.2} />
          <span className="hidden min-[820px]:inline">{action.label}</span>
        </button>
      )}
    </header>
  );
}
