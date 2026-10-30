"use client";

import { useMemo, useState } from "react";
import { Check, CupSoda, IceCreamBowl, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/format";
import { entryKey, extrasRows, type MenuCatalog, type MenuEntry, type MixKind } from "@/lib/menu";
import { cn } from "@/lib/utils";

interface Row {
  entry: MenuEntry;
  name: string;
  meta: string;
  group: string;
}

/**
 * "Adicionar a <seção>" (design: cardapio-3b): build a shake/pudim suggestion,
 * or pick ready items from the Cardápio and the extras price tables. Items
 * already on the menu are locked.
 */
export function MenuPicker({
  open,
  onOpenChange,
  sectionTitle,
  catalog,
  inMenu,
  onAdd,
  onBuild,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionTitle: string;
  catalog: MenuCatalog;
  /** key → title of the section that already shows it. */
  inMenu: Map<string, string>;
  onAdd: (entries: MenuEntry[]) => void;
  onBuild: (kind: MixKind) => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const allRows = useMemo(() => {
    const all: Row[] = catalog.products
      .filter((p) => p.available)
      .map((p) => ({ entry: { source: "product", id: p.id }, name: p.name, meta: formatBRL(p.price), group: `Do Cardápio · ${p.group}` }));
    for (const kind of ["shake", "pudim"] as const) {
      const n = extrasRows(catalog[kind]).length;
      if (!n) continue;
      all.push({
        entry: { source: kind === "shake" ? "extras-shake" : "extras-pudim", id: kind },
        name: kind === "shake" ? "Extras para o seu shake" : "Extras para o seu pudim",
        meta: `${n} ${n === 1 ? "preço" : "preços"}`,
        group: "Tabelas de preço",
      });
    }
    return all;
  }, [catalog]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, Row[]>();
    for (const r of allRows) {
      if (q && !`${r.name} ${r.group}`.toLowerCase().includes(q)) continue;
      map.set(r.group, [...(map.get(r.group) ?? []), r]);
    }
    return [...map];
  }, [allRows, query]);

  function toggle(keys: string[], on: boolean) {
    setPicked((p) => {
      const n = new Set(p);
      for (const k of keys) {
        if (on) n.add(k);
        else n.delete(k);
      }
      return n;
    });
  }

  function close(o: boolean) {
    if (!o) {
      setPicked(new Set());
      setQuery("");
    }
    onOpenChange(o);
  }

  const builders = [
    { kind: "shake" as const, Icon: CupSoda, title: "Montar sugestão de shake", hint: "Sabores, base, borda e adicionais. Você dá o nome.", tone: "bg-primary text-white" },
    { kind: "pudim" as const, Icon: IceCreamBowl, title: "Montar sugestão de pudim", hint: "Sabores, base e adicionais.", tone: "bg-cat-sopas-wash text-cat-sopas" },
  ].filter((b) => catalog[b.kind].flavors.some((f) => !f.archived));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[min(760px,92dvh)] flex-col gap-0 p-0 sm:max-w-[520px]">
        <DialogHeader className="px-5 pb-3.5 pt-5">
          <DialogTitle className="text-[17px] font-bold">Adicionar a {sectionTitle || "esta seção"}</DialogTitle>
          <DialogDescription>Monte uma sugestão com os sabores e adicionais de Shakes ou Pudim, ou traga um item pronto do Cardápio.</DialogDescription>
        </DialogHeader>
        {builders.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5 px-5 pb-4 max-[420px]:grid-cols-1">
            {builders.map(({ kind, Icon, title, hint, tone }) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  close(false);
                  onBuild(kind);
                }}
                className="flex flex-col items-start gap-1.5 rounded-[14px] border border-[#E7EEE6] bg-white p-3.5 text-left transition-colors hover:border-primary hover:bg-paper"
              >
                <span className={cn("flex size-[34px] items-center justify-center rounded-[9px]", tone)}>
                  <Icon className="size-[17px]" strokeWidth={1.8} />
                </span>
                <span className="text-[14px] font-bold text-ink">{title}</span>
                <span className="text-[12px] text-ink-soft">{hint}</span>
              </button>
            ))}
          </div>
        )}
        <div className="relative px-5 pb-3">
          <Search className="absolute left-8 top-1/2 size-4 -translate-y-[calc(50%+6px)] text-ink-faint" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar no Cardápio…" className="rounded-xl pl-9" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-[#F0F4ED] px-2 pb-2">
          {rows.length === 0 && <p className="px-3 py-10 text-center text-[13px] text-ink-faint">Nenhum item encontrado.</p>}
          {rows.map(([group, items]) => {
            const free = items.map((r) => entryKey(r.entry)).filter((k) => !inMenu.has(k));
            const all = free.length > 0 && free.every((k) => picked.has(k));
            return (
              <div key={group} className="pt-3">
                <div className="flex items-center justify-between px-3 pb-1">
                  <span className="text-[11px] font-bold uppercase tracking-[.4px] text-ink-faint">{group}</span>
                  {free.length > 1 && (
                    <button type="button" onClick={() => toggle(free, !all)} className="text-[12px] font-semibold text-primary hover:underline">
                      {all ? "Desmarcar todos" : "Marcar todos"}
                    </button>
                  )}
                </div>
                {items.map((r) => {
                  const key = entryKey(r.entry);
                  const where = inMenu.get(key);
                  const on = picked.has(key);
                  return (
                    <label key={key} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5", where ? "cursor-default opacity-55" : "cursor-pointer hover:bg-mist")}>
                      <input type="checkbox" className="peer sr-only" checked={on || !!where} disabled={!!where} onChange={(e) => toggle([key], e.target.checked)} />
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-md border peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40",
                          on || where ? "border-primary bg-primary text-white" : "border-[#C9D8C4] bg-white",
                        )}
                      >
                        {(on || where) && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink">{r.name}</span>
                        {where && <span className="block text-[11.5px] text-ink-faint">Já está em {where}</span>}
                      </span>
                      <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-primary">{r.meta}</span>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
        <DialogFooter className="m-0 rounded-b-xl border-t border-[#F0F4ED] px-5 py-3.5">
          <Button variant="ghost" onClick={() => close(false)} className="h-10 rounded-[10px] px-4">
            Cancelar
          </Button>
          <Button
            disabled={picked.size === 0}
            onClick={() => {
              onAdd(allRows.filter((r) => picked.has(entryKey(r.entry))).map((r) => r.entry));
              close(false);
            }}
            className="h-10 rounded-[10px] px-4 font-semibold"
          >
            {picked.size ? `Adicionar ${picked.size} ${picked.size === 1 ? "item" : "itens"}` : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
