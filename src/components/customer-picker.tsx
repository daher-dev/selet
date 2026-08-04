"use client";

import { useState } from "react";
import { Check, ChevronDown, Crown, Search, User, UserPlus } from "lucide-react";
import Link from "next/link";
import type { Customer } from "@/lib/types";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Searchable customer picker (design 383-411): a Popover listing each
 * registered customer as avatar + name + phone with a VIP crown, plus a
 * "Nenhum cliente encontrado" empty state. Customer selection is mandatory —
 * there is no walk-in option; the empty/no-results state links to Clientes so
 * staff can register a customer without leaving the flow stuck. Shared by
 * Pedidos (order-sheet.tsx) and Vouchers (voucher-sell-sheet.tsx).
 */
export function CustomerPicker({
  storeId,
  customers,
  value,
  onChange,
}: {
  storeId: string;
  customers: Customer[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = customers.find((c) => c.id === value) ?? null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.instagram?.toLowerCase().includes(q),
      )
    : customers;

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-12 w-full items-center gap-3 rounded-xl border border-border bg-paper px-3 text-left transition-colors hover:border-primary/40"
        >
          {selected ? (
            <CustomerAvatar name={selected.name} vip={selected.tags.includes("vip")} />
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-mist text-ink-faint">
              <User className="size-4" />
            </span>
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[14px] font-semibold",
              selected ? "text-ink" : "text-ink-faint",
            )}
          >
            {selected ? selected.name : "Selecione um cliente"}
          </span>
          <ChevronDown className="size-4 shrink-0 text-ink-faint" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <div className="flex items-center gap-2 border-b border-border bg-paper px-3 py-2.5">
          <Search className="size-4 shrink-0 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente…"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1.5">
          {filtered.map((c) => {
            const vip = c.tags.includes("vip");
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c.id)}
                className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-wash"
              >
                <CustomerAvatar name={c.name} vip={vip} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">
                    {c.name}
                  </span>
                  {(c.phone || c.instagram) && (
                    <span className="block truncate text-[11px] text-ink-faint">
                      {c.phone ?? c.instagram}
                    </span>
                  )}
                </span>
                {vip && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-wash px-2 py-0.5 text-[10px] font-bold text-amber">
                    <Crown className="size-3" />
                    VIP
                  </span>
                )}
                {value === c.id && (
                  <Check className="size-4 shrink-0 text-primary" />
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-[12.5px] text-ink-faint">
              {q ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
            </div>
          )}
        </div>
        <div className="border-t border-border p-1.5">
          <Link
            href={`/s/${storeId}/clientes`}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-primary transition-colors hover:bg-mist"
          >
            <UserPlus className="size-4 shrink-0" />
            Cadastrar cliente
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CustomerAvatar({ name, vip }: { name: string; vip: boolean }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
        vip ? "bg-amber-wash text-amber" : "bg-mist text-primary",
      )}
    >
      {initials(name)}
    </span>
  );
}
