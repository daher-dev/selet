"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import type { SessionUser, Store } from "@/lib/types";
import { NAV_ITEMS } from "./nav";
import { SeletMark, SeletWordmark } from "./selet-mark";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";

interface SidebarContentProps {
  user: SessionUser;
  store: Store;
  stores: Store[];
  onNavigate?: () => void;
}

export function SidebarContent({
  user,
  store,
  stores,
  onNavigate,
}: SidebarContentProps) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/s/${store.id}`;

  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      item.section === null ||
      user.role === "admin" ||
      user.sections.includes(item.section),
  );

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center gap-3 px-5 pt-6 pb-5">
        <SeletMark className="size-10" />
        <div className="flex flex-col">
          <SeletWordmark className="text-[26px]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Painel de controle
          </span>
        </div>
      </div>

      <div className="px-4 pb-4">
        {stores.length > 1 ? (
          <Select
            value={store.id}
            onValueChange={(id) => {
              onNavigate?.();
              router.push(`/s/${id}`);
            }}
          >
            <SelectTrigger className="h-auto w-full rounded-xl border-border bg-card px-3 py-2">
              <StoreRow store={store} />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="w-[var(--radix-select-trigger-width)] rounded-xl"
            >
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id} className="rounded-lg py-1.5">
                  <StoreRow store={s} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center rounded-xl border border-border bg-card px-3 py-2">
            <StoreRow store={store} />
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {visibleItems.map((item) => {
          const href = item.segment ? `${base}/${item.segment}` : base;
          const active =
            item.segment === ""
              ? pathname === base
              : pathname.startsWith(`${base}/${item.segment}`);
          const Icon = item.icon;
          return (
            <Link
              key={item.segment}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors",
                active
                  ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                  : "text-ink-soft hover:bg-wash hover:text-ink",
              )}
            >
              <Icon className="size-[18px]" strokeWidth={active ? 2.1 : 1.8} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-mist text-[12px] font-bold text-primary">
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ink">
              {user.name}
            </p>
            <p className="truncate text-[11.5px] text-ink-faint">
              {user.role === "admin" ? "Administrador" : "Funcionário"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Sair"
            onClick={async () => {
              await fetch("/api/session", { method: "DELETE" });
              window.location.href = "/login";
            }}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-wash hover:text-ink"
          >
            <LogOut className="size-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
}

function StoreRow({ store }: { store: Store }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-[11px] font-bold text-white">
        {store.initial}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-ink">
          {store.name}
        </span>
        <span className="block truncate text-[11px] text-ink-faint">
          {store.sub}
        </span>
      </span>
    </span>
  );
}
