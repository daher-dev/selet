"use client";

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { StockItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { STOCK_CATEGORY_META } from "@/components/category-meta";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Single-select searchable insumo picker (mirrors produtos/InsumoPicker's
 * search+list, wrapped as a Popover trigger like CustomerPicker) — every
 * Shakes modifier form (Base/Borda/Adicional/Utensílio) needs exactly one
 * "Insumo do estoque" field.
 */
export function InsumoPicker({
  stockItems,
  value,
  onChange,
}: {
  stockItems: StockItem[];
  value: string;
  onChange: (item: StockItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = stockItems.find((s) => s.id === value) ?? null;
  const q = query.trim().toLowerCase();
  const options = stockItems.filter(
    (s) =>
      !s.archived &&
      (!q ||
        s.name.toLowerCase().includes(q) ||
        (STOCK_CATEGORY_META[s.category]?.label ?? s.category)
          .toLowerCase()
          .includes(q)),
  );

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
          className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-border bg-paper px-3 text-left transition-colors hover:border-primary/40"
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13.5px] font-semibold",
              selected ? "text-ink" : "text-ink-faint",
            )}
          >
            {selected ? selected.name : "Selecionar insumo do estoque"}
          </span>
          <ChevronDown className="size-4 shrink-0 text-ink-faint" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <div className="flex items-center gap-2 border-b border-border bg-paper px-3 py-2.5">
          <Search className="size-4 shrink-0 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar insumo…"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1.5">
          {options.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-ink-faint">
              Nenhum insumo encontrado
            </div>
          ) : (
            options.map((item) => {
              const meta = STOCK_CATEGORY_META[item.category];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onChange(item);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-wash"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                    {item.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-faint">
                    {meta?.label ?? item.category}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
