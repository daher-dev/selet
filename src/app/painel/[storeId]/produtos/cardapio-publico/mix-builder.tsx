"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/format";
import { MIX_MAX_FLAVORS, describeMix, priceMix, type MenuMix, type MixCatalog, type MixKind, type MixTieredOption } from "@/lib/menu";
import { cn } from "@/lib/utils";

export interface MixDraft {
  name: string;
  /** Undefined = follow the generated description. */
  description?: string;
  mix: MenuMix;
}

const chip = (on: boolean) =>
  cn(
    "flex h-[34px] items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors",
    on ? "border-primary bg-mist font-semibold text-primary" : "border-[#E7EEE6] bg-white text-ink-soft hover:border-[#C9D8C4]",
  );

const live = <T extends { archived: boolean }>(xs: T[]) => xs.filter((x) => !x.archived);

/** A borda/adicional chip row: toggle each, then pick its quantity tier. */
function Tiered({ list, picks, set, title }: { list: MixTieredOption[]; picks: Map<string, number>; set: (m: Map<string, number>) => void; title: string }) {
  if (!live(list).length) return null;
  return (
    <fieldset className="mt-4">
      <legend className="text-[12px] font-bold uppercase tracking-[.4px] text-ink-faint">{title}</legend>
      <div className="mt-2 flex flex-wrap gap-[7px]">
        {live(list).map((o) => {
          const qty = picks.get(o.id);
          const tiers = [...o.tiers].sort((a, b) => a.qty - b.qty);
          return (
            <span key={o.id} className={cn(chip(qty !== undefined), qty !== undefined && tiers.length > 1 && "pr-1")}>
              <button
                type="button"
                aria-pressed={qty !== undefined}
                onClick={() => {
                  const n = new Map(picks);
                  if (qty !== undefined) n.delete(o.id);
                  else n.set(o.id, tiers[0]?.qty ?? 1);
                  set(n);
                }}
                className="flex items-center gap-1.5"
              >
                {qty !== undefined && <Check className="size-3.5" strokeWidth={2.6} />}
                {o.name}
              </button>
              {qty !== undefined && tiers.length > 1 && (
                <span className="ml-1 flex rounded-full bg-white p-0.5">
                  {tiers.map((t) => (
                    <button
                      key={t.qty}
                      type="button"
                      aria-label={`${o.name}: ${t.qty}×`}
                      aria-pressed={qty === t.qty}
                      onClick={() => set(new Map(picks).set(o.id, t.qty))}
                      className={cn("rounded-full px-2 py-0.5 text-[11.5px]", qty === t.qty ? "bg-primary text-white" : "text-ink-soft")}
                    >
                      {t.qty}×
                    </button>
                  ))}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Sugestão de shake/pudim (design: cardapio-3e): the store builds it the way
 * Pedidos builds an order line, names it, and the price is the live sum.
 * Mount with a `key` per open so the state starts fresh.
 */
export function MixBuilder({
  kind,
  catalog,
  initial,
  sectionTitle,
  onClose,
  onSave,
}: {
  kind: MixKind;
  catalog: MixCatalog;
  initial?: MixDraft;
  sectionTitle: string;
  onClose: () => void;
  onSave: (d: MixDraft) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [flavorIds, setFlavorIds] = useState<string[]>(initial?.mix.flavorIds ?? []);
  const [baseId, setBaseId] = useState<string | null>(initial?.mix.baseId ?? catalog.bases.find((b) => !b.archived && !b.price)?.id ?? null);
  const [rims, setRims] = useState(new Map(initial?.mix.rims.map((r) => [r.id, r.qty])));
  const [mixins, setMixins] = useState(new Map(initial?.mix.mixins.map((m) => [m.id, m.qty])));
  const [description, setDescription] = useState<string | undefined>(initial?.description);

  const max = MIX_MAX_FLAVORS[kind];
  const mix: MenuMix = {
    flavorIds,
    baseId,
    rims: [...rims].map(([id, qty]) => ({ id, qty })),
    mixins: [...mixins].map(([id, qty]) => ({ id, qty })),
  };
  const { price, lines } = priceMix(mix, catalog);
  const suggested = describeMix(mix, catalog);
  const label = kind === "shake" ? "shake" : "pudim";
  const canSave = name.trim().length > 0 && flavorIds.length > 0;

  function toggleFlavor(id: string) {
    setFlavorIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= max ? p : [...p, id]));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[min(900px,94dvh)] flex-col gap-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="border-b border-[#F0F4ED] px-5 pb-3.5 pt-5">
          <DialogTitle className="text-[17px] font-bold">Sugestão de {label}</DialogTitle>
          <DialogDescription>Entra em {sectionTitle || "esta seção"}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
          <label htmlFor="mix-name" className="text-[12px] font-semibold text-ink-soft">
            Nome no cardápio
          </label>
          <input
            id="mix-name"
            autoFocus
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "shake" ? "Frutas Vermelhas" : "Pudim da casa"}
            className="mt-1.5 block h-12 w-full rounded-xl border-[1.5px] border-[#C9D8C4] px-3.5 font-display text-[22px] font-semibold text-ink outline-none focus:border-primary"
          />

          <fieldset className="mt-4">
            <legend className="flex w-full justify-between text-[12px] font-bold uppercase tracking-[.4px] text-ink-faint">
              <span>Sabores · até {max}</span>
              {flavorIds.length > 1 && <span className="font-medium normal-case tracking-normal">cobra o mais caro</span>}
            </legend>
            <div className="mt-2 flex flex-wrap gap-[7px]">
              {live(catalog.flavors).map((f) => {
                const on = flavorIds.includes(f.id);
                return (
                  <button key={f.id} type="button" aria-pressed={on} disabled={!on && flavorIds.length >= max} onClick={() => toggleFlavor(f.id)} className={cn(chip(on), "disabled:opacity-40")}>
                    {on && <Check className="size-3.5" strokeWidth={2.6} />}
                    {f.name}
                    <span className="font-mono text-[11.5px] opacity-70">{formatBRL(f.price)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {live(catalog.bases).length > 0 && (
            <fieldset className="mt-4">
              <legend className="text-[12px] font-bold uppercase tracking-[.4px] text-ink-faint">Base</legend>
              <div className="mt-2 flex flex-wrap gap-[7px]">
                {live(catalog.bases).map((b) => (
                  <button key={b.id} type="button" aria-pressed={baseId === b.id} onClick={() => setBaseId(baseId === b.id ? null : b.id)} className={chip(baseId === b.id)}>
                    {baseId === b.id && <Check className="size-3.5" strokeWidth={2.6} />}
                    {b.name}
                    <span className="text-[11.5px] opacity-70">{b.price ? `+ ${formatBRL(b.price)}` : "incluso"}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <Tiered list={catalog.rims} picks={rims} set={setRims} title="Borda" />
          <Tiered list={catalog.mixins} picks={mixins} set={setMixins} title="Adicionais" />

          <div className="mt-5 flex items-center justify-between">
            <label htmlFor="mix-desc" className="text-[12px] font-semibold text-ink-soft">
              Descrição
            </label>
            {description !== undefined && (
              <button type="button" onClick={() => setDescription(undefined)} className="text-[12px] font-semibold text-primary hover:underline">
                Gerar de novo
              </button>
            )}
          </div>
          <textarea
            id="mix-desc"
            rows={2}
            maxLength={280}
            value={description ?? suggested}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Escolha os sabores para sugerir uma descrição"
            className="mt-1.5 block w-full resize-none rounded-xl border border-[#E7EEE6] px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-primary"
          />
        </div>

        <div className="rounded-b-xl border-t border-[#F0F4ED] bg-paper px-5 pb-4 pt-3.5">
          {lines.length > 0 && (
            <div className="grid gap-1 text-[12.5px] text-ink-soft">
              {lines.map((l) => (
                <div key={l.label} className="flex justify-between">
                  <span>{l.label}</span>
                  <span className="font-mono">{formatBRL(l.price)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="font-mono text-[22px] font-semibold text-primary">{formatBRL(price)}</div>
              <div className="text-[11.5px] text-ink-faint">Segue os preços de {kind === "shake" ? "Shakes" : "Pudim"}, muda sozinho</div>
            </div>
            <Button
              disabled={!canSave}
              onClick={() => onSave({ name: name.trim(), description: description?.trim() || undefined, mix })}
              className="h-11 rounded-xl px-[18px] text-[14px] font-semibold"
            >
              {initial ? "Salvar sugestão" : "Adicionar ao cardápio"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
