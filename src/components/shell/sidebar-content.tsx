"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  LogOut,
  MoreHorizontal,
  Settings,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import type { SessionUser, Store } from "@/lib/types";
import { NAV_ITEMS } from "./nav";
import { SeletWordmark } from "./selet-mark";
import type { NavBadges } from "./app-shell";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SidebarContentProps {
  user: SessionUser;
  store: Store;
  stores: Store[];
  badges: NavBadges;
  onNavigate?: () => void;
}

export function SidebarContent({
  user,
  store,
  stores,
  badges,
  onNavigate,
}: SidebarContentProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [storeOpen, setStoreOpen] = useState(false);
  const base = `/s/${store.id}`;

  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      item.section === null ||
      user.role === "admin" ||
      user.sections.includes(item.section),
  );

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Brand: stacked wordmark + kicker (no leaf tile, per design) */}
      <div className="flex flex-col gap-[3px] px-2 pt-1 pb-0.5">
        <SeletWordmark className="text-[32px] tracking-[0.5px]" />
        <span className="whitespace-nowrap text-[9px] font-semibold uppercase leading-none tracking-[2.5px] text-leaf">
          Painel de controle
        </span>
      </div>

      {/* Store switcher — chevron + dropdown only when there's more than one
          store to switch between; a single store renders as identification only. */}
      <div className="mt-[18px] mb-[18px]">
        {stores.length > 1 ? (
          <Popover open={storeOpen} onOpenChange={setStoreOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-[11px] border border-border bg-surface px-3 py-2.5 text-left transition-[background-color,box-shadow] hover:bg-mist hover:shadow-[0_6px_14px_-8px_rgba(24,107,65,0.4)]"
              >
                <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-bold text-white">
                  {store.initial}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-bold uppercase tracking-[1px] text-ink-faint">
                    Loja ativa
                  </span>
                  <span className="block truncate text-[13px] font-semibold text-ink">
                    {store.name}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 text-ink-faint transition-transform",
                    storeOpen && "rotate-180",
                  )}
                />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={6}
              className="w-[var(--radix-popover-trigger-width)] p-1.5"
            >
              {stores.map((s) => {
                const active = s.id === store.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setStoreOpen(false);
                      if (!active) {
                        onNavigate?.();
                        router.push(`/s/${s.id}`);
                      }
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-[9px] text-left transition-colors",
                      active ? "bg-primary/[0.08]" : "hover:bg-[#f2f7ee]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-[30px] shrink-0 items-center justify-center rounded-lg text-[13px] font-bold",
                        active ? "bg-primary text-white" : "bg-border text-ink-soft",
                      )}
                    >
                      {s.initial}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">
                        {s.name}
                      </span>
                      <span className="block truncate text-[11px] text-ink-faint">
                        {s.sub}
                      </span>
                    </span>
                    {active && <Check className="size-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        ) : (
          <div className="flex w-full items-center gap-2.5 rounded-[11px] border border-border bg-surface px-3 py-2.5 text-left">
            <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-bold text-white">
              {store.initial}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[9px] font-bold uppercase tracking-[1px] text-ink-faint">
                Loja ativa
              </span>
              <span className="block truncate text-[13px] font-semibold text-ink">
                {store.name}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-[3px] overflow-y-auto">
        {visibleItems.map((item) => {
          const href = item.segment ? `${base}/${item.segment}` : base;
          const active =
            item.segment === ""
              ? pathname === base
              : pathname.startsWith(`${base}/${item.segment}`);
          const Icon = item.icon;
          const badgeCount =
            item.badge === "openOrders"
              ? badges.openOrders
              : item.badge === "cartelasAtivas"
                ? badges.cartelasAtivas
                : 0;
          const showDot = item.dot === "lowStock" && badges.lowStock > 0;
          return (
            <Link
              key={item.segment || "dashboard"}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-[background-color,transform,color] hover:translate-x-[3px] hover:bg-[#f2f7ee]",
                active
                  ? "bg-primary/[0.08] font-semibold text-primary"
                  : "text-ink-soft",
              )}
            >
              <Icon
                className="size-[17px] shrink-0"
                strokeWidth={active ? 2.1 : 1.8}
              />
              <span className="flex-1 truncate">{item.label}</span>
              {badgeCount > 0 && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-[7px] py-px text-[10px] font-bold tabular",
                    item.badgeTone === "amber"
                      ? "bg-amber-wash text-amber"
                      : "bg-primary text-white",
                  )}
                >
                  {badgeCount}
                </span>
              )}
              {showDot && (
                <span
                  className="selet-pulse size-[7px] shrink-0 rounded-full bg-amber"
                  aria-label="Estoque baixo"
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="mt-auto flex items-center gap-2.5 border-t border-wash pt-4">
        <span className="flex size-[34px] items-center justify-center rounded-full bg-mist text-[13px] font-bold text-primary">
          {initials(user.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink">
            {user.name}
          </p>
          <p className="truncate text-[11px] text-ink-faint">
            {user.role === "admin" ? "Administrador" : "Funcionário"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Menu da conta"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-wash hover:text-ink data-[state=open]:bg-wash data-[state=open]:text-primary"
            >
              <MoreHorizontal className="size-4" strokeWidth={2} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuItem>
              <User className="size-4 text-ink-faint" strokeWidth={1.8} />
              Minha conta
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="size-4 text-ink-faint" strokeWidth={1.8} />
              Preferências da loja
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="font-semibold text-destructive focus:text-destructive data-highlighted:text-destructive"
              onSelect={async () => {
                await fetch("/api/session", { method: "DELETE" });
                window.location.href = "/login";
              }}
            >
              <LogOut className="size-4" strokeWidth={1.9} />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
